# Cash Flow Calendar QA budget

Run from the repository root:

```sh
yarn cash-flow:generate-qa
yarn cash-flow:generate-qa --anchor 2026-10-07
```

The generator builds a fresh synthetic budget through `@actual-app/api` and writes
`data/cash-flow-qa/cash-flow-qa-YYYY-MM-DD.zip`. The repository's existing
`/data/*` ignore rule keeps generated ZIP files out of Git. Repeating the same
anchor replaces that anchor's ZIP. No existing budget is opened or changed.

In Actual, use **Import my budget → Actual** and select the ZIP. On
`/cash-flow`, select **Operating Checking** and **Secondary Operating** as
Operating accounts, and **Sinking Savings** as a Sinking account. Leave
**Long-Term Savings** unselected. Enable Budget Burn and select **Groceries**,
**Fuel**, and **Recreation / Miscellaneous** as Burn categories. Select the
three sinking fund categories as Sinking categories. Cash Flow settings are
per-budget preferences and are intentionally left for this one-time setup
after import.

The anchor is the reference for historical spending, scheduled bills, transfer
scenarios, the same-day two-employer payday, and manual missed/due/upcoming
schedules. To see those native statuses, generate with today's date. Amounts are
integer cents, and all names and transactions are synthetic.

Expected balances at the anchor, before scheduled activity: Operating Checking
$1,520, Secondary Operating $250, Sinking Savings $8,850, and Long-Term
Savings $18,000. The first rent bill is $1,900 at anchor +3 days. After the
$150 Operating-to-Sinking transfer, combined Operating cash falls below zero
before the two $2,200 and $1,500 employment schedules on anchor +10 days.
The Sinking Savings and Long-Term Savings balances should not hide that
Operating shortfall.
