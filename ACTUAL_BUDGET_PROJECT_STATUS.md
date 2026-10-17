# Actual Budget Fork — Project Status

_Last updated: 2026-10-17. Repository: `AlsidPrime/actual`; upstream: `actualbudget/actual`. Branch: `feature/cash-flow-calendar-v2`; this safety follow-up started at `b45b74ef7c269a636903cc213d5f95580ef6c32c`. Upstream baseline: Actual Budget `v26.9.0` (`59fe126f637d858c061e1eeedbef5436c8f2225a`). No upstream rebase, release, or tag was made._

## Product and safety boundary

Cash Flow Calendar V2 answers whether selected Operating accounts can carry ordinary cash needs through the next selected employment payday. It is a read-only view over Actual's native scheduled forecast and envelope data. It never posts transactions, moves money, edits schedules, changes budgets, or changes native accounting or Balance Forecast. Sinking Savings, protected savings, debt, and credit are excluded from Operating liquidity.

## Financial architecture decisions

- **Account roles:** Operating means day-to-day spendable cash and is the safety boundary. Sinking Savings physically backs selected sinking categories and is not ordinary liquidity. Long-term and emergency savings remain protected. Debt and credit accounts are never liquidity. An Operating purchase for a sinking purpose should be reimbursed from Sinking Savings through native Actual workflows.
- **Sinking model:** Native Actual envelope/category balances are the purpose-level source of truth; selected Sinking Savings account balances are physical backing. The fork does not create a second sinking-fund ledger or require one bank account per category. The backing view compares selected category balances with selected account cash, while Sweep remains a separate transfer advisor.
- **Forecast model:** Native `forecast/generate` supplies scheduled activity and projected end-of-day balances. Budget Burn overlays expected variable spending that is not already scheduled; it is continuous across month boundaries and creates no transactions. Today’s actual balance is a separate checkpoint from today’s projected close. Selected recurring employment schedules anchor Payday; benefits, refunds, reimbursements, and other inflows affect balances without redefining that date. Two same-day selected paycheques form one payday.
- **Read-only boundary:** Cash Flow may explain, warn, advise, and navigate to native screens. It does not post or skip schedules, move money, modify budgets or accounts, or create forecast-driven accounting entries. Forecast quick actions remain out of scope; use native Actual workflows.

## Historical implementation and validation

The calendar first added `/cash-flow`, account-role selection, native daily forecasts, scheduled events, transfer grouping, per-account negative warnings, month navigation, and Tracking Budget compatibility while preserving Balance Forecast. Primary Risk and the calendar use Operating cash after Burn: Operating-to-Operating transfers net to zero, transfers to Sinking Savings reduce Operating, reimbursements increase it, and Sinking-only events do not inflate the primary view. Savings Sweep uses both roles only where funding advice requires them. It constrains safe-to-move advice over the full configured horizon, applies the safety buffer, strictly matches scheduled funding transfers, and refuses green advice when Burn coverage is incomplete. Generic next inflow in Risk is informational, not Payday.

Manual schedule awareness uses native `posts_transaction` and `useSchedules` statuses. The calendar marks manual events, and Needs Attention shows due, missed, and upcoming manual items with navigation to `/schedules`; positive manual income is distinguished from expenses. The synthetic generator (`yarn cash-flow:generate-qa --anchor YYYY-MM-DD`) uses `@actual-app/api` to create a normal importable ZIP under ignored `data/cash-flow-qa/`. A fixed anchor produces equivalent normalized financial data even if IDs differ. Its fixture includes Operating, Sinking, protected savings, Burn categories, transfers across account roles, manual and automatic schedules, and two synchronized employment pay schedules. Import and manual UI checks validated protected balances not hiding an Operating shortfall, Burn reducing Operating cash, transfer boundaries, synchronized paydays, manual attention, and account warnings. Keep household data private; only synthetic fixtures belong in tests and the repository.

