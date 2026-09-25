# Agent Pets: wygląd v2 (Szkic, Naklejka i Pixel-art jako modele, podgląd animacji, overhaul Anime). Projekt

Status: zatwierdzony w rozmowie 2026-09-25 (części 1–3), do przeglądu przez użytkownika. Rozwija `2026-09-25-agent-pets-looks-design.md` po teście na żywo gałęzi `looks`.

## 1. Skąd ta zmiana

Z testu użytkownika:
- Szkic jest „za mało szkicowy”.
- Naklejka odstaje od ikony aplikacji.
- Pixel-art jest rozmyty, a nie pikselowy (zmniejszony rysunek wektorowy + próg przezroczystości).
- Anime wygląda dobrze, ale to nie to: ma być overhaul animacji w stylu znanych anime (seria „muda muda” zamiast zwykłego pisania), dużo efektów i cząsteczek, „bardzo motion”.
- Duchy całego ciała (smugi przez poprzednie klatki) psują animację.
- Podgląd ma pozwalać obejrzeć każdą animację.
- Użytkownik zgodził się na osobne modele i osobne animacje, jeśli wspólne rysowanie wygląda źle.

## 2. Podział prac

Jeden spec, dwa plany wykonywane po kolei, z testem użytkownika pomiędzy:
- **Plan 1, wygląd:** Szkic v2, model naklejki, model pikselowy, podgląd wszystkich animacji.
- **Plan 2, Anime:** choreografia wszystkich 15 scen, system efektów, bez duchów ciała.

Obie części na gałęzi `looks` (jeszcze niescalonej), wydanie 0.6.0 po obu.

## 3. Architektura: jeden mózg, kilka modeli

- **Mózg zwierzaka** zostaje wspólny: sceny, akcje, sprężyny (`K`, `stepPet`), rekwizyty (`c.prop`, `c.hold`), cząsteczki (`c.parts`), zegar (`tick`).
- **Model rysowania** wybiera styl (`StyleDef.model`):
  - `vector`: dzisiejsze `drawPet` (Szkic, Czysty, Neon, Tusz, Pastel);
  - `sticker`: nowy `drawSticker` (Naklejka);
  - `pixel`: nowy `drawPixel` (Pixel-art).
- Każdy model czyta te same wartości sprężyn i zwraca pozycje dłoni (`c.hand`), żeby rekwizyty, efekty i energia ruchu działały bez zmian.
- `PetPainter` rysuje model wprost na scenę; warstwa poza ekranem i próg przezroczystości znikają (Pixel-art ma własny model), a razem z nimi duchy ciała.
- **Choreografia Anime** (plan 2) to osobny zestaw scen `SCENES_ANIME` o tych samych kluczach co `SCENES`; ruch Anime wybiera ten zestaw. Działa we wszystkich modelach.

## 4. Szkic v2 (model wektorowy)

- Kontur ołówkowy (grafit, nie brąz), 2–3 luźne przejścia linii o różnej grubości i przezroczystości.
- Drganie konturu ≈ 2–2,5 px w pasku (u = 0,3), więcej przy dużej skali; kontur „gotuje się” ≈ 12 razy na sekundę.
- Wypełnienie: kolorowe kreskowanie po skosie na lekkim tle w kolorze bryły (nie płaska plama); ściana boczna kreskowana gęściej.
- Cień pod zwierzakiem wykreskowany.
- Parytet z prototypem v6 dotyczy już tylko stylu Czystego.

## 5. Model naklejki

Wzorzec: `app/src-tauri/icons/app-icon.png`.

