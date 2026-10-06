# Prints the release version after checking that every manifest carries the same one.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$v = (Get-Content "$root/app/src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json).version
$pkg = (Get-Content "$root/app/package.json" -Raw | ConvertFrom-Json).version
$cargo = (Select-String -Path "$root/Cargo.toml" -Pattern '^version = "(.+)"').Matches[0].Groups[1].Value
$mod = (Get-Content "$root/claude-plugin/.claude-plugin/plugin.json" -Raw | ConvertFrom-Json).version
if ($pkg -ne $v -or $cargo -ne $v -or $mod -ne $v) { throw "Version mismatch: tauri.conf.json $v, package.json $pkg, Cargo.toml $cargo, claude-plugin plugin.json $mod" }
$v
