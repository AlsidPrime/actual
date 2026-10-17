# Actual Budget Fork — Project Status

_Last updated: 2026-10-17. Development checkpoint: `feature/cash-flow-calendar-v2` at reviewed HEAD `16ec805a2cfa83825c0d354ae31ee44969d1b9ac`, with this sprint's changes in the working tree. Upstream baseline: Actual Budget `v26.9.0`. No upstream rebase, release, or tag was made in this sprint._

## Product and safety boundary

Cash Flow Calendar V2 answers whether selected Operating accounts can carry ordinary cash needs through the next selected employment payday. It is a read-only view over Actual's native scheduled forecast and envelope data. It never posts transactions, moves money, edits schedules, changes budgets, or changes native accounting or Balance Forecast. Sinking Savings, protected savings, debt, and credit are excluded from Operating liquidity.

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

The summary shows the next future payday, days remaining, schedule names, expected scheduled income, current Operating cash, lowest Burn-adjusted Operating closing cash before payday, first negative day and amount, and payday closing cash. The pre-payday window starts today and ends the day before payday. Missing forecast or Burn data gives an incomplete state instead of a safety conclusion. Full-horizon Risk and Sweep retain their own calculations.

### Calendar day details

Every in-month calendar date opens a keyboard-accessible read-only detail popover. It shows native and Burn-adjusted Operating closing balances, cumulative and daily Burn, per-account balances and negative warnings, all grouped scheduled activity with manual indicators, and available category-level Burn. It states the native-balance-minus-cumulative-Burn relationship and does not invent an opening-balance transaction reconciliation or a transaction order within the day.

### Sinking Savings backing

A compact backing view compares selected native sinking-category balances with the current native balances of selected Sinking Savings accounts. Negative category balances cannot reduce the protected target; duplicate selections are counted once. It shows target, physical backing, shortfall or excess, percent where meaningful, and category balances. Future scheduled transfers do not count as cash already held. Sweep remains the separate transfer advisor.

### Debt and credit visibility

Users may select debt and credit accounts explicitly. The read-only debt-service view lists future scheduled transfers only when a unique, equal Operating outflow and selected debt-account inflow identify the payment. These payments are already in the Operating forecast and are not subtracted again. Credit spending, liability balances, interest, amortization, payoff simulation, and payment estimates are outside this view. Native account metadata does not reliably label debt accounts, so selection is explicit. Unmatched or ambiguous movements are omitted rather than guessed.

## Verification checkpoint

Targeted unit and component tests cover payday grouping and exclusions, date boundaries, incomplete Burn, Sinking Savings backing, strict debt-transfer matching, day-detail keyboard interaction, and existing Cash Flow regression paths. The Cash Flow regression run passed 113 tests across 10 files; a focused Balance Forecast run passed its seven tests. The web package strict typecheck and targeted lint passed. `yarn generate:i18n` completed without tracked catalog changes. `yarn cash-flow:generate-qa --anchor 2026-10-17` produced an ignored synthetic ZIP for manual smoke checks. `yarn build:browser --skip-translations` passed; the default browser build command could not update translations because this workspace's `locale/` directory is generated content, not a translations Git checkout. No private financial fixture or extra dependency was added.

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
