# Faza 5: weryfikacja instalatora, kreatora i ustawień

Ręczna checklista z planu fazy 5 (task 8). Maszyna: Windows 11, 2560×1440. Instalator: `Agent Pets_0.5.0_x64-setup.exe` zbudowany lokalnie z gałęzi `phase5-setup`.

| # | Sprawdzenie | Jak | Wynik | Data |
|---|---|---|---|---|
| 1 | Tryb odinstalowania na zbudowanym exe | `agent-pets.exe --uninstall-integrations` z tymczasowym katalogiem domowym (`USERPROFILE`) | ✅ nasze hooki usunięte, cudzy hook zostaje, statusline przywrócony, `hook.exe` i `endpoint.json` usunięte, `settings.json` zostaje | 2026-09-25 |
| 2 | Instalacja dla bieżącego użytkownika | instalator na maszynie użytkownika | ✅ potwierdzone przez użytkownika | 2026-09-25 |
| 3 | Kreator pierwszego uruchomienia | aplikacje, zgoda na limity, powiadomienia i autostart, skórka | ✅ potwierdzone przez użytkownika | 2026-09-25 |
| 4 | Ustawienia działają bez restartu (⚙ w panelu, tray) | zmiany w zakładkach | ✅ potwierdzone przez użytkownika | 2026-09-25 |
| 5 | Skórka szkicowa / czysta | zmiana w ustawieniach | ⚠️ przełączanie działa, ale w pasku różnica jest niewidoczna: drżenie konturu i przesunięcie wypełnienia skalują się z `u = 0,3`, więc wychodzą poniżej piksela. Na później: wyraźne skórki w małej skali i podgląd skórek w ustawieniach | 2026-09-25 |
| 6 | Odinstalowanie i ponowna instalacja | Ustawienia Windows → Aplikacje | ✅ potwierdzone przez użytkownika | 2026-09-25 |
| 7 | Testy automatyczne | `cargo test --workspace`, `pnpm --dir app test` | ✅ Rust bez błędów, TS 224/224 | 2026-09-25 |

Nie sprawdzano osobno: autostart po ponownym zalogowaniu, tryb oszczędny na prawdziwej baterii (komputer stacjonarny), akcja GitHub Actions (uruchomi się przy pierwszym tagu `v*`).
