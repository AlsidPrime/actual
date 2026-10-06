import type { ForecastResult } from '@actual-app/core/types/models/forecast';
import { describe, expect, it } from 'vitest';

import { buildBudgetBurnProjection } from './budgetBurn';

const today = '2024-10-30';
const endDate = '2025-01-31';
const categories = [
  { categoryId: 'groceries', categoryName: 'Groceries', leftover: 50 },
];
const monthBudgets = {
  '2024-10': { groceries: 100 },
  '2024-11': { groceries: 200 },
  '2024-12': { groceries: 0 },
  '2025-01': { groceries: 300 },
};

function forecast(
  schedules: {
    date: string;
    amount: number;
    categoryId?: string;
    isTransfer?: boolean;
  }[] = [],
): ForecastResult {
  return {
    dataPoints: schedules.map((schedule, index) => ({
      date: schedule.date,
      accountId: 'checking',
      accountName: 'Checking',
      balance: 1000,
      transactions: [
        {
          amount: schedule.amount,
          categoryId: schedule.categoryId,
          isTransfer: schedule.isTransfer,
          payee: 'Scheduled',
          scheduleId: `s${index}`,
          scheduleName: 'Scheduled',
        },
      ],
    })),
    lowestBalance: {
      date: today,
      balance: 1000,
      accountId: '',
      accountName: '',
    },
    forecastStartDate: today,
    forecastEndDate: endDate,
  };
}

function project(
  overrides: Partial<Parameters<typeof buildBudgetBurnProjection>[0]> = {},
) {
  return buildBudgetBurnProjection({
    enabled: true,
    categories,
    forecastData: forecast(),
    today,
    endDate,
    monthBudgets,
    ...overrides,
  });
}

describe('multi-month Budget Burn', () => {
  it('uses live current leftover, explicit future budgets, and current-plan fallback', () => {
    const result = project();
    expect(result.months.map(month => month.totalBurn)).toEqual([
      50, 200, 100, 300,
    ]);
    expect(result.totalBurn).toBe(650);
    expect(
      result.days
        .filter(day => day.date.startsWith('2024-10'))
        .map(day => day.dailyBurn),
    ).toEqual([25, 25]);
    expect(result.days.find(day => day.date === '2024-11-01')?.dailyBurn).toBe(
      7,
    );
    expect(result.days.find(day => day.date === '2024-12-01')?.dailyBurn).toBe(
      4,
    );
    expect(result.days.find(day => day.date === '2025-01-01')?.dailyBurn).toBe(
      10,
    );
  });

  it('subtracts matching expenses from their own month and ignores refunds/transfers', () => {
    const result = project({
      forecastData: forecast([
        { date: '2024-10-31', amount: -10, categoryId: 'groceries' },
        { date: '2024-11-05', amount: -40, categoryId: 'groceries' },
        { date: '2024-11-06', amount: 20, categoryId: 'groceries' },
        {
          date: '2024-12-05',
          amount: -70,
          categoryId: 'groceries',
          isTransfer: true,
        },
        { date: '2025-01-05', amount: -900, categoryId: 'unselected' },
      ]),
    });
    expect(result.months.map(month => month.totalBurn)).toEqual([
      40, 160, 100, 300,
    ]);
    expect(
      result.days.find(day => day.date === '2024-11-01')?.cumulativeBurn,
    ).toBe(46);
    expect(
      result.days.find(day => day.date === '2024-12-01')?.cumulativeBurn,
    ).toBe(204);
    expect(
      result.days.find(day => day.date === '2025-01-31')?.cumulativeBurn,
    ).toBe(600);
  });

  it('responds to current actual spending through a smaller live leftover', () => {
    expect(
      project({ categories: [{ ...categories[0], leftover: 15 }] }).months[0]
        ?.totalBurn,
    ).toBe(15);
  });

  it('keeps cumulative burn continuous across November and the year boundary', () => {
    const result = project();
    const day = (date: string) => result.days.find(item => item.date === date);
    expect(day('2024-10-31')?.cumulativeBurn).toBe(50);
    expect(day('2024-11-01')?.cumulativeBurn).toBe(57);
    expect(day('2024-11-30')?.cumulativeBurn).toBe(250);
    expect(day('2024-12-31')?.cumulativeBurn).toBe(350);
    expect(day('2025-01-01')?.cumulativeBurn).toBe(360);
  });

  it('allocates remainder cents to earliest dates in each month', () => {
    const result = project({
      categories: [{ ...categories[0], leftover: 3 }],
      endDate: '2024-11-30',
      monthBudgets: {
        '2024-10': { groceries: 3 },
        '2024-11': { groceries: 0 },
      },
    });
    expect(result.days.slice(0, 2).map(day => day.dailyBurn)).toEqual([2, 1]);
    expect(result.days.find(day => day.date === '2024-11-01')?.dailyBurn).toBe(
      1,
    );
    expect(result.days.find(day => day.date === '2024-11-04')?.dailyBurn).toBe(
      0,
    );
  });

  it('is disabled with no selected categories or disabled configuration', () => {
    expect(project({ enabled: false }).days).toEqual([]);
    expect(project({ categories: [] }).totalBurn).toBe(0);
  });
});
