import { MemoryRouter, Route, Routes } from 'react-router';

import { listen, send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import type { ScheduleStatusType } from '@actual-app/core/shared/schedules';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
  reserveBalance: 100,
  scheduledFunding: 0,
  manualScheduleIds: [] as string[],
  autoScheduleIds: [] as string[],
  attentionSchedules: [] as Array<{
    id: string;
    name?: string;
    next_date: string;
    _account: string;
    _payee: string;
    _amount: number;
    posts_transaction: boolean;
  }>,
  scheduleStatuses: {} as Record<string, ScheduleStatusType>,
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
vi.mock('#hooks/useSchedules', () => ({
  getSchedulesQuery: vi.fn(() => ({})),
  useSchedules: () => ({
    schedules: [
      ...fixture.manualScheduleIds.map(id => ({
        id,
        name: id,
        next_date: monthUtils.addDays(monthUtils.currentDay(), 1),
        _account: 'checking',
        _payee: '',
        _amount: -20000,
        posts_transaction: false,
      })),
      ...fixture.autoScheduleIds.map(id => ({ id, posts_transaction: true })),
      ...fixture.attentionSchedules,
    ],
    statuses: new Map(Object.entries(fixture.scheduleStatuses)),
    isLoading: false,
    error: undefined,
  }),
}));
vi.mock('#hooks/usePayees', () => ({
  usePayeesById: () => ({ data: { hydro: { name: 'Hydro payee' } } }),
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
                balance: fixture.reserveBalance,
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
        ...(fixture.withReserve &&
        fixture.futureOperatingBalance !== null &&
        fixture.scheduledFunding === 0
          ? [
              {
                date: monthUtils.addDays(monthUtils.currentDay(), 1),
                accountId: 'savings',
                accountName: 'Savings',
                balance: fixture.reserveBalance,
                transactions: [],
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
                balance: fixture.reserveBalance + fixture.scheduledFunding,
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
  fixture.reserveBalance = 100;
  fixture.scheduledFunding = 0;
  fixture.manualScheduleIds = [];
  fixture.autoScheduleIds = [];
  fixture.attentionSchedules = [];
  fixture.scheduleStatuses = {};
  fixture.futureOperatingBalance = null;
  fixture.futureOperatingIncome = 0;
  vi.mocked(listen).mockClear();
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
          <Route path="/schedules" element={<div>Schedules destination</div>} />
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
    expect(
      screen.getByText(/Sinking Savings accounts back sinking categories/),
    ).toBeInTheDocument();
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
      document.querySelector('article[aria-current="date"]'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No Operating cash shortfall projected through/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Lowest projected Operating cash/),
    ).toBeInTheDocument();
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
    expect(
      screen.getByText(/Operating cash shortfall projected/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Projected Operating cash on that date/),
    ).toHaveTextContent('-0.50');
    expect(
      screen.queryByText('Operating cash is projected below zero today.'),
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
      screen.getByText('Operating cash is projected below zero today.'),
    ).toBeInTheDocument();
  });

  it('shows Tracking danger and Operating EOD cash despite a large Sinking Savings balance', () => {
    fixture.budgetType = 'tracking';
    fixture.withReserve = true;
    fixture.operatingBalance = -20000;
    fixture.reserveBalance = 800000;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveAccountIds: ['savings'],
    });
    renderRoute();
    expect(
      screen.getByText('Operating cash is projected below zero today.'),
    ).toBeInTheDocument();
    const todayCell = document.querySelector('article[aria-current="date"]');
    expect(todayCell).toHaveTextContent('-200.00');
    expect(todayCell).not.toHaveTextContent('7,800.00');
    expect(
      screen.getByText(/Projected Operating cash is shown/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Safe to move/)).not.toBeInTheDocument();
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(([name]) => name === 'envelope-budget-month'),
    ).toHaveLength(0);
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(([name]) =>
          ['schedule/', 'transaction/', 'account/', 'budget/'].some(prefix =>
            name.startsWith(prefix),
          ),
        ),
    ).toHaveLength(0);
  });

  it('redacts the Operating calendar balance without putting it in labels or tooltips', () => {
    fixture.budgetType = 'tracking';
    fixture.privacyMode = true;
    fixture.withReserve = true;
    fixture.operatingBalance = 12345;
    fixture.reserveBalance = 800000;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveAccountIds: ['savings'],
    });
    renderRoute();
    const todayCell = document.querySelector('article[aria-current="date"]');
    expect(
      todayCell?.querySelector('[aria-hidden="true"]'),
    ).toBeInTheDocument();
    for (const element of todayCell?.querySelectorAll('[aria-label],[title]') ??
      []) {
      expect(
        `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''}`,
      ).not.toMatch(/123\.45|8,123\.45/);
    }
  });

  it('warns on a future Operating shortfall despite Sinking Savings staying positive', () => {
    fixture.withReserve = true;
    fixture.operatingBalance = 50000;
    fixture.futureOperatingBalance = -5000;
    fixture.reserveBalance = 800000;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveAccountIds: ['savings'],
    });
    renderRoute();
    expect(
      screen.getByText(/Operating cash shortfall projected/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Projected Operating cash on that date/),
    ).toHaveTextContent('-50.00');
    expect(
      screen.queryByText(/No Operating cash shortfall projected through/),
    ).not.toBeInTheDocument();
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
        element.textContent?.includes('to Sinking Savings today'),
    );
    const callout = heading?.parentElement;
    expect(callout).toBeDefined();
    expect(
      callout?.querySelectorAll('[aria-hidden="true"]').length,
    ).toBeGreaterThanOrEqual(6);
    expect(
      screen
        .getByText(/Already scheduled to Sinking Savings/)
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
        await screen.findByText('Sinking Savings advice is incomplete'),
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
        'Sinking Savings is covered by scheduled funding',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Already scheduled to Sinking Savings/),
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
      screen.getByText(/Sinking Savings may be fully funded/),
    ).toBeInTheDocument();
  });

  it('does not label an auto-posting scheduled event Manual', async () => {
    fixture.budgetType = 'tracking';
    fixture.withReserve = true;
    fixture.scheduledFunding = 200;
    fixture.autoScheduleIds = ['move-to-savings'];
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveAccountIds: ['savings'],
    });
    renderRoute();
    if (
      monthUtils.getMonth(monthUtils.addDays(monthUtils.currentDay(), 1)) !==
      monthUtils.currentMonth()
    ) {
      await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    }
    expect(screen.getByText('Transfer')).toBeInTheDocument();
    expect(screen.queryByText('Manual')).not.toBeInTheDocument();
  });

  it('shows Manual in Tracking mode with privacy and no schedule writes', async () => {
    fixture.budgetType = 'tracking';
    fixture.privacyMode = true;
    fixture.withReserve = true;
    fixture.scheduledFunding = 200;
    fixture.manualScheduleIds = ['move-to-savings'];
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveAccountIds: ['savings'],
    });
    renderRoute();
    if (
      monthUtils.getMonth(monthUtils.addDays(monthUtils.currentDay(), 1)) !==
      monthUtils.currentMonth()
    ) {
      await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    }
    const indicator = screen.getByText('Manual');
    expect(indicator.getAttribute('aria-label')).toBe(
      'Manual schedule — Actual will not automatically add this transaction.',
    );
    expect(indicator.getAttribute('aria-label')).not.toMatch(/\d/);
    expect(
      indicator.parentElement?.querySelector('[aria-hidden="true"]'),
    ).toBeInTheDocument();
    expect(screen.getByText('Cash Flow Risk')).toBeInTheDocument();
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(
          ([name]) =>
            name.startsWith('schedule/') || name.startsWith('transaction/'),
        ),
    ).toHaveLength(0);
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(([name]) => name === 'envelope-budget-month'),
    ).toHaveLength(0);
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
        /Budget Burn and Sinking Savings advice require Envelope budgeting/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Safe to move/)).not.toBeInTheDocument();
    expect(screen.getByText('Cash Flow Risk')).toBeInTheDocument();
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(([name]) => name === 'envelope-budget-month'),
    ).toHaveLength(0);
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(
          ([name]) =>
            name === 'budget/get-category-automations' ||
            name === 'budget/dry-run-category-template',
        ),
    ).toHaveLength(0);
  });
  it('shows due and missed manual schedules with factual wording and review navigation', async () => {
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveAccountIds: ['savings'],
    });
    fixture.attentionSchedules = [
      {
        id: 'hydro',
        name: '',
        next_date: monthUtils.currentDay(),
        _account: 'checking',
        _payee: 'hydro',
        _amount: -18432,
        posts_transaction: false,
      },
      {
        id: 'transfer',
        name: 'Transfer to savings',
        next_date: monthUtils.subDays(monthUtils.currentDay(), 2),
        _account: 'savings',
        _payee: '',
        _amount: -62000,
        posts_transaction: false,
      },
      {
        id: 'next',
        name: 'Next manual',
        next_date: monthUtils.addDays(monthUtils.currentDay(), 5),
        _account: 'checking',
        _payee: '',
        _amount: -5000,
        posts_transaction: false,
      },
    ];
    fixture.scheduleStatuses = {
      hydro: 'due',
      transfer: 'missed',
      next: 'upcoming',
    };
    renderRoute();
    const panel =
      screen.getByText('Needs Attention').parentElement?.parentElement;
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent('Hydro payee');
    expect(panel).toHaveTextContent('Due today');
    expect(panel).toHaveTextContent('184.32');
    expect(panel).toHaveTextContent('Checking');
    expect(panel).toHaveTextContent(
      `Missed ${monthUtils.format(monthUtils.subDays(monthUtils.currentDay(), 2), 'MMMM d')}`,
    );
    expect(panel).toHaveTextContent('Savings');
    expect(panel).toHaveTextContent('1 upcoming manual schedule');
    expect(panel).toHaveTextContent('Next manual');
    expect(panel?.textContent?.indexOf('Transfer to savings')).toBeLessThan(
      panel?.textContent?.indexOf('Hydro payee') ?? 0,
    );
    expect(panel).not.toHaveTextContent('unpaid');
    expect(panel).not.toHaveTextContent('failed payment');
    expect(panel?.querySelectorAll('a[href="/schedules"]')).toHaveLength(1);
    await userEvent.click(
      screen.getByRole('link', { name: 'Review schedules' }),
    );
    expect(screen.getByText('Schedules destination')).toBeInTheDocument();
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(
          ([name]) =>
            name.startsWith('schedule/') || name.startsWith('transaction/'),
        ),
    ).toHaveLength(0);
  });

  it('shows attention and upcoming manual work in Tracking mode with amounts redacted', () => {
    fixture.budgetType = 'tracking';
    fixture.privacyMode = true;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
    });
    fixture.attentionSchedules = [
      {
        id: 'due',
        name: 'Card payment',
        next_date: monthUtils.currentDay(),
        _account: 'checking',
        _payee: '',
        _amount: -987654,
        posts_transaction: false,
      },
      {
        id: 'future',
        name: 'Future manual',
        next_date: monthUtils.addDays(monthUtils.currentDay(), 8),
        _account: 'checking',
        _payee: '',
        _amount: -1234,
        posts_transaction: false,
      },
    ];
    fixture.scheduleStatuses = { due: 'due', future: 'scheduled' };
    renderRoute();
    const panel =
      screen.getByText('Needs Attention').parentElement?.parentElement;
    expect(panel).toHaveTextContent('Card payment');
    expect(panel).toHaveTextContent('Due today');
    expect(panel).toHaveTextContent('1 upcoming manual schedule');
    expect(panel).toHaveTextContent('Future manual');
    expect(panel?.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    for (const element of panel?.querySelectorAll('[aria-label],[title]') ??
      []) {
      expect(
        element.getAttribute('aria-label') ?? element.getAttribute('title'),
      ).not.toMatch(/987654|9,876/);
    }
    expect(screen.getByText('Cash Flow Risk')).toBeInTheDocument();
    expect(screen.queryByText(/Safe to move/)).not.toBeInTheDocument();
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(([name]) => name === 'envelope-budget-month'),
    ).toHaveLength(0);
  });

  it('hides the calendar when required Burn budget data fails', async () => {
    fixture.withReserve = true;
    fixture.withBurn = true;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      burnCategoryIds: ['groceries'],
      budgetBurnEnabled: true,
    });
    vi.mocked(send).mockImplementation(async name => {
      if (name === 'envelope-budget-month') {
        throw new Error('Budget read failed');
      }
      if (name === 'budget/get-category-automations') {
        return { groceries: [] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    renderRoute();
    expect(
      await screen.findByText('Failed to load budget data.'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('article[aria-current="date"]'),
    ).not.toBeInTheDocument();
  });

  it('shows loading until required Burn budget data arrives', async () => {
    fixture.withReserve = true;
    fixture.withBurn = true;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      burnCategoryIds: ['groceries'],
      budgetBurnEnabled: true,
    });
    let resolveBudget:
      | ((cells: Array<{ name: string; value: number }>) => void)
      | undefined;
    const pendingBudget = new Promise<Array<{ name: string; value: number }>>(
      resolve => {
        resolveBudget = resolve;
      },
    );
    vi.mocked(send).mockImplementation(async name => {
      if (name === 'envelope-budget-month') {
        return pendingBudget;
      }
      if (name === 'budget/get-category-automations') {
        return { groceries: [] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    renderRoute();
    expect(
      document.querySelector('article[aria-current="date"]'),
    ).not.toBeInTheDocument();
    resolveBudget?.([
      { name: 'leftover-groceries', value: 100 },
      { name: 'budget-groceries', value: 100 },
    ]);
    await waitFor(() =>
      expect(
        document.querySelector('article[aria-current="date"]'),
      ).toBeInTheDocument(),
    );
  });

  it.each(['definitions', 'dry-run'])(
    'shows no Risk or Sweep when automation %s fail',
    async failure => {
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
      vi.mocked(send).mockImplementation(async name => {
        if (name === 'envelope-budget-month') {
          return [
            { name: 'leftover-emergency', value: 600 },
            { name: 'leftover-groceries', value: 30000 },
            { name: 'budget-groceries', value: 30000 },
          ];
        }
        if (name === 'budget/get-category-automations') {
          if (failure === 'definitions') {
            throw new Error('Definition read failed');
          }
          return {
            groceries: [
              {
                directive: 'template',
                type: 'periodic',
                amount: 1800,
                period: { period: 'month', amount: 1 },
                starting: monthUtils.currentMonth(),
                priority: 1,
              },
            ],
          };
        }
        if (name === 'budget/dry-run-category-template') {
          throw new Error('Dry-run failed');
        }
        throw new Error(`Unexpected API call: ${name}`);
      });
      renderRoute();
      expect(
        await screen.findByText('Failed to load Budget Automation plans.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Cash Flow Risk')).not.toBeInTheDocument();
      expect(
        document.querySelector('article[aria-current="date"]'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Safe to move/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Do not transfer to Sinking Savings/),
      ).not.toBeInTheDocument();
    },
  );

  it('uses a fixed automation plan for Operating Risk and conservative Sweep despite partial funding', async () => {
    fixture.withReserve = true;
    fixture.withBurn = true;
    fixture.privacyMode = true;
    const daysRemaining = monthUtils.dayRangeInclusive(
      monthUtils.currentDay(),
      monthUtils.lastDayOfMonth(monthUtils.currentMonth()),
    ).length;
    fixture.operatingBalance = Math.floor(70000 / daysRemaining);
    fixture.reserveBalance = 1000000;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveAccountIds: ['savings'],
      reserveCategoryIds: ['emergency'],
      burnCategoryIds: ['groceries'],
      budgetBurnEnabled: true,
    });
    vi.mocked(send).mockImplementation(async name => {
      if (name === 'envelope-budget-month') {
        return [
          { name: 'leftover-emergency', value: 600 },
          { name: 'leftover-groceries', value: 30000 },
          { name: 'budget-groceries', value: 30000 },
          { name: 'sum-amount-groceries', value: -70000 },
        ];
      }
      if (name === 'budget/get-category-automations') {
        return {
          groceries: [
            {
              directive: 'template',
              type: 'periodic',
              amount: 1800,
              period: { period: 'month', amount: 1 },
              starting: monthUtils.currentMonth(),
              priority: 1,
            },
          ],
        };
      }
      if (name === 'budget/dry-run-category-template') {
        return { budgeted: 180000, perTemplate: [180000] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    renderRoute();
    expect(
      await screen.findByText('Do not transfer to Sinking Savings'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Operating cash is projected below zero today.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Budget Burn uses fixed Budget Automation plans/),
    ).toBeInTheDocument();
    expect(
      document.querySelector('article[aria-current="date"]'),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(
          ([name]) => name === 'budget/get-category-automations',
        ),
    ).toHaveLength(1);
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(
          ([name]) => name === 'budget/dry-run-category-template',
        ),
    ).toHaveLength(12);
    const onSync = vi
      .mocked(listen)
      .mock.calls.find(([name]) => name === 'sync-event')?.[1];
    expect(onSync).toBeDefined();
    act(() => onSync?.({ type: 'success', tables: ['transactions'] }));
    await waitFor(() =>
      expect(
        vi
          .mocked(send)
          .mock.calls.filter(([name]) => name === 'envelope-budget-month')
          .length,
      ).toBeGreaterThan(12),
    );
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(
          ([name]) => name === 'budget/get-category-automations',
        ),
    ).toHaveLength(1);
    act(() => onSync?.({ type: 'success', tables: ['categories'] }));
    await waitFor(() =>
      expect(
        vi
          .mocked(send)
          .mock.calls.filter(
            ([name]) => name === 'budget/get-category-automations',
          ),
      ).toHaveLength(2),
    );
    expect(
      vi
        .mocked(send)
        .mock.calls.some(
          ([name]) =>
            name.startsWith('budget/apply') ||
            name === 'budget/set-category-automations' ||
            name === 'budget/budget-amount' ||
            name.startsWith('transaction/') ||
            name.startsWith('schedule/'),
        ),
    ).toBe(false);
    for (const element of document.querySelectorAll('[aria-label],[title]')) {
      expect(
        element.getAttribute('aria-label') ?? element.getAttribute('title'),
      ).not.toMatch(/180,?000|70,?000|30,?000/);
    }
  });

  it('keeps forecast, Risk, Burn, and Sweep output independent of attention metadata', async () => {
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
    await screen.findByText('Cash Flow Risk');
    await screen.findByText(/Safe to move/);
    const before = {
      risk: screen.getByText('Cash Flow Risk').parentElement?.textContent,
      sweep: screen.getByText(/Safe to move/).parentElement?.textContent,
      burn: screen.getByText(/Budget Burn on/).parentElement?.textContent,
    };
    cleanup();
    fixture.attentionSchedules = [
      {
        id: 'manual',
        name: 'Manual payment',
        next_date: monthUtils.currentDay(),
        _account: 'checking',
        _payee: '',
        _amount: -50000,
        posts_transaction: false,
      },
    ];
    fixture.scheduleStatuses = { manual: 'due' };
    renderRoute();
    await screen.findByText('Cash Flow Risk');
    await screen.findByText(/Safe to move/);
    expect({
      risk: screen.getByText('Cash Flow Risk').parentElement?.textContent,
      sweep: screen.getByText(/Safe to move/).parentElement?.textContent,
      burn: screen.getByText(/Budget Burn on/).parentElement?.textContent,
    }).toEqual(before);
    expect(screen.getByText('Manual payment')).toBeInTheDocument();
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(
          ([name]) =>
            name.startsWith('schedule/') || name.startsWith('transaction/'),
        ),
    ).toHaveLength(0);
  });
});
