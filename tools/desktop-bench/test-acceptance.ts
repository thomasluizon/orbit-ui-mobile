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
    const context = { Error, join, process: { platform: 'win32' }, assertAccessibleTree,
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

const nativeFixture = `#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
static int applicationReads = 0, invalidReads = 0;
static NSString *scenario;
static AXUIElementRef fixtureApplication(pid_t pid) {
    applicationReads++;
    NSDictionary *button = @{@"AXRole": @"AXButton", @"AXTitle": @"Today", @"AXIdentifier": @"today",
        @"AXDOMIdentifier": @"today-button", @"AXDOMClassList": @[@"action"], @"AXSubrole": @"AXTestButton",
        @"AXRoleDescription": @"button", @"AXHidden": @NO};
    NSDictionary *web = @{@"AXRole": @"AXWebArea", @"AXChildren": @[button]};
    return (AXUIElementRef)CFBridgingRetain(@{@"AXRole": @"AXApplication", @"AXChildren": @[web]});
}
static BOOL shouldInvalidate(void) {
    return invalidReads++ < ([scenario isEqual:@"twice"] ? 2 : 1);
}
static AXError fixtureAttribute(AXUIElementRef element, CFStringRef key, CFTypeRef *value) {
    NSDictionary *attributes = (__bridge NSDictionary *)element;
    if ([scenario isEqual:@"attribute-once"] && [attributes[@"AXRole"] isEqual:@"AXButton"] &&
        CFEqual(key, CFSTR("AXHidden")) && shouldInvalidate()) return kAXErrorInvalidUIElement;
    if ([scenario isEqual:@"root-once"] && [attributes[@"AXRole"] isEqual:@"AXApplication"] &&
        CFEqual(key, kAXChildrenAttribute) && shouldInvalidate()) return kAXErrorInvalidUIElement;
    id result = attributes[(__bridge NSString *)key];
    if (!result) return kAXErrorAttributeUnsupported;
    *value = CFBridgingRetain(result);
    return kAXErrorSuccess;
}
static AXError fixtureActions(AXUIElementRef element, CFArrayRef *names) {
    NSDictionary *attributes = (__bridge NSDictionary *)element;
    if ([attributes[@"AXRole"] isEqual:@"AXButton"]) {
        if ([scenario isEqual:@"other"]) return kAXErrorCannotComplete;
        if (([scenario isEqual:@"once"] || [scenario isEqual:@"twice"]) && shouldInvalidate()) return kAXErrorInvalidUIElement;
        *names = (CFArrayRef)CFBridgingRetain(@[@"AXPress"]);
    } else *names = (CFArrayRef)CFBridgingRetain(@[]);
    return kAXErrorSuccess;
}
#define AXUIElementCreateApplication fixtureApplication
#define AXUIElementCopyAttributeValue fixtureAttribute
#define AXUIElementCopyActionNames fixtureActions
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
  for (const scenario of ['success', 'once', 'twice', 'other', 'attribute-once', 'root-once']) {
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
