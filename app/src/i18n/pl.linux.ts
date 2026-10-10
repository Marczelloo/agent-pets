import type { DeepPartial } from './deep';
import type { Dict } from './index';

/** Polskie teksty różniące się na Linuksie: bez paska zadań Windows, zwierzaki stoją przy dolnej krawędzi ekranu. */
export const plLinux: DeepPartial<Dict> = {
  panel: {
    remove: title => `Usuń zwierzaka: ${title}`,
  },
  settings: {
    themeDesc: 'Jasny, ciemny albo zgodny z systemem',
    tabs: { stage: 'Ekran' },
    doorDesc: 'Każde narzędzie może zgłosić swój stan przez lokalny adres albo komendę hook report (opis w docs/door.md w repozytorium na GitHubie).',
    maxVisible: 'Najwięcej zwierzaków na ekranie',
    muteDesc: 'Powiadomienia systemowe milkną, a lista w panelu nadal się zapełnia',
    hotkeys: {
      note: 'Kliknij skrót i naciśnij nową kombinację z Ctrl, Alt, Shift lub Super. Esc anuluje, Backspace wyłącza.',
    },
    backup: {
      hint: 'Wygląd, powiadomienia, położenie i limity. Integracje z agentami zostają jak są.',
    },
    autostart: 'Uruchamiaj po zalogowaniu',
    langAuto: 'Automatycznie (jak system)',
  },
  stage: {
    positionDesc: 'Wzdłuż dolnej krawędzi ekranu (nad dolnym panelem, jeśli jest), albo osobne okno na pulpicie',
    pos: { right: 'Na dole po prawej', left: 'Na dole po lewej', custom: 'Na dole, własna', floating: 'Pływające' },
    moveDesc: 'Przeciągnij scenę w wybrane miejsce przy dolnej krawędzi; Enter albo klik obok zapisuje, Esc cofa',
    colorAuto: 'Według motywu systemu',
    sizeDesc: 'Przy krawędzi ekranu do 100%, w oknie pływającym do 300%',
    sizeFloatOnly: 'Większe tylko w oknie pływającym; przy krawędzi ekranu zwierzaki mają 100%',
    alignFixed: 'Ustala je pozycja, gdy jest na dole po prawej lub po lewej',
  },
  look: {
    mediaDesc: 'Gdy gra odtwarzacz muzyki, bezczynne i śpiące zwierzaki zakładają słuchawki. Tytuły utworów nie są czytane.',
    taskbar: 'Tak wygląda na ekranie',
  },
};
