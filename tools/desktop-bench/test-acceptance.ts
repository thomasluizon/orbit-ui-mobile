import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { createHash, generateKeyPairSync, verify } from 'node:crypto'
import { createServer as createHttpServer } from 'node:http'
import { EventEmitter } from 'node:events'
import * as files from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import { Readable } from 'node:stream'
import { after, test } from 'node:test'
import { emailReply, acceptanceEmail, acceptanceCode, createAcceptanceHandler } from './acceptance-mock'
import { artifactName, targets, verifyArtifact, type Manifest } from '../../apps/desktop/scripts/release'
import * as releaseModule from '../../apps/desktop/scripts/release'
import { assertAccessibleTree, assertDoneDelivered, assertExpiredDone, corruptSignature, visibleWindows } from './acceptance-contract.mjs'
import { apnsPayload, apnsProviderToken, apnsRequest, apsEnvironment, exercisePush, isWnsChannel, pushReadiness, repeatReminder,
  sendApns, sendWns, takePushCredentials, wnsAccessToken, wnsPayload } from './acceptance-push.mjs'
import * as acceptanceContract from './acceptance-contract.mjs'

const vector = JSON.parse(readFileSync(new URL('../../apps/desktop/__fixtures__/signer-vector.json', import.meta.url), 'utf8')) as { payload: string; signature: string; publicKey: string; version: string }
const bytes = Buffer.from(vector.payload)
verifyArtifact(bytes, vector.signature, vector.publicKey, vector.version, 'payload')
assert.throws(() => verifyArtifact(bytes, corruptSignature(vector.signature), vector.publicKey, vector.version, 'payload'))
const require = createRequire(import.meta.url)
const repository = fileURLToPath(new URL('../../', import.meta.url))

function producerFunction(source: string, name: string, end: string, context: Record<string, unknown>) {
  const body = source.slice(source.indexOf(`async function ${name}`), source.indexOf(end))
    .replace("await import(pathToFileURL(join(repository, 'apps/desktop/scripts/release.ts')).href)", 'releaseModule')
  runInNewContext(`${body}\nglobalThis.producer = ${name}`, context)
  return (context as typeof context & { producer: (...args: unknown[]) => Promise<unknown> }).producer
}

for (const target of ['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-pc-windows-msvc'] as const) {
  test(`acceptance signs and publishes the canonical package name for ${target}`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'orbit-acceptance-updater-'))
    try {
      const desktop = join(directory, 'apps/desktop')
      const output = join(directory, 'output')
      mkdirSync(output, { recursive: true })
      cpSync(join(repository, 'apps/desktop/scripts'), join(desktop, 'scripts'), { recursive: true })
      const windows = target.includes('windows')
      const bundle = join(desktop, 'src-tauri/target', target, 'release/bundle')
      for (const [folder, name] of windows ? [['nsis', 'fixture.exe']] : [['dmg', 'fixture.dmg'], ['macos', 'fixture.app.tar.gz']]) {
        mkdirSync(join(bundle, folder!), { recursive: true })
        writeFileSync(join(bundle, folder!, name!), vector.payload)
      }
      const execute = async (command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) => {
        if (args[0] === 'native-build-fixture') return ''
        const result = spawnSync(command, args, { cwd: options.cwd, env: options.env, encoding: 'utf8', timeout: 10000 })
        assert.equal(result.status, 0, result.stderr)
        return result.stdout
      }
      const buildSource = readFileSync(new URL('./acceptance-platform.mjs', import.meta.url), 'utf8')
      const build = producerFunction(buildSource, 'buildInstaller', 'export async function install(', {
        ...files, join, require, execute, artifactName, windows, npmCli: () => 'native-build-fixture',
        process: { execPath: process.execPath, env: process.env, arch: target.startsWith('aarch64') ? 'arm64' : 'x64' },
      })
      const shell = await build(directory, output) as { packagePath: string; signature: string; publicKey: string; target: string }
      const name = artifactName('staging', '2.0.0', target)
      assert.equal(basename(shell.packagePath), name)
      verifyArtifact(readFileSync(shell.packagePath), shell.signature, shell.publicKey, '2.0.0', name)
      const runnerSource = readFileSync(new URL('./acceptance-runner.mjs', import.meta.url), 'utf8')
      const updateContext: Record<string, unknown> = {
        ...files, Buffer, URL, basename, createHash, join, pathToFileURL, require, process, releaseModule, execute, structuredClone, corruptSignature,
        desktopOrigin: 'https://app-staging.useorbit.org',
      }
      updateContext.prepareUpdateManifest = producerFunction(runnerSource, 'prepareUpdateManifest', 'async function updateServer(', updateContext)
      const update = producerFunction(runnerSource, 'updateServer', 'async function inspectSurfaces(', updateContext)
      const updates = await update(repository, output, shell, { updateRequests: [] }) as {
        mode: (mode: string) => void; route: (request: unknown, response: unknown) => boolean
      }
      updates.mode('good')
      let status = 0
      let body: string | Buffer = ''
      const response = { writeHead(value: number) { status = value; return this }, end(value: string | Buffer) { body = value } }
      const request = (path: string) => updates.route({ headers: { host: 'github.com' }, url: path }, response)
      request('/thomasluizon/orbit-ui-mobile/releases/download/desktop-staging/latest.json')
      assert.equal(status, 200)
      const manifest = JSON.parse(String(body)) as Manifest
      assert.deepEqual(Object.keys(manifest.platforms).sort(), Object.values(targets).map(descriptor => descriptor.platform).sort())
      assert.equal(new URL(manifest.platforms[targets[target].platform]!.url).pathname.split('/').at(-1), name)
      for (const platform of Object.values(manifest.platforms)) {
        const filename = new URL(platform.url).pathname.split('/').at(-1)!
        request(new URL(platform.url).pathname)
        assert.equal(status, 200)
        verifyArtifact(Buffer.from(body), platform.signature, shell.publicKey, manifest.version, filename)
        assert.equal(platform.sha256, createHash('sha256').update(Buffer.from(body)).digest('hex'))
        assert.equal(platform.size, Buffer.byteLength(body))
      }
      verifyArtifact(readFileSync(join(output, 'latest.json')), readFileSync(join(output, 'latest.json.sig'), 'utf8'), shell.publicKey, manifest.version, 'latest.json')
      await assert.rejects(() => update(repository, output, { ...shell, signature: corruptSignature(shell.signature) }, { updateRequests: [] }), /signature verification failed/)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
}

const sending = { email: acceptanceEmail, language: 'en' }
assert.deepEqual(emailReply('/api/auth/send-code', sending, 'fixture-token'), { status: 200, body: {} })
const login = emailReply('/api/auth/verify-code', { ...sending, code: acceptanceCode }, 'fixture-token')
assert.equal(login.status, 200)
assert.equal('token' in login.body && login.body.token, 'fixture-token')
for (const body of [{ ...sending, code: 'wrong' }, { email: 'foreign@example.invalid', language: 'en', code: acceptanceCode }]) {
  const rejected = emailReply('/api/auth/verify-code', body, 'fixture-token')
  assert.equal(rejected.status, 400)
  assert.equal('token' in rejected.body, false)
}
assert.throws(() => emailReply('/api/auth/verify-code', { email: acceptanceEmail }, 'fixture-token'))

const button = { id: '0/0', role: 'Button', name: 'Today', interactive: true, focused: false, selected: false,
  AutomationId: 'today', ClassName: 'button', FrameworkId: 'Chrome', IsOffscreen: false, IsEnabled: true,
  IsKeyboardFocusable: true, IsControlElement: true, IsContentElement: true, LocalizedControlType: 'button',
  BoundingRectangle: { X: 0, Y: 0, Width: 40, Height: 40 } }
const tree = (controls = [button]) => ({ denied: false, error: null, nodes: [
  { id: '0', role: 'Document', name: 'Today', interactive: false, focused: false, selected: false }, ...controls,
] })

test('named page button passes and unnamed controls retain their complete diagnostic record', () => {
  assert.equal(assertAccessibleTree(tree(), 'win32').controls, 1)
  const unnamed = { ...button, name: '' }
  assert.throws(() => assertAccessibleTree(tree([unnamed]), 'win32'), error =>
    error instanceof Error && error.message.includes(JSON.stringify([unnamed])))
  for (const role of ['', 'Custom', 'AXUnknown']) {
    assert.throws(() => assertAccessibleTree(tree([{ ...button, role }]), 'win32'))
  }
})

const runtimeCapture = JSON.parse(readFileSync(new URL('./__fixtures__/uia-runtime-root.json', import.meta.url), 'utf8')) as { nodes: (typeof button)[] }
const runtimeRoot = runtimeCapture.nodes.at(-1)!
const runtimeTree = () => ({ denied: false, error: null, nodes: [
  ...structuredClone(runtimeCapture.nodes),
  { ...button, id: `${runtimeRoot.id}/0`, role: 'Document', name: 'Today', interactive: false },
  { ...button, id: `${runtimeRoot.id}/0/0` },
] })

test('only the captured WebView2 runtime root is excluded while its page controls stay required', () => {
  assert.equal(assertAccessibleTree(runtimeTree(), 'win32').controls, 1)
  const unnamedPage = runtimeTree()
  unnamedPage.nodes.at(-1)!.name = ''
  assert.throws(() => assertAccessibleTree(unnamedPage, 'win32'), /role and name/)
  const pane = runtimeTree()
  Object.assign(pane.nodes.at(-1)!, { role: 'Pane', ClassName: 'app-region', name: '' })
  assert.throws(() => assertAccessibleTree(pane, 'win32'), /role and name/)
  assert.throws(() => assertAccessibleTree({ ...runtimeTree(), nodes: runtimeCapture.nodes }, 'win32'), /no web content/)
  const emptyPage = runtimeTree()
  emptyPage.nodes.pop()
  assert.throws(() => assertAccessibleTree(emptyPage, 'win32'), /no interactive controls/)
})

test('runtime class and framework must match at every level of the native host ancestry', () => {
  for (let index = 0; index < runtimeCapture.nodes.length; index++) {
    for (const property of ['FrameworkId', 'ClassName', 'role'] as const) {
      const snapshot = runtimeTree()
      snapshot.nodes[index][property] = 'app-control'
      assert.throws(() => assertAccessibleTree(snapshot, 'win32'), /role and name/, `${index}.${property}`)
    }
  }
  const misplaced = runtimeTree()
  misplaced.nodes[runtimeCapture.nodes.length - 1].id = `${runtimeRoot.id}/0/1`
  assert.throws(() => assertAccessibleTree(misplaced, 'win32'), /role and name/)
  const pageImpostor = runtimeTree()
  Object.assign(pageImpostor.nodes.at(-1)!, { ...runtimeRoot, id: `${runtimeRoot.id}/0/0` })
  assert.throws(() => assertAccessibleTree(pageImpostor, 'win32'), /role and name/)
  const mac = runtimeTree()
  mac.nodes[runtimeCapture.nodes.length].role = 'AXWebArea'
  assert.throws(() => assertAccessibleTree(mac, 'darwin'), /role and name/)
})

for (const role of ['Button', 'Pane']) {
  test(`raw-only ${role} is excluded only when both UIA view properties are explicitly false`, () => {
    const raw = { ...button, id: '1', role, name: '', IsControlElement: false, IsContentElement: false }
    assert.equal(assertAccessibleTree(tree([button, raw]), 'win32').controls, 1)
    for (const properties of [
      { IsControlElement: true }, { IsContentElement: true },
      { IsControlElement: undefined }, { IsContentElement: undefined },
    ]) {
      assert.throws(() => assertAccessibleTree(tree([button, { ...raw, ...properties }]), 'win32'))
    }
    assert.throws(() => assertAccessibleTree(tree([{ ...button, name: '', IsEnabled: false }]), 'win32'))
    assert.throws(() => assertAccessibleTree(tree([raw]), 'win32'))
    assert.throws(() => assertAccessibleTree({ ...tree([raw]), nodes: [
      { id: '0', role: 'AXWebArea', interactive: false }, { ...raw, id: '0/0' },
    ] }, 'darwin'))
  })
}

