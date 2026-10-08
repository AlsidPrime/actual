import { send } from '@actual-app/core/platform/client/connection';
import type { Template } from '@actual-app/core/types/models/templates';

export type AutomationBurnPlans = Record<string, Record<string, number>>;

/** Funding-dependent templates do not describe a standalone spending plan. */
export function hasFixedSpendingPlan(templates: Template[]): boolean {
  return (
    templates.length > 0 &&
    templates.every(template => {
      if (template.directive !== 'template') {
        return false;
      }
      if (template.type === 'simple') {
        return (
          template.limit == null &&
          template.monthly != null &&
          Number.isFinite(template.monthly) &&
          template.monthly >= 0
        );
      }
      if (template.type === 'periodic') {
        return (
          template.limit == null &&
          Number.isFinite(template.amount) &&
          template.amount >= 0 &&
          Number.isInteger(template.period.amount) &&
          template.period.amount > 0
        );
      }
      return false;
    })
  );
}

/** Read native definitions once per category and native projections once per month. */
export async function loadAutomationBurnPlans(
  categoryIds: readonly string[],
  months: readonly string[],
): Promise<AutomationBurnPlans> {
  const entries = await Promise.all(
    categoryIds.map(async categoryId => {
      try {
        const definitions = await send(
          'budget/get-category-automations',
          categoryId,
        );
        const templates = definitions[categoryId] ?? [];
        if (!hasFixedSpendingPlan(templates)) {
          return [];
        }
        return await Promise.all(
          months.map(async month => {
            try {
              const result = await send('budget/dry-run-category-template', {
                month,
                categoryId,
                templates,
              });
              return Number.isFinite(result.budgeted) && result.budgeted >= 0
                ? { month, categoryId, amount: result.budgeted }
                : null;
            } catch {
              return null;
            }
          }),
        );
      } catch {
        return [];
      }
    }),
  );
  const plans: AutomationBurnPlans = {};
  for (const entry of entries.flat()) {
    if (entry) {
      (plans[entry.month] ??= {})[entry.categoryId] = entry.amount;
    }
  }
  return plans;
}
