import { MemoryRouter } from 'react-router';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { TestProviders } from '#mocks';

import { CashFlowPaydayReview } from './CashFlowPaydayReview';

const fixture = vi.hoisted(() => ({ privacyMode: false }));

vi.mock('#hooks/usePrivacyMode', () => ({
  usePrivacyMode: () => fixture.privacyMode,
}));

afterEach(() => {
  cleanup();
  fixture.privacyMode = false;
});

function renderReview() {
  return render(
    <MemoryRouter>
      <TestProviders>
        <CashFlowPaydayReview
          review={{ action: 'transfer', reason: 'transfer' }}
          runway={null}
          savingsPlan={{
            month: '2026-11',
            status: 'ready',
            categories: [],
            plannedTotal: 30000,
            monthlyAllocationTotal: 30000,
            planningGap: 0,
            currentEnvelopeTotal: 30000,
            physicalCash: 10000,
          }}
          advisor={{
            status: 'safe',
            protectedTarget: 30000,
            reserveAccountBalance: 10000,
            reserveFundingGap: 20000,
            scheduledReserveFunding: 0,
            effectiveReserveFundingGap: 20000,
            minimumOperatingCash: 100000,
            availableOperatingHeadroom: 80000,
            safeToMove: 20000,
          }}
          planMonth="2026-11"
        />
      </TestProviders>
    </MemoryRouter>,
  );
}

it('shows one primary action and redacts amounts in Privacy Mode', () => {
  renderReview();
  expect(screen.getByText('Review savings transfer')).toBeInTheDocument();
  expect(
    screen.getByText('November 2026', { exact: false }),
  ).toBeInTheDocument();
  expect(screen.getByText('200.00')).toBeInTheDocument();

  cleanup();
  fixture.privacyMode = true;
  const { container } = renderReview();
  expect(screen.getByText('Review savings transfer')).toBeInTheDocument();
  expect(
    screen.getAllByRole('img', { name: 'Private value hidden' }),
  ).toHaveLength(4);
  for (const element of container.querySelectorAll('[aria-label],[title]')) {
    expect(
      `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''}`,
    ).not.toMatch(/200\.00|300\.00/);
  }
});
