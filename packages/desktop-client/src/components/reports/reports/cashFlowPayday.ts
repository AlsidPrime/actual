import * as monthUtils from '@actual-app/core/shared/months';
import type { ForecastResult } from '@actual-app/core/types/models/forecast';
import type { ScheduleEntity } from '@actual-app/core/types/models/schedule';
import { differenceInCalendarDays } from 'date-fns';

import type { BudgetBurnProjection } from './budgetBurn';

export function isEligiblePaydaySchedule(schedule: ScheduleEntity) {
  return (
    !schedule.completed &&
    !schedule.tombstone &&
    typeof schedule._date === 'object' &&
    schedule._date !== null &&
    typeof schedule._amount === 'number' &&
    schedule._amount > 0
  );
}

export type PaydayRunway = {
  status: 'setup' | 'unavailable' | 'incomplete' | 'safe' | 'low' | 'negative';
  paydayDate: string | null;
  daysUntilPayday: number | null;
  scheduleNames: string[];
  expectedIncome: number | null;
  currentCash: number | null;
  lowestCash: number | null;
  lowestDate: string | null;
  firstNegativeDate: string | null;
  firstNegativeCash: number | null;
  paydayClosingCash: number | null;
};

export function calculatePaydayRunway({
  forecastData,
  schedules,
  selectedScheduleIds,
  operatingAccountIds,
  budgetBurn,
  isBurnComplete,
  safetyBuffer,
  currentOperatingCash,
  today,
  endDate,
}: {
  forecastData: ForecastResult | null;
  schedules: readonly ScheduleEntity[];
  selectedScheduleIds: readonly string[];
  operatingAccountIds: readonly string[];
  budgetBurn: BudgetBurnProjection | null;
  isBurnComplete: boolean;
  safetyBuffer: number;
  currentOperatingCash: number | null;
  today: string;
  endDate: string;
}): PaydayRunway {
  const empty: PaydayRunway = {
    status: 'setup',
    paydayDate: null,
    daysUntilPayday: null,
    scheduleNames: [],
    expectedIncome: null,
    currentCash: null,
    lowestCash: null,
    lowestDate: null,
    firstNegativeDate: null,
    firstNegativeCash: null,
    paydayClosingCash: null,
  };
  if (selectedScheduleIds.length === 0) {
    return empty;
  }
  const selectedIds = new Set(selectedScheduleIds);
  const eligible = schedules.filter(
    schedule =>
      selectedIds.has(schedule.id) && isEligiblePaydaySchedule(schedule),
  );
  const unavailable = { ...empty, status: 'unavailable' as const };
  if (
    eligible.length === 0 ||
    !forecastData ||
    operatingAccountIds.length === 0
  ) {
    return unavailable;
  }
  const operatingIds = new Set(operatingAccountIds);
  const eligibleIds = new Set(eligible.map(schedule => schedule.id));
  const dates = new Map<string, Map<string, number>>();
  const nativeCash = new Map<string, number>();
  for (const point of forecastData.dataPoints) {
    if (
      point.date < today ||
      point.date > endDate ||
      !operatingIds.has(point.accountId)
    ) {
      continue;
    }
    nativeCash.set(
      point.date,
      (nativeCash.get(point.date) ?? 0) + point.balance,
    );
    if (point.date <= today) {
      continue;
    }
    for (const transaction of point.transactions) {
      if (!eligibleIds.has(transaction.scheduleId) || transaction.isTransfer) {
        continue;
      }
      const incomes = dates.get(point.date) ?? new Map<string, number>();
      incomes.set(
        transaction.scheduleId,
        (incomes.get(transaction.scheduleId) ?? 0) + transaction.amount,
      );
      dates.set(point.date, incomes);
    }
  }
  const paydayDate = [...dates]
    .filter(([, incomes]) => [...incomes.values()].some(amount => amount > 0))
    .map(([date]) => date)
    .sort()[0];
  if (!paydayDate) {
    return unavailable;
  }
  const incomes = dates.get(paydayDate);
  if (!incomes) {
    return unavailable;
  }
  const burnByDate = new Map(
    budgetBurn?.days.map(day => [day.date, day.cumulativeBurn]),
  );
  const adjustedCash = (date: string) => {
    const native = nativeCash.get(date);
    const burn = burnByDate.get(date) ?? 0;
    if (
      native == null ||
      !Number.isFinite(native) ||
      !Number.isFinite(burn) ||
      (budgetBurn && !burnByDate.has(date))
    ) {
      return null;
    }
    return native - burn;
  };
  const base = {
    ...empty,
    paydayDate,
    daysUntilPayday: differenceInCalendarDays(
      monthUtils.parseDate(paydayDate),
      monthUtils.parseDate(today),
    ),
    scheduleNames: eligible
      .filter(schedule => (incomes.get(schedule.id) ?? 0) > 0)
      .map(schedule => schedule.name || 'Unnamed schedule'),
    expectedIncome: [...incomes.values()].reduce(
      (sum, amount) => sum + amount,
      0,
    ),
    currentCash: currentOperatingCash,
    paydayClosingCash: isBurnComplete ? adjustedCash(paydayDate) : null,
  };
  if (
    !isBurnComplete ||
    currentOperatingCash == null ||
    !Number.isFinite(currentOperatingCash)
  ) {
    return { ...base, status: 'incomplete' };
  }
  let lowestCash = Infinity;
  let lowestDate: string | null = null;
  let firstNegativeDate: string | null = null;
  let firstNegativeCash: number | null = null;
  for (
    let date = today;
    date < paydayDate;
    date = monthUtils.addDays(date, 1)
  ) {
    const cash = adjustedCash(date);
    if (cash == null || (budgetBurn && !burnByDate.has(date))) {
      return { ...base, status: 'incomplete' };
    }
    if (cash < lowestCash) {
      lowestCash = cash;
      lowestDate = date;
    }
    if (cash < 0 && firstNegativeDate === null) {
      firstNegativeDate = date;
      firstNegativeCash = cash;
    }
  }
  return {
    ...base,
    status: firstNegativeDate
      ? 'negative'
      : lowestCash < safetyBuffer
        ? 'low'
        : 'safe',
    lowestCash,
    lowestDate,
    firstNegativeDate,
    firstNegativeCash,
  };
}
