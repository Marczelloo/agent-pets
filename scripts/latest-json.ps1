# Writes latest.json for the updater next to the uploaded installer. Used by scripts/release.ps1 and the release workflow.
param(
  [Parameter(Mandatory = $true)][string]$Version,
  # the installer as it will be uploaded (spaces already replaced with dots, the name GitHub gives the asset)
  [Parameter(Mandatory = $true)][string]$Installer,
  # the updater signature (.sig) of exactly that file, made after any Authenticode signing
  [Parameter(Mandatory = $true)][string]$Signature,
  # release notes; the first nonempty line that is not a heading appears in the "Version available" toast
  [Parameter(Mandatory = $true)][string]$Notes,
  [Parameter(Mandatory = $true)][string]$Out
)
$ErrorActionPreference = 'Stop'

$name = Split-Path -Leaf $Installer
if ($name.Contains(' ')) { throw "The installer name must not contain spaces (GitHub renames such assets): $name" }
$first = (Get-Content $Notes | Where-Object { $_.Trim() -ne '' -and -not $_.StartsWith('#') } | Select-Object -First 1)
$latest = [ordered]@{
  version   = $Version
  notes     = if ($first) { $first.Trim() -replace '^[-*]\s+', '' } else { "Agent Pets $Version" }
  pub_date  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  platforms = [ordered]@{
    'windows-x86_64' = [ordered]@{
      signature = (Get-Content $Signature -Raw).Trim()
      url       = "https://github.com/Marczelloo/agent-pets/releases/download/v$Version/$name"
    }
  }
}
$latest | ConvertTo-Json -Depth 5 | Set-Content $Out -Encoding utf8NoBOM
