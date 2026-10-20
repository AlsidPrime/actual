import { send } from '@actual-app/core/platform/client/connection';
import type { CategoryEntity } from '@actual-app/core/types/models';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadPaydayChecklist } from './derivePaydayChecklist';

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(),
}));

const categories = [
  {
    id: 'rent',
    name: 'Rent',
    group: 'bills',
    is_income: false,
    hidden: false,
    tombstone: false,
    sort_order: 1,
  },
  {
    id: 'food',
    name: 'Food',
    group: 'bills',
    is_income: false,
    hidden: false,
    tombstone: false,
    sort_order: 2,
  },
] satisfies CategoryEntity[];

const fixed = {
  directive: 'template',
  type: 'simple',
  monthly: 20000,
  priority: 1,
};

beforeEach(() => {
  vi.mocked(send).mockReset();
});

describe('payday funding checklist', () => {
  it('uses native selected-month targets and allocations without a budget write', async () => {
    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'envelope-budget-month') {
        return [
          { name: 'budget202610!to-budget', value: 25000 },
          { name: 'budget202610!budget-rent', value: 5000 },
          { name: 'budget202610!budget-food', value: 10000 },
        ];
      }
      if (name === 'budget/get-category-automations') {
        return { [args]: [fixed] };
      }
      if (name === 'budget/dry-run-category-template') {
        return {
          budgeted: args.categoryId === 'rent' ? 20000 : 10000,
          perTemplate: [args.categoryId === 'rent' ? 20000 : 10000],
        };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });

    const result = await loadPaydayChecklist('2026-10', categories);
    expect(result.availableToBudget).toBe(25000);
    expect(result.remainingTotal).toBe(15000);
    expect(result.knownRemainingTotal).toBe(15000);
    expect(result.isComplete).toBe(true);
    expect(result.items.map(item => [item.categoryId, item.remaining])).toEqual(
      [
        ['food', 0],
        ['rent', 15000],
      ],
    );
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(
          ([name]) => name === 'budget/dry-run-category-template',
        )
        .map(([, args]) => args),
    ).toEqual([
      expect.objectContaining({ month: '2026-10', strict: true }),
      expect.objectContaining({ month: '2026-10', strict: true }),
    ]);
    expect(
      vi
        .mocked(send)
        .mock.calls.every(([name]) =>
          [
            'envelope-budget-month',
            'budget/get-category-automations',
            'budget/dry-run-category-template',
          ].includes(name),
        ),
    ).toBe(true);
  });

  it('keeps missing allocations and unsupported targets incomplete', async () => {
    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'envelope-budget-month') {
        return [{ name: 'to-budget', value: 0 }];
      }
      if (name === 'budget/get-category-automations') {
        return {
          [args]:
            args === 'rent'
              ? [fixed]
              : [{ directive: 'goal', type: 'goal', amount: 10000 }],
        };
      }
      if (name === 'budget/dry-run-category-template') {
        return { budgeted: 20000, perTemplate: [20000] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    const result = await loadPaydayChecklist('2026-10', categories);
    expect(result.availableToBudget).toBe(0);
    expect(result.remainingTotal).toBeNull();
    expect(result.knownRemainingTotal).toBeNull();
    expect(result.isComplete).toBe(false);
    expect(result.items.find(item => item.categoryId === 'rent')).toMatchObject(
      { allocated: null, remaining: null },
    );
    expect(result.items.find(item => item.categoryId === 'food')).toMatchObject(
      { status: 'goal-only', target: null },
    );
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(
          ([name]) => name === 'budget/dry-run-category-template',
        ),
    ).toHaveLength(1);
  });

  it('reports categories without rules separately from supported funding', async () => {
    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'envelope-budget-month') {
        return [
          { name: 'to-budget', value: 25000 },
          { name: 'budget-rent', value: 0 },
        ];
      }
      if (name === 'budget/get-category-automations') {
        return args === 'rent' ? { rent: [fixed] } : {};
      }
      if (name === 'budget/dry-run-category-template') {
        return { budgeted: 20000, perTemplate: [20000] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    const result = await loadPaydayChecklist('2026-10', categories);
    expect(result.knownRemainingTotal).toBe(20000);
    expect(result.withoutRules).toEqual([
      { categoryId: 'food', categoryName: 'Food' },
    ]);
  });

  it('does not interpret a missing Available to Budget cell or invalid native result as zero', async () => {
    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'envelope-budget-month') {
        return [{ name: 'budget-rent', value: 5000 }];
      }
      if (name === 'budget/get-category-automations') {
        return { [args]: [fixed] };
      }
      if (name === 'budget/dry-run-category-template') {
        return { budgeted: 0, perTemplate: [] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    const result = await loadPaydayChecklist('2026-10', categories.slice(0, 1));
    expect(result.availableToBudget).toBeNull();
    expect(result.remainingTotal).toBeNull();
    expect(result.items[0]).toMatchObject({
      status: 'unavailable',
      target: null,
      remaining: null,
    });
  });

  it('keeps a rejected strict dry run unavailable despite a known allocation', async () => {
    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'envelope-budget-month') {
        return [
          { name: 'to-budget', value: 10000 },
          { name: 'budget-rent', value: 5000 },
        ];
      }
      if (name === 'budget/get-category-automations') {
        return { [args]: [fixed] };
      }
      if (name === 'budget/dry-run-category-template') {
        throw new Error('Native formula failed');
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    const result = await loadPaydayChecklist('2026-10', categories.slice(0, 1));
    expect(result.availableToBudget).toBe(10000);
    expect(result.isComplete).toBe(false);
    expect(result.remainingTotal).toBeNull();
    expect(result.items[0]).toMatchObject({
      allocated: 5000,
      target: null,
      remaining: null,
      status: 'unavailable',
    });
  });
});
