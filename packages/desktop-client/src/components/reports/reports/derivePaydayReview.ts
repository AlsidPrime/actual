import type { PaydayRunway } from './cashFlowPayday';
import type { SweepAdvisorResult } from './cashFlowReserve';
import type { CashFlowRiskResult } from './cashFlowRisk';
import type { SinkingSavingsPlan } from './cashFlowSavingsPlan';

export type PaydayReviewAction =
  | 'hold'
  | 'setup'
  | 'budget'
  | 'transfer'
  | 'none';

export type PaydayReviewReason =
  | 'current-cash'
  | 'projected-cash'
  | 'setup'
  | 'unavailable'
  | 'planning-gap'
  | 'actual-cash'
  | 'transfer'
  | 'none';

export type PaydayReview = {
  action: PaydayReviewAction;
  reason: PaydayReviewReason;
};

export function derivePaydayReview({
  runway,
  risk,
  savingsPlan,
  advisor,
  currentOperatingCash,
  safetyBuffer,
  hasOperatingAccounts,
  hasReserveAccounts,
  hasPaydaySelection,
  hasReserveCategories,
  isEnvelope,
}: {
  runway: PaydayRunway | null;
  risk: CashFlowRiskResult | null;
  savingsPlan: SinkingSavingsPlan | null;
  advisor: SweepAdvisorResult | null;
  currentOperatingCash: number | null;
  safetyBuffer: number;
  hasOperatingAccounts: boolean;
  hasReserveAccounts: boolean;
  hasPaydaySelection: boolean;
  hasReserveCategories: boolean;
  isEnvelope: boolean;
}): PaydayReview {
  if (
    currentOperatingCash != null &&
    Number.isFinite(currentOperatingCash) &&
    currentOperatingCash < safetyBuffer
  ) {
    return { action: 'hold', reason: 'current-cash' };
  }
  if (
    risk?.firstNegativeDate != null ||
    risk?.firstBelowBufferDate != null ||
    runway?.status === 'negative' ||
    runway?.status === 'low' ||
    advisor?.status === 'danger' ||
    advisor?.status === 'hold'
  ) {
    return { action: 'hold', reason: 'projected-cash' };
  }
  if (
    !hasOperatingAccounts ||
    !hasReserveAccounts ||
    !hasPaydaySelection ||
    !hasReserveCategories ||
    !isEnvelope ||
    runway?.status === 'setup' ||
    runway?.isConfigurationIncomplete ||
    savingsPlan?.status === 'setup' ||
    advisor?.status === 'setup'
  ) {
    return { action: 'setup', reason: 'setup' };
  }
  if (
    currentOperatingCash == null ||
    !Number.isFinite(currentOperatingCash) ||
    !runway ||
    runway.status !== 'safe' ||
    !risk ||
    risk.coverage !== 'complete' ||
    !savingsPlan ||
    savingsPlan.status !== 'ready' ||
    !advisor ||
    advisor.status === 'incomplete'
  ) {
    return { action: 'hold', reason: 'unavailable' };
  }
  if (savingsPlan.planningGap != null && savingsPlan.planningGap > 0) {
    return { action: 'budget', reason: 'planning-gap' };
  }
  if (advisor.status === 'safe' && advisor.safeToMove > 0) {
    if (currentOperatingCash < advisor.safeToMove + safetyBuffer) {
      return { action: 'hold', reason: 'actual-cash' };
    }
    return { action: 'transfer', reason: 'transfer' };
  }
  return { action: 'none', reason: 'none' };
}
