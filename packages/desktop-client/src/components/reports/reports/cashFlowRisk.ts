import type { ForecastResult } from '@actual-app/core/types/models/forecast';

import type { BudgetBurnProjection } from './budgetBurn';

export type CashFlowRiskResult = {
  status: 'safe' | 'warning' | 'danger';
  firstNegativeDate: string | null;
  firstNegativeBalance: number | null;
  lowestBalance: number;
  lowestBalanceDate: string;
  nextOperatingInflow: { date: string; amount: number } | null;
};

export function calculateCashFlowRisk({
  forecastData,
  budgetBurn,
  operatingAccountIds,
  today,
  endDate,
}: {
  forecastData: ForecastResult | null;
  budgetBurn: BudgetBurnProjection | null;
  operatingAccountIds: string[];
  today: string;
  endDate: string;
}): CashFlowRiskResult | null {
  if (!forecastData || operatingAccountIds.length === 0) {
    return null;
  }

  const operatingIds = new Set(operatingAccountIds);
  const combinedByDate = new Map<string, number>();
  const operatingInflowByDate = new Map<string, number>();
  for (const point of forecastData.dataPoints) {
    if (
      point.date < today ||
      point.date > endDate ||
      !operatingIds.has(point.accountId)
    ) {
      continue;
    }
    combinedByDate.set(
      point.date,
      (combinedByDate.get(point.date) ?? 0) + point.balance,
    );
    if (point.date > today) {
      const income = point.transactions
        .filter(
          transaction => transaction.amount > 0 && !transaction.isTransfer,
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      if (income > 0) {
        operatingInflowByDate.set(
          point.date,
          (operatingInflowByDate.get(point.date) ?? 0) + income,
        );
      }
    }
  }

  const orderedBalances = [...combinedByDate].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (orderedBalances.length === 0) {
    return null;
  }
  const cumulativeBurnByDate = new Map(
    budgetBurn?.days.map(day => [day.date, day.cumulativeBurn]) ?? [],
  );
  let firstNegativeDate: string | null = null;
  let firstNegativeBalance: number | null = null;
  let lowestBalance = Infinity;
  let lowestBalanceDate = today;
  for (const [date, combinedBalance] of orderedBalances) {
    // This matches the Operating-only Calendar balance after cumulative Burn.
    const adjustedBalance =
      combinedBalance - (cumulativeBurnByDate.get(date) ?? 0);
    if (adjustedBalance < 0 && firstNegativeDate === null) {
      firstNegativeDate = date;
      firstNegativeBalance = adjustedBalance;
    }
    if (adjustedBalance < lowestBalance) {
      lowestBalance = adjustedBalance;
      lowestBalanceDate = date;
    }
  }

  const [nextInflowDate, nextInflowAmount] = [...operatingInflowByDate].sort(
    ([a], [b]) => a.localeCompare(b),
  )[0] ?? [null, null];
  return {
    status:
      firstNegativeDate === today
        ? 'danger'
        : firstNegativeDate !== null
          ? 'warning'
          : 'safe',
    firstNegativeDate,
    firstNegativeBalance,
    lowestBalance,
    lowestBalanceDate,
    nextOperatingInflow:
      nextInflowDate === null || nextInflowAmount === null
        ? null
        : { date: nextInflowDate, amount: nextInflowAmount },
  };
}
