# Actual Budget AP Fork — Release Versioning and Update Policy Investigation

## Overview
This document outlines the investigation and recommended policy for versioning and distributing the "AP Cash Flow Calendar V2" fork of Actual Budget (`AlsidPrime/actual`), based on upstream baseline `v26.9.0`.

## Investigation Findings

### 1. Native Actual Version Handling & Upstream Release Checks
- **Source of Truth:** The application version is primarily defined in `package.json` across workspaces (e.g., `packages/desktop-client/package.json`). At runtime, it's injected into `window.Actual.ACTUAL_VERSION` via Electron's `preload.ts` or the browser's `browser-preload.js`.
- **Upstream Checking:** Actual proactively checks for upstream releases by fetching the latest tag from the GitHub API (`https://api.github.com/repos/actualbudget/actual/releases/latest`).
- **Version Comparison:** The check compares `ACTUAL_VERSION` against the GitHub tag using `cmpSemanticVersion` in `packages/desktop-client/src/util/versions.ts`.
  - **Crucial Detail:** The `parseSemanticVersion` function strictly assumes a three-number format, stripping `v`, splitting by `.`, and mapping to `parseInt`. Example: `26.9.0` becomes `[26, 9, 0]`.

### 2. Update Notifications
There are two distinct types of "updates" in the Actual ecosystem:
- **Upstream Notification:** Triggered in `FinancesApp.tsx` when `versionInfo.isOutdated` is true. It shows a banner: "A new version of Actual is available!".
- **Service Worker Update (Browser/Self-Hosted only):** Handled via `applyAppUpdate()`. When a new build is deployed to the server, the service worker detects it and prompts the user to reload the page to load new assets.

### 3. Browser/Self-Hosted vs. Electron Deployment
- **Browser/Self-Hosted:** Seamless updates via the service worker. `isUpdateReadyForDownload` resolves when the SW detects changes.
- **Electron:** Auto-updates are explicitly disabled in `packages/desktop-electron/preload.ts` (`isUpdateReadyForDownload: () => false`). Users must manually download and install new Electron releases.

## Recommended Policy

### 1. Version Scheme
- **Format:** Use the format `<upstream_base>-ap.<build_number>`, e.g., `26.9.0-ap.1`.
- **Reasoning:** It clearly identifies the upstream base (`26.9.0`) and the fork build (`ap.1`), fulfilling semver compatibility and clear identification.

### 2. Upstream Release Awareness & Misleading Actions
- **Maintain Upstream Awareness:** We should keep the GitHub API check to ensure users know when upstream security or feature updates happen.
- **Prevent Misleading Actions:** The current notification text ("A new version of Actual is available!") implies the user should update *their fork*. We must distinguish between upstream and fork updates.
- **Recommendation:** Modify the notification text in `FinancesApp.tsx` to explicitly state: "A new version of **upstream** Actual is available!" and potentially link to a fork-specific documentation page explaining how upstream updates are handled.

### 3. Minimal Custom Patch Surface
To keep future rebases easy, we should isolate our changes:
1.  **Version String Parsing:** We must patch `parseSemanticVersion` in `versions.ts` to gracefully ignore our `-ap.X` suffix before running `parseInt`. If we don't, `parseInt("-ap")` will yield `NaN`, breaking the upstream comparison logic.
2.  **Notification Text:** A small, localized text change in `FinancesApp.tsx`.
3.  **Package.json Updates:** Updating the version strings across the workspaces.

### 4. Repeatable Private Release, Rollback, and Backup Process
- **Release:** Use a private GitHub release / Docker Image tag via standard CI/CD, tagging with the new scheme (`v26.9.0-ap.1`).
- **Rollback:** Because the fork's local indexedDB schema and database migrations are (currently) identical to upstream, rolling back simply means re-deploying the previous Docker image tag or reinstalling the previous Electron version.
- **Backup:** Advise users to use Actual's built-in "Export data" or automated backups feature before updating the fork, ensuring their `.sqlite` database is safely stored in case a manual restore is needed.

## Implementation Approach (Affected Files)

1.  **`packages/desktop-client/src/util/versions.ts`**: Update `parseSemanticVersion` to split by `-` and only parse the first part (the base version) to maintain compatibility with `cmpSemanticVersion`.
2.  **`packages/desktop-client/src/components/FinancesApp.tsx`**: Update the notification string from "A new version of Actual is available!" to "A new version of upstream Actual is available!".
3.  **`package.json` (and all workspace `package.json`s)**: Bump version to `26.9.0-ap.1`.

## Risks
- **Parsing Errors:** If the version parsing patch is flawed, the app might constantly think it's outdated or never realize it's outdated.
- **User Confusion:** Users might still be confused by the upstream notification if the messaging isn't sufficiently clear.

## Steps Needed Before First Private Release

1.  **[OWNER APPROVAL REQUIRED]** Approve the `26.9.0-ap.1` versioning scheme.
2.  **[OWNER APPROVAL REQUIRED]** Approve the plan to patch `parseSemanticVersion` to strip the suffix for upstream comparisons.
3.  **[OWNER APPROVAL REQUIRED]** Approve changing the update notification text to clarify "upstream" vs fork.
4.  Implement the code changes outlined in the "Implementation Approach" section.
5.  Run local verification and tests for both Electron (manual build check) and Browser (Service Worker check).
6.  Create a private GitHub release / Docker Image tag using the new scheme.