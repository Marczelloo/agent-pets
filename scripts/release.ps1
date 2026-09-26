# Wydanie Agent Pets: sprawdza wersje, buduje podpisany instalator, składa latest.json dla auto-updatera
# i wypisuje komendę `gh release create`. Niczego nie publikuje. Instrukcja: docs/release.md.
param(
  # plik z notatkami wydania (pierwszy niepusty wiersz trafia też do toastu „Dostępna wersja”)
  [Parameter(Mandatory = $true)][string]$Notes
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$v = (Get-Content "$root/app/src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json).version
$pkg = (Get-Content "$root/app/package.json" -Raw | ConvertFrom-Json).version
$cargo = (Select-String -Path "$root/Cargo.toml" -Pattern '^version = "(.+)"').Matches[0].Groups[1].Value
if ($pkg -ne $v -or $cargo -ne $v) { throw "Wersje się różnią: tauri.conf.json $v, package.json $pkg, Cargo.toml $cargo" }
if (-not (Test-Path $Notes)) { throw "Brak pliku notatek: $Notes" }

$keyFile = Join-Path $HOME '.tauri/agent-pets.key'
if (-not (Test-Path $keyFile)) { throw "Brak klucza podpisu: $keyFile (docs/release.md)" }

# Klucz tylko w zmiennej tego procesu, nigdy na ekranie ani w logu.
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $keyFile -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
try {
  pnpm --dir "$root/app" tauri build
  if ($LASTEXITCODE -ne 0) { throw "tauri build zakończył się kodem $LASTEXITCODE" }
} finally {
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
}

$exe = Get-ChildItem "$root/target/release/bundle/nsis" -Filter "*_${v}_x64-setup.exe" | Select-Object -First 1
if (-not $exe) { throw "Nie znaleziono instalatora $v" }
$sig = "$($exe.FullName).sig"
if (-not (Test-Path $sig)) { throw "Brak podpisu $sig (czy createUpdaterArtifacts jest włączone?)" }

# GitHub zamienia spacje w nazwach zasobów na kropki; adres w latest.json musi wskazywać prawdziwą nazwę.
$out = "$root/target/release/upload"
New-Item -ItemType Directory -Force $out | Out-Null
$name = $exe.Name -replace ' ', '.'
Copy-Item $exe.FullName "$out/$name" -Force

$first = (Get-Content $Notes | Where-Object { $_.Trim() -ne '' -and -not $_.StartsWith('#') } | Select-Object -First 1)
$latest = [ordered]@{
  version   = $v
  notes     = if ($first) { $first.Trim() } else { "Agent Pets $v" }
  pub_date  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  platforms = [ordered]@{
    'windows-x86_64' = [ordered]@{
      signature = (Get-Content $sig -Raw).Trim()
      url       = "https://github.com/Marczelloo/agent-pets/releases/download/v$v/$name"
    }
  }
}
$latest | ConvertTo-Json -Depth 5 | Set-Content "$out/latest.json" -Encoding utf8NoBOM

Write-Host "Gotowe: $out/$name i $out/latest.json"
Write-Host 'Po zgodzie na publikację:'
Write-Host "gh release create v$v `"$out/$name`" `"$out/latest.json`" --title `"Agent Pets $v`" --notes-file `"$Notes`""
