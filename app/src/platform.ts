/** Which desktop the webview runs on: Windows (WebView2) or Linux (WebKitGTK). */
let forced: boolean | null = null;
let detected: boolean | null = null;

/** Browser preview override: `?os=linux` or `?os=windows` wins over the user agent. */
function fromQuery(): boolean | null {
  const os = new URLSearchParams(globalThis.location?.search ?? '').get('os');
  return os === 'linux' ? true : os === 'windows' ? false : null;
}

/** True on Linux (not Android); detected once, `?os=` and `setLinux` win over the user agent. */
export const onLinux = (): boolean => {
  if (forced !== null) return forced;
  detected ??= fromQuery() ?? (() => {
    const ua = globalThis.navigator?.userAgent ?? '';
    return /Linux/.test(ua) && !/Android/.test(ua);
  })();
  return detected;
};

/** Forces the platform in tests (`null` = back to detection). */
export function setLinux(v: boolean | null): void {
  forced = v;
  detected = null;
}
