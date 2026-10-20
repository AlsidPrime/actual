import type { ForecastResult } from '@actual-app/core/types/models/forecast';
import type { ScheduleEntity } from '@actual-app/core/types/models/schedule';
import { describe, expect, it } from 'vitest';

import { calculatePaydayRunway } from './cashFlowPayday';

function schedule(id: string, account = 'checking'): ScheduleEntity {
  return {
    id,
    name: id,
    rule: id,
    next_date: '2026-10-30',
    completed: false,
    posts_transaction: true,
    tombstone: false,
    _payee: id,
    _account: account,
    _amount: 10000,
    _amountOp: 'is',
    _date: { frequency: 'weekly', interval: 2, start: '2026-10-16' },
    _conditions: [],
    _actions: [],
  };
}

function forecast(
  days: Array<{
    date: string;
    balance: number;
    transactions?: Array<{
      scheduleId: string;
      amount: number;
      isTransfer?: boolean;
      categoryId?: string;
    }>;
  }>,
): ForecastResult {
  return {
    forecastStartDate: '2026-10-28',
    forecastEndDate: '2026-11-04',
    lowestBalance: {
      date: '2026-10-28',
      balance: 0,
      accountId: 'checking',
      accountName: 'Checking',
    },
    dataPoints: days.map(day => ({
      date: day.date,
      balance: day.balance,
      accountId: 'checking',
      accountName: 'Checking',
      transactions: (day.transactions ?? []).map(tx => ({
        ...tx,
        payee: null,
        scheduleName: tx.scheduleId,
      })),
    })),
  };
}

const days = [
  { date: '2026-10-28', balance: 4000 },
  {
    date: '2026-10-29',
    balance: -1000,
    transactions: [
      { scheduleId: 'benefit', amount: 2000 },
      { scheduleId: 'refund', amount: 1000 },
      { scheduleId: 'transfer', amount: 2000, isTransfer: true },
    ],
  },
  {
    date: '2026-10-30',
    balance: 19000,
    transactions: [
      { scheduleId: 'pay-a', amount: 10000, categoryId: 'salary' },
      { scheduleId: 'pay-b', amount: 10000, categoryId: 'salary' },
    ],
  },
  { date: '2026-10-31', balance: 18000 },
];

function calculate(
  overrides: Partial<Parameters<typeof calculatePaydayRunway>[0]> = {},
) {
  return calculatePaydayRunway({
    forecastData: forecast(days),
    schedules: [schedule('pay-a'), schedule('pay-b')],
    selectedScheduleIds: ['pay-a', 'pay-b'],
    transferPayeeIds: new Set(),
    operatingAccountIds: ['checking'],
    budgetableAccountIds: ['checking'],
    budgetBurn: null,
    isBurnComplete: true,
    isVariableSpendingIncluded: true,
    safetyBuffer: 500,
    currentOperatingCash: 4000,
    today: '2026-10-28',
    endDate: '2026-10-31',
    ...overrides,
  });
}

