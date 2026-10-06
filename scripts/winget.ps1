# Writes the winget manifests for a release to target/release/winget/<version> and validates them.
# For the first submission to microsoft/winget-pkgs (docs/building.md, "winget"); later versions go out through
# .github/workflows/winget.yml.
param(
  [Parameter(Mandatory = $true)][string]$Version,
  # the released installer; without it the script downloads it from the GitHub release
  [string]$Installer
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$name = "Agent.Pets_${Version}_x64-setup.exe"
$url = "https://github.com/Marczelloo/agent-pets/releases/download/v$Version/$name"
$out = Join-Path $root "target/release/winget/$Version"
New-Item -ItemType Directory -Force $out | Out-Null

if (-not $Installer) {
  $Installer = Join-Path $out $name
  Invoke-WebRequest -Uri $url -OutFile $Installer
}
$sha = (Get-FileHash -Algorithm SHA256 $Installer).Hash
$date = (Get-Date).ToString('yyyy-MM-dd')

Get-ChildItem (Join-Path $root 'packaging/winget') -Filter '*.yaml' | ForEach-Object {
  $text = (Get-Content $_.FullName -Raw).
    Replace('{{version}}', $Version).
    Replace('{{url}}', $url).
    Replace('{{sha256}}', $sha).
    Replace('{{date}}', $date)
  # the template comment lines are for this repo, not for winget-pkgs
  $text = ($text -split "`n" | Where-Object { -not $_.StartsWith('# Template:') }) -join "`n"
  Set-Content (Join-Path $out $_.Name) $text -Encoding utf8NoBOM -NoNewline
}
# the downloaded installer must not sit in the manifest folder
if ((Split-Path -Parent $Installer) -eq $out) { Remove-Item $Installer }

winget validate --manifest $out
if ($LASTEXITCODE -ne 0) { throw "winget validate failed for $out" }
Write-Output $out
