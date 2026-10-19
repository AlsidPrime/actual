import type { CategoryEntity } from '@actual-app/core/types/models';
import { describe, expect, it, vi } from 'vitest';

import { derivePaydayChecklist } from './derivePaydayChecklist';

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn((name: string, args?: any) => {
    if (name === 'budget/get-category-automations') {
      const categoryId = args;
      if (categoryId === 'c1') {
        return {
          c1: [
            {
              directive: 'template',
              type: 'simple',
              monthly: 200,
              priority: 1,
            },
          ],
        };
      }
      if (categoryId === 'c2') {
        return {
          c2: [
            {
              directive: 'template',
              type: 'simple',
              monthly: 150,
              priority: 2,
            },
          ],
        };
      }
      if (categoryId === 'c3') {
        return { c3: [] };
      }
      if (categoryId === 'c4') {
        return {
          c4: [{ directive: 'template', type: 'simple', monthly: 300 }],
        };
      }
      if (categoryId === 'c5') {
        return {
          c5: [{ directive: 'template', type: 'simple', monthly: 300 }],
        };
      }
    }
    if (name === 'budget/dry-run-category-template') {
      const { categoryId } = args;
      if (categoryId === 'c1') return { budgeted: 200 };
      if (categoryId === 'c2') return { budgeted: 150 };
      if (categoryId === 'c4') return { budgeted: 300 };
      if (categoryId === 'c5') throw new Error('Failed to run template');
    }
    return null;
  }),
}));

describe('derivePaydayChecklist', () => {
  it('derives requirements, groups by priority, and subtracts already budgeted amounts', async () => {
    const categories: CategoryEntity[] = [
      {
        id: 'c1',
        name: 'Cat 1',
        group: 'g1',
        is_income: false,
        hidden: false,
        tombstone: false,
        sort_order: 1,
      },
      {
        id: 'c2',
        name: 'Cat 2',
        group: 'g1',
        is_income: false,
        hidden: false,
        tombstone: false,
        sort_order: 2,
      },
      {
        id: 'c3',
        name: 'Cat 3 (No Template)',
        group: 'g1',
        is_income: false,
        hidden: false,
        tombstone: false,
        sort_order: 3,
      },
      {
        id: 'c4',
        name: 'Cat 4 (No Priority)',
        group: 'g1',
        is_income: false,
        hidden: false,
        tombstone: false,
        sort_order: 4,
      },
    ];

    const budgeted = {
      c1: 100, // Partial funding
      c2: 150, // Fully funded
      c3: 50, // No template, shouldn't appear
      c4: 0, // Unfunded
    };

    const getBudgeted = (id: string) => budgeted[id as keyof typeof budgeted];
    const getGroupName = () => 'Group 1';

    const result = await derivePaydayChecklist(
      '2024-11',
      categories,
      getBudgeted,
      500,
      getGroupName,
    );

    expect(result.month).toBe('2024-11');
    expect(result.availableToBudget).toBe(500);
    expect(result.totalRemainingRequirements).toBe(400); // c1 needs 100, c4 needs 300
    expect(result.isComplete).toBe(true);

    expect(result.items).toHaveLength(3); // c3 excluded

    // Priority 1 first
    expect(result.items[0].categoryId).toBe('c1');
    expect(result.items[0].remainingAmount).toBe(100);
    expect(result.items[0].status).toBe('needs-funding');

    // Priority 2 second
    expect(result.items[1].categoryId).toBe('c2');
    expect(result.items[1].remainingAmount).toBe(0);
    expect(result.items[1].status).toBe('funded');

    // No priority last
    expect(result.items[2].categoryId).toBe('c4');
    expect(result.items[2].remainingAmount).toBe(300);
    expect(result.items[2].status).toBe('needs-funding');
  });

  it('marks checklist incomplete when there is an unavailable template', async () => {
    const categories: CategoryEntity[] = [
      {
        id: 'c5',
        name: 'Cat 5',
        group: 'g1',
        is_income: false,
        hidden: false,
        tombstone: false,
        sort_order: 1,
      },
    ];
    const getBudgeted = (id: string) => 0;
    const getGroupName = () => 'Group 1';

    const result = await derivePaydayChecklist(
      '2024-11',
      categories,
      getBudgeted,
      500,
      getGroupName,
    );

    expect(result.isComplete).toBe(false);
    expect(result.items[0].status).toBe('unavailable');
  });
});
