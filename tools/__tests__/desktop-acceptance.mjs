import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve, win32 } from 'node:path'
import { createInterface } from 'node:readline'
import { PassThrough } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { assertAccessibleTree, assertCookieEvidence, assertPaletteFocus } from '../desktop-bench/acceptance-contract.mjs'
import { T, REPO_ROOT, check, configure, failureCount, root, stage } from './_harness.mjs'
import { networkCases } from './desktop-acceptance-network.mjs'
import { pushPhaseCases } from './desktop-acceptance-push.mjs'

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
  const importExpression = /const \{[^}]+\} = await (import\(.+)/.exec(runnerSource)[1]
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

async function installedLaunchCases() {
  const source = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-runner.mjs'), 'utf8')
  const launches = []
  const commands = []
  const pushCalls = []
  const events = [{ kind: 'hoje', nativeVersion: '1.0.0' }]
  let recorded
  let settings = {}
  const proxy = {
    reset(value) { settings = value },
    read(kind) { return kind === 'hoje' ? { nativeVersion: '1.0.0' } : { snapshot: {} } },
    events() { return events.slice() },
    send(command) { commands.push(command); if (command === 'reload') events.push({ kind: 'hoje', nativeVersion: '1.0.0' }) },
    stop() {},
  }
  const context = {
    join, directory: '/fixture', windows: true, process: { platform: 'win32', arch: 'x64', stdout: { write() {} } },
    mkdir: async () => {}, existsSync: () => false, assertFree: async () => {}, startRecording: async () => Object.assign(() => {}, { startedAt: Date.now() }),
    buildInstaller: async () => ({}), hermeticServices: async () => {}, nativeTool: async () => () => {},
    updateServer: async () => ({ route() {}, mode() {}, cookieEvidence() {} }),
    isolateOrigins: async () => ({ restore() {} }), lookup: async () => [{ address: '127.0.0.1' }],
    startProxy: async () => proxy, install: async () => '/fixture/Orbit',
    installedLaunch: (_executable, _output, name) => { launches.push(settings.expectAuthenticated === true); return { name } },
    waitFor: async (read, label) => { const result = read(); if (!result) throw new Error(`Timed out waiting for ${label}`); return result },
    inspectSurfaces: async () => {}, quit: async () => {},
    pushPhase: async (options) => { pushCalls.push({ options, checks: options.report.launchChecks.map((checkpoint) => checkpoint.event) }) },
    readFile: async () => 'signature verification failed', record: async (_path, report) => { recorded = report }, rm: async () => {}, stopAll: async () => {},
  }
  runInNewContext(source.slice(source.indexOf('export async function acceptance')).replace('export ', '') + '\nglobalThis.acceptance = acceptance', context)
  const credentials = { ORBIT_WNS_CLIENT_SECRET: 'fixture-secret' }
  await context.acceptance({ repository: '/fixture', output: '/output', credentials })
  T('installed acceptance runs the push phase once, after the valid update relaunch, with the acceptance credentials and that launch',
    pushCalls.length === 1 && pushCalls[0].checks.at(-1) === 'relaunched-hoje-valid' && pushCalls[0].options.credentials === credentials &&
      pushCalls[0].options.handle.name === 'update-valid' && pushCalls[0].options.output === '/output' && recorded.passed === true, JSON.stringify(pushCalls.map((call) => call.checks)))
  T('installed updater relaunches require the persisted session after the initial email launch', JSON.stringify(launches) === '[false,true,true]', JSON.stringify(launches))
  T('installed acceptance waits for a new Hoje event after requesting an authenticated reload',
    commands.filter(command => command === 'reload').length === 1 && events.length === 2)
  T('recording checkpoints locate first launch, sign-in, reload and both authenticated relaunches',
    recorded.launchChecks.map(checkpoint => checkpoint.event).join(',') ===
      'first-launch,email-completed,signed-in-hoje,reload,reloaded-hoje,relaunch-bad,relaunched-hoje-bad,relaunch-valid,relaunched-hoje-valid' &&
      recorded.launchChecks.every(checkpoint => Number.isFinite(checkpoint.recordingSeconds) && checkpoint.recordingSeconds >= 0))
  const palette = { kind: 'palette', busy: false, inputFocused: true, selected: 0, results: ['Habit 1', 'Habit 3', 'Habit 4'] }
  const delivered = { kind: 'palette-key', key: 'ArrowDown', code: 'ArrowDown', trusted: true, targetInput: true,
    documentFocused: true, before: palette }
  const focus = { ...palette, kind: 'focus', selected: 1 }
  events.length = 0
  context.inspectSurfaces = async () => {
    events.push(palette, delivered, focus)
    throw new Error('Timed out waiting for palette result focus')
  }
  let failure
  try { await context.acceptance({ repository: '/fixture', output: '/output' }) } catch (error) { failure = error }
  T('a failed traversal retains its page readiness and key delivery receipts in the report',
    failure?.message.includes('palette result focus') && JSON.stringify(recorded.paletteInput) === JSON.stringify([palette, delivered]))
  T('a failed traversal retains completed palette focus steps for recording review',
    JSON.stringify(recorded.paletteFocus) === JSON.stringify([focus]))
  T('a failed earlier phase never starts the push phase', pushCalls.length === 1)
}

async function servedProbe(expectAuthenticated) {
  const source = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/server.mjs'), 'utf8')
    .replace(/^import .*$/gm, '').replace('export async function startProxy', 'async function startProxy')
  let handler
  let probe
  const context = {
    benchmarkViewport: [900, 600],
    readFile: async () => readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-probe.js'), 'utf8'),
    createServer: (callback) => { handler = callback; return { once() {}, listen(port, host, ready) { ready() } } },
  }
  runInNewContext(`${source}\nglobalThis.startProxy = startProxy`, context)
  const proxy = await context.startProxy({ probePath: 'probe', port: 3400, acceptance: true })
  if (expectAuthenticated !== undefined) proxy.reset({ expectAuthenticated })
  await handler({ url: '/_bench/probe.js' }, { writeHead() {}, end(value) { probe = value } })
  return probe.replace('run().catch', 'globalThis.completion = run().catch')
}

async function sessionProbeCases() {
  for (const [pathname, status, expectAuthenticated, expected] of [
    ['/login', 200, undefined, 'redirect'],
    ['/onboarding', 200, false, 'redirect'],
    ['/login', 200, true, 'redirect'],
    ['/onboarding', 200, true, 'redirect'],
    ['/', 200, true, 'hoje'],
    ['/login', 401, true, 'error'],
    ['/onboarding', 401, true, 'error'],
    ['/', 401, true, 'error'],
    ['/login', 500, false, 'error'],
    ['/login', 500, true, 'error'],
  ]) {
    const requests = []
    const reports = []
    let destination
    let reachedHoje
    const hoje = new Promise((resolve) => { reachedHoje = resolve })
    const browserWindow = { __ORBIT_DESKTOP_VERSION__: '1.0.0' }
    browserWindow.top = browserWindow
    const context = {
      URLSearchParams, window: browserWindow, document: { readyState: 'complete', cookie: '', querySelector: () => ({}) },
      location: { pathname, search: '', assign: (path) => { destination = path } }, setTimeout,
      fetch: async (path, options) => {
        if (path === '/_bench/events') {
          const event = JSON.parse(options.body)
          reports.push(event)
          if (event.kind === 'hoje') reachedHoje()
          return new Response(null, { status: 204 })
        }
        if (path === '/_bench/command') return new Promise(() => {})
        requests.push(path)
        if (path === '/api/auth/session') return new Response(null, { status })
        return new Response('{}')
      },
    }
    runInNewContext(await servedProbe(expectAuthenticated), context)
    await Promise.race([context.completion, hoje])
    const expectedError = status === 401 ? 'Authenticated installed relaunch lost its BFF session' : `BFF session check failed: HTTP ${status}`
    const accepted = expected === 'redirect' ? destination === '/' : reports.some((event) => event.kind === expected && (expected !== 'error' || event.message === expectedError))
    T(`session probe ${pathname} HTTP ${status} expected-auth=${expectAuthenticated} yields ${expected} without signing in`,
      accepted && requests.join(',') === '/api/auth/session' && !reports.some((event) => event.kind === 'email-completed') &&
      (expected === 'redirect' || destination === undefined), JSON.stringify({ requests, reports, destination }))
  }
}

async function compactHojeProbeCases() {
  const reports = []
  const commands = ['astra']
  let now = 0
  let conversation = null
  const composer = {}
  const astraButton = { click: () => { conversation = {} } }
  const browserWindow = { __ORBIT_DESKTOP_VERSION__: '1.0.0' }
  browserWindow.top = browserWindow
  let finished
  const done = new Promise((resolve) => { finished = resolve })
  const context = {
    URLSearchParams, window: browserWindow, Date: { now: () => now },
    setTimeout: (callback, milliseconds) => { now += milliseconds; setImmediate(callback) },
    requestAnimationFrame: (callback) => setImmediate(callback),
    location: { pathname: '/', search: '' },
    document: {
      readyState: 'complete', cookie: '',
      querySelector(selector) {
        if (selector === '[data-habit-id="bench-0000"]') return {}
        if (selector === '[data-astra-button]:not([disabled])') return conversation ? null : astraButton
        if (selector === '[data-shell-conversation]') return conversation
        if (selector === '[data-shell-conversation] [data-composer-input]') return conversation ? composer : null
        return null
      },
    },
    fetch: async (path, options) => {
      if (path === '/_bench/events') {
        const event = JSON.parse(options.body)
        reports.push(event)
        if (event.kind === 'astra' || event.kind === 'error') finished()
        return new Response(null, { status: 204 })
      }
      if (path === '/_bench/command') return commands.length ? new Response(commands.shift()) : new Promise(() => {})
      return new Response(null, { status: 200 })
    },
  }
  runInNewContext(await servedProbe(true), context)
  await done
  T('installed acceptance reaches compact Hoje through the habit row and the Astra button, without a Hoje composer',
    reports.map((event) => event.kind).join(',') === 'hoje,astra', JSON.stringify(reports))
}

function macKeyboardEvents() {
  const source = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-ax.m'), 'utf8')
  const keyboard = source.slice(source.indexOf('static void key('), source.indexOf('int main('))
  const fixture = stage('palette-keyboard.m', `#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
static NSMutableArray *events;
static NSString *command;
static pid_t targetPid;
static CGEventFlags inheritedFlags = kCGEventFlagMaskCommand | kCGEventFlagMaskShift;
@interface PaletteApplication : NSObject
+ (instancetype)runningApplicationWithProcessIdentifier:(pid_t)pid;
- (BOOL)activateWithOptions:(NSApplicationActivationOptions)options;
@end
@implementation PaletteApplication
+ (instancetype)runningApplicationWithProcessIdentifier:(pid_t)pid { return [self new]; }
- (BOOL)activateWithOptions:(NSApplicationActivationOptions)options { return YES; }
@end
static CGEventRef inheritedKeyboardEvent(CGEventSourceRef source, CGKeyCode code, bool pressed) {
    CGEventRef event = CGEventCreateKeyboardEvent(source, code, pressed);
    CGEventSetFlags(event, inheritedFlags);
    return event;
}
static void captureKey(CGEventTapLocation tap, CGEventRef event) {
    inheritedFlags = CGEventGetFlags(event);
    [events addObject:@{@"command": command, @"pid": @(targetPid), @"pressed": @((BOOL)(CGEventGetType(event) == kCGEventKeyDown)),
        @"metaKey": @((BOOL)((inheritedFlags & kCGEventFlagMaskCommand) != 0)),
        @"shiftKey": @((BOOL)((inheritedFlags & kCGEventFlagMaskShift) != 0)),
        @"ctrlKey": @((BOOL)((inheritedFlags & kCGEventFlagMaskControl) != 0)),
        @"altKey": @((BOOL)((inheritedFlags & kCGEventFlagMaskAlternate) != 0))}];
    targetPid = 0;
}
static void captureTargetedKey(pid_t pid, CGEventRef event) {
    targetPid = pid;
    captureKey(kCGHIDEventTap, event);
}
#define NSRunningApplication PaletteApplication
#define CGEventCreateKeyboardEvent inheritedKeyboardEvent
#define CGEventPost captureKey
#define CGEventPostToPid captureTargetedKey
#define usleep(microseconds) ((void)0)
${keyboard}
int main(void) {
    @autoreleasepool {
        events = [NSMutableArray array];
        for (NSString *operation in @[@"palette", @"down", @"down", @"home", @"escape", @"quit"]) {
            command = operation;
            key(1, operation);
        }
        NSData *encoded = [NSJSONSerialization dataWithJSONObject:events options:0 error:NULL];
        fwrite(encoded.bytes, 1, encoded.length, stdout);
        return 0;
    }
}`)
  const executable = join(root, 'palette-keyboard')
  const compilation = spawnSync('clang', ['-fobjc-arc', '-framework', 'AppKit', '-framework', 'ApplicationServices', fixture, '-o', executable], { encoding: 'utf8', timeout: 30000 })
  T('macOS keyboard producer compiles with event posting and application activation intercepted', compilation.status === 0, compilation.stderr)
  const capture = spawnSync(executable, [], { encoding: 'utf8', timeout: 10000 })
  T('macOS keyboard producer captures its real event flags without opening an app', capture.status === 0, capture.stderr)
  const events = JSON.parse(capture.stdout)
  T('macOS keyboard producer targets both key phases at the installed process',
    events.length === 12 && events.every((event) => event.pid === 1), JSON.stringify(events))
  T('macOS keyboard producer sets Command only for shortcuts and clears inherited modifiers on both key phases', events.length === 12 && events.every((event) =>
    event.metaKey === ['palette', 'quit'].includes(event.command) && !event.shiftKey && !event.ctrlKey && !event.altKey), JSON.stringify(events))
  return events
}

async function paletteTimingCases(dom, readState, reports) {
  const source = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-runner.mjs'), 'utf8')
  const traversal = source.slice(source.indexOf('  const focus = []'), source.indexOf('\n  report.paletteFocus = focus') + '\n  report.paletteFocus = focus'.length)
  const input = dom.window.document.querySelector('[cmdk-input]')
  const { flushSync } = await import('react-dom')
  const key = (name) => flushSync(() => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true })))
  for (const timing of ['during-input', 'after-input']) {
    key('Home')
    const start = reports.length
    const events = [{ kind: 'focus', ...readState() }]
    const report = {}
    const captures = []
    const context = { previous: readState(), handle: { child: { pid: 321 } }, report,
      proxy: {
        events: () => [...events, ...reports.slice(start)],
        send: () => { if (timing === 'after-input') events.push({ kind: 'focus', ...readState() }) },
      },
      native: async () => { key('ArrowDown'); if (timing === 'during-input') events.push({ kind: 'focus', ...readState() }) },
      waitFor: async (read, label) => { const value = read(); if (!value) throw new Error(`Timed out waiting for ${label}`); return value },
      dump: async (surface) => { captures.push(surface) },
      assertPaletteFocus: (previous, current) => T(`runner ${timing} validates each real cmdk destination in order`,
        current.selected === previous.selected + 1 && current.inputFocused),
    }
    runInNewContext(`globalThis.traverse = async () => {${traversal}\n}`, context)
    let failure
    try { await context.traverse() } catch (error) { failure = error }
    T(`runner retains focus delivered ${timing} without consuming a stale event or skipping either result`,
      !failure && report.paletteFocus?.map((event) => event.selected).join(',') === '1,2' &&
      captures.join(',') === 'palette-result-1,palette-result-2', failure?.message)
  }
}

