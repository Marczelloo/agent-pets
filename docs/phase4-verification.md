# Faza 4: weryfikacja zadań Agent Routera

Ręczna checklista z planu fazy 4 (task 5). Maszyna: Windows 11, 2560×1440, skala 100%.

Router z nowym plikiem statusu uruchomiono jako osobny proces MCP (skrypt z klientem MCP, jak w testach routera), bo router działający w sesji Claude Code miał stary kod aż do przeładowania serwera MCP. Zadanie: policzenie plików `.rs` w `crates/pets-core/src`, model luna, tylko odczyt.

| # | Sprawdzenie | Jak | Wynik | Data |
|---|---|---|---|---|
| 1 | Router zapisuje `~/.agent-router/status.json` w wersji 1 | odczyt pliku w trakcie i po zadaniu | ✅ 536 B, `version: 1`, `stallSeconds: 180`; zadanie z `threadId`, `running` → `completed` | 2026-09-25 |
| 2 | W pliku nie ma treści zadania, diffów, komend ani wiadomości | lista kluczy zadań w pliku | ✅ tylko `taskId, threadId, kind, title, status, model, workingDirectory, startedAt, updatedAt, lastActivityAt, blocked`; tytuł przycięty do 80 znaków | 2026-09-25 |
| 3 | Zwierzak zadania ma znaczek routera i nie ma dubla | zrzut paska w trakcie zadania | ✅ Kodek z turkusowym znaczkiem nad lewym ramieniem; jeden zwierzak na wątek | 2026-09-25 |
| 4 | Tytuł zadania w tooltipie i panelu | najechanie, panel | test `router_task_joins_its_codex_pet_at_startup`, test `PanelView`; na żywo **do sprawdzenia** (zadanie trwało ok. 8 s) | — |
| 5 | Zdrowie: aktywne → cisza → utknęło bez zmian pliku | testy `routerHealth` | ✅ testy; na żywo **do sprawdzenia** przy dłuższym zadaniu | 2026-09-25 |
| 6 | Nieudane zadanie pokazuje błąd | test `failed_task_shows_an_error` | ✅ test; na żywo **do sprawdzenia** | 2026-09-25 |
| 7 | Stare nieudane zadanie nie pojawia się po starcie widżetu | test `an_old_failed_router_task_does_not_appear_at_startup` | ✅ | 2026-09-25 |
| 8 | Router bez widżetu działa jak dotąd | testy routera (310), zadanie zakończone | ✅ | 2026-09-25 |
| 9 | Dwie sesje Claude Code z routerem: plik ma zadania obu | test routera „two sessions share one state file” | ✅ | 2026-09-25 |

## Po scaleniu zmian w routerze

W repo routera `npm run build`, potem przeładuj serwer MCP `agent-router` (albo otwórz nową sesję Claude Code). Od tej chwili każde zadanie zleciane z Claude Code trafia do `status.json`.
