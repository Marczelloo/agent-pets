# Spike S1 + S2: osadzenie w pasku zadań i wydajność

- **Data:** 2026-09-24
- **Kod:** `spikes/taskbar-embed/` (Tauri 2, kod wyrzucany)
- **Sprzęt:** Windows 11, 2560×1440, 119 Hz, 16 rdzeni, RTX 3070 Ti

**Metoda:** przezroczyste okno Tauri (`decorations: false`, `transparent: true`, `shadow: false`) dostaje styl `WS_CHILD` i przez `SetParent` trafia do `Shell_TrayWnd`. Stoi na lewo od `TrayNotifyWnd`. W oknie działa scena z prototypu v6 (5 zwierzaków w skali u = 0,3).

## S1: osadzenie

| # | Pytanie | Wynik |
|---|---|---|
| 1 | Widoczne w pasku, z przezroczystym tłem? | **Tak.** Pełna animacja, rekwizyty i cząsteczki na tle paska. |
| 2 | Przetrwa restart Explorera? | **Tak, z odtworzeniem okna.** Okno ginie razem z rodzicem, a watchdog (co 1 s) wykrywa nowy uchwyt `Shell_TrayWnd`, tworzy nowe okno i osadza je w **0,83 s**. Wymaga `prevent_exit` przy `ExitRequested`. |
| 3 | Zmiana DPI 100 / 150 / 200%? | **Tak, z ciągłym dopasowaniem.** Samo osadzenie zostawia rozmiar w pikselach fizycznych, więc przy 150% scena się ucina (267×32 punkty CSS). Pętla co 1 s przelicza rozmiar ze skali i pozycję ze szerokości zasobnika; po zmianie skali scena wraca do 400×48 CSS. W trakcie zmiany skali pasek chwilowo ma wysokość 0, a takie pomiary trzeba pomijać. |
| 4 | Autoukrywanie paska? | **Tak.** Scena chowa się i pokazuje razem z paskiem, bez dodatkowego kodu. |
| 5 | Kliknięcia? | **Zdarzenia DOM nie docierają.** `WindowFromPoint` wskazuje nasze okno WebView2, ale WebView2 osadzony w oknie innego procesu nie generuje `click` ani `mousemove`. **Natywne śledzenie działa:** wątek w Rust (co 30 ms, `GetCursorPos` + `GetAsyncKeyState`) wykrywa wejście i wyjście kursora oraz kliknięcia lewym i prawym przyciskiem, z pozycją lokalną. |
| 6 | Pozycja po restarcie Explorera | Pierwsze osadzenie po restarcie trafia za daleko w prawo, bo ikony zasobnika jeszcze się ładują. Pętla dopasowania poprawia to w ciągu kilku sekund. |
| 7 | Kolizja z ikonami aplikacji | Przy 150% ikony wyśrodkowane na pasku zajmują więcej miejsca, a stała szerokość sceny (400 CSS) zaczyna na nie nachodzić. |

## S2: wydajność

Pomiar: średnie CPU procesu i jego potomków (WebView2) przez 30 s, 5 aktywnych zwierzaków, build debug. Wartości w % całej maszyny.

| Tryb | CPU maszyny | % jednego rdzenia |
|---|---|---|
| natywne `requestAnimationFrame` (119 Hz) | 2,88% | 46% |
| limit 60 kl./s | 1,46% | 23% |
| limit 30 kl./s | **0,74%** | 12% |

Koszt rośnie liniowo z liczbą klatek.

## Rekomendacja dla fazy 2

1. **Osadzenie w pasku zostaje formą główną.** Pływające okno jest potrzebne tylko jako awaryjne, gdy `Shell_TrayWnd` nie istnieje albo `SetParent` się nie uda. Tray zostaje zawsze.
2. **Pętla układu** w `shell`, co 1 s oraz przy `WM_SETTINGCHANGE` i `WM_DPICHANGED`: rozmiar ze skali paska, pozycja od lewej krawędzi zasobnika. Pomiary z wysokością 0 są pomijane.
3. **Odtwarzanie okna** po zmianie uchwytu `Shell_TrayWnd`, a także `prevent_exit`.
4. **Wejście myszy natywnie w Rust:** wątek śledzący (albo `WH_MOUSE_LL`) wysyła do UI zdarzenia `pointer-enter`, `pointer-leave`, `click` i `context-click` z pozycją lokalną. UI przelicza pozycję na zwierzaka (tooltip, panel). DOM-owe zdarzenia myszy w scenie nie są używane.
5. **Szerokość sceny liczona dynamicznie** z wolnego miejsca między końcem ikon aplikacji a zasobnikiem. Koniec ikon mierzymy przez UI Automation (elementy paska Win11 są w XAML, bez własnych HWND); to trzeba sprawdzić na początku fazy 2. Gdy miejsca jest mniej, mniej zwierzaków jest widocznych, a reszta trafia do „+N” (reguły przepełnienia bez zmian). Awaryjnie: szerokość i przesunięcie ustawiane ręcznie w ustawieniach.
6. **Klatki:** scena w pasku domyślnie 30 kl./s (ok. 0,7% CPU), panel 60 kl./s, pauza przy ukrytym pasku i w pełnym ekranie. Mieści się w budżecie < 2% ze specyfikacji.
7. **Układ zwierzaków liczony od lewej krawędzi sceny z marginesem.** Prototyp ma wpisaną na sztywno pozycję pierwszego zwierzaka, stąd ucinanie z lewej w spike'u.
