export type Surface = { x: number; y: number; width: number; height: number };

/** Report hit regions even while WebView2 is hidden or completely clipped.
 * requestAnimationFrame may never run until a non-empty native region permits painting.
 */
export function observeDesktopRegions(
  send: (surfaces: Surface[]) => Promise<unknown>,
  onError: (error: unknown) => void = console.error,
) {
  let last = "", pending = false, queued = false, dead = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const report = () => {
    if (dead || pending) return;
    const surfaces = [...document.querySelectorAll<HTMLElement>(".fr,.fr-panel,.fr-float,[role=tooltip],[role=listbox],.dropdown-menu,.rw-menu")]
      .filter(el => getComputedStyle(el).visibility !== "hidden" && el.getClientRects().length > 0)
      .map(el => {
        const r = el.getBoundingClientRect();
        return { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 10), width: r.width + 20, height: r.height + 20 };
      });
    const next = JSON.stringify({ surfaces, scale: window.devicePixelRatio });
    if (next === last) return;
    pending = true;
    let failed = false;
    void Promise.resolve().then(() => send(surfaces)).then(() => { last = next; }, error => {
      failed = true; onError(error);
    }).finally(() => {
      pending = false;
      if (dead) return;
      // Resample after in-flight writes; a reveal/resize may have happened meanwhile.
      if (failed) retry = setTimeout(schedule, 250);
      else schedule();
    });
  };
  const schedule = () => {
    if (dead || queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; report(); });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { attributes: true, childList: true, subtree: true });
  const resize = new ResizeObserver(schedule);
  resize.observe(document.body);
  window.addEventListener("resize", schedule);
  schedule();
  return () => {
    dead = true; clearTimeout(retry); observer.disconnect(); resize.disconnect();
    window.removeEventListener("resize", schedule);
  };
}
