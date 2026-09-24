# Faza 2: weryfikacja sceny w pasku zadań

Ręczna checklista z planu fazy 2 (task 7 i task 10). Maszyna: Windows 11, 2560×1440, skala 100%, 16 rdzeni.

W czasie weryfikacji na ekranie działała gra pełnoekranowa (D3D), która zasłaniała pasek zadań. Dlatego punkty wymagające patrzenia na pasek albo zmian systemowych (restart Explorera, skala) są oznaczone **do sprawdzenia**. Sprawdzono je w podglądzie przeglądarki (`dev.html`) i przez Win32. Nie da się tego zrobić bez przerywania gry użytkownika.

| # | Sprawdzenie | Jak | Wynik | Data |
|---|---|---|---|---|
| 1 | Scena osadzona w pasku, na lewo od zasobnika | `pnpm tauri dev`, odczyt przez Win32: rodzic, prostokąt | ✅ Okno jest dzieckiem `Shell_TrayWnd`. Z nagraniem 7 sesji ma 416 px (tyle, ile wylicza model), prawa krawędź 2259, zasobnik od 2267 (odstęp 8 px) | 2026-09-24 |
| 2 | Pierwszy zwierzak nie jest ucinany z lewej | test `layout.test.ts` (1–7 sesji); `dev.html` przy 7 sesjach i przy 170 px | ✅ W podglądzie pierwszy zwierzak jest cały, także obok „+N”. W pasku: **do sprawdzenia** na oko | 2026-09-24 |
| 3 | Scena nie wchodzi na ikony aplikacji | szerokość z UI Automation (koniec ikon), testy `placement.rs` | ✅ logika i testy; lewa krawędź sceny 1843 > koniec ikon (ok. 1657). Przy skali 150% i przy pasku wyrównanym do lewej: **do sprawdzenia** | 2026-09-24 |
| 4 | Restart Explorera | `Stop-Process -Name explorer` | ✅ potwierdzone przez użytkownika | 2026-09-24 |
| 5 | DPI 100 / 150 / 200% | Ustawienia → Ekran (zmienia użytkownik) | ✅ potwierdzone przez użytkownika | 2026-09-24 |
| 6 | Autoukrywanie paska | Ustawienia → Pasek zadań | ✅ potwierdzone przez użytkownika | 2026-09-24 |
| 7 | Aplikacja pełnoekranowa wstrzymuje rysowanie | wydanie + nagranie pokazowe, gra D3D na pełnym ekranie (`SHQueryUserNotificationState` = 3), CPU na proces | ✅ procesy renderera WebView2: 0,0% rdzenia (rysowanie stoi). Całość 0,30% maszyny: proces główny 2,8% rdzenia (odpytywanie paska i UI Automation co 1 s), proces przeglądarki WebView2 1,6% | 2026-09-24 |
| 8 | Przepełnienie: 7 sesji → 5 zwierzaków i „+2”; `needs_you` i `error` zawsze widoczne | testy `pickVisible`; `dev.html` | ✅ | 2026-09-24 |
| 9 | Pasek postępu: procent z listą, pulsowanie bez listy | `dev.html` | ✅ | 2026-09-24 |
| 10 | Limity: widoczne tylko z danymi, ≥ 90% na czerwono | `dev.html` (tydzień Codexa 91% na czerwono) | ✅ | 2026-09-24 |
| 11 | Tooltip: treść zwierzaka, limitów i „+N” | `dev.html`, najechanie myszą | ✅ treść. Błąd znaleziony w pasku: tooltip nie znikał (Tauri `hide()` nie działało na oknie pokazanym przez Win32), naprawione. Krawędź ekranu **do sprawdzenia** | 2026-09-24 |
| 12 | Koniec sesji: zwierzak macha i znika w ok. 1,5 s | `/exit` w Claude Code | **do sprawdzenia**; logikę pokrywa test `Roster` (zanik) | — |
| 13 | Kompaktowanie: scena wysiłku z potem | `/compact` | **do sprawdzenia**; scena przechodzi test dymny | — |
| 14 | CPU < 2% przy 5 aktywnych zwierzakach | `tools\cpu.ps1` na wydaniu, pasek widoczny | **do sprawdzenia** (gra wstrzymywała rysowanie); spike S2 zmierzył 0,74% przy tym samym rendererze w buildzie debug | — |
| 15 | Tray: „Zakończ Agent Pets” zamyka aplikację | menu ikony w zasobniku | **do sprawdzenia** | — |
| 16 | Kilka monitorów: scena tylko na głównym | — | niesprawdzone: jeden monitor na tej maszynie | — |

## Jak sprawdzić brakujące punkty

```powershell
cd app
$env:AGENT_PETS_REPLAY="$PWD\demo\many-sessions.jsonl"; pnpm tauri dev   # 7 sesji pokazowych
..\tools\cpu.ps1 -Seconds 30                                              # w drugim terminalu, przy widocznym pasku
```

## Błędy znalezione przy pierwszym uruchomieniu w pasku

- **Tooltip nie znikał.** Okno pokazane przez `ShowWindow(SW_SHOWNOACTIVATE)` trzeba też chować przez Win32; `hide()` z Tauri nic nie robiło. Naprawione, test `hide_undoes_show_no_activate`.
- **Zwierzaki nie reagowały na sesje.** `endpoint.json` leżał w `%APPDATA%`, które Windows wirtualizuje dla procesów z pakietów MSIX (aplikacja Claude, jej terminal i hooki). Hook czytał nieaktualną prywatną kopię i wysyłał zdarzenia na martwy port. `endpoint.json` i `hook.exe` są teraz w `~\.agent-pets\`. Działające sesje Claude Code trzeba zrestartować, bo hooki są wczytywane przy starcie sesji.
