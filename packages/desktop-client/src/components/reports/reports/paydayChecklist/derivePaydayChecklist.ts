import { send } from '@actual-app/core/platform/client/connection';
import type { CategoryEntity } from '@actual-app/core/types/models';
import type { Template } from '@actual-app/core/types/models/templates';
import { safeNumber } from '@actual-app/core/shared/util';

export interface PaydayChecklistItem {
  categoryId: string;
  categoryName: string;
  groupName: string;
  plannedAmount: number;
  budgetedAmount: number;
  remainingAmount: number;
  priority: number | null;
  status: 'needs-funding' | 'funded' | 'conditional' | 'unavailable';
}

export interface PaydayChecklistResult {
  month: string;
  availableToBudget: number;
  totalRemainingRequirements: number;
  items: PaydayChecklistItem[];
  error?: string;
}

export async function derivePaydayChecklist(
  month: string,
  categories: CategoryEntity[],
  getBudgeted: (categoryId: string) => number,
  availableToBudget: number,
  getGroupName: (groupId: string | null) => string
): Promise<PaydayChecklistResult> {
  const items: PaydayChecklistItem[] = [];
  let totalRemainingRequirements = 0;

  for (const category of categories) {
    if (category.is_income || category.hidden) {
      continue;
    }

    try {
      const definitions = await send('budget/get-category-automations', category.id);
      const templates: Template[] = definitions?.[category.id] ?? [];

      if (templates.length === 0) {
        continue;
      }

      const result = await send('budget/dry-run-category-template', {
        month,
        categoryId: category.id,
        templates,
      });

      if (!Number.isFinite(result.budgeted)) {
        items.push({
          categoryId: category.id,
          categoryName: category.name,
          groupName: getGroupName(category.group),
          plannedAmount: 0,
          budgetedAmount: getBudgeted(category.id),
          remainingAmount: 0,
          priority: null,
          status: 'conditional'
        });
        continue;
      }

      const plannedAmount = result.budgeted;
      const budgetedAmount = getBudgeted(category.id);
      const remainingAmount = Math.max(0, safeNumber(plannedAmount - budgetedAmount));

      let priority: number | null = null;
      let hasMixedPriorities = false;

      for (const t of templates) {
        if ('priority' in t && t.priority != null) {
          if (priority === null) {
            priority = t.priority;
          } else if (priority !== t.priority) {
            hasMixedPriorities = true;
          }
        }
      }

      if (hasMixedPriorities) {
        priority = null;
      }

      const status = remainingAmount > 0 ? 'needs-funding' : 'funded';

      if (status === 'needs-funding') {
        totalRemainingRequirements += remainingAmount;
      }

      items.push({
        categoryId: category.id,
        categoryName: category.name,
        groupName: getGroupName(category.group),
        plannedAmount,
        budgetedAmount,
        remainingAmount,
        priority,
        status,
      });

    } catch (e) {
      items.push({
        categoryId: category.id,
        categoryName: category.name,
        groupName: getGroupName(category.group),
        plannedAmount: 0,
        budgetedAmount: getBudgeted(category.id),
        remainingAmount: 0,
        priority: null,
        status: 'unavailable'
      });
    }
  }

  items.sort((a, b) => {
    if (a.priority !== null && b.priority !== null) {
      if (a.priority !== b.priority) return a.priority - b.priority;
    } else if (a.priority !== null) {
      return -1;
    } else if (b.priority !== null) {
      return 1;
    }
    return b.remainingAmount - a.remainingAmount;
  });

  return {
    month,
    availableToBudget,
    totalRemainingRequirements,
    items,
  };
}