- **Zawsze przodem:** bez obrotu 3D i ściany bocznej; obrót ze sceny (`th`) zamienia się w lekkie przechylenie i przesunięcie, a zwrot w bok w odbicie lustrzane oczu i uśmiechu.
- **Clawd:** szeroki, mocno zaokrąglony prostokąt, boczne wypustki na wysokości oczu, owalne ciemne oczy z białym błyskiem, uśmiech, różowe rumieńce.
- **Kodek:** biały kask z dużym ciemnym ekranem, oczy na ekranie w kolorze morskim (przy radości „^^”), szare nauszniki po bokach, antenka z morską kulką z błyskiem.
- Krótkie grube nóżki; łapki jako krótkie kapsułki, które wydłużają się tylko do rekwizytu (pozycja dłoni ze wspólnego mózgu).
- Gruby ciemny kontur (≈ 2 px w pasku), miękki gradient od góry, refleks u góry bryły, lekki cień.
- Rekwizyty i przedmioty w dłoniach rysowane istniejącym kodem w grubej kresce (styl `sticker` w `pen`).
- Stany twarzy (mruganie, sen, radość, zawroty, zmrużenie) w wersji naklejkowej.

## 6. Model pikselowy

- Zwierzak rysowany na siatce: jeden „piksel” sprite'a to całkowita liczba pikseli urządzenia (w pasku 2 px CSS przy skali 1,0; przy innej skali DPI zaokrąglone do całości), pozycje wyrównane do siatki urządzenia.
- Tylko prostokąty (`fillRect`), bez wygładzania, bez obrysów ścieżkami.
- Paleta 6–8 kolorów na zwierzaka (kolor bryły, cień, jasny refleks, kontur, oczy, akcent).
- Sprite ≈ 32×24 piksele siatki w pasku; Clawd i Kodek jako prostokątne bryły z oczami 2×3, nóżkami, łapkami rysowanymi linią Bresenhama od barku do dłoni.
- Ruch skokowy: model rysuje pozę z zegara zaokrąglonego do 0,1 s (≈ 10 kl./s), pozycja dłoni i ciała zaokrąglona do siatki.
- Uproszczone pikselowe rekwizyty: biurko z monitorem (`desk`), terminal (`crt`), tablica (`board`), maszyna (`machine`), poduszka (`pillow`), lupa (`lens`), siatka (`net`), kartka (`paper`, `sheet`), klucz (`wrench`); cząsteczki tekstowe jako małe pikselowe znaczki (kropki, iskry).
- Efekty Anime (plan 2) w tym modelu też na siatce.

## 7. Podgląd wszystkich animacji

- Zakładka Wygląd, nad galerią: **duże płótno** z Clawdem i Kodkiem w wybranym stylu i ruchu (u ≈ 0,7).
- **Lista wszystkich 15 scen** w dwóch grupach: Praca (myśli, pisze, komendy, czyta, szuka, sieć, subagent, MCP, kompaktuje) i Stany (czeka, skończył, błąd, bezczynny, śpi, pożegnanie), plus „Wszystkie po kolei” (każda scena ≈ 6 s).
- Karty galerii grają tę samą scenę; pasek w prawdziwym rozmiarze też.
- Nazwy scen w słownikach PL i EN.
- Kreator bez zmian (scena „pisze”).

## 8. Anime v2 (plan 2)

### 8.1. Ruch
- Każda akcja: zamach (≈ 0,1–0,15 s) → bardzo szybka akcja → zatrzymanie w pozie.
- Sprężyny w Anime twarde i krytycznie tłumione (bez przestrzelenia i bujania w tył); tempo ≈ 1,4.
- Bez duchów całego ciała. Zamiast nich celowo rysowane smugi: łuk-smuga za łapką, wachlarz pięści przy serii, rozciągnięcie ciała w kierunku szybkiego ruchu przez 1–2 klatki.

### 8.2. Efekty
- Cząsteczki: iskry, kurz, klawisze, kartki, konfetti, błyskawice, dym, energia, nutki, łzy, dusza; każda z własną fizyką (grawitacja, opór, obrót, zanikanie); limit liczby na zwierzaka.
- Klatka uderzenia: sylwetka zwierzaka na 1–2 klatki w odwróconych kolorach z białym błyskiem i radialnymi kreskami; najwyżej 3 błyski na sekundę na zwierzaka.
- Wstrząs przy uderzeniach.
- Tło akcji: radialne linie prędkości albo promienie za zwierzakiem, tylko w jego miejscu w pasku.
- Onomatopeje (ドドド, バン, ゴゴゴ, やった! …), najmniej ≈ 9 px.
- Tryb oszczędny: połowa cząsteczek, bez tła akcji. Wyłączone efekty animacji w Windows: bez błysków i wstrząsów, choreografia zostaje.

