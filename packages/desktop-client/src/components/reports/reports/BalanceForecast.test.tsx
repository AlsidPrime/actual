import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router';

import { send } from '@actual-app/core/platform/client/connection';
import type { BalanceForecastWidget } from '@actual-app/core/types/models';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Header } from '#components/reports/Header';
import { TestProviders } from '#mocks';

import { BalanceForecast } from './BalanceForecast';

const report = vi.hoisted((): { widget?: BalanceForecastWidget } => ({}));

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(async (name: string) => {
    if (name === 'forecast/generate') {
      return {
        dataPoints: [],
        lowestBalance: {
          date: '2024-03-01',
          balance: 0,
          accountId: '',
          accountName: '',
        },
        forecastStartDate: '2024-03-01',
        forecastEndDate: '2024-03-31',
      };
    }
    return null;
  }),
}));
vi.mock('#hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'checking', name: 'Checking', offbudget: false, closed: false },
    ],
  }),
}));
vi.mock('#hooks/useDashboardWidget', () => ({
  useDashboardWidget: () => ({ data: report.widget, isLoading: false }),
}));
// Keep the real visualization and account controls; unrelated report filters
// and date-picker behavior have their own tests.
vi.mock('#components/reports/Header', () => ({
  Header: ({ inlineContent, children }: ComponentProps<typeof Header>) => (
    <div>
      {inlineContent}
      {children}
    </div>
  ),
}));

beforeEach(() => {
  report.widget = undefined;
  vi.mocked(send).mockClear();
});

async function openCalendar() {
  render(
    <MemoryRouter>
      <TestProviders>
        <BalanceForecast />
      </TestProviders>
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Chart' }));
  await userEvent.click(screen.getByText('Calendar'));
}

describe('Calendar account selection', () => {
  it('starts empty and retains explicit session choices without changing Chart defaults', async () => {
    await openCalendar();
    expect(
      screen.getByText(
        'Select the accounts whose available cash you want to forecast.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '0 accounts' }),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(send)
        .mock.calls.filter(([name]) => name === 'forecast/generate'),
    ).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: '0 accounts' }));
    await userEvent.click(screen.getByLabelText('Checking'));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        'forecast/generate',
        expect.objectContaining({
          accountIds: ['checking'],
          includeAccountlessSchedules: false,
          source: 'schedules',
        }),
      ),
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    await userEvent.click(screen.getByText('Chart'));
    expect(
      screen.queryByRole('button', { name: '1 accounts' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Chart' }));
    await userEvent.click(screen.getByText('Calendar'));
    expect(
      screen.getByRole('button', { name: '1 accounts' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '1 accounts' }));
    await userEvent.click(screen.getByLabelText('Checking'));
    await userEvent.keyboard('{Escape}');
    expect(
      screen.getByRole('button', { name: '0 accounts' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Select the accounts whose available cash you want to forecast.',
      ),
    ).toBeInTheDocument();
    const requests = vi
      .mocked(send)
      .mock.calls.filter(([name]) => name === 'forecast/generate');
    expect(requests.length).toBeGreaterThan(1);
    expect(requests[0][1]).not.toHaveProperty('accountIds');

    // the very next request might be the calendar query
    const calendarQuery = requests.find(
      ([, request]) =>
        'accountIds' in request &&
        Array.isArray(request.accountIds) &&
        request.accountIds.includes('checking'),
    );
    expect(calendarQuery).toBeDefined();
    if (calendarQuery) {
      expect(calendarQuery[1]).toMatchObject({ accountIds: ['checking'] });
    }
  });

  it.each([
    { calendarAccounts: [] },
    { calendarAccounts: ['checking'] },
    { calendarAccounts: undefined },
  ])(
    'honors the saved account selection $calendarAccounts',
    async ({ calendarAccounts }) => {
      report.widget = {
        id: 'forecast',
        dashboard_page_id: 'dashboard',
        type: 'balance-forecast-card',
        x: 0,
        y: 0,
        width: 4,
        height: 4,
        tombstone: false,
        meta: { calendarAccounts },
      };
      await openCalendar();
      expect(
        screen.getByRole('button', {
          name: `${calendarAccounts?.length ?? 0} accounts`,
        }),
      ).toBeInTheDocument();
      if (calendarAccounts && calendarAccounts.length > 0) {
        await waitFor(() =>
          expect(send).toHaveBeenCalledWith(
            'forecast/generate',
            expect.objectContaining({
              accountIds: calendarAccounts,
              includeAccountlessSchedules: false,
            }),
          ),
        );
      } else {
        expect(
          screen.getByText(
            'Select the accounts whose available cash you want to forecast.',
          ),
        ).toBeInTheDocument();
      }
    },
  );

  it('saves independent account selections for chart and calendar', async () => {
    report.widget = {
      id: 'forecast',
      dashboard_page_id: 'dashboard',
      type: 'balance-forecast-card',
      x: 0,
      y: 0,
      width: 4,
      height: 4,
      tombstone: false,
      meta: { accounts: ['different'] },
    };

    render(
      <MemoryRouter>
        <TestProviders>
          <BalanceForecast />
        </TestProviders>
      </MemoryRouter>,
    );

    // Switch to Calendar
    await userEvent.click(await screen.findByRole('button', { name: 'Chart' }));
    await userEvent.click(screen.getByText('Calendar'));

    // Select account in Calendar
    await userEvent.click(screen.getByRole('button', { name: '0 accounts' }));
    await userEvent.click(screen.getByLabelText('Checking'));
    await userEvent.keyboard('{Escape}');

    // Save widget
    await userEvent.click(screen.getByRole('button', { name: 'Save widget' }));

    expect(send).toHaveBeenCalledWith(
      'dashboard-update-widget',
      expect.objectContaining({
        meta: expect.objectContaining({
          accounts: ['different'],
          calendarAccounts: ['checking'],
        }),
      }),
    );
  });
});
