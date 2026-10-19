# Actual Budget Fork - Product Roadmap

**As of:** 2026-10-18  
**Project:** `AlsidPrime/actual` - Cash Flow Calendar V2 and follow-on household workflow  
**Upstream baseline:** Actual Budget `v26.9.0`  
**Current packaged release:** `26.9.0-ap.1`  
**Working branch:** `feature/cash-flow-calendar-v2`

> This is a _forward-looking product roadmap_, not a claim that proposed features exist. Keep `ACTUAL_BUDGET_PROJECT_STATUS.md` as the technical history and validation log. Never add private household financial data, receipts, credentials, keys, or backups to this public repository.

## Product mission

Envelope budgeting answers **"Can I afford this according to my budget?"** Cash-flow forecasting answers **"Will my selected operating accounts actually have enough cash before the next payday?"**

The broader product goal is **financial execution assistance**: reduce the need for the user to manually decide when to protect earmarked savings, highlight unsafe spending before it consumes planned savings, and translate forecasts into plain-language next actions.

**Target experience:** On or shortly after a confirmed payday, a user should be able to see (1) what cash must remain in Operating, (2) how much can safely be moved to physically back Sinking Savings, (3) whether genuine long-term surplus exists, and (4) which categories need immediate restraint. Advice must explain assumptions, confidence, and the next useful decision date. Forecasting remains strictly read-only; bank transfers and ledger edits are user-approved native workflows.

## Non-negotiable architecture and safety rules

- Stay close to upstream Actual. Reuse its accounts, categories/envelopes, schedules, rules, native transfers, transaction splits, attachments, and APIs wherever possible. Minimize custom patch surface and dependencies; do not introduce FullCalendar without compelling evidence.
- Cash Flow forecasts, risk, transfer recommendations, and notifications do not write to core accounting data. Never silently post a transaction, move money, modify a schedule, or change a budget.
- **Operating** is spendable day-to-day liquidity. **Sinking Savings** accounts are physical cash backing selected earmarked categories. **Long-term/emergency savings** remain outside Operating liquidity. **Credit and debt** are never counted as spendable cash.
- Category/envelope funding is a budget decision, **not** a physical bank transfer. A transfer between on-budget accounts is not a new expense. Physical backing and purpose-level envelope balances must be reconciled without a second custom ledger.
- Account for scheduled-versus-posted matching, both sides of transfers, credit-card spending and settlement, biweekly/triple-payment months, time zones, and incomplete or stale transaction data. Never show a confident green "safe" result when material spending is unmodeled.
- Test with synthetic/demo budgets. Never use real financial data for development or agent tests. Preserve privacy, strict TypeScript checking, upstream conventions, and reproducible restore procedures.

## Delivery sequence and status

| Phase                                        | Priority                | Status                           | Outcome                                                                                                                                                   |
| -------------------------------------------- | ----------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Cash Flow V2 and self-hosted release      | Foundation              | **Delivered and deployed**       | Working calendar, risk, Budget Burn, Reserve backing, Savings Sweep, Payday/Runway, private mobile access, verified encrypted backup/restore and recovery |
| 1. Real household onboarding                 | **Now**                 | **In progress**                  | Accurate accounts, opening balances, envelope categories, bank import workflow, scheduled income/bills, and a trusted daily Cash Flow view                |
| 2. Payday Assistant and spending guardrails  | **Next**                | **Design/validation pending**    | Explicit, confidence-aware instructions that preserve savings instead of leaving it in chequing                                                           |
| 3. Two-stage Savings Sweep                   | **Next after baseline** | **Not implemented in full**      | Recommend safe sinking-fund transfers first, then truly surplus long-term savings; identify future safe transfer dates                                    |
| 4. Receipt & Bill Intelligence               | **Planned V3**          | **Investigation pending**        | Capture images/PDFs, match existing transactions, OCR/AI categorize, and preview native splits for approval                                               |
| 5. Spending insights and low-friction habits | Later                   | **Not implemented**              | Useful item-level/category trends, reminders, completion and reconciliation workflow                                                                      |
| 6. Upstream/release operations               | Continuous              | **Operational baseline working** | Small maintainable fork, pinned deployment automation, updates/rebases, synthetic regression and restore rehearsal                                        |

