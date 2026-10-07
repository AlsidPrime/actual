import type { ScheduleStatuses } from '@actual-app/core/shared/schedules';
import type { ScheduleEntity } from '@actual-app/core/types/models';
import { describe, expect, it } from 'vitest';

import { deriveCashFlowAttention } from './deriveCashFlowAttention';

type ManualSchedule = Pick<
  ScheduleEntity,
  | 'id'
  | 'name'
  | 'next_date'
  | '_account'
  | '_payee'
  | '_amount'
  | 'posts_transaction'
>;

function schedule(
  id: string,
  overrides: Partial<ManualSchedule> = {},
): ManualSchedule {
  return {
    id,
    name: id,
    next_date: '2026-10-12',
    _account: 'checking',
    _payee: '',
    _amount: -18432,
    posts_transaction: false,
    ...overrides,
  };
}

function derive(
  schedules: ManualSchedule[],
  entries: [
    string,
    ScheduleStatuses extends Map<string, infer Status> ? Status : never,
  ][],
  accounts = ['checking', 'savings'],
) {
  return deriveCashFlowAttention(
    schedules,
    new Map(entries),
    new Set(accounts),
  );
}

describe('Cash Flow manual schedule attention', () => {
  it('uses only native due and missed statuses for manual schedules in selected accounts', () => {
    const schedules = [
      schedule('operating-due'),
      schedule('reserve-missed', { _account: 'savings' }),
      schedule('outside-due', { _account: 'outside' }),
      schedule('auto-due', { posts_transaction: true }),
      schedule('auto-missed', { posts_transaction: true }),
      schedule('upcoming'),
      schedule('scheduled'),
      schedule('paid'),
      schedule('completed'),
    ];
    const result = derive(schedules, [
      ['operating-due', 'due'],
      ['reserve-missed', 'missed'],
      ['outside-due', 'due'],
      ['auto-due', 'due'],
      ['auto-missed', 'missed'],
      ['upcoming', 'upcoming'],
      ['scheduled', 'scheduled'],
      ['paid', 'paid'],
      ['completed', 'completed'],
    ]);
    expect(result.attention.map(item => item.id)).toEqual([
      'reserve-missed',
      'operating-due',
    ]);
    expect(result.upcomingCount).toBe(2);
    expect(result.nextUpcoming?.id).toBe('scheduled');
  });

  it('orders oldest missed first, then due by stable name and id', () => {
    const schedules = [
      schedule('due-b', { name: 'Same' }),
      schedule('missed-new', { next_date: '2026-10-05' }),
      schedule('due-a', { name: 'Same' }),
      schedule('missed-old', { next_date: '2026-10-01' }),
    ];
    const result = derive(schedules, [
      ['due-b', 'due'],
      ['missed-new', 'missed'],
      ['due-a', 'due'],
      ['missed-old', 'missed'],
    ]);
    expect(result.attention.map(item => item.id)).toEqual([
      'missed-old',
      'missed-new',
      'due-a',
      'due-b',
    ]);
  });

  it('lists a manual transfer schedule once and never infers counterparty-only scope', () => {
    const result = derive(
      [
        schedule('transfer'),
        schedule('counterparty-only', { _account: 'outside' }),
      ],
      [
        ['transfer', 'missed'],
        ['counterparty-only', 'due'],
      ],
      ['checking'],
    );
    expect(result.attention.map(item => item.id)).toEqual(['transfer']);
  });

  it('counts only future manual schedules and picks the earliest next occurrence', () => {
    const result = derive(
      [
        schedule('late', { next_date: '2026-12-01' }),
        schedule('soon', { next_date: '2026-10-12' }),
        schedule('due'),
        schedule('missed'),
        schedule('auto', { posts_transaction: true }),
        schedule('outside', { _account: 'outside' }),
      ],
      [
        ['late', 'scheduled'],
        ['soon', 'upcoming'],
        ['due', 'due'],
        ['missed', 'missed'],
        ['auto', 'upcoming'],
        ['outside', 'upcoming'],
      ],
    );
    expect(result.upcomingCount).toBe(2);
    expect(result.nextUpcoming?.id).toBe('soon');
    expect(result.nextUpcoming?.next_date).toBe('2026-10-12');
  });
});
