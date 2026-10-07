import type {
  ForecastDataPoint,
  ForecastResult,
  ForecastTransaction,
} from '@actual-app/core/types/models/forecast';
import { describe, expect, it } from 'vitest';

import type { BudgetBurnProjection } from './budgetBurn';
import { buildCashFlowCalendarData } from './cashFlowCalendarData';
import { calculateCashFlowRisk } from './cashFlowRisk';

const today = '2024-10-30';
const endDate = '2024-11-03';

function transaction(
  amount: number,
  scheduleId: string,
  isTransfer = false,
): ForecastTransaction {
  return {
    amount,
    scheduleId,
    scheduleName: scheduleId,
    payee: scheduleId,
    isTransfer,
  };
}

function point(
  date: string,
  accountId: string,
  balance: number,
  transactions: ForecastTransaction[] = [],
): ForecastDataPoint {
  return { date, accountId, accountName: accountId, balance, transactions };
}

function forecast(dataPoints: ForecastDataPoint[]): ForecastResult {
  return {
    dataPoints,
    lowestBalance: {
      date: today,
      balance: 0,
      accountId: '',
      accountName: '',
    },
    forecastStartDate: today,
    forecastEndDate: endDate,
  };
}

function burn(
  days: { date: string; dailyBurn: number; cumulativeBurn: number }[],
): BudgetBurnProjection {
  return {
    totalBurn: days.at(-1)?.cumulativeBurn ?? 0,
    categories: [],
    months: [],
    days: days.map(day => ({
      ...day,
      monthlyCumulativeBurn: day.dailyBurn,
      remainingBurn: 0,
      categories: [],
    })),
  };
}

function risk(
  forecastData: ForecastResult | null,
  overrides: Partial<Parameters<typeof calculateCashFlowRisk>[0]> = {},
) {
  return calculateCashFlowRisk({
    forecastData,
    budgetBurn: null,
    accountIds: ['checking', 'savings'],
    operatingAccountIds: ['checking'],
    today,
    endDate,
    ...overrides,
  });
}

describe('Cash Flow risk', () => {
  it('returns safe with the lowest adjusted cash when no date is negative', () => {
    expect(
      risk(
        forecast([
          point(today, 'checking', 500),
          point(today, 'savings', 100),
          point('2024-10-31', 'checking', 400),
          point('2024-10-31', 'savings', 100),
        ]),
      ),
    ).toMatchObject({
      status: 'safe',
      firstNegativeDate: null,
      firstNegativeBalance: null,
      lowestBalance: 500,
      lowestBalanceDate: '2024-10-31',
    });
  });

  it('marks negative cash today as danger even if a later day is lower', () => {
    expect(
      risk(
        forecast([
          point(today, 'checking', -10),
          point('2024-10-31', 'checking', -50),
        ]),
      ),
    ).toMatchObject({
      status: 'danger',
      firstNegativeDate: today,
      firstNegativeBalance: -10,
      lowestBalance: -50,
      lowestBalanceDate: '2024-10-31',
    });
  });

  it('warns on the first future negative date and tracks a later low', () => {
    expect(
      risk(
        forecast([
          point(today, 'checking', 100),
          point('2024-10-31', 'checking', -20),
          point('2024-11-01', 'checking', -40),
          point('2024-11-02', 'checking', -5),
        ]),
      ),
    ).toMatchObject({
      status: 'warning',
      firstNegativeDate: '2024-10-31',
      firstNegativeBalance: -20,
      lowestBalance: -40,
      lowestBalanceDate: '2024-11-01',
    });
  });

  it('uses continuous Budget Burn across October and November, matching the Calendar', () => {
    const forecastData = forecast([
      point(today, 'checking', 150),
      point('2024-10-31', 'checking', 150),
      point('2024-11-01', 'checking', 150),
    ]);
    const budgetBurn = burn([
      { date: today, dailyBurn: 40, cumulativeBurn: 40 },
      { date: '2024-10-31', dailyBurn: 40, cumulativeBurn: 80 },
      { date: '2024-11-01', dailyBurn: 100, cumulativeBurn: 180 },
    ]);
    const summary = risk(forecastData, { budgetBurn });
    const calendar = buildCashFlowCalendarData({
      forecastData,
      budgetBurn,
      start: '2024-10',
      end: '2024-11',
    });
    expect(summary).toMatchObject({
      status: 'warning',
      firstNegativeDate: '2024-11-01',
      firstNegativeBalance: -30,
      lowestBalance: -30,
      lowestBalanceDate: '2024-11-01',
    });
    expect(
      calendar[1].days.find(day => day.date === '2024-11-01')
        ?.adjustedCombinedBalance,
    ).toBe(summary?.firstNegativeBalance);
  });

  it('lets scheduled income improve later combined cash without hiding an earlier low', () => {
    expect(
      risk(
        forecast([
          point(today, 'checking', 500),
          point('2024-10-31', 'checking', 100),
          point('2024-11-01', 'checking', 600, [transaction(500, 'payday')]),
        ]),
      ),
    ).toMatchObject({
      status: 'safe',
      lowestBalance: 100,
      lowestBalanceDate: '2024-10-31',
      nextOperatingInflow: { date: '2024-11-01', amount: 500 },
    });
  });

  it('does not mistake a transfer between selected accounts for household risk or income', () => {
    expect(
      risk(
        forecast([
          point(today, 'checking', 500),
          point(today, 'savings', 500),
          point('2024-10-31', 'checking', -100, [
            transaction(-600, 'transfer', true),
          ]),
          point('2024-10-31', 'savings', 1100, [
            transaction(600, 'transfer', true),
          ]),
        ]),
      ),
    ).toMatchObject({
      status: 'safe',
      lowestBalance: 1000,
      nextOperatingInflow: null,
    });
  });

  it('ignores transfer and Reserve income, then sums same-day Operating income', () => {
    expect(
      risk(
        forecast([
          point(today, 'checking', 300),
          point('2024-10-31', 'checking', 300, [
            transaction(1000, 'transfer', true),
          ]),
          point('2024-11-01', 'savings', 500, [
            transaction(200, 'reserve-income'),
          ]),
          point('2024-11-02', 'checking', 800, [
            transaction(200, 'income-a'),
            transaction(300, 'income-b'),
            transaction(-20, 'bill'),
          ]),
          point('2024-11-03', 'checking', 900, [
            transaction(100, 'later-income'),
          ]),
        ]),
      ),
    ).toMatchObject({
      nextOperatingInflow: { date: '2024-11-02', amount: 500 },
    });
  });

  it('has no next Operating inflow without qualifying future income', () => {
    expect(
      risk(
        forecast([
          point(today, 'checking', 300, [transaction(500, 'today-income')]),
          point('2024-10-31', 'checking', 250, [
            transaction(200, 'transfer', true),
          ]),
          point('2024-11-01', 'savings', 100, [
            transaction(100, 'reserve-income'),
          ]),
        ]),
      ),
    ).toMatchObject({ nextOperatingInflow: null });
  });

  it('uses native combined cash in Tracking mode without Budget Burn', () => {
    expect(
      risk(
        forecast([
          point(today, 'checking', 50),
          point('2024-11-01', 'checking', 25),
        ]),
        { budgetBurn: null },
      ),
    ).toMatchObject({ status: 'safe', lowestBalance: 25 });
  });

  it('returns no risk summary without a selected forecast balance', () => {
    expect(risk(null)).toBeNull();
    expect(risk(forecast([point(today, 'unselected', -50)]))).toBeNull();
  });
});