describe('payday runway', () => {
  const positiveDays = forecast([
    { date: '2026-10-28', balance: 4000 },
    { date: '2026-10-29', balance: 5000 },
    {
      date: '2026-10-30',
      balance: 25000,
      transactions: [
        { scheduleId: 'pay-a', amount: 10000, categoryId: 'salary' },
        { scheduleId: 'pay-b', amount: 10000, categoryId: 'salary' },
      ],
    },
  ]);

  it('keeps the actual cash checkpoint separate from positive projected closing balances', () => {
    const negative = calculate({
      forecastData: positiveDays,
      currentOperatingCash: -100,
    });
    expect(negative).toMatchObject({
      status: 'negative',
      currentCash: -100,
      currentCashWarning: 'negative',
      todayClosingCash: 4000,
      lowestCash: 4000,
      lowestDate: '2026-10-28',
      firstNegativeDate: null,
    });
    const belowBuffer = calculate({
      forecastData: positiveDays,
      currentOperatingCash: 100,
    });
    expect(belowBuffer).toMatchObject({
      status: 'low',
      currentCashWarning: 'below-buffer',
      todayClosingCash: 4000,
      firstNegativeDate: null,
    });
  });

  it('preserves income categories for hold-aware previews without counting transfers', () => {
    expect(calculate().budgetableDeposits).toEqual([
      { amount: 10000, categoryId: 'salary' },
      { amount: 10000, categoryId: 'salary' },
    ]);
  });

  it('accepts two valid selected schedules as a complete payday configuration', () => {
    expect(calculate({ forecastData: positiveDays })).toMatchObject({
      status: 'safe',
      isConfigurationIncomplete: false,
      scheduleNames: ['pay-a', 'pay-b'],
      expectedIncome: 20000,
      budgetableIncome: 20000,
    });
  });

  it('keeps selected off-budget Operating income out of envelope capacity', () => {
    expect(
      calculate({
        forecastData: positiveDays,
        budgetableAccountIds: [],
      }),
    ).toMatchObject({ expectedIncome: 20000, budgetableIncome: 0 });
  });

  it.each([
    ['deleted', [schedule('pay-a')], new Set<string>()],
    [
      'completed',
      [schedule('pay-a'), { ...schedule('pay-b'), completed: true }],
      new Set<string>(),
    ],
    [
      'no longer eligible',
      [schedule('pay-a'), { ...schedule('pay-b'), _amount: -10000 }],
      new Set<string>(),
    ],
    [
      'transfer payee',
      [schedule('pay-a'), schedule('pay-b')],
      new Set(['pay-b']),
    ],
  ])(
    'marks one valid and one %s selection incomplete',
    (_, schedules, transferPayeeIds) => {
      expect(
        calculate({ forecastData: positiveDays, schedules, transferPayeeIds }),
      ).toMatchObject({
        status: 'incomplete',
        isConfigurationIncomplete: true,
        paydayDate: '2026-10-30',
        scheduleNames: ['pay-a'],
        expectedIncome: 10000,
      });
    },
  );

  it('does not let duplicate schedule records conceal a deleted selection', () => {
    expect(
      calculate({
        forecastData: positiveDays,
        schedules: [schedule('pay-a'), schedule('pay-a')],
        selectedScheduleIds: ['pay-a', 'deleted'],
      }),
    ).toMatchObject({
      status: 'incomplete',
      isConfigurationIncomplete: true,
    });
  });

  it('rejects a selected transfer schedule even if forecast data calls it income', () => {
    expect(
      calculate({
        forecastData: positiveDays,
        schedules: [schedule('pay-b')],
        selectedScheduleIds: ['pay-b'],
        transferPayeeIds: new Set(['pay-b']),
      }),
    ).toMatchObject({
      status: 'incomplete',
      isConfigurationIncomplete: true,
      paydayDate: null,
    });
  });

  it('keeps warnings but avoids a green conclusion when variable spending is excluded', () => {
    expect(
      calculate({
        forecastData: positiveDays,
        isVariableSpendingIncluded: false,
      }),
    ).toMatchObject({ status: 'scheduled-only', isScheduledOnly: true });
    expect(
      calculate({
        forecastData: positiveDays,
        isVariableSpendingIncluded: false,
        currentOperatingCash: -100,
      }),
    ).toMatchObject({ status: 'negative', isScheduledOnly: true });
  });

  it('groups same-day employment income and ignores other inflows and transfers as anchors', () => {
    expect(calculate()).toMatchObject({
      status: 'negative',
      paydayDate: '2026-10-30',
      daysUntilPayday: 2,
      scheduleNames: ['pay-a', 'pay-b'],
      expectedIncome: 20000,
      lowestCash: -1000,
      lowestDate: '2026-10-29',
      firstNegativeDate: '2026-10-29',
      firstNegativeCash: -1000,
      paydayClosingCash: 19000,
    });
  });

  it('uses the next future occurrence across different frequencies and year boundary', () => {
    const result = calculate({
      today: '2026-12-31',
      endDate: '2027-01-02',
      forecastData: forecast([
        {
          date: '2026-12-31',
          balance: 2000,
          transactions: [{ scheduleId: 'pay-a', amount: 10000 }],
        },
        {
          date: '2027-01-01',
          balance: 1000,
          transactions: [{ scheduleId: 'pay-b', amount: 10000 }],
        },
        { date: '2027-01-02', balance: 1000 },
      ]),
    });
    expect(result).toMatchObject({
      paydayDate: '2027-01-01',
      daysUntilPayday: 1,
      expectedIncome: 10000,
      lowestCash: 2000,
    });
  });

  it('shows setup or unavailable when no selected or funded future payday exists', () => {
    expect(calculate({ selectedScheduleIds: [] }).status).toBe('setup');
    expect(
      calculate({ today: '2026-10-30', endDate: '2026-10-30' }).status,
    ).toBe('unavailable');
    expect(calculate({ selectedScheduleIds: ['deleted'] })).toMatchObject({
      status: 'incomplete',
      isConfigurationIncomplete: true,
    });
    expect(
      calculate({
        selectedScheduleIds: ['pay-a'],
        schedules: [schedule('pay-a', 'savings')],
        forecastData: forecast(days.filter(day => day.date !== '2026-10-30')),
      }).status,
    ).toBe('unavailable');
  });

  it('does not declare safety when Burn is incomplete and applies cumulative Burn when complete', () => {
    expect(calculate({ isBurnComplete: false })).toMatchObject({
      status: 'incomplete',
      paydayClosingCash: null,
    });
    expect(
      calculate({ isBurnComplete: false, currentOperatingCash: -100 }),
    ).toMatchObject({
      status: 'incomplete',
      currentCashWarning: 'negative',
    });
    expect(calculate({ currentOperatingCash: null }).status).toBe('incomplete');
    expect(calculate({ currentOperatingCash: Number.NaN }).status).toBe(
      'incomplete',
    );
    expect(
      calculate({
        forecastData: forecast([
          { date: '2026-10-28', balance: Number.NaN },
          ...days.slice(1),
        ]),
      }).status,
    ).toBe('incomplete');
    const result = calculate({
      budgetBurn: {
        totalBurn: 0,
        categories: [],
        months: [],
        days: [
          {
            date: '2026-10-28',
            dailyBurn: 0,
            cumulativeBurn: 0,
            monthlyCumulativeBurn: 0,
            remainingBurn: 0,
            categories: [],
          },
          {
            date: '2026-10-29',
            dailyBurn: 1000,
            cumulativeBurn: 1000,
            monthlyCumulativeBurn: 1000,
            remainingBurn: 0,
            categories: [],
          },
        ],
      },
    });
    expect(result.lowestCash).toBe(-2000);
  });
});
