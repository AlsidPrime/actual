import { send } from '@actual-app/core/platform/client/connection';
import type { Template } from '@actual-app/core/types/models/templates';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hasFixedSpendingPlan,
  loadAutomationBurnPlans,
} from './budgetBurnAutomation';

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(),
}));

const fixed: Template = {
  directive: 'template',
  type: 'periodic',
  amount: 1800,
  period: { period: 'month', amount: 1 },
  starting: '2024-04-01',
  priority: 1,
};

beforeEach(() => {
  vi.mocked(send).mockReset();
});

describe('native Budget Automation Burn plans', () => {
  it('accepts fixed native templates and rejects funding-dependent types', () => {
    expect(hasFixedSpendingPlan([fixed])).toBe(true);
    expect(
      hasFixedSpendingPlan([
        { directive: 'template', type: 'simple', monthly: 1800, priority: 1 },
      ]),
    ).toBe(true);
    expect(hasFixedSpendingPlan([])).toBe(false);
    expect(
      hasFixedSpendingPlan([
        { directive: 'template', type: 'refill', priority: 1 },
      ]),
    ).toBe(false);
    expect(
      hasFixedSpendingPlan([
        { ...fixed, limit: { amount: 2000, hold: false, period: 'monthly' } },
      ]),
    ).toBe(false);
    expect(
      hasFixedSpendingPlan([{ directive: 'goal', type: 'goal', amount: 1800 }]),
    ).toBe(false);
  });

  it('reads definitions once and native month-specific dry-runs without mutations', async () => {
    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'budget/get-category-automations') {
        return args === 'groceries' ? { groceries: [fixed] } : {};
      }
      if (name === 'budget/dry-run-category-template') {
        return {
          budgeted: args.month === '2024-04' ? 180000 : 190000,
          perTemplate: [args.month === '2024-04' ? 180000 : 190000],
        };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    await expect(
      loadAutomationBurnPlans(['groceries', 'fuel'], ['2024-04', '2024-05']),
    ).resolves.toEqual({
      '2024-04': { groceries: 180000 },
      '2024-05': { groceries: 190000 },
    });
    expect(vi.mocked(send).mock.calls.map(([name]) => name)).toEqual([
      'budget/get-category-automations',
      'budget/get-category-automations',
      'budget/dry-run-category-template',
      'budget/dry-run-category-template',
    ]);
  });

  it('makes one definition read and one dry-run per selected category and month', async () => {
    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'budget/get-category-automations') {
        return { [args]: [fixed] };
      }
      if (name === 'budget/dry-run-category-template') {
        return { budgeted: 180000, perTemplate: [180000] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    const categories = Array.from(
      { length: 6 },
      (_, index) => `category-${index}`,
    );
    const months = Array.from(
      { length: 12 },
      (_, index) => `2025-${String(index + 1).padStart(2, '0')}`,
    );
    const plans = await loadAutomationBurnPlans(categories, months);
    expect(Object.keys(plans)).toHaveLength(12);
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(
          ([name]) => name === 'budget/get-category-automations',
        ),
    ).toHaveLength(6);
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(
          ([name]) => name === 'budget/dry-run-category-template',
        ),
    ).toHaveLength(72);
  });

  it('leaves successful no-automation and unsupported definitions for funded fallback', async () => {
    vi.mocked(send).mockImplementation(async (name, categoryId) => {
      if (name === 'budget/get-category-automations') {
        return categoryId === 'groceries'
          ? { groceries: [] }
          : { fuel: [{ directive: 'template', type: 'refill', priority: 1 }] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    await expect(
      loadAutomationBurnPlans(['groceries', 'fuel'], ['2024-04']),
    ).resolves.toEqual({});
    expect(vi.mocked(send).mock.calls).toHaveLength(2);
  });

  it('rejects when definitions cannot be read', async () => {
    vi.mocked(send).mockRejectedValue(new Error('Definition read failed'));
    await expect(
      loadAutomationBurnPlans(['groceries'], ['2024-04']),
    ).rejects.toThrow('Definition read failed');
  });

  it('rejects when a fixed plan cannot be projected for a required month', async () => {
    vi.mocked(send).mockImplementation(async name => {
      if (name === 'budget/get-category-automations') {
        return { groceries: [fixed] };
      }
      throw new Error('Dry-run unavailable');
    });
    await expect(
      loadAutomationBurnPlans(['groceries'], ['2024-04']),
    ).rejects.toThrow('Dry-run unavailable');
  });

  it.each([NaN, -1])(
    'rejects an invalid fixed-plan projection of %s',
    async budgeted => {
      vi.mocked(send).mockImplementation(async name => {
        if (name === 'budget/get-category-automations') {
          return { groceries: [fixed] };
        }
        return { budgeted, perTemplate: [budgeted] };
      });
      await expect(
        loadAutomationBurnPlans(['groceries'], ['2024-04']),
      ).rejects.toThrow('Invalid Budget Automation projection');
    },
  );
});
