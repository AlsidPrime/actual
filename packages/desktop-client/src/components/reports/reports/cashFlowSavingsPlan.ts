import { send } from '@actual-app/core/platform/client/connection';
import type {
  LimitTemplate,
  PeriodicTemplate,
  Template,
} from '@actual-app/core/types/models/templates';

export type PlannedContribution =
  | { status: 'planned'; amount: number }
  | { status: 'none' | 'unsupported' | 'unavailable'; amount: null };

export type SinkingAutomationPlans = Record<
  string,
  Record<string, PlannedContribution>
>;

type BudgetCell = { name: string; value: unknown };

export type SinkingSavingsPlan = {
  month: string;
  status: 'setup' | 'ready' | 'incomplete';
  categories: Array<{
    id: string;
    name: string;
    contribution: PlannedContribution;
    monthlyAllocation: number | null;
    currentEnvelopeBalance: number | null;
    planningGap: number | null;
  }>;
  plannedTotal: number | null;
  monthlyAllocationTotal: number | null;
  currentEnvelopeTotal: number | null;
  planningGap: number | null;
  physicalCash: number | null;
};

function unavailable(): PlannedContribution {
  return { status: 'unavailable', amount: null };
}

function unsupported(): PlannedContribution {
  return { status: 'unsupported', amount: null };
}

type BalanceCap = LimitTemplate | NonNullable<PeriodicTemplate['limit']>;

function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(value);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function isValidBalanceCap(cap: BalanceCap): boolean {
  return (
    Number.isFinite(cap.amount) &&
    cap.amount >= 0 &&
    (cap.period === 'monthly' ||
      cap.period === 'daily' ||
      (cap.period === 'weekly' &&
        typeof cap.start === 'string' &&
        isValidDate(cap.start)))
  );
}

/** Only complete, standalone native funding rules can define a savings plan. */
export function hasStandaloneSinkingContribution(
  templates: Template[],
): boolean {
  let contributions = 0;
  let balanceCaps = 0;
  let goals = 0;
  let refills = 0;

  const areSupported = templates.every(template => {
    if (template == null || typeof template !== 'object') {
      return false;
    }
    if (template.directive === 'goal') {
      goals += 1;
      return (
        template.type === 'goal' &&
        Number.isFinite(template.amount) &&
        template.amount >= 0
      );
    }
    if (template.directive !== 'template') {
      return false;
    }
    if (template.type === 'limit') {
      if (template.priority !== null) {
        return false;
      }
    } else if (
      template.priority == null ||
      !Number.isInteger(template.priority) ||
      template.priority < 0
    ) {
      return false;
    }
    if (template.type === 'limit') {
      balanceCaps += 1;
      return isValidBalanceCap(template);
    }
    if (template.type === 'periodic' || template.type === 'simple') {
      if (template.limit != null) {
        balanceCaps += 1;
        if (!isValidBalanceCap(template.limit)) {
          return false;
        }
      }
      if (template.type === 'simple') {
        if (template.monthly == null) {
          refills += 1;
          contributions += 1;
          return template.limit != null;
        }
        contributions += 1;
        return Number.isFinite(template.monthly) && template.monthly >= 0;
      }
      contributions += 1;
      return (
        Number.isFinite(template.amount) &&
        template.amount >= 0 &&
        Number.isInteger(template.period?.amount) &&
        template.period.amount > 0 &&
        ['day', 'week', 'month', 'year'].includes(template.period.period) &&
        (template.starting === '' || isValidDate(template.starting))
      );
    }
    if (template.type === 'refill') {
      refills += 1;
      contributions += 1;
      return true;
    }
    if (template.type === 'by' || template.type === 'spend') {
      contributions += 1;
      return (
        Number.isFinite(template.amount) &&
        template.amount >= 0 &&
        isValidMonth(template.month) &&
        (template.type === 'by'
          ? template.from == null || isValidMonth(template.from)
          : isValidMonth(template.from) && template.from <= template.month)
      );
    }
    if (template.type === 'schedule') {
      contributions += 1;
      return (
        Boolean(template.scheduleId?.trim() || template.name?.trim()) &&
        (template.adjustment == null ||
          (Number.isFinite(template.adjustment) &&
            (template.adjustmentType === 'fixed' ||
              template.adjustmentType === 'percent')))
      );
    }
    return false;
  });

  return (
    areSupported &&
    contributions > 0 &&
    goals <= 1 &&
    balanceCaps <= 1 &&
    (refills === 0 ||
      (refills === 1 && contributions === 1 && balanceCaps === 1))
  );
}

