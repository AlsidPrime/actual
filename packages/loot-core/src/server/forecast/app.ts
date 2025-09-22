// @ts-strict-ignore
import * as d from 'date-fns';

import { createApp } from '../app';
import { aqlQuery } from '../aql';
import * as db from '../db';
import { APIError } from '../errors';

import {
  addDays,
  dayFromDate,
  isAfter,
  isBefore,
  currentDay,
  monthFromDate,
  nextMonth,
  parseDate,
} from '../../shared/months';
import { q } from '../../shared/query';
import {
  extractScheduleConds,
  getNextDate,
  getScheduledAmount,
  scheduleIsRecurring,
} from '../../shared/schedules';
import {
  ForecastCalendarEvent,
  ForecastCalendarRequest,
  ForecastCalendarResponse,
} from '../../types/forecast';
import { ScheduleEntity } from '../../types/models';
import { fromDateRepr } from '../models';

export type ForecastHandlers = {
  'forecast/get-calendar-data': typeof getCalendarData;
};

function normalizeDay(value: string): string {
  return dayFromDate(value);
}

const LOOKBACK_DAYS = 45;

async function getCalendarData(
  params: ForecastCalendarRequest,
): Promise<ForecastCalendarResponse> {
  const { accountId, startDate, endDate } = params;

  if (!accountId || !startDate || !endDate) {
    throw APIError('Missing required forecast parameters');
  }

  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (
    !start ||
    !end ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    throw APIError('Invalid forecast date range');
  }

  if (d.isAfter(start, end)) {
    throw APIError('Forecast start date must be before end date');
  }

  const normalizedStart = normalizeDay(startDate);
  const normalizedEnd = normalizeDay(endDate);

  const account = await db.first<{ id: string }>(
    'SELECT id FROM accounts WHERE id = ? AND tombstone = 0',
    [accountId],
  );

  if (!account) {
    throw APIError(`Account not found for forecast: ${accountId}`);
  }

  const strategies = params.groupStrategies ?? {};
  const dailyStrategyAccounts = new Map<string, string>();

  for (const [groupId, rawStrategy] of Object.entries(strategies)) {
    if (!rawStrategy) {
      continue;
    }

    if (typeof rawStrategy === 'string') {
      if (rawStrategy === 'daily') {
        // Legacy values without an explicit account assignment are ignored
        continue;
      }
      if (rawStrategy === 'scheduled') {
        continue;
      }
      continue;
    }

    if (rawStrategy.mode === 'daily') {
      const target = rawStrategy.accountId ?? null;
      if (target) {
        dailyStrategyAccounts.set(groupId, target);
      }
      continue;
    }

    if (rawStrategy.mode === 'scheduled') {
      continue;
    }
  }

  const dailyGroupIds = new Set(dailyStrategyAccounts.keys());

  const startDateObj = parseDate(normalizedStart);
  const simulationStartDate = d.addDays(startDateObj, -LOOKBACK_DAYS);
  const simulationStart = dayFromDate(simulationStartDate);
  const simulationCutoff = addDays(simulationStart, -1);
  const balanceCutoff = addDays(normalizedStart, -1);

  const balanceBeforeSimulationRow = await db.first<{ balance: number }>(
    'SELECT COALESCE(SUM(amount), 0) as balance FROM transactions WHERE acct = ? AND isParent = 0 AND tombstone = 0 AND date <= ?',
    [accountId, db.toDateRepr(simulationCutoff)],
  );
  const balanceBeforeSimulation = balanceBeforeSimulationRow?.balance ?? 0;

  const balanceBeforeRangeRow = await db.first<{ balance: number }>(
    'SELECT COALESCE(SUM(amount), 0) as balance FROM transactions WHERE acct = ? AND isParent = 0 AND tombstone = 0 AND date <= ?',
    [accountId, db.toDateRepr(balanceCutoff)],
  );
  let startingBalance = balanceBeforeRangeRow?.balance ?? 0;

  const scheduleQuery = q('schedules')
    .filter({
      completed: false,
      '_account': accountId,
    })
    .select('*');

  const { data: schedules } = await aqlQuery(scheduleQuery);

  const dailyDeltas = new Map<string, number>();
  const forecastEvents: ForecastCalendarEvent[] = [];
  const scheduledOccurrences = new Map<string, number>();
  const variableOccurrences = new Map<string, { amount: number; groupId: string }>();
  const groupNameLookup = new Map<string, string>();
  const categoryToGroup = new Map<string, string>();

  const addDelta = (date: string, amount: number) => {
    const current = dailyDeltas.get(date) ?? 0;
    dailyDeltas.set(date, current + amount);
  };

  const withinSimulationWindow = (date: string) => {
    if (isBefore(date, simulationStart)) {
      return false;
    }
    if (isAfter(date, normalizedEnd)) {
      return false;
    }
    return true;
  };

  if (dailyGroupIds.size > 0) {
    const todayString = currentDay();
    const todayMonthInt = parseInt(todayString.slice(0, 7).replace('-', ''), 10);

    const groupRows = await db.all<{
      id: string;
      name: string;
      tombstone: 1 | 0;
    }>(`SELECT id, name, tombstone FROM category_groups`);
    for (const row of groupRows) {
      if (row.tombstone === 0) {
        groupNameLookup.set(row.id, row.name);
      }
    }

    const categoryRows = await db.all<{
      id: string;
      cat_group: string;
      tombstone: 1 | 0;
      is_income: 1 | 0;
    }>(
      `SELECT id, cat_group, tombstone, is_income FROM categories`,
    );

    const variableCategoryIds: string[] = [];
    for (const row of categoryRows) {
      if (row.tombstone === 0) {
        categoryToGroup.set(row.id, row.cat_group);
      }

      if (
        row.tombstone === 0 &&
        row.is_income === 0 &&
        row.cat_group &&
        dailyGroupIds.has(row.cat_group)
      ) {
        const targetAccountId = dailyStrategyAccounts.get(row.cat_group);
        if (!targetAccountId || targetAccountId !== accountId) {
          continue;
        }
        variableCategoryIds.push(row.id);
      }
    }

    if (variableCategoryIds.length > 0) {
      const budgetTypeRow = await db.first<{ value: string }>(
        'SELECT value FROM preferences WHERE id = ?',
        ['budgetType'],
      );
      const budgetTable =
        (budgetTypeRow?.value ?? 'envelope') === 'tracking'
          ? 'reflect_budgets'
          : 'zero_budgets';

      const months: string[] = [];
      let monthCursor = monthFromDate(simulationStart);
      const endMonth = monthFromDate(normalizedEnd);
      while (true) {
        months.push(monthCursor);
        if (monthCursor === endMonth) {
          break;
        }
        monthCursor = nextMonth(monthCursor);
      }

      const monthInts = months.map(month => parseInt(month.replace('-', ''), 10));
      if (monthInts.length > 0) {
        const monthPlaceholders = monthInts.map(() => '?').join(', ');
        const categoryPlaceholders = variableCategoryIds.map(() => '?').join(', ');

        const budgetRows = await db.all<{
          month: number;
          category: string;
          amount: number;
        }>(
          `SELECT month, category, amount FROM ${budgetTable}
             WHERE month IN (${monthPlaceholders})
               AND category IN (${categoryPlaceholders})`,
          [...monthInts, ...variableCategoryIds],
        );

        const monthGroupTotals = new Map<
          string,
          Map<string, number>
        >();

        for (const row of budgetRows) {
          const monthKey = `${row.month}`;
          const monthString = `${monthKey.slice(0, 4)}-${monthKey.slice(4)}`;
          const groupId = categoryToGroup.get(row.category);
          if (!groupId || !dailyGroupIds.has(groupId)) {
            continue;
          }

          if (!monthGroupTotals.has(monthString)) {
            monthGroupTotals.set(monthString, new Map());
          }

          const groupTotals = monthGroupTotals.get(monthString)!;
          groupTotals.set(groupId, (groupTotals.get(groupId) ?? 0) + row.amount);
        }

        for (const [month, groupTotals] of monthGroupTotals) {
          const monthDate = parseDate(`${month}-01`);
          const monthInt = parseInt(month.replace('-', ''), 10);
          if (monthInt < todayMonthInt) {
            continue;
          }

          const fullMonthDays = d.eachDayOfInterval({
            start: d.startOfMonth(monthDate),
            end: d.endOfMonth(monthDate),
          });

          for (const [groupId, totalAmount] of groupTotals) {
            if (!dailyGroupIds.has(groupId)) {
              continue;
            }

            const targetAccountId = dailyStrategyAccounts.get(groupId);
            if (!targetAccountId || targetAccountId !== accountId) {
              continue;
            }
            if (totalAmount === 0) {
              continue;
            }

            const daysInMonth = fullMonthDays.length;
            if (daysInMonth === 0) {
              continue;
            }
 
            const getAllocationForIndex = (index: number) => {
              const nextPortion = ((index + 1) * totalAmount) / daysInMonth;
              const currentPortion = (index * totalAmount) / daysInMonth;
              if (totalAmount >= 0) {
                return Math.floor(nextPortion) - Math.floor(currentPortion);
              }
              return Math.ceil(nextPortion) - Math.ceil(currentPortion);
            };
 
            fullMonthDays.forEach((day, index) => {
              const date = dayFromDate(day);
              if (!withinSimulationWindow(date)) {
                return;
              }
              if (monthInt === todayMonthInt && date < todayString) {
                return;
              }
 
              const allocation = getAllocationForIndex(index);
              if (allocation === 0) {
                return;
              }
 
              const delta = -allocation;
              addDelta(date, delta);
              variableOccurrences.set(`${groupId}:${date}`, {
                amount: delta,
                groupId,
              });
 
              if (!isBefore(date, normalizedStart) && !isAfter(date, normalizedEnd)) {
                const groupName = groupNameLookup.get(groupId) ?? 'Variable spending';
                forecastEvents.push({
                  id: `allocation:${groupId}:${date}`,
                  name: groupName,
                  date,
                  amount: delta,
                  payee: null,
                  postsTransaction: false,
                  type: 'allocation',
                  groupId,
                });
              }
            });

          }
        }
      }
    }
  }

  for (const schedule of schedules as ScheduleEntity[]) {
    if (!schedule.next_date) {
      continue;
    }

    const conditions = extractScheduleConds(schedule._conditions);
    const dateCond = conditions.date;

    if (!dateCond) {
      continue;
    }

    const scheduleAmount = getScheduledAmount(schedule._amount);

    if (scheduleAmount === 0) {
      continue;
    }

    const isRecurring = scheduleIsRecurring(dateCond);
    const seenDates = new Set<string>();

    const addEventForDate = (date: string) => {
      if (!withinSimulationWindow(date) || seenDates.has(date)) {
        return;
      }

      seenDates.add(date);

      addDelta(date, scheduleAmount);
      scheduledOccurrences.set(`${schedule.id}:${date}`, scheduleAmount);

      if (!isBefore(date, normalizedStart) && !isAfter(date, normalizedEnd)) {
        forecastEvents.push({
          id: `${schedule.id}:${date}`,
          scheduleId: schedule.id,
          name: schedule.name,
          date,
          amount: scheduleAmount,
          payee: schedule._payee ?? null,
          postsTransaction: Boolean(schedule.posts_transaction),
          type: 'scheduled',
        });
      }
    };

    addEventForDate(normalizeDay(schedule.next_date));

    if (!isRecurring) {
      continue;
    }

    let iterationDay = d.startOfDay(parseDate(schedule.next_date));
    const endBoundary = d.startOfDay(parseDate(normalizedEnd));

    let iterations = 0;
    const maxIterations = 366;

    while (iterations < maxIterations && iterationDay <= endBoundary) {
      iterations += 1;

      const nextDate = getNextDate(dateCond, iterationDay);
      if (!nextDate) {
        break;
      }

      if (seenDates.has(nextDate)) {
        iterationDay = d.startOfDay(parseDate(addDays(iterationDay, 1)));
        continue;
      }

      addEventForDate(normalizeDay(nextDate));

      const nextIterationBase = parseDate(addDays(nextDate, 1));
      if (!nextIterationBase) {
        break;
      }

      iterationDay = d.startOfDay(nextIterationBase);
    }
  }

  const transactions = await db.all<{
    id: string;
    amount: number;
    date: number;
    description?: string | null;
    notes?: string | null;
    schedule?: string | null;
    starting_balance_flag: 1 | 0;
    payee?: string | null;
    payee_name?: string | null;
    cat_group?: string | null;
  }>(
    `SELECT t.id, t.amount, t.date, tx.description, t.notes, t.schedule, t.starting_balance_flag,
            t.payee, p.name as payee_name, c.cat_group as cat_group
       FROM v_transactions_internal_alive t
       LEFT JOIN transactions tx ON tx.id = t.id
       LEFT JOIN payees p ON p.id = t.payee
       LEFT JOIN categories c ON c.id = t.category
      WHERE t.account = ?
        AND t.is_child = 0
        AND t.tombstone = 0
        AND t.date >= ?
        AND t.date <= ?`,
    [
      accountId,
      db.toDateRepr(simulationStart),
      db.toDateRepr(normalizedEnd),
    ],
  );

  for (const txn of transactions) {
    if (txn.starting_balance_flag === 1) {
      continue;
    }

    const date = fromDateRepr(txn.date);

    if (!withinSimulationWindow(date)) {
      continue;
    }

    const transactionGroupId = txn.cat_group ?? null;

    if (txn.schedule) {
      const occurrenceKey = `${txn.schedule}:${date}`;
      const scheduledAmount = scheduledOccurrences.get(occurrenceKey);
      if (scheduledAmount != null) {
        const current = dailyDeltas.get(date) ?? 0;
        dailyDeltas.set(date, current - scheduledAmount);
        scheduledOccurrences.delete(occurrenceKey);
        const index = forecastEvents.findIndex(
          event =>
            event.type === 'scheduled' &&
            event.scheduleId === txn.schedule &&
            event.date === date,
        );
        if (index !== -1) {
          forecastEvents.splice(index, 1);
        }
      }
    }

    if (transactionGroupId && dailyGroupIds.has(transactionGroupId)) {
      const allocationKey = `${transactionGroupId}:${date}`;
      const allocation = variableOccurrences.get(allocationKey);
      if (allocation) {
        const current = dailyDeltas.get(date) ?? 0;
        dailyDeltas.set(date, current - allocation.amount);
        variableOccurrences.delete(allocationKey);
        const index = forecastEvents.findIndex(
          event =>
            event.type === 'allocation' &&
            event.groupId === transactionGroupId &&
            event.date === date,
        );
        if (index !== -1) {
          forecastEvents.splice(index, 1);
        }
      }
    }

    addDelta(date, txn.amount);

    if (!isBefore(date, normalizedStart) && !isAfter(date, normalizedEnd)) {
      const name = txn.payee_name || txn.description || txn.notes || 'Transaction';
      forecastEvents.push({
        id: txn.id,
        scheduleId: txn.schedule ?? undefined,
        name,
        date,
        amount: txn.amount,
        payee: txn.payee_name ?? null,
        postsTransaction: false,
        type: 'actual',
        transactionId: txn.id,
        groupId: transactionGroupId ?? undefined,
      });
    }
  }

  const dailyBalances: Record<string, number> = {};
  let runningBalance = balanceBeforeSimulation;

  const dayBeforeRange = addDays(normalizedStart, -1);

  let cursorDay = d.startOfDay(simulationStartDate);
  const endDay = d.startOfDay(end);

  while (cursorDay <= endDay) {
    const date = dayFromDate(cursorDay);
    const delta = dailyDeltas.get(date) ?? 0;
    runningBalance += delta;

    if (date === dayBeforeRange) {
      startingBalance = runningBalance;
    }

    if (!isBefore(date, normalizedStart)) {
      dailyBalances[date] = runningBalance;
    }
    cursorDay = d.addDays(cursorDay, 1);
  }

  forecastEvents.sort((a, b) => {
    if (a.date === b.date) {
      return a.amount - b.amount;
    }
    return a.date.localeCompare(b.date);
  });

  return {
    accountId,
    startDate: normalizedStart,
    endDate: normalizedEnd,
    startingBalance,
    dailyBalances,
    events: forecastEvents,
  };
}

export const app = createApp<ForecastHandlers>();

app.method('forecast/get-calendar-data', getCalendarData);





