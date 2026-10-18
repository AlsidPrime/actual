#Requires -Version 7.0
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Archive,
  [Parameter(Mandatory)][string]$IdentityFile,
  [ValidateRange(1024, 65535)][int]$Port = 5012
)

. (Join-Path $PSScriptRoot 'Backup.Common.ps1')
$context = Get-ActualApContext 'Staging'
$restoreRoot = 'C:\ActualAP\staging\restore-test'
$restoreData = Join-Path $restoreRoot 'data'
$restoreEnv = Join-Path $restoreRoot 'restore.env'
$work = Join-Path $restoreRoot ('.verify-' + [guid]::NewGuid().ToString('N'))
$lock = $null
try {
  if (-not (Test-Path -LiteralPath $Archive -PathType Leaf) -or
    -not (Test-Path -LiteralPath "$Archive.sha256" -PathType Leaf) -or
    -not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) { throw 'Archive, checksum, or identity is missing' }
  if ([System.IO.Path]::GetFileName($Archive) -notmatch '^actual-ap-staging-\d{8}-\d{6}\.tar\.gz\.age$') { throw 'Only staging archives can be restored by this script' }
  $expectedHash = (Get-Content -LiteralPath "$Archive.sha256" -Raw).Trim()
  if ((Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash -cne $expectedHash) { throw 'Archive checksum mismatch' }
  if (Test-Path -LiteralPath $restoreData) { throw 'Independent restore data directory already exists; remove it only after reviewing prior test data' }
  [System.IO.Directory]::CreateDirectory($restoreRoot) | Out-Null
  $lock = Enter-ActualApLock $context.Lock
  Assert-Destination $restoreRoot ([UInt64]([Math]::Ceiling((Get-Item -LiteralPath $Archive).Length * 4.2) + 1GB))
  Expand-VerifiedArchive $Archive $IdentityFile $work | Out-Null
  Move-Item -LiteralPath (Join-Path $work 'data') -Destination $restoreData
  $envData = $restoreData.Replace('\', '/')
  Set-Content -LiteralPath $restoreEnv -Value @("ACTUAL_AP_PORT=$Port", "ACTUAL_AP_DATA_DIR=$envData")
  $args = @('compose', '--env-file', $restoreEnv, '-f', $context.Compose, '-p', 'actual-ap-restore', 'up', '-d', '--no-build', '--no-deps', 'actual')
  Invoke-Checked 'docker' $args
  Write-Host "Independent staging restore started at http://127.0.0.1:$Port; verify /health, /info, login, and budget contents."
} finally {
  if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
  if ($lock) { $lock.Dispose() }
}