Family Validation was subsequently completed by the project owner using a separate private budget. For future schema-sensitive builds, retain a known-good Actual backup/export and verify current balances, schedules, and Burn selections using native import and rules.

## Completed before this sprint

- Native scheduled cash forecast, daily Operating closing balances, grouped transfers, negative-account warnings, month navigation, and Tracking Budget support.
- Operating and Sinking Savings account roles. Operating-only Risk and primary calendar remain separate from the Savings Sweep Advisor.
- Budget Burn for variable spending not already represented by scheduled expenses, with continuous cumulative Burn across month boundaries. Fixed Budget Automations provide funding-independent plans where available; the established funded-budget fallback and conservative incomplete states remain.
- Full-horizon Risk, conservative Savings Sweep, manual schedule awareness, and read-only Needs Attention navigation.
- Synthetic QA generator (`yarn cash-flow:generate-qa`) and manual UI validation using its generated budget.
- **Family Validation completed**, as reported by the project owner. Household financial data remains private and outside this repository.
- Independent reviews by ChatGPT and Jules Pro completed before this sprint.

## This sprint

### Payday and Cash Runway

Cash Flow Setup now stores selected recurring positive payday schedule IDs in the existing synced configuration. Older version-one settings load with an empty payday selection and retain every prior setting. Deleted, inactive, or no longer eligible schedules remain visible as a configuration problem rather than being replaced by guessed income.

The runway uses selected native forecast schedule occurrences in Operating accounts. Same-day selected paycheques form one payday, while different dates remain separate. Other income and transfers continue to affect forecast balances but never redefine the payday. A selected schedule outside Operating does not establish a funded Operating payday. Native posted-versus-scheduled matching prevents a posted paycheque from being forecast again.

The summary shows the next future payday, days remaining, schedule names, expected scheduled income, current Operating cash, lowest Burn-adjusted Operating closing cash before payday, first negative day and amount, and payday closing cash. The projected pre-payday window starts with today’s closing balance and ends the day before payday; current actual cash is assessed separately. Missing forecast or Burn data gives an incomplete state instead of a safety conclusion. Full-horizon Risk and Sweep retain their own calculations.

### Financial-safety hardening

Runway now checks actual Operating cash immediately as well as projected daily closes. A negative or below-buffer current balance cannot become a green conclusion because a later inflow improves today’s close. The UI labels the actual snapshot, today’s projected close, and the lowest projected close separately. Every selected payday schedule must remain eligible, including the same transfer-payee exclusion used by Setup. An unavailable selection leaves the configuration incomplete even when another selected schedule has a valid forecast. When Burn is disabled, no Burn categories are selected, or Tracking Budget cannot provide envelope Burn, Runway presents a scheduled-only projection and names omitted unplanned variable spending; known low or negative cash still warns. Risk and Sweep retain their full-horizon calculations.

### Calendar day details

Every in-month calendar date opens a keyboard-accessible read-only detail popover. It shows native and Burn-adjusted Operating closing balances, cumulative and daily Burn, per-account balances and negative warnings, all grouped scheduled activity with manual indicators, and available category-level Burn. It states the native-balance-minus-cumulative-Burn relationship and does not invent an opening-balance transaction reconciliation or a transaction order within the day.

### Sinking Savings backing

A compact backing view compares selected native sinking-category balances with the current native balances of selected Sinking Savings accounts. Negative category balances cannot reduce the protected target; duplicate selections are counted once. It shows target, physical backing, shortfall or excess, percent where meaningful, and category balances. Future scheduled transfers do not count as cash already held. Sweep remains the separate transfer advisor.

### Debt and credit visibility

Users may select debt and credit accounts explicitly. The read-only debt-service view lists future scheduled transfers only when a unique, equal Operating outflow and selected debt-account inflow identify the payment. These payments are already in the Operating forecast and are not subtracted again. Credit spending, liability balances, interest, amortization, payoff simulation, and payment estimates are outside this view. Native account metadata does not reliably label debt accounts, so selection is explicit. Unmatched or ambiguous movements are omitted rather than guessed.