test('UIA offscreen state excludes an infinite rectangle without exempting visible unnamed controls', () => {
  const offscreen = { ...button, id: '0/1', name: '', IsOffscreen: true,
    BoundingRectangle: { X: Infinity, Y: Infinity, Width: -Infinity, Height: NaN } }
  const snapshot = JSON.parse(JSON.stringify(tree([button, offscreen])))
  assert.deepEqual(snapshot.nodes[2].BoundingRectangle, { X: null, Y: null, Width: null, Height: null })
  assert.equal(assertAccessibleTree(snapshot, 'win32').controls, 1)
  for (const IsOffscreen of [false, undefined]) {
    assert.throws(() => assertAccessibleTree(tree([button, { ...offscreen, IsOffscreen }]), 'win32'), /role and name/)
  }
  assert.equal(assertAccessibleTree(tree([button, { ...offscreen, BoundingRectangle: button.BoundingRectangle }]), 'win32').controls, 1)
  assert.throws(() => assertAccessibleTree(tree([offscreen]), 'win32'), /no interactive controls/)
  assert.throws(() => assertAccessibleTree({ ...tree([offscreen]), nodes: [
    { id: '0', role: 'AXWebArea', interactive: false }, offscreen,
  ] }, 'darwin'), /role and name/)
})

test('PowerShell producer writes finite JSON for every rectangle component', { skip: process.platform !== 'win32' }, () => {
  const source = readFileSync(new URL('./acceptance-uia.ps1', import.meta.url), 'utf8')
  const functions = source.slice(source.indexOf('function ConvertTo-FiniteNumber'), source.indexOf('function Read-Element'))
  const appendNode = source.slice(source.indexOf('  $nodes.Add(@{'), source.indexOf('  $walker ='))
  const serialize = source.slice(source.lastIndexOf('@{ denied ='))
  const script = `
$ErrorActionPreference = 'Stop'
${functions}
$nodes = New-Object 'System.Collections.Generic.List[object]'
$interactiveRoles = @('Button')
$current = '${JSON.stringify(button)}' | ConvertFrom-Json
$current | Add-Member -NotePropertyName HasKeyboardFocus -NotePropertyValue $false
$current.IsOffscreen = $true
$current.name = ''
$current.BoundingRectangle.X = [double]::PositiveInfinity
$current.BoundingRectangle.Y = [double]::NegativeInfinity
$current.BoundingRectangle.Width = [double]::NaN
$current.BoundingRectangle.Height = 40
$role = 'Button'; $path = '0/1'; $selection = $false; $failure = $null
${appendNode}
${serialize}`
  const capture = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 10000 })
  assert.equal(capture.status, 0, capture.stderr)
  const snapshot = JSON.parse(capture.stdout)
  assert.deepEqual(snapshot.nodes[0].BoundingRectangle, { X: null, Y: null, Width: null, Height: 40 })
  assert.equal(snapshot.nodes[0].IsOffscreen, true)
})

const probeSource = readFileSync(new URL('./acceptance-probe.js', import.meta.url), 'utf8')
  .replaceAll('__BENCH_EXPECT_AUTHENTICATED__', 'false')
  .replaceAll('__BENCH_REPORT_SIGN_IN__', 'false')
  .replace('run().catch', 'globalThis.completion = run().catch')
const safariStack = 'emailSignIn@https://app-staging.useorbit.org/_bench/probe.js:22:40'

test('email acceptance enters the production login flow instead of verifying and navigating directly to Hoje', async () => {
  const navigations: string[] = []
  const requests: string[] = []
  const browserWindow: { top?: unknown } = {}
  browserWindow.top = browserWindow
  const context = {
    URLSearchParams, window: browserWindow, document: { readyState: 'complete', cookie: '' },
    location: { pathname: '/onboarding', search: '', assign(url: string) { navigations.push(url) } },
    setTimeout,
    fetch: async (url: string) => {
      requests.push(url)
      return new Response('{}', { status: url === '/api/auth/session' ? 401 : 200 })
    },
  }
  runInNewContext(probeSource, context)
  await (context as typeof context & { completion: Promise<void> }).completion
  assert.equal(navigations.length, 1)
  const destination = new URL(navigations[0], 'https://app-staging.useorbit.org')
  assert.equal(destination.pathname, '/login')
  assert.equal(destination.searchParams.get('email'), acceptanceEmail)
  assert.equal(destination.searchParams.get('code'), acceptanceCode)
  assert.ok(!requests.includes('/api/auth/verify-code'))
})

for (const navigation of ['login-poll', 'page-load', 'session-request', 'failure']) {
  test(`the email link retains production completion and failure across ${navigation}`, async () => {
    const failure = navigation === 'failure'
    const requests: string[] = []
    const reports: { kind: string; message?: string }[] = []
    const browserWindow: { top?: unknown } = {}
    browserWindow.top = browserWindow
    const location = { pathname: '/login', search: '?email=desktop-vm%40example.invalid&code=741852',
      assign() { assert.fail('The production login flow owns this navigation') } }
    let finish!: () => void
    const completed = new Promise<void>(resolve => { finish = resolve })
    let resume!: () => void
    let resolveSession: ((response: Response) => void) | undefined
    const context = {
      URLSearchParams, window: browserWindow, location,
      document: { readyState: navigation === 'page-load' ? 'loading' : 'complete', cookie: '', querySelector(selector: string) {
        if (selector === '[role="alert"]') return failure ? { textContent: 'Verification code expired' } : null
        return {}
      } },
      setTimeout(callback: () => void) { resume = callback },
      fetch: async (url: string, options?: { body: string }) => {
        requests.push(url)
        if (url === '/_bench/events') {
          const event = JSON.parse(options!.body) as { kind: string }
          reports.push(event)
          if (event.kind === 'hoje' || event.kind === 'error') finish()
          return new Response(null, { status: 204 })
        }
        if (url === '/_bench/command') return new Promise<Response>(() => {})
        assert.equal(url, '/api/auth/session')
        if (navigation === 'session-request' && !resolveSession) return new Promise<Response>(resolve => { resolveSession = resolve })
        return new Response(null, { status: location.pathname === '/login' ? 401 : 200 })
      },
    }
    runInNewContext(probeSource, context)
    if (!failure) {
      for (let index = 0; index < 10 && !resume && !resolveSession; index++) await Promise.resolve()
      assert.ok(resume || resolveSession)
      assert.deepEqual(reports, [])
      location.pathname = '/'
      context.document.readyState = 'complete'
      if (resolveSession) resolveSession(new Response(null, { status: 200 }))
      else resume()
    }
    await completed
    assert.deepEqual(reports.map(event => event.kind), failure ? ['error'] : ['email-completed', 'hoje'])
    if (failure) assert.ok(reports[0].message?.includes('Verification code expired'))
    assert.ok(!requests.some(url => /send-code|verify-code/.test(url)))
  })
}

for (const path of ['send-code']) {
  test(`probe preserves ${path} status and response body separately from a frame-only Safari stack`, async () => {
    const reports: { kind: string; message: string; stack: string }[] = []
    const browserWindow: { top?: unknown } = {}
    browserWindow.top = browserWindow
    const failureBody = JSON.stringify({ error: 'Hermetic request refused', errorCode: 'HERMETIC_FAILURE' })
    const context = {
      Error: class extends Error { constructor(message: string) { super(message); this.stack = safariStack } },
      URLSearchParams, window: browserWindow, document: { readyState: 'complete', cookie: '' },
      location: { pathname: '/login', search: '', assign() { assert.fail('Failed email sign-in must not navigate') } },
      setTimeout,
      fetch: async (url: string, options: { body: string }) => {
        if (url === '/_bench/events') { reports.push(JSON.parse(options.body)); return new Response(null, { status: 204 }) }
        if (url === '/api/auth/session') return new Response(null, { status: 401 })
        return new Response(url === `/api/auth/${path}` ? failureBody : '{}', { status: url === `/api/auth/${path}` ? 403 : 200 })
      },
    }
    runInNewContext(probeSource, context)
    await (context as typeof context & { completion: Promise<void> }).completion
    assert.equal(reports.length, 1)
    assert.equal(reports[0].kind, 'error')
    assert.ok(reports[0].message.includes(`/api/auth/${path}`), reports[0].message)
    assert.ok(reports[0].message.includes('403'), reports[0].message)
    assert.ok(reports[0].message.includes(failureBody), reports[0].message)
    assert.equal(reports[0].stack, safariStack)
  })
}

test('proxy retains both the probe message and Safari stack when reporting acceptance failure', async () => {
  const source = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace('export async function startProxy', 'async function startProxy')
  let handle: (incoming: unknown, response: unknown) => Promise<void> = async () => { assert.fail('Proxy handler not registered') }
  const context = { Buffer, benchmarkViewport: [900, 600], readFile: async () => '',
    createServer: (callback: typeof handle) => { handle = callback; return { once() {}, listen(_port: number, _host: string, ready: () => void) { ready() } } },
  }
  runInNewContext(`${source}\nglobalThis.startProxy = startProxy`, context)
  const startProxy = (context as typeof context & { startProxy: (options: unknown) => Promise<{ read: (kind: string) => unknown }> }).startProxy
  const proxy = await startProxy({ probePath: 'probe', port: 3400, upstreamPort: 3401 })
  const message = 'Email /api/auth/send-code failed: HTTP 400; response {"error":"Invalid request"}'
  const incoming = Object.assign(Readable.from([Buffer.from(JSON.stringify({ kind: 'error', message, stack: safariStack }))]), { url: '/_bench/events' })
  await handle(incoming, { writeHead() { return { end() {} } } })
  assert.throws(() => proxy.read('email-completed'), (error: Error) => error.message.includes(message) && error.message.includes(safariStack))
})

test('browser chrome cannot substitute for interactive page content', () => {
  assert.throws(() => assertAccessibleTree(tree([{ ...button, id: '1' }]), 'win32'), /web content.*interactive controls/)
})

test('a failed capture remains a failure even when its partial tree has valid controls', () => {
  assert.throws(() => assertAccessibleTree({ ...tree(), error: 'AXButton at 0/0 became invalid twice' }, 'darwin'), /became invalid twice/)
})

test('surface inspection writes the entire capture before validating or failing the native command', async () => {
  const runner = readFileSync(new URL('./acceptance-runner.mjs', import.meta.url), 'utf8')
  const inspect = runner.slice(runner.indexOf('async function inspectSurfaces'), runner.indexOf('function installedLaunch'))
  for (const failedCommand of [false, true]) {
    const snapshot = tree([{ ...button, name: '' }])
    const records: { path: string; value: unknown }[] = []
    const context = { Error, join, process: { platform: 'win32' }, ...acceptanceContract, waitFor: async (read: () => Promise<unknown>) => read(),
      record: async (path: string, value: unknown) => { records.push({ path, value }) },
      native: async () => { if (failedCommand) throw new Error('Native reader exited'); return snapshot },
    }
    runInNewContext(`${inspect}\nglobalThis.inspect = inspectSurfaces`, context)
    const operation = (context as typeof context & { inspect: (...args: unknown[]) => Promise<void> }).inspect
    await assert.rejects(() => operation({}, context.native, { child: { pid: 1 } }, 'output', { accessibility: {} }),
      failedCommand ? /Native reader exited/ : /Interactive controls require/)
    assert.equal(records.length, 1)
    assert.equal(records[0].path, join('output', 'trees', 'hoje.json'))
    assert.equal(failedCommand ? (records[0].value as { error: string }).error : records[0].value,
      failedCommand ? 'Native reader exited' : snapshot)
  }
})

