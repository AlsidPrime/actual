# AP Actual backup and recovery (Windows 11)

These instructions target image `actual-ap:26.9.0-ap.1`, Compose file
`deployment/actual-ap/compose.yml`, project `actual-ap`, and the bind mount
`C:\ActualAP\production\data`. The scripts default to **staging** unless the
backup task explicitly says `-Environment Production`. They never select a
OneDrive directory from `$env:OneDrive`; production uses only
`C:\Users\alsid\OneDrive\ActualAPBackups`. The employer-managed CCRD OneDrive
account and directory are excluded.

## Prerequisites and owner decisions

1. Use the installed PowerShell 7 at
   `C:\Program Files\PowerShell\7\pwsh.exe`, Docker Desktop with Compose,
   Windows `tar.exe` and `robocopy.exe`, and the installed
   [age](https://github.com/FiloSottile/age/releases). age and age-keygen were
   installed by WinGet under the user's profile; the noninteractive task may
   have a different PATH. The backup script now fails before stopping Actual
   if `docker.exe`, `age.exe`, `tar.exe`, or `robocopy.exe` cannot be found, and
   logs their resolved paths and the PowerShell version. Confirm the production
   and staging Compose env files point to their respective fixed data paths.
2. As the Windows account that runs Docker Desktop and the **personal** OneDrive
   client, create `C:\ActualAP\backups`,
   `\\LS720DE35\share\ActualAPBackups`, and
   `C:\Users\alsid\OneDrive\ActualAPBackups`. Confirm that the last path is
   signed in to the personal account, not CCRD. Give that account read/write
   access. Use the NAS UNC path directly; do not use `Z:`. Owner approval is
   needed for NAS credentials, storage quota, and personal OneDrive placement.
3. Reuse the age identity and recipient file already proven in the staging
   drill; do not regenerate or overwrite them for task deployment. Keep the
   identity outside Git and OneDrive, for example under `C:\ActualAP\keys`,
   and review its account ACLs with `icacls`. Adapt task path arguments if the
   tested files are elsewhere.
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

The state JSON at `C:\ActualAP\backups\actual-ap-production-latest.json` reports
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
eligible for deletion. Logs go to
`C:\ActualAP\backups\actual-ap-production.log`; a failure exits nonzero and
leaves prior verified copies intact.

## Staging drill before production

Use only the synthetic QA installation and its `staging.env`. Do not copy,
inspect, stop, or alter `C:\ActualAP\production\data` for this drill. Confirm
that `C:\ActualAP\staging\data` contains the synthetic budget and staging is
running. Create the NAS and personal OneDrive destination directories above and
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

The owner reports the full Windows synthetic staging drill passed. The
repository workspace did not directly run these Windows checks. The separate
**unattended scheduled-task** staging test below is still pending. Production
task installation remains gated on that test and separate owner approval.

| Required staging result                            | Current status                         |
| -------------------------------------------------- | -------------------------------------- |
| Successful backup and archive integrity            | Owner verified on synthetic staging    |
| Independent restore and browser inspection         | Owner verified on port 5012            |
| NAS unavailable before stop                        | Owner verified                         |
| Copy and encryption failures detected              | Owner verified                         |
| Container running after failures                   | Owner verified                         |
| Tampered archive rejected                          | Owner verified                         |
| Personal OneDrive cloud upload and SHA-256 sidecar | Owner verified in personal web account |
| Backup task before Windows login                   | Pending separate staging task test     |

## Unattended task account and existing Docker startup

The owner has verified that the existing Task Scheduler action
`Docker Desktop.exe --headless` starts Docker Desktop before Windows login on
this host. Leave that task unchanged. This host result does not establish that
the backup task, NAS credentials, age's WinGet path, or personal OneDrive sync
will work in a noninteractive session. The headless action originated as a
[community workaround](https://forums.docker.com/t/use-docker-for-windows-without-log-in/100078/3);
[Docker's documented setting](https://docs.docker.com/desktop/settings-and-maintenance/settings/)
starts Docker Desktop at sign-in. Tailscale is separately configured to
[run unattended](https://tailscale.com/docs/how-to/run-unattended). Neither
Docker nor Tailscale starts the personal OneDrive sync client before login.

For the temporary staging task and, only after approval, the production tasks,
use Task Scheduler **Create Task** under the existing Windows account that owns
the Docker, NAS, age, and personal OneDrive paths. Determine its exact principal
name with `whoami` in the working Windows session. Choose **Run whether user is
logged on or not** and leave **Do not store password** _unchecked_. Task
Scheduler prompts for that account's Windows password at registration and
stores credentials for a background logon; the Windows Hello PIN is not the
password. This is a host credential-storage decision for the owner. Never put
that password, NAS credentials, or age identity contents in task arguments or
logs. The account also needs permission to run batch jobs and access Docker's
named pipe, the key files, the backup directories, and the NAS share.

The **Do not store password** option uses an S4U logon. Microsoft states that
S4U tasks have [no network or encrypted-file access](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskfolder-registertaskdefinition),
so this option is unsuitable for the NAS UNC copy. Password-backed task logon
permits network authentication, but saved NAS credentials and Docker access
still need a real logged-out staging test. Keep the NAS path as
`\\LS720DE35\share\ActualAPBackups`; mapped drives such as `Z:` are tied to
another logon session. A background task can create a file in the personal
OneDrive folder, while cloud upload may wait until the personal sync client
runs after sign-in. The backup state remains `personalOneDriveCloud: unverified`
until separately checked in the personal web account.

## Temporary staging-only Task Scheduler test

This tests the new noninteractive account context without rerunning
`Test-ActualApBackup.ps1` or touching the existing independent restore at
`C:\ActualAP\staging\restore-test`. Use the already-created synthetic staging
data and `C:\ActualAP\staging\backup-validation` local root. Substitute the
absolute repository root for `<checkout>` below (run `(Resolve-Path .).Path`
from the checkout to obtain it).

1. In **Task Scheduler → Create Task**, name it `AP staging backup test`. On
   **General**, select the existing account from `whoami`,
   **Run whether user is logged on or not**, and leave **Do not store password**
   unchecked. Use the same privilege level as the successful Docker CLI test;
   enable **Run with highest privileges** only if that account needs it for
   Docker access. Supply the account password only to Task Scheduler when it
   prompts on Save.
2. On **Triggers**, add **At startup**, enabled, with a five-minute delay so
   the existing headless Docker task can initialize. On
   **Actions**, set Program/script to
   `C:\Program Files\PowerShell\7\pwsh.exe`, Add arguments to:

   ```text
   -NoLogo -NoProfile -NonInteractive -File "<checkout>\deployment\actual-ap\Backup-ActualAp.ps1" -Environment Staging -LocalRoot "C:\ActualAP\staging\backup-validation" -RecipientsFile "C:\ActualAP\keys\actual-ap-recipients.txt" -IdentityFile "C:\ActualAP\keys\actual-ap-identity.txt"
   ```

   Set **Start in** to `<checkout>` without quotes. Confirm the action contains
   `-Environment Staging`, the staging local root, and no production argument.

3. On **Settings**, select **Do not start a new instance** and **Stop the task
   if it runs longer than 4 hours**; do not enable automatic retries for this
   one-off test. Enable task history. Save and first choose **Run** while signed
   in; it still uses the chosen background logon type. Review the result below.
4. For the before-login test, reboot, leave Windows at the sign-in screen, and
   wait at least five minutes plus the usual staging backup duration. Do not
   sign in until the run should be complete. After sign-in, compare Task
   Scheduler's **History** start/end timestamps with your first sign-in time,
   then perform the checks below. If the task did not start or failed because
   Docker was not ready, inspect its history and increase the staging trigger
   delay for another controlled test. Disable or delete this temporary task
   after recording the result. Leave the restore-test directory alone.

For each run, require Task Scheduler **Last Run Result `0x0`**, a new `SUCCESS`
entry and prerequisite tool paths in
`C:\ActualAP\staging\backup-validation\actual-ap-staging.log`, and a fresh
`actual-ap-staging-latest.json` with `local`, `nas`, and
`personalOneDriveFile` set to `verified`. A failure or missing result needs
investigation before production scheduling. From the repository root, after
sign-in, verify the actual archive and sidecars without touching production:

```powershell
$root = 'C:\ActualAP\staging\backup-validation'
$state = Get-Content -LiteralPath (Join-Path $root 'actual-ap-staging-latest.json') -Raw | ConvertFrom-Json
$copies = @(
  (Join-Path $root $state.archive),
  (Join-Path '\\LS720DE35\share\ActualAPBackups' $state.archive),
  (Join-Path 'C:\Users\alsid\OneDrive\ActualAPBackups' $state.archive)
)
foreach ($copy in $copies) {
  if (-not (Test-Path -LiteralPath "$copy.sha256")) { throw "Missing sidecar: $copy" }
  if ((Get-Content -LiteralPath "$copy.sha256" -Raw).Trim() -cne $state.sha256 -or
      (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash -cne $state.sha256) { throw "Checksum mismatch: $copy" }
}
docker compose --env-file deployment/actual-ap/staging.env -f deployment/actual-ap/compose.yml -p actual-ap-staging ps actual
Invoke-RestMethod http://127.0.0.1:5011/health
```

Check that staging is running and `/health` succeeds. The three matching
checksums prove local/NAS/personal OneDrive **folder** copies only. Later, when
the personal OneDrive client is signed in and reports sync complete, open the
**personal** OneDrive web account, find the new archive and `.sha256` sidecar,
and compare their names, sizes, and sidecar checksum; downloading the archive
and hashing it gives stronger cloud verification. Never use the CCRD account.
Record cloud verification separately from the task's `0x0` result.

## Production tasks, only after the unattended staging test and owner approval

Use the same tested task principal, password-backed logon type, privilege
level, and verified executable paths. **Do not install these tasks yet.** In
each task select **Do not start a new instance**; the scripts also use an
exclusive per-environment lock. Review Task Scheduler history and the local
log after every run.

Backup task `Actual AP nightly backup`:

- Trigger: daily at 02:00 local, or the owner's chosen quiet time. The backup
  must run only after the existing headless Docker startup has completed.
- Program: `C:\Program Files\PowerShell\7\pwsh.exe`
- Arguments: `-NoLogo -NoProfile -NonInteractive -File "<checkout>\deployment\actual-ap\Backup-ActualAp.ps1" -Environment Production -LocalRoot "C:\ActualAP\backups" -RecipientsFile "C:\ActualAP\keys\actual-ap-recipients.txt" -IdentityFile "C:\ActualAP\keys\actual-ap-identity.txt"`
- Start in: `<checkout>` (absolute repository path, without quotes).
- Settings: run as soon as possible after a missed start; if it fails, retry
  every 15 minutes up to three times to allow Docker/NAS startup. Stop it if it
  runs longer than four hours. The recovery checker below handles an abrupt
  termination during the stopped-container interval. A failed night requires
  operator review, even if a retry succeeds.

Recovery task `Actual AP service recovery`:

- Trigger: **At startup**, delayed three minutes after the existing headless
  Docker task, repeated every five minutes indefinitely. Also allow a manual
  run for diagnosis. A five-minute repetition covers a backup process killed
  while the container was stopped.
- Program: `C:\Program Files\PowerShell\7\pwsh.exe`
- Arguments: `-NoLogo -NoProfile -NonInteractive -File "<checkout>\deployment\actual-ap\Ensure-ActualApRunning.ps1" -Environment Production`
- Start in: `<checkout>`.
- Settings: do not start a new instance. The checker skips while a backup or
  wrapped update holds the lock. Once the lock is released, it starts the
  designated service if it is down. If Docker Desktop itself is down, the
  checker fails and retries at its next trigger; monitor that dependency too.

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
