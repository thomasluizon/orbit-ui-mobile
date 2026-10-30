import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve, win32 } from 'node:path'
import { createInterface } from 'node:readline'
import { PassThrough } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { assertAccessibleTree, assertCookieEvidence, assertPaletteFocus } from '../desktop-bench/acceptance-contract.mjs'
import { T, REPO_ROOT, check, configure, failureCount, root } from './_harness.mjs'
import { networkCases } from './desktop-acceptance-network.mjs'

function rejects(label, operation) {
  let failure
  try { operation() } catch (error) { failure = error }
  T(label, failure instanceof Error)
}

async function bindErrorCases() {
  const hostSource = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/host.mjs'), 'utf8')
    .replace(/^import .*$/gm, '').replace(/^export \{.*$/gm, '').replaceAll('export ', '')
  const bindFailures = []
  for (const code of ['EACCES', 'EADDRINUSE']) {
    const original = Object.assign(new Error(`listen ${code}: 127.0.0.1:443`), { code })
    let onError
    const context = {
      Set, Error,
      createServer: () => ({ once(event, callback) { onError = callback }, listen() { onError(original) } }),
    }
    runInNewContext(`${hostSource}\nglobalThis.assertFree = assertFree`, context)
    try { await context.assertFree(443) } catch (error) { bindFailures.push(error) }
    T(`${code} preflight preserves its errno and original error`, bindFailures.at(-1)?.message.includes(code) && bindFailures.at(-1)?.cause === original)
  }
  T('permission failures never report an occupied port', !bindFailures[0]?.message.includes('occupied') && bindFailures[1]?.message.includes('occupied'))
}

async function releaseImportCases() {
  const runnerSource = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-runner.mjs'), 'utf8')
  const importExpression = /const \{ buildManifest, artifactName, verifyArtifact \} = await (.+)/.exec(runnerSource)[1]
  for (const repository of [win32.join('d:\\runner workspace', 'orbit#checkout'), REPO_ROOT]) {
    const windowsPath = repository !== REPO_ROOT
    let imported
    const context = {
      join: windowsPath ? win32.join : join,
      pathToFileURL: (path) => pathToFileURL(path, { windows: windowsPath }),
      importModule: async (specifier) => { imported = specifier },
    }
    runInNewContext(`globalThis.loadRelease = async (repository) => ${importExpression.replace('import(', 'importModule(')}`, context)
    await context.loadRelease(repository)
    const expected = pathToFileURL(context.join(repository, 'apps/desktop/scripts/release.ts'), { windows: windowsPath }).href
    T('release import receives a file URL for platform paths, including spaces and fragments', imported === expected, imported)
  }
}

async function httpsForwarderCases() {
  const source = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/https-forwarder.mjs'), 'utf8')
    .replace(/^import .*$/gm, '').replace('export async function', 'async function')
  for (const failure of [undefined, 'bind', 'bind-v6', 'groups', 'gid', 'uid']) {
    const calls = []
    const original = Object.assign(new Error('listen EACCES: 127.0.0.1:443'), { code: 'EACCES' })
    const servers = []
    const createListener = () => {
      const server = new EventEmitter()
      server.listen = (port, host, ready) => {
        calls.push(['bind', port, host])
        if (failure === 'bind' || failure === 'bind-v6' && host === '::1') server.emit('error', original)
        else ready()
      }
      server.close = () => calls.push(['close', server])
      servers.push(server)
      return server
    }
    const identity = new EventEmitter()
    const changeIdentity = (kind, value) => { calls.push([kind, value]); if (failure === kind) throw original }
    Object.assign(identity, {
      setgroups: (groups) => changeIdentity('groups', groups),
      setgid: (gid) => changeIdentity('gid', gid), setuid: (uid) => changeIdentity('uid', uid),
      stdin: Object.assign(new EventEmitter(), { resume() {} }),
      stdout: { write: (line) => calls.push(['ready', line]) },
    })
    const socket = () => Object.assign(new EventEmitter(), {
      pipe(peer) { calls.push(['pipe', this, peer]); return peer },
      destroy() { if (this.destroyed) return; this.destroyed = true; this.emit('close') },
    })
    const upstreams = []
    const context = { process: identity, Set, Number, Error, createServer: createListener,
      createConnection: (options) => { calls.push(['connect', options]); const upstream = socket(); upstreams.push(upstream); return upstream } }
    runInNewContext(`${source}\nglobalThis.forwardHttps = forwardHttps`, context)
    let rejected
    try { await context.forwardHttps(1001, 1002) } catch (error) { rejected = error }
    if (failure) {
      T(`listener ${failure} failure retains its cause, closes the socket and never reports readiness`,
        rejected === original && servers.every((server) => calls.some(([kind, closed]) => kind === 'close' && closed === server)) &&
        !calls.some(([kind]) => kind === 'ready'))
      continue
    }
    T('HTTPS listener binds both loopbacks on 443 before clearing groups and dropping its identity',
      JSON.stringify(calls) === JSON.stringify([['bind', 443, '127.0.0.1'], ['bind', 443, '::1'], ['groups', []], ['gid', 1002], ['uid', 1001], ['ready', 'listening\n']]))
    const first = socket()
    const second = socket()
    servers[0].emit('connection', first)
    const ipv6 = servers.find((server) => server !== servers[0])
    T('HTTPS forwarder installs a connection handler for IPv6 after dropping privileges', Boolean(ipv6?.listenerCount('connection')))
    const secondListener = ipv6 ?? servers[0]
    secondListener.emit('connection', second)
    T('listener forwards the encrypted stream in both directions to unprivileged loopback 3443',
      calls.filter(([kind]) => kind === 'connect').every(([, options]) => options.host === '127.0.0.1' && options.port === 3443) &&
      calls.some(([kind, from, to]) => kind === 'pipe' && from === first && to === upstreams[0]) &&
      calls.some(([kind, from, to]) => kind === 'pipe' && from === upstreams[0] && to === first))
    upstreams[0].emit('error', new Error('upstream disconnected'))
    T('relay errors close both halves of the affected stream', first.destroyed && upstreams[0].destroyed && !second.destroyed)
    identity.stdin.emit('end')
    T('closing the control pipe releases the listener and all remaining connections', calls.at(-1)[0] === 'close' && second.destroyed && upstreams[1].destroyed)
    calls.length = 0
    try { await context.forwardHttps(0, 1002) } catch (error) { rejected = error }
    T('the listener rejects a root target identity before binding', calls.length === 0 && rejected?.message.includes('unprivileged'))
  }
}

async function listenerStartupCases() {
  const source = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-platform.mjs'), 'utf8')
  const listener = source.slice(source.indexOf('export async function startHttpsListener'), source.indexOf('export async function buildInstaller'))
    .replace('export async function', 'async function').replaceAll('import.meta.url', JSON.stringify(pathToFileURL(join(REPO_ROOT, 'tools/desktop-bench/acceptance-platform.mjs')).href))
  for (const scenario of ['ready', 'bind-error', 'early-exit', 'unexpected-reply']) {
    const child = { stdin: new PassThrough(), stdout: new PassThrough() }
    let complete
    let fail
    const handle = { child, done: new Promise((resolve, reject) => { complete = resolve; fail = reject }) }
    const original = new Error('listen EADDRINUSE: 127.0.0.1:443')
    let launched
    let stopped = false
    const context = { URL, String, Number, Error, Promise, JSON, createInterface,
      process: { execPath: process.execPath, getuid: () => 1001, getgid: () => 1002 },
      start: (command, argumentsList, options) => {
        launched = { command, argumentsList, options }
        queueMicrotask(() => {
          if (scenario === 'bind-error') fail(original)
          else if (scenario === 'early-exit') complete()
          else child.stdout.write(scenario === 'ready' ? 'listening\n' : 'unexpected\n')
        })
        return handle
      },
      stop: async (listenerHandle) => { stopped = true; await listenerHandle.nativeRequest('stop') },
    }
    runInNewContext(`${listener}\nglobalThis.startHttpsListener = startHttpsListener`, context)
    let result
    let rejected
    try { result = await context.startHttpsListener() } catch (error) { rejected = error }
    if (scenario === 'ready') {
      T('only the listener starts with noninteractive sudo and the caller identity',
        result === handle && launched.command === 'sudo' && launched.argumentsList.slice(0, 4).join(',') === ['-n', process.execPath, '--input-type=module', '-e'].join(',') &&
        launched.argumentsList.slice(-2).join(',') === '1001,1002' && launched.options.stdio.join(',') === 'pipe,pipe,pipe')
      await result.nativeRequest('stop')
      T('listener shutdown closes its input without a privileged process kill', child.stdin.writableEnded && !stopped)
    } else {
      T(`listener startup handles ${scenario} without leaking its process`, stopped && child.stdin.writableEnded &&
        (scenario === 'bind-error' ? rejected === original : rejected?.message.includes(scenario === 'early-exit' ? 'before readiness' : 'Unexpected')))
    }
    child.stdout.destroy()
    child.stdin.destroy()
  }
}

export async function cases() {
  check('desktop-bench/acceptance.mjs', 'installed acceptance help is cwd safe', ['--help'], { status: 0, stdout: /Usage/ }, { cwd: root })
  check('desktop-bench/acceptance.mjs', 'installed acceptance rejects unknown flags before doing work', ['--unknown'], { status: 2 })
  check('desktop-bench/acceptance.mjs', 'installed acceptance rejects output inside repository', ['--output', REPO_ROOT], { status: 2 })
  await bindErrorCases()
  await releaseImportCases()
  await httpsForwarderCases()
  await listenerStartupCases()
  await networkCases()
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
  T('acceptance regressions exercise the email schema, signature verifier and native tree reader', fixture.status === 0, fixture.stderr || fixture.stdout)
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
        return new Response(JSON.stringify(scenario === 'token-leak' ? { token: 'forbidden' } : {}), { status: scenario === 'send-failure' ? 400 : 200 })
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
        callback(Object.assign(new EventEmitter(), { headers: { 'content-type': 'application/json', 'set-cookie': upstreamCookies }, statusCode: 200, pipe() {} }))
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  configure({ toolsDir: resolve(dirname(fileURLToPath(import.meta.url)), '..'), self: 'desktop-acceptance' })
  await cases()
  process.exitCode = failureCount() === 0 ? 0 : 1
}
