import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { activateUnelevated, activationStatus, keepInstalledLaunchCopy, launchStatus, launchUnelevated } from './acceptance-platform.mjs'

// The High modes compile the launcher's native types from windows-unelevated.cs beside the script, so both reach the output.
const launcherCopies = [[fileURLToPath(new URL('./windows-unelevated.ps1', import.meta.url)), join('/output', 'windows-unelevated.ps1')],
  [fileURLToPath(new URL('./windows-unelevated.cs', import.meta.url)), join('/output', 'windows-unelevated.cs')]]

function windowsLauncher(script: { statusAfterStart?: string[]; statusAfterDelay?: string[]; alive?: boolean }) {
  const lines: string[] = []
  const calls: string[][] = []
  const copies: string[][] = []
  const tracked: unknown[] = []
  const stopped: unknown[] = []
  let clock = 0
  const host = {
    copyFile: async (source: string, destination: string) => { copies.push([source, destination]) },
    execute: async (command: string, args: string[]) => {
      calls.push([command, ...args])
      if (command !== 'powershell.exe') return ''
      lines.push(...script.statusAfterStart ?? [])
      return `${JSON.stringify({ harness: high, launcher: 31, outputLabel: 'Mandatory Label\\Medium Mandatory Level:(OI)(CI)(NW)' })}\r\n`
    },
    readFile: async () => {
      if (!lines.length) throw Object.assign(new Error('missing status'), { code: 'ENOENT' })
      return `${lines.join('\n')}\n`
    },
    waitFor: async (read: () => Promise<unknown>, label: string) => {
      const value = await read()
      if (!value) throw new Error(`Timed out waiting for ${label}`)
      return value
    },
    delay: async (milliseconds: number) => { clock += milliseconds; lines.push(...script.statusAfterDelay?.splice(0) ?? []) },
    alive: () => script.alive ?? true, now: () => clock,
    track: (handle: unknown) => { tracked.push(handle) }, stop: async (handle: unknown) => { stopped.push(handle) },
  }
  return { host, calls, copies, tracked, stopped }
}

// The renamed built-in Administrator keeps RID 500 and, with Admin Approval Mode off for it, a High token. The launcher
// gives the shell a Safer standard-user token at Medium integrity. TokenIsElevated stays true on that token (hosted
// windows-latest producer run), and the Safer level leaves the Administrators group deny-only.
const token = (integrity: string, integrityRid: number, administrators: string) =>
  ({ user: 'RUNNER\\runneradmin', sid: 'S-1-5-21-1-2-3-500', rid: 500, integrity, integrityRid, tokenIsElevated: true, administrators, session: 1 })
const medium = token('Medium', 0x2000, 'denyOnly')
const high = token('High', 0x3000, 'enabled')
const context = (value: object) => JSON.stringify({ kind: 'context', context: value })
const exited = JSON.stringify({ kind: 'exit', code: 0 })
const launched = (pid: number, shell?: object) => JSON.stringify({ kind: 'launch', pid, ...(shell ? { shell } : { shellError: 'Access is denied' }) })

test('the Windows launcher starts the shell at Medium integrity, reports every token and waits for its recorded exit', async () => {
  const launch = windowsLauncher({ statusAfterStart: [context(medium), launched(4242, medium)], statusAfterDelay: [JSON.stringify({ kind: 'exit', code: 0 })] })
  const handle = await launchUnelevated('/output/installed/orbit-desktop.exe', '/output', 'push', launch.host) as
    { child: { pid: number; exitCode: number | null }; done: Promise<void>; log: string; context: unknown }
  assert.equal(handle.child.pid, 4242)
  assert.equal(handle.log, join('/output', 'push.log'))
  assert.deepEqual(handle.context, { ...medium, source: 'shell', launcher: medium, harness: high,
    outputLabel: 'Mandatory Label\\Medium Mandatory Level:(OI)(CI)(NW)' })
  assert.deepEqual(launch.tracked, [handle])
  await handle.done
  assert.equal(handle.child.exitCode, 0)
  assert.deepEqual(launch.calls, [['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join('/output', 'windows-unelevated.ps1'),
    '-Mode', 'start', '-Executable', '/output/installed/orbit-desktop.exe', '-Log', join('/output', 'push.log'), '-Output', join('/output', 'push.stdout.log'),
    '-Status', join('/output', 'push-launch.jsonl')]])
  assert.deepEqual(launch.copies, launcherCopies)
})

