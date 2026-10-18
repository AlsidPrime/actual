# Native UI console follow-up

- **Account balance history:** Reproduced independently of Cash Flow on the native Operating Checking account page. Hovering the balance history chart logged React's `Cannot update a component (BalanceHistoryGraph) while rendering a different component (DefaultTooltipContent)` error. No Cash Flow code is involved in this route.
- **Schedule inputs:** The earlier acceptance log recorded React `value` null and uncontrolled-to-controlled input warnings during native Schedule editing. Opening and editing the synthetic `QA Manual due bill` amount, and opening Add new schedule, did not reproduce either warning in this pass. The native Schedule components were left unchanged.

Earlier console evidence: `acceptance/evidence/browser-console-errors.txt`. No errors were logged during the Cash Flow browser checks on the fresh dev server before the native account chart interaction.
