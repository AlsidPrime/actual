Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-ActualApContext {
  param([ValidateSet('Staging', 'Production')][string]$Environment)
  $root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
  $name = $Environment.ToLowerInvariant()
  return @{
    Root = $root
    Compose = Join-Path $PSScriptRoot 'compose.yml'
    EnvFile = Join-Path $PSScriptRoot "$name.env"
    Project = $(if ($Environment -eq 'Production') { 'actual-ap' } else { 'actual-ap-staging' })
    Data = "C:\ActualAP\$name\data"
    Lock = "C:\ActualAP\locks\actual-ap-$name.lock"
  }
}

function Enter-ActualApLock {
  param([string]$Path)
  [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path)) | Out-Null
  try {
    return [System.IO.File]::Open($Path, 'OpenOrCreate', 'ReadWrite', 'None')
  } catch [System.IO.IOException] {
    throw "Another backup, recovery check, or maintenance action holds $Path"
  }
}

function Invoke-Checked {
  param([string]$Program, [string[]]$Arguments)
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}

function Get-ComposeArguments {
  param([hashtable]$Context)
  return @('compose', '--env-file', $Context.EnvFile, '-f', $Context.Compose, '-p', $Context.Project)
}

function Assert-ActualApCompose {
  param([hashtable]$Context)
  if (-not (Test-Path -LiteralPath $Context.EnvFile -PathType Leaf)) { throw 'Private Compose environment file is missing' }
  $args = (Get-ComposeArguments $Context) + @('config', '--format', 'json')
  $json = & docker @args
  if ($LASTEXITCODE -ne 0) { throw 'Docker Compose configuration failed' }
  $config = ($json -join "`n") | ConvertFrom-Json
  $volumes = @($config.services.actual.volumes)
  $expected = [System.IO.Path]::GetFullPath($Context.Data).TrimEnd('\', '/').Replace('\', '/')
  $matches = @($volumes | Where-Object {
    $_.target -eq '/data' -and
    [System.IO.Path]::GetFullPath([string]$_.source).TrimEnd('\', '/').Replace('\', '/') -ieq $expected
  })
  if ($matches.Count -ne 1 -or $volumes.Count -ne 1) { throw 'Compose /data mount does not match the designated environment' }
}

function Get-ActualContainerId {
  param([hashtable]$Context)
  $args = (Get-ComposeArguments $Context) + @('ps', '-q', 'actual')
  $id = (& docker @args | Select-Object -First 1)
  if ($LASTEXITCODE -ne 0 -or -not $id) { throw 'Designated Actual container is absent' }
  return [string]$id
}

function Test-ActualRunning {
  param([hashtable]$Context)
  $id = Get-ActualContainerId $Context
  $state = & docker inspect '--format' '{{.State.Running}}' $id
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect designated Actual container' }
  return (($state | Select-Object -First 1) -eq 'true')
}

function Start-ActualAp {
  param([hashtable]$Context)
  $args = (Get-ComposeArguments $Context) + @('up', '-d', '--no-build', '--no-deps', 'actual')
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    & docker @args
    if ($LASTEXITCODE -eq 0) {
      try { if (Test-ActualRunning $Context) { return } } catch { }
    }
    Start-Sleep -Seconds 5
  }
  throw 'Actual could not be restarted; the recovery task must retry when Docker is available'
}

if (-not ('ActualApDiskSpace' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ActualApDiskSpace {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true, EntryPoint="GetDiskFreeSpaceExW")]
  public static extern bool GetDiskFreeSpaceEx(string path, out ulong freeToCaller, out ulong total, out ulong totalFree);
}
'@
}

function Assert-Destination {
  param([string]$Path, [UInt64]$RequiredBytes)
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { throw "Destination unavailable: $Path" }
  $probe = Join-Path $Path ('.actual-ap-probe-' + [guid]::NewGuid().ToString('N'))
  try { [System.IO.File]::WriteAllText($probe, 'probe') } finally { Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue }
  [UInt64]$free = 0; [UInt64]$total = 0; [UInt64]$totalFree = 0
  if (-not [ActualApDiskSpace]::GetDiskFreeSpaceEx($Path, [ref]$free, [ref]$total, [ref]$totalFree)) {
    throw "Cannot measure free space at $Path"
  }
  if ($free -lt $RequiredBytes) { throw "Insufficient free space at $Path" }
}

function Get-DataManifest {
  param([string]$DataPath)
  $base = [System.IO.Path]::GetFullPath($DataPath).TrimEnd('\') + '\'
  return @(Get-ChildItem -LiteralPath $DataPath -File -Recurse -Force | ForEach-Object {
    [pscustomobject]@{
      Path = $_.FullName.Substring($base.Length).Replace('\', '/')
      Length = $_.Length
      Sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }
  } | Sort-Object Path)
}

function Assert-DataTree {
  param([string]$DataPath)
  if (-not (Test-Path -LiteralPath (Join-Path $DataPath 'server-files/account.sqlite') -PathType Leaf)) { throw 'Snapshot lacks server-files/account.sqlite' }
  if (-not (Test-Path -LiteralPath (Join-Path $DataPath 'user-files') -PathType Container)) { throw 'Snapshot lacks user-files' }
}

function Assert-Manifest {
  param([string]$DataPath, [object[]]$Expected)
  Assert-DataTree $DataPath
  $actual = @(Get-DataManifest $DataPath)
  if ($actual.Count -ne $Expected.Count) { throw 'Archive file count differs from snapshot' }
  for ($i = 0; $i -lt $actual.Count; $i++) {
    if ($actual[$i].Path -cne $Expected[$i].Path -or
      $actual[$i].Length -ne $Expected[$i].Length -or
      $actual[$i].Sha256 -cne $Expected[$i].Sha256) { throw 'Archive contents differ from snapshot' }
  }
}

function Expand-VerifiedArchive {
  param([string]$Archive, [string]$Identity, [string]$Destination)
  [System.IO.Directory]::CreateDirectory($Destination) | Out-Null
  $tarball = Join-Path $Destination 'verify.tar.gz'
  try {
    Invoke-Checked 'age' @('-d', '-i', $Identity, '-o', $tarball, $Archive)
    $entries = & tar.exe -tzf $tarball
    if ($LASTEXITCODE -ne 0) { throw 'Archive listing failed' }
    foreach ($entry in $entries) {
      if ($entry -notmatch '^(data/|manifest\.json$)' -or
        $entry -match '(^|/)\.\.(/|$)' -or $entry.Contains('\')) { throw 'Archive contains an unsafe path' }
    }
    Invoke-Checked 'tar.exe' @('-xzf', $tarball, '-C', $Destination)
    $manifestPath = Join-Path $Destination 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Archive lacks manifest' }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    Assert-Manifest (Join-Path $Destination 'data') @($manifest.files)
    return $manifest
  } finally {
    Remove-Item -LiteralPath $tarball -Force -ErrorAction SilentlyContinue
  }
}
