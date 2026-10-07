import type { ForecastResult } from '@actual-app/core/types/models/forecast';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TestProviders } from '#mocks';

import { buildBudgetBurnProjection } from './budgetBurn';
import { CashFlowCalendarView } from './CashFlowCalendarView';

const forecastData: ForecastResult = {
  dataPoints: ['2024-10-31', '2024-11-01'].map(date => ({
    date,
    accountId: 'checking',
    accountName: 'Checking',
    balance: 1000,
    transactions: [],
  })),
  lowestBalance: {
    date: '2024-10-31',
    balance: 1000,
    accountId: 'checking',
    accountName: 'Checking',
  },
  forecastStartDate: '2024-10-30',
  forecastEndDate: '2024-11-30',
};

const budgetBurn = buildBudgetBurnProjection({
  enabled: true,
  categories: [
    { categoryId: 'groceries', categoryName: 'Groceries', leftover: 50 },
  ],
  forecastData,
  today: '2024-10-30',
  endDate: '2024-11-30',
  monthBudgets: {
    '2024-10': { groceries: 50 },
    '2024-11': { groceries: 200 },
  },
});

describe('Cash Flow Calendar visible month', () => {
  it('explains Manual events without placing amounts in accessibility text', () => {
    const scheduledForecast: ForecastResult = {
      ...forecastData,
      dataPoints: [
        {
          date: '2024-10-31',
          accountId: 'checking',
          accountName: 'Checking',
          balance: 700,
          transactions: [
            {
              amount: -300,
              isTransfer: true,
              payee: 'Move to savings',
              scheduleId: 'manual-transfer',
              scheduleName: 'Move to savings',
            },
          ],
        },
      ],
    };
    render(
      <TestProviders>
        <CashFlowCalendarView
          forecastData={scheduledForecast}
          start="2024-10-30"
          end="2024-10-31"
          manualScheduleIds={new Set(['manual-transfer'])}
        />
      </TestProviders>,
    );
    const indicator = screen.getByText('Manual');
    expect(indicator).toHaveAttribute(
      'title',
      'Manual schedule — Actual will not automatically add this transaction.',
    );
    expect(indicator.getAttribute('aria-label')).not.toMatch(/\d/);
    expect(indicator.getAttribute('title')).not.toMatch(/\d/);
    expect(indicator.parentElement).toHaveTextContent('Transfer');
    expect(indicator.parentElement).toHaveTextContent('-3.00');
  });

  it('updates the burn summary and category details when navigating months', async () => {
    render(
      <TestProviders>
        <CashFlowCalendarView
          forecastData={forecastData}
          start="2024-10-30"
          end="2024-11-30"
          budgetBurn={budgetBurn}
          selectedBurnCategoryCount={1}
        />
      </TestProviders>,
    );
    expect(
      screen.getByText(/October remaining burn/).parentElement,
    ).toHaveTextContent('0.50');
    expect(
      screen.queryByText(/November remaining burn/),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(
      screen.getByText(/November remaining burn/).parentElement,
    ).toHaveTextContent('2.00');
    await userEvent.click(
      screen.getByRole('button', { name: 'Category details' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Budget Burn categories' }),
    ).toHaveTextContent('November 2024');
    expect(
      screen.getByRole('dialog', { name: 'Budget Burn categories' }),
    ).toHaveTextContent('2.00');
  });
});
