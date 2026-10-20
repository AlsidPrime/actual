import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import type { CategoryEntity } from '@actual-app/core/types/models';

export type PaydayIncomeBudget = {
  month: string;
  manualBuffered: number;
  incomeCategoryHold: Readonly<Record<string, boolean>>;
};

/** Read the native payday-month income hold settings without changing the budget. */
export async function loadPaydayIncomeBudget(
  month: string,
  categories: readonly CategoryEntity[],
): Promise<PaydayIncomeBudget | null> {
  const incomeCategories = categories.filter(
    category => category.is_income && !category.tombstone,
  );
  if (incomeCategories.length === 0) {
    return null;
  }
  const sheetName = monthUtils.sheetForMonth(month);
  const [buffered, ...carryovers] = await Promise.all([
    send('get-cell', { sheetName, name: 'buffered' }),
    ...incomeCategories.map(category =>
      send('get-cell', {
        sheetName,
        name: `carryover-${category.id}`,
      }),
    ),
  ]);
  if (
    !Number.isSafeInteger(buffered.value) ||
    typeof buffered.value !== 'number' ||
    buffered.value < 0 ||
    carryovers.some(
      cell =>
        cell.value !== true && cell.value !== false && cell.value !== null,
    )
  ) {
    return null;
  }
  return {
    month,
    manualBuffered: buffered.value,
    incomeCategoryHold: Object.fromEntries(
      incomeCategories.map((category, index) => [
        category.id,
        carryovers[index].value === true,
      ]),
    ),
  };
}
