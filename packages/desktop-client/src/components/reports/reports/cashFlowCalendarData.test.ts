import type { ForecastResult } from '@actual-app/core/types/models/forecast';
import { describe, expect, it } from 'vitest';

import { buildBudgetBurnProjection } from './budgetBurn';
import {
  buildCashFlowCalendarData,
  getInitialCashFlowCalendarMonth,
  moveCashFlowCalendarMonth,
} from './cashFlowCalendarData';
import { calculateCashFlowRisk } from './cashFlowRisk';

function makeForecast(
  dataPoints: ForecastResult['dataPoints'],
): ForecastResult {
  return {
    dataPoints,
    lowestBalance: {
      date: '2024-03-01',
      balance: 0,
      accountId: '',
      accountName: '',
    },
    forecastStartDate: '2024-03-01',
    forecastEndDate: '2024-03-31',
  };
}

describe('buildCashFlowCalendarData', () => {
  it('combines balances while retaining per-account negative warnings', () => {
    const months = buildCashFlowCalendarData({
      forecastData: makeForecast([
        {
          date: '2024-03-12',
          balance: -2_500,
          accountId: 'checking',
          accountName: 'Checking',
          transactions: [],
        },
        {
          date: '2024-03-12',
          balance: 10_000,
          accountId: 'savings',
          accountName: 'Savings',
          transactions: [],
        },
      ]),
      start: '2024-03',
      end: '2024-03',
    });

    const day = months[0].days.find(day => day.date === '2024-03-12');

    expect(day).toMatchObject({
      combinedBalance: 7_500,
      status: 'normal',
    });
    expect(day?.accountBalances).toEqual([
      {
        accountId: 'checking',
        accountName: 'Checking',
        balance: -2_500,
      },
      {
        accountId: 'savings',
        accountName: 'Savings',
        balance: 10_000,
      },
    ]);
  });

  it('uses adjusted combined cash for warnings while keeping native accounts intact', () => {
    const [month] = buildCashFlowCalendarData({
      forecastData: makeForecast([
        {
          date: '2024-03-12',
          balance: 500,
          accountId: 'checking',
          accountName: 'Checking',
          transactions: [],
        },
      ]),
      start: '2024-03',
      end: '2024-03',
      budgetBurn: {
        totalBurn: 700,
        months: [],
        categories: [],
        days: [
          {
            date: '2024-03-12',
            dailyBurn: 100,
            cumulativeBurn: 700,
            monthlyCumulativeBurn: 100,
            remainingBurn: 0,
            categories: [],
          },
        ],
      },
    });
    const day = month.days.find(day => day.date === '2024-03-12');
    expect(day).toMatchObject({
      combinedBalance: 500,
      adjustedCombinedBalance: -200,
      status: 'negative',
    });
    expect(day?.accountBalances[0]?.balance).toBe(500);
  });

  it('carries adjusted negative cash across a month boundary', () => {
    const months = buildCashFlowCalendarData({
      forecastData: makeForecast([
        {
          date: '2024-10-31',
          balance: 0,
          accountId: 'checking',
          accountName: 'Checking',
          transactions: [],
        },
        {
          date: '2024-11-01',
          balance: 0,
          accountId: 'checking',
          accountName: 'Checking',
          transactions: [],
        },
      ]),
      start: '2024-10',
      end: '2024-11',
      budgetBurn: {
        totalBurn: 220,
        categories: [],
        months: [],
        days: [
          {
            date: '2024-10-31',
            dailyBurn: 200,
            cumulativeBurn: 200,
            monthlyCumulativeBurn: 200,
            remainingBurn: 0,
            categories: [],
          },
          {
            date: '2024-11-01',
            dailyBurn: 20,
            cumulativeBurn: 220,
            monthlyCumulativeBurn: 20,
            remainingBurn: 0,
            categories: [],
          },
        ],
      },
    });
    expect(months[0].days.find(day => day.date === '2024-10-31')).toMatchObject(
      { adjustedCombinedBalance: -200, status: 'negative' },
    );
    expect(months[1].days.find(day => day.date === '2024-11-01')).toMatchObject(
      { adjustedCombinedBalance: -220, status: 'negative' },
    );
  });

  it('labels a one-sided transfer and uses payee for an unknown schedule', () => {
    const [month] = buildCashFlowCalendarData({
      forecastData: makeForecast([
        {
          date: '2024-03-20',
          balance: 5000,
          accountId: 'checking',
          accountName: 'Checking',
          transactions: [
            {
              amount: -500,
              payee: 'Move to savings',
              scheduleId: 'transfer',
              scheduleName: 'Unknown',
              isTransfer: true,
            },
            {
              amount: -200,
              payee: 'Electric Company',
              scheduleId: 'bill',
              scheduleName: 'Unknown',
            },
            {
              amount: -100,
              payee: 'Other',
              scheduleId: 'named',
              scheduleName: 'Explicit name',
            },
          ],
        },
      ]),
      start: '2024-03',
      end: '2024-03',
    });
    const events = month.days.find(
      day => day.date === '2024-03-20',
    )?.scheduledEvents;
    expect(events).toMatchObject([
      { label: 'Move to savings', isTransfer: true },
      { label: 'Electric Company', isTransfer: false },
      { label: 'Explicit name', isTransfer: false },
    ]);
  });

  it('marks only native manual schedules without changing event amounts', () => {
    const forecastData = makeForecast([
      {
        date: '2024-03-20',
        balance: 1000,
        accountId: 'checking',
        accountName: 'Checking',
        transactions: [
          {
            amount: -300,
            payee: 'Rent',
            scheduleId: 'manual-rent',
            scheduleName: 'Rent',
          },
          {
            amount: 500,
            payee: 'Payday',
            scheduleId: 'auto-income',
            scheduleName: 'Payday',
          },
        ],
      },
    ]);
    const [month] = buildCashFlowCalendarData({
      forecastData,
      start: '2024-03',
      end: '2024-03',
      manualScheduleIds: new Set(['manual-rent']),
    });
    expect(
      month.days.find(day => day.date === '2024-03-20')?.scheduledEvents,
    ).toMatchObject([
      { label: 'Rent', amount: -300, isManual: true },
      { label: 'Payday', amount: 500, isManual: false },
    ]);
  });

  it('keeps Manual on a grouped two-leg transfer and preserves its net amount', () => {
    const transfer = {
      payee: 'Transfer',
      scheduleId: 'manual-transfer',
      scheduleName: 'Move to savings',
      isTransfer: true,
    };
    const [month] = buildCashFlowCalendarData({
      forecastData: makeForecast([
        {
          date: '2024-03-20',
          balance: 700,
          accountId: 'checking',
          accountName: 'Checking',
          transactions: [{ ...transfer, amount: -300 }],
        },
        {
          date: '2024-03-20',
          balance: 300,
          accountId: 'savings',
          accountName: 'Savings',
          transactions: [{ ...transfer, amount: 300 }],
        },
      ]),
      start: '2024-03',
      end: '2024-03',
      manualScheduleIds: new Set(['manual-transfer']),
    });
    expect(
      month.days.find(day => day.date === '2024-03-20')?.scheduledEvents,
    ).toMatchObject([
      {
        isTransfer: true,
        isManual: true,
        amount: 0,
        accountNames: ['Checking', 'Savings'],
      },
    ]);
  });

  it('keeps Manual on a one-sided selected transfer', () => {
    const [month] = buildCashFlowCalendarData({
      forecastData: makeForecast([
        {
          date: '2024-03-20',
          balance: 700,
          accountId: 'checking',
          accountName: 'Checking',
          transactions: [
            {
              amount: -300,
              payee: 'Transfer',
              scheduleId: 'manual-transfer',
              scheduleName: 'Move to savings',
              isTransfer: true,
            },
          ],
        },
      ]),
      start: '2024-03',
      end: '2024-03',
      manualScheduleIds: new Set(['manual-transfer']),
    });
    expect(
      month.days.find(day => day.date === '2024-03-20')?.scheduledEvents,
    ).toMatchObject([{ isTransfer: true, isManual: true, amount: -300 }]);
  });

  it('changes only event metadata, leaving Burn and risk results intact', () => {
    const forecastData = makeForecast([
      {
        date: '2024-03-20',
        balance: 500,
        accountId: 'checking',
        accountName: 'Checking',
        transactions: [
          {
            amount: -100,
            payee: 'Groceries',
            scheduleId: 'manual-bill',
            scheduleName: 'Groceries',
            categoryId: 'groceries',
          },
        ],
      },
    ]);
    const budgetBurn = buildBudgetBurnProjection({
      enabled: true,
      categories: [
        { categoryId: 'groceries', categoryName: 'Groceries', leftover: 200 },
      ],
      forecastData,
      today: '2024-03-20',
      endDate: '2024-03-20',
    });
    const before = buildCashFlowCalendarData({
      forecastData,
      start: '2024-03',
      end: '2024-03',
      budgetBurn,
    });
    const risk = () =>
      calculateCashFlowRisk({
        forecastData,
        budgetBurn,
        accountIds: ['checking'],
        operatingAccountIds: ['checking'],
        today: '2024-03-20',
        endDate: '2024-03-20',
      });
    const riskBefore = risk();
    const after = buildCashFlowCalendarData({
      forecastData,
      start: '2024-03',
      end: '2024-03',
      budgetBurn,
      manualScheduleIds: new Set(['manual-bill']),
    });
    const beforeDay = before[0].days.find(day => day.date === '2024-03-20');
    const afterDay = after[0].days.find(day => day.date === '2024-03-20');
    expect(afterDay?.scheduledEvents[0]).toMatchObject({
      amount: -100,
      isManual: true,
    });
    expect(afterDay?.adjustedCombinedBalance).toBe(
      beforeDay?.adjustedCombinedBalance,
    );
    expect(budgetBurn.days[0].cumulativeBurn).toBe(100);
    expect(risk()).toEqual(riskBefore);
  });

  it('groups both selected legs of a scheduled transfer into one event', () => {
    const scheduledTransfer = {
      payee: 'Transfer',
      scheduleId: 'transfer-schedule',
      scheduleName: 'Move to savings',
    };
    const months = buildCashFlowCalendarData({
      forecastData: makeForecast([
        {
          date: '2024-03-20',
          balance: 7_500,
          accountId: 'checking',
          accountName: 'Checking',
          transactions: [{ ...scheduledTransfer, amount: -2_500 }],
        },
        {
          date: '2024-03-20',
          balance: 2_500,
          accountId: 'savings',
          accountName: 'Savings',
          transactions: [{ ...scheduledTransfer, amount: 2_500 }],
        },
      ]),
      start: '2024-03',
      end: '2024-03',
    });

    const day = months[0].days.find(day => day.date === '2024-03-20');

    expect(day?.scheduledEvents).toEqual([
      {
        id: '2024-03-20:transfer-schedule',
        amount: 0,
        label: 'Move to savings',
        accountNames: ['Checking', 'Savings'],
        isTransfer: true,
        isManual: false,
      },
    ]);
  });

  it('retains the cash impact when only one transfer account is selected', () => {
    const [month] = buildCashFlowCalendarData({
      forecastData: makeForecast([
        {
          date: '2024-03-20',
          balance: 7_500,
          accountId: 'checking',
          accountName: 'Checking',
          transactions: [
            {
              payee: 'Transfer',
              scheduleId: 'transfer-schedule',
              scheduleName: 'Move to savings',
              amount: -2_500,
            },
          ],
        },
      ]),
      start: '2024-03',
      end: '2024-03',
    });

    expect(month.days.find(day => day.date === '2024-03-20')).toMatchObject({
      combinedBalance: 7_500,
      scheduledEvents: [{ amount: -2_500, isTransfer: false }],
    });
  });

  it('marks negative and configured low combined balances', () => {
    const forecastData = makeForecast([
      {
        date: '2024-03-10',
        balance: -1,
        accountId: 'checking',
        accountName: 'Checking',
        transactions: [],
      },
      {
        date: '2024-03-11',
        balance: 4_999,
        accountId: 'checking',
        accountName: 'Checking',
        transactions: [],
      },
    ]);
    const months = buildCashFlowCalendarData({
      forecastData,
      start: '2024-03',
      end: '2024-03',
      lowThreshold: 5_000,
    });

    expect(months[0].days.find(day => day.date === '2024-03-10')?.status).toBe(
      'negative',
    );
    expect(months[0].days.find(day => day.date === '2024-03-11')?.status).toBe(
      'low',
    );
  });

  it('aligns the month grid to the configured first day of the week', () => {
    const sundayFirst = buildCashFlowCalendarData({
      forecastData: null,
      start: '2024-03',
      end: '2024-03',
      firstDayOfWeekIdx: '0',
    });
    const mondayFirst = buildCashFlowCalendarData({
      forecastData: null,
      start: '2024-03',
      end: '2024-03',
      firstDayOfWeekIdx: '1',
    });

    expect(sundayFirst[0].days[0].date).toBe('2024-02-25');
    expect(mondayFirst[0].days[0].date).toBe('2024-02-26');
    expect(sundayFirst[0].days).toHaveLength(42);
    expect(mondayFirst[0].days).toHaveLength(35);
  });
  it('includes leap day and leaves missing forecast balances unavailable', () => {
    const [month] = buildCashFlowCalendarData({
      forecastData: null,
      start: '2024-02',
      end: '2024-02',
    });

    expect(month.days.filter(day => day.isInMonth)).toHaveLength(29);
    expect(month.days.find(day => day.date === '2024-02-29')).toMatchObject({
      isInMonth: true,
      combinedBalance: null,
      accountBalances: [],
      scheduledEvents: [],
    });
    expect(month.days.find(day => day.date === '2024-03-01')?.isInMonth).toBe(
      false,
    );
  });
});

