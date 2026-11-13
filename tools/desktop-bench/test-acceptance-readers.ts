import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { after, test } from 'node:test'
import { runChild } from './child-limit.mjs'

// Native notification readers of the push acceptance (#1861): the macOS AX reader, the Windows UIA reader and the
// windows-unelevated.ps1 Done activator, each driven through its real source with a fixture tree.
const pushHabit = '6f1c2a5e-7b3d-4c8e-9a10-2b3c4d5e6f70'

const notificationFixture = `#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
static NSString *scenario;
static NSMutableArray *performed;
@interface FixtureRunning : NSObject
@end
@implementation FixtureRunning {
    pid_t _processIdentifier;
}
- (pid_t)processIdentifier { return _processIdentifier ?: 7; }
+ (NSArray *)runningApplicationsWithBundleIdentifier:(NSString *)identifier {
    FixtureRunning *application = [self new];
    if ([identifier isEqual:@"com.apple.controlcenter"]) application->_processIdentifier = 8;
    else if (![identifier isEqual:@"com.apple.notificationcenterui"]) return @[];
    return @[application];
}
+ (instancetype)runningApplicationWithProcessIdentifier:(pid_t)pid { return [self new]; }
- (BOOL)activateWithOptions:(NSUInteger)options { return YES; }
- (BOOL)terminate { return YES; }
@end
static NSDictionary *text(NSString *value) { return @{@"AXRole": @"AXStaticText", @"AXValue": value}; }
static NSDictionary *done(NSString *identifier) { return @{@"id": identifier, @"AXRole": @"AXButton", @"AXTitle": @"Done", @"actions": @[@"AXPress"]}; }
static AXUIElementRef fixtureApplication(pid_t pid) {
    // Control Center owns the menu bar clock that toggles Notification Center.
    if (pid == 8) return (AXUIElementRef)CFBridgingRetain(@{@"AXRole": @"AXApplication", @"AXExtrasMenuBar": @{@"AXRole": @"AXMenuBar",
        @"AXChildren": @[@{@"id": @"clock", @"AXRole": @"AXMenuBarItem", @"AXIdentifier": @"com.apple.menuextra.clock", @"actions": @[@"AXPress"]}]}});
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
    // The open center lists its history and the Edit Widgets button; the closed one shows neither.
    if ([scenario isEqual:@"open"]) groups = @[@{@"AXRole": @"AXGroup", @"AXIdentifier": @"AXNotificationListItems", @"AXChildren": @[other]},
        @{@"AXRole": @"AXButton", @"AXIdentifier": @"widget-editor-button", @"AXTitle": @"Edit Widgets", @"actions": @[@"AXPress"]}];
    if ([scenario isEqual:@"closed"]) groups = @[other];
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
        const char *arguments[] = {"acceptance", "1", "notification", "Orbit acceptance done 6f1c2a5e", "Done", argv[2], argc > 3 ? argv[3] : "0"};
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
    test(`native notification reader ${expected ? 'invokes only the titled notification Done' : 'refuses'} in the ${scenario === 'custom' ? 'recorded' : 'assumed'} ${scenario} layout`, () => {
      for (const invoke of ['1', '0']) {
        const capture = runChild(executable, [scenario, invoke])
        assert.equal(capture.status, 0, capture.stderr)
        const reply = JSON.parse(capture.stdout) as { found: boolean; invoked: boolean; action?: string; nodes?: { role: string; text: string }[]
          tree: { role: string; parent: number; text: string; actions: string[]; element?: unknown }[] }
        assert.equal(reply.found, expected !== null)
        assert.equal(reply.tree[0].role, 'AXApplication')
        assert.equal(reply.tree[0].parent, -1)
        assert.ok(reply.tree.slice(1).every((node, index) => node.parent >= 0 && node.parent <= index && !('element' in node)))
        assert.ok(reply.tree.some((node) => node.role === 'AXWindow'))
        assert.ok(reply.tree.some((node) => node.text.includes('Orbit acceptance') && node.role !== 'AXMenuBarItem'))
        if (scenario === 'custom') assert.ok(reply.tree.some((node) => node.actions.includes(custom)))
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
  test('native notification reader presses the menu bar clock only while Notification Center is closed, because the press toggles it', () => {
    for (const [scenario, presses] of [['closed', [{ id: 'clock', action: 'AXPress' }]], ['open', []]] as const) {
      const capture = runChild(executable, [scenario, '0', '1'])
      assert.equal(capture.status, 0, capture.stderr)
      assert.equal((JSON.parse(capture.stdout) as { found: boolean }).found, false, scenario)
      assert.deepEqual(JSON.parse(capture.stderr), presses, scenario)
    }
    const unrequested = runChild(executable, ['closed', '0', '0'])
    assert.deepEqual(JSON.parse(unrequested.stderr), [], 'a search without openCenter never touches the clock')
  })
  test('native window reader lists only the target process windows with layer and on-screen state', () => {
    const reader = join(directory, 'reader')
    const built = spawnSync('clang', ['-fobjc-arc', '-framework', 'AppKit', '-framework', 'ApplicationServices', fileURLToPath(new URL('./acceptance-ax.m', import.meta.url)), '-o', reader], { encoding: 'utf8', timeout: 30000 })
    assert.equal(built.status, 0, built.stderr)
    const capture = runChild(reader, [String(process.pid), 'windows'])
    assert.equal(capture.status, 0, capture.stderr)
    assert.deepEqual(JSON.parse(capture.stdout), { windows: [] })
    assert.equal(runChild(reader, ['1', 'notification', 'title']).status, 2)
    assert.equal(runChild(reader, ['1', 'windows', 'extra']).status, 2)
    // The bundles command takes one bundle identifier and answers in the shape that keepInstalledLaunchCopy reads.
    const unknown = runChild(reader, ['0', 'bundles', 'org.useorbit.acceptance.unregistered'])
    assert.equal(unknown.status, 0, unknown.stderr)
    assert.deepEqual(JSON.parse(unknown.stdout), { copies: [], best: null })
    const finder = JSON.parse(runChild(reader, ['0', 'bundles', 'com.apple.finder']).stdout)
    assert.equal(finder.best, finder.copies[0])
    assert.match(finder.best, /\/Finder\.app$/)
    assert.equal(runChild(reader, ['0', 'bundles']).status, 2)
  })
}

const uiaScript = fileURLToPath(new URL('./acceptance-uia.ps1', import.meta.url))
const pwshHost = ['pwsh', 'powershell'].find((command) => spawnSync(command, ['-NoProfile', '-Command', 'exit 0']).status === 0)

type Layout = { name: string; role?: string; collapsed?: boolean; children?: Layout[]; hidden?: Layout[] }
const done = (): Layout => ({ name: 'Done', role: 'Button' })
const title = 'Orbit acceptance done b7840ad1'
// Under "Do not disturb is on" no Windows banner shows, and the notification center lists the toast collapsed under its app
// group, with its action behind the expand chevron, as an installed acceptance recording showed.
const toastLayouts: Record<string, Layout> = {
  banner: { name: 'New notification', children: [{ name: 'toast', role: 'ListItem', children: [{ name: title }, { name: 'Next at 12:32 AM' }, done()] }] },
  center: { name: 'Notification Center', children: [{ name: 'Orbit-desktop', role: 'Group', children: [
    { name: 'toast', role: 'ListItem', collapsed: true, children: [{ name: title }, { name: 'Next at 12:32 AM' }], hidden: [done()] }] }] },
  noAction: { name: 'Notification Center', children: [{ name: 'toast', role: 'ListItem', children: [{ name: title }] }] },
  twoActions: { name: 'Notification Center', children: [{ name: 'toast', role: 'ListItem', children: [{ name: title }, done(), done()] }] },
  absent: { name: 'Notification Center', children: [{ name: 'toast', role: 'ListItem', children: [{ name: 'Other reminder' }, done()] }] },
}

function findToast(layout: Layout) {
  const source = readFileSync(uiaScript, 'utf8')
  const from = source.indexOf('function Find-ToastButton(')
  const to = source.indexOf('function New-AutomationTree(')
  assert.ok(from >= 0 && to > from, 'the reader has a Find-ToastButton rule ahead of its automation tree')
  const script = `$ErrorActionPreference = 'Stop'