function inspectionContext(platform: string) {
  const runner = readFileSync(new URL('./acceptance-runner.mjs', import.meta.url), 'utf8')
  const inspect = runner.slice(runner.indexOf('async function inspectSurfaces'), runner.indexOf('function installedLaunch'))
  const host = readFileSync(new URL('./host.mjs', import.meta.url), 'utf8')
  const polling = host.slice(host.indexOf('export async function waitFor('), host.indexOf('export async function waitForHttp'))
    .replace('export async function', 'async function')
  let elapsed = 0
  const records: { path: string; value: unknown }[] = []
  const context = { Error, join, ...acceptanceContract, process: { platform },
    Date: { now: () => elapsed }, delay: async (milliseconds: number) => { elapsed += milliseconds },
    record: async (path: string, value: unknown) => { records.push({ path, value }) },
  }
  runInNewContext(`${polling}\n${inspect}\nglobalThis.inspect = inspectSurfaces`, context)
  return { records, elapsed: () => elapsed,
    inspect: (context as typeof context & { inspect: (...args: unknown[]) => Promise<void> }).inspect }
}

test('surface inspection primes and polls the native web content without accepting browser chrome', async () => {
  for (const platform of ['win32', 'darwin']) {
    const first = platform === 'win32' ? runtimeTree() : { denied: false, error: null, nodes: [
      { ...button, id: '0', role: 'AXApplication', interactive: false },
      { ...button, id: '0/0', role: 'AXGroup', interactive: false },
    ] }
    if (platform === 'win32') first.nodes.pop()
    const ready = platform === 'win32' ? runtimeTree() : { ...tree(), nodes: [
      { ...button, id: '0', role: 'AXWebArea', interactive: false },
      { ...button, id: '0/0', role: 'AXButton' },
    ] }
    const context = inspectionContext(platform)
    let calls = 0
    const report = { accessibility: {} as Record<string, unknown> }
    const native = async () => ++calls < 3 ? first : ready
    const proxy = { send: (command: string) => { assert.equal(command, 'astra'); throw new Error('Hoje inspected') } }
    await assert.rejects(() => context.inspect(proxy, native, { child: { pid: 1 } }, 'output', report), /Hoje inspected/)
    assert.equal(calls, 3)
    assert.equal(context.elapsed(), 100)
    assert.equal(context.records.length, 3)
    assert.equal(context.records[0].value, first)
    assert.equal(context.records.at(-1)?.value, ready)
    assert.deepEqual(report.accessibility.hoje, { controls: 1 })
  }
})

test('native web readiness is bounded and keeps the final incomplete tree for diagnosis', async () => {
  for (const snapshot of [
    { denied: false, error: null, nodes: [{ ...button, id: '0', role: 'AXGroup', interactive: false }] },
    { ...tree(), nodes: [{ ...button, id: '0', role: 'AXWebArea', interactive: false }] },
  ]) {
    const context = inspectionContext('darwin')
    const report = { accessibility: {} }
    await assert.rejects(() => context.inspect({}, async () => snapshot, { child: { pid: 1 } }, 'output', report), /Timed out waiting for hoje native web content/)
    assert.equal(context.elapsed(), 10000)
    assert.equal(context.records.length, 200)
    assert.equal(context.records.at(-1)?.value, snapshot)
    assert.deepEqual(report.accessibility, {})
  }
})

test('native capture failures and unnamed page controls fail immediately during readiness polling', async () => {
  for (const snapshot of [
    { ...tree(), error: 'AX read failed' },
    tree([{ ...button, name: '' }]),
  ]) {
    const context = inspectionContext('win32')
    await assert.rejects(() => context.inspect({}, async () => snapshot, { child: { pid: 1 } }, 'output', { accessibility: {} }),
      snapshot.error ? /AX read failed/ : /role and name/)
    assert.equal(context.elapsed(), 0)
    assert.equal(context.records.length, 1)
    assert.equal(context.records[0].value, snapshot)
  }
})

test('surface inspection dismisses Astra and waits for its modal focus owner before the native palette shortcut', async () => {
  const shortcuts = readFileSync(new URL('../../apps/web/hooks/use-keyboard-shortcuts.ts', import.meta.url), 'utf8')
  const keydown = shortcuts.slice(shortcuts.indexOf('    function onKeyDown('), shortcuts.indexOf("    document.addEventListener('keydown'"))
    .replace('event: KeyboardEvent', 'event')
  for (const platform of ['win32', 'darwin']) {
    for (const denied of platform === 'darwin' ? [false, true] : [false]) {
      const context = inspectionContext(platform)
      const commands: string[] = []
      let modal = false
      let closing = false
      let dismissalReads = 0
      let palette = false
      let selected = 0
      const keyboard = { paletteOpen: false, hasOpenModalFocusOwner: () => modal, togglePalette: () => { palette = !palette } }
      runInNewContext(`${keydown}\nglobalThis.keydown = onKeyDown`, keyboard)
      const openPalette = () => (keyboard as typeof keyboard & { keydown: (event: unknown) => void }).keydown({ ctrlKey: true, key: 'k', preventDefault() {} })
      const results = ['Today', 'Astra', 'All']
      const state = () => ({ inputFocused: true, inputName: 'Search commands', results, selected })
      const events: { kind: string; key?: string }[] = []
      const native = async (_pid: number, command: string) => {
        commands.push(command)
        if (command === 'escape') { closing = modal; palette = false }
        if (command === 'palette') openPalette()
        // The page probe reports every keydown the palette input receives; the runner waits for it before the focus check.
        if (command === 'down' && palette) { selected++; events.push({ kind: 'palette-key', key: 'ArrowDown' }) }
        if (command !== 'dump') return { sent: command }
        if (denied) return { denied: true, error: 'AX API disabled', nodes: [] }
        return { denied: false, error: null, nodes: [
          { ...button, id: '0', role: platform === 'win32' ? 'Document' : 'AXWebArea', interactive: false },
          { ...button, id: '0/0', role: platform === 'win32' ? 'Edit' : 'AXTextField', name: 'Search commands', focused: palette },
          ...results.map((name, index) => ({ ...button, id: `0/${index + 1}`, name,
            role: platform === 'win32' ? 'ListItem' : 'AXButton', selected: palette && selected === index })),
        ] }
      }
      const proxy = {
        send(command: string) {
          commands.push(command)
          if (command === 'astra') modal = true
          if (command === 'astra-close') closing = true
          if (command === 'palette') openPalette()
          if (command.startsWith('focus-')) events.push({ kind: 'focus', ...state() })
        },
        read(surface: string) {
          if (surface === 'astra') return modal && {}
          if (surface === 'astra-closed' && closing && ++dismissalReads === 3) modal = false
          if (surface === 'astra-closed') return !modal && {}
          if (surface === 'palette') return palette && state()
          return false
        },
        events: () => events,
      }
      const report = { accessibility: {}, paletteFocus: undefined as unknown }
      await context.inspect(proxy, native, { child: { pid: 1 } }, 'output', report)
      assert.equal(dismissalReads, 3)
      assert.ok(commands.indexOf(denied ? 'astra-close' : 'escape') < commands.indexOf(denied ? 'palette' : 'palette-ready'))
      if (denied) assert.equal((report.paletteFocus as { skipped: string }).skipped, 'AX API disabled')
      else assert.equal((report.paletteFocus as unknown[]).length, 2)
    }
  }
})

test('the page probe waits for Astra removal before acknowledging dismissal', async () => {
  const until = probeSource.slice(probeSource.indexOf('  async function until('), probeSource.indexOf('  async function emailSignIn('))
  const screen = probeSource.slice(probeSource.indexOf('  async function screen('), probeSource.indexOf('  function paletteState('))
  for (const command of ['astra-closed', 'astra-close']) {
    let reads = 0
    let frames = 0
    const keys: string[] = []
    const reports: string[] = []
    const context = { Date, Error, delay: async () => {},
      document: {
        querySelector(selector: string) {
          assert.equal(selector, '[data-shell-conversation]')
          return ++reads < 3 ? {} : null
        },
        dispatchEvent(event: { key: string }) { keys.push(event.key) },
      },
      KeyboardEvent: class { key: string; constructor(_type: string, options: { key: string }) { this.key = options.key } },
      requestAnimationFrame(callback: () => void) { frames++; callback() },
      report: async (surface: string) => { reports.push(surface) },
    }
    runInNewContext(`${until}\n${screen}\nglobalThis.screen = screen`, context)
    await (context as typeof context & { screen: (surface: string) => Promise<void> }).screen(command)
    assert.equal(reads, 3)
    assert.equal(frames, 2)
    assert.deepEqual(keys, command === 'astra-close' ? ['Escape'] : [])
    assert.deepEqual(reports, ['astra-closed'])
  }
})

test('acceptance cleanup records failures without replacing the original acceptance error', async () => {
  const runner = readFileSync(new URL('./acceptance-runner.mjs', import.meta.url), 'utf8')
  const finalization = runner.slice(runner.indexOf('  } catch (error) {\n    report.error = error.stack'), runner.lastIndexOf('\n}'))
  for (const primary of [undefined, new Error('Native acceptance failed')]) {
    for (const cleanup of [undefined, new Error('Recording failed')]) {
      const records: { path: string; value: unknown }[] = []
      const report = { passed: !primary, cleanupErrors: undefined as string[] | undefined }
      const context = { Error, join, primary, report, output: 'output', proxy: undefined, finishRecording: undefined,
        isolation: undefined, builtWeb: false, stopAll: async () => { if (cleanup) throw cleanup },
        record: async (path: string, value: unknown) => { records.push({ path, value }) },
      }
      runInNewContext(`globalThis.finish = async () => { try { if (primary) throw primary\n${finalization}\n}`, context)
      const finish = (context as typeof context & { finish: () => Promise<void> }).finish
      if (primary || cleanup) await assert.rejects(finish, primary ? error => error === primary : /Acceptance cleanup failed:.*Recording failed/)
      else await finish()
      assert.equal(records.length, 1)
      assert.equal(records[0].path, join('output', 'report.json'))
      assert.equal(records[0].value, report)
      assert.equal(report.passed, !primary && !cleanup)
      assert.equal(report.cleanupErrors?.length ?? 0, cleanup ? 1 : 0)
    }
  }
})

