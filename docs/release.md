# Wydanie i auto-aktualizacje

Od wersji 0.7.0 aplikacja sama sprawdza nowe wersje. Czyta `latest.json` z najnowszego wydania na GitHubie:
`https://github.com/Marczelloo/agent-pets/releases/latest/download/latest.json`.
Każdy instalator jest podpisany, a aplikacja przyjmuje tylko instalator z poprawnym podpisem.

## Klucz podpisu

- **Klucz prywatny:** `~/.tauri/agent-pets.key`. Nie ma hasła, a chroni go profil użytkownika Windows. Nigdy nie trafia do repo.
- **Klucz publiczny:** zapisany w `app/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
- **Kopia zapasowa:** trzymaj jej kopię poza tym komputerem, na przykład w menedżerze haseł.
- **Utrata klucza:** zainstalowane wersje nie przyjmą kolejnych aktualizacji. Wtedy:
  1. wygeneruj nowy klucz (`pnpm --dir app exec tauri signer generate --ci -w ~/.tauri/agent-pets.key`);
  2. wpisz nowy klucz publiczny do `tauri.conf.json`;
  3. wydaj nową wersję i poproś użytkowników o jedną ręczną instalację.

GitHub Actions nie buduje wydań. Klucz jest tylko lokalnie, a instalator bez podpisu zepsułby `latest.json`.
Workflow `release` tylko uruchamia testy.

## Kroki

1. Ustaw tę samą wersję w trzech miejscach: `Cargo.toml` (workspace), `app/src-tauri/tauri.conf.json` i `app/package.json`. Test `version::tests` pilnuje zgodności.
2. Uruchom testy: `cargo test --workspace` i `pnpm --dir app test`.
3. Napisz notatki wydania w pliku Markdown. Pierwszy niepusty wiersz, który nie jest nagłówkiem, pokaże się w toaście „Dostępna wersja”.
4. Zbuduj instalator: `pwsh scripts/release.ps1 -Notes <plik z notatkami>`. Skrypt:
   - sprawdza wersje;
   - buduje podpisany instalator;
   - kopiuje go do `target/release/upload/` z nazwą, jaką nada mu GitHub (kropki zamiast spacji);
   - składa `latest.json`;
   - wypisuje komendę `gh release create`.
5. Opublikuj wypisaną komendą, po zgodzie. Wydanie musi mieć dołączone i instalator, i `latest.json`.

## Test aktualizacji lokalnie

Zmienna `AGENT_PETS_UPDATE_URL` podmienia adres `latest.json`, ale tylko w buildzie deweloperskim albo testowym (feature `update-test`). Wydanie zawsze pyta GitHuba, a podpis jest sprawdzany zawsze.
Build release wtyczki przyjmuje tylko `https`, więc wersje testowe buduj z feature i dodatkową konfiguracją. W prawdziwym wydaniu nigdy ich nie używaj:
`pnpm --dir app tauri build --features update-test --config '{"plugins":{"updater":{"dangerousInsecureTransportProtocol":true}}}'`.
Zmienne podpisu ustaw jak w `scripts/release.ps1`.

1. Zbuduj buildem testowym (jak wyżej) i zainstaluj wersję N.
2. Zbuduj wersję N+1 skryptem i podaj katalog `target/release/upload` lokalnym serwerem, na przykład `python -m http.server 8765 --bind 127.0.0.1`.
   W `latest.json` ustaw `url` na `http://127.0.0.1:8765/<plik>`.
3. Uruchom wersję N z `AGENT_PETS_UPDATE_URL=http://127.0.0.1:8765/latest.json` i w ustawieniach kliknij „Sprawdź teraz”.
4. Uszkodź jeden znak podpisu w `latest.json` i sprawdź, że aktualizacja jest odrzucona („Nie udało się zweryfikować aktualizacji”).
