/** Makes every sibling of the modal ancestry inert, then restores the original state. */
export function containModal(dialog: HTMLElement, initial: HTMLElement | null) {
  const previous = document.activeElement as HTMLElement | null;
  const changed: { el: HTMLElement; inert: boolean }[] = [];
  let branch: HTMLElement = dialog;
  while (branch.parentElement && branch.parentElement !== document.body) {
    for (const el of Array.from(branch.parentElement.children)) if (el !== branch && el instanceof HTMLElement) { changed.push({ el, inert: el.inert }); el.inert = true; }
    branch = branch.parentElement;
  }
  const focusables = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el => !el.hidden);
  const key = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const els = focusables(); const first = els[0], last = els.at(-1);
    if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
  };
  const guard = (e: FocusEvent) => { if (!dialog.contains(e.target as Node)) (initial ?? focusables()[0])?.focus(); };
  dialog.addEventListener("keydown", key); document.addEventListener("focusin", guard);
  (initial ?? focusables()[0])?.focus();
  return () => { dialog.removeEventListener("keydown", key); document.removeEventListener("focusin", guard); changed.forEach(({ el, inert }) => el.inert = inert); if (previous?.isConnected) previous.focus(); };
}