### Phase 0 - Existing V2 capabilities (delivered)

- Read-only calendar of native scheduled projected cash by day, with Operating-only risk, end-of-day details, transfers, manual-item attention, and debt-payment visibility.
- Continuous Budget Burn of eligible unscheduled variable spending using Fixed Amount Budget Automation plans where available; conservative fallback/coverage notices.
- Selected employment payday schedules and cash runway; same-day paycheques grouped, unrelated inflows do not redefine payday.
- Physical Sinking Savings backing compared with positive native sinking-category balances.
- **Savings Sweep Advisor for today:** caps a proposed Operating-to-Sinking transfer at the remaining backing gap and the full-horizon minimum Operating balance less a safety buffer, considering strictly matched scheduled Reserve transfers. It does **not** transfer money.
- Windows self-hosting with private access, unattended container startup, encrypted NAS and personal-cloud backups, independent restore validation, and service recovery.

**Limits to acknowledge:** The existing Sweep advises on Sinking Savings **today**; it is not a future-date transfer planner and does not calculate a separate long-term-savings surplus. Budget Burn and the forecast are only as complete as schedules and imported transactions. The recent backup deployment script change may still exist in an unpushed local commit; verify branch synchronization before any new agent work.

### Phase 1 - Household onboarding and observation (now; no coding agent)

1. Create a fresh **Envelope Budget** in the private production installation using the current planning spreadsheet, excluding hypothetical pay increases and other unconfirmed income.
2. Add Operating, Sinking Savings, protected long-term savings, credit/debt accounts as appropriate. Use balances accurate to an explicit opening date; do not treat spreadsheet projections as real balances.
3. Create expense groups and monthly targets; use native budget automations where they improve repeatability. Distinguish planned sinking contributions, envelope assignments, and actual inter-account transfers.
4. Add native recurring employment pay, mortgage (every 14 days), recurring bills, debt service, and other known events. Test bank-transfer double-counting and three-payment months.
5. Use native bank statement imports and rules for payee normalization/categorization. Reconcile frequently enough that advice is meaningful, especially card spending not yet included in the ledger.
6. Select Cash Flow account/category roles, enable Budget Burn, configure a safety buffer, and compare Payday, Risk, backing, and Sweep against actual decisions through at least one or two pay cycles.
7. Record confusing or dangerous advice as concrete synthetic reproduction cases. **Do not** put the private budget or real transactions into the public repository or hand them to coding agents.

**Exit gate:** Accounts reconcile, schedules represent major future cash movement, selected variable spending is covered by realistic Burn plans, and the user understands the current Sweep recommendation. No false assurances when data is incomplete.

### Phase 2 - Payday Assistant and discretionary-spending guardrails (highest next product priority)

**User story:** "I was paid. Tell me what I should move now, what I must leave in chequing, and what spending I need to slow down so planned savings actually happen."

Build the smallest **read-only action-oriented layer** on top of existing V2 data, not a new ledger or budget engine:

- Show **Move now / Hold / Recheck on [date]** with amount, recipient _role_ (Sinking Savings or later Long-Term Savings), and plain-language reason. Distinguish current actual Operating cash from forecasted end-of-day and full-horizon minima.
- Explain impending obligations: upcoming scheduled bills, mortgage cadence, modeled discretionary spending, already scheduled transfers, and protected buffer. Do not present a transfer as safe if model coverage is incomplete.
- Make a clear distinction between monthly sinking-fund _target_, amount actually assigned to envelopes, cash physically backing those envelopes, and safe cash presently available to transfer.
- Surface overspending guardrails for discretionary categories: remaining envelope amount, actual spending against plan, projected pace/Burn, and whether the intended savings commitment is being jeopardized. Provide direct but non-shaming actions such as "Pause dining spending" or "Recheck after payday."
- Consider a lightweight payday review checklist/reminder and an explicit "reviewed" UI state **only** if it does not create a competing accounting state. Native confirmed transfers, not clicking "done", must drive cash balances.
- Add _data freshness and confidence_ UX before trusting action-level advice. Missing imports, card activity, uncategorized transactions, incomplete Burn, unknown upcoming payments, or outdated balances should downgrade recommendations rather than show false green safety.

