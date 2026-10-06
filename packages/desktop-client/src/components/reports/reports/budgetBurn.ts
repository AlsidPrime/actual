import * as monthUtils from '@actual-app/core/shared/months';
import type { ForecastResult } from '@actual-app/core/types/models/forecast';

export type BudgetBurnCategory = {
  categoryId: string;
  categoryName: string;
  leftover: number;
};

export type BudgetBurnCategorySummary = {
  categoryId: string;
  categoryName: string;
  available: number;
  scheduledExpense: number;
  remainingBurn: number;
};

export type BudgetBurnDay = {
  date: string;
  dailyBurn: number;
  cumulativeBurn: number;
  remainingBurn: number;
  categories: { categoryId: string; categoryName: string; amount: number }[];
};

export type BudgetBurnProjection = {
  totalBurn: number;
  categories: BudgetBurnCategorySummary[];
  days: BudgetBurnDay[];
};

export function buildBudgetBurnProjection({
  enabled,
  categories,
  forecastData,
  today,
  endDate,
}: {
  enabled: boolean;
  categories: BudgetBurnCategory[];
  forecastData: ForecastResult | null;
  today: string;
  endDate: string;
}): BudgetBurnProjection {
  if (!enabled || categories.length === 0) {
    return { totalBurn: 0, categories: [], days: [] };
  }

  const monthEnd = monthUtils.lastDayOfMonth(today);
  const dates = monthUtils.dayRangeInclusive(today, monthEnd);
  const scheduledByCategory = new Map<string, number>();
  for (const point of forecastData?.dataPoints ?? []) {
    if (point.date < today || point.date > monthEnd) {
      continue;
    }
    for (const transaction of point.transactions) {
      // The selected-account forecast already includes these cash expenses.
      // Transfers may retain a category across an off-budget boundary.
      if (
        transaction.categoryId &&
        !transaction.isTransfer &&
        transaction.amount < 0
      ) {
        scheduledByCategory.set(
          transaction.categoryId,
          (scheduledByCategory.get(transaction.categoryId) ?? 0) -
            transaction.amount,
        );
      }
    }
  }

  const summaries = categories.map(category => {
    const available = Math.max(0, category.leftover);
    const scheduledExpense = scheduledByCategory.get(category.categoryId) ?? 0;
    return {
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      available,
      scheduledExpense,
      remainingBurn: Math.max(0, available - scheduledExpense),
    };
  });
  const totalBurn = summaries.reduce(
    (sum, category) => sum + category.remainingBurn,
    0,
  );
  let cumulativeBurn = 0;
  const days = monthUtils.dayRangeInclusive(today, endDate).map(date => {
    const index = dates.indexOf(date);
    const contributions =
      index < 0
        ? []
        : summaries.flatMap(category => {
            const base = Math.floor(category.remainingBurn / dates.length);
            const extra = index < category.remainingBurn % dates.length ? 1 : 0;
            const amount = base + extra;
            return amount > 0
              ? [
                  {
                    categoryId: category.categoryId,
                    categoryName: category.categoryName,
                    amount,
                  },
                ]
              : [];
          });
    const dailyBurn = contributions.reduce(
      (sum, category) => sum + category.amount,
      0,
    );
    cumulativeBurn += dailyBurn;
    return {
      date,
      dailyBurn,
      cumulativeBurn,
      remainingBurn: totalBurn - cumulativeBurn,
      categories: contributions,
    };
  });
  return { totalBurn, categories: summaries, days };
}