${source.slice(from, to)}
function Build($layout, $parent) {
  $node = [pscustomobject]@{ name = $layout.name; role = $layout.role; collapsed = [bool]$layout.collapsed; parent = $parent
    children = New-Object 'System.Collections.Generic.List[object]'; hidden = @($layout.hidden) }
  foreach ($child in @($layout.children)) { if ($null -ne $child) { $node.children.Add((Build $child $node)) } }
  return $node
}
function Walk($node) { foreach ($child in $node.children) { $child; Walk $child } }
$root = Build (ConvertFrom-Json $env:ORBIT_LAYOUT) $null
$tree = @{
  Texts = { param($element, $text) @(Walk $element | Where-Object { $_.name -and $_.name.Contains($text) }) }
  Buttons = { param($element, $label) @(Walk $element | Where-Object { $_.role -eq 'Button' -and $_.name -eq $label }) }
  Parent = { param($element) $element.parent }
  Same = { param($first, $second) [object]::ReferenceEquals($first, $second) }
  Collapsed = { param($element) @(@($element) + @(Walk $element) | Where-Object { $_.collapsed }) }
  Expand = { param($element) $element.collapsed = $false; foreach ($child in $element.hidden) { if ($null -ne $child) { $element.children.Add((Build $child $element)) } } }
}
$match = Find-ToastButton $root '${title}' 'Done' $tree
if ($null -eq $match) { '{"found":false}' } else { @{ found = $true; toast = $match.toast.name; expanded = [bool]$match.expanded; button = $match.button.name } | ConvertTo-Json -Compress }
`
  const result = spawnSync(pwshHost!, ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 60000, env: { ...process.env, ORBIT_LAYOUT: JSON.stringify(layout) } })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout) as { found: boolean; toast?: string; expanded?: boolean; button?: string }
}

test('Windows notification reader takes the Done action from a banner and from a collapsed notification center entry', { skip: !pwshHost }, () => {
  assert.deepEqual(findToast(toastLayouts.banner!), { found: true, toast: 'toast', expanded: false, button: 'Done' })
  assert.deepEqual(findToast(toastLayouts.center!), { found: true, toast: 'toast', expanded: true, button: 'Done' })
  for (const layout of ['noAction', 'twoActions', 'absent']) assert.deepEqual(findToast(toastLayouts[layout]!), { found: false }, layout)
})

const launcherSource = readFileSync(fileURLToPath(new URL('./windows-unelevated.ps1', import.meta.url)), 'utf8')
// AppNotificationBuilderUtility.h EncodeArgument and EncodeXml in microsoft/WindowsAppSDK v1.7.9, one character at a time.
const percentCodes: Record<string, string> = { '%': '%25', ';': '%3B', '=': '%3D' }
const xmlCodes: Record<string, string> = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', "'": '&apos;' }
const encodeArgument = (value: string) => [...value].map((character) => percentCodes[character] ?? xmlCodes[character] ?? character).join('')
const encodeXml = (value: string) => [...value].map((character) => xmlCodes[character] ?? character).join('')
// push.cpp orbit_push_show through AppNotificationBuilder GetArguments and AppNotificationButton ToString: the body click
// carries the launch attribute, and the Done click carries the arguments attribute of its action. The Done arguments list
// orbitAction before orbitNotice, as the posted toast on windows-latest held them (argumentKeys in
// trees/notification-done-activator.json of run 42596523281).
function windowsToast(title: string, activation: string, label: string) {
  const notice = `orbitNotice=${encodeArgument(activation)}`
  return `<toast launch='${notice}'><visual><binding template='ToastGeneric'><text>${encodeXml(title)}</text><text>Next at 1:04 PM</text></binding></visual>` +
    `<actions><action content='${label}' arguments='orbitAction=done;${notice}'/></actions></toast>`
}
// AppNotificationActivatedEventArgs DecodeArguments with Decode, then push.cpp activated(): the notice routes to Done only
// with orbitAction=done, and else to the habit detail.
function shellRoute(argument: string) {
  const reverse: Record<string, string> = { '%25': '%', '%3B': ';', '%3D': '=' }
  const decode = (text: string) => {
    let result = ''
    for (let index = 0; index < text.length;) {
      const code = reverse[text.slice(index, index + 3)]
      result += code ?? text[index]
      index += code ? 3 : 1
    }
    return result
  }
  const values = new Map(argument.split(';').map((pair) => {
    const at = pair.indexOf('=')
    return at < 0 ? [decode(pair), ''] : [decode(pair.slice(0, at)), decode(pair.slice(at + 1))]
  }))
  if (!values.has('orbitNotice')) return null
  return { route: values.get('orbitAction') === 'done' ? 'done' : 'body', notice: values.get('orbitNotice') }
}
// The Rust WindowsNotice from push_windows.rs show. The token holds every character that EncodeArgument rewrites.
const activation = JSON.stringify({ owner: 'account-1', reminder: { url: '/', habitId: pushHabit, doneToken: 'a=b;c%d&e<f>\'g', doneLabel: 'Done' } })

function toastAction(payloads: string[], label: string, source = launcherSource) {
  const from = source.indexOf('function Get-ToastAction(')
  const to = source.indexOf('# The activation type declares')
  assert.ok(from >= 0 && to > from, 'the launcher has a Get-ToastAction rule ahead of its interface check')
  const script = `$ErrorActionPreference = 'Stop'
