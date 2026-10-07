import * as monthUtils from '@actual-app/core/shared/months';
import type {
  ForecastDataPoint,
  ForecastResult,
} from '@actual-app/core/types/models/forecast';
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  getDate,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

import type { BudgetBurnDay, BudgetBurnProjection } from './budgetBurn';

export type CashFlowCalendarStatus = 'normal' | 'low' | 'negative';

export type CashFlowCalendarScheduledEvent = {
  id: string;
  amount: number;
  label: string;
  accountNames: string[];
  isTransfer: boolean;
  isManual: boolean;
};

export type CashFlowCalendarAccountBalance = {
  accountId: string;
  accountName: string;
  balance: number;
};

export type CashFlowCalendarDay = {
  date: string;
  dayOfMonth: number;
  isInMonth: boolean;
  combinedBalance: number | null;
  adjustedCombinedBalance: number | null;
  budgetBurn?: BudgetBurnDay;
  accountBalances: CashFlowCalendarAccountBalance[];
  scheduledEvents: CashFlowCalendarScheduledEvent[];
  status: CashFlowCalendarStatus;
};

export type CashFlowCalendarMonth = {
  month: string;
  days: CashFlowCalendarDay[];
};

type MutableScheduledEvent = CashFlowCalendarScheduledEvent & {
  amounts: number[];
  hasTransferFlag: boolean;
};

export function getWeekStartsOn(firstDayOfWeekIdx: string | undefined) {
  const parsedValue = Number.parseInt(firstDayOfWeekIdx ?? '0');
  const weekdays = [0, 1, 2, 3, 4, 5, 6] as const;
  return weekdays.find(day => day === parsedValue) ?? 0;
}

function getStatus(balance: number | null, lowThreshold: number | undefined) {
  if (balance != null && balance < 0) {
    return 'negative';
  }

  if (balance != null && lowThreshold != null && balance < lowThreshold) {
    return 'low';
  }

  return 'normal';
}

function indexDataPoints(dataPoints: ForecastDataPoint[]) {
  const dataPointsByDate = new Map<string, ForecastDataPoint[]>();

  for (const dataPoint of dataPoints) {
    const pointsForDate = dataPointsByDate.get(dataPoint.date);
    if (pointsForDate) {
      pointsForDate.push(dataPoint);
    } else {
      dataPointsByDate.set(dataPoint.date, [dataPoint]);
    }
  }

  return dataPointsByDate;
}

function buildScheduledEvents(
  date: string,
  dataPoints: ForecastDataPoint[],
  manualScheduleIds: ReadonlySet<string>,
): CashFlowCalendarScheduledEvent[] {
  const eventsById = new Map<string, MutableScheduledEvent>();

  for (const dataPoint of dataPoints) {
    for (const transaction of dataPoint.transactions) {
      const id = `${date}:${transaction.scheduleId}`;
      const existingEvent = eventsById.get(id);

      if (existingEvent) {
        existingEvent.amount += transaction.amount;
        existingEvent.amounts.push(transaction.amount);
        existingEvent.hasTransferFlag ||= transaction.isTransfer === true;
        existingEvent.isManual ||= manualScheduleIds.has(
          transaction.scheduleId,
        );
        if (!existingEvent.accountNames.includes(dataPoint.accountName)) {
          existingEvent.accountNames.push(dataPoint.accountName);
        }
      } else {
        eventsById.set(id, {
          id,
          amount: transaction.amount,
          amounts: [transaction.amount],
          hasTransferFlag: transaction.isTransfer === true,
          label:
            (transaction.scheduleName.trim() === '' ||
              transaction.scheduleName.toLowerCase() === 'unknown') &&
            transaction.payee &&
            transaction.payee.toLowerCase() !== 'unknown'
              ? transaction.payee
              : transaction.scheduleName,
          accountNames: [dataPoint.accountName],
          isTransfer: false,
          isManual: manualScheduleIds.has(transaction.scheduleId),
        });
      }
    }
  }

  return [...eventsById.values()].map(
    ({ amounts, hasTransferFlag, ...event }) => ({
      ...event,
      isTransfer:
        hasTransferFlag ||
        (amounts.some(amount => amount < 0) &&
          amounts.some(amount => amount > 0)),
    }),
  );
}