test('the Windows launcher judges the shell by integrity level, not by Administrators membership or TokenIsElevated', async () => {
  for (const [shell, recorded, accepted] of [[medium, medium, true], [high, high, false], [token('System', 0x4000, 'enabled'), medium, false],
    [token('Low', 0x1000, 'denyOnly'), token('Low', 0x1000, 'denyOnly'), true], [token('MediumPlus', 0x2100, 'enabled'), medium, true]] as const) {
    const launch = windowsLauncher({ statusAfterStart: [context(recorded), launched(7, shell)], statusAfterDelay: [exited] })
    const result = launchUnelevated('/output/orbit-desktop.exe', '/output', 'installed', launch.host)
    if (accepted) await result
    else {
      await assert.rejects(() => result, new RegExp(`^Error: The installed shell started at ${shell.integrity} integrity as RUNNER\\\\runneradmin ` +
        '\\(user RID 500, TokenIsElevated true\\); app notifications need Medium integrity or below$'))
    }
    assert.equal(launch.stopped.length, accepted ? 0 : 1)
  }
  // A shell that exits before its token is read inherited the launcher's token, so the launcher's level decides.
  const early = windowsLauncher({ statusAfterStart: [context(high), launched(8)], statusAfterDelay: [exited] })
  await assert.rejects(() => launchUnelevated('/output/orbit-desktop.exe', '/output', 'installed', early.host), /started at High integrity/)
  const inherited = windowsLauncher({ statusAfterStart: [context(medium), launched(9)], statusAfterDelay: [exited] })
  const handle = await launchUnelevated('/output/orbit-desktop.exe', '/output', 'installed', inherited.host) as { context: Record<string, unknown> }
  assert.equal(handle.context.source, 'launcher')
  assert.equal(handle.context.shellError, 'Access is denied')
  const unknown = windowsLauncher({ statusAfterStart: [launched(10)], statusAfterDelay: [exited] })
  await assert.rejects(() => launchUnelevated('/output/orbit-desktop.exe', '/output', 'installed', unknown.host),
    /^Error: The installed shell started at an unknown integrity as an unknown user; app notifications need Medium integrity or below$/)
})

test('the Windows launcher refuses a failed launch, a missing launch, a nonzero exit and a vanished launcher', async () => {
  const failed = windowsLauncher({ statusAfterStart: [context(medium), JSON.stringify({ kind: 'error', message: 'Access is denied' })] })
  await assert.rejects(() => launchUnelevated('/output/orbit-desktop.exe', '/output', 'installed', failed.host),
    /^Error: Medium-integrity launch failed: Access is denied; launcher 31 was still running and is stopped; see .*installed-launch\.jsonl$/)
  assert.deepEqual(failed.calls.at(-1), ['taskkill.exe', '/PID', '31', '/T', '/F'])
  const absent = windowsLauncher({ alive: false })
  await assert.rejects(() => launchUnelevated('/output/orbit-desktop.exe', '/output', 'installed', absent.host),
    /^Error: Timed out waiting for the Medium-integrity installed launch; launcher 31 had exited; see .*installed-launch\.jsonl$/)
  assert.equal(absent.calls.length, 1)
  const crashed = windowsLauncher({ statusAfterStart: [context(medium), launched(8, medium)], statusAfterDelay: [JSON.stringify({ kind: 'exit', code: 101 })] })
  const crashedHandle = await launchUnelevated('/output/orbit-desktop.exe', '/output', 'push', crashed.host) as { done: Promise<void>; child: { exitCode: number } }
  await assert.rejects(() => crashedHandle.done, /exited 101; see/)
  const vanished = windowsLauncher({ statusAfterStart: [context(medium), launched(9, medium)], alive: false })
  const vanishedHandle = await launchUnelevated('/output/orbit-desktop.exe', '/output', 'push', vanished.host) as { done: Promise<void>; child: { exitCode: number } }
  await assert.rejects(() => vanishedHandle.done, /exited without a recorded exit code/)
  assert.equal(vanishedHandle.child.exitCode, -1)
  assert.equal(vanished.calls.length, 1)
})

