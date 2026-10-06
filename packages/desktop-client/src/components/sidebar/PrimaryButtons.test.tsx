import { MemoryRouter } from 'react-router';

import { render, screen } from '@testing-library/react';
import { it, vi } from 'vitest';

import { TestProviders } from '#mocks';

import { PrimaryButtons } from './PrimaryButtons';

vi.mock('#hooks/useSyncServerStatus', () => ({
  useSyncServerStatus: () => 'no-server',
}));
vi.mock('#hooks/useIsTestEnv', () => ({ useIsTestEnv: () => false }));

it('shows Cash Flow between Budget and Reports', () => {
  render(
    <MemoryRouter>
      <TestProviders>
        <PrimaryButtons />
      </TestProviders>
    </MemoryRouter>,
  );
  const titles = screen.getAllByRole('link').map(link => link.textContent);
  expect(titles.slice(0, 4)).toEqual([
    'Budget',
    'Cash Flow',
    'Reports',
    'Schedules',
  ]);
  expect(screen.getByRole('link', { name: 'Cash Flow' })).toHaveAttribute(
    'href',
    '/cash-flow',
  );
});
