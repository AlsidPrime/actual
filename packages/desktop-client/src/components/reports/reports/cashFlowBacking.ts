export type SinkingBacking = {
  status:
    | 'setup'
    | 'incomplete'
    | 'unallocated'
    | 'partial'
    | 'full'
    | 'excess';
  target: number;
  backing: number;
  shortfall: number;
  excess: number;
  percent: number | null;
  categories: Array<{ id: string; name: string; balance: number }>;
};

export function calculateSinkingBacking({
  categories,
  accountIds,
  balances,
}: {
  categories: Array<{ id: string; name: string; balance: number | null }>;
  accountIds: readonly string[];
  balances: Record<string, number | null>;
}): SinkingBacking {
  const empty = {
    target: 0,
    backing: 0,
    shortfall: 0,
    excess: 0,
    percent: null,
    categories: [],
  };
  if (categories.length === 0 || accountIds.length === 0) {
    return { ...empty, status: 'setup' };
  }
  if (
    categories.some(
      category =>
        category.balance == null || !Number.isFinite(category.balance),
    ) ||
    accountIds.some(
      id => balances[id] == null || !Number.isFinite(balances[id]),
    )
  ) {
    return { ...empty, status: 'incomplete' };
  }
  const uniqueCategories = [
    ...new Map(categories.map(category => [category.id, category])).values(),
  ];
  const categoryRows = uniqueCategories.map(category => ({
    id: category.id,
    name: category.name,
    balance: category.balance ?? 0,
  }));
  const target = categoryRows.reduce(
    (sum, category) => sum + Math.max(0, category.balance),
    0,
  );
  const backing = [...new Set(accountIds)].reduce(
    (sum, id) => sum + (balances[id] ?? 0),
    0,
  );
  const shortfall = Math.max(0, target - backing);
  const excess = Math.max(0, backing - target);
  const percent =
    target > 0 ? Math.max(0, Math.round((backing / target) * 100)) : null;
  return {
    status:
      target === 0
        ? 'unallocated'
        : shortfall > 0
          ? 'partial'
          : excess > 0
            ? 'excess'
            : 'full',
    target,
    backing,
    shortfall,
    excess,
    percent,
    categories: categoryRows,
  };
}
