# AP Actual backup and recovery (Windows 11)

These instructions target image `actual-ap:26.9.0-ap.1`, Compose file
`deployment/actual-ap/compose.yml`, project `actual-ap`, and the bind mount
`C:\ActualAP\production\data`. The scripts default to **staging** unless the
backup task explicitly says `-Environment Production`. They never select a
OneDrive directory from `$env:OneDrive`; production uses only
`C:\Users\alsid\OneDrive\ActualAPBackups`. The employer-managed CCRD OneDrive
account and directory are excluded.

## Prerequisites and owner decisions

1. Install PowerShell 7, Docker Desktop with Compose, `tar.exe` (Windows 11),
   `robocopy.exe`, and [age](https://github.com/FiloSottile/age/releases).
   Make `age.exe` available on the scheduled account's PATH. Pin and record the
   installed age version. Confirm the production and staging Compose env files
   point to their respective fixed data paths before any backup.
2. As the Windows account that runs Docker Desktop and the **personal** OneDrive
   client, create `D:\ActualAPBackups`,
   `\\LS720DE35\share\ActualAPBackups`, and
   `C:\Users\alsid\OneDrive\ActualAPBackups`. Confirm that the last path is
   signed in to the personal account, not CCRD. Give that account read/write
   access. Use the NAS UNC path directly; do not use `Z:`. Owner approval is
   needed for NAS credentials, storage quota, and personal OneDrive placement.
3. Generate an age identity on the Windows host outside Git, for example:

   ```powershell
   New-Item -ItemType Directory C:\ActualAP\keys -Force | Out-Null
   age-keygen -o C:\ActualAP\keys\actual-ap-identity.txt
   age-keygen -y C:\ActualAP\keys\actual-ap-identity.txt | Set-Content C:\ActualAP\keys\actual-ap-recipients.txt
   icacls C:\ActualAP\keys\actual-ap-identity.txt /inheritance:r /grant:r 'alsid:R' 'SYSTEM:F'
   ```

   Review the ACLs with `icacls`; adapt the Windows account name if needed.
   Never paste the identity, password, or recovery phrase into a task argument,
   Git, logs, or a cloud folder. Keep an offline copy of the identity in a
   password manager or encrypted removable media, and a second independent
   offline copy. Test both copies by decrypting a **staging** archive. Losing
   the identity means losing access to every age-encrypted backup made for its
   recipient. Rotate the recipient only with an overlap period and a tested
   recovery path for old archives.
4. Approve a quiet nightly time (default example 02:00 local), the 14-day local
   and 30-day NAS retention periods, and a person to review OneDrive sync.
   Review the staging drill below before approving production task installation.

## What the backup does

`Backup-ActualAp.ps1` takes an exclusive per-environment lock shared with the
recovery checker and maintenance wrapper. Before stopping Actual it validates
the exact Compose `/data` host mount, container state, three writable
destinations, and free space (local: about 4.2 times source plus 1 GiB; each
remote destination: about 1.1 times source plus 1 GiB). It rejects reparse
points in the data tree and paths overlapping live data or the checkout.

It stops only Compose service `actual`, uses `robocopy /E` to snapshot all of
`/data` including hidden files and empty directories, and restarts the service
in `finally` before compression. The subsequent manifest contains every file's
relative path, size, and SHA-256 hash. The script creates a gzip tar archive,
encrypts it with age's recipient file, decrypts and extracts it into temporary
local storage, and compares the extracted files against the manifest. A
SHA-256 sidecar accompanies each archive; NAS and personal OneDrive copies are
hashed after copying. The temporary plaintext snapshot and tarball are removed
after success or failure. Restrict access to the local backup root because it
temporarily holds plaintext during a run.

The state JSON at `D:\ActualAPBackups\actual-ap-production-latest.json` reports
the local, NAS, and **local OneDrive file** as verified. It always reports
`personalOneDriveCloud: unverified`. A file in the sync folder is not proof of
cloud upload. Check the OneDrive client reports up to date, then verify the
same filename and size in the personal OneDrive web account (ideally download
and compare its SHA-256). Record that manual check separately. Never interpret
the JSON as cloud recovery confirmation.

Only after all three copies verify does retention run. It deletes verified
local archives older than 14 days and verified NAS archives older than 30 days,
while always retaining at least the two newest verified archives on each
destination. It does not automatically delete OneDrive files because the last
known cloud-synced copy cannot be inferred locally; review those manually
after confirming newer cloud copies. An archive without a valid sidecar is not
eligible for deletion. Logs go to `actual-ap-production.log` in the local
backup root; a failure exits nonzero and leaves prior verified copies intact.

## Staging drill before production

Use only the synthetic QA installation and its `staging.env`. Do not copy,
inspect, stop, or alter `C:\ActualAP\production\data` for this drill. Confirm
that `C:\ActualAP\staging\data` contains the synthetic budget and staging is
running. Create the three destination directories above and
`C:\ActualAP\staging\backup-validation`. Then, from the repository root:

```powershell
pwsh -NoProfile -File deployment/actual-ap/Test-ActualApBackup.ps1 `
  -RecipientsFile C:\ActualAP\keys\actual-ap-recipients.txt `
  -IdentityFile C:\ActualAP\keys\actual-ap-identity.txt
```

The drill checks a successful backup, exact decrypted archive contents,
verified NAS and local personal OneDrive files, a restore into independent
`C:\ActualAP\staging\restore-test\data` under project `actual-ap-restore`
on port 5012, `/health` and `/info`, unavailable NAS preflight, injected copy
and encryption failures, service running after each failure, and rejection of
a tampered archive. It leaves the independent restore instance available for
manual login, budget list, accounts, and Cash Flow inspection. Inspect it before
removing the test instance. A repeat drill requires removing the old independent
restore container and data **after reviewing it**; the script never overwrites
that directory. Record the date, commands, exit codes, restored budget checks,
and OneDrive web verification in the operator log. Do not claim cloud sync from
the automated test alone.

Current development validation: **Windows staging drill pending**. This
repository workspace has no Windows PowerShell, Docker Desktop, NAS, or
personal OneDrive session; no production data was accessed. Production task
installation is gated on the owner's Windows drill and review.

| Required staging result | Current status |
| --- | --- |
| Successful backup and archive integrity | Pending Windows drill |
| Independent restore and browser inspection | Pending Windows drill |
| NAS unavailable before stop | Pending Windows drill |
| Copy and encryption failures detected | Pending Windows drill |
| Container running after failures | Pending Windows drill |
| Tampered archive rejected | Pending Windows drill |
| Personal OneDrive cloud upload | Pending manual web check |

## Install the tasks after owner approval

Use Task Scheduler **Create Task**, run as the same signed-in `alsid` account
that has Docker Desktop, NAS, age identity, and personal OneDrive access. Select
**Run only when user is logged on**. This matches Docker Desktop's documented
sign-in startup behavior and the personal OneDrive client. In each task's
Settings select **Do not start a new instance**; the script's file lock adds
cross-task protection. Enable task history and review nonzero Last Run Result
and `actual-ap-production.log` each morning. Do not store a key or password in
the task action.

Backup task `Actual AP nightly backup`:

- Trigger: daily at 02:00 local; change this to the approved quiet time.
- Program: `C:\Program Files\PowerShell\7\pwsh.exe`
- Arguments: `-NoLogo -NoProfile -NonInteractive -File "<checkout>\deployment\actual-ap\Backup-ActualAp.ps1" -Environment Production -RecipientsFile "C:\ActualAP\keys\actual-ap-recipients.txt" -IdentityFile "C:\ActualAP\keys\actual-ap-identity.txt"`
- Start in: `<checkout>` (absolute repository path, without quotes).
- Settings: run as soon as possible after a missed start; stop if longer than
  four hours. The recovery task below handles an abrupt termination during
  the stopped-container interval. A missed night or failed preflight needs
  operator attention; inspect the log and retry after fixing it.

Recovery task `Actual AP service recovery`:

- Trigger: at the same user's sign-in and repeat every five minutes
  indefinitely; also run at sign-in after Docker Desktop becomes available.
- Program: `C:\Program Files\PowerShell\7\pwsh.exe`
- Arguments: `-NoLogo -NoProfile -NonInteractive -File "<checkout>\deployment\actual-ap\Ensure-ActualApRunning.ps1" -Environment Production`
- Start in: `<checkout>`.
- Settings: do not start a new instance. The checker skips while a backup or
  wrapped update holds the lock. Once the lock is released, it starts the
  designated service if it is down. This is a second recovery path if the
  backup process is forcibly terminated. If Docker Desktop itself is down,
  recovery waits for it to start; monitor that dependency too.

The account must remain signed in for these tasks and Docker Desktop's normal
startup path. [Docker documents](https://docs.docker.com/desktop/settings-and-maintenance/settings/)
its “Start Docker Desktop when you sign in” setting. In contrast,
[Tailscale's Windows Run unattended mode](https://tailscale.com/docs/how-to/run-unattended)
can keep Tailscale connected after sign-out or reboot, but it does not start
Docker Desktop or the personal OneDrive client. Changing Tailscale mode needs
separate owner approval.

### Separate, optional headless startup experiment

A [Docker community report](https://forums.docker.com/t/use-docker-for-windows-without-log-in/100078/3)
describes a Task Scheduler action running
`C:\Program Files\Docker\Docker\Docker Desktop.exe` with `--headless` at
startup. This is an **unverified workaround**, not part of the installation
above. If the owner later approves an experiment, create a disabled test task
under the Windows account that owns Docker Desktop, with trigger **At startup**
and a 30-second delay, program `Docker Desktop.exe`, and argument `--headless`.
Enable it for one controlled reboot with nobody logged in. From a second
device, test the intended Tailscale route and Actual `/health`; after signing
in, inspect Task Scheduler history, Docker Desktop state, `docker compose ps`,
and whether the correct bind mount is present. Repeat across several reboots,
including a Windows update, before considering reliance on it. If it fails,
disable/delete the test task and retain sign-in startup. Do not assume this
workaround starts Docker or OneDrive before login. The community has also
[reported failures](https://forums.docker.com/t/how-to-automatically-start-docker-in-windows-10-without-user-login/140086).

## Restore runbook

For a safe rehearsal, run `Restore-ActualApStaging.ps1` with a verified staging
archive and identity, then inspect `http://127.0.0.1:5012/health`, `/info`,
login, budget list, accounts, and Cash Flow. Its independent project and path
never replace the running staging installation. Stop and remove that project's
container after inspection, and retain or delete the synthetic restore data
only after recording the result.

For a real recovery, first obtain explicit owner approval for the selected
archive, target release image, expected data loss since its timestamp, and a
maintenance window. Recover the age identity from its offline copy if needed.
Verify the archive's `.sha256` sidecar and decrypt/extract it on a secure local
disk using `Expand-VerifiedArchive` from `Backup.Common.ps1`; this checks every
file against the internal manifest. Keep the extracted `data` directory private.
Use the maintenance wrapper/lock while performing the following sequence:

1. Confirm the current Compose environment resolves
   `C:\ActualAP\production\data` and project `actual-ap`. Preserve the current
   directory under a timestamped name outside Git on the same disk.
2. Stop only `actual` (`docker compose --env-file
   deployment/actual-ap/production.env -f deployment/actual-ap/compose.yml
   -p actual-ap stop actual`). Move the current data directory aside, then copy
   the verified archive's entire `data` directory into its place. If copying
   fails, move the original directory back. Never merge old and restored data.
3. Start `actual` with `up -d --no-build --no-deps actual` in a `finally` block.
   Check `/health`, `/info`, login, budget contents, and the matching image
   release. Keep the pre-restore directory and archive until all checks pass.

The full mount is necessary: `.migrate`, `config.json`, server SQLite, and
budget files travel together. A server archive does not recover unsynced edits
still only in a browser. Never rehearse these production steps against real
financial data during development.

## Updating without colliding with a backup

Take and verify a pre-update backup, then put the reviewed update commands in
a private PowerShell script outside Git and run:

```powershell
pwsh -NoProfile -File deployment/actual-ap/Invoke-ActualApMaintenance.ps1 `
  -Environment Production -ScriptPath C:\ActualAP\private\approved-update.ps1
```

This uses the same exclusive lock as backup and recovery. The private update
script must throw on failure and should not call the backup script while it
holds the lock. Start the wrapper immediately after the verified pre-update
backup and recheck that no other backup ran between those steps. Do not run
direct Compose update commands while backup is scheduled. A manual unwrapped
Docker operation cannot be prevented by the file lock; operator procedure is
part of the protection.