### 8.3. Sceny

| Scena | Choreografia |
|---|---|
| Pisze (`edit`) | ORA/MUDA: wachlarz pięści-smug w klawiaturę, lecące klawisze i iskry, „ドドド”, co kilka sekund finałowy cios z klatką uderzenia |
| Komendy (`bash`) | Pieczęcie rąk: 4–5 szybkich gestów z błyskami, „puf” z dymem, komenda pojawia się w terminalu |
| Czyta (`read`) | Błysk okularów, strony przelatują z wiatrem i liniami |
| Szuka (`grep`) | Sharingan: zbliżenie na świecące oko ze skanującymi liniami, przy trafieniu „!” i klatka uderzenia |
| Sieć (`web`) | Oddech pioruna: zygzakowaty dash z błyskawicą, łapanie strony w locie, powrót z iskrami |
| Subagent (`agent`) | Przywołanie: pieczęć na ziemi, kłąb dymu, wyskakuje mini-pomocnik i odbiega |
| MCP (`mcp`) | Alchemik: klaśnięcie, świecący krąg transmutacji, narzędzie wyłania się z iskier |
| Myśli (`thinking`) | Light Yagami: cień na oczach, dramatyczny uśmiech, kartka spada w zwolnionym tempie |
| Czeka (`needs`) | Wielkie błyszczące oczy, skaczące „!” z liniami szoku, machanie |
| Skończył (`done`) | Might Guy „Nice!”: kciuk w górę, błysk zębów, promienie zachodzącego słońca, konfetti |
| Błąd (`error`) | Dusza wylatuje z ust, szarość, kropla potu |
| Bezczynny (`idle`) | Na zmianę: chibi kręci się i nuci albo trening (pompki, przysiady) |
| Śpi (`sleep`) | Na zmianę: bąbel z nosa (rośnie i maleje) z Zzz albo dymek snu z małą sceną |
| Kompaktuje (`compact`) | Hollow Purple: dwie kule energii łączą się, ściskają i implodują |
| Pożegnanie (`bye`) | Ucieczka ze smugą i chmurą kurzu |

## 9. Testy

- **Plan 1:**
  - każdy styl × skórka × scena × ruch przez `PetPainter`: bez NaN, stan płótna przywrócony (istniejący test rozszerzony o nowe modele);
  - model pikselowy: tylko `fillRect` na całkowitych współrzędnych urządzenia, brak ścieżek i `drawImage`, pozycja zmienia się skokowo (ta sama klatka w obrębie 0,1 s);
  - model naklejki: brak obrotu bryły przy obróconej scenie (`th` ≠ 0), gruby kontur ≥ 2 px w pasku, cechy ikony (wypustki Clawda, nauszniki i antenka Kodka, uśmiech, rumieńce);
  - Szkic: drganie ≥ 2 px w pasku, kreskowane wypełnienie (brak pełnego `fill` w kolorze bryły bez kreskowania);
  - Czysty: parytet z prototypem v6 bez zmian;
  - rozróżnialność 7 stylów w pasku (istniejący test);
  - podgląd: lista 15 scen w obu językach, „Wszystkie po kolei”.
- **Plan 2:** każda scena Anime w każdym modelu bez NaN i z przywróconym stanem; limit cząsteczek; ≤ 3 błyski na sekundę; brak przestrzelenia sprężyn w Anime; tryb oszczędny i `reduced-motion` ograniczają efekty; brak rysowania poprzednich klatek (duchów).
- Ocena wizualna: zrzuty i nagrania klatek z podglądu; ostateczna ocena użytkownika na żywo.
