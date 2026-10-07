# Actual Budget Project Status

_Last updated: 2026-10-07_

## Repository and Baseline

- Repository: `AlsidPrime/actual`
- Upstream: `actualbudget/actual`
- Stable upstream-aligned base: Actual Budget `v26.9.0`
- Base SHA: `59fe126f637d858c061e1eeedbef5436c8f2225a`
- Current branch: `feature/cash-flow-calendar-v2`
- Current HEAD: `17ad215de86c2554c76b1a195eaa1b24ee7fb6b8`
- Current branch state: 15 commits ahead of the v26.9.0 base, 0 behind
- Local development path: `C:\Dev\actual-v2`
- Development environment: VS Code + Actual Dev Container

## Product Goal

Actual envelope budgeting answers:

> Can I afford this according to my budget?

Cash Flow Calendar V2 answers:

> Will there literally be enough spendable cash in the accounts intended for day-to-day use before the next planned payday?

Forecasting remains read-only. It must not modify transactions, schedules, budgets, account balances, or core accounting behavior.

## Core Financial Model

### Account roles

The Cash Flow V2 account roles are locked:

1. **Operating**
   - Chequing and other day-to-day spendable cash.
   - Primary safety boundary for normal bills and discretionary spending.

2. **Sinking Savings**
   - Savings physically backing selected sinking-fund categories.
   - Examples: clothing, vehicle maintenance, Christmas, birthdays, school supplies, and family activities.
   - Not ordinary discretionary liquidity. When a sinking-fund purchase is made from Operating, the intended household workflow is to reimburse Operating from Sinking Savings promptly.

3. **Long-term, emergency, and other protected savings**
   - Remains outside Cash Flow V2 and cannot make ordinary spending appear affordable.

Debt and credit accounts are never liquidity.

### Sinking-fund model

Do not recreate a parallel sinking-fund accounting database.

Use native Actual envelope/category balances as the purpose-level source of truth, while selected Sinking Savings accounts act as the physical cash backing for those sinking categories.

A useful future metric is:

> selected sinking-category balances vs selected Sinking Savings account balances

This can show whether earmarked category balances are adequately backed by segregated savings without mapping every category to a separate bank account.

### Variable spending / Budget Burn

Budget Burn represents ordinary expected variable spending that is not already represented by scheduled expenses.

It remains a projection layer over native Actual forecast output and does not create transactions.

### Planned paydays

Planned Payday/Runway UX should be anchored to explicitly selected recurring employment-income schedules, not to any positive transaction.

- The two household employment pay schedules can be selected together and treated as the same payday when they occur on the same date.
- Canada Child Benefit remains forecast income but should not automatically become the primary payday anchor unless explicitly selected.
- Refunds, windfalls, reimbursements, or other random positive transactions must not redefine the next payday.

The current generic "Next forecasted Operating inflow" can occur before the actual employment payday. This reinforces the planned distinction: explicitly selected employment schedules define payday; arbitrary positive inflows do not. Payday/Runway is not implemented yet.

### Read-only rule

Cash Flow may advise, explain, warn, and navigate to native Actual screens.

Cash Flow must not directly:

- post a scheduled transaction;
- move money;
- skip or complete schedules;
- change budgets;
- modify accounts;
- create forecast-driven accounting entries.

This is a permanent architecture preference unless deliberately reconsidered.

## Completed Cash Flow Calendar V2 Work

### Phase 1 - Calendar / native forecast integration

Completed:

- first-class `/cash-flow` page;
- explicit Operating and Sinking Savings account selection;
- native Actual `forecast/generate` reuse;
- daily projected end-of-day balances;
- scheduled event display;
- transfer grouping;
- per-account negative warnings;
- bounded month navigation;
- Tracking Budget compatibility;
- Balance Forecast report preserved.

### Phase 2 - Budget Burn

Completed:

- native envelope leftover-based variable-spending model;
- scheduled eligible expenses deducted from remaining Burn to avoid double counting;
- continuous cumulative Burn across month boundaries;
- visible-month Burn details;
- future months without a positive budget repeat the current monthly plan;
- read-only implementation.

Known limitation:

- native `envelope-budget-month` does not distinguish an explicit future `$0` budget from an unset future budget through the current read API. This is accepted for V2 because explicit future zero budgets are not considered important enough to justify expanding core API surface.

### Savings Sweep Advisor

Completed:

- full configured forecast horizon constrains safe-to-move advice;
- Operating-only minimum cash and safety buffer;
- Sinking Savings funding target based on selected sinking-category balances;
- future scheduled Operating-to-Sinking Savings transfers can reduce the remaining funding need;
- strict conservative transfer matching;
- next inflow is informational only;
- Burn-incomplete states refuse green savings advice.

### Cash Flow Risk Summary

Completed:

- safe / warning / danger summary;
- first projected negative date;
- lowest projected balance/date;
- generic next forecasted Operating inflow information;
- Tracking Budget support;
- PrivacyFilter coverage.

The previous Cash Flow Risk architecture follow-up is completed by the Operating Cash Boundary work below.

### Operating Cash Boundary

Completed:

- Primary Cash Flow Risk uses Operating cash only, adjusted by Budget Burn. Sinking Savings cannot make primary Risk safe.
- The calendar's primary end-of-day balance is Operating-only after Burn.
- Operating-to-Operating transfers net to zero in the primary view.
- Operating-to-Sinking Savings transfers show an Operating outflow; Sinking Savings-to-Operating reimbursements show an Operating inflow.
- Sinking-only events do not clutter the primary Operating calendar.
- Native forecast and accounting behavior remain unchanged.
- Savings Sweep still uses both Operating and Sinking Savings where its funding and safety calculations require them.

### Manual schedule awareness

Completed:

- calendar `Manual` indicator sourced from native `ScheduleEntity.posts_transaction`;
- grouped and one-sided transfer support;
- read-only Needs Attention panel using native `useSchedules` statuses;
- manual `due` and `missed` schedules surfaced;
- upcoming manual schedule summary;
- `/schedules` review navigation;
- positive manual income explicitly distinguished from expense magnitude;
- Tracking Budget support.

Known limitation:

- a manual transfer whose primary schedule account is outside the selected Cash Flow accounts, but whose counterparty is selected, is not included in Needs Attention. This is intentionally deferred pending a careful native transfer-payee implementation.

### Cash Flow QA generator

Completed:

- `scripts/cash-flow/generate-qa.mjs` runs with `yarn cash-flow:generate-qa` and accepts optional `--anchor YYYY-MM-DD` (default: today).
- It uses `@actual-app/api` to build synthetic data and export a normal Actual-compatible ZIP to `data/cash-flow-qa/`. Generated ZIP output is ignored by Git.
- The same anchor produces equivalent normalized financial data even when generated IDs differ.
- The fixture includes Operating accounts, Sinking Savings, protected savings, Budget Burn categories, internal and cross-boundary transfers, manual and automatic schedules, and two synchronized biweekly employment schedules.
- Import through the normal Actual budget import path has been validated.
- Generator work did not change production Cash Flow behavior.

### Manual UI validation

Using the generated QA budget, manual UI validation confirmed:

- large Sinking Savings and Long-Term Savings balances do not hide an Operating shortfall;
- Budget Burn reduces displayed Operating cash;
- an internal Operating transfer displays net zero when both Operating accounts are selected;
- cross-boundary transfers retain their correct Operating effect;
- both same-day employment schedules appear when both Operating accounts are selected;
- manual missed, due, and upcoming schedule UI works;
- per-account negative warnings work.

## Feature Review Backlog

### Completed / substantially addressed

- Predictive Cash Flow Calendar
- Variable-spending projection / Budget Burn
- Explicit liquid-account selection
- Daily projected balances
- Scheduled event display
- Transfer correctness work
- Low/negative cash warnings
- Manual-payment visibility

### Next serious candidates

1. **Clickable day details / projection explanation**
   - Explain each projected end-of-day balance using scheduled events, Burn, opening/closing balance, and relevant account detail.

2. **Explicit Payday / Runway UX**
   - Select recurring employment-income schedules as payday anchors.
   - Show next planned payday, days remaining, lowest Operating cash before payday, and payday-relative warnings.
   - Other positive inflows may affect balances without redefining payday.

3. **Sinking Savings backing / progress visualization**
   - Use native Actual category/envelope data, not a custom sinking-fund database.
   - Compare selected sinking-category balances with physical Sinking Savings backing.

4. **Debt / credit presentation**
   - Keep debt and credit outside liquidity.
   - Use native accounts and schedules rather than a parallel debt model.
   - Focus on cash required to service debt and avoiding new revolving debt.

### Retired / delegated to upstream Actual

- custom account-balance storage;
- custom rules engine;
- CSV import implementation;
- transaction filtering/history implementation;
- bulk transaction operations;
- Sankey implementation;
- custom dashboard framework;
- theme/dark-mode system;
- custom category hierarchy;
- custom sinking-fund accounting model;
- custom schedule engine;
- custom logging and accounting formatting.

### Quick actions decision

Forecast-driven financial quick actions are currently out of scope because Cash Flow is intentionally read-only.

Prefer deep links/navigation to native Actual workflows instead of posting, transferring, skipping, or modifying financial data from the forecast page.

## Real-World Validation Plan

The synthetic Cash Flow QA budget is implemented and manually useful for regression testing. The next project phase is **Family Validation** with a separate, private household budget.

For Family Validation:

- establish accurate current balances in the real household accounts;
- verify recurring employment-income and bill schedules;
- select variable-spending categories for Budget Burn and the relevant sinking categories;
- import enough recent transaction history to test current-month behavior where useful;
- use native Actual import and rules rather than custom import or categorization logic;
- keep a known-good Actual backup/export before testing new builds or schema-sensitive changes;
- never commit private financial data.

Retain the synthetic QA budget for repeatable regression and edge-case testing.

## Fork Release / Versioning Maintenance

Before treating the fork as a routinely installed personal application, investigate Actual's existing version/update/release-note machinery.

Goals:

- distinguish fork builds from upstream builds clearly;
- prevent misleading upstream `new version available` messaging;
- preserve visibility of the upstream Actual version the fork is based on;
- choose a semver-compatible fork release scheme;
- keep future upstream rebases straightforward.

Possible version form to investigate, not yet approved:

`26.9.0-ap.1`

Do not change versioning until the native update/release machinery is understood.

## Immediate Decision / Implementation Order

1. Build the private Family Validation budget and save a known-good Actual backup/export.
2. Observe real-world Cash Flow usage and record gaps.
3. Choose the next major UX phase from those findings; Day Details and explicit Payday/Runway are the leading candidates.
4. Add Sinking Savings backing/progress visualization.
5. Improve debt/credit presentation without treating debt as liquidity.
6. Investigate fork release, version, and update behavior before routine personal deployment.

## Agent Strategy

### ChatGPT

Architecture, financial semantics, sequencing, prompts, critical review, and project status.

### Codex in VS Code

Interactive implementation, UI work, local debugging, real/demo manual validation, targeted tests.

### Jules Pro

Independent review, GitHub-based investigations, larger bounded research tasks, test expansion, and rebase/maintainability review.

## Upstream Maintenance Principle

Keep custom behavior concentrated in small read-only projection and presentation modules.

When upstream Actual adds equivalent functionality, prefer deleting the fork-specific implementation rather than maintaining duplicate behavior indefinitely.
