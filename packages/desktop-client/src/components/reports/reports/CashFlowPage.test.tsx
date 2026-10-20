import { MemoryRouter, Route, Routes } from 'react-router';

import { listen, send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import type { ScheduleStatusType } from '@actual-app/core/shared/schedules';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestProviders } from '#mocks';

import { DEFAULT_CASH_FLOW_CONFIG } from './cashFlowConfig';
import { CashFlowPage } from './CashFlowPage';
import type { PaydayRunway } from './cashFlowPayday';
import { PaydayChecklist } from './PaydayChecklist';
import { SuggestedFundingPlan } from './SuggestedFundingPlan';

const fixture = vi.hoisted(() => ({
  rawConfig: undefined as string | undefined,
  budgetType: 'envelope',
  savedConfig: undefined as string | undefined,
  privacyMode: false,
  payeesAvailable: true,
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
    _date?: { frequency: 'weekly'; start: string };
  }>,
  scheduleStatuses: {} as Record<string, ScheduleStatusType>,
  futureOperatingBalance: null as number | null,
  futureOperatingIncome: 0,
}));

function makePaydayRunway(overrides: Partial<PaydayRunway>): PaydayRunway {
  return {
    status: 'scheduled-only',
    isConfigurationIncomplete: false,
    isScheduledOnly: true,
    currentCashWarning: null,
    paydayDate: null,
    daysUntilPayday: null,
    scheduleNames: [],
    expectedIncome: null,
    budgetableIncome: null,
    budgetableDeposits: null,
    currentCash: null,
    todayClosingCash: null,
    lowestCash: null,
    lowestDate: null,
    firstNegativeDate: null,
    firstNegativeCash: null,
    paydayClosingCash: null,
    ...overrides,
  };
}

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
  usePayeesById: () => ({
    data: fixture.payeesAvailable
      ? { hydro: { name: 'Hydro payee' } }
      : undefined,
  }),
}));
vi.mock('#hooks/useAccountBalances', () => ({
  useAccountBalances: (ids: string[]) =>
    Object.fromEntries(
      ids.map(id => [
        id,
        id === 'savings' ? fixture.reserveBalance : fixture.operatingBalance,
      ]),
    ),
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
              id: 'salary',
              name: 'Salary',
              group: 'income',
              is_income: true,
            },
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
                          categoryId: 'salary',
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
  fixture.payeesAvailable = true;
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

  it('loads a selected payday from synced settings and shows native current cash', () => {
    fixture.futureOperatingBalance = 11000;
    fixture.futureOperatingIncome = 10000;
    fixture.attentionSchedules = [
      {
        id: 'payday',
        name: 'Employment pay',
        next_date: monthUtils.addDays(monthUtils.currentDay(), 1),
        _account: 'checking',
        _payee: '',
        _amount: 10000,
        posts_transaction: true,
        _date: { frequency: 'weekly', start: monthUtils.currentDay() },
      },
    ];
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      paydayScheduleIds: ['payday'],
    });
    renderRoute();
    expect(screen.getByText('Next Payday / Cash Runway')).toBeInTheDocument();
    expect(screen.getByText('Scheduled cash runway only')).toBeInTheDocument();
    expect(
      screen.getByText(/excludes unplanned variable spending/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Employment pay/)).toBeInTheDocument();
    expect(
      screen.getByText(/Actual Operating cash now/).parentElement,
    ).toHaveTextContent('10.00');
  });

  it.each([
    ['Burn disabled', 'envelope', false, ['groceries']],
    ['no Burn categories', 'envelope', true, []],
    ['Tracking Budget', 'tracking', true, ['groceries']],
  ])(
    'labels a positive Payday forecast as scheduled-only with %s',
    (_, budgetType, budgetBurnEnabled, burnCategoryIds) => {
      fixture.budgetType = budgetType;
      fixture.withReserve = true;
      fixture.withBurn = true;
      fixture.futureOperatingBalance = 11000;
      fixture.futureOperatingIncome = 10000;
      fixture.attentionSchedules = [
        {
          id: 'payday',
          name: 'Employment pay',
          next_date: monthUtils.addDays(monthUtils.currentDay(), 1),
          _account: 'checking',
          _payee: '',
          _amount: 10000,
          posts_transaction: true,
          _date: { frequency: 'weekly', start: monthUtils.currentDay() },
        },
      ];
      fixture.rawConfig = JSON.stringify({
        ...DEFAULT_CASH_FLOW_CONFIG,
        operatingAccountIds: ['checking'],
        paydayScheduleIds: ['payday'],
        budgetBurnEnabled,
        burnCategoryIds,
      });
      renderRoute();
      expect(
        screen.getByText('Scheduled cash runway only'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/excludes unplanned variable spending/),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Cash survives until payday'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/No Operating shortfall among scheduled transactions/),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/No Operating shortfall among modeled transactions/),
      ).not.toBeInTheDocument();
    },
  );

  it('warns about an unavailable selected payday despite a valid forecast payday', () => {
    fixture.futureOperatingBalance = 11000;
    fixture.futureOperatingIncome = 10000;
    fixture.attentionSchedules = [
      {
        id: 'payday',
        name: 'Employment pay',
        next_date: monthUtils.addDays(monthUtils.currentDay(), 1),
        _account: 'checking',
        _payee: '',
        _amount: 10000,
        posts_transaction: true,
        _date: { frequency: 'weekly', start: monthUtils.currentDay() },
      },
    ];
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      paydayScheduleIds: ['payday', 'deleted'],
    });
    renderRoute();
    expect(screen.getByText('Runway data is incomplete')).toBeInTheDocument();
    expect(
      screen.getByText(/selected payday schedule is unavailable/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Employment pay/)).toBeInTheDocument();
    expect(
      screen.queryByText('Cash survives until payday'),
    ).not.toBeInTheDocument();
  });

  it('withholds Payday validation until payees are available', () => {
    fixture.payeesAvailable = false;
    fixture.futureOperatingBalance = 11000;
    fixture.futureOperatingIncome = 10000;
    fixture.attentionSchedules = [
      {
        id: 'payday',
        name: 'Employment pay',
        next_date: monthUtils.addDays(monthUtils.currentDay(), 1),
        _account: 'checking',
        _payee: '',
        _amount: 10000,
        posts_transaction: true,
        _date: { frequency: 'weekly', start: monthUtils.currentDay() },
      },
    ];
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      paydayScheduleIds: ['payday'],
    });
    renderRoute();
    expect(
      screen.queryByText('Next Payday / Cash Runway'),
    ).not.toBeInTheDocument();
  });

  it('shows a scheduled-only Cash Flow Risk summary without payday', () => {
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
      screen.getByText(
        /No Operating shortfall among scheduled transactions through/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Lowest projected Operating cash/),
    ).toBeInTheDocument();
    expect(screen.getByText(/No payday schedule selected/)).toBeInTheDocument();
  });

  it('warns about positive cash below the buffer in Tracking Budget', () => {
    fixture.budgetType = 'tracking';
    fixture.operatingBalance = 100000;
    fixture.futureOperatingBalance = 90000;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      safetyBuffer: 95000,
    });
    renderRoute();
    expect(
      screen.getByText(/Operating cash falls below the safety buffer/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Lowest projected Operating cash/),
    ).toHaveTextContent('900.00');
    expect(
      screen.getByText(/Unplanned variable spending is excluded/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/No Operating shortfall among modeled/),
    ).not.toBeInTheDocument();
  });

  it('saves a valid buffer edit before Setup closes with Escape', async () => {
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
    });
    renderRoute();
    await userEvent.click(
      screen.getByRole('button', { name: 'Cash Flow Setup' }),
    );
    const input = screen.getByRole('textbox', { name: 'Safety buffer' });
    await userEvent.clear(input);
    await userEvent.type(input, '950');
    await userEvent.keyboard('{Escape}');
    expect(JSON.parse(fixture.savedConfig ?? '{}')).toMatchObject({
      safetyBuffer: 95000,
    });
  });

  it('does not save an incomplete buffer edit as zero', async () => {
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      safetyBuffer: 95000,
    });
    renderRoute();
    await userEvent.click(
      screen.getByRole('button', { name: 'Cash Flow Setup' }),
    );
    const input = screen.getByRole('textbox', { name: 'Safety buffer' });
    await userEvent.clear(input);
    await userEvent.type(input, '-');
    await userEvent.keyboard('{Escape}');
    expect(fixture.savedConfig).toBeUndefined();
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

  it('keeps a masked debt amount out of the accessible name', () => {
    fixture.privacyMode = true;
    fixture.withReserve = true;
    fixture.scheduledFunding = 200;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      debtAccountIds: ['savings'],
    });
    renderRoute();
    const debtCallout = screen.getByText(
      'Scheduled debt service',
    ).parentElement;
    expect(debtCallout).toHaveTextContent('-2.00');
    const privateAmount = debtCallout?.querySelector('[role="img"]');
    expect(privateAmount).toHaveAttribute('aria-label', 'Private value hidden');
    expect(privateAmount?.firstElementChild).toHaveAttribute(
      'aria-hidden',
      'true',
    );
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
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('value');
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

  it.each([1451, 0])(
    'shows zero allocated envelopes and %i cents of physical savings without a funded message',
    async reserveBalance => {
      fixture.withReserve = true;
      fixture.withBurn = true;
      fixture.reserveBalance = reserveBalance;
      fixture.rawConfig = JSON.stringify({
        ...DEFAULT_CASH_FLOW_CONFIG,
        operatingAccountIds: ['checking'],
        reserveAccountIds: ['savings'],
        reserveCategoryIds: ['emergency'],
        burnCategoryIds: ['groceries'],
        budgetBurnEnabled: true,
      });
      vi.mocked(send).mockImplementation(async name =>
        name === 'envelope-budget-month'
          ? [
              { name: 'leftover-emergency', value: 0 },
              { name: 'leftover-groceries', value: 100 },
              { name: 'budget-groceries', value: 100 },
            ]
          : [],
      );
      renderRoute();
      expect(
        await screen.findByText('No sinking funds allocated yet'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Your Budget Automations may define savings goals/),
      ).toBeInTheDocument();
      expect(
        screen
          .getAllByText(/Physical Sinking Savings cash/)
          .some(element =>
            element.textContent?.includes(
              reserveBalance === 1451 ? '14.51' : '0.00',
            ),
          ),
      ).toBe(true);
      if (reserveBalance > 0) {
        expect(
          screen.getByText(
            /Physical savings cash without envelope allocations/,
          ),
        ).toHaveTextContent('14.51');
        expect(
          screen.getByText(/This cash is not automatically available to spend/),
        ).toBeInTheDocument();
      }
      expect(
        screen.getByText('No funded sinking transfer is currently recommended'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Sinking Savings is fully funded'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Safe to move/)).not.toBeInTheDocument();
    },
  );

  it('shows native plan contributions for October and November without treating them as transfers', async () => {
    fixture.withReserve = true;
    fixture.reserveBalance = 1451;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveAccountIds: ['savings'],
      reserveCategoryIds: ['emergency'],
    });
    const currentMonth = monthUtils.currentMonth();
    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'envelope-budget-month') {
        return [
          {
            name: 'budget-emergency',
            value: args.month === currentMonth ? 5000 : 0,
          },
          { name: 'leftover-emergency', value: 0 },
        ];
      }
      if (name === 'budget/get-category-automations') {
        return {
          emergency: [
            {
              directive: 'template',
              type: 'by',
              amount: 1200,
              month: monthUtils.addMonths(currentMonth, 2),
              priority: 1,
            },
          ],
        };
      }
      if (name === 'budget/dry-run-category-template') {
        const amount = args.month === currentMonth ? 10000 : 12000;
        return { budgeted: amount, perTemplate: [amount] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    renderRoute();
    const panel = screen.getByText('Sinking Savings Plan').parentElement;
    await waitFor(() => expect(panel).toHaveTextContent('100.00'));
    expect(panel).toHaveTextContent('50.00');
    expect(panel).toHaveTextContent('14.51');
    await userEvent.click(screen.getByRole('button', { name: /Next month ·/ }));
    await waitFor(() => expect(panel).toHaveTextContent('120.00'));
    expect(panel).toHaveTextContent('0.00');
    expect(panel).toHaveTextContent('14.51');
    expect(panel).toHaveTextContent('Neither amount is transfer headroom.');
    expect(
      screen.queryByText('Sinking Savings is fully funded'),
    ).not.toBeInTheDocument();
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

  it('updates the funding checklist with the selected October and November budget month', async () => {
    fixture.withReserve = true;
    fixture.operatingBalance = 1000;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveCategoryIds: ['emergency'],
    });
    const currentMonth = monthUtils.currentMonth();
    const nextMonth = monthUtils.addMonths(currentMonth, 1);
    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'envelope-budget-month') {
        return [
          {
            name: 'to-budget',
            value: args.month === currentMonth ? 15000 : 4000,
          },
          {
            name: 'budget-emergency',
            value: args.month === currentMonth ? 5000 : 10000,
          },
          { name: 'leftover-emergency', value: 0 },
        ];
      }
      if (name === 'budget/get-category-automations') {
        return {
          emergency: [
            {
              directive: 'template',
              type: 'simple',
              monthly: 20000,
              priority: 1,
            },
          ],
        };
      }
      if (name === 'budget/dry-run-category-template') {
        const amount = args.month === currentMonth ? 20000 : 12000;
        return { budgeted: amount, perTemplate: [amount] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    renderRoute();
    const panel = screen.getByText('Payday Funding Checklist').parentElement;
    const reviewHeading = screen.getByText('Payday Review');
    const review = reviewHeading.parentElement;
    const savingsPlan = screen.getByText('Sinking Savings Plan').parentElement;
    const selector = screen.getByRole('group', { name: 'Funding month' });
    const currentButton = within(selector).getByRole('button', {
      name: /Current month ·/,
    });
    const nextButton = within(selector).getByRole('button', {
      name: /Next month ·/,
    });
    expect(selector).toHaveTextContent(
      `Current month · ${monthUtils.format(currentMonth, 'MMM yyyy')}`,
    );
    expect(selector).toHaveTextContent(
      `Next month · ${monthUtils.format(nextMonth, 'MMM yyyy')}`,
    );
    expect(currentButton).toHaveAttribute('aria-pressed', 'true');
    expect(nextButton).toHaveAttribute('aria-pressed', 'false');
    expect(
      selector.compareDocumentPosition(reviewHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(savingsPlan?.querySelector('button')).not.toBeInTheDocument();
    const calendarToday = document.querySelector(
      'article[aria-current="date"]',
    )?.textContent;
    await waitFor(() => expect(panel).toHaveTextContent('150.00'));
    expect(panel).toHaveTextContent('Suggested Funding Plan');
    expect(panel).toHaveTextContent('Total suggested allocations: 150.00');
    expect(panel).toHaveTextContent('Available to Budget');
    expect(panel).toHaveTextContent('Known target funding remaining');
    expect(panel).toHaveTextContent(
      'Budget funding is separate from Operating cash and transfer headroom.',
    );
    await userEvent.click(screen.getByText('Category funding details'));
    expect(panel).toHaveTextContent('Allocated: 50.00 · Target: 200.00');
    await userEvent.click(nextButton);
    await waitFor(() => expect(panel).toHaveTextContent('40.00'));
    expect(currentButton).toHaveAttribute('aria-pressed', 'false');
    expect(nextButton).toHaveAttribute('aria-pressed', 'true');
    expect(review).toHaveTextContent(monthUtils.format(nextMonth, 'MMMM yyyy'));
    expect(savingsPlan).toHaveTextContent(
      monthUtils.format(nextMonth, 'MMMM yyyy'),
    );
    expect(
      document.querySelector('article[aria-current="date"]')?.textContent,
    ).toBe(calendarToday);
    expect(panel).toHaveTextContent('20.00');
    expect(panel).toHaveTextContent('Total suggested allocations: 20.00');
    expect(panel).toHaveTextContent('Allocated: 100.00 · Target: 120.00');
    expect(panel).not.toHaveTextContent('150.00');
    expect(
      vi
        .mocked(send)
        .mock.calls.some(
          ([name, args]) =>
            name === 'budget/dry-run-category-template' &&
            args.month === nextMonth &&
            args.strict === true,
        ),
    ).toBe(true);
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

  it('requires an explicit preview selection and masks its monetary values', async () => {
    fixture.privacyMode = true;
    const month = '2026-10';
    render(
      <TestProviders>
        <SuggestedFundingPlan
          checklist={{
            month,
            availableToBudget: -30000,
            remainingTotal: 90000,
            knownRemainingTotal: 90000,
            isComplete: true,
            withoutRules: [],
            items: [
              {
                categoryId: 'housing',
                categoryName: 'Housing',
                priority: 1,
                target: 90000,
                allocated: 0,
                remaining: 90000,
                status: 'ready',
              },
            ],
          }}
          runway={makePaydayRunway({
            paydayDate: '2026-10-25',
            expectedIncome: 100000,
            budgetableIncome: 100000,
            budgetableDeposits: [{ amount: 100000, categoryId: 'salary' }],
            isConfigurationIncomplete: false,
            status: 'incomplete',
            currentCashWarning: null,
          })}
          incomeBudget={{
            month: '2026-10',
            manualBuffered: 0,
            incomeCategoryHold: { salary: false },
          }}
          risk={null}
          today="2026-10-20"
        />
      </TestProviders>,
    );
    const panel = screen.getByText('Suggested Funding Plan').parentElement;
    expect(panel).toHaveTextContent(
      'Selected-month Available to Budget for allocation',
    );
    expect(panel).not.toHaveTextContent('Hypothetical allocation capacity');
    await userEvent.click(
      screen.getByRole('button', { name: 'Hypothetical next payday' }),
    );
    expect(panel).toHaveTextContent('Hypothetical allocation capacity');
    expect(panel).toHaveTextContent('Total suggested allocations');
    expect(
      panel?.querySelectorAll('[aria-label="Private value hidden"]').length,
    ).toBeGreaterThanOrEqual(5);
    for (const element of panel?.querySelectorAll('[aria-label],[title]') ??
      []) {
      expect(
        `${element.getAttribute('aria-label')} ${element.getAttribute('title')}`,
      ).not.toMatch(/300\.00|700\.00|1,000\.00/);
    }
  });

  it('previews an October payday against November native Available to Budget', async () => {
    render(
      <TestProviders>
        <SuggestedFundingPlan
          checklist={{
            month: '2026-11',
            availableToBudget: -30000,
            remainingTotal: 90000,
            knownRemainingTotal: 90000,
            isComplete: true,
            withoutRules: [],
            items: [
              {
                categoryId: 'housing',
                categoryName: 'Housing',
                priority: 1,
                target: 90000,
                allocated: 0,
                remaining: 90000,
                status: 'ready',
              },
            ],
          }}
          runway={makePaydayRunway({
            paydayDate: '2026-10-27',
            expectedIncome: 100000,
            budgetableIncome: 100000,
            budgetableDeposits: [{ amount: 100000, categoryId: 'salary' }],
            isConfigurationIncomplete: false,
            status: 'scheduled-only',
            currentCashWarning: null,
          })}
          incomeBudget={{
            month: '2026-10',
            manualBuffered: 0,
            incomeCategoryHold: { salary: true },
          }}
          risk={null}
          today="2026-10-19"
        />
      </TestProviders>,
    );
    const panel = screen.getByText('Suggested Funding Plan').parentElement;
    expect(panel).not.toHaveTextContent('Hypothetical allocation capacity');
    await userEvent.click(
      screen.getByRole('button', { name: 'Hypothetical next payday' }),
    );
    expect(panel).toHaveTextContent('Hypothetical allocation capacity: 700.00');
    expect(panel).toHaveTextContent('Covered by expected income: 300.00');
    expect(panel).toHaveTextContent('Total suggested allocations: 700.00');
  });

  it('explains why auto-held income cannot fund the payday month', async () => {
    render(
      <TestProviders>
        <SuggestedFundingPlan
          checklist={{
            month: '2026-10',
            availableToBudget: 0,
            remainingTotal: 100000,
            knownRemainingTotal: 100000,
            isComplete: true,
            withoutRules: [],
            items: [
              {
                categoryId: 'housing',
                categoryName: 'Housing',
                priority: 1,
                target: 100000,
                allocated: 0,
                remaining: 100000,
                status: 'ready',
              },
            ],
          }}
          runway={makePaydayRunway({
            paydayDate: '2026-10-27',
            expectedIncome: 100000,
            budgetableIncome: 100000,
            budgetableDeposits: [{ amount: 100000, categoryId: 'salary' }],
          })}
          incomeBudget={{
            month: '2026-10',
            manualBuffered: 0,
            incomeCategoryHold: { salary: true },
          }}
          risk={null}
          today="2026-10-19"
        />
      </TestProviders>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Hypothetical next payday' }),
    );
    const panel = screen.getByText('Suggested Funding Plan').parentElement;
    expect(panel).toHaveTextContent('held for next month');
    expect(panel).not.toHaveTextContent('Hypothetical allocation capacity');
  });

  it('shows a fundable scheduled payday only in the explicit preview', async () => {
    fixture.withReserve = true;
    fixture.futureOperatingBalance = 200000;
    fixture.futureOperatingIncome = 100000;
    fixture.attentionSchedules = [
      {
        id: 'payday',
        name: 'Payday',
        next_date: monthUtils.addDays(monthUtils.currentDay(), 1),
        _account: 'checking',
        _payee: '',
        _amount: 100000,
        posts_transaction: true,
        _date: { frequency: 'weekly', start: monthUtils.currentDay() },
      },
    ];
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      paydayScheduleIds: ['payday'],
    });
    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'get-cell') {
        return {
          name: 'native-income-hold',
          value: args.name === 'buffered' ? 0 : false,
        };
      }
      if (name === 'envelope-budget-month') {
        return [
          { name: 'to-budget', value: 20000 },
          { name: 'budget-emergency', value: 0 },
        ];
      }
      if (name === 'budget/get-category-automations') {
        return {
          emergency: [
            {
              directive: 'template',
              type: 'simple',
              monthly: 60000,
              priority: 1,
            },
          ],
        };
      }
      if (name === 'budget/dry-run-category-template') {
        return { budgeted: 60000, perTemplate: [60000] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    renderRoute();
    if (
      monthUtils.addDays(monthUtils.currentDay(), 1).slice(0, 7) !==
      monthUtils.currentMonth()
    ) {
      await userEvent.click(
        screen.getByRole('button', { name: /Next month ·/ }),
      );
    }
    const panel = screen.getByText('Payday Funding Checklist').parentElement;
    await waitFor(() =>
      expect(panel).toHaveTextContent('Total suggested allocations: 200.00'),
    );
    expect(panel).not.toHaveTextContent('Hypothetical allocation capacity');
    await userEvent.click(
      screen.getByRole('button', { name: 'Hypothetical next payday' }),
    );
    await waitFor(() =>
      expect(panel).toHaveTextContent(
        'Hypothetical allocation capacity: 1,200.00',
      ),
    );
    expect(panel).toHaveTextContent('Total suggested allocations: 600.00');
    expect(panel).toHaveTextContent(
      'Not yet assigned in this scenario: 600.00',
    );
    expect(
      vi
        .mocked(send)
        .mock.calls.every(([name]) =>
          [
            'envelope-budget-month',
            'get-cell',
            'budget/get-category-automations',
            'budget/dry-run-category-template',
          ].includes(name),
        ),
    ).toBe(true);
  });

  it('keeps a valid sinking target useful beside a Goal-only category', async () => {
    fixture.withReserve = true;
    fixture.withBurn = true;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
    });
    vi.mocked(send).mockImplementation(async (name, args) => {
      if (name === 'envelope-budget-month') {
        return [
          { name: 'to-budget', value: 20000 },
          { name: 'budget-emergency', value: 0 },
          { name: 'budget-groceries', value: 0 },
        ];
      }
      if (name === 'budget/get-category-automations') {
        return args === 'emergency'
          ? {
              emergency: [
                {
                  directive: 'template',
                  type: 'simple',
                  monthly: 10000,
                  priority: 1,
                },
              ],
            }
          : { groceries: [{ directive: 'goal', type: 'goal', amount: 25000 }] };
      }
      if (name === 'budget/dry-run-category-template') {
        return { budgeted: 10000, perTemplate: [10000] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    renderRoute();
    const panel = screen.getByText('Payday Funding Checklist').parentElement;
    await waitFor(() =>
      expect(panel).toHaveTextContent('Total suggested allocations: 100.00'),
    );
    expect(panel).toHaveTextContent('Conditional plan');
    await userEvent.click(screen.getByText('Category funding details'));
    expect(panel).toHaveTextContent('Goal only; no monthly funding amount');
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

  it('uses the updated native budget without previewing a posted payday again', async () => {
    fixture.withReserve = true;
    fixture.futureOperatingBalance = 150000;
    fixture.futureOperatingIncome = 0;
    fixture.attentionSchedules = [
      {
        id: 'payday',
        name: 'Payday',
        next_date: monthUtils.addDays(monthUtils.currentDay(), 1),
        _account: 'checking',
        _payee: '',
        _amount: 100000,
        posts_transaction: true,
        _date: { frequency: 'weekly', start: monthUtils.currentDay() },
      },
    ];
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      paydayScheduleIds: ['payday'],
    });
    vi.mocked(send).mockImplementation(async name => {
      if (name === 'envelope-budget-month') {
        return [
          { name: 'to-budget', value: 100000 },
          { name: 'budget-emergency', value: 0 },
        ];
      }
      if (name === 'budget/get-category-automations') {
        return {
          emergency: [
            {
              directive: 'template',
              type: 'simple',
              monthly: 120000,
              priority: 1,
            },
          ],
        };
      }
      if (name === 'budget/dry-run-category-template') {
        return { budgeted: 120000, perTemplate: [120000] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    renderRoute();
    const panel = screen.getByText('Payday Funding Checklist').parentElement;
    await waitFor(() =>
      expect(panel).toHaveTextContent('Total suggested allocations: 1,000.00'),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Hypothetical next payday' }),
    );
    expect(panel).toHaveTextContent('Preview unavailable');
    expect(panel).not.toHaveTextContent('Hypothetical allocation capacity');
  });

  it('recalculates an equal-priority what-if split when available funds change', async () => {
    const makeChecklist = (availableToBudget: number) => ({
      month: '2026-10',
      availableToBudget,
      remainingTotal: 18000,
      knownRemainingTotal: 18000,
      isComplete: true,
      withoutRules: [],
      items: [
        {
          categoryId: 'first',
          categoryName: 'First',
          priority: 1,
          target: 2000,
          allocated: 0,
          remaining: 2000,
          status: 'ready' as const,
        },
        {
          categoryId: 'choice-a',
          categoryName: 'Choice A',
          priority: 2,
          target: 8000,
          allocated: 0,
          remaining: 8000,
          status: 'ready' as const,
        },
        {
          categoryId: 'choice-b',
          categoryName: 'Choice B',
          priority: 2,
          target: 8000,
          allocated: 0,
          remaining: 8000,
          status: 'ready' as const,
        },
      ],
    });
    const { rerender } = render(
      <TestProviders>
        <SuggestedFundingPlan
          checklist={makeChecklist(10000)}
          runway={null}
          incomeBudget={null}
          risk={null}
          today="2026-10-20"
        />
      </TestProviders>,
    );
    const panel = screen.getByText('Suggested Funding Plan').parentElement;
    expect(panel).toHaveTextContent('Available for this priority group: 80.00');
    expect(panel).toHaveTextContent('Conditional plan');
    expect(panel).toHaveTextContent('Not yet assigned in this scenario: 80.00');
    const input = screen.getByLabelText(/Choice A/);
    await userEvent.clear(input);
    await userEvent.type(input, '30');
    await userEvent.tab();
    expect(panel).toHaveTextContent('Total suggested allocations: 50.00');
    rerender(
      <TestProviders>
        <SuggestedFundingPlan
          checklist={makeChecklist(9000)}
          runway={null}
          incomeBudget={null}
          risk={null}
          today="2026-10-20"
        />
      </TestProviders>,
    );
    expect(panel).toHaveTextContent('Total suggested allocations: 20.00');
    expect(panel).toHaveTextContent('Available for this priority group: 70.00');
  });

  it('hides checklist and plan amounts on a narrow screen in Privacy Mode', async () => {
    fixture.privacyMode = true;
    vi.stubGlobal('innerWidth', 400);
    try {
      render(
        <MemoryRouter>
          <TestProviders>
            <PaydayChecklist
              month="2026-10"
              checklist={{
                month: '2026-10',
                availableToBudget: 12345,
                remainingTotal: 5000,
                knownRemainingTotal: 5000,
                isComplete: true,
                withoutRules: [],
                items: [
                  {
                    categoryId: 'housing',
                    categoryName: 'Housing',
                    priority: 1,
                    target: 10000,
                    allocated: 5000,
                    remaining: 5000,
                    status: 'ready',
                  },
                ],
              }}
              runway={null}
              incomeBudget={null}
              risk={null}
              obligations={{ obligations: [], isCoverageComplete: true }}
              today="2026-10-20"
              isLoading={false}
              isEnvelope
              hasCategoryData
              hasCategories
            />
          </TestProviders>
        </MemoryRouter>,
      );
      const panel = screen.getByText('Payday Funding Checklist').parentElement;
      await userEvent.click(screen.getByText('Category funding details'));
      expect(panel).toHaveTextContent('Private value hidden');
      expect(panel).not.toHaveTextContent(/123\.45|100\.00|73\.45|50\.00/);
      for (const element of panel?.querySelectorAll('[aria-label],[title]') ??
        []) {
        expect(
          `${element.getAttribute('aria-label')} ${element.getAttribute('title')}`,
        ).not.toMatch(/123\.45|100\.00|73\.45|50\.00/);
      }
    } finally {
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it('warns when scheduled expense review ends before the funding month', () => {
    render(
      <MemoryRouter>
        <TestProviders>
          <PaydayChecklist
            month="2026-11"
            checklist={{
              month: '2026-11',
              availableToBudget: 0,
              remainingTotal: 0,
              knownRemainingTotal: 0,
              isComplete: true,
              withoutRules: [],
              items: [],
            }}
            obligations={{ obligations: [], isCoverageComplete: false }}
            runway={null}
            incomeBudget={null}
            risk={null}
            today="2026-10-20"
            isLoading={false}
            isEnvelope
            hasCategoryData
            hasCategories
          />
        </TestProviders>
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/Scheduled expense coverage is incomplete/),
    ).toBeInTheDocument();
  });

  it('keeps the funding checklist incomplete until native budget cells arrive, then refreshes on a cell change', async () => {
    fixture.withReserve = true;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveCategoryIds: ['emergency'],
    });
    let resolveBudget:
      | ((cells: Array<{ name: string; value: number }>) => void)
      | undefined;
    const pendingBudget = new Promise<Array<{ name: string; value: number }>>(
      resolve => {
        resolveBudget = resolve;
      },
    );
    let budget = pendingBudget;
    vi.mocked(send).mockImplementation(async name => {
      if (name === 'envelope-budget-month') return budget;
      if (name === 'budget/get-category-automations') {
        return {
          emergency: [
            {
              directive: 'template',
              type: 'simple',
              monthly: 20000,
              priority: 1,
            },
          ],
        };
      }
      if (name === 'budget/dry-run-category-template') {
        return { budgeted: 20000, perTemplate: [20000] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    renderRoute();
    const panel = screen.getByText('Payday Funding Checklist').parentElement;
    expect(panel).toHaveTextContent('Loading funding checklist.');
    expect(panel).not.toHaveTextContent(
      'Configured targets are fully allocated',
    );
    resolveBudget?.([
      { name: 'to-budget', value: 30000 },
      { name: 'budget-emergency', value: 5000 },
      { name: 'leftover-emergency', value: 0 },
    ]);
    await waitFor(() => expect(panel).toHaveTextContent('150.00'));
    budget = Promise.resolve([
      { name: 'to-budget', value: 15000 },
      { name: 'budget-emergency', value: 10000 },
      { name: 'leftover-emergency', value: 0 },
    ]);
    const onCellsChanged = vi
      .mocked(listen)
      .mock.calls.find(([name]) => name === 'cells-changed')?.[1];
    expect(onCellsChanged).toBeDefined();
    act(() =>
      onCellsChanged?.([
        {
          name: `${monthUtils.sheetForMonth(monthUtils.currentMonth())}!budget-emergency`,
          value: 10000,
        },
      ]),
    );
    await waitFor(() => expect(panel).toHaveTextContent('100.00'));
    expect(panel).toHaveTextContent('Available to Budget');
    expect(panel).toHaveTextContent('150.00');
  });

  it('redacts checklist totals and category funding in Privacy Mode', async () => {
    fixture.withReserve = true;
    fixture.privacyMode = true;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
    });
    vi.mocked(send).mockImplementation(async name => {
      if (name === 'envelope-budget-month') {
        return [
          { name: 'to-budget', value: 12345 },
          { name: 'budget-emergency', value: 5000 },
          { name: 'leftover-emergency', value: 0 },
        ];
      }
      if (name === 'budget/get-category-automations') {
        return {
          emergency: [
            {
              directive: 'template',
              type: 'simple',
              monthly: 20000,
              priority: 1,
            },
          ],
        };
      }
      if (name === 'budget/dry-run-category-template') {
        return { budgeted: 20000, perTemplate: [20000] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    renderRoute();
    const panel = screen.getByText('Payday Funding Checklist').parentElement;
    await waitFor(() =>
      expect(panel).toHaveTextContent('Known target funding remaining'),
    );
    await userEvent.click(screen.getByText('Category funding details'));
    expect(
      panel?.querySelectorAll('[aria-hidden="true"]').length,
    ).toBeGreaterThanOrEqual(3);
    for (const element of panel?.querySelectorAll('[aria-label],[title]') ??
      []) {
      expect(
        `${element.getAttribute('aria-label')} ${element.getAttribute('title')}`,
      ).not.toMatch(/123\.45|150\.00/);
    }
  });

  it('masks Sinking Savings Plan amounts and leaves accessibility labels free of private values', async () => {
    fixture.withReserve = true;
    fixture.privacyMode = true;
    fixture.reserveBalance = 1451;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveAccountIds: ['savings'],
      reserveCategoryIds: ['emergency'],
    });
    vi.mocked(send).mockImplementation(async name => {
      if (name === 'envelope-budget-month') {
        return [
          { name: 'budget-emergency', value: 0 },
          { name: 'leftover-emergency', value: 0 },
        ];
      }
      if (name === 'budget/get-category-automations') {
        return {
          emergency: [
            {
              directive: 'template',
              type: 'periodic',
              amount: 150,
              period: { period: 'month', amount: 1 },
              starting: '2026-01-01',
              priority: 1,
            },
          ],
        };
      }
      if (name === 'budget/dry-run-category-template') {
        return { budgeted: 15000, perTemplate: [15000] };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    renderRoute();
    const panel = screen.getByText('Sinking Savings Plan').parentElement;
    await waitFor(() => expect(panel).toHaveTextContent('Emergency'));
    expect(panel?.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(
      panel?.querySelector('[role="img"][aria-label="Private value hidden"]'),
    ).toBeInTheDocument();
    for (const element of panel?.querySelectorAll('[aria-label],[title]') ??
      []) {
      expect(
        element.getAttribute('aria-label') ?? element.getAttribute('title'),
      ).not.toMatch(/150\.00|14\.51/);
    }
  });

  it('shows available allocations and balances while an unsupported plan is unavailable', async () => {
    fixture.withReserve = true;
    fixture.reserveBalance = 1451;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveAccountIds: ['savings'],
      reserveCategoryIds: ['emergency'],
    });
    vi.mocked(send).mockImplementation(async name => {
      if (name === 'envelope-budget-month') {
        return [
          { name: 'budget-emergency', value: 5000 },
          { name: 'leftover-emergency', value: 0 },
        ];
      }
      if (name === 'budget/get-category-automations') {
        return {
          emergency: [{ type: 'goal', amount: 1000, directive: 'goal' }],
        };
      }
      throw new Error(`Unexpected API call: ${name}`);
    });
    renderRoute();
    const panel = screen.getByText('Sinking Savings Plan').parentElement;
    await waitFor(() =>
      expect(panel).toHaveTextContent(
        'Some plan data is unavailable or unsupported.',
      ),
    );
    expect(panel).toHaveTextContent('Unsupported automation configuration');
    expect(panel).toHaveTextContent('50.00');
    expect(panel).toHaveTextContent('14.51');
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(
          ([name]) => name === 'budget/dry-run-category-template',
        ),
    ).toHaveLength(0);
  });

  it('withholds sweep advice when a selected sinking budget cell is missing', async () => {
    fixture.withReserve = true;
    fixture.rawConfig = JSON.stringify({
      ...DEFAULT_CASH_FLOW_CONFIG,
      operatingAccountIds: ['checking'],
      reserveAccountIds: ['savings'],
      reserveCategoryIds: ['emergency'],
    });
    vi.mocked(send).mockImplementation(async () => []);
    renderRoute();
    expect(
      await screen.findByText('Sinking Savings backing data is unavailable.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Sinking Savings advice is incomplete'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        /Any affected planned total or planning gap is shown as unavailable/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Safe to move/)).not.toBeInTheDocument();
    expect(screen.queryByText(/fully funded/)).not.toBeInTheDocument();
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
      expect(screen.getByText('Cash Flow Risk')).toBeInTheDocument();
      expect(
        screen.getByText(/Budget Burn data is incomplete/),
      ).toBeInTheDocument();
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
          ([name, args]) =>
            name === 'budget/get-category-automations' && args === 'groceries',
        ),
    ).toHaveLength(2);
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(
          ([name, args]) =>
            name === 'budget/dry-run-category-template' && args.strict !== true,
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
    await waitFor(() =>
      expect(
        vi
          .mocked(send)
          .mock.calls.filter(
            ([name, args]) =>
              name === 'budget/get-category-automations' &&
              args === 'groceries',
          ),
      ).toHaveLength(3),
    );
    act(() => onSync?.({ type: 'success', tables: ['categories'] }));
    await waitFor(() =>
      expect(
        vi
          .mocked(send)
          .mock.calls.filter(
            ([name, args]) =>
              name === 'budget/get-category-automations' &&
              args === 'groceries',
          ),
      ).toHaveLength(5),
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
