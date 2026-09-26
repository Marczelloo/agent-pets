// Nazwa aplikacji, która gra, z identyfikatora AUMID od Windows (GSMTC).

const KNOWN: [RegExp, string][] = [
  [/spotify/i, 'Spotify'],
  [/applemusic/i, 'Apple Music'],
  [/itunes/i, 'iTunes'],
  [/zunemusic|groove/i, 'Media Player'],
  [/microsoft\.media\.player|zunevideo/i, 'Media Player'],
  [/tidal/i, 'TIDAL'],
  [/deezer/i, 'Deezer'],
  [/youtube/i, 'YouTube Music'],
  [/msedge/i, 'Edge'],
  [/chrome/i, 'Chrome'],
  [/firefox/i, 'Firefox'],
  [/opera/i, 'Opera'],
  [/brave/i, 'Brave'],
  [/vivaldi/i, 'Vivaldi'],
  [/vlc/i, 'VLC'],
  [/foobar/i, 'foobar2000'],
  [/aimp/i, 'AIMP'],
  [/winamp/i, 'Winamp'],
];

/**
 * Czytelna nazwa aplikacji: znane odtwarzacze i przeglądarki po nazwie, inne z AUMID
 * (`Firma.Aplikacja_hash!App` → `Aplikacja`, `C:\…\app.exe` → `app`). Sam hash (np. Firefox) → `null`.
 */
export function mediaAppName(aumid: string | null | undefined): string | null {
  if (!aumid) return null;
  for (const [re, name] of KNOWN) if (re.test(aumid)) return name;
  const base = aumid.split('!')[0].split(/[\\/]/).pop()!.replace(/\.exe$/i, '').split('_')[0];
  const name = base.split('.').pop() ?? '';
  return /^[0-9A-F]{8,}$/i.test(name) || !name ? null : name;
}
