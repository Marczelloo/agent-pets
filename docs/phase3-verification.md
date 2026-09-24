# Faza 3: weryfikacja panelu, „Przejdź”, powiadomień i limitów Claude'a

Ręczna checklista z planu fazy 3 (task 7). Maszyna: Windows 11, 2560×1440, skala 100%.

Część punktów wymaga klikania w pasek, w tray i w sesje użytkownika (np. przełączenie aplikacji Claude na inną sesję). Tych nie robiłem sam w trakcie pracy użytkownika, więc są oznaczone **do sprawdzenia**.

| # | Sprawdzenie | Jak | Wynik | Data |
|---|---|---|---|---|
| 1 | Klik w zwierzaka otwiera panel z podświetloną jego sesją; klik w „+N” i limity otwiera panel | `pnpm tauri dev`, klik w scenę | logika kliknięcia: test `clickAction`. Na żywo **do sprawdzenia** | — |
| 2 | Lewy klik ikony w trayu otwiera i zamyka panel; drugi klik przy otwartym panelu go zamyka (nie mruga) | tray | test `PanelToggle`. Na żywo **do sprawdzenia** | — |
| 3 | Klik poza panelem albo Esc go chowa | — | **do sprawdzenia** | — |
| 4 | Panel stoi nad paskiem przy prawej krawędzi | — | testy `panel::origin` (pasek widoczny, schowany). Na żywo **do sprawdzenia** | — |
| 5 | „Przejdź” dla sesji z aplikacji Claude otwiera tę sesję w aplikacji (`claude://code/continue`) | panel | test planisty. Na żywo **do sprawdzenia**: link może być wyłączony bramką funkcji w aplikacji, wtedy łańcuch idzie dalej | — |
| 6 | „Przejdź” dla sesji CLI w Windows Terminal przełącza na okno terminala | panel | **do sprawdzenia** | — |
| 7 | „Przejdź” dla sesji Codexa otwiera wątek w aplikacji Codex | panel | **do sprawdzenia** | — |
| 8 | Sesja z zamkniętym terminalem: nowy terminal z `claude --resume` | panel | **do sprawdzenia** | — |
| 9 | Toast „czeka na Ciebie” po 15 s bez fokusu; „Przejdź” w toaście działa; brak toastów przy starcie aplikacji | sesja z pytaniem o zgodę, fokus na innym oknie | reguły: 6 testów. AUMID `dev.agentpets.app` zarejestrowany w HKCU z nazwą „Agent Pets” (odczyt rejestru). Toast na żywo **do sprawdzenia** | 2026-09-24 |
| 10 | Toast „skończył” po turze > 2 min | długa tura | **do sprawdzenia** | — |
| 11 | Limity Claude'a bez CLI (z aplikacji Claude) | panel przy działającej aplikacji Claude | parser i odpytywanie: 8 testów; format pliku sprawdzony na prawdziwym `plan-usage-history.json` (próbki co 15 min, `fh`/`sd`). Na żywo **do sprawdzenia** | 2026-09-24 |
| 12 | Limity Claude'a z przelotką statusline: dokładny reset | `pets-cli install-statusline`, sesja `claude` w terminalu | przelotka: 3 testy integracyjne (wyjście bajt w bajt, komenda ze ścieżką w cudzysłowie, brak oryginału). Instalacja u użytkownika czeka na zgodę | — |
| 13 | „brak danych” zamiast 0% | podgląd panelu | ✅ w podglądzie (`/panel.html` w przeglądarce, bez limitu Claude 5h) i w teście `PanelView` | 2026-09-24 |
| 14 | Panel w motywie jasnym i ciemnym | podgląd panelu, emulacja motywu | ✅ oba motywy czytelne, zwierzaki mieszczą się na płótnie 96×72 | 2026-09-24 |
| 15 | Okno panelu istnieje i jest ukryte po starcie | Win32: okna procesu `agent-pets` | ✅ okno „Agent Pets” (`visible=False`) obok `agent-pets-tooltip` | 2026-09-24 |
| 16 | CPU przy otwartym panelu z 5 zwierzakami | `tools\cpu.ps1` | **do sprawdzenia** (panel rysuje tylko, gdy jest widoczny: `requestAnimationFrame`) | — |

## Jak sprawdzić brakujące punkty

```powershell
cd app
pnpm tauri dev                   # na żywo
pnpm dev                         # podgląd panelu w przeglądarce: http://localhost:1420/panel.html
```

Przelotka statusline (zmienia `~/.claude/settings.json`, kopia w `settings.json.agent-pets.bak`):

```powershell
cargo build --release -p pets-hook -p pets-cli
copy target\release\hook.exe $HOME\.agent-pets\hook.exe
target\release\pets-cli.exe install-statusline $HOME\.agent-pets\hook.exe
```
