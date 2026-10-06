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

type ScheduledLeg = {
  accountId: string;
  amount: number;
  date?: string;
  isTransfer?: boolean;
  scheduleId?: string;
};

function forecastWithLegs(legs: ScheduledLeg[]): ForecastResult {
  const result = forecast();
  for (const leg of legs) {
    const date = leg.date ?? '2024-11-01';
    let point = result.dataPoints.find(
      item => item.date === date && item.accountId === leg.accountId,
    );
    if (!point) {
      point = {
        date,
        accountId: leg.accountId,
        accountName: leg.accountId,
        balance: 0,
        transactions: [],
      };
      result.dataPoints.push(point);
    }
    point.transactions.push({
      amount: leg.amount,
      isTransfer: leg.isTransfer ?? true,
      payee: 'Scheduled transfer',
      scheduleId: leg.scheduleId ?? 'move-to-savings',
      scheduleName: 'Move to savings',
    });
  }
  return result;
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

  it('uses a later bill after income to constrain the full-horizon sweep', () => {
    expect(
      advisor({
        forecastData: forecast([2000, 3000, 3000, 3000, 500]),
        reserveCategoryLeftovers: [1600],
        safetyBuffer: 500,
      }),
    ).toMatchObject({
      nextInflowDate: '2024-11-02',
      minimumOperatingCash: 500,
      availableOperatingHeadroom: 0,
      safeToMove: 0,
    });
  });

  it('does not let a tiny positive inflow hide later cash risk', () => {
    expect(
      advisor({
        forecastData: forecast([2000, 2000, 2000, 1999, 100], 100, {
          ...inflow,
          amount: 1,
        }),
        reserveCategoryLeftovers: [1600],
        safetyBuffer: 0,
      }),
    ).toMatchObject({
      nextInflowDate: '2024-11-02',
      minimumOperatingCash: 100,
      safeToMove: 100,
    });
  });

  it('uses the full-horizon minimum for positive headroom', () => {
    expect(
      advisor({
        forecastData: forecast([1000, 1200, 900, 1300, 750]),
        reserveCategoryLeftovers: [1000],
      }),
    ).toMatchObject({
      minimumOperatingCash: 750,
      availableOperatingHeadroom: 550,
      safeToMove: 550,
    });
  });

  it('credits a unique matching Operating to Reserve scheduled transfer without mutating the forecast', () => {
    const forecastData = forecastWithLegs([
      { accountId: 'checking', amount: -200 },
      { accountId: 'savings', amount: 200 },
    ]);
    const before = structuredClone(forecastData);
    expect(advisor({ forecastData })).toMatchObject({
      reserveFundingGap: 500,
      scheduledReserveFunding: 200,
      effectiveReserveFundingGap: 300,
      safeToMove: 300,
    });
    expect(forecastData).toEqual(before);
    expect(
      forecastData.dataPoints.find(
        point => point.date === '2024-11-01' && point.accountId === 'checking',
      )?.transactions,
    ).toContainEqual(
      expect.objectContaining({ amount: -200, isTransfer: true }),
    );
  });

  it("does not count a transfer already included in today's Reserve balance twice", () => {
    const forecastData = forecastWithLegs([
      { accountId: 'checking', amount: -200, date: today },
      { accountId: 'savings', amount: 200, date: today },
    ]);
    const reserveToday = forecastData.dataPoints.find(
      point => point.date === today && point.accountId === 'savings',
    );
    if (!reserveToday) {
      throw new Error('Missing Reserve point');
    }
    reserveToday.balance = 300;
    expect(advisor({ forecastData })).toMatchObject({
      reserveAccountBalance: 300,
      reserveFundingGap: 300,
      scheduledReserveFunding: 0,
      effectiveReserveFundingGap: 300,
    });
  });

  it('treats a scheduled transfer covering the entire gap as no immediate funding need', () => {
    expect(
      advisor({
        forecastData: forecastWithLegs([
          { accountId: 'checking', amount: -500 },
          { accountId: 'savings', amount: 500 },
        ]),
      }),
    ).toMatchObject({
      status: 'funded',
      reserveFundingGap: 500,
      scheduledReserveFunding: 500,
      effectiveReserveFundingGap: 0,
      safeToMove: 0,
    });
  });

  it.each([
    [
      'Operating to Operating',
      ['checking', 'checking2'],
      ['savings'],
      'checking',
      'checking2',
    ],
    [
      'Reserve to Reserve',
      ['checking'],
      ['savings', 'savings2'],
      'savings',
      'savings2',
    ],
    ['Reserve to Operating', ['checking'], ['savings'], 'savings', 'checking'],
  ])(
    'does not credit %s transfers',
    (_, operatingAccountIds, reserveAccountIds, source, destination) => {
      expect(
        advisor({
          forecastData: forecastWithLegs([
            { accountId: source, amount: -200 },
            { accountId: destination, amount: 200 },
          ]),
          operatingAccountIds,
          reserveAccountIds,
        }),
      ).toMatchObject({
        scheduledReserveFunding: 0,
        effectiveReserveFundingGap: 500,
      });
    },
  );

  it('does not credit non-transfer Reserve income or one-sided and ambiguous transfers', () => {
    for (const legs of [
      [{ accountId: 'savings', amount: 200, isTransfer: false }],
      [{ accountId: 'savings', amount: 200 }],
      [
        { accountId: 'checking', amount: -200 },
        { accountId: 'savings', amount: 200, date: '2024-11-02' },
      ],
      [
        { accountId: 'checking', amount: -200 },
        { accountId: 'savings', amount: 200, scheduleId: 'different' },
      ],
      [
        { accountId: 'checking', amount: -200 },
        { accountId: 'checking2', amount: -200 },
        { accountId: 'savings', amount: 200 },
      ],
    ] satisfies ScheduledLeg[][]) {
      expect(
        advisor({
          forecastData: forecastWithLegs(legs),
          operatingAccountIds: ['checking', 'checking2'],
        }),
      ).toMatchObject({
        scheduledReserveFunding: 0,
        effectiveReserveFundingGap: 500,
      });
    }
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
