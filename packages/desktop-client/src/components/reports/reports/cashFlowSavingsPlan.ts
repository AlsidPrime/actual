import { send } from '@actual-app/core/platform/client/connection';
import type { Template } from '@actual-app/core/types/models/templates';

export type PlannedContribution =
  | { status: 'planned'; amount: number }
  | { status: 'none' | 'unavailable'; amount: null };

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
        } else if (
          Array.isArray(selected) &&
          selected.every(template => template.directive !== 'error')
        ) {
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
            const result = await send('budget/dry-run-category-template', {
              month,
              categoryId,
              templates,
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
  const hasUnavailableContribution = rows.some(
    row => row.contribution.status === 'unavailable',
  );
  const plannedRows = rows.filter(row => row.contribution.status === 'planned');
  const plannedTotal =
    hasUnavailableContribution || plannedRows.length === 0
      ? null
      : plannedRows.reduce(
          (sum, row) => sum + (row.contribution.amount ?? 0),
          0,
        );
  const planningGap =
    hasUnavailableContribution || plannedRows.length === 0
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
        : hasUnavailableContribution ||
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
