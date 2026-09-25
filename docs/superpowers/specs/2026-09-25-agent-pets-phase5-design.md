# Agent Pets: faza 5 (instalator, kreator, ustawienia, autostart, tryb oszczędny). Projekt

Status: zatwierdzony w rozmowie 2026-09-25, do przeglądu przez użytkownika. Rozszerza sekcję 13 („Faza 5: wykończenie”) głównej specyfikacji `2026-09-24-agent-pets-design.md`.

## 1. Cel i odbiorcy

Ktoś z GitHuba pobiera instalator z GitHub Releases, uruchamia go i bez czytania README ma działające zwierzaki dla swoich agentów.

- **Odbiorcy:** publiczne wydanie; kreator niczego nie zakłada o maszynie.
- **Poza zakresem fazy 5:** podpis kodu (Windows pokaże SmartScreen), auto-aktualizacje, nowe programy (opencode, t3code, zcode, Gemini, Grok), statystyki, dymki, subagenci, ręczne usuwanie zwierzaków, wariant animacji „anime”, aplikacja todo. Architektura integracji (sekcja 3) ma jednak przewidzieć nowe programy.

## 2. Podejście

Logika ustawień żyje w aplikacji; instalator tylko kopiuje pliki.

- Instalator NSIS dla bieżącego użytkownika (bez uprawnień administratora), z `hook.exe` w paczce.
- Pierwsze uruchomienie (brak `~/.agent-pets/settings.json`) otwiera kreator w oknie ustawień. To samo okno, w trybie zakładek, służy później jako ustawienia.
- Odinstalowanie wywołuje `agent-pets.exe --uninstall-integrations` (hook NSIS przed odinstalowaniem).

Odrzucone: pytania na stronach NSIS (trudne do testów, logika i tak potrzebna w aplikacji), osobny program „setup” (dwa miejsca z tą samą logiką).

## 3. Integracje („aplikacje”)

Nowy moduł rdzenia `integrations`. Każda aplikacja to jeden wpis o tym samym kształcie:

| Operacja | Znaczenie |
|---|---|
| `id()` | `claude_code`, `codex`, `agent_router` |
| `detect(home)` | czy jest zainstalowana i gdzie (`Detected { found, path, note }`) |
| `status(home)` | czy integracja jest na miejscu (np. hooki w `settings.json`) |
| `enable(home, res)` | instaluje, co potrzebne; `res` to ścieżki zasobów aplikacji (np. `hook.exe`) |
| `disable(home)` | usuwa tylko własne wpisy |

- **Claude Code:**
  - wykrycie: katalog `~/.claude` albo `claude.exe` w `PATH`, albo katalog `claude-code` aplikacji Claude;
  - `enable`: kopiuje `hook.exe` z zasobów do `~/.agent-pets/hook.exe` (nadpisuje tylko, gdy różni się zawartością), instaluje hooki (`hooks_install`, z kopią `settings.json`);
  - `disable`: usuwa hooki i przelotkę statusline (przywraca oryginał), jeśli była;
  - przelotka statusline zostaje opcją zaawansowaną w zakładce Aplikacje, domyślnie wyłączoną.
