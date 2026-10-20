import * as monthUtils from '@actual-app/core/shared/months';

import type { PaydayRunway } from './cashFlowPayday';
import type { PaydayChecklistResult } from './derivePaydayChecklist';

export type FundingMode = 'available' | 'payday-preview';

export type PaydayAllocationSuggestion = {
  categoryId: string;
  categoryName: string;
  priority: number;
  amount: number;
};

export type PaydayAllocationPlan = {
  status: 'ready' | 'partial' | 'unavailable';
  reason: 'budget' | 'payday' | 'month' | 'targets' | null;
  capacity: number | null;
  existingDeficit: number;
  deficitCovered: number;
  suggestions: PaydayAllocationSuggestion[];
  totalSuggested: number;
  unallocated: number | null;
  manualChoice: { priority: number; amount: number } | null;
};

function isCents(value: number | null | undefined): value is number {
  return value != null && Number.isSafeInteger(value);
}

/** Derive a read-only waterfall from the already loaded native checklist. */
export function derivePaydayAllocationSuggestions({
  checklist,
  mode,
  runway,
  today,
}: {
  checklist: PaydayChecklistResult;
  mode: FundingMode;
  runway: PaydayRunway | null;
  today: string;
}): PaydayAllocationPlan {
  const base: PaydayAllocationPlan = {
    status: 'unavailable',
    reason: null,
    capacity: null,
    existingDeficit: 0,
    deficitCovered: 0,
    suggestions: [],
    totalSuggested: 0,
    unallocated: null,
    manualChoice: null,
  };
  const available = checklist.availableToBudget;
  if (!isCents(available)) {
    return { ...base, reason: 'budget' };
  }
  const existingDeficit = Math.max(0, -available);
  if (mode === 'payday-preview') {
    if (
      !runway ||
      runway.isConfigurationIncomplete ||
      !runway.paydayDate ||
      runway.paydayDate <= today ||
      !isCents(runway.expectedIncome) ||
      runway.expectedIncome <= 0
    ) {
      return { ...base, reason: 'payday', existingDeficit };
    }
    // A prior-month payday may already be reflected in the selected month's
    // native Available to Budget. Do not count it a second time.
    if (
      runway.paydayDate.slice(0, 7) !== checklist.month ||
      runway.paydayDate > monthUtils.lastDayOfMonth(checklist.month)
    ) {
      return { ...base, reason: 'month', existingDeficit };
    }
  }
  const income = mode === 'payday-preview' ? runway?.expectedIncome : 0;
  if (!isCents(income) || !Number.isSafeInteger(available + income)) {
    return { ...base, reason: 'budget', existingDeficit };
  }
  const capacity = Math.max(0, available + income);
  const deficitCovered = Math.min(existingDeficit, income);
  const plan: PaydayAllocationPlan = {
    ...base,
    status: 'ready',
    capacity,
    existingDeficit,
    deficitCovered,
    unallocated: capacity,
  };
  if (checklist.items.length === 0) {
    return { ...plan, status: 'unavailable', reason: 'targets' };
  }

  // Unknown priority can precede every known target. A missing target at a
  // known priority blocks that group and everything below it.
  const unsupported = checklist.items.filter(
    item =>
      item.status !== 'ready' ||
      !isCents(item.target) ||
      item.target < 0 ||
      !isCents(item.allocated) ||
      !isCents(item.remaining) ||
      item.remaining < 0 ||
      item.remaining !== Math.max(0, item.target - item.allocated) ||
      !isCents(item.priority),
  );
  const unknownPriority = unsupported.some(item => !isCents(item.priority));
  const blockedPriority = unknownPriority
    ? -Infinity
    : Math.min(...unsupported.map(item => item.priority ?? Infinity));
  const eligible = checklist.items
    .filter(
      item =>
        !unsupported.includes(item) &&
        item.priority != null &&
        item.priority < blockedPriority &&
        item.remaining != null &&
        item.remaining > 0,
    )
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  if (unsupported.length > 0) {
    plan.status = 'partial';
  }
  let remainingPool = capacity;
  for (let index = 0; index < eligible.length && remainingPool > 0;) {
    const priority = eligible[index].priority;
    const group = eligible.filter(item => item.priority === priority);
    index += group.length;
    const groupNeed = group.reduce(
      (sum, item) => sum + (item.remaining ?? 0),
      0,
    );
    if (!Number.isSafeInteger(groupNeed)) {
      plan.status = 'partial';
      break;
    }
    if (group.length > 1 && groupNeed > remainingPool) {
      plan.manualChoice = { priority: priority ?? 0, amount: remainingPool };
      break;
    }
    for (const item of group) {
      const amount = Math.min(item.remaining ?? 0, remainingPool);
      if (amount > 0 && item.priority != null) {
        plan.suggestions.push({
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          priority: item.priority,
          amount,
        });
        plan.totalSuggested += amount;
        remainingPool -= amount;
      }
    }
  }
  plan.unallocated = remainingPool;
  return plan;
}
