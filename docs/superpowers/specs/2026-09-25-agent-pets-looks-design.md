# Agent Pets: style, ruch Anime i galeria wyglądu. Projekt

Status: zatwierdzony w rozmowie 2026-09-25 (części 1–3), do przeglądu przez użytkownika. Rozszerza główną specyfikację `2026-09-24-agent-pets-design.md` i ustawienia z `2026-09-25-agent-pets-phase5-design.md` (sekcja „Zwierzaki”).

## 1. Cel

Wygląd zwierzaków ma być wyborem, który widać w pasku, a nie tylko w dużym podglądzie.

- **Style (7):** Szkic, Czysty, Naklejka (styl ikony aplikacji), Pixel-art, Neon, Tusz, Pastel. Każdy styl działa dla obu zwierzaków (Clawd, Kodek).
- **Ruch (2):** Spokojny (dzisiejszy) i Anime (szybszy, sprężysty, ze smugami, liniami prędkości, impaktami i emotkami mangowymi). Ruch nie zależy od stylu.
- **Wybór:** jeden styl i jeden ruch domyślnie dla wszystkich; opcjonalne nadpisanie dla każdego agenta (Claude Code, Codex, Agent Router).
- **Podgląd:** galeria żywych kart w ustawieniach i w kreatorze, z przełącznikiem sceny i paskiem w prawdziwym rozmiarze.

Kryterium sukcesu: w pasku (skala `u = 0,3`) każdy z 7 stylów da się odróżnić od pozostałych na pierwszy rzut oka, a Anime od Spokojnego w ciągu kilku sekund pisania.

Poza zakresem: nowe zwierzaki i agenci, dymki, subagenci, osobny wygląd per sesja, własne style użytkownika (pliki), eksport stylów.

## 2. Podejście

Styl to zestaw parametrów i kilku haczyków rysowania; geometria, sceny i sprężyny zostają wspólne. Ruch to drugi, niezależny zestaw parametrów kroku i efektów.

Odrzucone: osobna funkcja rysowania na styl (7 kopii `body.ts`, które rozjadą się przy każdej nowej animacji) i gotowe sprite'y (utrata proceduralnych animacji, rekwizytów, sprężyn).

## 3. Wygląd w rendererze

### 3.1. Obiekt wyglądu zamiast globalnego `pen.sketch`

```ts
type StyleId = 'sketch' | 'clean' | 'sticker' | 'pixel' | 'neon' | 'ink' | 'pastel';
type MotionId = 'calm' | 'anime';
interface Look { style: StyleId; motion: MotionId }
```

- `drawPet(x, pet, X, Y, u, t, look?)` i `stepPet(pet, dt, t, motion?)`; brak argumentu = `{ style: 'clean', motion: 'calm' }`.
- `pen.sketch` znika. `pen` zostaje na stan rysowania jednej klatki (`boil`, `sid`, `font`) i dostaje bieżący styl ustawiany przez `drawPet` na czas wywołania, bo w pasku obok siebie mogą stać zwierzaki w różnych stylach.
- Wygląd sesji wylicza jedna funkcja `lookFor(settings.pets, app)`: nadpisanie agenta pole po polu, reszta z domyślnego.
- Agent → aplikacja: `claude` → `claude_code`, `codex` → `codex`, sesja z `origin = 'router'` → `agent_router` (niezależnie od `agent`).

### 3.2. Definicja stylu

`app/src/styles/<id>.ts`, rejestr `STYLES: Record<StyleId, StyleDef>` w `app/src/styles/index.ts` (jak `skins/`).

