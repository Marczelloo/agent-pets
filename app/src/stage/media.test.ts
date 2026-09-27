import { describe, expect, it } from 'vitest';
import { mediaAppName } from './media';

describe('mediaAppName', () => {
  it('names known players and browsers from their AUMID', () => {
    expect(mediaAppName('Spotify.exe')).toBe('Spotify');
    expect(mediaAppName('SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify')).toBe('Spotify');
    expect(mediaAppName('AppleInc.AppleMusicWin_nzyj5cx40ttqa!App')).toBe('Apple Music');
    expect(mediaAppName('MSEdge')).toBe('Edge');
    expect(mediaAppName('Chrome')).toBe('Chrome');
  });
  it('falls back to the app part of the AUMID, and to nothing for bare hashes', () => {
    expect(mediaAppName('Contoso.CoolPlayer_8wekyb3d8bbwe!App')).toBe('CoolPlayer');
    expect(mediaAppName('C:\\Tools\\mpv.exe')).toBe('mpv');
    expect(mediaAppName('308046B0AF4A39CB')).toBeNull();
    expect(mediaAppName(null)).toBeNull();
    expect(mediaAppName('')).toBeNull();
  });
});
