// Copy buttons next to commands: the clipboard when it is allowed, otherwise the text gets selected.
let wired = false;
export function copyButtons(): void {
  if (wired) return;
  wired = true;
  document.addEventListener('click', async e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.copy');
    if (!btn) return;
    const code = btn.parentElement!.querySelector('code')!;
    const text = code.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied';
    } catch {
      const r = document.createRange(); r.selectNodeContents(code);
      const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
      btn.textContent = 'Selected';
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
  });
}