```ts
interface StyleDef {
  id: StyleId;
  label: string;                                   // po polsku, do galerii
  palette(p: Skin['pal'], skin: SkinId): Skin['pal']; // mapowanie barw (tożsamość dla Czystego)
  outline: { color: string | ((fill: string) => string); minPx: number; scale: number };
  fill: 'flat' | 'gradient' | 'glow';
  jitterPx: number;                                // drganie konturu, minimum w pikselach ekranu (0 = brak)
  hatch: boolean;
  shape?: { radius?: number; sideWall?: boolean }; // np. Naklejka: bardziej zaokrąglona, bez ściany bocznej
  face?: { smile?: boolean; blush?: 'always' | 'happy'; glint?: boolean };
  extras?: { clawdEars?: boolean; kodekPhones?: boolean };
  pixel?: number;                                  // rozmiar „piksela” w pikselach ekranu (tylko Pixel-art)
}
```

Minima w pikselach ekranu (`minPx`, `jitterPx`, `pixel`) liczą się względem `u` tak, żeby w pasku były widoczne, a przy `u = 1` nie przesadzały.

### 3.3. Style

| Styl | Paleta | Kontur | Wypełnienie | Charakter |
|---|---|---|---|---|
| **Szkic** | bez zmian | brązowy, drganie ≥ 1,2 px, druga cienka linia | płaskie przesunięte o ≥ 1 px | kreskowanie ściany bocznej widoczne w pasku |
| **Czysty** | bez zmian | brązowy, jak dziś | płaskie | bez zmian względem dzisiejszego „Czysta” |
| **Naklejka** | bez zmian, refleks jaśniejszy | ciemny, ≥ 2 px | gradient od góry (jaśniej) do dołu (ciemniej), refleks u góry | bryła mocniej zaokrąglona, pokazana z przodu (bez ściany bocznej), uśmiech, rumieńce zawsze, Clawd z bocznymi „uszkami”, Kodek ze słuchawkami |
| **Pixel-art** | przycięta do kilku kolorów | twardy, 1 „piksel” | płaskie | rysowany na płótnie o rozdzielczości `1/pixel`, powiększany bez wygładzania; „piksel” ≈ 2 px w pasku |
| **Neon** | ciemne wypełnienie, kolor agenta w konturze | kolor agenta, `shadowBlur` (poświata) | ciemne płaskie | Clawd świeci pomarańczowo, Kodek morsko; oczy i ekran Kodka świecą |
| **Tusz** | skala szarości + jeden akcent (kolor agenta w oczach/rekwizytach) | czarny, gruby, grubość zmienna wzdłuż ścieżki | białe / jasnoszare | styl pędzla, lekki rozprysk przy konturze |
| **Pastel** | barwy rozjaśnione (mieszane z bielą) | w odcieniu wypełnienia, cienki | płaskie | miękki, rozmyty cień pod zwierzakiem |

### 3.4. Warstwa zwierzaka (sprite)

Pixel-art (i smugi Anime, sekcja 4) potrzebują rysowania zwierzaka do własnego płótna i złożenia go na scenie:

- `PetLayer` (per zwierzak): płótno poza ekranem o rozmiarze obszaru zwierzaka, rysowanie w nim, potem `drawImage` na scenę.
- Style bez pikseli i ruch Spokojny rysują jak dziś, bezpośrednio na scenę (bez kosztu dodatkowego płótna).

## 4. Ruch

`app/src/motion/<id>.ts`, rejestr `MOTIONS`.

```ts
interface MotionDef {
  id: MotionId; label: string;
  tempo: number;        // mnożnik zegara zwierzaka (akcje, pisanie, machanie)
  spring: { k: number; d: number }; // mnożniki sztywności i tłumienia sprężyn
  squash: number;       // mnożnik squash & stretch
  trails: boolean; speedLines: boolean; impacts: boolean; emotes: boolean;
}
```

- **Spokojny:** `tempo 1`, `spring {1, 1}`, `squash 1`, wszystkie efekty wyłączone. Dokładnie dzisiejszy silnik.
- **Anime:**
  - `tempo ≈ 1,4`: zwierzak ma własny zegar, który przesuwa akcje i oscylacje szybciej;
  - `spring ≈ {1,8, 0,7}`: twardsze, słabiej tłumione sprężyny, więc widać przestrzelenie i odbicie;
  - `squash ≈ 1,6`.
