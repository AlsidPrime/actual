import type { ForecastResult } from '@actual-app/core/types/models/forecast';

import type { BudgetBurnProjection } from './budgetBurn';

export type SweepAdvisorResult = {
  status: 'setup' | 'incomplete' | 'funded' | 'safe' | 'hold' | 'danger';
  protectedTarget: number;
  reserveAccountBalance: number;
  reserveFundingGap: number;
  scheduledReserveFunding: number;
  effectiveReserveFundingGap: number;
  minimumOperatingCash: number | null;
  availableOperatingHeadroom: number;
  safeToMove: number;
  nextInflowDate?: string;
};

function getScheduledReserveFunding(
  forecastData: ForecastResult | null,
  operatingIds: Set<string>,
  reserveIds: Set<string>,
  today: string,
  endDate: string,
): number {
  const occurrences = new Map<
    string,
    { operatingOutflows: number[]; reserveInflows: number[] }
  >();
  for (const point of forecastData?.dataPoints ?? []) {
    // Today's Reserve forecast balance already includes today's schedules.
    if (point.date <= today || point.date > endDate) {
      continue;
    }
    for (const transaction of point.transactions) {
      if (!transaction.isTransfer || !transaction.scheduleId) {
        continue;
      }
      const key = `${point.date}:${transaction.scheduleId}`;
      const occurrence = occurrences.get(key) ?? {
        operatingOutflows: [],
        reserveInflows: [],
      };
      if (operatingIds.has(point.accountId) && transaction.amount < 0) {
        occurrence.operatingOutflows.push(-transaction.amount);
      }
      if (reserveIds.has(point.accountId) && transaction.amount > 0) {
        occurrence.reserveInflows.push(transaction.amount);
      }
      occurrences.set(key, occurrence);
    }
  }
  let scheduledReserveFunding = 0;
  for (const occurrence of occurrences.values()) {
    const [outflow] = occurrence.operatingOutflows;
    const [inflow] = occurrence.reserveInflows;
    // Only a unique, equal pair establishes the direction and amount.
    if (
      occurrence.operatingOutflows.length === 1 &&
      occurrence.reserveInflows.length === 1 &&
      outflow === inflow
    ) {
      scheduledReserveFunding += inflow;
    }
  }
  return scheduledReserveFunding;
}

export function calculateSweepAdvisor({
  forecastData,
  budgetBurn,
  isBudgetBurnComplete,
  operatingAccountIds,
  reserveAccountIds,
  reserveCategoryLeftovers,
  safetyBuffer,
  today,
  endDate,
}: {
  forecastData: ForecastResult | null;
  budgetBurn: BudgetBurnProjection | null;
  isBudgetBurnComplete: boolean;
  operatingAccountIds: string[];
  reserveAccountIds: string[];
  reserveCategoryLeftovers: number[];
  safetyBuffer: number;
  today: string;
  endDate: string;
}): SweepAdvisorResult {
  const protectedTarget = reserveCategoryLeftovers.reduce(
    (sum, leftover) => sum + Math.max(0, leftover),
    0,
  );
  const reserveIds = new Set(reserveAccountIds);
  const operatingIds = new Set(operatingAccountIds);
  const reserveAccountBalance = (forecastData?.dataPoints ?? [])
    .filter(point => point.date === today && reserveIds.has(point.accountId))
    .reduce((sum, point) => sum + point.balance, 0);
  const reserveFundingGap = Math.max(
    0,
    protectedTarget - reserveAccountBalance,
  );
  const scheduledReserveFunding = getScheduledReserveFunding(
    forecastData,
    operatingIds,
    reserveIds,
    today,
    endDate,
  );
  const effectiveReserveFundingGap = Math.max(
    0,
    reserveFundingGap - scheduledReserveFunding,
  );
  const base = {
    protectedTarget,
    reserveAccountBalance,
    reserveFundingGap,
    scheduledReserveFunding,
    effectiveReserveFundingGap,
    minimumOperatingCash: null,
    availableOperatingHeadroom: 0,
    safeToMove: 0,
  };
  if (
    !forecastData ||
    operatingIds.size === 0 ||
    reserveIds.size === 0 ||
    reserveCategoryLeftovers.length === 0
  ) {
    return { ...base, status: 'setup' };
  }

  const operatingPoints = forecastData.dataPoints.filter(point =>
    operatingIds.has(point.accountId),
  );
  const nextInflowDate = operatingPoints
    .filter(point => point.date > today && point.date <= endDate)
    .filter(point =>
      point.transactions.some(
        transaction => transaction.amount > 0 && !transaction.isTransfer,
      ),
    )
    .map(point => point.date)
    .sort()[0];
  const operatingByDate = new Map<string, number>();
  for (const point of operatingPoints) {
    if (point.date >= today && point.date <= endDate) {
      operatingByDate.set(
        point.date,
        (operatingByDate.get(point.date) ?? 0) + point.balance,
      );
    }
  }
  const cumulativeBurnByDate = new Map(
    budgetBurn?.days.map(day => [day.date, day.cumulativeBurn]) ?? [],
  );
  const operatingCashWindow = [...operatingByDate.entries()].map(
    ([date, balance]) => balance - (cumulativeBurnByDate.get(date) ?? 0),
  );
  if (operatingCashWindow.length === 0) {
    return { ...base, status: 'setup', nextInflowDate };
  }
  const minimumOperatingCash = Math.min(...operatingCashWindow);
  const availableOperatingHeadroom = Math.max(
    0,
    minimumOperatingCash - safetyBuffer,
  );
  const safeToMove = Math.min(
    effectiveReserveFundingGap,
    availableOperatingHeadroom,
  );
  const result = {
    ...base,
    minimumOperatingCash,
    availableOperatingHeadroom,
    safeToMove,
    nextInflowDate,
  };
  if (minimumOperatingCash < 0) {
    return { ...result, status: 'danger' };
  }
  if (minimumOperatingCash < safetyBuffer) {
    return { ...result, status: 'hold' };
  }
  if (!isBudgetBurnComplete) {
    return { ...result, status: 'incomplete' };
  }
  if (effectiveReserveFundingGap === 0) {
    return { ...result, status: 'funded' };
  }
  if (safeToMove > 0) {
    return { ...result, status: 'safe' };
  }
  return { ...result, status: 'hold' };
}