// Replays the intermittent macOS failure: the native helper returns for a Down that the page never receives,
// so the probe records no palette-key receipt and the selection never moves.
async function paletteDeliveryCases(dom, readState, reports) {
  const runner = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-runner.mjs'), 'utf8')
  const traversal = runner.slice(runner.indexOf('  const focus = []'), runner.indexOf('\n  report.paletteFocus = focus') + '\n  report.paletteFocus = focus'.length)
  const host = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/host.mjs'), 'utf8')
  const waitForSource = host.slice(host.indexOf('export async function waitFor'), host.indexOf('export async function waitForHttp')).replace('export ', '')
  const input = dom.window.document.querySelector('[cmdk-input]')
  const { flushSync } = await import('react-dom')
  const press = (target, key, init = {}) => flushSync(() => target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, code: key, bubbles: true, ...init })))
  const scenarios = {
    'first-press-lost': { lost: [1] },
    'second-press-lost': { lost: [2] },
    'never-delivered': { lost: [1, 2, 3, 4, 5, 6] },
    'received-without-selection': { target: () => dom.window.document.body },
    'late-duplicate': { duplicate: [1] },
    // WebKit delivers a Down that the macOS input method claimed as ArrowDown with keyCode 229, and cmdk ignores it.
    'claimed-by-input-method': { init: { keyCode: 229 }, claimed: (key) => key.keyCode === 229 },
    'composing-in-input-method': { init: { isComposing: true }, claimed: (key) => key.composing === true },
  }
  for (const [name, scenario] of Object.entries(scenarios)) {
    press(input, 'Home')
    const start = reports.length
    const focusEvents = []
    const posts = []
    const captures = []
    const report = {}
    let pendingFocus = null
    let clock = 0
    const context = { previous: readState(), handle: { child: { pid: 321 } }, report, Date: { now: () => clock },
      // The real proxy forwards every probe report in arrival order; the probe answers focus-N only at that exact index.
      proxy: {
        events: () => {
          if (pendingFocus !== null && readState().selected === pendingFocus) { focusEvents.push({ kind: 'focus', ...readState() }); pendingFocus = null }
          return [...reports.slice(start), ...focusEvents]
        },
        send: (command) => { pendingFocus = Number(command.slice('focus-'.length)) },
      },
      native: async (pid, command) => {
        posts.push(command)
        if (command !== 'down' || scenario.lost?.includes(posts.length)) return
        press(scenario.target?.() ?? input, 'ArrowDown', scenario.init)
        if (scenario.duplicate?.includes(posts.length)) press(input, 'ArrowDown')
      },
      delay: async (milliseconds) => { clock += milliseconds; await new Promise((resolve) => setImmediate(resolve)) },
      dump: async (surface) => { captures.push(surface) },
      assertPaletteFocus: (previous, current) => {
        if (current.selected !== previous.selected + 1) throw new Error(`Palette result order: expected ${previous.selected + 1}, received ${current.selected}`)
      },
    }
    runInNewContext(`${waitForSource}\nglobalThis.traverse = async () => {${traversal}\n}`, context)
    let failure
    try { await context.traverse() } catch (error) { failure = error }
    const order = report.paletteFocus?.map((event) => event.selected).join(',')
    if (name === 'first-press-lost' || name === 'second-press-lost') {
      T(`palette traversal posts a Down again only after the page received no Down (${name}) and still requires each result in order`,
        !failure && order === '1,2' && captures.join(',') === 'palette-result-1,palette-result-2' && posts.length === 3 &&
          report.paletteUndelivered?.length === 1 && report.paletteUndelivered[0].step === scenario.lost[0], failure?.message ?? JSON.stringify({ order, posts, report }))
    }
    if (name === 'never-delivered') {
      T('palette traversal stops after a bounded number of undelivered Down posts and names the missing receipt',
        /no usable native Down/.test(failure?.message) && posts.length === 3 && report.paletteUndelivered?.length === 3, failure?.message)
    }
    if (name === 'received-without-selection') {
      T('a Down the page received but cmdk did not apply is never posted again and fails the focus check',
        failure?.message === 'Timed out waiting for palette result focus' && posts.length === 1, failure?.message)
    }
    if (scenario.claimed) {
      const claimed = report.paletteUndelivered?.flatMap((entry) => entry.keys) ?? []
      T(`a Down the input method claimed (${name}) counts as undelivered and ends in the bounded failure, not the focus timeout`,
        /no usable native Down/.test(failure?.message) && /keyCode 229 or composing/.test(failure?.message) && posts.length === 3 &&
          report.paletteUndelivered?.length === 3 && claimed.length === 3 &&
          claimed.every((key) => key.key === 'ArrowDown' && scenario.claimed(key) && key.targetInput && key.before.selected === 0),
        failure?.message ?? JSON.stringify({ posts, report }))
    }
    if (name === 'late-duplicate') {
      T('a step that receives two Downs fails explicitly instead of skipping a result',
        /received 2 native Down keys/.test(failure?.message) && posts.length === 1, failure?.message)
    }
  }
}