// windows-unelevated.ps1 activate mode prints the High context, the client pid, the confirmed header, the activator
// registration and the argument keys; the Medium client appends its token and the Activate HRESULT to the status file. The
// argument keys follow trees/notification-done-activator.json of run 42596523281.
const activateStarted = { harness: high, client: 5150, header: 'C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\um\\NotificationActivationCallback.h',
  registration: { appId: '{0F8FAD5B-D9CB-469F-A165-70867728950E}', clsid: '{7D1B6A3C-5E2F-4A80-9C11-2B3C4D5E6F71}',
    server: '"C:\\Orbit\\orbit-desktop.exe" ----AppNotificationActivated:' }, argumentKeys: ['orbitAction', 'orbitNotice'] }

function windowsActivator(status: string[], alive = true) {
  const calls: string[][] = []
  const copies: string[][] = []
  const host = {
    copyFile: async (source: string, destination: string) => { copies.push([source, destination]) },
    execute: async (command: string, args: string[]) => { calls.push([command, ...args]); return command === 'powershell.exe' ? `${JSON.stringify(activateStarted)}\r\n` : '' },
    readFile: async () => {
      if (!status.length) throw Object.assign(new Error('missing status'), { code: 'ENOENT' })
      return `${status.join('\n')}\n`
    },
    waitFor: async (read: () => Promise<unknown>, label: string, timeout: number) => {
      const value = await read()
      if (!value) throw new Error(`Timed out waiting for ${label} after ${timeout} ms`)
      return value
    },
    alive: () => alive,
  }
  return { host, calls, copies }
}

const activation = { executable: 'C:\\Orbit\\orbit-desktop.exe', output: '/output', name: 'notification-done-activator', title: 'Orbit acceptance done b7840ad1', label: 'Done' }

test('the Windows activator passes the toast title and label to the High mode and returns the client token with the Activate HRESULT', async () => {
  const activator = windowsActivator([context(medium), JSON.stringify({ kind: 'activated', hresult: 0 })])
  assert.deepEqual(await activateUnelevated(activation, activator.host), { ...activateStarted, context: medium, hresult: 0 })
  assert.deepEqual(activator.calls, [['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join('/output', 'windows-unelevated.ps1'),
    '-Mode', 'activate', '-Executable', 'C:\\Orbit\\orbit-desktop.exe', '-Title', 'Orbit acceptance done b7840ad1', '-Label', 'Done',
    '-Status', join('/output', 'notification-done-activator.jsonl'), '-Request', join('/output', 'notification-done-activator-request.json')]])
  assert.deepEqual(activator.copies, launcherCopies)
})

test('the Windows activator returns a client error with the client token, and a refused Activate with its HRESULT', async () => {
  const failure = 'CoCreateInstance({7D1B6A3C-5E2F-4A80-9C11-2B3C4D5E6F71}, CLSCTX_LOCAL_SERVER) failed with 0x80080005'
  const failed = windowsActivator([context(medium), JSON.stringify({ kind: 'error', message: failure })])
  assert.deepEqual(await activateUnelevated(activation, failed.host), { ...activateStarted, context: medium, error: failure })
  const refused = windowsActivator([context(medium), JSON.stringify({ kind: 'activated', hresult: -2147467259 })])
  assert.equal((await activateUnelevated(activation, refused.host)).hresult, -2147467259)
  assert.deepEqual(activationStatus(''), { context: undefined })
})