**Exit gate:** In a synthetic payday scenario, user can tell exactly what to do or why to wait, with no extra manual financial arithmetic; changing a discretionary purchase meaningfully changes the advice or confidence state.

### Phase 3 - Two-stage Savings Sweep and future-date planner

1. **Protect sinking commitments first.** Calculate physical backing gap from selected native positive sinking-category balances minus selected Reserve cash and rigorously paired scheduled funding transfers. A proposed transfer cannot breach the Operating safety buffer at any modeled point in the configured horizon.
2. **Recommend a future opportunity** when moving today is unsafe. Evaluate future dated projections conservatively, including intervening bills, expected variable spending, relevant paydays, and modeled outgoing transfers. Clearly state the horizon and assumptions. Do not imply a guarantee if missing transactions could change the result.
3. **Long-term surplus second.** Only after covering operating needs, the buffer, outstanding sinking commitments, and future obligations should the advisor consider surplus to a separate protected long-term savings account. Avoid counting the same cash as both a sinking-fund transfer and surplus. Never include long-term savings in Operating liquidity.
4. Provide a configurable priority between additional long-term savings and accelerated debt repayment where relevant; **advice only**, with user ownership of the financial choice. No speculative interest/payoff model without separate approval.
5. After the user carries out a suggested transfer in their bank, let native Actual transfers (entered/imported and matched) update both account balances and forecast. Do not invent a second "transferred" balance.

**Exit gate:** Synthetic tests cover same-day and later paydays, third mortgage payments, incomplete Burn, scheduled Reserve funding, credit-card settlement, cross-account transfers, no income before horizon end, overdraft/buffer risk, and long-term sweep without double counting. A suggestion must never trigger a transfer or ledger mutation.

### Phase 4 - V3 Receipt & Bill Intelligence (separate optional workstream)

**Goal:** Reduce the friction of transaction categorization and splitting so real spending is reflected promptly and accurately, without turning the forecast into an accounting writer.

**4A. Research existing Actual capabilities first (Jules Pro investigation).** Inventory native transaction import, payees/rules, attachments, split-transaction UI/APIs, mobile/PWA capture constraints, and server file storage/sync/backup behaviour. Identify minimal extensions and the permission/privacy model. Do not assume a parallel receipt database is needed.

**4B. Receipt Inbox and attachment workflow (Codex UI development).** Take one or multiple photos (including long receipts) or upload an image/PDF bill. Preserve the original privately, show processing status, allow manual review/correction, support unmatched receipt inbox, and attach the evidence to the native transaction wherever feasible. Consider phone upload, offline/retry, duplicates, file-size limits, and restoration from backup.

**4C. Matching without new expenses.** When a bank/credit-card statement transaction arrives, suggest matches using merchant/payee, date, total, and available account context, with candidate confidence and user override. The receipt is **evidence**, not permission to post a new expense. Explicitly handle tips, tax, discounts, partial refunds, multiple receipts per payment, and already-matched items. Do not silently duplicate bank transactions or schedules.

**4D. OCR/AI-assisted itemization, categorization, and splits.** Extract merchant, transaction date, amounts, line items, quantity/price, taxes, discounts and invoice/bill context. Propose categories per item (e.g., groceries vs household goods vs discretionary snacks), with a preview of **native Actual split transactions**. The split sum must exactly equal the matched posted transaction to the cent; ambiguous allocation is flagged for manual correction. User approval is required before any transaction is edited; native accounting paths perform the approved update, not forecast code.

**4E. Bills/invoices.** Support PDF/image bills and mixed-purpose charges when useful, with due-date, vendor, amount, and line-item extraction. Match against existing schedules or imported payments without creating a duplicate obligation. Defer bill-to-schedule creation or transaction posting unless separately approved and implemented through native Actual workflows.

