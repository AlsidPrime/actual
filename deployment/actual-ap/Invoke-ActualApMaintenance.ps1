#Requires -Version 7.0
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Staging', 'Production')][string]$Environment,
  [Parameter(Mandatory)][string]$ScriptPath
)

. (Join-Path $PSScriptRoot 'Backup.Common.ps1')
if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf)) { throw 'Maintenance script does not exist' }
$context = Get-ActualApContext $Environment
$lock = Enter-ActualApLock $context.Lock
try {
  & $ScriptPath
  if (-not $?) { throw 'Maintenance script failed' }
} finally {
  $lock.Dispose()
}