const nativeFixture = `#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
static int applicationReads = 0, invalidReads = 0;
static NSString *scenario;
static AXUIElementRef fixtureApplication(pid_t pid) {
    applicationReads++;
    NSMutableDictionary *button = [@{@"AXRole": @"AXButton", @"AXTitle": @"Today", @"AXIdentifier": @"today",
        @"AXDOMIdentifier": @"today-button", @"AXDOMClassList": @[@"action"], @"AXSubrole": @"AXTestButton",
        @"AXRoleDescription": @"button", @"AXHidden": @NO} mutableCopy];
    if ([scenario isEqual:@"unnamed-button"] || [scenario isEqual:@"description-button"] || [scenario isEqual:@"web-system-button"]) [button removeObjectForKey:@"AXTitle"];
    if ([scenario isEqual:@"description-button"]) button[@"AXDescription"] = @"Search habits";
    if ([scenario isEqual:@"unnamed-button"]) button[@"AXEnabled"] = @NO;
    if ([scenario isEqual:@"web-system-button"]) { button[@"AXSubrole"] = @"AXCloseButton"; button[@"AXRoleDescription"] = @"close button"; }
    NSMutableDictionary *web = [@{@"AXRole": @"AXWebArea", @"AXChildren": @[button]} mutableCopy];
    if ([scenario hasPrefix:@"alert-"]) {
        NSData *capture = [NSData dataWithContentsOfFile:@ANNOUNCER_FIXTURE];
        NSMutableDictionary *alert = [[NSJSONSerialization JSONObjectWithData:capture options:0 error:NULL] mutableCopy];
        alert[@"AXRole"] = alert[@"role"];
        alert[@"AXFocused"] = alert[@"focused"];
        alert[@"acceptsFocus"] = alert[@"focusable"];
        if ([scenario isEqual:@"alert-focusable"]) alert[@"acceptsFocus"] = @YES;
        if ([scenario isEqual:@"alert-focused"]) alert[@"AXFocused"] = @YES;
        if ([scenario isEqual:@"alert-named"]) alert[@"AXDescription"] = @"Today";
        if ([scenario isEqual:@"alert-children"]) alert[@"AXChildren"] = @[@{@"AXRole": @"AXStaticText", @"AXTitle": @"Today"}];
        if ([scenario isEqual:@"alert-controls"]) alert[@"AXChildren"] = @[@{@"AXRole": @"AXButton", @"AXTitle": @"Dismiss"}];
        if ([scenario isEqual:@"alert-unnamed-control"]) alert[@"AXChildren"] = @[@{@"AXRole": @"AXButton"}];
        if ([scenario isEqual:@"alert-button"]) alert[@"AXRole"] = @"AXButton";
        web[@"AXChildren"] = @[button, alert];
    }
    if ([scenario hasPrefix:@"empty-"]) {
        NSMutableDictionary *group = [@{@"AXRole": @"AXGroup", @"AXSubrole": @"AXEmptyGroup", @"AXRoleDescription": @"alert",
            @"AXDOMIdentifier": @"__next-route-announcer__", @"actions": @[@"AXPress", @"AXShowMenu", @"AXScrollToVisible"]} mutableCopy];
        if ([scenario isEqual:@"empty-focusable"]) group[@"acceptsFocus"] = @YES;
        if ([scenario isEqual:@"empty-focused"]) group[@"AXFocused"] = @YES;
        if ([scenario isEqual:@"empty-named"]) group[@"AXDescription"] = @"Action";
        if ([scenario isEqual:@"empty-children"]) group[@"AXChildren"] = @[@{@"AXRole": @"AXStaticText"}];
        if ([scenario isEqual:@"empty-generic"]) [group removeObjectForKey:@"AXSubrole"];
        web[@"AXChildren"] = @[button, group];
    }
    if ([scenario hasPrefix:@"system-"]) {
        NSMutableArray *children = [NSMutableArray arrayWithObject:web];
        for (NSString *subrole in @[@"AXCloseButton", @"AXFullScreenButton", @"AXMinimizeButton", @"AXZoomButton"]) {
            [children addObject:@{@"AXRole": @"AXButton", @"AXSubrole": subrole,
                @"AXRoleDescription": NSAccessibilityRoleDescription(@"AXButton", subrole)}];
        }
        if ([scenario isEqual:@"system-generic"]) [children addObject:@{@"AXRole": @"AXButton", @"AXRoleDescription": @"button"}];
        if ([scenario isEqual:@"system-no-description"]) [children addObject:@{@"AXRole": @"AXButton", @"AXSubrole": @"AXCloseButton"}];
        NSDictionary *extra = @{@"AXRole": @"AXMenuBarItem", @"AXSubrole": @"AXMenuExtra", @"AXRoleDescription": @"status menu", @"actions": @[@"AXPress"]};
        return (AXUIElementRef)CFBridgingRetain(@{@"AXRole": @"AXApplication", @"AXChildren": @[
            @{@"AXRole": @"AXWindow", @"AXChildren": children}, @{@"AXRole": @"AXMenuBar", @"AXChildren": @[extra]}]});
    }
    if ([scenario isEqual:@"separator"]) {
        return (AXUIElementRef)CFBridgingRetain(@{@"AXRole": @"AXApplication", @"AXChildren": @[web, [NSMenuItem separatorItem]]});
    }
    if ([scenario isEqual:@"unnamed-menu"]) web[@"AXChildren"] = @[button, @{@"AXRole": @"AXMenuItem", @"AXEnabled": @YES, @"actions": @[@"AXPress"]}];
    if ([scenario isEqual:@"disabled-unnamed-menu"]) web[@"AXChildren"] = @[button, @{@"AXRole": @"AXMenuItem", @"AXEnabled": @NO, @"actions": @[@"AXPress"]}];
    if ([scenario isEqual:@"no-web"]) {
        return (AXUIElementRef)CFBridgingRetain(@{@"AXRole": @"AXApplication", @"AXChildren": @[@{@"AXRole": @"AXGroup"}]});
    }
    if ([scenario hasPrefix:@"scroll-"]) {
        NSMutableDictionary *scroll = [@{@"AXRole": @"AXScrollArea"} mutableCopy];
        if (![scenario isEqual:@"scroll-contents"]) scroll[@"AXChildren"] = @[web];
        if (![scenario isEqual:@"scroll-children"]) scroll[@"AXContents"] = @[web];
        return (AXUIElementRef)CFBridgingRetain(@{@"AXRole": @"AXApplication", @"AXChildren": @[scroll]});
    }
    return (AXUIElementRef)CFBridgingRetain(@{@"AXRole": @"AXApplication", @"AXChildren": @[web]});
}
static BOOL shouldInvalidate(void) {
    return invalidReads++ < ([scenario isEqual:@"twice"] ? 2 : 1);
}
static AXError fixtureAttribute(AXUIElementRef element, CFStringRef key, CFTypeRef *value) {
    id object = (__bridge id)element;
    NSDictionary *attributes = [object isKindOfClass:[NSDictionary class]] ? object : nil;
    if ([scenario isEqual:@"attribute-once"] && [attributes[@"AXRole"] isEqual:@"AXButton"] &&
        CFEqual(key, CFSTR("AXHidden")) && shouldInvalidate()) return kAXErrorInvalidUIElement;
    if ([scenario isEqual:@"root-once"] && [attributes[@"AXRole"] isEqual:@"AXApplication"] &&
        CFEqual(key, kAXChildrenAttribute) && shouldInvalidate()) return kAXErrorInvalidUIElement;
    id result = attributes ? attributes[(__bridge NSString *)key] : [object accessibilityAttributeValue:(__bridge NSString *)key];
    if (!result) return kAXErrorAttributeUnsupported;
    *value = CFBridgingRetain(result);
    return kAXErrorSuccess;
}
static AXError fixtureActions(AXUIElementRef element, CFArrayRef *names) {
    id object = (__bridge id)element;
    if (![object isKindOfClass:[NSDictionary class]]) { *names = (CFArrayRef)CFBridgingRetain([object accessibilityActionNames]); return kAXErrorSuccess; }
    NSDictionary *attributes = object;
    if ([attributes[@"AXRole"] isEqual:@"AXButton"]) {
        if ([scenario isEqual:@"other"]) return kAXErrorCannotComplete;
        if (([scenario isEqual:@"once"] || [scenario isEqual:@"twice"]) && shouldInvalidate()) return kAXErrorInvalidUIElement;
        *names = (CFArrayRef)CFBridgingRetain(@[@"AXPress"]);
    } else *names = (CFArrayRef)CFBridgingRetain(attributes[@"actions"] ?: @[]);
    return kAXErrorSuccess;
}
static AXError fixtureSettable(AXUIElementRef element, CFStringRef key, Boolean *settable) {
    id object = (__bridge id)element;
    if ([scenario isEqual:@"focusable-once"] && [object[@"AXRole"] isEqual:@"AXButton"] && shouldInvalidate()) return kAXErrorInvalidUIElement;
    *settable = [object isKindOfClass:[NSDictionary class]] ? [object[@"acceptsFocus"] boolValue] : [object accessibilityIsAttributeSettable:(__bridge NSString *)key];
    return kAXErrorSuccess;
}
#define AXUIElementCreateApplication fixtureApplication
#define AXUIElementCopyAttributeValue fixtureAttribute
#define AXUIElementCopyActionNames fixtureActions
#define AXUIElementIsAttributeSettable fixtureSettable
#define main acceptanceMain
#include NATIVE_SOURCE
#undef main
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        scenario = @(argv[1]);
        const char *arguments[] = {"acceptance", "1", "dump"};
        int status = acceptanceMain(3, arguments);
        fprintf(stderr, "applicationReads=%d", applicationReads);
        return status;
    }
}
`

