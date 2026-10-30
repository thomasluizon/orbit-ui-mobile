import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { spawnSync } from 'node:child_process'
import { benchmarkViewport, electronInstallArguments, electronMainSource, normalizeElectronArchiveEntries, tauriBenchmarkOverlay } from '../desktop-bench/build.mjs'
import { assertViewport, buildHermeticWeb } from '../desktop-bench/runner.mjs'
import { T, REPO_ROOT, check, configure, failureCount, root } from './_harness.mjs'
import { cpuSeconds, median, metrics, parseMacProcesses, percentile, processTree, summarize, markdown } from '../desktop-bench/measurements.mjs'

function electronViewportCases() {
  const calls = []
  let ready
  runInNewContext(electronMainSource(), {
    require: () => ({
      app: {
        setPath() {}, whenReady: () => ({ then: (callback) => { ready = callback } }),
        focus() {}, on() {},
      },
      Menu: { setApplicationMenu: (menu) => calls.push(['menu', menu]) },
      BrowserWindow: class {
        constructor(options) {
          calls.push(['window', options])
          this.webContents = { on() {} }
        }
        setContentSize(...size) { calls.push(['content', ...size]) }
        focus() {}
        loadURL(url) { calls.push(['load', url]) }
      },
    }),
    process: { env: { ORBIT_BENCH_WIDTH: '900', ORBIT_BENCH_HEIGHT: '600', ORBIT_BENCH_PROFILE: 'profile' } },
  })
  ready()
  const menuIndex = calls.findIndex(([kind, menu]) => kind === 'menu' && menu === null)
  const windowIndex = calls.findIndex(([kind]) => kind === 'window')
  const contentIndex = calls.findIndex(([kind, width, height]) => kind === 'content' && width === 900 && height === 600)
  const loadIndex = calls.findIndex(([kind]) => kind === 'load')
  T('generated Electron shell suppresses the default menu before window creation', menuIndex >= 0 && menuIndex < windowIndex)
  T('generated Electron shell reapplies the requested content size before loading the page', contentIndex > windowIndex && contentIndex < loadIndex)
  const windowOptions = calls[windowIndex][1]
  T('Electron requests content dimensions and permits a window larger than the runner display',
    windowOptions.width === 900 && windowOptions.height === 600 && windowOptions.useContentSize === true && windowOptions.enableLargerThanScreen === true)
}

