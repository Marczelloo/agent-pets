/**
 * The floating window receives real mouse events, so WebView2 would show its own menu (Back, Refresh,
 * Print; Refresh would reload the stage). Rust opens the stage menu.
 */
export function blockContextMenu(target: EventTarget): void {
  target.addEventListener('contextmenu', e => e.preventDefault());
}