test('the Windows activator stops a client that never reports and names its status file', async () => {
  const running = windowsActivator([context(medium)])
  await assert.rejects(() => activateUnelevated(activation, running.host),
    /^Error: Timed out waiting for the Medium-integrity notification-done-activator client after 150000 ms; client 5150 was still running and is stopped; see .*notification-done-activator\.jsonl$/)
  assert.deepEqual(running.calls.at(-1), ['taskkill.exe', '/PID', '5150', '/T', '/F'])
  const exited = windowsActivator([], false)
  await assert.rejects(() => activateUnelevated(activation, exited.host), /client 5150 had exited; see /)
  assert.equal(exited.calls.length, 1)
})

const launcherScript = fileURLToPath(new URL('./windows-unelevated.ps1', import.meta.url))
const launcherTypes = fileURLToPath(new URL('./windows-unelevated.cs', import.meta.url))

// Add-Type compiles through CodeDom, which a Medium-integrity process cannot run, so only the High modes may compile.
test('the Windows launcher compiles its native types only in the High start and activate modes', () => {
  const lines = readFileSync(launcherScript, 'utf8').split(/\r?\n/)
  const code = (line: string) => !line.trim().startsWith('#')
  const block = (mode: string) => {
    const start = lines.findIndex((line) => line === `    '${mode}' {`)
    assert.ok(start > 0, `the script has a ${mode} mode`)
    let end = start + 1
    while (end < lines.length && !/^    '[a-z]+' \{$/.test(lines[end]!) && lines[end] !== '}') end++
    return lines.slice(start, end).filter(code)
  }
  const compiler = lines.findIndex((line) => line.startsWith('function Initialize-MediumOutput('))
  const compilerEnd = lines.findIndex((line, index) => index > compiler && line === '}')
  assert.ok(compiler > 0 && compilerEnd > compiler, 'the script compiles in one function')
  const compiling = lines.flatMap((line, index) => code(line) && /\bAdd-Type\b/.test(line) ? [index] : [])
  assert.ok(compiling.length > 0, 'the script compiles its native types')
  assert.deepEqual(compiling.filter((index) => index < compiler || index > compilerEnd).map((index) => lines[index]!.trim()), [])
  for (const mode of ['run', 'notify']) assert.deepEqual(block(mode).filter((line) => /Initialize-MediumOutput|Add-Type/.test(line)), [], mode)
  for (const mode of ['start', 'activate']) assert.ok(block(mode).some((line) => line.includes('Initialize-MediumOutput $directory')), mode)
})

const powershellHost = ['pwsh', 'powershell'].find((command) => spawnSync(command, ['-NoProfile', '-Command', 'exit 0']).status === 0)

test('the Windows launcher script parses without errors', { skip: !powershellHost }, () => {
  const result = spawnSync(powershellHost!, ['-NoProfile', '-Command',
    `$errors = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${launcherScript}', [ref]$null, [ref]$errors); $errors.Count`], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), '0')
})

const integrity = (value: { integrity?: string; integrityRid?: number } | undefined) => `${value?.integrity}:${value?.integrityRid}`

function assertToken(value: Record<string, unknown> | undefined) {
  assert.equal(typeof value?.user, 'string')
  assert.match(String(value?.sid), /^S-1-5-/)
  assert.ok(Number.isInteger(value?.rid) && Number.isInteger(value?.integrityRid))
  assert.match(String(value?.integrity), /^(Untrusted|Low|Medium|MediumPlus|High|System|ProtectedProcess|0x[0-9A-F]{4})$/)
  assert.equal(typeof value?.tokenIsElevated, 'boolean')
  assert.ok(['absent', 'denyOnly', 'disabled', 'enabled'].includes(String(value?.administrators)), `administrators ${value?.administrators}`)
}

