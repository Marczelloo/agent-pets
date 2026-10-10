import { afterEach, describe, expect, it, vi } from 'vitest';
import { onLinux, setLinux } from './platform';

const WEBKITGTK = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const WEBVIEW2 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

/** Detection starts afresh from the stubbed user agent and address. */
const detect = (userAgent?: string, search = '') => {
  vi.stubGlobal('navigator', userAgent === undefined ? undefined : { userAgent });
  vi.stubGlobal('location', { search });
  setLinux(null);
  return onLinux();
};

afterEach(() => { vi.unstubAllGlobals(); setLinux(false); });

describe('platform', () => {
  it('detects Linux from the user agent, but not Windows or Android', () => {
    expect(detect(WEBKITGTK)).toBe(true);
    expect(detect(WEBVIEW2)).toBe(false);
    expect(detect(ANDROID)).toBe(false);
  });
  it('without a navigator it is not Linux', () => {
    expect(detect(undefined)).toBe(false);
  });
  it('?os= wins over the user agent', () => {
    expect(detect(WEBVIEW2, '?os=linux')).toBe(true);
    expect(detect(WEBKITGTK, '?lang=en&os=windows')).toBe(false);
    expect(detect(WEBKITGTK, '?os=beos')).toBe(true);
  });
  it('setLinux forces the answer until it is reset to detection', () => {
    detect(WEBVIEW2);
    setLinux(true);
    expect(onLinux()).toBe(true);
    setLinux(false);
    expect(onLinux()).toBe(false);
    setLinux(null);
    expect(onLinux()).toBe(false);
  });
});
