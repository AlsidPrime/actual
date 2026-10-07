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
  withBurn: false,
  operatingBalance: 1000,
  scheduledFunding: 0,
  futureOperatingBalance: null as number | null,
  futureOperatingIncome: 0,
}));

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(async (name: string) =>
    name === 'envelope-budget-month'
      ? [
          { name: 'leftover-emergency', value: 600 },
          { name: 'leftover-groceries', value: 100 },
          { name: 'budget-groceries', value: 100 },
        ]
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
                ...(fixture.withBurn
                  ? [
                      {
                        id: 'groceries',
                        name: 'Groceries',
                        group: 'savings',
                        is_income: false,
                      },
                    ]
                  : []),
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
            ...(fixture.withBurn
              ? [
                  {
                    id: 'groceries',
                    name: 'Groceries',
                    group: 'savings',
                    is_income: false,
                  },
                ]
              : []),
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
          balance: fixture.operatingBalance,
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
        ...(fixture.futureOperatingBalance !== null
          ? [
              {
                date: monthUtils.addDays(monthUtils.currentDay(), 1),
                accountId: 'checking',
                accountName: 'Checking',
                balance: fixture.futureOperatingBalance,
                transactions:
                  fixture.futureOperatingIncome > 0
                    ? [
                        {
                          amount: fixture.futureOperatingIncome,
                          isTransfer: false,
                          payee: 'Payday',
                          scheduleId: 'payday',
                          scheduleName: 'Payday',
                        },
                      ]
                    : [],
              },
            ]
          : []),
        ...(fixture.withReserve && fixture.scheduledFunding > 0
          ? [
              {
                date: monthUtils.addDays(monthUtils.currentDay(), 1),
                accountId: 'checking',
                accountName: 'Checking',
                balance: fixture.operatingBalance - fixture.scheduledFunding,
                transactions: [
                  {
                    amount: -fixture.scheduledFunding,
                    isTransfer: true,
                    payee: 'Scheduled transfer',
                    scheduleId: 'move-to-savings',
                    scheduleName: 'Move to savings',
                  },
                ],
              },
              {
                date: monthUtils.addDays(monthUtils.currentDay(), 1),
                accountId: 'savings',
                accountName: 'Savings',
                balance: 100 + fixture.scheduledFunding,
                transactions: [
                  {
                    amount: fixture.scheduledFunding,
                    isTransfer: true,
                    payee: 'Scheduled transfer',
                    scheduleId: 'move-to-savings',
                    scheduleName: 'Move to savings',
                  },
                ],
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
  fixture.withBurn = false;
  fixture.operatingBalance = 1000;
  fixture.scheduledFunding = 0;
  fixture.futureOperatingBalance = null;
  fixture.futureOperatingIncome = 0;
  vi.mocked(send).mockReset();
  vi.mocked(send).mockImplementation(async (name: string) =>
    name === 'envelope-budget-month'
      ? [
          { name: 'leftover-emergency', value: 600 },
          { name: 'leftover-groceries', value: 100 },
          { name: 'budget-groceries', value: 100 },
        ]
      : [],
  );
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

  it('shows a safe Cash Flow Risk summary and no scheduled inflow', () => {
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
    });
    renderRoute();
    expect(screen.getByText('Cash Flow Risk')).toBeInTheDocument();
    expect(
      screen.getByText(/No cash shortfall projected through/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Lowest projected cash/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'No future Operating inflow is scheduled within the forecast horizon.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the first future cash shortfall and projected amount', () => {
    fixture.futureOperatingBalance = -50;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
    });
    renderRoute();
    expect(screen.getByText(/Cash shortfall projected/)).toBeInTheDocument();
    expect(screen.getByText(/Projected cash on that date/)).toHaveTextContent(
      '-0.50',
    );
    expect(
      screen.queryByText('Cash is projected below zero today.'),
    ).not.toBeInTheDocument();
  });

  it('shows immediate danger when selected cash is negative today', () => {
    fixture.operatingBalance = -50;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
    });
    renderRoute();
    expect(
      screen.getByText('Cash is projected below zero today.'),
    ).toBeInTheDocument();
  });

  it('redacts Risk Summary amounts and shows the next Operating inflow', () => {
    fixture.privacyMode = true;
    fixture.futureOperatingBalance = 1500;
    fixture.futureOperatingIncome = 500;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
    });
    renderRoute();
    const callout = screen.getByText('Cash Flow Risk').parentElement;
    expect(
      callout?.querySelectorAll('[aria-hidden="true"]').length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(/Next forecasted Operating inflow/),
    ).toBeInTheDocument();
    for (const element of callout?.querySelectorAll('[aria-label],[title]') ??
      []) {
      expect(
        element.getAttribute('aria-label') ?? element.getAttribute('title'),
      ).not.toMatch(/\d/);
    }
  });

  it('redacts every advisor amount in privacy mode', async () => {
    fixture.privacyMode = true;
    fixture.withReserve = true;
    fixture.scheduledFunding = 200;
    fixture.withBurn = true;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveAccountIds: ['savings'],
      reserveCategoryIds: ['emergency'],
      burnCategoryIds: ['groceries'],
      budgetBurnEnabled: true,
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
    ).toBeGreaterThanOrEqual(6);
    expect(
      screen
        .getByText(/Already scheduled to savings/)
        .querySelector('[aria-hidden="true"]'),
    ).toBeInTheDocument();
    expect(
      screen
        .getByText(/Remaining funding need/)
        .querySelector('[aria-hidden="true"]'),
    ).toBeInTheDocument();
    for (const element of callout?.querySelectorAll('[aria-label]') ?? []) {
      expect(element.getAttribute('aria-label')).not.toMatch(/\d/);
    }
  });

  it.each([
    ['disabled', false, ['groceries']],
    ['no categories', true, []],
  ])(
    'warns that savings advice is incomplete when Burn is %s',
    async (_, enabled, ids) => {
      fixture.withReserve = true;
      fixture.withBurn = true;
      fixture.rawConfig = JSON.stringify({
        ...DEFAULT_CASH_FLOW_CONFIG,
        operatingAccountIds: ['checking'],
        reserveAccountIds: ['savings'],
        reserveCategoryIds: ['emergency'],
        burnCategoryIds: ids,
        budgetBurnEnabled: enabled,
      });
      renderRoute();
      expect(
        await screen.findByText('Savings advice is incomplete'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Safe to move/)).not.toBeInTheDocument();
    },
  );

  it('uses full-horizon wording when there is no next Operating inflow', async () => {
    fixture.withReserve = true;
    fixture.withBurn = true;
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
      await screen.findByText(/over the forecast horizon is/),
    ).toBeInTheDocument();
  });

  it('explains when scheduled funding covers the remaining Reserve gap', async () => {
    fixture.withReserve = true;
    fixture.withBurn = true;
    fixture.scheduledFunding = 500;
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
      await screen.findByText(
        'Protected savings are covered by scheduled funding',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Already scheduled to savings/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Remaining funding need/)).toBeInTheDocument();
    expect(screen.queryByText(/Safe to move/)).not.toBeInTheDocument();
  });

  it('shows funded Reserve savings with Operating cash below the buffer as a hold', async () => {
    fixture.withReserve = true;
    fixture.withBurn = true;
    fixture.operatingBalance = 300;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveAccountIds: ['savings'],
      reserveCategoryIds: ['emergency'],
      burnCategoryIds: ['groceries'],
      budgetBurnEnabled: true,
      safetyBuffer: 500,
    });
    vi.mocked(send).mockImplementation(async (name: string) =>
      name === 'envelope-budget-month'
        ? [
            { name: 'leftover-emergency', value: 100 },
            { name: 'leftover-groceries', value: 100 },
            { name: 'budget-groceries', value: 100 },
          ]
        : [],
    );
    renderRoute();
    expect(await screen.findByText('Hold cash for now')).toBeInTheDocument();
    expect(
      screen.getByText(/Protected savings may be fully funded/),
    ).toBeInTheDocument();
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
    expect(screen.getByText('Cash Flow Risk')).toBeInTheDocument();
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(([name]) => name === 'envelope-budget-month'),
    ).toHaveLength(0);
  });
});
