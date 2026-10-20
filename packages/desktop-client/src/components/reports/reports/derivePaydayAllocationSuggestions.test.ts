import { describe, expect, it } from 'vitest';

import type { PaydayRunway } from './cashFlowPayday';
import { derivePaydayAllocationSuggestions } from './derivePaydayAllocationSuggestions';
import type { FundingMode } from './derivePaydayAllocationSuggestions';
import type {
  PaydayChecklistItem,
  PaydayChecklistResult,
} from './derivePaydayChecklist';

const today = '2026-10-20';
const item = (
  categoryId: string,
  priority: number | null,
  target: number | null,
  allocated = 0,
  status: PaydayChecklistItem['status'] = 'ready',
): PaydayChecklistItem => ({
  categoryId,
  categoryName: categoryId,
  priority,
  target,
  allocated,
  remaining: target == null ? null : Math.max(0, target - allocated),
  status,
});
const checklist = (
  availableToBudget: number | null,
  items: PaydayChecklistItem[],
  month = '2026-10',
): PaydayChecklistResult => ({
  month,
  availableToBudget,
  remainingTotal: null,
  knownRemainingTotal: null,
  isComplete: false,
  items,
  withoutRules: [],
});
const runway = {
  paydayDate: '2026-10-25',
  expectedIncome: 100000,
  budgetableIncome: 100000,
  isConfigurationIncomplete: false,
} satisfies Pick<
  PaydayRunway,
  | 'paydayDate'
  | 'expectedIncome'
  | 'budgetableIncome'
  | 'isConfigurationIncomplete'
>;
function plan(
  budget: PaydayChecklistResult,
  mode: FundingMode = 'available',
  income: PaydayRunway | null = null,
) {
  return derivePaydayAllocationSuggestions({
    checklist: budget,
    mode,
    runway: income,
    today,
  });
}

