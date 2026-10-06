import { MemoryRouter, Route, Routes } from 'react-router';

import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestProviders } from '#mocks';

import { DEFAULT_CASH_FLOW_CONFIG } from './cashFlowConfig';
import { CashFlowPage } from './CashFlowPage';

const fixture = vi.hoisted(() => ({
  rawConfig: undefined as string | undefined,
  budgetType: 'envelope',
  savedConfig: undefined as string | undefined,
  privacyMode: false,
  withReserve: false,
}));

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(async (name: string) =>
    name === 'envelope-budget-month'
      ? [{ name: 'leftover-emergency', value: 600 }]
      : [],
  ),
  listen: vi.fn(() => vi.fn()),
}));
vi.mock('#hooks/useSyncedPref', () => ({
  useSyncedPref: (name: string) => {
    if (name === 'cash-flow-calendar-config') {
      return [
        fixture.rawConfig,
        (value: string) => {
          fixture.savedConfig = value;
        },
      ];
    }
    if (name === 'budgetType') {
      return [fixture.budgetType, vi.fn()];
    }
    if (name === 'isPrivacyEnabled') {
      return [fixture.privacyMode ? 'true' : 'false', vi.fn()];
    }
    return [undefined, vi.fn()];
  },
}));
vi.mock('#hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: [
      {
        id: 'checking',
        name: 'Checking',
        offbudget: 0,
        closed: 0,
        tombstone: 0,
      },
      { id: 'savings', name: 'Savings', offbudget: 0, closed: 0, tombstone: 0 },
    ],
  }),
}));
vi.mock('#hooks/useCategories', () => ({
  useCategories: () => ({
    data: fixture.withReserve
      ? {
          grouped: [
            {
              id: 'savings',
              name: 'Savings',
              is_income: false,
              categories: [
                {
                  id: 'emergency',
                  name: 'Emergency',
                  group: 'savings',
                  is_income: false,
                },
              ],
            },
          ],
          list: [
            {
              id: 'emergency',
              name: 'Emergency',
              group: 'savings',
              is_income: false,
            },
          ],
        }
      : { grouped: [], list: [] },
  }),
}));
vi.mock('#hooks/useBalanceForecast', () => ({
  useBalanceForecast: () => ({
    data: {
      dataPoints: [
        {
          date: monthUtils.currentDay(),
          accountId: 'checking',
          accountName: 'Checking',
          balance: 1000,
          transactions: [],
        },
        ...(fixture.withReserve
          ? [
              {
                date: monthUtils.currentDay(),
                accountId: 'savings',
                accountName: 'Savings',
                balance: 100,
                transactions: [],
              },
            ]
          : []),
      ],
      lowestBalance: {
        date: monthUtils.currentDay(),
        balance: 1000,
        accountId: '',
        accountName: '',
      },
      forecastStartDate: monthUtils.currentDay(),
      forecastEndDate: monthUtils.currentDay(),
    },
    isPending: false,
    isPlaceholderData: false,
    error: null,
  }),
}));

beforeEach(() => {
  fixture.rawConfig = undefined;
  fixture.budgetType = 'envelope';
  fixture.savedConfig = undefined;
  fixture.privacyMode = false;
  fixture.withReserve = false;
  vi.mocked(send).mockClear();
});

function renderRoute() {
  render(
    <MemoryRouter initialEntries={['/cash-flow']}>
      <TestProviders>
        <Routes>
          <Route path="/cash-flow" element={<CashFlowPage />} />
        </Routes>
      </TestProviders>
    </MemoryRouter>,
  );
}

describe('Cash Flow page', () => {
  it('renders the dedicated route and autosaves explicit Operating selection', async () => {
    renderRoute();
    expect(screen.getByText('Cash Flow Calendar')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Select at least one Operating account in Cash Flow Setup to start forecasting.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Cash Flow Setup' }),
    );
    await userEvent.click(screen.getByLabelText('Checking'));
    expect(JSON.parse(fixture.savedConfig ?? '{}')).toMatchObject({
      operatingAccountIds: ['checking'],
      burnCategoryIds: [],
    });
  });

  it('redacts every advisor amount in privacy mode', async () => {
    fixture.privacyMode = true;
    fixture.withReserve = true;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveAccountIds: ['savings'],
      reserveCategoryIds: ['emergency'],
    });
    renderRoute();
    await waitFor(() =>
      expect(document.body.textContent).toContain('Safe to move'),
    );
    const heading = [...document.querySelectorAll('span')].find(
      element =>
        element.textContent?.includes('Safe to move') &&
        element.textContent?.includes('to savings today'),
    );
    const callout = heading?.parentElement;
    expect(callout).toBeDefined();
    expect(
      callout?.querySelectorAll('[aria-hidden="true"]').length,
    ).toBeGreaterThanOrEqual(4);
    for (const element of callout?.querySelectorAll('[aria-label]') ?? []) {
      expect(element.getAttribute('aria-label')).not.toMatch(/\d/);
    }
  });

  it('keeps native forecasting but skips envelope intelligence in Tracking mode', () => {
    fixture.budgetType = 'tracking';
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveAccountIds: ['savings'],
      reserveCategoryIds: ['emergency'],
      burnCategoryIds: ['groceries'],
      budgetBurnEnabled: true,
    });
    renderRoute();
    expect(
      screen.getByText(
        /Budget Burn and protected savings advice require Envelope budgeting/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Safe to move/)).not.toBeInTheDocument();
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(([name]) => name === 'envelope-budget-month'),
    ).toHaveLength(0);
  });
});
