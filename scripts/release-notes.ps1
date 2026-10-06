# Copies one version's section of CHANGELOG.md into a release notes file (without the version heading).
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$Out
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$lines = Get-Content "$root/CHANGELOG.md"
$start = [Array]::FindIndex($lines, [Predicate[string]] { param($l) $l -match "^## \[?$([regex]::Escape($Version))\]?(\s|$)" })
if ($start -lt 0) { throw "CHANGELOG.md has no section '## $Version' (rename 'Unreleased' when you bump the version)" }
$end = $lines.Count
for ($i = $start + 1; $i -lt $lines.Count; $i++) { if ($lines[$i] -match '^## ') { $end = $i; break } }
$body = if ($end -gt $start + 1) { ($lines[($start + 1)..($end - 1)] -join "`n").Trim() } else { '' }
if (-not $body) { throw "The CHANGELOG.md section for $Version is empty" }
Set-Content $Out $body -Encoding utf8NoBOM
