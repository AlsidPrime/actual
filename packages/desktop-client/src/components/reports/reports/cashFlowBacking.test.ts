import { describe, expect, it } from 'vitest';

import { calculateSinkingBacking } from './cashFlowBacking';

const categories = [
  { id: 'car', name: 'Car', balance: 8000 },
  { id: 'gifts', name: 'Gifts', balance: 2000 },
];

function backing(
  overrides: Partial<Parameters<typeof calculateSinkingBacking>[0]> = {},
) {
  return calculateSinkingBacking({
    categories,
    accountIds: ['savings'],
    balances: { savings: 10000 },
    ...overrides,
  });
}

describe('Sinking Savings physical backing', () => {
  it('shows fully and partially funded cash separately from future transfers', () => {
    expect(backing()).toMatchObject({
      status: 'full',
      target: 10000,
      backing: 10000,
      percent: 100,
    });
    expect(backing({ balances: { savings: 3000 } })).toMatchObject({
      status: 'partial',
      shortfall: 7000,
      percent: 30,
    });
  });

  it('shows excess cash without double counting selected accounts or categories', () => {
    expect(
      backing({
        categories: [...categories, categories[0]],
        accountIds: ['savings', 'savings'],
        balances: { savings: 12000 },
      }),
    ).toMatchObject({
      status: 'excess',
      target: 10000,
      backing: 12000,
      excess: 2000,
    });
  });

  it('does not let a negative category reduce the protected target', () => {
    expect(
      backing({
        categories: [
          { id: 'car', name: 'Car', balance: 8000 },
          { id: 'gifts', name: 'Gifts', balance: -3000 },
        ],
        balances: { savings: 6000 },
      }),
    ).toMatchObject({ status: 'partial', target: 8000, shortfall: 2000 });
  });

  it('ignores protected accounts that were not selected as Sinking Savings', () => {
    expect(
      backing({ balances: { savings: 2000, protected: 100000 } }),
    ).toMatchObject({
      status: 'partial',
      backing: 2000,
      shortfall: 8000,
    });
  });

  it('handles zero targets, setup, and unavailable balances', () => {
    expect(
      backing({ categories: [{ id: 'car', name: 'Car', balance: 0 }] }),
    ).toMatchObject({ status: 'zero-target', percent: null });
    expect(backing({ categories: [] }).status).toBe('setup');
    expect(backing({ balances: { savings: null } }).status).toBe('incomplete');
    expect(backing({ balances: { savings: Number.NaN } }).status).toBe(
      'incomplete',
    );
    expect(
      backing({ categories: [{ id: 'car', name: 'Car', balance: null }] })
        .status,
    ).toBe('incomplete');
  });
});
