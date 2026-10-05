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
    for (const [, request] of requests.slice(1)) {
      expect(request).toMatchObject({ accountIds: ['checking'] });
    }
  });

  it.each([
    { accounts: [] },
    { accounts: ['checking'] },
    { accounts: undefined },
  ])('honors the saved account selection $accounts', async ({ accounts }) => {
    report.widget = {
      id: 'forecast',
      dashboard_page_id: 'dashboard',
      type: 'balance-forecast-card',
      x: 0,
      y: 0,
      width: 4,
      height: 4,
      tombstone: false,
      meta: { accounts },
    };
    await openCalendar();
    expect(
      screen.getByRole('button', { name: `${accounts?.length ?? 0} accounts` }),
    ).toBeInTheDocument();
    if (accounts && accounts.length > 0) {
      await waitFor(() =>
        expect(send).toHaveBeenCalledWith(
          'forecast/generate',
          expect.objectContaining({
            accountIds: accounts,
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
  });
});
