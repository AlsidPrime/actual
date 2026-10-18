# AP Actual Budget 26.9.0-ap.1: Windows Docker Desktop runbook

This release packages this fork's browser build and its matching sync server in
one image. The build uses `sync-server.Dockerfile`, the existing upstream server
packaging, and pins the translation source revision. Do not use the stock
`actualbudget/actual-server` image for Cash Flow Calendar V2.

## Prepare the Windows host

Install Docker Desktop and enable its setting to start after Windows sign-in.
Keep the PC awake when remote access is needed: Windows sleep stops the server
and Tailscale connectivity. Docker's `unless-stopped` policy restarts the
container after Docker starts or after a crash; it cannot start Docker Desktop
or wake Windows. Confirm Docker Desktop and Tailscale start in the desired
Windows login state before relying on unattended access. Tailscale's Windows
"Run unattended" setting is a separate, optional host change.

In PowerShell, run `Get-NetTCPConnection -LocalPort 5010,5011 -State Listen`
and choose unused ports. The Compose file publishes only on `127.0.0.1`.
Create `C:\ActualAP\production\data` and `C:\ActualAP\staging\data` outside
the repository. Keep the two directories separate. Ensure Docker Desktop can
write to them. Set an Actual server password in the browser during setup; the
Tailscale identity alone does not replace application authentication.

Copy `production.env.example` to a private `production.env` and
`staging.env.example` to a private `staging.env`, then adjust absolute paths and
ports. These files contain local paths and must stay outside Git. The only
required setting is `ACTUAL_AP_DATA_DIR`; `ACTUAL_AP_PORT` defaults to 5010.
Do not point either path at an existing Actual or household budget directory.

Run all commands from the repository root, at a reviewed release commit:

```powershell
docker compose --env-file deployment/actual-ap/staging.env -f deployment/actual-ap/compose.yml -p actual-ap-staging build
docker compose --env-file deployment/actual-ap/staging.env -f deployment/actual-ap/compose.yml -p actual-ap-staging up -d --no-build
docker compose --env-file deployment/actual-ap/staging.env -f deployment/actual-ap/compose.yml -p actual-ap-staging ps
Invoke-RestMethod http://127.0.0.1:5011/health
Invoke-RestMethod http://127.0.0.1:5011/info
```

Import only the synthetic QA archive from
`data/cash-flow-qa/cash-flow-qa-2026-10-17.zip` into staging. The image tag is
`actual-ap:26.9.0-ap.1`; the Compose project name isolates container names.
The data path and port isolate staging from production. The path in the example
env file is only a suggested location. Check `docker compose ... config` to
confirm the resolved host binding and volume before starting.

Before production, use the **container** at the staging port (never the Vite
server on 3001) to check the displayed client and `/info` server versions,
ZIP import, Budget and Accounts, Cash Flow setup and persistence, Payday and
Runway, Budget Burn Day Details, Sinking backing and Sweep, debt-service
transfers, service-worker update/reload, container restart, and a restore into
a second empty staging data path. Check logs and test a narrow viewport. The
provided QA ZIP has no debt account, so make a separate synthetic debt
scenario for that one browser check. Repeat phone, HTTPS, offline, and
reconnection checks on actual devices after Serve is approved.

After staging acceptance and owner approval, create a separate production env
file and run the same `build`, `up -d --no-build`, `ps`, `/health`, and `/info`
commands with `production.env` and `-p actual-ap`. Keep the production data
directory empty for first setup. No development watcher or Vite server runs in
the image. The container's HTTP port is 5006; the Windows host port is 5010
by default and is local-only.

## Data and backup

The full `/data` mount is required for recovery. It includes optional
`config.json`, migration state (`.migrate`), `server-files/account.sqlite`
(users, password hashes, sessions, and budget metadata), and `user-files/`
(budget blobs and group SQLite files). The browser also keeps a local IndexedDB
copy on each device; server backup does not replace an unsynced device copy.
Never place live data or backup archives in the source checkout.

Use an external destination such as `D:\ActualAPBackups`. A stopped-server
copy avoids an inconsistent SQLite snapshot. Schedule a regular manual backup
or a Windows Task Scheduler job that performs these same steps during a quiet
period; automation and retention must be configured on the host. This example
backs up production after verifying that the destination is a different drive
or folder from the live data:

```powershell
$compose = 'deployment/actual-ap/compose.yml'
$envFile = 'deployment/actual-ap/production.env'
$backup = 'D:\ActualAPBackups\actual-ap-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
docker compose --env-file $envFile -f $compose -p actual-ap stop actual
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item -Path 'C:\ActualAP\production\data' -Destination $backup -Recurse
docker compose --env-file $envFile -f $compose -p actual-ap up -d --no-build
```

Verify the copy contains `data/server-files/account.sqlite`, `data/user-files`,
and `data/.migrate` if present. Store another copy off the PC and protect it
like the budget itself. If the copy fails, keep the stopped source intact and
resolve the error before an upgrade. To rehearse, restore into an empty
**staging** data directory with the staging container stopped, then start and
verify login, budget list, accounts, and Cash Flow. Never rehearse against live
production data.

