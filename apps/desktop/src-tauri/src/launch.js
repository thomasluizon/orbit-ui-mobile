(() => {
  if (window.top !== window || window.location.origin !== __ORBIT_LAUNCH_ORIGIN__) return;
  const generation = window.__TAURI_INTERNALS__.invoke('desktop_launch', { generation: null });
  let active = true;
  let finished = false;
  const reveal = () => {
    if (!active || finished) return;
    finished = true;
    generation.then(value => {
      if (active) return window.__TAURI_INTERNALS__.invoke('desktop_launch', { generation: value });
    })
      .catch(error => console.error('Cannot finish desktop launch', error));
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