if (process.platform === 'darwin') {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-acceptance-ax-'))
  after(() => rmSync(directory, { recursive: true, force: true }))
  const source = join(directory, 'fixture.m')
  const executable = join(directory, 'fixture')
  writeFileSync(source, nativeFixture
    .replace('ANNOUNCER_FIXTURE', JSON.stringify(fileURLToPath(new URL('./__fixtures__/ax-route-announcer.json', import.meta.url))))
    .replace('NATIVE_SOURCE', JSON.stringify(fileURLToPath(new URL('./acceptance-ax.m', import.meta.url)))))
  const compilation = spawnSync('clang', ['-fobjc-arc', '-framework', 'AppKit', '-framework', 'ApplicationServices', source, '-o', executable], { encoding: 'utf8', timeout: 30000 })
  assert.equal(compilation.status, 0, compilation.stderr)
  for (const scenario of ['alert-live', 'alert-named', 'alert-children', 'alert-controls', 'empty-live', 'empty-named', 'description-button', 'system-controls', 'separator']) {
    test(`native AX semantics accept ${scenario} without exempting unnamed app controls`, () => {
      const capture = spawnSync(executable, [scenario], { encoding: 'utf8', timeout: 10000 })
      assert.equal(capture.status, 0, capture.stderr)
      const snapshot = JSON.parse(capture.stdout)
      assert.equal(snapshot.error, null, JSON.stringify(snapshot))
      assert.equal(assertAccessibleTree(snapshot, 'darwin').controls,
        scenario === 'system-controls' ? 6 : ['empty-named', 'alert-controls'].includes(scenario) ? 2 : 1)
      if (scenario === 'empty-live' || scenario.startsWith('alert-')) {
        const announcer = snapshot.nodes.find(node => node.AXDOMIdentifier === '__next-route-announcer__')
        assert.equal(Boolean(announcer.interactive), false)
      }
      if (scenario === 'description-button') assert.equal(snapshot.nodes.find(node => node.role === 'AXButton').name, 'Search habits')
      if (scenario === 'system-controls') {
        for (const node of snapshot.nodes.filter(node => node.AXSubrole && node.AXSubrole !== 'AXTestButton')) {
          assert.equal(Boolean(node.interactive), true)
          assert.equal(node.name, node.AXRoleDescription)
        }
      }
      if (scenario === 'separator') {
        const separator = snapshot.nodes.find(node => node.role === 'AXMenuItem')
        assert.equal(separator.AXEnabled, false)
        assert.equal(separator.AXTitle, '')
        assert.equal(separator.focusable, false)
        assert.equal(separator.interactive, false)
        assert.ok(separator.actions.includes('AXPress'))
      }
    })
  }
  for (const scenario of ['alert-focusable', 'alert-focused', 'alert-button', 'alert-unnamed-control', 'unnamed-button', 'web-system-button', 'empty-focusable', 'empty-focused', 'empty-children', 'empty-generic', 'system-generic', 'system-no-description', 'unnamed-menu', 'disabled-unnamed-menu']) {
    test(`native AX semantics keep ${scenario} failing role and name acceptance`, () => {
      const capture = spawnSync(executable, [scenario], { encoding: 'utf8', timeout: 10000 })
      assert.equal(capture.status, 0, capture.stderr)
      const snapshot = JSON.parse(capture.stdout)
      assert.equal(snapshot.error, null)
      assert.throws(() => assertAccessibleTree(snapshot, 'darwin'), /role and name/)
      if (scenario === 'disabled-unnamed-menu') {
        const menu = snapshot.nodes.find(node => node.role === 'AXMenuItem')
        assert.equal(menu.AXEnabled, false)
        assert.equal(menu.name, '')
        assert.equal(menu.focused, false)
        assert.equal(menu.focusable, false)
        assert.equal(menu.interactive, true)
      }
    })
  }
  for (const scenario of ['scroll-children', 'scroll-contents', 'scroll-duplicate']) {
    test(`native AX traversal follows ${scenario} to the web area exactly once`, () => {
      const capture = spawnSync(executable, [scenario], { encoding: 'utf8', timeout: 10000 })
      assert.equal(capture.status, 0, capture.stderr)
      const snapshot = JSON.parse(capture.stdout)
      assert.equal(snapshot.error, null)
      assert.equal(assertAccessibleTree(snapshot, 'darwin').controls, 1)
      assert.equal(snapshot.nodes.filter(node => node.role === 'AXWebArea').length, 1)
      assert.equal(snapshot.nodes.filter(node => node.role === 'AXButton').length, 1)
      const document = snapshot.nodes.find(node => node.role === 'AXWebArea')
      const control = snapshot.nodes.find(node => node.role === 'AXButton')
      assert.ok(control.id.startsWith(`${document.id}/`))
    })
  }
  test('native AX reader preserves an uninitialized WKWebView group until a later capture exposes its remote child', async () => {
    const context = inspectionContext('darwin')
    let calls = 0
    const native = async () => {
      const capture = spawnSync(executable, [++calls === 1 ? 'no-web' : 'scroll-contents'], { encoding: 'utf8', timeout: 10000 })
      assert.equal(capture.status, 0, capture.stderr)
      return JSON.parse(capture.stdout)
    }
    const proxy = { send: () => { throw new Error('Hoje inspected') } }
    const report = { accessibility: {} as Record<string, unknown> }
    await assert.rejects(() => context.inspect(proxy, native, { child: { pid: 1 } }, 'output', report), /Hoje inspected/)
    assert.equal(calls, 2)
    assert.deepEqual(report.accessibility.hoje, { controls: 1 })
    assert.equal(context.records.length, 2)
  })
  for (const scenario of ['success', 'once', 'twice', 'other', 'attribute-once', 'root-once', 'focusable-once']) {
    test(`native AX traversal ${scenario} preserves the tree and retries only invalid elements once`, () => {
      const capture = spawnSync(executable, [scenario], { encoding: 'utf8', timeout: 10000 })
      assert.equal(capture.status, 0, capture.stderr)
      const snapshot = JSON.parse(capture.stdout)
      const failed = scenario === 'twice' || scenario === 'other'
      assert.match(capture.stderr, new RegExp(`applicationReads=${scenario === 'success' || scenario === 'other' ? 1 : 2}$`))
      assert.equal(snapshot.denied, false)
      if (failed) {
        assert.match(snapshot.error, /AXButton.*0\/0\/0/)
        assert.throws(() => assertAccessibleTree(snapshot, 'darwin'), /AXButton.*0\/0\/0/)
        assert.equal(snapshot.nodes.at(-1).AXIdentifier, 'today')
      } else {
        assert.equal(snapshot.error, null)
        assert.equal(assertAccessibleTree(snapshot, 'darwin').controls, 1)
        const node = snapshot.nodes.find(node => node.role === 'AXButton')
        for (const key of ['AXIdentifier', 'AXDOMIdentifier', 'AXDOMClassList', 'AXSubrole', 'AXRoleDescription', 'AXHidden']) assert.ok(key in node, key)
        assert.equal(snapshot.attempts.length, scenario === 'success' ? 0 : 1)
        if (snapshot.attempts.length) {
          assert.match(snapshot.attempts[0].error, /-25202/)
          assert.ok(snapshot.attempts[0].nodes.length > 0)
        }
      }
    })
  }
}

// Repeat reminder push acceptance (#1861). Shapes follow orbit-api ReminderSchedulerService.Repeat.cs RecordRepeat,
// PushNotificationService.CreateWebPushPayload, ApnsPushSender.CreatePayload and WnsPushSender.SendAsync.
const pushHabit = '6f1c2a5e-7b3d-4c8e-9a10-2b3c4d5e6f70'
const pushReminder = () => repeatReminder({ habitId: pushHabit, title: 'Water', doneToken: 'one-use-token',
  reminderAt: new Date('2026-11-08T15:04:05.123Z'), timeZone: 'UTC' })

test('repeat reminder copies the API metadata, label, tag and round-trip timestamps', () => {
  const reminder = pushReminder()
  assert.deepEqual(reminder, {
    title: 'Water', body: 'Next at 4:04 PM', url: '/',
    data: {
      habitId: pushHabit, tag: 'orbit-repeat-6f1c2a5e7b3d4c8e9a102b3c4d5e6f70', reminderAtUtc: '2026-11-08T15:04:05.1230000Z',
      doneExpiresAtUtc: '2026-11-08T16:04:05.1230000Z', doneToken: 'one-use-token', doneLabel: 'Done',
    },
  })
  assert.equal(repeatReminder({ habitId: pushHabit, title: 'Water', doneToken: 't', reminderAt: new Date('2026-11-08T23:30:00Z'), timeZone: 'UTC' }).body, 'Next at 12:30 AM')
  assert.equal(repeatReminder({ habitId: pushHabit, title: 'Water', doneToken: 't', reminderAt: new Date('2026-11-08T11:00:00Z'), timeZone: 'America/Sao_Paulo' }).body, 'Next at 9:00 AM')
})

test('Windows raw and APNs payloads keep the producer key order and nesting', () => {
  const reminder = pushReminder()
  assert.equal(wnsPayload(reminder), '{"title":"Water","body":"Next at 4:04 PM","habitId":"6f1c2a5e-7b3d-4c8e-9a10-2b3c4d5e6f70",' +
    '"tag":"orbit-repeat-6f1c2a5e7b3d4c8e9a102b3c4d5e6f70","reminderAtUtc":"2026-11-08T15:04:05.1230000Z",' +
    '"doneExpiresAtUtc":"2026-11-08T16:04:05.1230000Z","doneToken":"one-use-token","doneLabel":"Done","url":"/"}')
  const apple = apnsPayload(reminder)
  assert.deepEqual(Object.keys(apple), ['aps', 'body'])
  assert.deepEqual(Object.keys(apple.aps), ['alert', 'sound', 'category'])
  assert.deepEqual(apple.aps, { alert: { title: 'Water', body: 'Next at 4:04 PM' }, sound: 'default', category: 'orbit-repeat-reminder' })
  assert.deepEqual(Object.keys(apple.body), [...Object.keys(reminder.data), 'url'])
  assert.deepEqual(apple.body, { ...reminder.data, url: '/' })
})

test('only HTTPS notify.windows.com channels on the default port receive the WNS bearer token', () => {
  for (const uri of ['https://dm3p.notify.windows.com/?token=channel', 'https://NOTIFY.windows.com/x', 'https://wns2-bl2p.notify.windows.com:443/w/?token=a']) {
    assert.equal(isWnsChannel(uri), true, uri)
  }
  for (const uri of ['http://dm3p.notify.windows.com/?token=a', 'https://notify.windows.com.example/x', 'https://evilnotify.windows.com/x',
    'https://dm3p.notify.windows.com:8443/x', 'https://user:pass@dm3p.notify.windows.com/x', 'https://dm3p.notify.windows.com/x#frag', 'not a url', '']) {
    assert.equal(isWnsChannel(uri), false, uri)
  }
})

test('WNS client credentials request the WNS scope and never echo the secret on failure', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const token = await wnsAccessToken({ tenantId: 'tenant id', clientId: 'client', clientSecret: 'secret-value' }, async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ token_type: 'Bearer', expires_in: 3599, access_token: 'wns-access' }), { status: 200 })
  })
  assert.equal(token, 'wns-access')
  assert.equal(calls[0].url, 'https://login.microsoftonline.com/tenant%20id/oauth2/v2.0/token')
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(Object.fromEntries(new URLSearchParams(String(calls[0].init.body))), {
    grant_type: 'client_credentials', client_id: 'client', client_secret: 'secret-value', scope: 'https://wns.windows.com/.default',
  })
  for (const reply of [new Response('{"error":"invalid_client"}', { status: 401 }), new Response('{"access_token":" "}', { status: 200 })]) {
    await assert.rejects(() => wnsAccessToken({ tenantId: 't', clientId: 'c', clientSecret: 'secret-value' }, async () => reply),
      (error: Error) => /WNS authentication/.test(error.message) && !error.message.includes('secret-value'))
  }
})

test('WNS delivery posts the raw payload with the producer headers and fails on any non-200 status', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const send = (status: number) => async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(null, { status }) }
  const payload = wnsPayload(pushReminder())
  assert.deepEqual(await sendWns('https://dm3p.notify.windows.com/?token=channel', payload, 'wns-access', send(200)), { status: 200 })
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(calls[0].init.headers, { authorization: 'Bearer wns-access', 'x-wns-type': 'wns/raw', 'content-type': 'application/octet-stream' })
  assert.equal(Buffer.from(calls[0].init.body as Uint8Array).toString('utf8'), payload)
  await assert.rejects(() => sendWns('https://dm3p.notify.windows.com/?token=channel', payload, 'wns-access', send(410)), /HTTP 410/)
  await assert.rejects(() => sendWns('https://example.invalid/?token=channel', payload, 'wns-access', send(200)), /not a WNS endpoint/)
  assert.equal(calls.length, 2)
})

test('APNs provider token is an ES256 JWT that verifies against the key', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
  const token = apnsProviderToken({ keyId: 'KEY123', teamId: 'TEAM123', privateKey: pem }, 1_800_000_000)
  const [header, claims, signature] = token.split('.')
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg: 'ES256', kid: 'KEY123' })
  assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url').toString()), { iss: 'TEAM123', iat: 1_800_000_000 })
  assert.equal(verify('sha256', Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true)
})

test('APNs request selects the entitlement environment and the registered desktop topic', () => {
  for (const [environment, origin] of [['development', 'https://api.sandbox.push.apple.com'], ['production', 'https://api.push.apple.com']]) {
    const request = apnsRequest({ deviceToken: 'ab cd', topic: 'org.useorbit.desktop.staging', environment, reminder: pushReminder(), providerToken: 'provider' })
    assert.equal(request.origin, origin)
    assert.deepEqual(request.headers, {
      ':method': 'POST', ':path': '/3/device/ab%20cd', authorization: 'bearer provider', 'apns-topic': 'org.useorbit.desktop.staging',
      'apns-push-type': 'alert', 'apns-collapse-id': 'orbit-repeat-6f1c2a5e7b3d4c8e9a102b3c4d5e6f70', 'content-type': 'application/json',
    })
    assert.deepEqual(JSON.parse(request.body), apnsPayload(pushReminder()))
  }
  assert.throws(() => apnsRequest({ deviceToken: 'a', topic: 'org.useorbit.desktop.staging', environment: 'other', reminder: pushReminder(), providerToken: 'p' }), /environment/)
})

