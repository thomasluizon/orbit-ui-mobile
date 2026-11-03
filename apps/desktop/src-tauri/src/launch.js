(() => {
  if (window.top !== window || window.location.origin !== __ORBIT_LAUNCH_ORIGIN__) return;
  const generation = window.__TAURI_INTERNALS__.invoke('desktop_launch', { generation: null });
  let active = true;
  let finished = false;
  let reportedMode;
  let pending = Promise.resolve();
  const report = (reveal = false) => {
    if (!active) return pending;
    const modes = ['dark', 'light'].filter(mode => document.documentElement?.classList.contains(mode));
    const mode = modes.length === 1 ? modes[0] : null;
    if (!reveal && (mode === null || mode === reportedMode)) return pending;
    reportedMode = mode;
    pending = generation.then(value => {
      if (active) {
        return window.__TAURI_INTERNALS__.invoke('desktop_launch', {
          generation: value, mode, ...(reveal ? {} : { reveal: false }),
        });
      }
    }).catch(error => console.error('Cannot finish desktop launch', error));
    return pending;
  };
  window.__ORBIT_DESKTOP_LAUNCH__ = () => report();
  const reveal = () => {
    if (!active || finished) return;
    finished = true;
    const appearance = new MutationObserver(() => report());
    appearance.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('pagehide', () => appearance.disconnect(), { once: true });
    report(true);
  };
  window.addEventListener('pagehide', () => { active = false; }, { once: true });
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('paint')) {
    const observer = new PerformanceObserver(list => {
      if (list.getEntries().some(entry => entry.name === 'first-contentful-paint')) {
        observer.disconnect();
        reveal();
      }
    });
    observer.observe({ type: 'paint', buffered: true });
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  } else {
    // WHY: Older WKWebView versions omit Paint Timing; reveal after the parsed document's next paint (#1983).
    const parsed = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!active || finished) return;
      const body = document.body;
      if (body && (body.innerText.trim() || body.querySelector('svg, img, canvas, video'))) {
        observer.disconnect();
        reveal();
      }
    }));
    const observer = new MutationObserver(parsed);
    observer.observe(document, { childList: true, subtree: true, characterData: true });
    setTimeout(() => observer.disconnect(), 15000);
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', parsed, { once: true });
    else parsed();
  }
})();