async function pendingPaletteCases({ dom, context, reports, mount, Palette, createElement, flushSync }) {
  flushSync(() => mount.render(createElement(Palette, { key: 'pending', loading: true })))
  reports.length = 0
  const ready = context.screen('palette-ready')
  await Promise.resolve()
  T('busy command rows never publish palette readiness before habits settle', !reports.some(event => event.kind === 'palette'))
  const input = dom.window.document.querySelector('[cmdk-input]')
  flushSync(() => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true })))
  const delivered = reports.find(event => event.kind === 'palette-key')
  T('palette input receipts record the real key, target, document focus and pending selection before cmdk handles Down',
    delivered?.key === 'ArrowDown' && delivered.code === 'ArrowDown' && delivered.trusted === false && delivered.targetInput && delivered.documentFocused &&
      !delivered.metaKey && !delivered.ctrlKey && !delivered.altKey && !delivered.shiftKey &&
      delivered.before.busy && delivered.before.inputFocused && delivered.before.selected === 0 &&
      delivered.before.results.join(',') === 'Create habit,Log a habit,Skip a habit', JSON.stringify(delivered))
  flushSync(() => mount.render(createElement(Palette, { key: 'settled' })))
  await ready
  const settled = reports.filter(event => event.kind === 'palette').at(-1)
  T('palette readiness uses settled habit rows and the selected enabled result from the real cmdk producer',
    settled?.busy === false && settled.inputFocused && settled.selected === 0 && settled.results.join(',') === 'Habit 1,Habit 3,Habit 4', JSON.stringify(settled))
}