test('APNs delivery reports success only for HTTP 200 and keeps the rejection reason', async () => {
  const fakeConnect = (status: number, body: string) => (origin: string) => {
    const session = Object.assign(new EventEmitter(), {
      origin, closed: false,
      close() { this.closed = true },
      request(headers: Record<string, string>) {
        const stream = Object.assign(new EventEmitter(), {
          headers, written: '', setEncoding() {},
          end(value: string) {
            this.written = value
            queueMicrotask(() => { stream.emit('response', { ':status': status }); stream.emit('data', body); stream.emit('end') })
          },
        })
        sessions.push({ session, stream })
        return stream
      },
    })
    return session
  }
  const sessions: { session: { closed: boolean; origin: string }; stream: { headers: Record<string, string>; written: string } }[] = []
  const request = apnsRequest({ deviceToken: 'token', topic: 'org.useorbit.desktop.staging', environment: 'development', reminder: pushReminder(), providerToken: 'provider' })
  assert.deepEqual(await sendApns(request, fakeConnect(200, '')), { status: 200 })
  assert.equal(sessions[0].session.origin, 'https://api.sandbox.push.apple.com')
  assert.equal(sessions[0].stream.headers['apns-topic'], 'org.useorbit.desktop.staging')
  assert.equal(sessions[0].stream.written, request.body)
  assert.equal(sessions[0].session.closed, true)
  await assert.rejects(() => sendApns(request, fakeConnect(400, '{"reason":"BadDeviceToken"}')), /HTTP 400.*BadDeviceToken/)
  assert.equal(sessions[1].session.closed, true)
})

test('aps-environment comes only from the installed code signature entitlements', () => {
  const plist = (value: string) => `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>com.apple.security.app-sandbox</key><true/><key>com.apple.developer.aps-environment</key><string>${value}</string></dict></plist>`
  assert.equal(apsEnvironment(plist('development')), 'development')
  assert.equal(apsEnvironment(plist('production')), 'production')
  assert.equal(apsEnvironment(plist('staging')), null)
  assert.equal(apsEnvironment(''), null)
  assert.equal(apsEnvironment('<key>com.apple.developer.aps-environment-other</key><string>production</string>'), null)
})

test('push readiness registers on Windows, skips with a named reason, and never skips silently', () => {
  const wns = { ORBIT_WNS_TENANT_ID: 't', ORBIT_WNS_CLIENT_ID: 'c', ORBIT_WNS_CLIENT_SECRET: 's' }
  const apns = { ORBIT_APNS_KEY_ID: 'k', ORBIT_APPLE_TEAM_ID: 't', ORBIT_APNS_PRIVATE_KEY: 'p' }
  assert.deepEqual(pushReadiness({ platform: 'win32', credentials: wns, environment: null }), { transport: 'wns', registration: true, delivery: true })
  const windowsSkip = pushReadiness({ platform: 'win32', credentials: { ORBIT_WNS_TENANT_ID: 't' }, environment: null })
  assert.equal(windowsSkip.registration, true)
  assert.equal(windowsSkip.delivery, false)
  assert.match(windowsSkip.skipped!, /ORBIT_WNS_CLIENT_ID, ORBIT_WNS_CLIENT_SECRET/)
  const unsigned = pushReadiness({ platform: 'darwin', credentials: apns, environment: null })
  assert.equal(unsigned.registration, false)
  assert.match(unsigned.skipped!, /com\.apple\.developer\.aps-environment/)
  assert.deepEqual(pushReadiness({ platform: 'darwin', credentials: apns, environment: 'production' }), { transport: 'apns', registration: true, delivery: true })
  assert.match(pushReadiness({ platform: 'darwin', credentials: {}, environment: 'development' }).skipped!, /ORBIT_APNS_KEY_ID, ORBIT_APPLE_TEAM_ID, ORBIT_APNS_PRIVATE_KEY/)
})

test('push credentials leave the environment before any build or child process inherits it', () => {
  const environment: NodeJS.ProcessEnv = { PATH: '/bin', ORBIT_WNS_CLIENT_SECRET: 'secret', ORBIT_APNS_PRIVATE_KEY: 'key', ORBIT_WNS_TENANT_ID: '' }
  assert.deepEqual(takePushCredentials(environment), { ORBIT_WNS_CLIENT_SECRET: 'secret', ORBIT_APNS_PRIVATE_KEY: 'key' })
  assert.deepEqual(environment, { PATH: '/bin' })
})

