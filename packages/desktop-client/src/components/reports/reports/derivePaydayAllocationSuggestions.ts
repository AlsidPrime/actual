import * as monthUtils from '@actual-app/core/shared/months';

import type { PaydayRunway } from './cashFlowPayday';
import type {
  PaydayChecklistItem,
  PaydayChecklistResult,
} from './derivePaydayChecklist';
import type { PaydayIncomeBudget } from './paydayIncomeBudget';

export type FundingMode = 'available' | 'payday-preview';
export type WhatIfChoices = Readonly<Record<string, number>>;

export type PaydayAllocationSuggestion = {
  categoryId: string;
  categoryName: string;
  priority: number;
  amount: number;
};

export type PaydayAllocationPlan = {
  status: 'ready' | 'partial' | 'unavailable';
  reason:
    | 'budget'
    | 'payday'
    | 'month'
    | 'account'
    | 'income'
    | 'held'
    | 'targets'
    | null;
  capacity: number | null;
  previewIncome: number | null;
  deferredIncome: number;
  existingDeficit: number;
  deficitCovered: number;
  suggestions: PaydayAllocationSuggestion[];
  totalSuggested: number;
  unallocated: number | null;
  manualChoice: {
    priority: number;
    pool: number;
    remainingPool: number;
    categories: Array<{
      categoryId: string;
      categoryName: string;
      remaining: number;
    }>;
    error: 'invalid' | 'exceeds' | null;
  } | null;
  unresolved: PaydayChecklistItem[];
  blockedPriority: number | null;
};

function isCents(value: number | null | undefined): value is number {
  return value != null && Number.isSafeInteger(value);
}

function isReady(item: PaydayChecklistItem): boolean {
  return (
    item.status === 'ready' &&
    isCents(item.priority) &&
    isCents(item.target) &&
    item.target >= 0 &&
    isCents(item.allocated) &&
    isCents(item.remaining) &&
    item.remaining >= 0 &&
    item.remaining === Math.max(0, item.target - item.allocated)
  );
}