function launcherRunning(pid: number) {
  try { process.kill(pid, 0); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error }
}

// The producer check runs in the same elevated job as the installed acceptance, so this launches a real Medium process there.
// An elevated token lowered only to Medium keeps the Administrators group enabled, and WebView2 fails under it with 0x80010108.
// TokenIsElevated cannot tell the two apart, because it stays true for the Safer token, so only the group state is asserted.
function startHostname(script: string, directory: string) {
  const status = join(directory, 'hostname-launch.jsonl')
  const started = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Mode', 'start',
    '-Executable', join(process.env.SystemRoot!, 'System32', 'hostname.exe'), '-Log', join(directory, 'hostname.log'),
    '-Output', join(directory, 'hostname.stdout.log'), '-Status', status], { encoding: 'utf8', timeout: 120000 })
  assert.equal(started.status, 0, started.stderr)
  return { status, harness: JSON.parse(started.stdout) as { harness: Record<string, unknown>; launcher: number; outputLabel: string } }
}

async function awaitLauncherExit(launcher: number) {
  // The exit line is the launcher's last statement, but PowerShell still holds the directory and its library until it ends.
  for (let attempt = 0; attempt < 120 && launcherRunning(launcher); attempt++) await new Promise((resolve) => setTimeout(resolve, 250))
  assert.equal(launcherRunning(launcher), false, `launcher ${launcher} still runs 30 s after its exit line`)
}

// The elevated harness token holds the Administrators group enabled, so this check proves the reader can report "enabled" at
// all; the mutation test below proves the check fails when the reader never matches the group.
const assertAdministratorsEnabled = (value: Record<string, unknown>) => assert.equal(value.administrators, 'enabled')

test('the Windows launcher start mode runs a real executable as an unelevated standard user at Medium integrity and records its exit', { skip: process.platform !== 'win32' }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-unelevated-'))
  try {
    const { status, harness } = startHostname(launcherScript, directory)
    assertToken(harness.harness)
    assertAdministratorsEnabled(harness.harness)
    assert.ok(Number.isInteger(harness.launcher) && harness.launcher > 0)
    assert.match(harness.outputLabel, /Medium Mandatory Level/)
    let parsed: ReturnType<typeof launchStatus> = {} as ReturnType<typeof launchStatus>
    for (let attempt = 0; attempt < 240 && !parsed.exit; attempt++) {
      try { parsed = launchStatus(readFileSync(status, 'utf8')) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      if (!parsed.exit) await new Promise((resolve) => setTimeout(resolve, 250))
    }
    assertToken(parsed.context)
    assertToken(parsed.shell)
    assert.equal(integrity(parsed.context), 'Medium:8192')
    assert.equal(integrity(parsed.shell), 'Medium:8192')
    assert.notEqual(parsed.context?.administrators, 'enabled')
    assert.notEqual(parsed.shell?.administrators, 'enabled')
    assert.ok(Number.isInteger(parsed.pid) && parsed.pid! > 0)
    assert.deepEqual(parsed.exit, { kind: 'exit', code: 0 })
    assert.ok(readFileSync(join(directory, 'hostname.stdout.log'), 'utf8').trim().length > 0)
    await awaitLauncherExit(harness.launcher)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the Administrators check fails for a token reader that never matches S-1-5-32-544', { skip: process.platform !== 'win32' }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-unelevated-'))
  try {
    const source = readFileSync(launcherTypes, 'utf8')
    const group = 'AdministratorsSid = "S-1-5-32-544"'
    assert.ok(source.includes(group), 'the reader names the Administrators group')
    const mutated = join(directory, 'windows-unelevated.ps1')
    copyFileSync(launcherScript, mutated)
    writeFileSync(join(directory, 'windows-unelevated.cs'), source.replace(group, 'AdministratorsSid = "S-1-5-32-0"'))
    const { harness } = startHostname(mutated, directory)
    assertToken(harness.harness)
    assert.equal(harness.harness.administrators, 'absent')
    assert.throws(() => assertAdministratorsEnabled(harness.harness), /Expected values to be strictly equal/)
    await awaitLauncherExit(harness.launcher)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the Windows launcher run mode records a library it cannot load as a launch error', { skip: process.platform !== 'win32' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-unelevated-'))
  try {
    const status = join(directory, 'status.jsonl')
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', launcherScript, '-Mode', 'run',
      '-Executable', join(process.env.SystemRoot!, 'System32', 'hostname.exe'), '-Log', join(directory, 'run.log'), '-Output', join(directory, 'run.stdout.log'),
      '-Status', status, '-Assembly', join(directory, 'missing.dll')], { encoding: 'utf8', timeout: 60000 })
    assert.notEqual(result.status, 0)
    assert.throws(() => launchStatus(readFileSync(status, 'utf8')), /^Error: Medium-integrity launch failed: .*missing\.dll/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

function launcherFunctions(names: string[]) {
  const source = readFileSync(launcherScript, 'utf8')
  const integrity = `$integritySource = Get-Content -LiteralPath '${launcherTypes.replaceAll("'", "''")}' -Raw`
  return [integrity, ...names.map((name) => {
    const from = source.search(new RegExp(`function ${name}[ (]`))
    // A Windows checkout can carry CRLF line ends, so the closing brace of a function matches either end.
    const end = /\r?\n}\r?\n/g
    end.lastIndex = Math.max(from, 0)
    const close = end.exec(source)
    assert.ok(from >= 0 && close, `the launcher defines ${name}`)
    return source.slice(from, close.index + close[0].length)
  })].join('\n')
}

