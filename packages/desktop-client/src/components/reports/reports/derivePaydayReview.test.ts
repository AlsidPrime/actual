import { describe, expect, it } from 'vitest';

import type { PaydayRunway } from './cashFlowPayday';
import type { SweepAdvisorResult } from './cashFlowReserve';
import type { CashFlowRiskResult } from './cashFlowRisk';
import type { SinkingSavingsPlan } from './cashFlowSavingsPlan';
import { derivePaydayReview } from './derivePaydayReview';

const runway: PaydayRunway = {
  status: 'safe',
  isConfigurationIncomplete: false,
  isScheduledOnly: false,
  currentCashWarning: null,
  paydayDate: '2026-11-06',
  daysUntilPayday: 5,
  scheduleNames: ['Payday'],
  expectedIncome: 200000,
  budgetableIncome: 200000,
  currentCash: 100000,
  todayClosingCash: 100000,
  lowestCash: 100000,
  lowestDate: '2026-11-01',
  firstNegativeDate: null,
  firstNegativeCash: null,
  paydayClosingCash: 300000,
};
const risk: CashFlowRiskResult = {
  status: 'safe',
  coverage: 'complete',
  firstNegativeDate: null,
  firstNegativeBalance: null,
  firstBelowBufferDate: null,
  firstBelowBufferBalance: null,
  safetyBuffer: 20000,
  lowestBalance: 100000,
  lowestBalanceDate: '2026-11-01',
  nextOperatingInflow: null,
};
const savingsPlan: SinkingSavingsPlan = {
  month: '2026-11',
  status: 'ready',
  categories: [],
  plannedTotal: 30000,
  monthlyAllocationTotal: 30000,
  currentEnvelopeTotal: 30000,
  planningGap: 0,
  physicalCash: 10000,
};
const advisor: SweepAdvisorResult = {
  status: 'safe',
  protectedTarget: 30000,
  reserveAccountBalance: 10000,
  reserveFundingGap: 20000,
  scheduledReserveFunding: 0,
  effectiveReserveFundingGap: 20000,
  minimumOperatingCash: 100000,
  availableOperatingHeadroom: 80000,
  safeToMove: 20000,
};
const ready = {
  runway,
  risk,
  savingsPlan,
  advisor,
  currentOperatingCash: 100000,
  safetyBuffer: 20000,
  hasOperatingAccounts: true,
  hasReserveAccounts: true,
  hasPaydaySelection: true,
  hasReserveCategories: true,
  isEnvelope: true,
};

describe('derivePaydayReview', () => {
  it('holds cash when a negative Operating projection overrides sweep advice', () => {
    expect(
      derivePaydayReview({
        ...ready,
        risk: {
          ...risk,
          status: 'warning',
          firstNegativeDate: '2026-11-04',
          firstNegativeBalance: -5000,
        },
      }),
    ).toEqual({ action: 'hold', reason: 'projected-cash' });
  });

  it('prompts setup when the payday selection is missing', () => {
    expect(derivePaydayReview({ ...ready, hasPaydaySelection: false })).toEqual(
      { action: 'setup', reason: 'setup' },
    );
  });

  it('reviews November budget funding when planned contributions have no allocation', () => {
    expect(
      derivePaydayReview({
        ...ready,
        savingsPlan: {
          ...savingsPlan,
          monthlyAllocationTotal: 0,
          planningGap: 30000,
        },
      }),
    ).toEqual({ action: 'budget', reason: 'planning-gap' });
  });

  it('holds when Budget Burn or savings information is incomplete', () => {
    expect(
      derivePaydayReview({
        ...ready,
        risk: { ...risk, coverage: 'incomplete', status: 'incomplete' },
      }).action,
    ).toBe('hold');
    expect(
      derivePaydayReview({
        ...ready,
        savingsPlan: { ...savingsPlan, status: 'incomplete' },
      }).action,
    ).toBe('hold');
  });

  it('reviews a transfer only with funded envelopes and positive safe headroom', () => {
    expect(derivePaydayReview(ready)).toEqual({
      action: 'transfer',
      reason: 'transfer',
    });
  });

  it('holds when actual cash cannot cover Sweep headroom plus the buffer', () => {
    expect(
      derivePaydayReview({ ...ready, currentOperatingCash: 30000 }),
    ).toEqual({ action: 'hold', reason: 'actual-cash' });
  });
});