const pushJwt = (claims: Record<string, unknown>) => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.hermetic-test-signature`
const sessionToken = pushJwt({ exp: 4102444800, hermeticFixtureSession: 'desktop-bench', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': 'hermetic-perf-user' })

async function withAcceptanceMock(now: () => number, run: (call: (method: string, path: string, body?: unknown, token?: string) => Promise<{ status: number; body: unknown }>) => Promise<void>) {
  const server = createHttpServer(createAcceptanceHandler(sessionToken, now))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  try {
    await run(async (method, path, body, token) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}),
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const text = await response.text()
      return { status: response.status, body: text ? JSON.parse(text) : null }
    })
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}

test('mock API records the native registration and lists it with the API endpoint hash', async () => {
  await withAcceptanceMock(() => Date.parse('2026-11-08T12:00:00Z'), async (call) => {
    const registration = { endpoint: 'https://dm3p.notify.windows.com/?token=channel', p256dh: 'wns', auth: 'wns', deviceId: '0f8fad5b-d9cb-469f-a165-70867728950e' }
    assert.equal((await call('POST', '/api/notifications/subscribe', registration)).status, 401)
    assert.deepEqual(await call('POST', '/api/notifications/subscribe', registration, sessionToken), { status: 200, body: null })
    assert.equal((await call('POST', '/api/notifications/subscribe', { endpoint: '' }, sessionToken)).status, 400)
    const listed = await call('GET', '/api/notifications/subscriptions', undefined, sessionToken)
    assert.equal(listed.status, 200)
    const items = (listed.body as { items: { transport: string; endpointHash: string; createdAtUtc: string }[]; max: number })
    assert.equal(items.max, 5)
    assert.equal(items.items.length, 1)
    assert.equal(items.items[0].transport, 'native')
    assert.equal(items.items[0].endpointHash, createHash('sha256').update(registration.endpoint).digest('hex'))
    assert.equal(items.items[0].createdAtUtc, '2026-11-08T12:00:00.000Z')
    const recorded = await call('GET', '/_test/push-registrations')
    assert.deepEqual((recorded.body as Record<string, unknown>[]).map(({ endpoint, p256dh, apnsTopic, deviceId }) => ({ endpoint, p256dh, apnsTopic, deviceId })),
      [{ endpoint: registration.endpoint, p256dh: 'wns', apnsTopic: null, deviceId: registration.deviceId }])
    assert.equal((await call('POST', '/api/notifications/unsubscribe', { endpoint: registration.endpoint, p256dh: 'wns', auth: 'wns' }, sessionToken)).status, 200)
    assert.deepEqual((await call('GET', '/api/notifications/subscriptions', undefined, sessionToken)).body, { items: [], max: 5 })
  })
})

test('mock API completes a one-use reminder token once and records every habit log', async () => {
  await withAcceptanceMock(() => Date.parse('2026-11-08T12:00:00Z'), async (call) => {
    const minted = await call('POST', '/_test/repeat-reminders', { habitId: pushHabit })
    const { doneToken } = minted.body as { doneToken: string }
    assert.match(doneToken, /^[A-Za-z0-9_-]{43}$/)
    const done = await call('POST', '/api/reminders/done', { token: doneToken })
    assert.equal(done.status, 200)
    assert.equal((done.body as { isFirstCompletionToday: boolean }).isFirstCompletionToday, true)
    for (const token of [doneToken, 'unknown']) {
      assert.deepEqual(await call('POST', '/api/reminders/done', { token }), { status: 400,
        body: { error: 'This reminder action is no longer available.', errorCode: 'INVALID_REMINDER_ACTION' } })
    }
    assert.equal((await call('POST', '/api/reminders/done', {})).status, 400)
    assert.equal((await call('POST', `/api/habits/${pushHabit}/log`, {}, sessionToken)).status, 200)
    assert.deepEqual(await call('GET', '/_test/habit-logs'), { status: 200, body: [
      { habitId: pushHabit, source: 'reminder-done', atUtc: '2026-11-08T12:00:00.000Z' },
      { habitId: pushHabit, source: 'habit-log', atUtc: '2026-11-08T12:00:00.000Z' },
    ] })
  })
})

test('mock session expiry forces a short refreshed token, then rejects the session but keeps anonymous Done', async () => {
  let now = Date.parse('2026-11-08T12:00:00Z')
  await withAcceptanceMock(() => now, async (call) => {
    assert.equal((await call('GET', '/api/notifications/subscriptions', undefined, sessionToken)).status, 200)
    assert.equal((await call('PUT', '/_test/session-mode', { mode: 'later' })).status, 400)
    assert.equal((await call('PUT', '/_test/session-mode', { mode: 'expiring' })).status, 204)
    assert.equal((await call('GET', '/api/notifications/subscriptions', undefined, sessionToken)).status, 401)
    const refreshed = await call('POST', '/api/auth/refresh', { refreshToken: 'hermetic-refresh' })
    assert.equal(refreshed.status, 200)
    const { token, refreshToken } = refreshed.body as { token: string; refreshToken: string }
    assert.equal(refreshToken, 'hermetic-refresh')
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<string, unknown>
    assert.equal(claims.exp, now / 1000 + 65)
    assert.equal(claims.hermeticFixtureSession, 'desktop-bench')
    assert.equal((await call('GET', '/api/notifications/subscriptions', undefined, token)).status, 200)
    const { doneToken } = (await call('POST', '/_test/repeat-reminders', { habitId: pushHabit })).body as { doneToken: string }
    now += 1000
    assert.equal((await call('PUT', '/_test/session-mode', { mode: 'expired' })).status, 204)
    assert.equal((await call('GET', '/api/notifications/subscriptions', undefined, token)).status, 401)
    assert.equal((await call('POST', '/api/auth/refresh', { refreshToken })).status, 401)
    assert.equal((await call('POST', '/api/reminders/done', { token: doneToken })).status, 200)
  })
})

test('Done and expired-session outcomes require the exact log count, window state and sign-in page', () => {
  const logs = [{ habitId: pushHabit, source: 'reminder-done' }, { habitId: 'other', source: 'reminder-done' }]
  assert.deepEqual(assertDoneDelivered({ logs, habitId: pushHabit, visible: 0 }), { logs: 1, windowVisible: false })
  assert.throws(() => assertDoneDelivered({ logs: [], habitId: pushHabit, visible: 0 }), /exactly one.*0/)
  assert.throws(() => assertDoneDelivered({ logs: [logs[0], logs[0]], habitId: pushHabit, visible: 0 }), /exactly one.*2/)
  assert.throws(() => assertDoneDelivered({ logs, habitId: pushHabit, visible: 1 }), /window/)
  const signIn = { kind: 'sign-in', route: '/login' }
  assert.deepEqual(assertExpiredDone({ logs: [logs[1]], habitId: pushHabit, visible: 1, signIn }), { logs: 0, windowVisible: true, route: '/login' })
  assert.throws(() => assertExpiredDone({ logs, habitId: pushHabit, visible: 1, signIn }), /no habit log/)
  assert.throws(() => assertExpiredDone({ logs: [], habitId: pushHabit, visible: 0, signIn }), /visible/)
  assert.throws(() => assertExpiredDone({ logs: [], habitId: pushHabit, visible: 1, signIn: { kind: 'sign-in', route: '/' } }), /sign-in page/)
  assert.equal(visibleWindows('win32', { windows: [
    { className: 'Tauri Window', visible: true }, { className: 'Tauri Window', visible: false }, { className: '#32770', visible: true },
  ] }), 1)
  assert.equal(visibleWindows('darwin', { windows: [{ layer: 0, onscreen: true }, { layer: 0, onscreen: false }, { layer: 25, onscreen: true }] }), 1)
  assert.throws(() => visibleWindows('win32', { sent: 'windows' }), /window list/)
})

const pushProbeSource = (reportSignIn: boolean) => readFileSync(new URL('./acceptance-probe.js', import.meta.url), 'utf8')
  .replaceAll('__BENCH_EXPECT_AUTHENTICATED__', String(!reportSignIn))
  .replaceAll('__BENCH_REPORT_SIGN_IN__', String(reportSignIn))
  .replace('run().catch', 'globalThis.completion = run().catch')

function pushProbeContext(pathname: string, options: { checked?: boolean; storage?: Map<string, string>; status?: number; command?: string } = {}) {
  const storage = options.storage ?? new Map<string, string>()
  const navigations: string[] = []
  const reports: { kind: string; route?: string; message?: string }[] = []
  const requests: string[] = []
  const browserWindow: { top?: unknown } = {}
  browserWindow.top = browserWindow
  const toggle = { disabled: false, clicks: 0, attributes: { 'aria-label': 'This device', 'aria-checked': String(options.checked === true) } as Record<string, string>,
    getAttribute(name: string) { return this.attributes[name] ?? null },
    click() { this.clicks++; this.attributes['aria-checked'] = 'true' } }
  let commandServed = false
  const context = {
    URLSearchParams, JSON, window: browserWindow, setTimeout: (callback: () => void) => { queueMicrotask(callback) },
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value) }, removeItem: (key: string) => { storage.delete(key) } },
    location: { pathname, search: '', assign(url: string) { navigations.push(url) }, reload() {} },
    document: { readyState: 'complete', cookie: '', querySelector(selector: string) {
      if (selector === '[data-testid="push-status"]') return null
      if (selector.startsWith('[data-habit-id')) return {}
      if (selector.startsWith('[data-astra-button]')) return {}
      return null
    }, querySelectorAll(selector: string) { return selector === '[role="switch"]' ? [toggle] : [] } },
    fetch: async (url: string, init?: { body: string }) => {
      requests.push(url)
      if (url === '/_bench/events') { reports.push(JSON.parse(init!.body)); return new Response(null, { status: 204 }) }
      if (url === '/_bench/command') {
        if (!commandServed && options.command) { commandServed = true; return new Response(options.command, { status: 200 }) }
        return new Promise<Response>(() => {})
      }
      if (url === '/api/auth/session') return new Response(null, { status: options.status ?? 200 })
      return new Response('{}', { status: 200 })
    },
  }
  return { context, storage, navigations, reports, requests, toggle }
}

test('probe push command keeps the switch labels across navigation to Perfil notifications', async () => {
  const probe = pushProbeContext('/', { command: 'push-enable:["This device","Neste aparelho"]' })
  runInNewContext(pushProbeSource(false), probe.context)
  for (let index = 0; index < 50 && !probe.navigations.length; index++) await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(probe.navigations, ['/profile/notifications'])
  assert.equal(probe.storage.get('orbit-acceptance-push'), '["This device","Neste aparelho"]')
  assert.deepEqual(probe.reports.map(event => event.kind), ['hoje'])
})

for (const checked of [false, true]) {
  test(`probe turns on the real Perfil switch ${checked ? 'without toggling an enabled' : 'from an off'} registration and returns to Hoje`, async () => {
    const storage = new Map([['orbit-acceptance-push', '["This device","Neste aparelho"]']])
    const probe = pushProbeContext('/profile/notifications', { checked, storage })
    runInNewContext(pushProbeSource(false), probe.context)
    await (probe.context as typeof probe.context & { completion: Promise<void> }).completion
    assert.equal(probe.toggle.clicks, checked ? 0 : 1)
    assert.deepEqual(probe.reports.map(event => event.kind), ['push-enabled'])
    assert.deepEqual(probe.navigations, ['/'])
    assert.equal(storage.has('orbit-acceptance-push'), false)
  })
}

test('expired-session probe reports the sign-in page without signing in again', async () => {
  const probe = pushProbeContext('/login', { status: 401 })
  runInNewContext(pushProbeSource(true), probe.context)
  await (probe.context as typeof probe.context & { completion: Promise<void> }).completion
  assert.deepEqual(probe.reports, [{ kind: 'sign-in', route: '/login', session: 401 }])
  assert.deepEqual(probe.navigations, [])
  assert.ok(!probe.requests.some(url => /send-code|verify-code/.test(url)))
})

test('proxy serves the sign-in report mode only to the launch that asks for it', async () => {
  const source = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace('export async function startProxy', 'async function startProxy')
  let handle: (incoming: unknown, response: unknown) => Promise<void> = async () => { assert.fail('Proxy handler not registered') }
  const context = { Buffer, benchmarkViewport: [900, 600], readFile: async () => 'expect=__BENCH_EXPECT_AUTHENTICATED__ report=__BENCH_REPORT_SIGN_IN__',
    createServer: (callback: typeof handle) => { handle = callback; return { once() {}, listen(_port: number, _host: string, ready: () => void) { ready() } } },
  }
  runInNewContext(`${source}\nglobalThis.startProxy = startProxy`, context)
  const startProxy = (context as typeof context & { startProxy: (options: unknown) => Promise<{ reset: (settings: unknown) => void }> }).startProxy
  const proxy = await startProxy({ probePath: 'probe', port: 3400, upstreamPort: 3401, acceptance: true, route: () => false })
  const served: string[] = []
  for (const settings of [{ expectAuthenticated: true }, { expectAuthenticated: false, reportSignIn: true }]) {
    proxy.reset(settings)
    await handle({ url: '/_bench/probe.js' }, { writeHead() { return this }, end(value: string) { served.push(value) } })
  }
  assert.deepEqual(served, ['expect=true report=false', 'expect=false report=true'])
})

function pushHarness(platform: 'win32' | 'darwin', overrides: { logsAfterDone?: number; visibleAfterDone?: number; expiredLogs?: number; credentials?: Record<string, string>; environment?: string | null } = {}) {
  const events: string[] = []
  const logs: { habitId: string; source: string }[] = []
  const reminders = new Map<string, string>()
  const proxyEvents: Record<string, unknown> = {}
  let hidden = false
  let launchedVisible = 0
  let shellAlive = true
  let notified: { title: string; doneToken: string }[] = []
  const report: { push?: Record<string, unknown> } = {}
  const wnsCredentials = { ORBIT_WNS_TENANT_ID: 't', ORBIT_WNS_CLIENT_ID: 'c', ORBIT_WNS_CLIENT_SECRET: 's' }
  const apnsCredentials = { ORBIT_APNS_KEY_ID: 'k', ORBIT_APPLE_TEAM_ID: 't', ORBIT_APNS_PRIVATE_KEY: 'p' }
  const transport = platform === 'win32' ? 'wns' : 'apns'
  const io = {
    platform, report, labels: ['This device', 'Neste aparelho'], doneLabel: 'Done', allowLabel: 'Allow', appName: 'Orbit Staging', timeZone: 'UTC',
    credentials: overrides.credentials ?? (platform === 'win32' ? wnsCredentials : apnsCredentials),
    apsEnvironment: async () => overrides.environment === undefined ? 'development' : overrides.environment,
    now: () => Date.parse('2026-11-08T12:00:00Z'),
    delay: async (milliseconds: number) => { events.push(`delay ${milliseconds}`) },
    waitFor: async (read: () => Promise<unknown> | unknown, label: string) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const value = await read()
        if (value) return value
      }
      throw new Error(`Timed out waiting for ${label}`)
    },
    record: async () => {},
    warn: (message: string) => { events.push(`warn ${message}`) },
    mock: {
      registrations: async () => events.includes('push-enabled') ? [{ endpoint: platform === 'win32' ? 'https://dm3p.notify.windows.com/?token=c' : 'abcd', p256dh: transport, auth: transport,
        apnsTopic: platform === 'win32' ? null : 'org.useorbit.desktop.staging', deviceId: '0f8fad5b-d9cb-469f-a165-70867728950e', receivedAtUtc: 'now' }] : [],
      mintReminder: async (habitId: string) => { const token = `token-${reminders.size}`; reminders.set(token, habitId); return token },
      logs: async () => logs.slice(),
      sessionMode: async (mode: string) => { events.push(`session ${mode}`) },
    },
    proxy: {
      send(command: string) {
        events.push(`send ${command}`)
        if (command.startsWith('push-enable:')) { events.push('push-enabled'); proxyEvents['push-enabled'] = { kind: 'push-enabled' } }
      },
      read: (kind: string) => proxyEvents[kind],
      reset(settings: Record<string, unknown>) { events.push(`reset ${JSON.stringify(settings)}`) },
    },
    launch: async () => { events.push('launch'); return { child: { pid: 41 } } },
    stop: async () => { events.push('stop'); shellAlive = false },
    adopt: (pid: number) => { events.push(`adopt ${pid}`) },
    findProcesses: async () => launchedVisible ? [77] : [],
    sender: async (kind: string) => {
      events.push(`sender ${kind}`)
      return async (reminder: { title: string; data: { doneToken: string } }) => {
        events.push(`deliver ${reminder.title}`)
        notified.push({ title: reminder.title, doneToken: reminder.data.doneToken })
        return { status: 200 }
      }
    },
    native: async (pid: number, command: string, options: { title?: string; label?: string; invoke?: boolean; openCenter?: boolean } = {}) => {
      events.push(`native ${pid} ${command}${options.invoke ? ' invoke' : ''}${options.label ? ` ${options.label}` : ''}`)
      if (command === 'close') { hidden = true; return { sent: 'close' } }
      if (command === 'windows') {
        const visible = pid === 77 ? launchedVisible : hidden ? (proxyEvents.done ? overrides.visibleAfterDone ?? 0 : 0) : 1
        return platform === 'win32' ? { windows: Array.from({ length: visible }, () => ({ className: 'Tauri Window', visible: true })) }
          : { windows: Array.from({ length: visible }, () => ({ layer: 0, onscreen: true })) }
      }
      if (command === 'notification') {
        if (options.label === 'Allow') return { found: false }
        const toast = notified.find((entry) => entry.title === options.title)
        if (!toast) return { found: false }
        if (!options.invoke) return { found: true, invoked: false }
        const habitId = reminders.get(toast.doneToken)!
        if (shellAlive) {
          proxyEvents.done = true
          for (let index = 0; index < (overrides.logsAfterDone ?? 1); index++) logs.push({ habitId, source: 'reminder-done' })
        } else {
          for (let index = 0; index < (overrides.expiredLogs ?? 0); index++) logs.push({ habitId, source: 'reminder-done' })
          launchedVisible = 1
          proxyEvents['sign-in'] = { kind: 'sign-in', route: '/login', session: 401 }
        }
        return { found: true, invoked: true }
      }
      throw new Error(`Unexpected native command ${command}`)
    },
  }
  return { io, events, report, logs }
}

test('push acceptance proves Done once with the window hidden, then an expired-session Done shows sign-in with no log', async () => {
  for (const platform of ['win32', 'darwin'] as const) {
    const harness = pushHarness(platform)
    await exercisePush(harness.io)
    const push = harness.report.push as { transport: string; registration: Record<string, unknown>; done: unknown; expired: unknown; skipped?: string }
    assert.equal(push.transport, platform === 'win32' ? 'wns' : 'apns')
    assert.equal(push.skipped, undefined)
    assert.deepEqual(push.done, { logs: 1, windowVisible: false })
    assert.deepEqual(push.expired, { logs: 0, windowVisible: true, route: '/login' })
    assert.equal(JSON.stringify(push.registration).includes('token=c'), false, 'the report never stores the channel token')
    const order = (event: string) => { const index = harness.events.findIndex((entry) => entry.startsWith(event)); assert.ok(index >= 0, event); return index }
    assert.ok(order('session expiring') < order('launch'))
    assert.ok(order('send push-enable:') < order('native 41 close'))
    assert.ok(order('native 41 close') < order('deliver Orbit acceptance done'))
    assert.ok(order('deliver Orbit acceptance done') < order('native 41 notification invoke Done'))
    assert.ok(order('deliver Orbit acceptance expired') < order('stop'))
    assert.ok(order('stop') < order('session expired'))
    assert.ok(order('session expired') < order('reset {"expectAuthenticated":false,"reportSignIn":true}'))
    assert.ok(order('reset {"expectAuthenticated":false,"reportSignIn":true}') < order('native 0 notification invoke Done'))
    assert.ok(harness.events.includes('adopt 77'))
  }
})

for (const [label, overrides, message] of [
  ['a duplicated Done log', { logsAfterDone: 2 }, /exactly one.*2/],
  ['a Done that opens the window', { visibleAfterDone: 1 }, /window/],
  ['an expired-session Done that still logs', { expiredLogs: 1 }, /no habit log/],
] as const) {
  test(`push acceptance fails on ${label}`, async () => {
    await assert.rejects(() => exercisePush(pushHarness('win32', overrides).io), message)
  })
}

test('push acceptance reports explicit skips for an unsigned macOS shell and for missing WNS credentials', async () => {
  const unsigned = pushHarness('darwin', { environment: null })
  await exercisePush(unsigned.io)
  assert.match((unsigned.report.push as { skipped: string }).skipped, /aps-environment/)
  assert.ok(!unsigned.events.includes('launch'))
  assert.ok(unsigned.events.some((event) => event.startsWith('warn ') && event.includes('aps-environment')))
  const windows = pushHarness('win32', { credentials: {} })
  await exercisePush(windows.io)
  const push = windows.report.push as { skipped: string; registration: { p256dh: string } }
  assert.match(push.skipped, /ORBIT_WNS_TENANT_ID/)
  assert.equal(push.registration.p256dh, 'wns')
  assert.ok(windows.events.includes('stop'))
  assert.ok(!windows.events.some((event) => event.startsWith('sender')))
})

const notificationFixture = `#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
static NSString *scenario;
static NSMutableArray *performed;
@interface FixtureRunning : NSObject
@end
@implementation FixtureRunning
- (pid_t)processIdentifier { return 7; }
+ (NSArray *)runningApplicationsWithBundleIdentifier:(NSString *)identifier {
    return [identifier isEqual:@"com.apple.notificationcenterui"] ? @[[self new]] : @[];
}
+ (instancetype)runningApplicationWithProcessIdentifier:(pid_t)pid { return [self new]; }
- (BOOL)activateWithOptions:(NSUInteger)options { return YES; }
- (BOOL)terminate { return YES; }
@end
static NSDictionary *text(NSString *value) { return @{@"AXRole": @"AXStaticText", @"AXValue": value}; }
static NSDictionary *done(NSString *identifier) { return @{@"id": identifier, @"AXRole": @"AXButton", @"AXTitle": @"Done", @"actions": @[@"AXPress"]}; }
static AXUIElementRef fixtureApplication(pid_t pid) {
    NSString *custom = @"Name:Done\\nTarget:0x0\\nSelector:(null)";
    NSDictionary *other = @{@"id": @"other", @"AXRole": @"AXGroup", @"AXDescription": @"Orbit Staging, Orbit acceptance expired 0a1b2c3d",
        @"actions": @[@"AXPress", custom]};
    NSArray *groups = @[];
    if ([scenario isEqual:@"custom"]) groups = @[other, @{@"id": @"first", @"AXRole": @"AXGroup",
        @"AXDescription": @"Orbit Staging, Orbit acceptance done 6f1c2a5e, Next at 4:04 PM", @"actions": @[@"AXPress", custom]}];
    if ([scenario isEqual:@"button"]) groups = @[@{@"id": @"first", @"AXRole": @"AXGroup", @"actions": @[@"AXPress"],
        @"AXChildren": @[text(@"Orbit acceptance done 6f1c2a5e"), text(@"Next at 4:04 PM"), done(@"button-first")]}];
    if ([scenario isEqual:@"description"]) groups = @[@{@"id": @"first", @"AXRole": @"AXGroup", @"AXTitle": @"Orbit acceptance done 6f1c2a5e",
        @"actions": @[@"AXPress", @"AXCustomAction1"], @"descriptions": @{@"AXCustomAction1": @"Done", @"AXPress": @"press"}}];
    if ([scenario isEqual:@"missing"]) groups = @[other];
    if ([scenario isEqual:@"ambiguous"]) groups = @[@{@"id": @"first", @"AXRole": @"AXGroup",
        @"AXChildren": @[text(@"Orbit acceptance done 6f1c2a5e"), done(@"one"), done(@"two")]}];
    return (AXUIElementRef)CFBridgingRetain(@{@"AXRole": @"AXApplication", @"AXTitle": @"Notification Center", @"AXChildren": @[
        @{@"AXRole": @"AXMenuBar", @"AXChildren": @[@{@"AXRole": @"AXMenuBarItem", @"AXTitle": @"Orbit acceptance done 6f1c2a5e", @"actions": @[@"AXPress"]}]},
        @{@"AXRole": @"AXWindow", @"AXChildren": groups}]});
}
static AXError fixtureAttribute(AXUIElementRef element, CFStringRef key, CFTypeRef *value) {
    id result = ((__bridge NSDictionary *)element)[(__bridge NSString *)key];
    if (!result) return kAXErrorAttributeUnsupported;
    *value = CFBridgingRetain(result);
    return kAXErrorSuccess;
}
static AXError fixtureActions(AXUIElementRef element, CFArrayRef *names) {
    *names = (CFArrayRef)CFBridgingRetain(((__bridge NSDictionary *)element)[@"actions"] ?: @[]);
    return kAXErrorSuccess;
}
static AXError fixtureDescription(AXUIElementRef element, CFStringRef action, CFStringRef *description) {
    NSString *value = ((__bridge NSDictionary *)element)[@"descriptions"][(__bridge NSString *)action];
    if (!value) return kAXErrorActionUnsupported;
    *description = (CFStringRef)CFBridgingRetain(value);
    return kAXErrorSuccess;
}
static AXError fixturePerform(AXUIElementRef element, CFStringRef action) {
    [performed addObject:@{@"id": ((__bridge NSDictionary *)element)[@"id"] ?: @"", @"action": (__bridge NSString *)action}];
    return kAXErrorSuccess;
}
static Boolean fixtureTrusted(void) { return true; }
#define NSRunningApplication FixtureRunning
#define AXUIElementCreateApplication fixtureApplication
#define AXUIElementCopyAttributeValue fixtureAttribute
#define AXUIElementCopyActionNames fixtureActions
#define AXUIElementCopyActionDescription fixtureDescription
#define AXUIElementPerformAction fixturePerform
#define AXIsProcessTrusted fixtureTrusted
#define main acceptanceMain
#include NATIVE_SOURCE
#undef main
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        scenario = @(argv[1]);
        performed = [NSMutableArray array];
        const char *arguments[] = {"acceptance", "1", "notification", "Orbit acceptance done 6f1c2a5e", "Done", argv[2], "0"};
        int status = acceptanceMain(7, arguments);
        NSData *encoded = [NSJSONSerialization dataWithJSONObject:performed options:0 error:NULL];
        fprintf(stderr, "%.*s", (int)encoded.length, (const char *)encoded.bytes);
        return status;
    }
}
`

if (process.platform === 'darwin') {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-acceptance-notification-'))
  after(() => rmSync(directory, { recursive: true, force: true }))
  const source = join(directory, 'notification.m')
  const executable = join(directory, 'notification')
  writeFileSync(source, notificationFixture.replace('NATIVE_SOURCE', JSON.stringify(fileURLToPath(new URL('./acceptance-ax.m', import.meta.url)))))
  const compilation = spawnSync('clang', ['-fobjc-arc', '-framework', 'AppKit', '-framework', 'ApplicationServices', source, '-o', executable], { encoding: 'utf8', timeout: 30000 })
  assert.equal(compilation.status, 0, compilation.stderr)
  const custom = 'Name:Done\nTarget:0x0\nSelector:(null)'
  for (const [scenario, expected] of [
    ['custom', { id: 'first', action: custom }], ['button', { id: 'button-first', action: 'AXPress' }],
    ['description', { id: 'first', action: 'AXCustomAction1' }], ['missing', null], ['ambiguous', null],
  ] as const) {
    test(`native notification reader ${expected ? 'invokes only the titled notification Done' : 'refuses'} in the ${scenario} layout`, () => {
      for (const invoke of ['1', '0']) {
        const capture = spawnSync(executable, [scenario, invoke], { encoding: 'utf8', timeout: 10000 })
        assert.equal(capture.status, 0, capture.stderr)
        const reply = JSON.parse(capture.stdout) as { found: boolean; invoked: boolean; action?: string; nodes?: { role: string; text: string }[] }
        assert.equal(reply.found, expected !== null)
        assert.equal(reply.invoked, expected !== null && invoke === '1')
        assert.deepEqual(JSON.parse(capture.stderr), expected && invoke === '1' ? [expected] : [])
        if (expected) assert.equal(reply.action, expected.action)
        else {
          assert.ok(reply.nodes!.some(node => node.text.includes('Orbit acceptance')))
          assert.ok(!reply.nodes!.some(node => node.role.startsWith('AXMenuBar')))
        }
      }
    })
  }
  test('native window reader lists only the target process windows with layer and on-screen state', () => {
    const reader = join(directory, 'reader')
    const built = spawnSync('clang', ['-fobjc-arc', '-framework', 'AppKit', '-framework', 'ApplicationServices', fileURLToPath(new URL('./acceptance-ax.m', import.meta.url)), '-o', reader], { encoding: 'utf8', timeout: 30000 })
    assert.equal(built.status, 0, built.stderr)
    const capture = spawnSync(reader, [String(process.pid), 'windows'], { encoding: 'utf8', timeout: 10000 })
    assert.equal(capture.status, 0, capture.stderr)
    assert.deepEqual(JSON.parse(capture.stdout), { windows: [] })
    assert.equal(spawnSync(reader, ['1', 'notification', 'title'], { encoding: 'utf8', timeout: 10000 }).status, 2)
    assert.equal(spawnSync(reader, ['1', 'windows', 'extra'], { encoding: 'utf8', timeout: 10000 }).status, 2)
  })
}

test('PowerShell producer lists process windows, finds the installed executable and refuses an absent notification', { skip: process.platform !== 'win32' }, () => {
  const script = fileURLToPath(new URL('./acceptance-uia.ps1', import.meta.url))
  const run = (...args: string[]) => {
    const capture = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script, ...args], { encoding: 'utf8', timeout: 60000 })
    assert.equal(capture.status, 0, capture.stderr)
    return JSON.parse(capture.stdout) as Record<string, unknown>
  }
  const windows = run('-TargetProcessId', String(process.pid), '-Command', 'windows').windows as { className: string; visible: boolean }[]
  assert.ok(Array.isArray(windows))
  assert.ok(windows.every(window => typeof window.className === 'string' && typeof window.visible === 'boolean'))
  assert.ok((run('-TargetProcessId', '0', '-Command', 'process', '-Executable', process.execPath).processIds as number[]).includes(process.pid))
  const absent = run('-TargetProcessId', String(process.pid), '-Command', 'notification', '-Title', `Orbit absent ${process.pid}`, '-Label', 'Done', '-Invoke')
  assert.equal(absent.found, false)
  assert.equal(absent.invoked, false)
  assert.ok(Array.isArray(absent.windows))
})