// The activation type declares the INotificationActivationCallback IID by hand; the producer check confirms it against the
// Windows SDK headers of the same runner image before the installed acceptance relies on it.
// Windows PowerShell compiles for the .NET Framework that the notify mode loads, and a script file keeps its quotes intact.
function windowsPowerShell(directory: string, script: string, ...args: string[]) {
  const path = join(directory, `script-${args.length}.ps1`)
  writeFileSync(path, `$ErrorActionPreference = 'Stop'\r\n${script}`)
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path, ...args], { encoding: 'utf8', timeout: 120000 })
}

test('the INotificationActivationCallback IID matches every installed Windows SDK header', { skip: process.platform !== 'win32' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-activator-'))
  try {
    const result = windowsPowerShell(directory, `${launcherFunctions(['Confirm-CallbackInterface'])}\r\nAdd-Type -TypeDefinition $integritySource\r\nConfirm-CallbackInterface`)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout.trim(), /\\Windows Kits\\10\\Include\\[^\\]+\\um\\NotificationActivationCallback\.h$/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the Windows notify mode records a COM failure with its HRESULT for an activator that nobody registered', { skip: process.platform !== 'win32' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-activator-'))
  try {
    const assembly = join(directory, 'OrbitIntegrity-test.dll')
    const compiled = windowsPowerShell(directory, `${launcherFunctions([])}\r\nAdd-Type -TypeDefinition $integritySource -OutputAssembly $args[0] -OutputType Library`, assembly)
    assert.equal(compiled.status, 0, compiled.stderr)
    const request = join(directory, 'request.json')
    const clsid = '{6B0F4C29-1D7E-4E5A-8B31-0C9D2E3F4A5B}'
    writeFileSync(request, JSON.stringify({ clsid, appId: 'Orbit.Acceptance.Absent', arguments: 'orbitAction=done;orbitNotice=x' }))
    const status = join(directory, 'status.jsonl')
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', launcherScript, '-Mode', 'notify',
      '-Status', status, '-Assembly', assembly, '-Request', request], { encoding: 'utf8', timeout: 120000 })
    assert.notEqual(result.status, 0)
    const parsed = activationStatus(readFileSync(status, 'utf8'))
    assertToken(parsed.context)
    // REGDB_E_CLASSNOTREG: no running class object and no LocalServer32 registration for the CLSID.
    assert.equal(parsed.error, `CoCreateInstance(${clsid}, CLSCTX_LOCAL_SERVER) failed with 0x80040154`)
    assert.equal(parsed.hresult, undefined)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