function requestedViewportCases() {
  const availableScreen = [1024, 768]
  for (const [label, viewports] of [
    ['first shell', [[900, 568]]],
    ['Electron', [[900, 600], [900, 552]]],
    ['both shells agree below the request', [[900, 568], [900, 568]]],
    ['width mismatch', [[899, 600]]],
  ]) {
    for (const actual of viewports) {
      let message
      try { assertViewport(actual, availableScreen) } catch (error) { message = error.message }
      const expected = actual.join(',') === '900,600' ? undefined : `Viewport mismatch: ${actual} versus 900,600; available screen: 1024x768`
      T(`readiness checks ${label} against the requested viewport with screen dimensions`, message === expected, message)
    }
  }
  let accepted = true
  try { assertViewport([900, 600], availableScreen) } catch { accepted = false }
  T('readiness accepts exactly the requested CSS viewport', accepted)
  const tauriWindow = tauriBenchmarkOverlay('profile').app.windows[0]
  T('Tauri requests a non-resizable logical content size',
    tauriWindow.width === 900 && tauriWindow.height === 600 && tauriWindow.resizable === false)
  T('Tauri leaves frame min/max constraints unset for macOS title bars',
    ['minWidth', 'minHeight', 'maxWidth', 'maxHeight'].every((key) => !(key in tauriWindow)))
  const nativeSource = readFileSync(join(REPO_ROOT, 'apps/desktop/src-tauri/src/main.rs'), 'utf8')
  T('Tauri removes the benchmark menu and fits the webview after building only with bench-loopback',
    /\.build\(\)\?;\s*#\[cfg\(feature = "bench-loopback"\)\]\s*\{\s*_window\.remove_menu\(\)\?;\s*bench_viewport::set_size\(\s*&_window,\s*tauri::LogicalSize::new\(\s*window_config\.width,\s*window_config\.height,?\s*\),?\s*\)\?;\s*\}/.test(nativeSource))
  T('Tauri excludes viewport adjustment from production builds',
    /#\[cfg\(feature = "bench-loopback"\)\]\s*mod bench_viewport;/.test(nativeSource))
  const viewportSource = readFileSync(join(REPO_ROOT, 'apps/desktop/src-tauri/src/bench_viewport.rs'), 'utf8')
  T('Tauri retains the initial macOS frame and webview fit in logical units',
    /#\[cfg\(target_os = "macos"\)\]\s*let requested = \{\s*let scale_factor = window\.scale_factor\(\)\?;\s*let frame = window\.outer_size\(\)\?\.to_logical::<f64>\(scale_factor\);\s*let viewport = window\.as_ref\(\)\.bounds\(\)\?\.size\.to_logical::<f64>\(scale_factor\);\s*window_size_for_viewport\(requested, frame, viewport\)\s*\};\s*window\.set_size\(requested\)/.test(viewportSource))
  const buildSource = readFileSync(join(REPO_ROOT, 'apps/desktop/src-tauri/build.rs'), 'utf8')
  T('the page resize command and its manifest registration require bench-loopback',
    /#\[cfg\(feature = "bench-loopback"\)\]\s*bench_viewport::fit_bench_viewport/.test(nativeSource) &&
    /#\[cfg\(feature = "bench-loopback"\)\]\s*"fit_bench_viewport"/.test(buildSource))
  const capability = tauriBenchmarkOverlay('profile').app.security.capabilities[0]
  T('only the main loopback benchmark capability grants page resizing',
    capability.permissions.includes('allow-fit-bench-viewport') && capability.windows.join(',') === 'main' &&
    capability.remote.urls.join(',') === 'http://127.0.0.1:3400/*')
}

async function probeReadiness({ viewport = [900, 600], tauri = false, resizedViewport = [900, 600], resizeError } = {}) {
  let report
  const reported = new Promise((resolve) => { report = resolve })
  const calls = []
  let pendingResize = false
  let elapsed = 100
  let conversation
  const close = { getAttribute: () => 'Close', click: () => { conversation = null } }
  const composer = { getBoundingClientRect: () => ({ height: 40 }), blur() {}, focus() { calls.push(['focus', ...viewport]); document.activeElement = composer } }
  const document = {
    visibilityState: 'visible', body: { innerText: '' }, querySelectorAll: () => [],
    querySelector(selector) {
      if (selector === '[data-habit-id="bench-0000"]') return { getBoundingClientRect: () => ({ height: 40 }) }
      if (selector === '[data-composer-input]:not([disabled])') return composer
      if (selector === '[data-shell-conversation]') return conversation
      if (selector === '[data-open-conversation]') return { click: () => { conversation = { querySelectorAll: () => [close] } } }
      return null
    },
  }
  const context = {
    document, __BENCH_CLOSE_LABEL__: 'Close', __BENCH_VIEWPORT__: benchmarkViewport,
    get innerWidth() { return viewport[0] }, get innerHeight() { return viewport[1] },
    screen: { availWidth: 1024, availHeight: 677 }, location: { pathname: '/' },
    performance: { timeOrigin: 1000, now: () => elapsed },
    setTimeout: (callback, milliseconds) => { elapsed += milliseconds; callback() },
    requestAnimationFrame: (callback) => {
      elapsed += 16
      if (pendingResize) { viewport = resizedViewport; pendingResize = false; calls.push(['layout', ...viewport]) }
      callback(elapsed)
    },
    fetch: (url, options) => {
      if (url === '/_bench/events') { const payload = JSON.parse(options.body); calls.push(['report', payload.kind]); report(payload); return Promise.resolve() }
      return new Promise(() => {})
    },
  }
  if (tauri) context.__TAURI_INTERNALS__ = { invoke: async (command, payload) => {
    calls.push(['invoke', command, payload])
    if (resizeError) throw resizeError
    pendingResize = true
  } }
  context.window = context
  runInNewContext(readFileSync(join(REPO_ROOT, 'tools/desktop-bench/probe.js'), 'utf8'), context)
  return { event: await reported, calls }
}

async function probeReadinessCases() {
  const { event: usable } = await probeReadiness()
  T('page readiness payload carries the actual viewport and available screen dimensions',
    usable.kind === 'usable' && usable.viewport.join(',') === '900,600' && usable.availableScreen?.join(',') === '1024,677', JSON.stringify(usable))
  for (const viewport of [[900, 568], [897, 561]]) {
    const { event, calls } = await probeReadiness({ viewport, tauri: true })
    const invocations = calls.filter(([kind]) => kind === 'invoke')
    T(`Tauri corrects the page viewport ${viewport} even when native frame and bounds already match`,
      invocations.length === 1 && invocations[0][1] === 'fit_bench_viewport' && invocations[0][2].viewport.join(',') === viewport.join(','), JSON.stringify(calls))
    const layoutIndex = calls.findIndex(([kind]) => kind === 'layout')
    T('Tauri waits for the resized CSS layout before focus and usable reporting',
      event.kind === 'usable' && event.viewport.join(',') === '900,600' && layoutIndex >= 0 &&
      calls.findIndex(([kind]) => kind === 'focus') > layoutIndex && calls.findIndex(([kind]) => kind === 'report') > layoutIndex, JSON.stringify({ event, calls }))
  }
  const matching = await probeReadiness({ tauri: true })
  T('matching Tauri and Electron viewports need no native correction',
    matching.event.kind === 'usable' && !matching.calls.some(([kind]) => kind === 'invoke'))
  const unchanged = await probeReadiness({ viewport: [900, 568], tauri: true, resizedViewport: [900, 568] })
  T('a native resize without the requested CSS layout cannot signal usable and retains the available screen in its error',
    unchanged.event.kind === 'error' && /900,568.*900,600.*1024x677/.test(unchanged.event.message), JSON.stringify(unchanged.event))
  const rejected = await probeReadiness({ viewport: [900, 568], tauri: true, resizeError: 'Native resize failed' })
  T('the Rust string rejection retains the native failure message before usable',
    rejected.event.kind === 'error' && rejected.event.message?.includes('Native resize failed'), JSON.stringify(rejected.event))
}

export const cases = async () => {
  electronViewportCases()
  requestedViewportCases()
  await probeReadinessCases()
  for (const options of [undefined, '', '--trace-warnings', '--trace-warnings --max-old-space-size=2048']) {
    const environment = { API_BASE: 'http://127.0.0.1:5099', ...(options === undefined ? {} : { NODE_OPTIONS: options }) }
    const original = { ...environment }
    let invocation
    await buildHermeticWeb(REPO_ROOT, root, environment, async (command, argumentsList, settings) => {
      invocation = { command, argumentsList, ...settings }
    })
    T(`hermetic web build gets a 4096 MiB heap with inherited options ${JSON.stringify(options)}`,
      invocation.env.NODE_OPTIONS === `${options ? `${options} ` : ''}--max-old-space-size=4096`)
    T('heap override leaves the shared shell and runtime environment unchanged', JSON.stringify(environment) === JSON.stringify(original) && invocation.env !== environment)
    T('hermetic web build retains its command, origin, working directory and log',
      invocation.command === process.execPath && invocation.argumentsList.join(',') === ['--import', 'tsx', join(REPO_ROOT, 'apps/web/scripts/build-hermetic.mjs')].join(',') &&
      invocation.env.API_BASE === environment.API_BASE && invocation.cwd === REPO_ROOT && invocation.log === join(root, 'web-build.log'))
  }
  T('Electron build dependencies are installed as development-only tooling', electronInstallArguments('workspace', '45.1.0').includes('--save-dev'))
  T('Electron archive accepts only the shell and manifest from POSIX output',
    normalizeElectronArchiveEntries('/package.json\n/main.cjs\n').join(',') === '/main.cjs,/package.json')
  T('Electron archive accepts Windows backslashes and CRLF with empty lines',
    normalizeElectronArchiveEntries('\\package.json\r\n\r\n\\main.cjs\r\n').join(',') === '/main.cjs,/package.json')
  const extraEntries = normalizeElectronArchiveEntries('\\package.json\r\n\\nested\\extra.cjs\r\n\\main.cjs\r\n').join(',')
  T('Electron archive retains every entry and refuses an extra file',
    extraEntries === '/main.cjs,/nested/extra.cjs,/package.json' && extraEntries !== '/main.cjs,/package.json')
  check('desktop-bench/run.mjs', 'benchmark help is cwd safe', ['--help'], { status: 0, stdout: /Usage/ }, { cwd: root })
  check('desktop-bench/run.mjs', 'benchmark refuses unknown options before building', ['--unknown'], { status: 2 })
  check('desktop-bench/run.mjs', 'benchmark refuses fewer than five repetitions', ['--runs', '4'], { status: 2 })
  T('CPU parser handles minutes and day-prefixed values', cpuSeconds('126:37.41') === 7597.41 && cpuSeconds('1-02:03:04.50') === 93784.5)
  const processes = parseMacProcesses(' 10 1 100 0:01.25 app\n 11 10 200 0:02.00 helper\n 12 1 300 0:03.00 WebKit\n 99 1 900 0:04.00 other')
  processes[2].responsible = 10
  T('process accounting includes launchd WebKit helpers and excludes unrelated processes', processTree(processes, 10).map((entry) => entry.pid).join(',') === '10,11,12')
  T('RSS converts KiB to bytes', processes[1].residentBytes === 204800)
  T('median and p95 use measured distributions', median([5, 1, 4, 2, 3]) === 3 && median([2, 4]) === 3 && percentile([1, 2, 3, 4, 100], 0.95) === 100)
  const runs = ['tauri', 'electron'].flatMap((shell) => ['cold', 'warm'].flatMap((cache) =>
    [1000, 20, 30, 40, 50].map((value) => ({ shell, cache, ...Object.fromEntries(Object.keys(metrics).map((key) => [key, value])) }))))
  const medians = summarize(runs)
  T('the four distributions retain independent five-run medians', medians.tauri.cold.startupMs === 40 && medians.electron.warm.finalPartMs === 40)
  const report = markdown({ host: 'measured host', commit: 'commit', repetitions: 5, electronVersion: 'version', medians,
    disk: { tauri: { installedBytes: 1, installerBytes: 2 }, electron: { installedBytes: 3, installerBytes: 4 } }, verdict: 'Measured verdict' })
  T('Markdown carries disk, timing, unsigned build and cache definitions', /\| tauri \| 1 \| 2 \|/.test(report) && report.includes('40.00') && report.includes('Unsigned release builds') && report.includes('OS filesystem caches are not purged'))
  for (const operation of [() => median([]), () => median([NaN]), () => summarize([]), () => parseMacProcesses('bad row'), () => cpuSeconds('unknown')]) {
    let refused = false
    try { operation() } catch { refused = true }
    T('invalid or missing measurements cannot produce a successful summary', refused)
  }
  const configs = ['tauri.conf.json', 'tauri.production.conf.json'].map((name) => readFileSync(join(REPO_ROOT, 'apps/desktop/src-tauri', name), 'utf8'))
  const releaseFiles = readdirSync(join(REPO_ROOT, '.github/workflows')).filter((name) => name.includes('release') || name === 'desktop-build.yml')
  for (const name of releaseFiles) configs.push(readFileSync(join(REPO_ROOT, '.github/workflows', name), 'utf8'))
  T('release configurations and workflows never enable the loopback feature', configs.every((source) => !source.includes('bench-loopback')))
  const cargo = readFileSync(join(REPO_ROOT, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8')
  T('default Cargo features never enable loopback', !/^default\s*=.*bench-loopback/m.test(cargo))
  const result = spawnSync(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'tools/desktop-bench/test-fixture.ts')], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000 })
  T('hermetic stream follows the shared consumer protocol', result.status === 0, result.stderr)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  configure({ toolsDir: resolve(dirname(fileURLToPath(import.meta.url)), '..'), self: 'desktop-bench' })
  await cases()
  process.exitCode = failureCount() === 0 ? 0 : 1
}
