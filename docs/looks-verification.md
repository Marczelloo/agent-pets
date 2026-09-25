# Style, ruch Anime i galeria wyglądu: weryfikacja

Checklista z planu `2026-09-25-agent-pets-looks.md` (task 13, a część o języku: task 17). Maszyna: Windows 11, 2560×1440.

| # | Sprawdzenie | Jak | Wynik | Data |
|---|---|---|---|---|
| 1 | 7 stylów rozróżnialnych w skali paska | test `every pair of styles draws differently at taskbar scale` (z kontrolą mutacji: Pastel = Czysty → test pada) oraz zrzuty strony roboczej (styl × duży zwierzak × pasek 0,3) | ✅ automatycznie i na zrzutach | 2026-09-25 |
| 2 | Parytet z prototypem v6 | `parity.test.ts`: silnik wszystkich scen, rysowanie Czystego przy obu skalach i Szkicu przy `u = 1` | ✅ | 2026-09-25 |
| 3 | Anime vs Spokojny | testy `tick` (szybszy zegar, ciągłość, stabilność przy 10 kl./s), `fx` (linie, impakty, emotki), smugi przy pisaniu (energia ≈ 46 > próg 35) | ✅ automatycznie; wrażenie na żywo: test użytkownika | 2026-09-25 |
| 4 | Pixel-art ostry | próg przezroczystości warstwy (test), zrzut galerii | ✅ | 2026-09-25 |
| 5 | Galeria w ustawieniach i kreatorze | zrzuty `settings.html` (Wygląd, jasny i ciemny motyw) i `settings.html?wizard` krok 4 w oknie 760×440 | ✅ | 2026-09-25 |
| 6 | Nadpisanie per agent | testy `look.test.ts` (`lookFor`, `withOverride`), pasek w galerii pokazuje wygląd każdego agenta | ✅ automatycznie; na żywo: test użytkownika | 2026-09-25 |
| 7 | Migracja `skin` → `style` | testy rdzenia (`the_old_skin_field_becomes_the_style`, nieznane wartości) | ✅ automatycznie; na maszynie użytkownika: przy teście na żywo | 2026-09-25 |
| 8 | Tryb oszczędny i wyłączone efekty animacji | testy `effective`, `PetPainter` (bez smug przy oszczędzaniu), `reducedMotion` | ✅ | 2026-09-25 |
| 9 | Interfejs po angielsku | zrzuty `settings.html`, `settings.html?wizard`, `panel.html` z `?lang=en`; testy `i18n.test.ts` (auto, przełączanie, skan polskich literałów w UI i w aplikacji Tauri) i `views.test.tsx` | ✅ | 2026-09-25 |
| 10 | Teksty z Rusta po angielsku | testy: powiadomienia (`toasts_speak_english_when_asked`), przejście do sesji, status rdzenia, opisy integracji | ✅ automatycznie; tray i toasty na żywo: test użytkownika | 2026-09-25 |
| 11 | Instalator dwujęzyczny | `languages: [English, Polish]` i własny `nsis/Polish.nsh` dla komunikatów Tauri (Tauri 2.11 nie ma polskich); build `pnpm tauri build` przechodzi | ✅ build; wygląd stron instalatora: test użytkownika | 2026-09-25 |
| 12 | Testy automatyczne | `cargo test --workspace`, `pnpm --dir app test` | ✅ | 2026-09-25 |

Do sprawdzenia przez użytkownika na żywo: wygląd w prawdziwym pasku (DPI, jasny i ciemny pasek), płynność Anime, zmiana stylu bez restartu, nadpisania, przełączenie języka (tray, panel, ustawienia i powiadomienia bez restartu).