/** Read configured native rules and their month-specific dry-run results. */
export async function loadSinkingAutomationPlans(
  categoryIds: readonly string[],
  months: readonly string[],
): Promise<SinkingAutomationPlans> {
  const entries = await Promise.all(
    categoryIds.map(async categoryId => {
      let templates: Template[];
      try {
        const definitions = await send(
          'budget/get-category-automations',
          categoryId,
        );
        if (
          definitions == null ||
          typeof definitions !== 'object' ||
          Array.isArray(definitions)
        ) {
          return months.map(month => ({
            month,
            categoryId,
            contribution: unavailable(),
          }));
        }
        const selected = definitions[categoryId];
        if (selected === undefined) {
          templates = [];
        } else if (Array.isArray(selected)) {
          templates = selected;
        } else {
          return months.map(month => ({
            month,
            categoryId,
            contribution: unavailable(),
          }));
        }
      } catch {
        return months.map(month => ({
          month,
          categoryId,
          contribution: unavailable(),
        }));
      }

      return Promise.all(
        months.map(async month => {
          if (templates.length === 0) {
            return {
              month,
              categoryId,
              contribution: {
                status: 'none',
                amount: null,
              } satisfies PlannedContribution,
            };
          }
          try {
            if (!hasStandaloneSinkingContribution(templates)) {
              return { month, categoryId, contribution: unsupported() };
            }
            const result = await send('budget/dry-run-category-template', {
              month,
              categoryId,
              templates,
              strict: true,
            });
            const isValid =
              result != null &&
              Number.isFinite(result.budgeted) &&
              result.budgeted >= 0 &&
              Array.isArray(result.perTemplate) &&
              result.perTemplate.length === templates.length &&
              result.perTemplate.every(
                amount => Number.isFinite(amount) && amount >= 0,
              );
            return {
              month,
              categoryId,
              contribution: isValid
                ? ({
                    status: 'planned',
                    amount: result.budgeted,
                  } satisfies PlannedContribution)
                : unavailable(),
            };
          } catch {
            return { month, categoryId, contribution: unavailable() };
          }
        }),
      );
    }),
  );
  const plans: SinkingAutomationPlans = {};
  for (const entry of entries.flat()) {
    (plans[entry.month] ??= {})[entry.categoryId] = entry.contribution;
  }
  return plans;
}

function readMoneyCell(cells: readonly BudgetCell[] | undefined, name: string) {
  const value = cells?.find(cell => cell.name.endsWith(name))?.value;
  if (value == null || typeof value === 'boolean') {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function sumKnown(values: Array<number | null>): number | null {
  return values.every(value => value != null)
    ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
}

export function buildSinkingSavingsPlan({
  month,
  categories,
  monthCells,
  currentCells,
  contributions,
  reserveAccountIds,
  accountBalances,
}: {
  month: string;
  categories: Array<{ id: string; name: string }>;
  monthCells: readonly BudgetCell[] | undefined;
  currentCells: readonly BudgetCell[] | undefined;
  contributions: Record<string, PlannedContribution> | undefined;
  reserveAccountIds: readonly string[];
  accountBalances: Record<string, number | null>;
}): SinkingSavingsPlan {
  const rows = categories.map(category => {
    const contribution = contributions?.[category.id] ?? unavailable();
    const monthlyAllocation = readMoneyCell(
      monthCells,
      `budget-${category.id}`,
    );
    const currentEnvelopeBalance = readMoneyCell(
      currentCells,
      `leftover-${category.id}`,
    );
    return {
      ...category,
      contribution,
      monthlyAllocation,
      currentEnvelopeBalance,
      planningGap:
        contribution.status === 'planned' && monthlyAllocation != null
          ? Math.max(0, contribution.amount - monthlyAllocation)
          : null,
    };
  });
  const hasIncompleteContribution = rows.some(
    row =>
      row.contribution.status === 'unavailable' ||
      row.contribution.status === 'unsupported',
  );
  const plannedRows = rows.filter(row => row.contribution.status === 'planned');
  const plannedTotal =
    hasIncompleteContribution || plannedRows.length === 0
      ? null
      : plannedRows.reduce(
          (sum, row) => sum + (row.contribution.amount ?? 0),
          0,
        );
  const planningGap =
    hasIncompleteContribution || plannedRows.length === 0
      ? null
      : sumKnown(plannedRows.map(row => row.planningGap));
  const physicalCash =
    reserveAccountIds.length > 0 &&
    reserveAccountIds.every(
      id => accountBalances[id] != null && Number.isFinite(accountBalances[id]),
    )
      ? [...new Set(reserveAccountIds)].reduce(
          (sum, id) => sum + (accountBalances[id] ?? 0),
          0,
        )
      : null;
  const monthlyAllocationTotal = sumKnown(
    rows.map(row => row.monthlyAllocation),
  );
  const currentEnvelopeTotal = sumKnown(
    rows.map(row => row.currentEnvelopeBalance),
  );
  return {
    month,
    status:
      categories.length === 0
        ? 'setup'
        : hasIncompleteContribution ||
            monthlyAllocationTotal == null ||
            currentEnvelopeTotal == null ||
            physicalCash == null
          ? 'incomplete'
          : 'ready',
    categories: rows,
    plannedTotal,
    monthlyAllocationTotal,
    currentEnvelopeTotal,
    planningGap,
    physicalCash,
  };
}
