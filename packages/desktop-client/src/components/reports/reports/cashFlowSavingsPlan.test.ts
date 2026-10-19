import { send } from '@actual-app/core/platform/client/connection';
import type { Template } from '@actual-app/core/types/models/templates';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildSinkingSavingsPlan,
  loadSinkingAutomationPlans,
} from './cashFlowSavingsPlan';

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(),
}));

const october = '2026-10';
const november = '2026-11';
const templates: Record<string, Template[]> = {
  christmas: [
    {
      directive: 'template',
      type: 'by',
      amount: 1200,
      month: '2026-12',
      priority: 1,
    },
  ],
  property: [
    {
      directive: 'template',
      type: 'by',
      amount: 2400,
      month: '2027-06',
      annual: true,
      priority: 1,
    },
  ],
  vehicle: [
    {
      directive: 'template',
      type: 'periodic',
      amount: 150,
      period: { period: 'month', amount: 1 },
      starting: '2026-01-01',
      priority: 1,
    },
  ],
  membership: [
    {
      directive: 'template',
      type: 'schedule',
      scheduleId: 'annual-bill',
      priority: 1,
    },
  ],
};

beforeEach(() => {
  vi.mocked(send).mockReset();
});

describe('native Sinking Savings automation plan', () => {
  it('reads Save by Date, Fixed Amount, and Cover Schedule plans for both months without writes', async () => {
    const amounts: Record<string, [number, number]> = {
      christmas: [30000, 25000],
      property: [20000, 18000],
      vehicle: [15000, 15000],
      membership: [7500, 7500],
    };
    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'budget/get-category-automations') {
        return { [args]: templates[args] ?? [] };
      }
      if (name === 'budget/dry-run-category-template') {
        const amount =
          amounts[args.categoryId]?.[args.month === october ? 0 : 1];
        return { budgeted: amount, perTemplate: [amount] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });

    const plans = await loadSinkingAutomationPlans(
      ['christmas', 'property', 'vehicle', 'membership', 'other'],
      [october, november],
    );
    expect(plans[november]).toEqual({
      christmas: { status: 'planned', amount: 25000 },
      property: { status: 'planned', amount: 18000 },
      vehicle: { status: 'planned', amount: 15000 },
      membership: { status: 'planned', amount: 7500 },
      other: { status: 'none', amount: null },
    });
    expect(plans[october].christmas).toEqual({
      status: 'planned',
      amount: 30000,
    });
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(
          ([name]) => name === 'budget/dry-run-category-template',
        ),
    ).toHaveLength(8);
    expect(
      vi
        .mocked(send)
        .mock.calls.find(
          ([name, args]) =>
            name === 'budget/dry-run-category-template' &&
            args.categoryId === 'membership',
        )?.[1],
    ).toMatchObject({ templates: templates.membership });
    expect(
      vi
        .mocked(send)
        .mock.calls.every(([name]) =>
          [
            'budget/get-category-automations',
            'budget/dry-run-category-template',
          ].includes(name),
        ),
    ).toBe(true);
  });

  it('distinguishes a valid native zero from no automation and failed projections', async () => {
    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'budget/get-category-automations') {
        return args === 'none' ? {} : { [args]: templates.vehicle };
      }
      if (args.categoryId === 'missing') {
        throw new Error('Native projection unavailable');
      }
      return { budgeted: 0, perTemplate: [0] };
    });
    const plans = await loadSinkingAutomationPlans(
      ['vehicle', 'none', 'missing'],
      [november],
    );
    expect(plans[november]).toEqual({
      vehicle: { status: 'planned', amount: 0 },
      none: { status: 'none', amount: null },
      missing: { status: 'unavailable', amount: null },
    });
  });

  it('marks invalid or missing native results unavailable', async () => {
    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'budget/get-category-automations') {
        return { [args]: templates.vehicle };
      }
      return args.month === october
        ? { budgeted: Number.NaN, perTemplate: [0] }
        : { budgeted: 100, perTemplate: [] };
    });
    const plans = await loadSinkingAutomationPlans(
      ['vehicle'],
      [october, november],
    );
    expect(plans[october].vehicle.status).toBe('unavailable');
    expect(plans[november].vehicle.status).toBe('unavailable');
  });

  it('does not confuse an unavailable definition response with no automation', async () => {
    vi.mocked(send).mockImplementation(async name => {
      if (name === 'budget/get-category-automations') {
        return null;
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    const plans = await loadSinkingAutomationPlans(['vehicle'], [november]);
    expect(plans[november].vehicle).toEqual({
      status: 'unavailable',
      amount: null,
    });
  });
});

describe('Sinking Savings plan amounts', () => {
  const categories = [
    { id: 'christmas', name: 'Christmas' },
    { id: 'property', name: 'Property Tax' },
    { id: 'vehicle', name: 'Vehicle Maintenance' },
    { id: 'membership', name: 'Annual membership' },
    { id: 'other', name: 'Other fund' },
  ];
  const currentCells = categories.flatMap(category => [
    { name: `budget-${category.id}`, value: 0 },
    { name: `leftover-${category.id}`, value: 0 },
  ]);
  const nextCells = categories.map(category => ({
    name: `budget-${category.id}`,
    value: 0,
  }));
  const contributions = {
    christmas: { status: 'planned', amount: 25000 },
    property: { status: 'planned', amount: 18000 },
    vehicle: { status: 'planned', amount: 15000 },
    membership: { status: 'planned', amount: 7500 },
    other: { status: 'none', amount: null },
  } as const;

  function plan(
    overrides: Partial<Parameters<typeof buildSinkingSavingsPlan>[0]> = {},
  ) {
    return buildSinkingSavingsPlan({
      month: november,
      categories,
      monthCells: nextCells,
      currentCells,
      contributions,
      reserveAccountIds: ['savings'],
      accountBalances: { savings: 1451 },
      ...overrides,
    });
  }

  it('keeps November commitments, zero allocations, zero envelopes, and physical cash separate', () => {
    expect(plan()).toMatchObject({
      month: november,
      status: 'ready',
      plannedTotal: 65500,
      monthlyAllocationTotal: 0,
      currentEnvelopeTotal: 0,
      planningGap: 65500,
      physicalCash: 1451,
    });
    expect(plan().categories[4]).toMatchObject({
      contribution: { status: 'none' },
      monthlyAllocation: 0,
      planningGap: null,
    });
  });

  it('uses the selected budget month for assignments while keeping current balances current', () => {
    const octoberPlan = plan({
      month: october,
      monthCells: [
        ...currentCells.filter(cell => !cell.name.startsWith('budget-')),
        { name: 'budget-christmas', value: 10000 },
        { name: 'budget-property', value: 18000 },
        { name: 'budget-vehicle', value: 15000 },
        { name: 'budget-membership', value: 7500 },
        { name: 'budget-other', value: 0 },
      ],
    });
    expect(octoberPlan.monthlyAllocationTotal).toBe(50500);
    expect(octoberPlan.planningGap).toBe(15000);
    expect(octoberPlan.currentEnvelopeTotal).toBe(0);
    expect(plan().monthlyAllocationTotal).toBe(0);
  });

  it('does not treat missing month cells or projections as zero', () => {
    expect(plan({ monthCells: [] })).toMatchObject({
      status: 'incomplete',
      monthlyAllocationTotal: null,
      planningGap: null,
    });
    expect(
      plan({
        contributions: {
          ...contributions,
          christmas: { status: 'unavailable', amount: null },
        },
      }),
    ).toMatchObject({
      status: 'incomplete',
      plannedTotal: null,
      planningGap: null,
    });
  });

  it('keeps physical savings independent of monthly assignments and reports missing accounts', () => {
    expect(plan({ accountBalances: { savings: 0 } }).physicalCash).toBe(0);
    expect(plan({ accountBalances: { savings: null } })).toMatchObject({
      status: 'incomplete',
      physicalCash: null,
    });
    expect(plan({ categories: [] }).status).toBe('setup');
  });
});