// LaunchServices answers in the shape of the AX helper's `bundles` reply: every registered copy, best match first. The fake
// ranks a present copy first; the harness itself fails when the real ranking names any copy but the installed one.
function launchServices(copies: string[], { keepsRemoved = false, missing = [] as string[] } = {}) {
  const calls: string[][] = []
  const host = {
    exists: async (path: string) => !missing.includes(path),
    execute: async (command: string, args: string[]) => {
      calls.push([command, ...args])
      if (command === '/usr/libexec/PlistBuddy') return 'org.useorbit.desktop.staging\n'
      if (!keepsRemoved && args[0] === '-u') copies.splice(copies.indexOf(args[1]!), 1)
      return ''
    },
    bundles: async (identifier: string) => { calls.push(['bundles', identifier]); return { copies: copies.slice(), best: copies.find((path) => !missing.includes(path)) ?? null } },
    remove: async (path: string) => { calls.push(['remove', path]) },
  }
  return { host, calls }
}

const installedApp = '/Applications/Orbit Staging.app'
const buildApp = '/work/orbit/apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Orbit Staging.app'
const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'

test('a notification Done can start only the installed copy, because the build copy leaves LaunchServices before the push phase', async () => {
  // usernoted started the build copy for the expired-session Done of run 42704572115, which LaunchServices ranked first.
  const { host, calls } = launchServices([buildApp, installedApp])
  assert.deepEqual(await keepInstalledLaunchCopy(installedApp, ['/work/orbit', '/work/_temp/output'], host),
    { identifier: 'org.useorbit.desktop.staging', removed: [buildApp], best: installedApp })
  assert.deepEqual(calls, [
    ['/usr/libexec/PlistBuddy', '-c', 'Print :CFBundleIdentifier', `${installedApp}/Contents/Info.plist`],
    ['bundles', 'org.useorbit.desktop.staging'],
    [lsregister, '-u', buildApp],
    ['remove', buildApp],
    ['bundles', 'org.useorbit.desktop.staging'],
  ])
})

test('the launch copy check leaves a vanished disk image copy alone, because lsregister -u exits 1 for a missing path', async () => {
  const mounted = '/work/_temp/output/mounted/Orbit Staging.app'
  const { host, calls } = launchServices([buildApp, mounted, installedApp], { missing: [mounted] })
  assert.deepEqual(await keepInstalledLaunchCopy(installedApp, ['/work/orbit', '/work/_temp/output'], host),
    { identifier: 'org.useorbit.desktop.staging', removed: [buildApp], best: installedApp })
  assert.equal(calls.some((call) => call.includes(mounted)), false)
})

test('the launch copy check refuses a copy outside the harness directories and a copy LaunchServices still ranks first', async () => {
  const foreign = launchServices(['/opt/elsewhere/Orbit Staging.app', installedApp])
  await assert.rejects(() => keepInstalledLaunchCopy(installedApp, ['/work/orbit', '/work/_temp/output'], foreign.host),
    /^Error: LaunchServices lists org\.useorbit\.desktop\.staging at \/opt\/elsewhere\/Orbit Staging\.app, outside the installed app and the harness directories$/)
  assert.equal(foreign.calls.some(([command]) => command === lsregister || command === 'remove'), false, 'nothing outside the build is changed')
  const kept = launchServices([buildApp, installedApp], { keepsRemoved: true })
  await assert.rejects(() => keepInstalledLaunchCopy(installedApp, ['/work/orbit', '/work/_temp/output'], kept.host),
    new RegExp(`^Error: LaunchServices still ranks .*Orbit Staging\\.app first for org\\.useorbit\\.desktop\\.staging, not ${installedApp.replaceAll('.', '\\.')}`))
})
