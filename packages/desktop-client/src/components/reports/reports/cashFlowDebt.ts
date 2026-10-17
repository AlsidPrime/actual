import type { ForecastResult } from '@actual-app/core/types/models/forecast';

export type ScheduledDebtPayment = {
  date: string;
  scheduleId: string;
  scheduleName: string;
  operatingAccountName: string;
  debtAccountName: string;
  amount: number;
};

export function deriveScheduledDebtPayments({
  forecastData,
  operatingAccountIds,
  debtAccountIds,
  today,
  endDate,
}: {
  forecastData: ForecastResult | null;
  operatingAccountIds: readonly string[];
  debtAccountIds: readonly string[];
  today: string;
  endDate: string;
}): ScheduledDebtPayment[] {
  const operatingIds = new Set(operatingAccountIds);
  const debtIds = new Set(debtAccountIds);
  const byOccurrence = new Map<
    string,
    {
      outflows: ScheduledDebtPayment[];
      inflows: Array<{ amount: number; accountName: string }>;
    }
  >();
  for (const point of forecastData?.dataPoints ?? []) {
    if (point.date <= today || point.date > endDate) continue;
    for (const transaction of point.transactions) {
      if (!transaction.isTransfer || !transaction.scheduleId) continue;
      const key = `${point.date}:${transaction.scheduleId}`;
      const occurrence = byOccurrence.get(key) ?? { outflows: [], inflows: [] };
      if (operatingIds.has(point.accountId) && transaction.amount < 0) {
        occurrence.outflows.push({
          date: point.date,
          scheduleId: transaction.scheduleId,
          scheduleName: transaction.scheduleName,
          operatingAccountName: point.accountName,
          debtAccountName: '',
          amount: -transaction.amount,
        });
      }
      if (debtIds.has(point.accountId) && transaction.amount > 0) {
        occurrence.inflows.push({
          amount: transaction.amount,
          accountName: point.accountName,
        });
      }
      byOccurrence.set(key, occurrence);
    }
  }
  return [...byOccurrence.values()]
    .flatMap(occurrence =>
      occurrence.outflows.length === 1 &&
      occurrence.inflows.length === 1 &&
      occurrence.outflows[0].amount === occurrence.inflows[0].amount
        ? [
            {
              ...occurrence.outflows[0],
              debtAccountName: occurrence.inflows[0].accountName,
            },
          ]
        : [],
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}
