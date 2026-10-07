import { MemoryRouter } from 'react-router';

import type { ScheduleEntity } from '@actual-app/core/types/models';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestProviders } from '#mocks';

import { CashFlowAttention } from './CashFlowAttention';
import type { CashFlowAttentionItem } from './deriveCashFlowAttention';

const fixture = vi.hoisted(() => ({ privacyMode: false }));

vi.mock('#hooks/usePrivacyMode', () => ({
  usePrivacyMode: () => fixture.privacyMode,
}));

function attentionItem(
  id: string,
  amount: ScheduleEntity['_amount'],
  status: CashFlowAttentionItem['status'] = 'due',
): CashFlowAttentionItem {
  return {
    id,
    name: id,
    next_date: '2024-10-05',
    _account: 'checking',
    _payee: '',
    _amount: amount,
    status,
  };
}

function renderAttention(items: CashFlowAttentionItem[]) {
  render(
    <MemoryRouter>
      <TestProviders>
        <CashFlowAttention
          attention={items}
          upcomingCount={0}
          nextUpcoming={undefined}
          accountNames={{ checking: 'Checking' }}
          payeeNames={{}}
        />
      </TestProviders>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fixture.privacyMode = false;
});

describe('Cash Flow attention amounts', () => {
  it('marks positive income explicitly while expenses and zero show normal magnitude', () => {
    renderAttention([
      attentionItem('Income', 500),
      attentionItem('Expense', -500, 'missed'),
      attentionItem('Zero', 0),
    ]);

    const income = screen.getByText('Income').parentElement;
    const expense = screen.getByText('Expense').parentElement;
    const zero = screen.getByText('Zero').parentElement;
    if (!income || !expense || !zero) {
      throw new Error('Attention item is missing');
    }
    expect(within(income).getByText('+5.00')).toBeInTheDocument();
    expect(within(expense).getByText('5.00')).toBeInTheDocument();
    expect(within(zero).getByText('0.00')).toBeInTheDocument();
    expect(income).toHaveTextContent('Due today');
    expect(expense).toHaveTextContent('Missed October 5');
  });

  it('redacts amounts in privacy mode and keeps them out of accessibility attributes', () => {
    fixture.privacyMode = true;
    renderAttention([
      attentionItem('Income', 500),
      attentionItem('Expense', -500, 'missed'),
      attentionItem('Zero', 0),
    ]);

    for (const name of ['Income', 'Expense', 'Zero']) {
      const item = screen.getByText(name).parentElement;
      expect(item?.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    }
    for (const element of document.querySelectorAll('[aria-label],[title]')) {
      expect(
        `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''}`,
      ).not.toMatch(/[+]?[50]\.00/);
    }
  });
});