- **Smugi:**
  - przy szybkim ruchu (energia = suma |v| sprężyn i prędkość dłoni powyżej progu) pod bieżącą klatką rysują się 2–3 poprzednie klatki zwierzaka z `PetLayer`, coraz bledsze;
  - za łapkami rysuje się łuk-smuga wzdłuż ostatnich pozycji dłoni.
- **Linie prędkości:** krótkie kreski za łapkami przy pisaniu, za ciałem przy chodzie, pionowe pod spodem przy skoku.
- **Impakty:** mały błysk co kilka uderzeń klawisza i przy stukaniu; radialny wybuch kresek przez 2–3 klatki przy przejściu w stan skończony.
- **Emotki:** kropla potu (błąd, zawroty), żyłka złości (błąd), duży skaczący „!” (czeka na Ciebie), gwiazdki w oczach (sukces).
- **Oszczędzanie:**
  - w trybie oszczędnym (10 kl./s) Anime zachowuje tempo, sprężyny i emotki, bez smug i linii prędkości;
  - `prefers-reduced-motion: reduce` (Windows: efekty animacji wyłączone) też wyłącza smugi, linie i impakty.

## 5. Ustawienia

### 5.1. Model (Rust `pets-core/settings.rs` i `app/src/types.ts`)

```json
"pets": {
  "style": "sticker",
  "motion": "calm",
  "overrides": { "claude_code": { "style": "neon" }, "codex": { "motion": "anime" } },
  "max_visible": 5
}
```

- `overrides` jest opcjonalne; każde nadpisanie ma opcjonalne `style` i `motion`; brak = „jak domyślny”.
- **Migracja:** stare `skin: "sketch" | "clean"` wczytuje się jako `style`. Zapis zawsze pisze `style` i nie pisze `skin`.
- **Domyślne:** nowe instalacje `sticker` + `calm`. Istniejące pliki mają `skin` zapisany jawnie przez kreator, więc zachowują swój wygląd.
- **Tolerancja:** nieznany styl lub ruch (np. z nowszej wersji) nie psuje wczytania całego pliku; dostaje wartość domyślną, a jeśli siedzi w nadpisaniu, to nadpisanie znika.
- Zmiana wyglądu działa od razu (to samo zdarzenie `pets://settings`, co dziś).

### 5.2. Zakładka „Wygląd” (dawniej „Zwierzaki”)

Od góry:

1. **Ruch:** przełącznik Spokojny / Anime.
2. **Scena podglądu:** Pracuje / Czeka / Gotowe / Śpi / Błąd; steruje wszystkimi podglądami. Niczego nie zapisuje.
3. **Galeria:** 7 kart (siatka), każda z żywym Clawdem i Kodkiem w danym stylu, większych niż w pasku, z nazwą stylu. Kliknięcie (albo klawiatura, `radiogroup`) wybiera styl.
4. **Tak wygląda w pasku:** ciemny pasek z Clawdem i Kodkiem w prawdziwym rozmiarze (wysokość sceny w pasku, `u = 0,3`) w wybranym wyglądzie.
5. **Osobno dla agentów** (rozwijane, domyślnie zwinięte): Claude Code, Codex, Agent Router, każdy z polami „Styl” i „Ruch” z opcją „Jak domyślny”. Podgląd paska pokazuje wtedy agentów z ich wyglądem.
6. Dotychczasowe: „Najwięcej zwierzaków w pasku”, „Tryb oszczędny”.

### 5.3. Kreator

Krok „Wygląd” dostaje galerię w wersji kompaktowej (mniejsze karty) i przełącznik ruchu. Bez nadpisań per agent i bez przełącznika sceny (scena „Pracuje”).

### 5.4. Wydajność podglądów

- Jedna wspólna pętla klatek dla wszystkich kart; płótna bez pracy, gdy okno jest ukryte (`visibilitychange`).
- Tryb oszczędny obowiązuje też w podglądzie (10 kl./s, bez smug).

## 6. Pasek i panel