- **Codex:** wykrycie po `~/.codex`; `enable`/`disable` niczego nie instalują.
- **Agent Router:** wykrycie po `~/.agent-router`; `enable`/`disable` niczego nie instalują.
- **Wyłączona aplikacja:** jej zwierzaki znikają ze sceny, a rdzeń przestaje czytać jej źródła (hooki Claude'a są ignorowane, rollouty i `status.json` nie są obserwowane).
- Nowy program w przyszłości to nowy wpis w tej liście plus adapter w rdzeniu.

## 4. Ustawienia

Plik `~/.agent-pets/settings.json` (katalog domowy z tego samego powodu co `endpoint.json`: wirtualizacja `AppData` dla pakietów MSIX).

```json
{
  "version": 1,
  "apps": { "claude_code": true, "codex": true, "agent_router": true },
  "claude_statusline": false,
  "claude_plan_usage": false,
  "notifications": { "needs_you": true, "done": true, "limits": true },
  "pets": { "skin": "sketch", "max_visible": 5 },
  "power_saving": "auto",
  "autostart": true
}
```

- `power_saving`: `auto` | `always` | `never`; `skin`: `sketch` | `clean`; `max_visible`: 1–8.
- Brakujące pola dostają wartości domyślne; nieznane pola są zachowywane przy zapisie; uszkodzony plik → wartości domyślne i komunikat w Diagnostyce (plik nie jest nadpisywany bez zmiany w UI).
- Zapis atomowy (plik tymczasowy + `rename`).
- **Zmiany działają od razu:** komenda `settings_set` zapisuje plik i rozsyła `pets://settings`; rdzeń, powiadomienia, scena i wątek limitów Anthropic reagują bez restartu.
- **Limity Claude'a z Anthropic** (`claude_plan_usage`) są domyślnie wyłączone. Wątek z fazy 3 nie wysyła niczego, dopóki użytkownik nie wyrazi zgody.
- **Dotychczasowe instalacje** (budowane ze źródeł, bez `settings.json`) przy pierwszym starcie nowej wersji też dostają kreator; hooki już zainstalowane kreator wykrywa jako „na miejscu” i niczego nie dubluje.

## 5. Kreator pierwszego uruchomienia

Okno ustawień w trybie kreatora, kroki z przyciskami „Wstecz” / „Dalej”:

1. **Aplikacje:** lista wykrytych (z ścieżką) i niewykrytych (wyszarzone, z podpowiedzią). Przełącznik „zwierzaki dla tej aplikacji”, domyślnie włączony dla wykrytych. Dla Claude Code opis: „zainstaluję hooki w `~/.claude/settings.json` (z kopią zapasową)”.
2. **Limity Claude'a:** wyjaśnienie (co: token logowania Claude Code z `~/.claude/.credentials.json`; dokąd: tylko `api.anthropic.com`; po co: dokładne limity i godziny resetu) i przełącznik, domyślnie wyłączony. Bez zgody limity Claude'a pochodzą z aplikacji Claude albo przelotki statusline.
3. **Powiadomienia i autostart:** trzy przełączniki toastów i „Uruchamiaj z Windows” (domyślnie włączone).
4. **Wygląd:** skórka szkicowa albo czysta, z podglądem zwierzaków na żywo.

„Zakończ” zapisuje ustawienia, wykonuje `enable`/`disable` dla aplikacji i pokazuje wynik (np. „Hooki zainstalowane. Uruchom ponownie otwarte sesje Claude Code”). Zamknięcie kreatora bez zakończenia: przy następnym starcie kreator wraca.

## 6. Okno ustawień

Zwykłe okno (dekoracje systemowe, ok. 760×560 CSS px) w stylu Ustawień Windows 11, React. Otwierane przyciskiem ⚙ w panelu i pozycją „Ustawienia” w menu ikony w trayu. Jedna instancja okna.

| Zakładka | Zawartość |
|---|---|
| Aplikacje | przełącznik per aplikacja, wykryta ścieżka, stan integracji („Hooki: zainstalowane”, „Zainstaluj ponownie”); przelotka statusline (zaawansowane) |
| Zwierzaki | skórka, najwięcej widocznych zwierzaków, tryb oszczędny (auto / zawsze / nigdy) |
| Powiadomienia | trzy przełączniki; odnośnik do ustawień powiadomień Windows |
| Limity | zgoda na pobieranie z Anthropic (jak w kreatorze), stan ostatniego pobrania |
| Ogólne | autostart, wersja, odnośnik do repo |
| Diagnostyka | serwer hooków (port, działa), ostatnie zdarzenie z każdego źródła, ścieżki plików, stan ustawień; „Skopiuj raport” (bez tokenów i treści sesji) |

## 7. Tryb oszczędny

- `auto`: włączony, gdy komputer działa na baterii albo ma włączone oszczędzanie energii Windows (`GetSystemPowerStatus`: `ACLineStatus == 0` albo `SystemStatusFlag == 1`); sprawdzane co 30 s.
- W trybie oszczędnym scena rysuje 10 kl./s zamiast 30, a zwierzaki w stanach `idle`, `sleep`, `done` stoją w ostatniej klatce. Panel ma ten sam limit.
- Zdarzenie `pets://power { saving }` z Rusta; logika wyboru trybu jest czysta i testowana.

## 8. Autostart, jedna instancja, tray

- **Autostart:** wartość `Agent Pets` w `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` z pełną ścieżką do `agent-pets.exe`; zapis i usunięcie przy zmianie ustawienia.
- **Jedna instancja:** drugie uruchomienie (np. ze skrótu w menu Start) nie startuje drugiego rdzenia, tylko otwiera okno ustawień w działającej aplikacji.
- **Menu traya:** „Ustawienia”, „Zakończ Agent Pets”.

## 9. Instalator i wydanie

- Tauri `bundle.active = true`, cel NSIS, `installMode: currentUser`, skrót w menu Start, `hook.exe` jako zasób paczki (budowany przed `tauri build`).
- **Odinstalowanie:** hook NSIS `NSIS_HOOK_PREUNINSTALL` uruchamia `agent-pets.exe --uninstall-integrations`:
  - wyłącza wszystkie integracje (hooki i przelotka statusline z `~/.claude/settings.json`, z kopią zapasową);
  - usuwa wpis autostartu i klucz AUMID powiadomień;
  - usuwa `~/.agent-pets/hook.exe` i `endpoint.json`;
  - `settings.json` zostaje, chyba że użytkownik zaznaczy usunięcie danych aplikacji w odinstalowaniu (wtedy cały `~/.agent-pets`).
- **Ikona aplikacji:** głowy Clawda i Kodeka, wygenerowana przez Codexa (podgląd do akceptacji użytkownika), zestaw rozmiarów przez `pnpm tauri icon`. Ta sama ikona w toastach (`IconUri` w rejestracji AUMID).
- **Wersja:** 0.5.0.
- **GitHub Actions:** na tag `v*` (Windows): testy Rust i TS, `tauri build`, instalator jako załącznik wydania (szkic wydania do ręcznej publikacji).
- **README:** sekcja „Install” (pobierz instalator, ostrzeżenie SmartScreen, kreator), dotychczasowa instrukcja ręczna jako „Build from source”.

## 10. Obsługa błędów

- Integracja nie da się włączyć (np. `settings.json` Claude'a jest uszkodzony): przełącznik wraca do stanu wyłączonego, a komunikat mówi, co jest nie tak i gdzie jest kopia zapasowa. Niczego nie nadpisujemy w uszkodzonym pliku.
- Brak `hook.exe` w zasobach (build deweloperski): komunikat w Aplikacjach i Diagnostyce.
- Wszystkie zapisy w plikach użytkownika (`~/.claude/settings.json`) z kopią zapasową, jak w fazie 1.

## 11. Testy

- **Rust, czyste:** ustawienia (domyślne, migracja brakujących pól, zachowanie nieznanych, uszkodzony plik), integracje na tymczasowym katalogu domowym (wykrycie, `enable`/`disable`, idempotencja, `hook.exe` kopiowany tylko przy różnicy), wybór trybu oszczędnego ze stanu zasilania, filtr zdarzeń wyłączonych aplikacji w rdzeniu, `--uninstall-integrations` na tymczasowym katalogu.
- **TS:** widoki kreatora i ustawień renderowane do stringa (kroki, domyślne wartości, niewykryte aplikacje wyszarzone, zgoda na limity domyślnie wyłączona); scena w trybie oszczędnym (10 kl./s, zwierzaki bezczynne bez kroku animacji).
- **Na żywo** (lista kontrolna `docs/phase5-verification.md`): instalacja na maszynie użytkownika, kreator, ustawienia działające bez restartu, autostart po ponownym zalogowaniu, tryb oszczędny (symulacja przez ustawienie „zawsze”), odinstalowanie przywracające `settings.json` Claude'a.
