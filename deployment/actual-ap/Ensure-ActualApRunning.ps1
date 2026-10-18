#Requires -Version 7.0
[CmdletBinding()]
param([ValidateSet('Staging', 'Production')][string]$Environment = 'Production')

. (Join-Path $PSScriptRoot 'Backup.Common.ps1')
$context = Get-ActualApContext $Environment
$lock = $null
try {
  try { $lock = Enter-ActualApLock $context.Lock } catch {
    if ($_.Exception.Message -like 'Another backup, recovery check, or maintenance action holds*') { return }
    throw
  }
  Assert-ActualApCompose $context
  $running = $false
  try { $running = Test-ActualRunning $context } catch { }
  if (-not $running) {
    Start-ActualAp $context
    Write-Host "$(Get-Date -Format o) Recovered $Environment Actual service"
  }
} finally {
  if ($lock) { $lock.Dispose() }
}