${source.slice(from, to)}
try { @{ arguments = (Get-ToastAction @(ConvertFrom-Json $env:ORBIT_PAYLOADS) $env:ORBIT_TITLE $env:ORBIT_LABEL) } | ConvertTo-Json -Compress }
catch { @{ error = $_.Exception.Message } | ConvertTo-Json -Compress }
`
  const result = spawnSync(pwshHost!, ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 60000,
    env: { ...process.env, ORBIT_PAYLOADS: JSON.stringify(payloads), ORBIT_TITLE: title, ORBIT_LABEL: label } })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout) as { arguments?: string; error?: string }
}

test('the Windows activator gives the shell the Done arguments of the posted toast, which the shell routes to Done', { skip: !pwshHost }, () => {
  const other = windowsToast('Orbit acceptance expired 0d1e2f3a', activation, 'Done')
  const chosen = toastAction([other, windowsToast(title, activation, 'Done')], 'Done')
  assert.deepEqual(shellRoute(chosen.arguments!), { route: 'done', notice: activation })
  assert.deepEqual(toastAction([other], 'Done'), { error: `Expected one posted toast titled ${title}, found 0 among 1` })
  assert.deepEqual(toastAction([windowsToast(title, activation, 'Done'), windowsToast(title, activation, 'Done')], 'Done'),
    { error: `Expected one posted toast titled ${title}, found 2 among 2` })
  assert.deepEqual(toastAction([windowsToast(title, activation, 'Concluir')], 'Done'), { error: `Expected one Done action on the toast titled ${title}, found 0` })
})

// A client pointed at the body arguments makes the click the shell routes to the habit detail, so the Done never logs.
test('a Windows activator that reads the toast launch arguments routes the click to the habit detail, not Done', { skip: !pwshHost }, () => {
  const read = "$actions[0].GetAttribute('arguments')"
  assert.ok(launcherSource.includes(read), 'the launcher reads the arguments of the Done action')
  const body = toastAction([windowsToast(title, activation, 'Done')], 'Done', launcherSource.replace(read, "$actions[0].ParentNode.ParentNode.GetAttribute('launch')"))
  assert.deepEqual(shellRoute(body.arguments!), { route: 'body', notice: activation })
})

test('PowerShell producer lists process windows, finds the installed executable, reads shell tokens and refuses an absent notification', { skip: process.platform !== 'win32' }, () => {
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
  assert.equal(typeof absent.notificationMode, 'string')
  assert.deepEqual(absent.history, { appId: null, posted: false, count: 0, titles: [], error: 'no executable path' })
  const unregistered = run('-TargetProcessId', String(process.pid), '-Command', 'notification', '-Title', `Orbit absent ${process.pid}`, '-Label', 'Done', '-Executable', process.execPath)
  const history = unregistered.history as { appId: null; posted: boolean; error: string; registrations: string[] }
  assert.equal(history.appId, null)
  assert.equal(history.posted, false)
  assert.equal(history.error, 'no NotificationGUID for the executable')
  assert.ok(Array.isArray(history.registrations))
  assert.equal(absent.titled, undefined)
  assert.ok(Array.isArray(absent.windows))
  assert.ok((absent.windows as { className: string; processId: number }[]).every(window => typeof window.className === 'string' && window.processId !== process.pid))
  assert.equal(absent.toast, undefined)
  // The activation command reads each token with the launcher's OrbitIntegrity, so this process reports a named level.
  const tokens = run('-TargetProcessId', '0', '-Command', 'activation', '-Executable', process.execPath) as {
    hosts: { processId: number; name: string; integrity: string | null; elevated: boolean; error: string | null }[]
    instances: { processId: number; integrity: string | null; elevated: boolean; error: string | null }[] }
  const level = /^(Untrusted|Low|Medium|MediumPlus|High|System|ProtectedProcess|0x[0-9A-F]{4})$/
  const self = tokens.instances.find((instance) => instance.processId === process.pid)
  assert.ok(self, 'the activation command lists this node process as an instance of its executable')
  assert.equal(self.error, null)
  assert.match(String(self.integrity), level)
  assert.equal(typeof self.elevated, 'boolean')
  assert.ok(tokens.hosts.some((host) => host.name === 'explorer'))
  assert.ok(tokens.hosts.every((host) => host.error ? host.integrity === null : level.test(String(host.integrity))))
})

// The installed acceptance reads the Orbit window bar through this reader (#2132), so it runs here against a real borderless window.
test('Windows window bar reader finds no caption above the client area and samples the canvas of the bar and the window state', { skip: process.platform !== 'win32' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-window-bar-'))
  try {
    const reader = fileURLToPath(new URL('./acceptance-window-bar.cs', import.meta.url))
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition (Get-Content -LiteralPath '${reader}' -Raw)
function Wait-Paint { for ($index = 0; $index -lt 10; $index++) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 50 } }
$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.BackColor = [System.Drawing.Color]::FromArgb(9, 9, 11)
$form.StartPosition = 'Manual'
$form.SetBounds(100, 100, 800, 400)
$form.TopMost = $true
$form.Show()
$form.Activate()
Wait-Paint
$borderless = [OrbitWindowBarReader]::Read($form.Handle, '${join(directory, 'borderless.png')}')
$state = [OrbitWindowBarReader]::State($form.Handle)
$form.WindowState = 'Minimized'
Wait-Paint
$minimized = [OrbitWindowBarReader]::Read($form.Handle, '${join(directory, 'minimized.png')}')
$form.WindowState = 'Normal'
$form.FormBorderStyle = 'Sizable'
$form.Text = 'Orbit window bar fixture'
Wait-Paint
$captioned = [OrbitWindowBarReader]::Read($form.Handle, '${join(directory, 'captioned.png')}')
$form.Close()
@{ borderless = $borderless; captioned = $captioned; state = $state; minimized = ($null -eq $minimized) } | ConvertTo-Json -Depth 6
`
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 60000 })
    assert.equal(result.status, 0, result.stderr)
    type Reading = { frame: number[]; captionHeight: number; menuBar: boolean; sampled: number; colors: { color: number[]; count: number }[]
      actions: { name: string; width: number; height: number; pixels: number[] }[] }
    const { borderless, captioned, state, minimized } = JSON.parse(result.stdout) as { borderless: Reading; captioned: Reading; minimized: boolean
      state: { rect: number[]; zoomed: boolean; iconic: boolean; visible: boolean } }
    assert.equal(borderless.captionHeight, 0, JSON.stringify(borderless))
    assert.equal(borderless.menuBar, false)
    assert.deepEqual(borderless.colors[0]!.color, [9, 9, 11], JSON.stringify(borderless))
    assert.ok(borderless.colors[0]!.count >= borderless.sampled * 0.9, JSON.stringify(borderless))
    // The reader crops the middle half of each 44px action of the 48px bar; the fixture paints the canvas everywhere.
    assert.deepEqual(borderless.actions.map(({ name, width, height }) => [name, width, height]),
      [['menu', 22, 24], ['minimize', 22, 24], ['maximize', 22, 24], ['close', 22, 24]])
    assert.ok(borderless.actions.every(({ pixels }) => pixels.length === 22 * 24 && pixels.filter((pixel) => pixel === 0x09090b).length >= pixels.length * 0.9),
      JSON.stringify(borderless.actions.map(({ pixels }) => pixels.slice(0, 4))))
    // A window that is minimized has no bar to read, even when its state was read before it turned minimized.
    assert.equal(minimized, true)
    // A window with the system caption has client area below its frame top, which is what the check rejects.
    assert.ok(captioned.captionHeight > 0, JSON.stringify(captioned))
    assert.deepEqual([state.zoomed, state.iconic, state.visible], [false, false, true])
    assert.deepEqual(state.rect, borderless.frame)
    for (const name of ['borderless.png', 'captioned.png']) assert.ok(statSync(join(directory, name)).size > 0, name)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

