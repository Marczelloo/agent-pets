import type { DeepPartial } from './deep';
import type { Dict } from './index';

/** English texts that differ on Linux: no Windows taskbar, the pets sit at the bottom edge of the screen. */
export const enLinux: DeepPartial<Dict> = {
  panel: {
    remove: title => `Remove pet: ${title}`,
  },
  settings: {
    themeDesc: 'Light, dark or follow the system',
    tabs: { stage: 'Screen' },
    doorDesc: 'Any tool can report its state through a local address or the hook report command (docs/door.md in the GitHub repository).',
    maxVisible: 'Maximum pets on screen',
    muteDesc: 'System notifications go quiet while the list in the panel keeps filling',
    hotkeys: {
      note: 'Click a shortcut and press a new combination with Ctrl, Alt, Shift or Super. Esc cancels, Backspace turns it off. On Wayland a shortcut may not fire or may clash with the desktop’s own: then pick another combination.',
    },
    backup: {
      hint: 'Look, notifications, placement and limits. Agent integrations stay as they are.',
    },
    autostart: 'Start at login',
    langAuto: 'Automatic (like the system)',
  },
  stage: {
    positionDesc: 'Along the bottom edge of the screen (above the bottom panel when there is one), or a separate window on the desktop',
    pos: { right: 'Bottom right', left: 'Bottom left', custom: 'Bottom, custom', floating: 'Floating' },
    moveDesc: 'Drag the stage to a spot along the bottom edge; Enter or a click outside saves, Esc cancels',
    colorAuto: 'Match the system theme',
    sizeDesc: 'Up to 100% at the screen edge, up to 300% in the floating window',
    sizeFloatOnly: 'Bigger only in the floating window; at the screen edge the pets are at 100%',
    alignFixed: 'Set by the position when it is bottom right or bottom left',
  },
  look: {
    mediaDesc: 'Idle and sleeping pets put on headphones when a music player is playing. Track titles are never read.',
    taskbar: 'At actual size',
  },
};
