#Requires -Version 7.0
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$RecipientsFile,
  [Parameter(Mandatory)][string]$IdentityFile,
  [string]$LocalRoot = 'C:\ActualAP\staging\backup-validation',
  [string]$NasRoot = '\\LS720DE35\share\ActualAPBackups',
  [string]$OneDriveRoot = 'C:\Users\alsid\OneDrive\ActualAPBackups'
)

. (Join-Path $PSScriptRoot 'Backup.Common.ps1')
$context = Get-ActualApContext 'Staging'
Assert-ActualApCompose $context
Assert-DataTree $context.Data
if (-not (Test-ActualRunning $context)) { throw 'Synthetic staging service must be running before testing' }
$backupScript = Join-Path $PSScriptRoot 'Backup-ActualAp.ps1'
$baseArgs = @{ Environment = 'Staging'; RecipientsFile = $RecipientsFile; IdentityFile = $IdentityFile; LocalRoot = $LocalRoot; NasRoot = $NasRoot; OneDriveRoot = $OneDriveRoot }

& $backupScript @baseArgs
if (-not (Test-ActualRunning $context)) { throw 'Staging was left offline after successful backup' }
$state = Get-Content -LiteralPath (Join-Path $LocalRoot 'actual-ap-staging-latest.json') -Raw | ConvertFrom-Json
if ($state.local -ne 'verified' -or $state.nas -ne 'verified' -or
  $state.personalOneDriveFile -ne 'verified' -or $state.personalOneDriveCloud -ne 'unverified') { throw 'Backup state is incorrect' }
$archive = Join-Path $LocalRoot $state.archive
& (Join-Path $PSScriptRoot 'Restore-ActualApStaging.ps1') -Archive $archive -IdentityFile $IdentityFile
$health = $null
$info = $null
for ($attempt = 1; $attempt -le 12; $attempt++) {
  try {
    $health = Invoke-RestMethod 'http://127.0.0.1:5012/health' -TimeoutSec 5
    $info = Invoke-RestMethod 'http://127.0.0.1:5012/info' -TimeoutSec 5
    break
  } catch { Start-Sleep -Seconds 5 }
}
if (-not $health -or -not $info) { throw 'Independent restore did not respond to /health and /info' }
Write-Host 'PASS: backup, full archive hash verification, independent restore, /health, /info'

foreach ($case in @(
  @{ Name = 'NAS unavailable'; Change = @{ NasRoot = '\\127.0.0.1\actual-ap-unavailable' } },
  @{ Name = 'copy failure'; Change = @{ InjectFailure = 'Copy' } },
  @{ Name = 'encryption failure'; Change = @{ InjectFailure = 'Encrypt' } }
)) {
  $argsForCase = $baseArgs.Clone()
  foreach ($key in $case.Change.Keys) { $argsForCase[$key] = $case.Change[$key] }
  $logPath = Join-Path $LocalRoot 'actual-ap-staging.log'
  $oldLogLineCount = @(Get-Content -LiteralPath $logPath).Count
  $failed = $false
  try { & $backupScript @argsForCase } catch { $failed = $true }
  if (-not $failed) { throw "Expected $($case.Name) to fail" }
  if (-not (Test-ActualRunning $context)) { throw "Staging was left offline after $($case.Name)" }
  if ($case.Name -eq 'NAS unavailable') {
    $newLogLines = @(Get-Content -LiteralPath $logPath | Select-Object -Skip $oldLogLineCount)
    if (@($newLogLines | Where-Object { $_ -like '*Designated Actual container stopped*' }).Count -gt 0) {
      throw 'Unavailable NAS caused a container stop'
    }
  }
  Write-Host "PASS: $($case.Name) detected; staging remains running"
}

$tamperRoot = Join-Path $LocalRoot ('.tamper-' + [guid]::NewGuid().ToString('N'))
try {
  [System.IO.Directory]::CreateDirectory($tamperRoot) | Out-Null
  $tampered = Join-Path $tamperRoot ([System.IO.Path]::GetFileName($archive))
  Copy-Item -LiteralPath $archive -Destination $tampered
  Copy-Item -LiteralPath "$archive.sha256" -Destination "$tampered.sha256"
  [System.IO.File]::AppendAllText($tampered, 'corruption')
  $rejected = $false
  try { & (Join-Path $PSScriptRoot 'Restore-ActualApStaging.ps1') -Archive $tampered -IdentityFile $IdentityFile } catch { $rejected = $true }
  if (-not $rejected) { throw 'Tampered archive was accepted' }
  Write-Host 'PASS: archive corruption rejected'
} finally {
  Remove-Item -LiteralPath $tamperRoot -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host 'Inspect the restored budget in a browser before marking the recovery drill complete.'