- Scena w pasku (`stage.ts`) i panel (`PetCanvas`) wyliczają wygląd każdej sesji przez `lookFor` i przekazują go do `stepPet`/`drawPet`.
- Zmiana ustawień nie tworzy zwierzaków na nowo (bez pożegnania i powitania); następna klatka rysuje nowy wygląd.

## 7. Testy

- **Parytet z prototypem v6:**
  - silnik (`stepPet`) w ruchu Spokojnym: bez zmian, wszystkie sceny i skórki;
  - rysowanie w stylu Czystym, przy obu skalach: bez zmian (test dostaje `look = clean/calm` zamiast `pen.sketch = false`);
  - Szkic przy `u = 1` zostaje zgodny z prototypem; przy `u = 0,3` różni się celowo (minima w pikselach), co sprawdza osobny test.
- **Style:**
  - każdy styl × skórka × scena: bez NaN i wyjątków (rozszerzony `smoke.test.ts`);
  - rozróżnialność w pasku: dla każdej pary stylów zapisy rysowania przy `u = 0,3` się różnią;
  - dla stylów z minimami w pikselach szerokość konturu jest ≥ wartość minimalna.
- **Ruch:**
  - Anime zmienia przebieg sprężyn względem Spokojnego i pozostaje skończony (bez NaN) we wszystkich scenach;
  - efekty wyłączają się w trybie oszczędnym i przy `reduced-motion`;
  - smugi włączają się tylko powyżej progu energii.
- **Ustawienia (Rust):** migracja `skin` → `style`, domyślne dla nowego pliku, nieznany styl, nieznany ruch, nadpisanie z nieznaną wartością, zapis bez `skin`, zachowanie nieznanych pól.
- **Ustawienia (TS):** `lookFor` (nadpisanie pole po polu, brak nadpisania, aplikacja routera), widoki galerii i nadpisań (wybór karty zapisuje, „Jak domyślny” usuwa pole).
- **Ręcznie:** zrzuty 7 stylów × 2 ruchy w pasku i w galerii; test użytkownika na żywo.

## 8. Język angielski

Zatwierdzone w rozmowie 2026-09-25 jako część tej samej gałęzi (wydanie 0.6.0).

- **Ustawienie** `language: "auto" | "pl" | "en"`, domyślnie `auto`: polski, gdy język interfejsu Windows jest polski, w każdym innym przypadku angielski. Nieznana wartość → `auto`.
- **Wybór:** zakładka Ogólne („Język / Language”) i mały wybór w rogu pierwszego kroku kreatora. Zmiana działa od razu, bez restartu.
- **UI (TS):** słowniki `app/src/i18n/pl.ts` i `en.ts`; `en` ma typ słownika polskiego, więc brak klucza to błąd kompilacji. Odmiany i formaty czasu to funkcje w słowniku. Zakres: panel, tooltipy, HUD w pasku, ustawienia, kreator, galeria wyglądu, dane pokazowe.
- **Rust:** `pets_core::i18n` (`Lang`, `resolve`, wykrycie języka Windows przez `GetUserDefaultUILanguage`). Teksty dostają `Lang` jawnie (bez globalnego stanu). Zakres: menu traya, powiadomienia (w tym przycisk), wyniki przejścia do sesji, opisy wykrywania i stanu integracji, wyniki kreatora, status rdzenia w trayu. Błąd wczytania ustawień zwraca rdzeń technicznie (ścieżka i błąd), a UI dokłada przetłumaczony opis.
- **Instalator NSIS:** angielski i polski, wybór według języka Windows.
- **Bez zmian:** logi (`eprintln!`), komunikaty testów, `pets-cli` (narzędzie deweloperskie), komentarze w kodzie i dokumenty projektowe (po polsku), nazwy akcji w scenach (wewnętrzne).
- **Test pilnujący:** skan źródeł UI i aplikacji Tauri nie znajduje literałów z polskimi znakami poza słownikiem polskim, testami, logami i nazwami akcji scen.