// The installed shell keeps its native menu attached, and tao answers WM_NCCALCSIZE of an undecorated window with a client
// area equal to the window (tao-0.37.2 src/platform_impl/windows/event_loop.rs:2074). A plain popup window with the same
// menu shows a menu bar above its client area, so the reader must tell the two apart.
const menuWindowFixture = `
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public sealed class OrbitMenuWindow : NativeWindow {
    [DllImport("user32.dll")] private static extern IntPtr CreateMenu();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool AppendMenuW(IntPtr menu, uint flags, UIntPtr item, string text);
    [DllImport("user32.dll")] private static extern bool SetMenu(IntPtr window, IntPtr menu);
    [DllImport("user32.dll")] private static extern IntPtr GetMenu(IntPtr window);
    [DllImport("user32.dll")] private static extern bool DrawMenuBar(IntPtr window);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    private const int CalculateSize = 0x0083;
    // SWP_NOSIZE, SWP_NOMOVE, SWP_NOZORDER, SWP_NOACTIVATE and SWP_FRAMECHANGED.
    private const uint FrameChanged = 0x0001 | 0x0002 | 0x0004 | 0x0010 | 0x0020;
    private bool clientCoversWindow;

    public OrbitMenuWindow(int x, int y, int width, int height) {
        // WS_POPUP and WS_VISIBLE, with WS_EX_TOPMOST.
        var parameters = new CreateParams { Caption = "Orbit menu fixture", X = x, Y = y, Width = width, Height = height,
            Style = unchecked((int)0x80000000) | 0x10000000, ExStyle = 0x00000008 };
        CreateHandle(parameters);
        IntPtr menu = CreateMenu();
        if (menu == IntPtr.Zero || !AppendMenuW(menu, 0, new UIntPtr(1), "File") || !SetMenu(Handle, menu)) throw new InvalidOperationException("Cannot attach the fixture menu");
        DrawMenuBar(Handle);
    }

    public bool HasMenu { get { return GetMenu(Handle) != IntPtr.Zero; } }

    public void CoverWindowWithClient() {
        clientCoversWindow = true;
        SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, FrameChanged);
    }

    protected override void WndProc(ref Message message) {
        // Returning 0 for either form keeps the proposed rectangle, so the client area is the whole window, as tao answers it.
        if (clientCoversWindow && message.Msg == CalculateSize) { message.Result = IntPtr.Zero; return; }
        base.WndProc(ref message);
    }
}
`

