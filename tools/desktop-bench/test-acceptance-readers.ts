import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
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

// The installed acceptance reads the Orbit caption through this reader (#2084), so it runs here against a real DWM caption.
test('Windows caption reader samples the canvas caption that DWMWA_CAPTION_COLOR paints, above the client area and above a menu bar', { skip: process.platform !== 'win32' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-caption-'))
  try {
    const reader = fileURLToPath(new URL('./acceptance-caption.cs', import.meta.url))
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition (Get-Content -LiteralPath '${reader}' -Raw)
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CaptionFixture {
    [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
}
'@
function Wait-Paint { for ($index = 0; $index -lt 10; $index++) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 50 } }
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Orbit caption fixture'
$form.StartPosition = 'Manual'
$form.SetBounds(100, 100, 800, 400)
$form.TopMost = $true
$form.Show()
# DWMWA_CAPTION_COLOR (35) takes a COLORREF, 0x00BBGGRR, so the dark canvas #09090B is 0x000B0909.
$color = 0x000B0909
$status = [CaptionFixture]::DwmSetWindowAttribute($form.Handle, 35, [ref]$color, 4)
$form.Activate()
Wait-Paint
$plain = [OrbitCaptionReader]::Read($form.Handle, '${join(directory, 'plain.png')}')
$form.Menu = New-Object System.Windows.Forms.MainMenu
[void]$form.Menu.MenuItems.Add('File')
Wait-Paint
$menu = [OrbitCaptionReader]::Read($form.Handle, '${join(directory, 'menu.png')}')
$form.Close()
@{ status = $status; plain = $plain; menu = $menu } | ConvertTo-Json -Depth 6
`
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 60000 })
    assert.equal(result.status, 0, result.stderr)
    type Caption = { frame: number[]; bottom: number; menuBar: boolean; sampled: number; colors: { color: number[]; count: number }[] }
    const { status, plain, menu } = JSON.parse(result.stdout) as { status: number; plain: Caption; menu: Caption }
    assert.equal(status, 0, 'the runner supports DWMWA_CAPTION_COLOR')
    assert.deepEqual([plain.menuBar, menu.menuBar], [false, true])
    for (const caption of [plain, menu]) {
      assert.ok(caption.bottom > caption.frame[1]! && caption.sampled > 0, JSON.stringify(caption))
      assert.deepEqual(caption.colors[0]!.color, [9, 9, 11], JSON.stringify(caption))
      assert.ok(caption.colors[0]!.count >= caption.sampled * 0.9, JSON.stringify(caption))
    }
    // The menu bar starts below the caption, so its rows never enter the sample.
    assert.ok(Math.abs((menu.bottom - menu.frame[1]!) - (plain.bottom - plain.frame[1]!)) <= 1, JSON.stringify({ plain, menu }))
    for (const name of ['plain.png', 'menu.png']) assert.ok(statSync(join(directory, name)).size > 0, name)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

// DWMWA_CAPTION_COLOR paints the canvas whatever the window theme is, so the read-back flag is what shows the window theme (#2084).
// Microsoft documents DWMWA_USE_IMMERSIVE_DARK_MODE for DwmSetWindowAttribute, so this real window proves the read-back on the runner.
test('Windows caption reader reads back the window theme flag on both Orbit canvas colours', { skip: process.platform !== 'win32' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-caption-theme-'))
  try {
    const reader = fileURLToPath(new URL('./acceptance-caption.cs', import.meta.url))
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition (Get-Content -LiteralPath '${reader}' -Raw)
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CaptionFixture {
    [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
}
'@
function Wait-Paint { for ($index = 0; $index -lt 20; $index++) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 50 } }
# DWMWA_CAPTION_COLOR (35) takes a COLORREF, 0x00BBGGRR. DWMWA_USE_IMMERSIVE_DARK_MODE (20) takes a BOOL.
$canvases = @{ light = 0x00FAFAFA; dark = 0x000B0909 }
$results = @{}
foreach ($canvas in 'light', 'dark') {
  foreach ($theme in 'light', 'dark') {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Orbit caption theme fixture'
    $form.StartPosition = 'Manual'
    $form.SetBounds(100, 100, 800, 400)
    $form.TopMost = $true
    $form.Show()
    $color = $canvases[$canvas]
    $dark = if ($theme -eq 'dark') { 1 } else { 0 }
    $colorStatus = [CaptionFixture]::DwmSetWindowAttribute($form.Handle, 35, [ref]$color, 4)
    $themeStatus = [CaptionFixture]::DwmSetWindowAttribute($form.Handle, 20, [ref]$dark, 4)
    $form.Activate()
    Wait-Paint
    $reading = [OrbitCaptionReader]::Read($form.Handle, (Join-Path '${directory}' "$canvas-$theme.png"))
    $results["$canvas-$theme"] = @{ colorStatus = $colorStatus; themeStatus = $themeStatus; caption = $reading }
    $form.Close()
  }
}
$results | ConvertTo-Json -Depth 7
`
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 120000 })
    assert.equal(result.status, 0, result.stderr)
    type Reading = { colorStatus: number; themeStatus: number; caption: { colors: { color: number[] }[]; darkMode: number; darkModeStatus: number } }
    const readings = JSON.parse(result.stdout) as Record<string, Reading>
    const canvas = { light: [250, 250, 250], dark: [9, 9, 11] }
    const hresult = (status: number) => `0x${(status >>> 0).toString(16).toUpperCase().padStart(8, '0')}`
    for (const canvasMode of ['light', 'dark'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        const reading = readings[`${canvasMode}-${theme}`]!
        const label = `${canvasMode} canvas with the ${theme} window theme: ${JSON.stringify(reading)}`
        assert.equal(reading.colorStatus, 0, `DWMWA_CAPTION_COLOR failed with HRESULT ${hresult(reading.colorStatus)}: ${label}`)
        assert.equal(reading.themeStatus, 0, `DWMWA_USE_IMMERSIVE_DARK_MODE failed with HRESULT ${hresult(reading.themeStatus)}: ${label}`)
        assert.equal(reading.caption.darkModeStatus, 0, `The DWMWA_USE_IMMERSIVE_DARK_MODE read-back failed with HRESULT ${hresult(reading.caption.darkModeStatus)}: ${label}`)
        assert.equal(reading.caption.darkMode, theme === 'dark' ? 1 : 0, `The read-back flag is not the window theme that the fixture set: ${label}`)
        assert.deepEqual(reading.caption.colors[0]!.color, canvas[canvasMode], `The caption is not the canvas colour: ${label}`)
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
