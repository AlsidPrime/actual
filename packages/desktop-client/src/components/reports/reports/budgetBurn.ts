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
  monthlyCumulativeBurn: number;
  remainingBurn: number;
  categories: { categoryId: string; categoryName: string; amount: number }[];
};

export type BudgetBurnMonth = {
  month: string;
  totalBurn: number;
  categories: BudgetBurnCategorySummary[];
};

export type BudgetBurnProjection = {
  totalBurn: number;
  categories: BudgetBurnCategorySummary[];
  months: BudgetBurnMonth[];
  days: BudgetBurnDay[];
};

export function buildBudgetBurnProjection({
  enabled,
  categories,
  forecastData,
  today,
  endDate,
  monthBudgets,
}: {
  enabled: boolean;
  categories: BudgetBurnCategory[];
  forecastData: ForecastResult | null;
  today: string;
  endDate: string;
  // Present on the dedicated page. The legacy widget continues to model only
  // the current month when this is omitted.
  monthBudgets?: Record<string, Record<string, number>>;
}): BudgetBurnProjection {
  if (!enabled || categories.length === 0 || endDate < today) {
    return { totalBurn: 0, categories: [], months: [], days: [] };
  }

  const currentMonth = monthUtils.getMonth(today);
  const endMonth = monthUtils.getMonth(endDate);
  const months = monthBudgets
    ? monthUtils.rangeInclusive(currentMonth, endMonth)
    : [currentMonth];
  const scheduledByMonthAndCategory = new Map<string, number>();
  for (const point of forecastData?.dataPoints ?? []) {
    if (point.date < today || point.date > endDate) {
      continue;
    }
    for (const transaction of point.transactions) {
      // A transfer can retain a category across an off-budget boundary.
      if (
        transaction.categoryId &&
        !transaction.isTransfer &&
        transaction.amount < 0
      ) {
        const key = `${monthUtils.getMonth(point.date)}:${transaction.categoryId}`;
        scheduledByMonthAndCategory.set(
          key,
          (scheduledByMonthAndCategory.get(key) ?? 0) - transaction.amount,
        );
      }
    }
  }

  const monthSummaries = months.map(month => {
    const isCurrentMonth = month === currentMonth;
    const categoriesForMonth = categories.map(category => {
      const currentBudget =
        monthBudgets?.[currentMonth]?.[category.categoryId] ?? 0;
      const futureBudget = monthBudgets?.[month]?.[category.categoryId] ?? 0;
      const available = Math.max(
        0,
        isCurrentMonth
          ? category.leftover
          : futureBudget > 0
            ? futureBudget
            : currentBudget,
      );
      const scheduledExpense =
        scheduledByMonthAndCategory.get(`${month}:${category.categoryId}`) ?? 0;
      return {
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        available,
        scheduledExpense,
        remainingBurn: Math.max(0, available - scheduledExpense),
      };
    });
    return {
      month,
      totalBurn: categoriesForMonth.reduce(
        (sum, category) => sum + category.remainingBurn,
        0,
      ),
      categories: categoriesForMonth,
    };
  });
  const totalBurn = monthSummaries.reduce(
    (sum, month) => sum + month.totalBurn,
    0,
  );
  const dailyCategories = new Map<string, BudgetBurnDay['categories']>();
  for (const month of monthSummaries) {
    const start =
      month.month === currentMonth
        ? today
        : monthUtils.firstDayOfMonth(month.month);
    const end =
      monthUtils.lastDayOfMonth(month.month) < endDate
        ? monthUtils.lastDayOfMonth(month.month)
        : endDate;
    const dates = monthUtils.dayRangeInclusive(start, end);
    for (const category of month.categories) {
      const base = Math.floor(category.remainingBurn / dates.length);
      const remainder = category.remainingBurn % dates.length;
      dates.forEach((date, index) => {
        const amount = base + (index < remainder ? 1 : 0);
        if (amount > 0) {
          const contributions = dailyCategories.get(date) ?? [];
          contributions.push({
            categoryId: category.categoryId,
            categoryName: category.categoryName,
            amount,
          });
          dailyCategories.set(date, contributions);
        }
      });
    }
  }

  let cumulativeBurn = 0;
  let cumulativeInMonth = 0;
  let previousMonth = currentMonth;
  const totalsByMonth = new Map(
    monthSummaries.map(month => [month.month, month.totalBurn]),
  );
  const days = monthUtils.dayRangeInclusive(today, endDate).map(date => {
    const month = monthUtils.getMonth(date);
    if (month !== previousMonth) {
      previousMonth = month;
      cumulativeInMonth = 0;
    }
    const contributions = dailyCategories.get(date) ?? [];
    const dailyBurn = contributions.reduce(
      (sum, category) => sum + category.amount,
      0,
    );
    cumulativeBurn += dailyBurn;
    cumulativeInMonth += dailyBurn;
    return {
      date,
      dailyBurn,
      cumulativeBurn,
      monthlyCumulativeBurn: cumulativeInMonth,
      remainingBurn: (totalsByMonth.get(month) ?? 0) - cumulativeInMonth,
      categories: contributions,
    };
  });
  const summaries = categories.map(category => {
    const perMonth = monthSummaries.map(month =>
      month.categories.find(item => item.categoryId === category.categoryId),
    );
    return {
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      available: perMonth.reduce(
        (sum, item) => sum + (item?.available ?? 0),
        0,
      ),
      scheduledExpense: perMonth.reduce(
        (sum, item) => sum + (item?.scheduledExpense ?? 0),
        0,
      ),
      remainingBurn: perMonth.reduce(
        (sum, item) => sum + (item?.remainingBurn ?? 0),
        0,
      ),
    };
  });
  return { totalBurn, categories: summaries, months: monthSummaries, days };
}