test('Windows window bar reader reports a menu bar only when the menu has a strip above the client area', { skip: process.platform !== 'win32' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-window-menu-'))
  try {
    const reader = fileURLToPath(new URL('./acceptance-window-bar.cs', import.meta.url))
    const fixture = join(directory, 'menu-window.cs')
    writeFileSync(fixture, menuWindowFixture)
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition (Get-Content -LiteralPath '${reader}' -Raw)
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition (Get-Content -LiteralPath '${fixture}' -Raw)
function Wait-Paint { for ($index = 0; $index -lt 10; $index++) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 50 } }
$window = New-Object OrbitMenuWindow -ArgumentList 100, 100, 800, 400
Wait-Paint
$shown = [OrbitWindowBarReader]::Read($window.Handle, '${join(directory, 'menu-shown.png')}')
$window.CoverWindowWithClient()
Wait-Paint
$covered = [OrbitWindowBarReader]::Read($window.Handle, '${join(directory, 'menu-covered.png')}')
$attached = $window.HasMenu
$window.DestroyHandle()
@{ shown = $shown; covered = $covered; attached = $attached } | ConvertTo-Json -Depth 6
`
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 60000 })
    assert.equal(result.status, 0, result.stderr)
    type Reading = { captionHeight: number; menuBar: boolean; menuRect: number[] | null }
    const { shown, covered, attached } = JSON.parse(result.stdout) as { shown: Reading; covered: Reading; attached: boolean }
    // The shown menu bar sits between the frame top and the client area, so both the caption height and the menu bar fail the check.
    assert.ok(shown.captionHeight > 0, JSON.stringify(shown))
    assert.equal(shown.menuBar, true, JSON.stringify(shown))
    // The covered window keeps its menu, as the shell keeps File > Exit, but has no strip to paint a menu bar in.
    assert.equal(attached, true)
    assert.equal(covered.captionHeight, 0, JSON.stringify(covered))
    assert.equal(covered.menuBar, false, JSON.stringify(covered))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

// The installed shell as the popup reading meets it: a window of the class Tauri gives its webview windows, with its native
// menu attached and the same menu open as a popup under the bar. muda-0.20.0 inserts every item into the menu bar and into a
// parallel popup menu that holds the same submenus (attach_item), and shows that popup after SetForegroundWindow with
// TrackPopupMenu, TPM_LEFTALIGN and TPM_RETURNCMD at a client point (show_context_menu). The flag and style values are those
// of windows-sys-0.61.2.
const popupWindowFixture = `
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public static class OrbitPopupFixture {
    private delegate IntPtr WindowProcedure(IntPtr window, uint message, IntPtr word, IntPtr parameter);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WindowClass {
        public uint style;
        public WindowProcedure procedure;
        public int classExtra;
        public int windowExtra;
        public IntPtr instance;
        public IntPtr icon;
        public IntPtr cursor;
        public IntPtr background;
        public string menuName;
        public string className;
    }
    [StructLayout(LayoutKind.Sequential)] private struct NativePoint { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] private struct NativeMessage {
        public IntPtr window;
        public uint message;
        public IntPtr word;
        public IntPtr parameter;
        public uint time;
        public NativePoint point;
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern ushort RegisterClassW(ref WindowClass definition);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateWindowExW(uint extended, string className, string title, uint style, int x, int y, int width, int height,
        IntPtr parent, IntPtr menu, IntPtr instance, IntPtr parameter);
    [DllImport("user32.dll")] private static extern IntPtr DefWindowProcW(IntPtr window, uint message, IntPtr word, IntPtr parameter);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandleW(string name);
    [DllImport("user32.dll")] private static extern IntPtr CreateMenu();
    [DllImport("user32.dll")] private static extern IntPtr CreatePopupMenu();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool AppendMenuW(IntPtr menu, uint flags, UIntPtr item, string text);
    [DllImport("user32.dll")] private static extern bool SetMenu(IntPtr window, IntPtr menu);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool ClientToScreen(IntPtr window, ref NativePoint point);
    [DllImport("user32.dll")] private static extern int TrackPopupMenu(IntPtr menu, uint flags, int x, int y, int reserved, IntPtr window, IntPtr rect);
    [DllImport("user32.dll")] private static extern bool PeekMessageW(out NativeMessage message, IntPtr window, uint first, uint last, uint remove);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref NativeMessage message);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessageW(ref NativeMessage message);
    [DllImport("user32.dll")] private static extern bool DestroyWindow(IntPtr window);
    private const uint Popup = 0x10, Checked = 0x8, ReturnCommand = 0x100, PopupStyle = 0x80000000, Visible = 0x10000000, Topmost = 0x8;
    // A field keeps the window procedure alive for as long as the window can call it.
    private static readonly WindowProcedure procedure = Procedure;

    private static IntPtr Procedure(IntPtr window, uint message, IntPtr word, IntPtr parameter) {
        return DefWindowProcW(window, message, word, parameter);
    }

    private static void Append(IntPtr menu, uint flags, UIntPtr item, string text) {
        if (!AppendMenuW(menu, flags, item, text)) throw new InvalidOperationException("Cannot build the fixture menu");
    }

    private static UIntPtr Submenu(IntPtr menu) {
        return new UIntPtr((ulong)menu.ToInt64());
    }

    // Opens the popup under the bar and returns its command once it closes. The window keeps answering messages after that
    // until the stop file exists, so the reader can read the window after it presses Escape.
    public static int Run(string stopFile) {
        var definition = new WindowClass { procedure = procedure, instance = GetModuleHandleW(null), className = "Tauri Window" };
        if (RegisterClassW(ref definition) == 0) throw new InvalidOperationException("Cannot register the Tauri Window class");
        IntPtr window = CreateWindowExW(Topmost, "Tauri Window", "Orbit popup fixture", PopupStyle | Visible, 100, 100, 800, 400,
            IntPtr.Zero, IntPtr.Zero, definition.instance, IntPtr.Zero);
        if (window == IntPtr.Zero) throw new InvalidOperationException("Cannot create the fixture window");
        IntPtr file = CreatePopupMenu(), help = CreatePopupMenu(), bar = CreateMenu(), popup = CreatePopupMenu();
        Append(file, 0, new UIntPtr(1u), "Exit\\tCtrl+Q");
        Append(help, 0, new UIntPtr(2u), "Support");
        Append(help, Checked, new UIntPtr(3u), "Launch at login");
        foreach (IntPtr menu in new[] { bar, popup }) {
            Append(menu, Popup, Submenu(file), "File");
            Append(menu, Popup, Submenu(help), "Help");
        }
        if (!SetMenu(window, bar)) throw new InvalidOperationException("Cannot attach the fixture menu");
        var anchor = new NativePoint { X = 4, Y = 48 };
        if (!ClientToScreen(window, ref anchor)) throw new InvalidOperationException("Cannot place the fixture popup");
        Console.Out.WriteLine("ready");
        Console.Out.Flush();
        SetForegroundWindow(window);
        int command = TrackPopupMenu(popup, ReturnCommand, anchor.X, anchor.Y, 0, window, IntPtr.Zero);
        DateTime deadline = DateTime.UtcNow.AddSeconds(60);
        NativeMessage message;
        while (!File.Exists(stopFile) && DateTime.UtcNow < deadline) {
            while (PeekMessageW(out message, IntPtr.Zero, 0, 0, 1)) {
                TranslateMessage(ref message);
                DispatchMessageW(ref message);
            }
            Thread.Sleep(20);
        }
        DestroyWindow(window);
        return command;
    }
}
`

// The menu action holds the native menu open as a popup while the reader runs, and UI Automation lists that popup as a
// top-level window of the same process in front of the app window (#2132). The reader must still read the app window, its
// menu and the popup, close the popup with Escape and read the window state.
test('Windows window bar reader reads the Tauri window and its menu while the popup menu of the same process is open', { skip: process.platform !== 'win32' }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-window-popup-'))
  const fixture = join(directory, 'popup-window.cs')
  const stop = join(directory, 'stop')
  writeFileSync(fixture, popupWindowFixture)
  const shell = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$ErrorActionPreference = 'Stop'; Add-Type -TypeDefinition (Get-Content -LiteralPath '${fixture}' -Raw); [OrbitPopupFixture]::Run('${stop}')`],
  { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  let errors = ''
  shell.stdout.setEncoding('utf8').on('data', (chunk: string) => { output += chunk })
  shell.stderr.setEncoding('utf8').on('data', (chunk: string) => { errors += chunk })
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`The popup fixture did not open: ${errors}`)), 60000)
      shell.stdout.on('data', () => { if (output.includes('ready')) { clearTimeout(timer); resolve() } })
      shell.on('exit', (code) => { clearTimeout(timer); reject(new Error(`The popup fixture exited with ${code}: ${errors}`)) })
    })
    const reader = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', uiaScript, '-TargetProcessId', String(shell.pid),
      '-Command', 'windowbar', '-Action', 'popup', '-Capture', join(directory, 'popup.png')], { encoding: 'utf8', timeout: 60000 })
    writeFileSync(stop, '')
    assert.equal(reader.status, 0, reader.stderr)
    type MenuItem = { id: number; text: string; enabled: boolean; checked: boolean; children: MenuItem[] }
    const { state, popup } = JSON.parse(reader.stdout) as { state: { rect: number[] }
      popup: { rect: number[]; anchor: number[]; items: MenuItem[]; windowMenu: MenuItem[]; closed: boolean } }
    const outline = (items: MenuItem[]): unknown[] => items.map(({ text, enabled, checked, children }) => [text, enabled, checked, outline(children)])
    assert.deepEqual(outline(popup.items), [['File', true, false, [['Exit\tCtrl+Q', true, false, []]]],
      ['Help', true, false, [['Support', true, false, []], ['Launch at login', true, true, []]]]], JSON.stringify(popup))
    assert.deepEqual(popup.items, popup.windowMenu)
    assert.equal(popup.closed, true)
    // TrackPopupMenu puts the top left corner of the popup at the anchor, the start of the menu action under the bar.
    assert.ok(Math.abs(popup.rect[0]! - popup.anchor[0]!) <= 8 && Math.abs(popup.rect[1]! - popup.anchor[1]!) <= 8, JSON.stringify(popup))
    // The state is the fixture window's, which is wider than its popup menu.
    assert.ok(state.rect[2]! - state.rect[0]! > popup.rect[2]! - popup.rect[0]!, JSON.stringify({ state, popup }))
  } finally {
    shell.kill()
    rmSync(directory, { recursive: true, force: true })
  }
})