describe('payday allocation suggestions', () => {
  it('distributes integer cents by native priority without exceeding unmet targets', () => {
    const result = plan(
      checklist(25000, [
        item('later', 2, 20000),
        item('first', 1, 15000, 5000),
        item('already funded', 1, 5000, 5000),
      ]),
    );
    expect(
      result.suggestions.map(({ categoryId, amount }) => [categoryId, amount]),
    ).toEqual([
      ['first', 10000],
      ['later', 15000],
    ]);
    expect(result.totalSuggested).toBe(25000);
    expect(result.unallocated).toBe(0);
  });

  it('does not recommend immediate funding from a negative budget', () => {
    const result = plan(checklist(-30000, [item('first', 1, 50000)]));
    expect(result.existingDeficit).toBe(30000);
    expect(result.capacity).toBe(0);
    expect(result.suggestions).toEqual([]);
  });

  it('covers a deficit before hypothetical funding', () => {
    const result = plan(
      checklist(-30000, [item('first', 1, 90000)]),
      'payday-preview',
      runway as PaydayRunway,
    );
    expect(result.deficitCovered).toBe(30000);
    expect(result.capacity).toBe(70000);
    expect(result.suggestions[0].amount).toBe(70000);
  });

  it('offers no funding when payday income is smaller than the deficit', () => {
    const result = plan(
      checklist(-120000, [item('first', 1, 50000)]),
      'payday-preview',
      runway as PaydayRunway,
    );
    expect(result.deficitCovered).toBe(100000);
    expect(result.capacity).toBe(0);
    expect(result.suggestions).toEqual([]);
  });

  it('pauses at an underfunded equal-priority group', () => {
    const result = plan(
      checklist(10000, [
        item('first', 1, 2000),
        item('choice a', 2, 8000),
        item('choice b', 2, 8000),
        item('later', 3, 5000),
      ]),
    );
    expect(result.suggestions.map(({ categoryId }) => categoryId)).toEqual([
      'first',
    ]);
    expect(result.manualChoice).toMatchObject({
      priority: 2,
      pool: 8000,
      remainingPool: 8000,
    });
    expect(result.unallocated).toBe(8000);
  });

  it('keeps valid targets usable beside a Goal-only rule', () => {
    const result = plan(
      checklist(20000, [
        item('clothing', null, null, 0, 'goal-only'),
        item('sinking fund', 1, 10000),
      ]),
    );
    expect(result.status).toBe('partial');
    expect(result.suggestions).toMatchObject([
      { categoryId: 'sinking fund', amount: 10000 },
    ]);
    expect(result.unresolved.map(item => item.categoryId)).toEqual([
      'clothing',
    ]);
  });

  it('marks unsupported requirements partial and does not claim the pool as surplus', () => {
    const result = plan(
      checklist(20000, [
        item('first', 1, 5000),
        item('unknown', 2, null, 0, 'unsupported'),
        item('later', 3, 10000),
      ]),
    );
    expect(result.status).toBe('partial');
    expect(result.suggestions.map(({ categoryId }) => categoryId)).toEqual([
      'first',
    ]);
    expect(result.unallocated).toBe(15000);
    expect(plan(checklist(null, [item('first', 1, 1000)])).status).toBe(
      'unavailable',
    );
  });

  it('pauses lower priorities after an unavailable known priority', () => {
    const result = plan(
      checklist(20000, [
        item('unavailable', 1, null, 0, 'unavailable'),
        item('later', 2, 10000),
      ]),
    );
    expect(result.blockedPriority).toBe(1);
    expect(result.suggestions).toEqual([]);
    expect(result.status).toBe('partial');
  });

  it('accepts a bounded what-if split without advancing lower priorities', () => {
    const budget = checklist(10000, [
      item('first', 1, 2000),
      item('choice a', 2, 8000),
      item('choice b', 2, 8000),
      item('later', 3, 5000),
    ]);
    const result = derivePaydayAllocationSuggestions({
      checklist: budget,
      mode: 'available',
      runway: null,
      today,
      choices: { 'choice a': 3000, 'choice b': 4000 },
    });
    expect(
      result.suggestions.map(item => [item.categoryId, item.amount]),
    ).toEqual([
      ['first', 2000],
      ['choice a', 3000],
      ['choice b', 4000],
    ]);
    expect(result.manualChoice?.remainingPool).toBe(1000);
    expect(result.totalSuggested).toBe(9000);
    expect(result.unallocated).toBe(1000);
    const invalid = derivePaydayAllocationSuggestions({
      checklist: budget,
      mode: 'available',
      runway: null,
      today,
      choices: { 'choice a': 9000 },
    });
    expect(invalid.manualChoice?.error).toBe('exceeds');
    expect(invalid.totalSuggested).toBe(2000);
  });

  it('keeps preview separate and carries one unposted payday into the next month', () => {
    const budget = checklist(5000, [item('first', 1, 200000)]);
    expect(plan(budget).capacity).toBe(5000);
    expect(
      plan(budget, 'payday-preview', runway as PaydayRunway).capacity,
    ).toBe(105000);
    expect(
      plan(
        checklist(5000, budget.items, '2026-11'),
        'payday-preview',
        runway as PaydayRunway,
      ).capacity,
    ).toBe(105000);
    expect(
      plan(
        checklist(5000, budget.items, '2026-09'),
        'payday-preview',
        runway as PaydayRunway,
      ).reason,
    ).toBe('month');
  });

  it('uses the selected next-month native deficit once before cross-month funding', () => {
    const result = plan(
      checklist(-30000, [item('sinking', 1, 90000)], '2026-11'),
      'payday-preview',
      runway as PaydayRunway,
    );
    expect(result.existingDeficit).toBe(30000);
    expect(result.deficitCovered).toBe(30000);
    expect(result.capacity).toBe(70000);
  });

  it('does not add a posted payday again or turn off-budget income into capacity', () => {
    const budget = checklist(100000, [item('sinking', 1, 120000)]);
    expect(plan(budget).capacity).toBe(100000);
    expect(plan(budget, 'payday-preview').reason).toBe('payday');
    expect(
      plan(budget, 'payday-preview', {
        ...runway,
        budgetableIncome: 0,
      } as PaydayRunway).reason,
    ).toBe('account');
  });
});
