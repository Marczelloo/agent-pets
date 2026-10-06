# Agent Pets release built locally: checks versions, builds a signed installer, and assembles latest.json for the updater
# prints the `gh release create` command without publishing anything. The release workflow does the same in CI
# (.github/workflows/release.yml). Instructions: docs/building.md.
param(
  # release notes file (the first nonempty line also appears in the "Version available" toast)
  [Parameter(Mandatory = $true)][string]$Notes
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$v = & "$PSScriptRoot/version.ps1"
if (-not (Test-Path $Notes)) { throw "Release notes file missing: $Notes" }

# The Claude Code mod ships inside the installer: it must validate and pass its tests before anything is built.
foreach ($cmd in 'validate', 'test') {
  claude plugin $cmd "$root/claude-plugin"
  if ($LASTEXITCODE -ne 0) { throw "claude plugin $cmd failed with code $LASTEXITCODE (the claude CLI must be installed)" }
}
claude plugin validate $root
if ($LASTEXITCODE -ne 0) { throw "claude plugin validate failed for the marketplace (code $LASTEXITCODE)" }

$keyFile = Join-Path $HOME '.tauri/agent-pets.key'
if (-not (Test-Path $keyFile)) { throw "Signing key missing: $keyFile (docs/building.md)" }

# Keep the key only in this process's variable, never on screen or in logs.
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $keyFile -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
try {
  pnpm --dir "$root/app" tauri build
  if ($LASTEXITCODE -ne 0) { throw "tauri build exited with code $LASTEXITCODE" }
} finally {
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
}

$exe = Get-ChildItem "$root/target/release/bundle/nsis" -Filter "*_${v}_x64-setup.exe" | Select-Object -First 1
if (-not $exe) { throw "Installer $v not found" }
$sig = "$($exe.FullName).sig"
if (-not (Test-Path $sig)) { throw "Missing signature $sig (is createUpdaterArtifacts enabled?)" }

# GitHub replaces spaces in asset names with dots; the URL in latest.json must use the actual name.
$out = "$root/target/release/upload"
New-Item -ItemType Directory -Force $out | Out-Null
$name = $exe.Name -replace ' ', '.'
Copy-Item $exe.FullName "$out/$name" -Force

& "$PSScriptRoot/latest-json.ps1" -Version $v -Installer "$out/$name" -Signature $sig -Notes $Notes -Out "$out/latest.json"

Write-Host "Ready: $out/$name and $out/latest.json"
Write-Host 'After approval to publish:'
Write-Host "gh release create v$v `"$out/$name`" `"$out/latest.json`" --title `"Agent Pets $v`" --notes-file `"$Notes`""
