import { send } from '@actual-app/core/platform/client/connection';
import type { CategoryEntity } from '@actual-app/core/types/models';
import type { Template } from '@actual-app/core/types/models/templates';

import { hasStandaloneSinkingContribution } from './cashFlowSavingsPlan';

type BudgetCell = { name: string; value: unknown };

export type PaydayChecklistItem = {
  categoryId: string;
  categoryName: string;
  priority: number | null;
  target: number | null;
  allocated: number | null;
  remaining: number | null;
  status:
    | 'ready'
    | 'goal-only'
    | 'unprioritized'
    | 'unsupported'
    | 'unavailable';
  coveredScheduleIds?: string[];
};

export type PaydayChecklistResult = {
  month: string;
  availableToBudget: number | null;
  remainingTotal: number | null;
  knownRemainingTotal: number | null;
  isComplete: boolean;
  items: PaydayChecklistItem[];
  withoutRules: { categoryId: string; categoryName: string }[];
};

function readMoneyCell(
  cells: readonly BudgetCell[],
  name: string,
): number | null {
  const value = cells.find(
    cell => cell.name.endsWith(`!${name}`) || cell.name === name,
  )?.value;
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : null;
}

function priorityFor(templates: Template[]): number | null {
  const priorities = templates
    .filter(template => template.directive === 'template')
    .map(template => template.priority);
  return priorities.length > 0 &&
    priorities.every(value => value === priorities[0])
    ? priorities[0]
    : null;
}

/** Read selected-month native budget cells and strict, read-only automation targets. */
export async function loadPaydayChecklist(
  month: string,
  categories: readonly CategoryEntity[],
): Promise<PaydayChecklistResult> {
  const cells = await send('envelope-budget-month', { month });
  const availableToBudget = readMoneyCell(cells, 'to-budget');
  const visibleCategories = categories.filter(
    category => !category.is_income && !category.hidden && !category.tombstone,
  );
  const items = await Promise.all(
    visibleCategories.map(async category => {
      let templates: Template[];
      try {
        const definitions = await send(
          'budget/get-category-automations',
          category.id,
        );
        if (
          definitions == null ||
          typeof definitions !== 'object' ||
          Array.isArray(definitions)
        ) {
          throw new Error('Automation definitions unavailable');
        }
        const selected = definitions[category.id];
        if (selected === undefined) {
          return null;
        }
        if (!Array.isArray(selected)) {
          throw new Error('Invalid automation definitions');
        }
        templates = selected;
      } catch {
        return {
          categoryId: category.id,
          categoryName: category.name,
          priority: null,
          target: null,
          allocated: readMoneyCell(cells, `budget-${category.id}`),
          remaining: null,
          status: 'unavailable',
        } satisfies PaydayChecklistItem;
      }
      if (templates.length === 0) {
        return null;
      }
      const allocated = readMoneyCell(cells, `budget-${category.id}`);
      const priority = priorityFor(templates);
      if (!hasStandaloneSinkingContribution(templates)) {
        return {
          categoryId: category.id,
          categoryName: category.name,
          priority,
          target: null,
          allocated,
          remaining: null,
          status: templates.every(template => template.directive === 'goal')
            ? 'goal-only'
            : 'unsupported',
        } satisfies PaydayChecklistItem;
      }
      try {
        const result = await send('budget/dry-run-category-template', {
          month,
          categoryId: category.id,
          templates,
          strict: true,
        });
        if (
          !Number.isSafeInteger(result.budgeted) ||
          result.budgeted < 0 ||
          !Array.isArray(result.perTemplate) ||
          result.perTemplate.length !== templates.length ||
          !result.perTemplate.every(
            value => Number.isSafeInteger(value) && value >= 0,
          )
        ) {
          throw new Error('Invalid automation projection');
        }
        return {
          categoryId: category.id,
          categoryName: category.name,
          priority,
          target: result.budgeted,
          allocated,
          remaining:
            allocated == null ? null : Math.max(0, result.budgeted - allocated),
          status: priority == null ? 'unprioritized' : 'ready',
          coveredScheduleIds: templates.flatMap(template =>
            template.directive === 'template' &&
            template.type === 'schedule' &&
            template.scheduleId
              ? [template.scheduleId]
              : [],
          ),
        } satisfies PaydayChecklistItem;
      } catch {
        return {
          categoryId: category.id,
          categoryName: category.name,
          priority,
          target: null,
          allocated,
          remaining: null,
          status: 'unavailable',
        } satisfies PaydayChecklistItem;
      }
    }),
  );
  const visibleItems = items
    .filter(item => item != null)
    .sort((a, b) => {
      if (a.priority == null) {
        return b.priority == null
          ? a.categoryName.localeCompare(b.categoryName)
          : 1;
      }
      if (b.priority == null) {
        return -1;
      }
      return (
        a.priority - b.priority || a.categoryName.localeCompare(b.categoryName)
      );
    });
  const isComplete =
    availableToBudget != null &&
    visibleItems.every(
      item => item.status === 'ready' && item.remaining != null,
    );
  const configuredIds = new Set(visibleItems.map(item => item.categoryId));
  const withoutRules = visibleCategories
    .filter(category => !configuredIds.has(category.id))
    .map(category => ({
      categoryId: category.id,
      categoryName: category.name,
    }));
  const knownItems = visibleItems.filter(
    item =>
      (item.status === 'ready' || item.status === 'unprioritized') &&
      item.remaining != null,
  );
  const knownRemainingTotal =
    knownItems.length > 0
      ? knownItems.reduce((sum, item) => sum + (item.remaining ?? 0), 0)
      : null;
  const fullRemainingTotal =
    visibleItems.length > 0 &&
    visibleItems.every(
      item => item.status === 'ready' && item.remaining != null,
    )
      ? visibleItems.reduce((sum, item) => sum + (item.remaining ?? 0), 0)
      : null;
  return {
    month,
    availableToBudget,
    remainingTotal: Number.isSafeInteger(fullRemainingTotal)
      ? fullRemainingTotal
      : null,
    knownRemainingTotal: Number.isSafeInteger(knownRemainingTotal)
      ? knownRemainingTotal
      : null,
    isComplete,
    items: visibleItems,
    withoutRules,
  };
}