Restore a selected backup to production only after stopping the production
container and moving the current data directory aside. Copy the backup's
`data` directory to the configured production data path, start the matching
image, and verify `/health`, `/info`, login, and budget contents. Keep the
pre-restore directory until verification is complete. A restore must contain
all of `/data`, not just `account.sqlite` or a single budget blob.

For a synthetic restore rehearsal, change the paths and project to staging:

```powershell
$compose = 'deployment/actual-ap/compose.yml'
$envFile = 'deployment/actual-ap/staging.env'
$data = 'C:\ActualAP\staging\data'
$backupData = 'D:\ActualAPBackups\actual-ap-YYYYMMDD-HHMMSS\data'
docker compose --env-file $envFile -f $compose -p actual-ap-staging stop actual
Move-Item -Path $data -Destination ($data + '.before-restore')
Copy-Item -Path $backupData -Destination $data -Recurse
docker compose --env-file $envFile -f $compose -p actual-ap-staging up -d --no-build
```

Verify that `$backupData` exists and contains the expected files before moving
the current directory. Use the same sequence for production only after the
owner selects the backup and approves the restore.

## Update and rollback

For each new fork release, review upstream Actual changes and migration notes,
test against a copy of synthetic data first, and build an image tagged with the
new fork version. Before updating production, stop it and take a full `/data`
backup. Build and start the new tagged image, then verify it. Keep the old
image and backup until the new version has passed browser checks.

An image rollback alone does **not** reverse server or budget migrations. To
roll back, stop the container, preserve the post-upgrade data separately,
restore the matching pre-upgrade `/data` snapshot, select the old image tag in
Compose, and start it. Changes made after the backup will not exist in the
restored state. Test that sequence with synthetic staging data first.

## Tailscale Serve, after owner approval

On the Windows host, inspect `tailscale status`, `tailscale serve status`,
`tailscale serve get-config`, and the current HTTPS port and Jellyfin routes.
Save the existing Serve configuration before changing it. Check MagicDNS and
tailnet HTTPS certificates. If the host's HTTPS port 443 and root path are
free, the proposed private mapping is:

```powershell
tailscale serve --bg --https=443 http://127.0.0.1:5010
tailscale serve status
```

Use the actual machine and tailnet name shown by Tailscale; do not guess it.
The resulting URL should be `https://<machine>.<tailnet>.ts.net/`. If Jellyfin
already owns that HTTPS root, do not run the command above. A separate Serve
HTTPS port (for example `--https=8443`) can coexist, but its URL includes
`:8443`. A path such as `/actual` is unsuitable without a separate subpath
compatibility review because Actual's PWA and asset URLs use the origin root.
Choose the final route only after reviewing the existing configuration.
`tailscale funnel` would expose the service publicly and is not part of this
deployment.

After Serve is configured, check `https://<machine>.<tailnet>.ts.net/health`
and browser developer tools. The HTTPS response must retain
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`; Actual needs these for
`SharedArrayBuffer`. Confirm the page is a secure context and that its
service worker registers. Tailscale Serve's TLS termination with localhost
HTTP is suitable if those headers pass through unchanged.

Invite the second household user to the tailnet under their own Tailscale
identity, install Tailscale on each phone, and verify tailnet access policy
permits both identities to reach the Windows machine's Serve port. Both users
then log in to Actual with the intended Actual credentials. On each phone,
open the HTTPS URL and install the PWA using Android browser "Install app" or
iOS Safari "Add to Home Screen". Test home Wi-Fi and cellular separately,
including reconnect after airplane mode, Actual session expiry and re-login,
and offline viewing/editing followed by sync. Offline behavior and PWA install
must be validated on real devices; a narrow desktop browser viewport is only
an approximation. A trusted HTTPS origin supports service workers and PWA
installation; direct HTTP on a tailnet IP is not the intended phone URL.

## Troubleshooting

- If `/health` fails, inspect `docker compose ... ps` and `docker compose ... logs actual` for the selected project and check the data path is writable.
- If port 5010 is occupied, choose another unused localhost port in the private env file and update the Serve target later.
- If the browser shows old code, check the service-worker update prompt, reload, and verify `/info` plus the displayed client version. Avoid clearing browser storage before confirming all local edits have synced.
- If the browser declines persistent storage, keep device storage free and verify sync before relying on offline edits; test this on each real phone.
- If a phone cannot connect, check host sleep, Docker Desktop, Tailscale status on both devices, Serve status, DNS/HTTPS, and access policy in that order.
- If an update fails after migrations, follow the data restore and old-image rollback procedure above.

References: [Actual Docker install](https://actualbudget.org/docs/install/docker/),
[Actual server configuration](https://actualbudget.org/docs/config/),
[Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve),
[Tailscale users](https://tailscale.com/docs/manage-users), and
[Windows unattended mode](https://tailscale.com/docs/how-to/run-unattended),
plus [Actual SharedArrayBuffer requirements](https://actualbudget.org/docs/troubleshooting/shared-array-buffer/).