async function controlledPaletteCases() {
  const nativeDown = process.platform === 'darwin' ? macKeyboardEvents().filter((event) => event.command === 'down' && event.pressed) : undefined
  const dom = new JSDOM('<div id="palette"></div>', { pretendToBeVisual: true })
  const properties = ['window', 'document', 'HTMLElement', 'Element', 'MutationObserver', 'getComputedStyle', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame']
  const previousGlobals = properties.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  for (const key of properties) {
    const value = key === 'ResizeObserver' ? class { observe() {} unobserve() {} }
      : typeof dom.window[key] === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(key)
        ? dom.window[key].bind(dom.window) : dom.window[key]
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  dom.window.HTMLElement.prototype.scrollIntoView = () => {}
  const { createElement, useState } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { flushSync } = await import('react-dom')
  const { Command } = await import('cmdk')
  const mount = createRoot(dom.window.document.getElementById('palette'))
  function Palette({ loading = false, disabledIndex = 2 }) {
    const [selected, setSelected] = useState(loading ? 'create' : 'habit-1')
    const items = loading
      ? [['create', 'Create habit'], ['log', 'Log a habit'], ['skip', 'Skip a habit']].map(([value, label]) => createElement(Command.Item, { key: value, value }, label))
      : [1, 2, 3, 4].map((index) => createElement(Command.Item, { key: index, value: `habit-${index}`, disabled: index === disabledIndex }, `Habit ${index}`))
    // Mirrors CommandMenu and CommandSearchField: the root label names the input through cmdk's aria-labelledby, never an input aria-label.
    return createElement(Command, { shouldFilter: false, value: selected, onValueChange: setSelected, label: 'Search or run' },
      createElement(Command.Input, { autoFocus: true }),
      createElement(Command.List, { 'aria-busy': loading }, items))
  }
  const reports = []
  const source = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-probe.js'), 'utf8')
    .replace('run().catch', 'globalThis.screen = screen; globalThis.paletteState = paletteState; Promise.resolve().catch')
  const context = { URLSearchParams, window: dom.window, location: dom.window.location, document: dom.window.document, setTimeout,
    fetch: async (url, options) => { reports.push(JSON.parse(options.body)) },
  }
  try {
    flushSync(() => mount.render(createElement(Palette)))
    const input = dom.window.document.querySelector('[cmdk-input]')
    const items = [...dom.window.document.querySelectorAll('[cmdk-item]')]
    T('the installed controlled cmdk producer selects its first item before publishing an active descendant',
      items[0].getAttribute('aria-selected') === 'true' && input.getAttribute('aria-activedescendant') === null)
    runInNewContext(source, context)
    await context.screen('palette-ready')
    let previous = reports.at(-1)
    T('palette readiness reports the controlled initial selection from the real cmdk producer',
      previous.selected === 0 && previous.inputFocused && previous.results.join(',') === 'Habit 1,Habit 3,Habit 4', JSON.stringify(previous))
    for (const expected of [1, 2]) {
      flushSync(() => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { ...nativeDown?.[expected - 1], key: 'ArrowDown', code: 'ArrowDown', bubbles: true })))
      const current = context.paletteState()
      T(`palette probe follows real ArrowDown to enabled result ${expected} without waiting for the wrong index`,
        current.selected === expected && current.selected === previous.selected + 1 && current.inputFocused, JSON.stringify({ previous, current }))
      T('palette probe reports the real controlled listbox and active descendant identifiers',
        current.listId === input.getAttribute('aria-controls') && Boolean(current.listId) &&
        current.activeDescendantId === input.getAttribute('aria-activedescendant') &&
        current.activeDescendantId === items[expected + 1].id, JSON.stringify(current))
      previous = current
    }
    await paletteTimingCases(dom, context.paletteState, reports)
    await paletteDeliveryCases(dom, context.paletteState, reports)
    await pendingPaletteCases({ dom, context, reports, mount, Palette, createElement, flushSync })
    macPaletteFocusCases({ dom, context, mount, Palette, createElement, flushSync })
  } finally {
    flushSync(() => mount.unmount())
    await new Promise((resolve) => setImmediate(resolve))
    dom.window.close()
    for (const [key, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

function macPaletteFocusCases({ dom, context, mount, Palette, createElement, flushSync }) {
  const captured = JSON.parse(readFileSync(join(REPO_ROOT, 'tools/desktop-bench/__fixtures__/ax-palette-focus.json'), 'utf8'))
  const nativeInput = captured.nodes.find((node) => node.role === 'AXComboBox')
  flushSync(() => mount.render(createElement(Palette, { key: 'native-mac', disabledIndex: 0 })))
  const previous = context.paletteState()
  T('palette probe reports the input name cmdk assigns through its label, as the macOS tree exposes it',
    previous.inputName === nativeInput.name, JSON.stringify({ probe: previous.inputName, native: nativeInput.name }))
  const input = dom.window.document.querySelector('[cmdk-input]')
  flushSync(() => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true })))
  const current = context.paletteState()
  let failure
  try { assertPaletteFocus(previous, current, captured) } catch (error) { failure = error }
  T('captured macOS AX focus on the labelled palette input passes with the real cmdk probe state', !failure, failure?.message)
  const renamed = structuredClone(captured)
  renamed.nodes.find((node) => node.role === 'AXComboBox').name = 'Another field'
  rejects('palette rejects macOS focus on an input with another name', () => assertPaletteFocus(previous, current, renamed))
}

function nativePaletteFocusCases() {
  const captured = JSON.parse(readFileSync(join(REPO_ROOT, 'tools/desktop-bench/__fixtures__/uia-palette-focus.json'), 'utf8'))
  const input = captured.nodes.find((node) => node.role === 'ComboBox')
  const listbox = captured.nodes.find((node) => node.role === 'List')
  const options = captured.nodes.filter((node) => node.role === 'ListItem')
  const selected = options.findIndex((node) => node.selected)
  const current = { inputFocused: true, inputName: input.name, selected, results: options.map((node) => node.name),
    listId: listbox.AutomationId, activeDescendantId: options[selected].AutomationId }
  const previous = { ...current, selected: selected - 1 }
  let failure
  try { assertPaletteFocus(previous, current, captured) } catch (error) { failure = error }
  T('captured UIA focus on the selected palette active descendant passes', !failure, failure?.message)
  const inputFocus = structuredClone(captured)
  inputFocus.nodes.forEach((node) => { node.focused = node.role === 'ComboBox' })
  assertPaletteFocus(previous, current, inputFocus)
  T('captured UIA palette also accepts focus on its input', true)
  for (const mutation of ['unrelated', 'wrong-result', 'outside-listbox', 'wrong-listbox', 'wrong-descendant', 'unselected', 'wrong-role']) {
    const tree = structuredClone(captured)
    const state = { ...current }
    const option = tree.nodes.find((node) => node.AutomationId === current.activeDescendantId)
    if (mutation === 'unrelated') {
      option.focused = false
      tree.nodes.push({ ...input, id: '0/unrelated', role: 'Button', focused: true })
    }
    if (mutation === 'wrong-result') {
      option.focused = false
      tree.nodes.find((node) => node.name === current.results[0]).focused = true
    }
    if (mutation === 'outside-listbox') option.id = `${listbox.id}0/0`
    if (mutation === 'wrong-listbox') state.listId = 'another-listbox'
    if (mutation === 'wrong-descendant') state.activeDescendantId = options[0].AutomationId
    if (mutation === 'unselected') option.selected = false
    if (mutation === 'wrong-role') option.role = 'Button'
    rejects(`palette rejects platform focus ${mutation}`, () => assertPaletteFocus(previous, state, tree))
  }
}

async function installedQuitCases() {
  const runnerSource = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-runner.mjs'), 'utf8')
  const adapterSource = runnerSource.slice(runnerSource.indexOf('async function nativeTool'), runnerSource.indexOf('async function hermeticServices'))
  let invocation
  const adapterContext = { windows: true, join, directory: 'bench', execute: async (command, argumentsList) => {
    invocation = { command, argumentsList }
    return JSON.stringify({ sent: 'quit' })
  } }
  runInNewContext(`${adapterSource}\nglobalThis.nativeTool = nativeTool`, adapterContext)
  const adapter = await adapterContext.nativeTool('output')
  await adapter(321, 'quit', 73)
  T('native adapter passes the selected menu command ID and owning process to PowerShell', invocation.command === 'powershell.exe' &&
    invocation.argumentsList.slice(-6).join(',') === '-TargetProcessId,321,-Command,quit,-MenuCommandId,73')
  const source = runnerSource.slice(runnerSource.indexOf('async function quit('), runnerSource.indexOf('export async function acceptance'))
  for (const locale of ['en', 'pt-BR']) {
    const labels = JSON.parse(readFileSync(join(REPO_ROOT, `apps/desktop/locales/${locale}.json`), 'utf8'))
    for (const outcome of ['exit', 'still-running', 'crash', 'missing', 'disabled', 'duplicate', 'parent-disabled', 'invalid-id']) {
      const calls = []
      const item = { id: outcome === 'invalid-id' ? 0xffffffff : 73, text: `${labels.quitWindows}\tCtrl+Q`, enabled: outcome !== 'disabled', children: [] }
      const menu = { items: [{ id: 0, text: labels.file, enabled: outcome !== 'parent-disabled', children: outcome === 'missing' ? [] : [item, ...(outcome === 'duplicate' ? [{ ...item, id: 81 }] : [])] }] }
      let completed = false
      let settled = false
      const child = { pid: 321, exitCode: null }
      const handle = { child, get done() { settled = true; return outcome === 'crash' ? Promise.reject(new Error('exit 1')) : Promise.resolve() } }
      const context = { windows: true, readFile: async (path) => readFileSync(path, 'utf8'), join, directory: join(REPO_ROOT, 'tools/desktop-bench'),
        native: async (pid, command, id) => {
          calls.push({ pid, command, id })
          if (command === 'menu') return menu
          if (command === 'quit' && id === item.id && ['exit', 'crash'].includes(outcome)) child.exitCode = outcome === 'crash' ? 1 : 0
        },
        waitFor: async (read) => { if (!await read()) throw new Error('still running') },
      }
      runInNewContext(`${source}\nglobalThis.quit = quit`, context)
      try { await context.quit(context.native, handle); completed = true } catch { /* The exit verdict is asserted below. */ }
      T(`installed ${locale} quit ${outcome} invokes the unique enabled native Exit command and requires successful process completion`,
        outcome === 'exit' ? completed && settled && calls.length === 2 && calls[1].id === item.id && calls[1].pid === child.pid
          : !completed && (['missing', 'disabled', 'duplicate', 'parent-disabled', 'invalid-id'].includes(outcome) ? calls.length === 1 : outcome !== 'crash' || settled))
    }
  }
  const native = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-uia.ps1'), 'utf8')
  T('Windows quit dispatches a native menu command instead of sending Ctrl+Q to WebView2',
    native.includes('PostMessage') && native.includes('GetMenu') && !native.includes("quit = '^q'"))
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
  await installedQuitCases()
  await installedLaunchCases()
  await pushPhaseCases()
  await sessionProbeCases()
  await compactHojeProbeCases()
  await controlledPaletteCases()
  nativePaletteFocusCases()
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
  const fixture = spawnSync(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'tools/desktop-bench/test-acceptance.ts')], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60000 })
  T('acceptance regressions exercise the email schema, signature verifier and native tree reader', fixture.status === 0, fixture.stderr || fixture.stdout)
  const pushFixture = spawnSync(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'tools/desktop-bench/test-acceptance-push.ts')], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60000 })
  T('push acceptance regressions exercise the reminder producers, mock API, push phase and native notification readers', pushFixture.status === 0, pushFixture.stderr || pushFixture.stdout)
  if (process.platform === 'darwin') {
    const compilation = spawnSync('clang', ['-fsyntax-only', '-fobjc-arc', join(REPO_ROOT, 'tools/desktop-bench/acceptance-ax.m')], { encoding: 'utf8', timeout: 30000 })
    T('macOS accessibility reader compiles against the installed SDK without opening an app', compilation.status === 0, compilation.stderr)
  }
  const probeSource = await servedProbe(false)
  for (const scenario of ['success', 'send-failure', 'token-leak', 'readable-cookie']) {
    const requests = []
    const reports = []
    let destination
    const browserWindow = {}
    browserWindow.top = browserWindow
    const context = {
      URLSearchParams, window: browserWindow, document: { readyState: 'complete', cookie: scenario === 'readable-cookie' ? 'auth_token=readable' : '' },
      location: { pathname: '/login', search: '', assign: (path) => { destination = path } },
      setTimeout, navigator: { platform: 'MacIntel' },
      fetch: async (path, options) => {
        if (path === '/_bench/events') { reports.push(JSON.parse(options.body)); return { ok: true } }
        if (path === '/api/auth/session') return new Response(null, { status: 401 })
        requests.push({ path, body: JSON.parse(options.body) })
        return new Response(JSON.stringify(scenario === 'token-leak' ? { token: 'forbidden' } : {}), { status: scenario === 'send-failure' ? 400 : 200 })
      },
    }
    runInNewContext(probeSource, context)
    await context.completion
    T('installed page probe enters the real email login only after a successful protected code request', scenario === 'success'
      ? destination === '/login?email=desktop-vm%40example.invalid&code=741852' && requests.map((entry) => entry.path).join(',') === '/api/auth/send-code' && !reports.some((entry) => entry.kind === 'email-completed')
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
  T('the native producer step runs the acceptance and push acceptance regressions',
    ['test-acceptance.ts', 'test-acceptance-push.ts'].every((file) => workflow.includes(`node --import tsx tools/desktop-bench/${file}`)))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  configure({ toolsDir: resolve(dirname(fileURLToPath(import.meta.url)), '..'), self: 'desktop-acceptance' })
  await cases()
  process.exitCode = failureCount() === 0 ? 0 : 1
}
