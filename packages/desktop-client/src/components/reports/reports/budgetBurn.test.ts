import type { ForecastResult } from '@actual-app/core/types/models/forecast';
import { describe, expect, it } from 'vitest';

import { buildBudgetBurnProjection } from './budgetBurn';
import { calculateSweepAdvisor } from './cashFlowReserve';
import { calculateCashFlowRisk } from './cashFlowRisk';

const today = '2024-04-29';
const category = {
  categoryId: 'groceries',
  categoryName: 'Groceries',
  leftover: 10001,
};

function forecast(
  transactions: ForecastResult['dataPoints'][number]['transactions'] = [],
): ForecastResult {
  return {
    dataPoints: [
      {
        date: today,
        accountId: 'checking',
        accountName: 'Checking',
        balance: 20000,
        transactions,
      },
    ],
    lowestBalance: {
      date: today,
      balance: 20000,
      accountId: '',
      accountName: '',
    },
    forecastStartDate: today,
    forecastEndDate: '2024-05-02',
  };
}

function project(
  options: Partial<Parameters<typeof buildBudgetBurnProjection>[0]> = {},
) {
  return buildBudgetBurnProjection({
    enabled: true,
    categories: [category],
    forecastData: forecast(),
    today,
    endDate: '2024-05-02',
    ...options,
  });
}

