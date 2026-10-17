import type { ForecastResult } from '@actual-app/core/types/models/forecast';
import { describe, expect, it } from 'vitest';

import { deriveScheduledDebtPayments } from './cashFlowDebt';

function forecast(
  transfers: Array<{
    accountId: string;
    accountName: string;
    amount: number;
    isTransfer?: boolean;
    scheduleId?: string;
  }>,
): ForecastResult {
  return {
    forecastStartDate: '2026-10-17',
    forecastEndDate: '2026-10-30',
    lowestBalance: {
      date: '2026-10-17',
      balance: 0,
      accountId: 'checking',
      accountName: 'Checking',
    },
    dataPoints: transfers.map(tx => ({
      date: '2026-10-25',
      balance: 0,
      accountId: tx.accountId,
      accountName: tx.accountName,
      transactions: [
        {
          amount: tx.amount,
          isTransfer: tx.isTransfer,
          scheduleId: tx.scheduleId ?? 'payment',
          scheduleName: 'Card payment',
          payee: null,
        },
      ],
    })),
  };
}

function calculate(transfers: Parameters<typeof forecast>[0]) {
  return deriveScheduledDebtPayments({
    forecastData: forecast(transfers),
    operatingAccountIds: ['checking'],
    debtAccountIds: ['card'],
    today: '2026-10-17',
    endDate: '2026-10-30',
  });
}

describe('scheduled debt service', () => {
  it('shows a unique matching Operating-to-debt transfer once', () => {
    expect(
      calculate([
        {
          accountId: 'card',
          accountName: 'Card',
          amount: 10000,
          isTransfer: true,
        },
        {
          accountId: 'checking',
          accountName: 'Checking',
          amount: -10000,
          isTransfer: true,
        },
      ]),
    ).toEqual([
      {
        date: '2026-10-25',
        scheduleId: 'payment',
        scheduleName: 'Card payment',
        operatingAccountName: 'Checking',
        debtAccountName: 'Card',
        amount: 10000,
      },
    ]);
  });

  it('does not mistake ordinary spending, unmatched transfers, or savings for debt service', () => {
    expect(
      calculate([
        {
          accountId: 'checking',
          accountName: 'Checking',
          amount: -10000,
          isTransfer: false,
        },
      ]),
    ).toEqual([]);
    expect(
      calculate([
        {
          accountId: 'checking',
          accountName: 'Checking',
          amount: -10000,
          isTransfer: true,
        },
        {
          accountId: 'savings',
          accountName: 'Savings',
          amount: 10000,
          isTransfer: true,
        },
      ]),
    ).toEqual([]);
    expect(
      calculate([
        {
          accountId: 'checking',
          accountName: 'Checking',
          amount: -10000,
          isTransfer: true,
        },
        {
          accountId: 'card',
          accountName: 'Card',
          amount: 9000,
          isTransfer: true,
        },
      ]),
    ).toEqual([]);
  });
});
