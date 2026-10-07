import type { ScheduleStatuses } from '@actual-app/core/shared/schedules';
import type { ScheduleEntity } from '@actual-app/core/types/models';

export type CashFlowAttentionItem = Pick<
  ScheduleEntity,
  'id' | 'name' | 'next_date' | '_account' | '_payee' | '_amount'
> & { status: 'due' | 'missed' };

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

export function deriveCashFlowAttention(
  schedules: readonly ManualSchedule[],
  statuses: ScheduleStatuses,
  selectedAccountIds: ReadonlySet<string>,
) {
  const attention: CashFlowAttentionItem[] = [];
  const upcoming: ManualSchedule[] = [];

  for (const schedule of schedules) {
    if (
      schedule.posts_transaction !== false ||
      !selectedAccountIds.has(schedule._account)
    ) {
      continue;
    }

    const status = statuses.get(schedule.id);
    if (status === 'due' || status === 'missed') {
      attention.push({ ...schedule, status });
    } else if (status === 'upcoming' || status === 'scheduled') {
      upcoming.push(schedule);
    }
  }

  const byNameAndId = (
    a: Pick<ManualSchedule, 'name' | 'id'>,
    b: Pick<ManualSchedule, 'name' | 'id'>,
  ) => (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id);

  attention.sort(
    (a, b) =>
      (a.status === 'missed' ? 0 : 1) - (b.status === 'missed' ? 0 : 1) ||
      (a.status === 'missed' && b.status === 'missed'
        ? a.next_date.localeCompare(b.next_date)
        : 0) ||
      byNameAndId(a, b),
  );
  upcoming.sort(
    (a, b) => a.next_date.localeCompare(b.next_date) || byNameAndId(a, b),
  );

  return {
    attention,
    upcomingCount: upcoming.length,
    nextUpcoming: upcoming.length > 0 ? upcoming[0] : undefined,
  };
}
