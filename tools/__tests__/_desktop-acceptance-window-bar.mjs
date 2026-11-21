import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { T } from './_harness.mjs'

// Runs the served acceptance probe through the commands of the Windows window bar check. The shell observes only the root
// mode class (apps/desktop/src-tauri/src/launch.js), so the probe must leave exactly one. The page paints from the inline
// tokens on the root, which only the theme switch writes (apps/web/lib/theme-dom.ts applyThemeTokensToDOM), so the probe
// must change the mode through the ThemeToggle control (data-theme-toggle). The shell then sets the window theme, which sets
// the WebView2 colour scheme some time later (src-tauri/src/launch.rs set_theme); `forwardsMode` is whether this fake shell
// does that at all.
async function runAppearanceProbe(servedProbe, commands, forwardsMode) {
  const reports = []
  const expectedReports = commands.length + 1
  const canvas = { light: '#FAFAFA', dark: '#09090B' }
  const root = new JSDOM('<html class="dark scheme-orange" style="--bg: #09090B"></html>').window.document.documentElement
  let theme = 'dark'
  let clicks = 0
  let colorScheme = 'dark'
  let pendingScheme = null
  let schemeReads = 0
  let clock = 0
  const toggle = {
    click() {
      clicks++
      const previous = theme
      theme = previous === 'dark' ? 'light' : 'dark'
      root.classList.add(theme)
      root.classList.remove(previous)
      root.style.setProperty('--bg', canvas[theme])
      if (forwardsMode) pendingScheme = { mode: theme, reads: schemeReads + 3 }
    },
  }
  const matchMedia = (query) => {
    schemeReads++
    if (pendingScheme && schemeReads >= pendingScheme.reads) {
      colorScheme = pendingScheme.mode
      pendingScheme = null
    }
    return { matches: query === '(prefers-color-scheme: dark)' && colorScheme === 'dark' }
  }
  const browserWindow = { __ORBIT_DESKTOP_VERSION__: '1.0.0' }
  browserWindow.top = browserWindow
  let finished
  const done = new Promise((resolve) => { finished = resolve })
  const context = {
    URLSearchParams, window: browserWindow, matchMedia, requestAnimationFrame: (callback) => setImmediate(callback),
    Date: { now: () => clock }, setTimeout: (callback, milliseconds = 0) => { clock += milliseconds; return setImmediate(callback) },
    location: { pathname: '/', search: '' },
    document: {
      readyState: 'complete', cookie: '', documentElement: root, addEventListener() {},
      querySelector: (selector) => {
        if (selector === '[data-theme-toggle]') return toggle
        return selector === '[data-habit-id="bench-0000"]' || selector === '[data-astra-button]:not([disabled])' ? {} : null
      },
    },
    fetch: async (path, options) => {
      if (path === '/_bench/events') {
        const event = JSON.parse(options.body)
        reports.push({ kind: event.kind, modes: ['dark', 'light'].filter((mode) => root.classList.contains(mode)), scheme: root.classList.contains('scheme-orange'),
          canvas: root.style.getPropertyValue('--bg'), reported: event.canvas ?? null, prefersDark: event.prefersDark ?? null, at: clock })
        if (reports.length === expectedReports || event.kind === 'error') finished()
        return new Response(null, { status: 204 })
      }
      if (path === '/_bench/command') return commands.length ? new Response(commands.shift()) : new Promise(() => {})
      return new Response(null, { status: 200 })
    },
  }
  runInNewContext(await servedProbe(true), context)
  await done
  return { reports: reports.map(({ at, ...report }) => report), times: reports.map(({ at }) => at), clicks, canvas }
}

async function appearanceProbeCases(servedProbe) {
  const { reports, clicks, canvas } = await runAppearanceProbe(servedProbe, ['appearance-dark', 'appearance-light', 'appearance-dark'], true)
  T('the appearance probe changes the page mode through the theme toggle, so the page canvas follows, and reports that canvas and the colour scheme the shell set',
    JSON.stringify(reports) === JSON.stringify([
      { kind: 'hoje', modes: ['dark'], scheme: true, canvas: canvas.dark, reported: null, prefersDark: null },
      { kind: 'appearance-dark', modes: ['dark'], scheme: true, canvas: canvas.dark, reported: canvas.dark, prefersDark: true },
      { kind: 'appearance-light', modes: ['light'], scheme: true, canvas: canvas.light, reported: canvas.light, prefersDark: false },
      { kind: 'appearance-dark', modes: ['dark'], scheme: true, canvas: canvas.dark, reported: canvas.dark, prefersDark: true },
    ]), JSON.stringify(reports))
  T('the appearance probe presses the theme toggle only when the page shows the other mode', clicks === 2, `clicks ${clicks}`)
  const stale = await runAppearanceProbe(servedProbe, ['appearance-dark', 'appearance-light'], false)
  T('the appearance probe reports the colour scheme it reads after 15 seconds when the shell never applies the page mode, so the runner can fail it',
    JSON.stringify(stale.reports.map(({ kind, prefersDark }) => [kind, prefersDark])) === JSON.stringify([['hoje', null], ['appearance-dark', true], ['appearance-light', true]]) &&
      stale.times[2] - stale.times[1] >= 15000, JSON.stringify(stale))
}

// The page draws the menu action as a button with data-window-action="menu" (apps/web/components/desktop-window-bar.tsx).
async function windowMenuProbeCases(servedProbe) {
  const reports = []
  const commands = ['window-menu']
  let pressed = 0
  const browserWindow = { __ORBIT_DESKTOP_VERSION__: '1.0.0' }
  browserWindow.top = browserWindow
  let finished
  const done = new Promise((resolve) => { finished = resolve })
  const context = {
    URLSearchParams, window: browserWindow, Date, setTimeout, requestAnimationFrame: (callback) => setImmediate(callback),
    location: { pathname: '/', search: '' },
    document: {
      readyState: 'complete', cookie: '', addEventListener() {},
      querySelector: (selector) => {
        if (selector === '[data-window-action="menu"]') return { click() { pressed++ } }
        return selector === '[data-habit-id="bench-0000"]' || selector === '[data-astra-button]:not([disabled])' ? {} : null
      },
    },
    fetch: async (path, options) => {
      if (path === '/_bench/events') {
        const event = JSON.parse(options.body)
        reports.push({ kind: event.kind, pressed })
        if (event.kind === 'window-menu' || event.kind === 'error') finished()
        return new Response(null, { status: 204 })
      }
      if (path === '/_bench/command') return commands.length ? new Response(commands.shift()) : new Promise(() => {})
      return new Response(null, { status: 200 })
    },
  }
  runInNewContext(await servedProbe(true), context)
  await done
  T('the window menu probe presses the menu action of the bar once and reports the press',
    JSON.stringify(reports) === JSON.stringify([{ kind: 'hoje', pressed: 0 }, { kind: 'window-menu', pressed: 1 }]), JSON.stringify(reports))
}

export async function windowBarProbeCases(servedProbe) {
  await appearanceProbeCases(servedProbe)
  await windowMenuProbeCases(servedProbe)
}