describe('cash-flow calendar month navigation', () => {
  it('crosses year boundaries and accepts day-shaped report bounds', () => {
    const range = { start: '2024-12-15', end: '2025-01-20' };
    expect(
      moveCashFlowCalendarMonth({ month: '2024-12', offset: 1, ...range }),
    ).toBe('2025-01');
    expect(
      moveCashFlowCalendarMonth({ month: '2025-01', offset: -1, ...range }),
    ).toBe('2024-12');
    expect(
      moveCashFlowCalendarMonth({ month: '2025-01', offset: 1, ...range }),
    ).toBe('2025-01');
  });
  it('starts on the current month when it is in range and otherwise uses the nearest boundary', () => {
    expect(
      getInitialCashFlowCalendarMonth({
        start: '2024-01',
        end: '2024-12',
        currentMonth: '2024-06',
      }),
    ).toBe('2024-06');
    expect(
      getInitialCashFlowCalendarMonth({
        start: '2024-03',
        end: '2024-12',
        currentMonth: '2024-01',
      }),
    ).toBe('2024-03');
    expect(
      getInitialCashFlowCalendarMonth({
        start: '2024-01',
        end: '2024-09',
        currentMonth: '2024-12',
      }),
    ).toBe('2024-09');
  });

  it('moves one month at a time without leaving the forecast range', () => {
    const range = { start: '2024-03', end: '2024-05' };

    expect(
      moveCashFlowCalendarMonth({ month: '2024-04', offset: -1, ...range }),
    ).toBe('2024-03');
    expect(
      moveCashFlowCalendarMonth({ month: '2024-04', offset: 1, ...range }),
    ).toBe('2024-05');
    expect(
      moveCashFlowCalendarMonth({ month: '2024-03', offset: -1, ...range }),
    ).toBe('2024-03');
    expect(
      moveCashFlowCalendarMonth({ month: '2024-05', offset: 1, ...range }),
    ).toBe('2024-05');
  });
});