function buildDay({
  date,
  month,
  dataPoints,
  lowThreshold,
  budgetBurn,
  manualScheduleIds,
}: {
  date: Date;
  month: string;
  dataPoints: ForecastDataPoint[];
  lowThreshold: number | undefined;
  budgetBurn: BudgetBurnDay | undefined;
  manualScheduleIds: ReadonlySet<string>;
}): CashFlowCalendarDay {
  const dateString = format(date, 'yyyy-MM-dd');
  const accountBalances = dataPoints.map(dataPoint => ({
    accountId: dataPoint.accountId,
    accountName: dataPoint.accountName,
    balance: dataPoint.balance,
  }));
  const combinedBalance =
    accountBalances.length === 0
      ? null
      : accountBalances.reduce((sum, account) => sum + account.balance, 0);

  const adjustedCombinedBalance =
    combinedBalance == null
      ? null
      : combinedBalance - (budgetBurn?.cumulativeBurn ?? 0);

  return {
    date: dateString,
    dayOfMonth: getDate(date),
    isInMonth: monthUtils.getMonth(dateString) === month,
    combinedBalance,
    adjustedCombinedBalance,
    budgetBurn,
    accountBalances,
    scheduledEvents: buildScheduledEvents(
      dateString,
      dataPoints,
      manualScheduleIds,
    ),
    status: getStatus(adjustedCombinedBalance, lowThreshold),
  };
}

export function clampCashFlowCalendarMonth({
  month,
  start,
  end,
}: {
  month: string;
  start: string;
  end: string;
}) {
  const startMonth = monthUtils.getMonth(start);
  const endMonth = monthUtils.getMonth(end);

  if (month < startMonth) {
    return startMonth;
  }

  if (month > endMonth) {
    return endMonth;
  }

  return month;
}

export function getInitialCashFlowCalendarMonth({
  start,
  end,
  currentMonth = monthUtils.currentMonth(),
}: {
  start: string;
  end: string;
  currentMonth?: string;
}) {
  return clampCashFlowCalendarMonth({ month: currentMonth, start, end });
}

export function moveCashFlowCalendarMonth({
  month,
  offset,
  start,
  end,
}: {
  month: string;
  offset: -1 | 1;
  start: string;
  end: string;
}) {
  return clampCashFlowCalendarMonth({
    month: monthUtils.addMonths(month, offset),
    start,
    end,
  });
}

export function buildCashFlowCalendarData({
  forecastData,
  start,
  end,
  firstDayOfWeekIdx,
  lowThreshold,
  budgetBurn,
  manualScheduleIds = new Set<string>(),
}: {
  forecastData: ForecastResult | null;
  start: string;
  end: string;
  firstDayOfWeekIdx?: string;
  lowThreshold?: number;
  budgetBurn?: BudgetBurnProjection;
  manualScheduleIds?: ReadonlySet<string>;
}): CashFlowCalendarMonth[] {
  const startMonth = monthUtils.getMonth(start);
  const endMonth = monthUtils.getMonth(end);
  const months = monthUtils.rangeInclusive(startMonth, endMonth);
  const dataPointsByDate = indexDataPoints(forecastData?.dataPoints ?? []);
  const weekStartsOn = getWeekStartsOn(firstDayOfWeekIdx);
  const burnByDate = new Map(budgetBurn?.days.map(day => [day.date, day]));

  return months.map(month => {
    const monthDate = monthUtils.parseDate(month);
    const gridStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn });
    const gridEnd = endOfWeek(endOfMonth(monthDate), { weekStartsOn });
    const days: CashFlowCalendarDay[] = [];

    for (let date = gridStart; date <= gridEnd; date = addDays(date, 1)) {
      const dateString = format(date, 'yyyy-MM-dd');
      days.push(
        buildDay({
          date,
          month,
          dataPoints: dataPointsByDate.get(dateString) ?? [],
          lowThreshold,
          budgetBurn: burnByDate.get(dateString),
          manualScheduleIds,
        }),
      );
    }

    return { month, days };
  });
}
