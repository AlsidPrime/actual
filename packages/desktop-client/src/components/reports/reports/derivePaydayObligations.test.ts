import type { ForecastResult } from '@actual-app/core/types/models/forecast';
import { describe, expect, it } from 'vitest';

import type { PaydayChecklistResult } from './derivePaydayChecklist';
import { derivePaydayObligations } from './derivePaydayObligations';

const checklist: PaydayChecklistResult = {
  month: '2026-11',
  availableToBudget: 0,
  remainingTotal: 0,
  knownRemainingTotal: 0,
  isComplete: true,
  withoutRules: [{ categoryId: 'rent', categoryName: 'Rent' }],
  items: [
    {
      categoryId: 'utilities',
      categoryName: 'Utilities',
      priority: 1,
      target: 5000,
      allocated: 5000,
      remaining: 0,
      status: 'ready',
      coveredScheduleIds: ['covered'],
    },
  ],
};
const forecast: ForecastResult = {
  forecastStartDate: '2026-10-20',
  forecastEndDate: '2026-11-30',
  lowestBalance: {
    date: '2026-10-20',
    balance: 0,
    accountId: 'checking',
    accountName: 'Checking',
  },
  dataPoints: [
    {
      date: '2026-11-05',
      accountId: 'checking',
      accountName: 'Checking',
      balance: 0,
      transactions: [
        {
          scheduleId: 'covered',
          scheduleName: 'Utilities',
          amount: -5000,
          payee: 'Utilities',
        },
        {
          scheduleId: 'rent',
          scheduleName: 'Rent',
          amount: -100000,
          payee: 'Rent',
        },
        {
          scheduleId: 'transfer',
          scheduleName: 'Transfer',
          amount: -10000,
          isTransfer: true,
          payee: 'Transfer',
        },
      ],
    },
  ],
};

describe('payday scheduled obligation review', () => {
  it('omits an explicitly covered schedule and does not add expenses to targets', () => {
    expect(
      derivePaydayObligations({
        checklist,
        forecast,
        operatingAccountIds: ['checking'],
        today: '2026-10-20',
      }),
    ).toEqual([{ scheduleId: 'rent', name: 'Rent', date: '2026-11-05' }]);
    expect(checklist.knownRemainingTotal).toBe(0);
  });
});