## Prior sprint verification checkpoint

Targeted unit and component tests cover payday grouping and exclusions, date boundaries, incomplete Burn, Sinking Savings backing, strict debt-transfer matching, day-detail keyboard interaction, and existing Cash Flow regression paths. The Cash Flow regression run passed 113 tests across 10 files; a focused Balance Forecast run passed its seven tests. The web package strict typecheck and targeted lint passed. `yarn generate:i18n` completed without tracked catalog changes. `yarn cash-flow:generate-qa --anchor 2026-10-17` produced an ignored synthetic ZIP for manual smoke checks. `yarn build:browser --skip-translations` passed; the default browser build command could not update translations because this workspace's `locale/` directory is generated content, not a translations Git checkout. No private financial fixture or extra dependency was added.

## Safety follow-up validation

The targeted Cash Flow and Balance Forecast regression run passed 153 tests across 15 files. After the final payee-data availability gate, the final focused Payday and page rerun passed 44 tests across two files. Root `yarn typecheck`, changed-file type-aware lint, formatting, and `git diff --check` passed. Tests used synthetic fixtures only. Runway still depends on the selected Burn categories and native scheduled forecast; unplanned spending outside those categories is not modeled. A synthetic-budget manual UI smoke pass of these final safety states remains useful before routine deployment.

## Release and version investigation

- Browser client version comes from `packages/desktop-client/package.json`; Electron exposes its bootstrap version. Settings displays the client and server versions.
- Upstream release notices fetch `actualbudget/actual`'s latest GitHub release and compare it with the client version using a three-number parser. The browser also has a separate app-update-ready flow. Electron and browser packages currently report `26.9.0`.
- A proposed fork version such as `26.9.0-ap.1` is **not approved**. The current comparison ignores the prerelease suffix, so changing only package versions would not create a reliable fork-aware update policy. Upstream notifications may still be useful for security awareness, but the wording and update action need an explicit fork policy.
- Recommendation: decide how fork builds identify themselves, how upstream releases are surfaced, and how fork releases are distributed before changing package versions or updater behavior. Keep the upstream base version visible. No updater, packaging, release tag, or publication change was made in this sprint.

## Remaining before routine deployment

1. Import the generated synthetic QA budget and perform a focused UI smoke pass in Envelope and Tracking modes, including setup persistence, day details, transfers, and privacy mode.
2. Choose the fork version and update-notification policy; document the supported installation and backup/update procedure.
3. Build and smoke-test the intended distribution artifact, including the selected update path, before installing it for routine use.

## Known limits

- Native `envelope-budget-month` cannot distinguish an explicit future zero budget from an unset future budget through the current read API. The existing Burn fallback is retained.
- Manual transfer Needs Attention can miss a schedule whose primary account is outside selected Cash Flow accounts while its counterparty is selected.
- Day details explain the available forecast and Burn data. Posted and other underlying changes that the forecast does not identify individually remain native forecast adjustments.
- The debt-service view requires explicit debt-account selection and a unique matched scheduled transfer; ordinary loan expenses without a native transfer relationship are not classified as debt payments.

## Upstream maintenance and deferred scope

Keep fork-specific behavior in small read-only projection and presentation modules. When upstream Actual provides equivalent functionality, prefer deleting duplicate fork code. Retired or delegated areas include custom account-balance storage, rules, CSV import, transaction history/filtering, bulk operations, Sankey, dashboard framework, themes, category hierarchy, sinking-fund ledger, schedule engine, logging, and accounting formatting. Debt payoff simulation and forecast-driven actions are not part of Cash Flow V2. Maintain targeted unit and component regression tests, strict typechecking and lint, plus synthetic-budget UI checks for forecast semantics and privacy. Avoid treating a passing calculation test as proof of native forecast, import, or distribution behavior.
