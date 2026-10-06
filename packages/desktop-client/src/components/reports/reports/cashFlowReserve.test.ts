import type {
  ForecastResult,
  ForecastTransaction,
} from '@actual-app/core/types/models/forecast';
import { describe, expect, it } from 'vitest';

import { buildBudgetBurnProjection } from './budgetBurn';
import { calculateSweepAdvisor } from './cashFlowReserve';

const today = '2024-10-30';
const endDate = '2024-11-03';
const inflow: ForecastTransaction = {
  amount: 500,
  payee: 'Employer',
  scheduleId: 'income',
  scheduleName: 'Income',
};

function forecast(
  operating: number[] = [1000, 900, 800, 1300, 1200],
  reserve = 100,
  income: ForecastTransaction | null = inflow,
): ForecastResult {
  const dates = [
    '2024-10-30',
    '2024-10-31',
    '2024-11-01',
    '2024-11-02',
    '2024-11-03',
  ];
  return {
    dataPoints: dates.flatMap((date, index) => [
      {
        date,
        accountId: 'checking',
        accountName: 'Checking',
        balance: operating[index],
        transactions: index === 3 && income ? [income] : [],
      },
      {
        date,
        accountId: 'savings',
        accountName: 'Savings',
        balance: reserve,
        transactions: [],
      },
    ]),
    lowestBalance: { date: today, balance: 0, accountId: '', accountName: '' },
    forecastStartDate: today,
    forecastEndDate: endDate,
  };
}

function advisor(
  overrides: Partial<Parameters<typeof calculateSweepAdvisor>[0]> = {},
) {
  return calculateSweepAdvisor({
    forecastData: forecast(),
    budgetBurn: null,
    isBudgetBurnComplete: true,
    operatingAccountIds: ['checking'],
    reserveAccountIds: ['savings'],
    reserveCategoryLeftovers: [600, -200],
    safetyBuffer: 200,
    today,
    endDate,
    ...overrides,
  });
}

describe('Savings Sweep Advisor', () => {
  it('clamps negative reserve leftover and accounts for existing Reserve cash', () => {
    expect(advisor()).toMatchObject({
      protectedTarget: 600,
      reserveAccountBalance: 100,
      reserveFundingGap: 500,
    });
  });

  it('limits safe transfer by funding gap and operating headroom while keeping buffer', () => {
    expect(advisor()).toMatchObject({
      status: 'safe',
      minimumOperatingCash: 800,
      availableOperatingHeadroom: 600,
      safeToMove: 500,
      nextInflowDate: '2024-11-02',
    });
    expect(advisor({ reserveCategoryLeftovers: [1000] })).toMatchObject({
      reserveFundingGap: 900,
      safeToMove: 600,
    });
  });

  it('withholds green advice when Budget Burn coverage is incomplete', () => {
    expect(advisor({ isBudgetBurnComplete: false })).toMatchObject({
      status: 'incomplete',
      safeToMove: 500,
    });
    expect(advisor({ isBudgetBurnComplete: true }).status).toBe('safe');
  });

  it('prioritizes Operating buffer risk over fully funded Reserve savings', () => {
    expect(
      advisor({
        reserveCategoryLeftovers: [100],
        forecastData: forecast([300, 300, 300, 800, 800]),
        safetyBuffer: 500,
      }),
    ).toMatchObject({
      status: 'hold',
      reserveFundingGap: 0,
      minimumOperatingCash: 300,
      safeToMove: 0,
    });
  });

  it('returns funded, hold, danger, and setup states', () => {
    expect(advisor({ reserveCategoryLeftovers: [100] }).status).toBe('funded');
    expect(advisor({ safetyBuffer: 800 }).status).toBe('hold');
    expect(
      advisor({ forecastData: forecast([100, -50, -100, 400, 300]) }),
    ).toMatchObject({ status: 'danger', minimumOperatingCash: -100 });
    expect(advisor({ reserveAccountIds: [] }).status).toBe('setup');
    expect(advisor({ reserveCategoryLeftovers: [] }).status).toBe('setup');
  });

  it('uses the full remaining horizon when no replenishing inflow exists', () => {
    expect(
      advisor({
        forecastData: forecast([1000, 900, 800, 700, 600], 100, null),
      }),
    ).toMatchObject({ nextInflowDate: undefined, minimumOperatingCash: 600 });
  });

  it('ignores a positive transfer as a replenishing inflow', () => {
    expect(
      advisor({
        forecastData: forecast([1000, 900, 800, 700, 600], 100, {
          ...inflow,
          isTransfer: true,
        }),
      }),
    ).toMatchObject({ nextInflowDate: undefined, minimumOperatingCash: 600 });
  });

  it('subtracts cumulative burn from Operating cash without changing total liquidity', () => {
    const forecastData = forecast();
    const burn = buildBudgetBurnProjection({
      enabled: true,
      categories: [
        { categoryId: 'groceries', categoryName: 'Groceries', leftover: 30 },
      ],
      forecastData,
      today,
      endDate,
    });
    expect(advisor({ forecastData, budgetBurn: burn })).toMatchObject({
      minimumOperatingCash: 770,
      safeToMove: 500,
    });
    expect(
      forecastData.dataPoints.find(
        point => point.date === today && point.accountId === 'checking',
      )?.balance,
    ).toBe(1000);
    expect(
      forecastData.dataPoints.find(
        point => point.date === today && point.accountId === 'savings',
      )?.balance,
    ).toBe(100);
  });
});
