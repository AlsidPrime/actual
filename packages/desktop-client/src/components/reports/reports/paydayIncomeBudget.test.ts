import { send } from '@actual-app/core/platform/client/connection';
import type { CategoryEntity } from '@actual-app/core/types/models';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadPaydayIncomeBudget } from './paydayIncomeBudget';

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(),
}));

const categories: CategoryEntity[] = [
  { id: 'salary', name: 'Salary', group: 'income', is_income: true },
  { id: 'bonus', name: 'Bonus', group: 'income', is_income: true },
  { id: 'rent', name: 'Rent', group: 'expenses', is_income: false },
];

describe('native payday income hold', () => {
  beforeEach(() => {
    vi.mocked(send).mockReset();
  });

  it('reads only payday-month native hold cells and treats an absent flag as off', async () => {
    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name !== 'get-cell') {
        throw new Error(`Unexpected API call: ${name}`);
      }
      return {
        name: `${args.sheetName}!${args.name}`,
        value:
          args.name === 'buffered'
            ? 0
            : args.name === 'carryover-salary'
              ? true
              : null,
      };
    });
    expect(await loadPaydayIncomeBudget('2026-10', categories)).toEqual({
      month: '2026-10',
      manualBuffered: 0,
      incomeCategoryHold: { salary: true, bonus: false },
    });
    expect(vi.mocked(send).mock.calls).toEqual([
      ['get-cell', { sheetName: 'budget202610', name: 'buffered' }],
      ['get-cell', { sheetName: 'budget202610', name: 'carryover-salary' }],
      ['get-cell', { sheetName: 'budget202610', name: 'carryover-bonus' }],
    ]);
  });

  it('withholds a preview when a native hold value is malformed', async () => {
    vi.mocked(send).mockImplementation(async (_name, args) => ({
      name: args.name,
      value: args.name === 'buffered' ? 0 : 1,
    }));
    expect(await loadPaydayIncomeBudget('2026-10', categories)).toBeNull();
  });
});