/** Native selected-month to-budget already includes prior-month budget carry. */
export function derivePaydayAllocationSuggestions({
  checklist,
  mode,
  runway,
  incomeBudget,
  today,
  choices = {},
}: {
  checklist: PaydayChecklistResult;
  mode: FundingMode;
  runway: PaydayRunway | null;
  incomeBudget: PaydayIncomeBudget | null;
  today: string;
  choices?: WhatIfChoices;
}): PaydayAllocationPlan {
  const base: PaydayAllocationPlan = {
    status: 'unavailable',
    reason: null,
    capacity: null,
    previewIncome: null,
    deferredIncome: 0,
    existingDeficit: 0,
    deficitCovered: 0,
    suggestions: [],
    totalSuggested: 0,
    unallocated: null,
    manualChoice: null,
    unresolved: [],
    blockedPriority: null,
  };
  const available = checklist.availableToBudget;
  if (!isCents(available)) {
    return { ...base, reason: 'budget' };
  }
  const existingDeficit = Math.max(0, -available);
  let previewIncome = 0;
  let deferredIncome = 0;
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
    const paydayMonth = runway.paydayDate.slice(0, 7);
    if (
      runway.paydayDate > monthUtils.lastDayOfMonth(checklist.month) ||
      (checklist.month !== paydayMonth &&
        checklist.month !== monthUtils.addMonths(paydayMonth, 1))
    ) {
      return { ...base, reason: 'month', existingDeficit };
    }
    if (
      !isCents(runway.budgetableIncome) ||
      runway.budgetableIncome <= 0 ||
      runway.budgetableIncome > runway.expectedIncome
    ) {
      return { ...base, reason: 'account', existingDeficit };
    }
    if (
      incomeBudget?.month !== paydayMonth ||
      !isCents(incomeBudget.manualBuffered) ||
      incomeBudget.manualBuffered < 0 ||
      !runway.budgetableDeposits ||
      runway.budgetableDeposits.length === 0
    ) {
      return { ...base, reason: 'income', existingDeficit };
    }
    let totalDeposits = 0;
    for (const deposit of runway.budgetableDeposits) {
      if (
        !isCents(deposit.amount) ||
        deposit.amount <= 0 ||
        !deposit.categoryId ||
        !Object.hasOwn(incomeBudget.incomeCategoryHold, deposit.categoryId) ||
        typeof incomeBudget.incomeCategoryHold[deposit.categoryId] !== 'boolean'
      ) {
        return { ...base, reason: 'income', existingDeficit };
      }
      totalDeposits += deposit.amount;
      if (
        checklist.month === paydayMonth &&
        incomeBudget.manualBuffered === 0 &&
        incomeBudget.incomeCategoryHold[deposit.categoryId]
      ) {
        deferredIncome += deposit.amount;
      } else {
        previewIncome += deposit.amount;
      }
    }
    if (
      !isCents(totalDeposits) ||
      totalDeposits !== runway.budgetableIncome ||
      !isCents(previewIncome)
    ) {
      return { ...base, reason: 'income', existingDeficit };
    }
    if (previewIncome === 0) {
      return { ...base, reason: 'held', existingDeficit };
    }
  }
  const income = previewIncome;
  if (!isCents(income) || !Number.isSafeInteger(available + income)) {
    return { ...base, reason: 'budget', existingDeficit };
  }
  const capacity = Math.max(0, available + income);
  const deficitCovered = Math.min(existingDeficit, income);
  const plan: PaydayAllocationPlan = {
    ...base,
    status: 'ready',
    capacity,
    previewIncome: mode === 'payday-preview' ? income : null,
    deferredIncome,
    existingDeficit,
    deficitCovered,
    unallocated: capacity,
  };
  if (checklist.items.length === 0) {
    return { ...plan, status: 'unavailable', reason: 'targets' };
  }

  const unresolved = checklist.items.filter(item => !isReady(item));
  plan.unresolved = unresolved;
  if (unresolved.length > 0 || checklist.withoutRules.length > 0) {
    plan.status = 'partial';
  }
  // A known unsupported priority blocks lower-ranked suggestions. Goal-only
  // and unprioritized rules have no usable monthly rank, so disclose them
  // without suppressing every valid target.
  const blockedPriority = Math.min(
    ...unresolved
      .filter(
        item =>
          (item.status === 'unsupported' || item.status === 'unavailable') &&
          isCents(item.priority),
      )
      .map(item => item.priority ?? Infinity),
  );
  plan.blockedPriority = Number.isFinite(blockedPriority)
    ? blockedPriority
    : null;
  const eligible = checklist.items
    .filter(
      item =>
        isReady(item) &&
        item.priority != null &&
        item.priority < blockedPriority &&
        item.remaining != null &&
        item.remaining > 0,
    )
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
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
      const groupIds = new Set(group.map(item => item.categoryId));
      const invalidKey = Object.keys(choices).some(id => !groupIds.has(id));
      const invalidAmount = group.some(item => {
        const amount = choices[item.categoryId] ?? 0;
        return !isCents(amount) || amount < 0;
      });
      const exceedsTarget = group.some(
        item => (choices[item.categoryId] ?? 0) > (item.remaining ?? 0),
      );
      const chosenTotal = group.reduce(
        (sum, item) => sum + (choices[item.categoryId] ?? 0),
        0,
      );
      const error =
        invalidKey || invalidAmount
          ? 'invalid'
          : exceedsTarget ||
              !isCents(chosenTotal) ||
              chosenTotal > remainingPool
            ? 'exceeds'
            : null;
      if (error || chosenTotal < remainingPool) {
        plan.status = 'partial';
      }
      plan.manualChoice = {
        priority: priority ?? 0,
        pool: remainingPool,
        remainingPool: error ? remainingPool : remainingPool - chosenTotal,
        categories: group.map(item => ({
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          remaining: item.remaining ?? 0,
        })),
        error,
      };
      if (!error) {
        for (const item of group) {
          const amount = choices[item.categoryId] ?? 0;
          if (amount > 0 && item.priority != null) {
            plan.suggestions.push({
              categoryId: item.categoryId,
              categoryName: item.categoryName,
              priority: item.priority,
              amount,
            });
          }
        }
        remainingPool -= chosenTotal;
        plan.totalSuggested += chosenTotal;
      }
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
