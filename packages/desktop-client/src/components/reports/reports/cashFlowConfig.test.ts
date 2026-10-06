import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CASH_FLOW_CONFIG,
  parseCashFlowConfig,
  selectAccountRole,
  selectCategoryRole,
} from './cashFlowConfig';

describe('Cash Flow synced config', () => {
  it('defaults to no selected roles and handles invalid JSON or versions', () => {
    expect(parseCashFlowConfig(undefined)).toEqual(DEFAULT_CASH_FLOW_CONFIG);
    expect(parseCashFlowConfig('{')).toEqual(DEFAULT_CASH_FLOW_CONFIG);
    expect(parseCashFlowConfig('{"version":2}')).toEqual(
      DEFAULT_CASH_FLOW_CONFIG,
    );
    expect(DEFAULT_CASH_FLOW_CONFIG.burnCategoryIds).toEqual([]);
  });

  it('round-trips a valid versioned config', () => {
    const config = {
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      burnCategoryIds: ['groceries'],
      safetyBuffer: 500,
      forecastMonths: 6 as const,
    };
    expect(parseCashFlowConfig(JSON.stringify(config))).toEqual(config);
  });

  it('keeps account and category roles disjoint', () => {
    const accounts = selectAccountRole(
      { ...DEFAULT_CASH_FLOW_CONFIG, operatingAccountIds: ['checking'] },
      'reserve',
      ['checking', 'savings'],
    );
    expect(accounts.operatingAccountIds).toEqual([]);
    expect(accounts.reserveAccountIds).toEqual(['checking', 'savings']);
    const categories = selectCategoryRole(
      { ...DEFAULT_CASH_FLOW_CONFIG, burnCategoryIds: ['groceries'] },
      'reserve',
      ['groceries', 'emergency'],
    );
    expect(categories.burnCategoryIds).toEqual([]);
    expect(categories.reserveCategoryIds).toEqual(['groceries', 'emergency']);
  });
});
