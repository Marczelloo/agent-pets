/**
 * Okno pływające dostaje prawdziwe zdarzenia myszy, więc WebView2 pokazałby swoje menu (Wstecz, Odśwież,
 * Drukuj; „Odśwież” przeładowałby scenę). Menu sceny otwiera Rust.
 */
export function blockContextMenu(target: EventTarget): void {
  target.addEventListener('contextmenu', e => e.preventDefault());
}
