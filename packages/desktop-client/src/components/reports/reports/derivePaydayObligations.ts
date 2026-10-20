import * as monthUtils from '@actual-app/core/shared/months';
import type { ForecastResult } from '@actual-app/core/types/models/forecast';

import type { PaydayChecklistResult } from './derivePaydayChecklist';

export type PaydayObligation = {
  scheduleId: string;
  name: string;
  date: string;
};

/** Scheduled expenses to review, never extra inferred funding requirements. */
export function derivePaydayObligations({
  checklist,
  forecast,
  operatingAccountIds,
  today,
}: {
  checklist: PaydayChecklistResult;
  forecast: ForecastResult | null;
  operatingAccountIds: readonly string[];
  today: string;
}): PaydayObligation[] | null {
  if (!forecast || operatingAccountIds.length === 0) {
    return null;
  }
  const operatingIds = new Set(operatingAccountIds);
  const coveredIds = new Set(
    checklist.items
      .filter(item => item.status === 'ready')
      .flatMap(item => item.coveredScheduleIds ?? []),
  );
  const result = new Map<string, PaydayObligation>();
  for (const point of forecast.dataPoints) {
    if (
      !operatingIds.has(point.accountId) ||
      point.date < today ||
      point.date.slice(0, 7) !== checklist.month ||
      point.date > monthUtils.lastDayOfMonth(checklist.month)
    ) {
      continue;
    }
    for (const transaction of point.transactions) {
      if (
        transaction.amount >= 0 ||
        transaction.isTransfer ||
        coveredIds.has(transaction.scheduleId)
      ) {
        continue;
      }
      const key = `${transaction.scheduleId}:${point.date}`;
      result.set(key, {
        scheduleId: transaction.scheduleId,
        name: transaction.scheduleName,
        date: point.date,
      });
    }
  }
  return [...result.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
  );
}