describe('Budget Burn', () => {
  it('uses the native plan minus posted spending and one future scheduled expense despite partial funding', () => {
    const result = project({
      categories: [{ ...category, leftover: 30000 }],
      monthBudgets: {
        '2024-04': { groceries: 30000 },
        '2024-05': { groceries: 0 },
      },
      automationPlans: { '2024-04': { groceries: 180000 } },
      monthSpending: { '2024-04': { groceries: -70000 } },
      forecastData: forecast([
        {
          amount: -10000,
          categoryId: 'groceries',
          payee: 'Scheduled groceries',
          scheduleId: 'groceries',
          scheduleName: 'Groceries',
        },
      ]),
    });
    expect(result.months[0]?.categories[0]).toMatchObject({
      available: 110000,
      scheduledExpense: 10000,
      remainingBurn: 100000,
      planSource: 'automation',
    });
  });

  it('keeps automation Burn independent of envelope funding and nets posted refunds', () => {
    const options = {
      monthBudgets: {
        '2024-04': { groceries: 0 },
        '2024-05': { groceries: 0 },
      },
      automationPlans: { '2024-04': { groceries: 180000 } },
      monthSpending: { '2024-04': { groceries: -70000 } },
    };
    const lowFunding = project({
      ...options,
      categories: [{ ...category, leftover: 30000 }],
    });
    const highFunding = project({
      ...options,
      categories: [{ ...category, leftover: 150000 }],
    });
    expect(lowFunding.months[0]?.totalBurn).toBe(110000);
    expect(highFunding.months[0]?.totalBurn).toBe(110000);
    expect(
      project({
        ...options,
        monthSpending: { '2024-04': { groceries: -60000 } },
      }).months[0]?.totalBurn,
    ).toBe(120000);
  });

  it('uses the future native plan without funded envelope cash and subtracts its schedule once', () => {
    const future = forecast();
    future.dataPoints.push({
      ...future.dataPoints[0],
      date: '2024-05-01',
      transactions: [
        {
          amount: -10000,
          categoryId: 'groceries',
          payee: 'Scheduled groceries',
          scheduleId: 'groceries',
          scheduleName: 'Groceries',
        },
      ],
    });
    const result = project({
      categories: [{ ...category, leftover: 0 }],
      monthBudgets: {
        '2024-04': { groceries: 0 },
        '2024-05': { groceries: 0 },
      },
      automationPlans: { '2024-05': { groceries: 180000 } },
      forecastData: future,
    });
    expect(result.months[1]?.categories[0]).toMatchObject({
      available: 180000,
      scheduledExpense: 10000,
      remainingBurn: 170000,
      planSource: 'automation',
    });
    expect(result.months[0]?.categories[0]).toMatchObject({
      remainingBurn: 0,
      planSource: 'funded',
    });
  });

  it('makes Operating Risk and Sweep more conservative than the funded fallback', () => {
    const forecastData = forecast();
    forecastData.dataPoints[0].balance = 30000;
    forecastData.dataPoints.push({
      date: today,
      accountId: 'savings',
      accountName: 'Savings',
      balance: 1000000,
      transactions: [],
    });
    const common = {
      categories: [{ ...category, leftover: 30000 }],
      monthBudgets: {
        '2024-04': { groceries: 30000 },
        '2024-05': { groceries: 0 },
      },
      forecastData,
    };
    const fallback = project(common);
    const automation = project({
      ...common,
      automationPlans: { '2024-04': { groceries: 180000 } },
      monthSpending: { '2024-04': { groceries: -70000 } },
    });
    const risk = (budgetBurn: typeof fallback) =>
      calculateCashFlowRisk({
        forecastData,
        budgetBurn,
        operatingAccountIds: ['checking'],
        today,
        endDate: '2024-05-02',
      });
    const sweep = (budgetBurn: typeof fallback) =>
      calculateSweepAdvisor({
        forecastData,
        budgetBurn,
        isBudgetBurnComplete: true,
        operatingAccountIds: ['checking'],
        reserveAccountIds: ['savings'],
        reserveCategoryLeftovers: [1000500],
        safetyBuffer: 0,
        today,
        endDate: '2024-05-02',
      });
    expect(risk(fallback)?.status).toBe('safe');
    expect(risk(automation)?.status).toBe('danger');
    expect(sweep(fallback).status).toBe('safe');
    expect(sweep(automation).status).toBe('danger');
  });

  it('keeps the funded-budget fallback for categories with no usable automation plan', () => {
    const result = project({
      categories: [{ ...category, leftover: 30000 }],
      monthBudgets: {
        '2024-04': { groceries: 30000 },
        '2024-05': { groceries: 0 },
      },
      automationPlans: {},
    });
    expect(result.months.map(month => month.categories[0])).toMatchObject([
      { available: 30000, planSource: 'funded' },
      { available: 30000, planSource: 'funded' },
    ]);
  });

  it('uses positive Actual leftover and distributes cents per category to the earliest days', () => {
    const result = project();
    expect(result.totalBurn).toBe(10001);
    expect(result.days.map(day => day.dailyBurn)).toEqual([5001, 5000, 0, 0]);
    expect(result.days.map(day => day.cumulativeBurn)).toEqual([
      5001, 10001, 10001, 10001,
    ]);
    expect(result.days.at(-1)?.remainingBurn).toBe(0);
  });

  it.each([-100, 0])('clamps nonpositive leftover %i to zero', leftover => {
    expect(project({ categories: [{ ...category, leftover }] }).totalBurn).toBe(
      0,
    );
  });

  it('accepts positive rollover reflected in leftover even with no current spending', () => {
    expect(
      project({ categories: [{ ...category, leftover: 1500 }] }).totalBurn,
    ).toBe(1500);
  });

  it('uses refund-adjusted leftover without separately counting a positive schedule', () => {
    const transaction = {
      amount: 200,
      categoryId: 'groceries',
      payee: 'Refund',
      scheduleId: 's1',
      scheduleName: 'Refund',
    };
    expect(
      project({
        categories: [{ ...category, leftover: 1200 }],
        forecastData: forecast([transaction]),
      }).totalBurn,
    ).toBe(1200);
  });

  it('subtracts only matching future expense already in selected-account forecast', () => {
    const tx = (categoryId: string | undefined, amount: number) => ({
      amount,
      categoryId,
      payee: 'Test',
      scheduleId: 's1',
      scheduleName: 'Test',
    });
    const result = project({
      categories: [
        category,
        { categoryId: 'fuel', categoryName: 'Fuel', leftover: 4000 },
      ],
      forecastData: forecast([
        tx('groceries', -3000),
        tx('fuel', -1000),
        tx('unselected', -9999),
        tx(undefined, -5000),
        tx('groceries', 1000),
      ]),
    });
    expect(result.categories.map(item => item.remainingBurn)).toEqual([
      7001, 3000,
    ]);
    expect(result.days[0]?.categories.map(item => item.amount)).toEqual([
      3501, 1500,
    ]);
  });

  it('ignores a categorized transfer from the selected account', () => {
    const result = project({
      forecastData: forecast([
        {
          amount: -5000,
          categoryId: 'groceries',
          isTransfer: true,
          payee: 'Transfer',
          scheduleId: 's',
          scheduleName: 'Transfer',
        },
      ]),
    });
    expect(result.categories[0]?.scheduledExpense).toBe(0);
    expect(result.totalBurn).toBe(10001);
  });

  it('never subtracts more scheduled expense than available', () => {
    expect(
      project({
        forecastData: forecast([
          {
            amount: -20000,
            categoryId: 'groceries',
            payee: 'Shop',
            scheduleId: 's',
            scheduleName: 'Shop',
          },
        ]),
      }).totalBurn,
    ).toBe(0);
  });

  it('starts on the first day and ends on the last day of the current month', () => {
    expect(
      project({
        today: '2024-04-01',
        endDate: '2024-04-30',
        categories: [{ ...category, leftover: 30 }],
      }).days,
    ).toHaveLength(30);
    expect(
      project({
        today: '2024-04-30',
        endDate: '2024-05-01',
        categories: [{ ...category, leftover: 30 }],
      }).days.map(day => day.dailyBurn),
    ).toEqual([30, 0]);
  });

  it('does not generate burn before today or in later months', () => {
    const result = project();
    expect(result.days.some(day => day.date < today)).toBe(false);
    expect(
      result.days
        .filter(day => day.date.startsWith('2024-05'))
        .every(
          day => day.dailyBurn === 0 && day.cumulativeBurn === result.totalBurn,
        ),
    ).toBe(true);
  });

  it('ignores scheduled expenses outside the current month', () => {
    const base = forecast();
    base.dataPoints.push({
      ...base.dataPoints[0],
      date: '2024-05-01',
      transactions: [
        {
          amount: -9000,
          categoryId: 'groceries',
          payee: 'Shop',
          scheduleId: 's',
          scheduleName: 'Shop',
        },
      ],
    });
    expect(project({ forecastData: base }).totalBurn).toBe(10001);
  });

  it('is inactive when disabled or without selections', () => {
    expect(project({ enabled: false }).days).toEqual([]);
    expect(project({ categories: [] }).totalBurn).toBe(0);
  });
});
