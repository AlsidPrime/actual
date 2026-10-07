# Actual Budget Project Status

_Last updated: 2026-10-07_

## Repository and Baseline

- Repository: `AlsidPrime/actual`
- Upstream: `actualbudget/actual`
- Stable upstream-aligned base: Actual Budget `v26.9.0`
- Base SHA: `59fe126f637d858c061e1eeedbef5436c8f2225a`
- Current branch: `feature/cash-flow-calendar-v2`
- Current HEAD: `ac317de3148461f646504ccf699b10c3f09904dc`
- Current branch state: 11 commits ahead of the v26.9.0 base, 0 behind
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

The current product direction distinguishes three practical cash roles:

1. **Operating cash**
   - Chequing/day-to-day cash.
   - This is the primary source for normal bills and discretionary spending.
   - This should drive the main day-to-day cash-safety warning.

2. **Sinking-fund reserve**
   - Savings physically backing selected sinking-fund categories.
   - Examples: clothing, vehicle maintenance, Christmas, birthdays, school supplies, family activities.
   - Not ordinary discretionary liquidity.
   - When a sinking-fund purchase is made from chequing, the intended household workflow is to reimburse chequing from this savings pool promptly.

3. **Long-term protected savings**
   - Emergency reserves, future down payment, long-term goals, and similar protected cash.
   - Must not make ordinary discretionary spending appear affordable.
   - Should not be treated as day-to-day liquidity.

Credit cards, lines of credit, loans, and other debt are never liquid cash.

### Sinking-fund model

Do not recreate a parallel sinking-fund accounting database.

Use native Actual envelope/category balances as the purpose-level source of truth, while a selected savings account can act as the physical cash backing for those sinking categories.

A useful future metric is:

> selected sinking-category balances vs physical sinking-reserve account balance

This can show whether earmarked category balances are adequately backed by segregated savings without mapping every category to a separate bank account.

### Variable spending / Budget Burn

Budget Burn represents ordinary expected variable spending that is not already represented by scheduled expenses.

It remains a projection layer over native Actual forecast output and does not create transactions.

### Planned paydays

Payday/runway UX should be anchored to explicitly selected recurring income schedules, not to any positive transaction.

- The two household employment pay schedules can be selected together and treated as the same payday when they occur on the same date.
- Canada Child Benefit remains forecast income but should not automatically become the primary payday anchor unless explicitly selected.
- Refunds, windfalls, reimbursements, or other random positive transactions must not redefine the next payday.

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
- explicit Operating and Reserve account selection;
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
- Reserve funding target based on selected reserve-category balances;
- future scheduled Operating-to-Reserve transfers can reduce the remaining funding need;
- strict conservative transfer matching;
- next inflow is informational only;
- Burn-incomplete states refuse green savings advice.

### Cash Flow Risk Summary

Completed:

- safe / warning / danger summary;
- first projected negative date;
- lowest projected balance/date;
- next qualifying Operating inflow information;
- Tracking Budget support;
- PrivacyFilter coverage.

Architecture follow-up:

- The current total-liquidity headline should be revisited so protected savings do not make day-to-day discretionary spending appear safe. Operating cash should become the primary cash-safety guardrail, with broader household liquidity shown only as secondary context.

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

## 2025 Feature Review Backlog

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

1. **Account-role refinement**
   - Separate Operating, Sinking Reserve, and Long-Term Protected Savings semantics.
   - Ensure protected savings cannot make discretionary spending appear affordable.

2. **Payday / runway UX**
   - Explicitly select recurring employment-income schedules as payday anchors.
   - Show next planned payday, days remaining, lowest Operating cash before payday, and payday-relative warnings.
   - Supplemental recurring income may affect balances without redefining payday.

3. **Clickable day-details / projection explanation**
   - Explain how each projected end-of-day balance was derived.
   - Show scheduled events, Burn, opening/closing balance, and relevant account detail.

4. **Sinking-fund / savings progress visualization**
   - Use native Actual category/envelope data.
   - Do not restore the old custom sinking-fund database.
   - Consider aggregate backing coverage between selected sinking categories and the physical sinking-reserve account.

5. **Debt / credit-card presentation**
   - Debt and credit are never liquidity.
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

The feature is mature enough to begin validating against a real household budget, but development must continue to retain a synthetic/demo budget as well.

Recommended two-budget workflow:

1. **Cash Flow Dev Demo**
   - Synthetic/representative data.
   - Used for development, regression, screenshots, and deliberate edge cases.

2. **Family Validation Budget**
   - Real accounts, schedules, categories, and imported transactions.
   - Kept private and never committed.
   - Used for manual product validation only.
   - Export/back up before testing a new build or schema-sensitive change.

For the real validation budget:

- establish correct current account balances;
- create/verify recurring income and bill schedules;
- build variable-spending categories used by Budget Burn;
- build sinking-fund categories;
- use native CSV transaction import rather than custom import code;
- import enough recent history to validate categorization and current-month Burn behavior;
- create rules only through native Actual;
- save a known-good backup that can be restored after experimental builds.

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

1. Use the household spreadsheet and a real validation budget to finalize account-role semantics.
2. Investigate how modern Actual identifies credit/debt account types reliably enough to exclude them from Cash Flow account selectors.
3. Design the Operating vs Sinking Reserve vs Protected Savings model.
4. Revise Cash Flow Risk semantics so protected savings do not green-light ordinary discretionary spending.
5. Add explicit planned-payday schedule selection and runway UX.
6. Build clickable day-details / projection explanation.
7. Reassess sinking-fund progress visualization using native category balances.
8. Investigate fork version/update/release-note behavior before routine personal deployment.

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
