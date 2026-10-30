import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { assertAccessibleTree, assertCookieEvidence, assertPaletteFocus } from '../desktop-bench/acceptance-contract.mjs'
import { T, REPO_ROOT, check, root } from './_harness.mjs'

function rejects(label, operation) {
  let failure
  try { operation() } catch (error) { failure = error }
  T(label, failure instanceof Error)
}

export async function cases() {
  check('desktop-bench/acceptance.mjs', 'installed acceptance help is cwd safe', ['--help'], { status: 0, stdout: /Usage/ }, { cwd: root })
  check('desktop-bench/acceptance.mjs', 'installed acceptance rejects unknown flags before doing work', ['--unknown'], { status: 2 })
  check('desktop-bench/acceptance.mjs', 'installed acceptance rejects output inside repository', ['--output', REPO_ROOT], { status: 2 })
  const native = { denied: false, error: null, nodes: [
    { id: '0', role: 'Document', name: '', interactive: false, focused: false, selected: false },
    { id: '0/1', role: 'Edit', name: 'Search commands', interactive: true, focused: true, selected: false },
    { id: '0/2', role: 'ListItem', name: 'Today', interactive: true, focused: false, selected: true },
  ] }
  T('native web tree counts every interactive control', assertAccessibleTree(native, 'win32').controls === 2)
  for (const change of [
    (tree) => { tree.nodes[1].name = ' ' },
    (tree) => { tree.nodes[1].role = 'Custom' },
    (tree) => { tree.nodes = [] },
    (tree) => { tree.nodes = tree.nodes.slice(1) },
    (tree) => { tree.nodes.forEach((node) => { node.interactive = false }) },
  ]) {
    const tree = structuredClone(native)
    change(tree)
    rejects('missing web content, controls, roles or names fail native acceptance', () => assertAccessibleTree(tree, 'win32'))
  }
  const denied = { denied: true, error: 'AXIsProcessTrusted=false; AXUIElementCopyAttributeValue(AXChildren) returned -25211', nodes: [] }
  T('an explicit macOS denial is retained exactly', assertAccessibleTree(denied, 'darwin').skipped === denied.error)
  rejects('Windows accessibility cannot be skipped', () => assertAccessibleTree(denied, 'win32'))
  rejects('an empty denial cannot be skipped', () => assertAccessibleTree({ ...denied, error: '' }, 'darwin'))
  const previous = { inputFocused: true, selected: -1, results: ['Today', 'Astra'], inputName: 'Search commands' }
  const current = { ...previous, selected: 0 }
  assertPaletteFocus(previous, current, native)
  T('palette traversal accepts input focus plus native selection in result order', true)
  rejects('palette cannot skip a result', () => assertPaletteFocus(previous, { ...current, selected: 1 }, native))
  rejects('palette cannot lose input focus', () => assertPaletteFocus(previous, { ...current, inputFocused: false }, native))
  const noSelection = structuredClone(native)
  noSelection.nodes[2].selected = false
  rejects('DOM selection cannot substitute for native selection', () => assertPaletteFocus(previous, current, noSelection))
  const noFocus = structuredClone(native)
  noFocus.nodes[1].focused = false
  rejects('DOM focus cannot substitute for native focus', () => assertPaletteFocus(previous, current, noFocus))
  const cookies = ['auth_token=fixture; HttpOnly; Secure; SameSite=Strict', 'refresh_token=fixture; HttpOnly; Secure; SameSite=Strict']
  assertCookieEvidence(cookies, true)
  T('cookie acceptance requires both protected BFF cookies and authenticated traffic', true)
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict']) {
    rejects('each BFF cookie protection is required', () => assertCookieEvidence(cookies.map((cookie) => cookie.replace(attribute, '')), true))
  }
  rejects('a set cookie alone cannot prove an authenticated request', () => assertCookieEvidence(cookies, false))
  const fixture = spawnSync(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'tools/desktop-bench/test-acceptance.ts')], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000 })
  T('fixed email code and corrupt signature cases exercise the shared schema and real cryptographic verifier', fixture.status === 0, fixture.stderr)
  if (process.platform === 'darwin') {
    const compilation = spawnSync('clang', ['-fsyntax-only', '-fobjc-arc', join(REPO_ROOT, 'tools/desktop-bench/acceptance-ax.m')], { encoding: 'utf8', timeout: 30000 })
    T('macOS accessibility reader compiles against the installed SDK without opening an app', compilation.status === 0, compilation.stderr)
  }
  const probeSource = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-probe.js'), 'utf8')
    .replace('run().catch', 'globalThis.completion = run().catch')
  for (const scenario of ['success', 'send-failure', 'token-leak', 'readable-cookie']) {
    const requests = []
    const reports = []
    let destination
    const browserWindow = {}
    browserWindow.top = browserWindow
    const context = {
      window: browserWindow, document: { readyState: 'complete', cookie: scenario === 'readable-cookie' ? 'auth_token=readable' : '' },
      location: { pathname: '/login', assign: (path) => { destination = path } },
      setTimeout, navigator: { platform: 'MacIntel' },
      fetch: async (path, options) => {
        if (path === '/_bench/events') { reports.push(JSON.parse(options.body)); return { ok: true } }
        requests.push({ path, body: JSON.parse(options.body) })
        return { ok: scenario !== 'send-failure', status: scenario === 'send-failure' ? 400 : 200,
          json: async () => scenario === 'token-leak' ? { token: 'forbidden' } : {} }
      },
    }
    runInNewContext(probeSource, context)
    await context.completion
    T('installed page probe completes only through successful protected BFF email requests', scenario === 'success'
      ? destination === '/' && requests.map((entry) => entry.path).join(',') === '/api/auth/send-code,/api/auth/verify-code' && reports.some((entry) => entry.kind === 'email-completed')
      : !destination && reports.some((entry) => entry.kind === 'error') && !reports.some((entry) => entry.kind === 'email-completed'))
  }
  const proxySource = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/server.mjs'), 'utf8')
    .replace(/^import .*$/gm, '').replace('export async function startProxy', 'async function startProxy') + '\nglobalThis.startProxy = startProxy'
  for (const authenticated of [false, true]) {
    let handler
    let forwarded
    let returned
    const upstreamCookies = ['auth_token=bff-issued; HttpOnly; Secure; SameSite=Strict']
    const context = {
      benchmarkViewport: [900, 600], readFile: async () => '',
      createServer: (callback) => { handler = callback; return { once() {}, listen(port, host, ready) { ready() } } },
      createSecureServer: (tls, callback) => { handler = callback; return { once() {}, listen(port, host, ready) { ready() } } },
      request: (options, callback) => {
        forwarded = options
        callback({ headers: { 'content-type': 'application/json', 'set-cookie': upstreamCookies }, statusCode: 200, pipe() {} })
        return { on() {} }
      },
    }
    runInNewContext(proxySource, context)
    const route = () => false
    route.observe = () => {}
    await context.startProxy({ token: authenticated ? 'benchmark-token' : undefined, probePath: 'probe', port: 443, upstreamPort: 3401, tls: {}, acceptance: !authenticated, route })
    await handler({ url: '/api/auth/verify-code', method: 'POST', headers: { host: 'app-staging.useorbit.org', cookie: 'original=bff' }, pipe() {} },
      { writeHead(status, headers) { returned = headers; return this } })
    T('proxy preserves BFF cookies in acceptance and retains benchmark cookie seeding', authenticated
      ? forwarded.headers.cookie === 'auth_token=benchmark-token; i18n_locale=en' && returned['set-cookie'][0].startsWith('auth_token=benchmark-token;')
      : forwarded.headers.cookie === 'original=bff' && returned['set-cookie'] === upstreamCookies)
    T('TLS proxy retains the exact origin and HTTPS forwarding', forwarded.headers.host === 'app-staging.useorbit.org' && forwarded.headers['x-forwarded-proto'] === 'https')
  }
  const buildScript = readFileSync(join(REPO_ROOT, 'apps/web/scripts/build-hermetic.mjs'), 'utf8')
    .replace(/^import .*$/gm, '').replaceAll('import.meta.url', JSON.stringify('file:///hermetic/build-hermetic.mjs'))
  for (const origin of [undefined, 'https://app-staging.useorbit.org']) {
    const builds = []
    runInNewContext(buildScript, {
      process: { execPath: process.execPath, env: origin ? { HERMETIC_DESKTOP_ORIGIN: origin } : {}, exit: () => { throw new Error('Build failed') } },
      createRequire: () => ({ resolve: (name) => name }), dirname: () => '/hermetic', resolve: (...parts) => parts.join('/'),
      fileURLToPath: (url) => url, LAYOUT_ORIGIN: 'http://127.0.0.1:3400',
      spawnSync: (command, argumentsList, options) => { builds.push(options); return { status: 0 } },
    })
    T('hermetic builder compiles matching site and event origins without changing the mock API', builds.length === 2 && builds.every(({ env }) =>
      env.API_BASE === 'http://127.0.0.1:5099' && env.NEXT_PUBLIC_SITE_URL === (origin ?? 'http://127.0.0.1:3400') &&
      env.NEXT_PUBLIC_EVENT_API_BASE === (origin ?? 'http://127.0.0.1:5099')))
  }
  const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/desktop-acceptance.yml'), 'utf8')
  T('native acceptance retains both VMs, per-ref cancellation and always-uploaded evidence',
    workflow.includes('runner: [macos-latest, windows-latest]') && workflow.includes('desktop-acceptance-${{ github.ref }}') && workflow.includes('if: always()'))
}
