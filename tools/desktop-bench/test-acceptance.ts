import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import { Readable } from 'node:stream'
import { after, test } from 'node:test'
import { emailReply, acceptanceEmail, acceptanceCode } from './acceptance-mock'
import { verifyArtifact } from '../../apps/desktop/scripts/release'
import { assertAccessibleTree, corruptSignature } from './acceptance-contract.mjs'
import * as acceptanceContract from './acceptance-contract.mjs'

const vector = JSON.parse(readFileSync(new URL('../../apps/desktop/__fixtures__/signer-vector.json', import.meta.url), 'utf8')) as { payload: string; signature: string; publicKey: string; version: string }
const bytes = Buffer.from(vector.payload)
verifyArtifact(bytes, vector.signature, vector.publicKey, vector.version)
assert.throws(() => verifyArtifact(bytes, corruptSignature(vector.signature), vector.publicKey, vector.version))
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
  .replace('run().catch', 'globalThis.completion = run().catch')
const safariStack = 'emailSignIn@https://app-staging.useorbit.org/_bench/probe.js:22:40'

for (const path of ['send-code', 'verify-code']) {
  test(`probe preserves ${path} status and response body separately from a frame-only Safari stack`, async () => {
    const reports: { kind: string; message: string; stack: string }[] = []
    const browserWindow: { top?: unknown } = {}
    browserWindow.top = browserWindow
    const failureBody = JSON.stringify({ error: 'Hermetic request refused', errorCode: 'HERMETIC_FAILURE' })
    const context = {
      Error: class extends Error { constructor(message: string) { super(message); this.stack = safariStack } },
      window: browserWindow, document: { readyState: 'complete', cookie: '' },
      location: { pathname: '/login', assign() { assert.fail('Failed email sign-in must not navigate') } },
      setTimeout,
      fetch: async (url: string, options: { body: string }) => {
        if (url === '/_bench/events') { reports.push(JSON.parse(options.body)); return new Response(null, { status: 204 }) }
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
      const events: { kind: string }[] = []
      const native = async (_pid: number, command: string) => {
        commands.push(command)
        if (command === 'escape') { closing = modal; palette = false }
        if (command === 'palette') openPalette()
        if (command === 'down' && palette) selected++
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
  writeFileSync(source, nativeFixture.replace('NATIVE_SOURCE', JSON.stringify(fileURLToPath(new URL('./acceptance-ax.m', import.meta.url)))))
  const compilation = spawnSync('clang', ['-fobjc-arc', '-framework', 'AppKit', '-framework', 'ApplicationServices', source, '-o', executable], { encoding: 'utf8', timeout: 30000 })
  assert.equal(compilation.status, 0, compilation.stderr)
  for (const scenario of ['empty-live', 'empty-named', 'description-button', 'system-controls', 'separator']) {
    test(`native AX semantics accept ${scenario} without exempting unnamed app controls`, () => {
      const capture = spawnSync(executable, [scenario], { encoding: 'utf8', timeout: 10000 })
      assert.equal(capture.status, 0, capture.stderr)
      const snapshot = JSON.parse(capture.stdout)
      assert.equal(snapshot.error, null, JSON.stringify(snapshot))
      assert.equal(assertAccessibleTree(snapshot, 'darwin').controls,
        scenario === 'system-controls' ? 6 : scenario === 'empty-named' ? 2 : 1)
      if (scenario === 'empty-live') {
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
  for (const scenario of ['unnamed-button', 'web-system-button', 'empty-focusable', 'empty-focused', 'empty-children', 'empty-generic', 'system-generic', 'system-no-description', 'unnamed-menu']) {
    test(`native AX semantics keep ${scenario} failing role and name acceptance`, () => {
      const capture = spawnSync(executable, [scenario], { encoding: 'utf8', timeout: 10000 })
      assert.equal(capture.status, 0, capture.stderr)
      const snapshot = JSON.parse(capture.stdout)
      assert.equal(snapshot.error, null)
      assert.throws(() => assertAccessibleTree(snapshot, 'darwin'), /role and name/)
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
