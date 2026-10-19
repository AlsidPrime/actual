#Requires -Version 7.0
[CmdletBinding()]
param(
  [ValidateSet('Staging', 'Production')][string]$Environment = 'Staging',
  [string]$LocalRoot = 'C:\ActualAP\backups',
  [string]$NasRoot = '\\LS720DE35\share\ActualAPBackups',
  [string]$OneDriveRoot = 'C:\Users\alsid\OneDrive\ActualAPBackups',
  [Parameter(Mandatory)][string]$RecipientsFile,
  [Parameter(Mandatory)][string]$IdentityFile,
  [ValidateRange(2, 3650)][int]$LocalRetentionDays = 14,
  [ValidateRange(2, 3650)][int]$NasRetentionDays = 30,
  [ValidateSet('None', 'Copy', 'Encrypt')][string]$InjectFailure = 'None'
)

. (Join-Path $PSScriptRoot 'Backup.Common.ps1')
$context = Get-ActualApContext $Environment
$lock = $null
$work = $null
$mustRestart = $false
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$basename = "actual-ap-$($Environment.ToLowerInvariant())-$runId.tar.gz.age"
$logPath = Join-Path $LocalRoot "actual-ap-$($Environment.ToLowerInvariant()).log"

function Write-BackupLog {
  param([string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -LiteralPath $logPath -Value $line
  Write-Host $line
}

function Copy-VerifiedArchive {
  param([string]$Archive, [string]$Checksum, [string]$Destination)
  $target = Join-Path $Destination ([System.IO.Path]::GetFileName($Archive))
  $partial = "$target.partial"
  if (Test-Path -LiteralPath $target) { throw "Archive already exists: $target" }
  try {
    Copy-Item -LiteralPath $Archive -Destination $partial -ErrorAction Stop
    $copiedHash = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash
    if ($copiedHash -cne $Checksum) { throw "Destination checksum mismatch: $Destination" }
    Move-Item -LiteralPath $partial -Destination $target
    Set-Content -LiteralPath "$target.sha256" -Value $Checksum -NoNewline
    return $target
  } finally {
    Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue
  }
}

function Remove-ExpiredArchives {
  param([string]$Directory, [int]$Days)
  $pattern = "actual-ap-$($Environment.ToLowerInvariant())-*.tar.gz.age"
  $valid = @(Get-ChildItem -LiteralPath $Directory -Filter $pattern -File | Sort-Object LastWriteTimeUtc -Descending | Where-Object {
    $sidecar = "$($_.FullName).sha256"
    (Test-Path -LiteralPath $sidecar -PathType Leaf) -and
    ((Get-Content -LiteralPath $sidecar -Raw).Trim() -ceq (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)
  })
  if ($valid.Count -le 2) { return }
  $cutoff = (Get-Date).ToUniversalTime().AddDays(-$Days)
  foreach ($item in ($valid | Select-Object -Skip 2)) {
    if ($item.LastWriteTimeUtc -lt $cutoff) {
      Remove-Item -LiteralPath $item.FullName -Force
      Remove-Item -LiteralPath "$($item.FullName).sha256" -Force
      Write-BackupLog "Removed expired verified archive from $Directory"
    }
  }
}

try {
  if ($OneDriveRoot -cne 'C:\Users\alsid\OneDrive\ActualAPBackups') {
    throw 'Only the designated personal OneDrive directory is allowed'
  }
  if ($Environment -eq 'Production' -and
    ($NasRoot -cne '\\LS720DE35\share\ActualAPBackups' -or $InjectFailure -ne 'None')) {
    throw 'Production NAS destination and fault injection are fixed'
  }
  if (-not [System.IO.Path]::IsPathFullyQualified($LocalRoot) -or
    -not [System.IO.Path]::IsPathFullyQualified($NasRoot) -or
    -not [System.IO.Path]::IsPathFullyQualified($OneDriveRoot)) { throw 'Backup destinations must be absolute paths' }
  if ($LocalRoot.StartsWith('\\') -or
    [System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($LocalRoot)).DriveType -eq [System.IO.DriveType]::Network) {
    throw 'Temporary backup root must be on a local drive'
  }
  if ([System.IO.Path]::GetFullPath($LocalRoot) -match '(?i)(^|[\\/])OneDrive(?:\s*-\s*[^\\/]+)?([\\/]|$)') {
    throw 'Temporary plaintext backup root must not be inside any OneDrive directory'
  }
  foreach ($path in @($LocalRoot, $NasRoot, $OneDriveRoot)) {
    $normalized = [System.IO.Path]::GetFullPath($path).TrimEnd('\') + '\'
    $source = [System.IO.Path]::GetFullPath($context.Data).TrimEnd('\') + '\'
    $checkout = [System.IO.Path]::GetFullPath($context.Root).TrimEnd('\') + '\'
    if ($normalized.StartsWith($source, [System.StringComparison]::OrdinalIgnoreCase) -or
      $source.StartsWith($normalized, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Backup destination overlaps live data' }
    if ($normalized.StartsWith($checkout, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Backup destination is inside the source checkout' }
  }
  $identityPath = [System.IO.Path]::GetFullPath($IdentityFile)
  if ($identityPath.StartsWith([System.IO.Path]::GetFullPath($context.Root).TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Private age identity must stay outside the source checkout'
  }
  if ($identityPath.StartsWith([System.IO.Path]::GetFullPath($context.Data).TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Private age identity must stay outside live data'
  }
  if ($identityPath -match '(?i)(^|[\\/])OneDrive(?:\s*-\s*[^\\/]+)?([\\/]|$)') {
    throw 'Private age identity must stay outside OneDrive'
  }
  if (-not (Test-Path -LiteralPath $RecipientsFile -PathType Leaf) -or
    -not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) { throw 'age recipient or identity file is unavailable' }
  if (-not (Test-Path -LiteralPath $context.Data -PathType Container)) { throw 'Designated data directory is missing' }
  if (-not (Test-Path -LiteralPath $LocalRoot -PathType Container)) { throw 'Local backup root is missing' }
  if (-not (Test-Path -LiteralPath $NasRoot -PathType Container)) { throw 'NAS backup root is unavailable' }
  if (-not (Test-Path -LiteralPath $OneDriveRoot -PathType Container)) { throw 'Personal OneDrive backup root is unavailable' }
  $lock = Enter-ActualApLock $context.Lock
  $tools = @{}
  foreach ($toolName in @('docker.exe', 'age.exe', 'tar.exe', 'robocopy.exe')) {
    $command = Get-Command -Name $toolName -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $command) { throw "Required tool $toolName is unavailable in this task's PATH" }
    $tools[$toolName] = $command.Source
  }
  Write-BackupLog "Prerequisites passed: PowerShell $($PSVersionTable.PSVersion) ($PSHOME); docker=$($tools['docker.exe']); age=$($tools['age.exe']); tar=$($tools['tar.exe']); robocopy=$($tools['robocopy.exe'])"
  Assert-ActualApCompose $context
  if (-not (Test-ActualRunning $context)) { throw 'Designated Actual service is not running' }
  $items = @(Get-ChildItem -LiteralPath $context.Data -Recurse -Force)
  if (@($items | Where-Object { $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint }).Count -gt 0) {
    throw 'Data tree contains a reparse point; copying it would be incomplete'
  }
  $sourceBytes = [UInt64](($items | Where-Object { -not $_.PSIsContainer } | Measure-Object -Property Length -Sum).Sum)
  $reserve = [UInt64](1GB)
  $copyBytes = [UInt64]([Math]::Ceiling([double]$sourceBytes * 1.1)) + $reserve
  Assert-Destination $LocalRoot ([UInt64]([Math]::Ceiling([double]$sourceBytes * 4.2)) + $reserve)
  Assert-Destination $NasRoot $copyBytes
  Assert-Destination $OneDriveRoot $copyBytes
  Write-BackupLog "Preflight passed for $Environment; all destinations writable with available space"

  $work = Join-Path $LocalRoot ".working-$($Environment.ToLowerInvariant())-$runId-$([guid]::NewGuid().ToString('N'))"
  $snapshot = Join-Path $work 'snapshot'
  [System.IO.Directory]::CreateDirectory((Join-Path $snapshot 'data')) | Out-Null
  $mustRestart = $true
  try {
    $stopArgs = (Get-ComposeArguments $context) + @('stop', '-t', '30', 'actual')
    Invoke-Checked 'docker' $stopArgs
    Write-BackupLog 'Designated Actual container stopped; copying complete /data mount'
    if ($InjectFailure -eq 'Copy') { throw 'Injected staging copy failure' }
    & robocopy.exe $context.Data (Join-Path $snapshot 'data') /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /XJ /NFL /NDL /NJH /NJS
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }
  } finally {
    if ($mustRestart) {
      Start-ActualAp $context
      $mustRestart = $false
      Write-BackupLog 'Designated Actual container restarted'
    }
  }

  Assert-DataTree (Join-Path $snapshot 'data')
  $manifest = [ordered]@{ schema = 1; environment = $Environment; createdUtc = (Get-Date).ToUniversalTime().ToString('o'); files = @(Get-DataManifest (Join-Path $snapshot 'data')) }
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $snapshot 'manifest.json') -Encoding utf8
  $tarball = Join-Path $work 'snapshot.tar.gz'
  Invoke-Checked 'tar.exe' @('-czf', $tarball, '-C', $snapshot, 'data', 'manifest.json')
  if ($InjectFailure -eq 'Encrypt') { throw 'Injected staging encryption failure' }
  $archive = Join-Path $LocalRoot $basename
  Invoke-Checked 'age' @('-R', $RecipientsFile, '-o', $archive, $tarball)
  $verified = Join-Path $work 'verified'
  $recoveredManifest = Expand-VerifiedArchive $archive $IdentityFile $verified
  Assert-Manifest (Join-Path $verified 'data') @($manifest.files)
  $checksum = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
  Set-Content -LiteralPath "$archive.sha256" -Value $checksum -NoNewline
  $nasArchive = Copy-VerifiedArchive $archive $checksum $NasRoot
  $oneDriveArchive = Copy-VerifiedArchive $archive $checksum $OneDriveRoot
  Write-BackupLog "Archive verified; NAS copy verified; personal OneDrive local file verified; cloud synchronization unverified"
  $state = [ordered]@{
    archive = $basename; createdUtc = $recoveredManifest.createdUtc; sha256 = $checksum
    local = 'verified'; nas = 'verified'; personalOneDriveFile = 'verified'; personalOneDriveCloud = 'unverified'
  }
  $state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $LocalRoot "actual-ap-$($Environment.ToLowerInvariant())-latest.json")
  Remove-ExpiredArchives $LocalRoot $LocalRetentionDays
  Remove-ExpiredArchives $NasRoot $NasRetentionDays
  Write-BackupLog "SUCCESS $basename"
} catch {
  if (Test-Path -LiteralPath $LocalRoot -PathType Container) { Write-BackupLog "FAILURE $($_.Exception.Message)" }
  throw
} finally {
  if ($mustRestart) {
    try { Start-ActualAp $context } catch { Write-Warning "Emergency restart failed: $($_.Exception.Message)" }
  }
  if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
  if ($lock) { $lock.Dispose() }
}