**4F. Optional privacy-conscious model backend.** Prefer a separable optional local OCR/vision service using available hardware; do not mandate an always-on GPU or external AI API. If inference is unavailable or low-confidence, preserve the image and allow manual categorization. Do not transmit financial documents to third-party models without explicit opt-in, and document private storage, encryption, sync, recovery, and retention before enabling real receipt uploads.

**Exit gate:** A synthetic mixed-store receipt containing groceries, household items, discounts and tax can be photographed, matched once to an imported purchase, reviewed, split to the exact settled total through native Actual, attached, synced, backed up, and restored. A failure at any intermediate step leaves the original transaction intact.

### Phase 5 - Spending insights and habit support (later)

- Item-level trends: groceries vs household items, snacks/convenience spending, recurring merchant patterns, categories repeatedly exceeding plan. Clearly label estimates or classifications that came from OCR/AI.
- Better review routines: uncategorized items, missing recent imports, unmatched receipts, upcoming bills requiring manual action, and savings decisions awaiting review.
- Only add phone notifications, reminders, or advanced insights once native workflow and data quality prove their value. No guilt-inducing gamification, forced blocking, or unsupported assurances.

### Phase 6 - Operational maintenance (continuous)

- Pin the production backup/recovery scripts to a reviewed deployment revision instead of automatically inheriting work-in-progress edits. Preserve offline decryption-key recovery and restore rehearsals.
- Track upstream Actual releases, security updates, breaking data migrations, and the fork's `-ap` version/update-notification policy. Keep feature modules detachable and prefer replacing custom features with equivalent upstream functionality.
- Exercise targeted unit/integration tests during development; run typechecks/lint, synthetic QA browser/mobile checks, and restore drills at milestones. Review diffs and checkpoint commits. No new dependency or core accounting alteration without a documented need.

## Agent assignment and implementation gates

| Work                                                                                           | Primary owner                     | Gate before implementation                                      |
| ---------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------- |
| Private household budget setup, transactions and manual financial validation                   | User + project coordinator        | Keep real financial data private; no coding agent access        |
| Read-only Payday Assistant UI, future transfer-date UX, receipt capture and workflow debugging | Codex High, VS Code               | Signed-off financial examples and current synthetic QA fixtures |
| Audit of savings math, transfers, stale-data cases, credit-card effects, long-horizon safety   | Jules Pro (independent review)    | Explicit behavior matrix and no production data                 |
| Investigation of native attachment/split/OCR architecture, optional local model service        | Jules Pro (self-contained)        | Scope and privacy boundary; investigation before dependencies   |
| Synthetic receipt/invoice test fixture generation, integration tests, deeper regression        | Jules Pro or Codex as appropriate | No real receipts, account exports or secrets                    |
| Release packaging, Windows debugging, manual phone and browser acceptance                      | Codex + user                      | Staging verified before deploying updates                       |

## Immediate next decisions

1. **Finish real-budget onboarding privately.** Do not pause to build V3 before the current forecast sees trustworthy accounts, schedules, envelopes and imported transactions.
2. **Observe at least one payday-to-payday cycle** and write down where V2 leaves the user uncertain or fails to make savings actionable.
3. **Specify the Payday Assistant as synthetic financial scenarios** and prioritize an explainable sinking sweep plus discipline guardrails over UI polish.
4. **Commission a bounded Jules Pro architecture investigation** for receipts, attachment handling and native splits; no V3 implementation until we know what upstream Actual already supports.
5. **Update the current technical status separately** to reflect `26.9.0-ap.1`, validated deployment/backups/recovery and actual household onboarding. Confirm the local backup-tooling commit is pushed before requesting GitHub-only agent work.

## Definition of product success

- On payday, user can act immediately on a conservative "move X / hold Y / recheck on Z" recommendation, or understand clearly why an answer is unavailable.
- Sinking money is physically segregated without mistaking an envelope allocation for a bank transfer; long-term savings are considered only after all protected needs.
- Overspending becomes visible early enough to make a deliberate trade-off, not as a surprise at the end of the month.
- Receipt and bill ingestion saves effort but never silently creates duplicates, misallocates splits, or rewrites core data without approval.
- Every safety claim is traceable to dates, balances, scheduled events, Burn coverage and account selections; incomplete inputs lead to caution rather than false green advice.
