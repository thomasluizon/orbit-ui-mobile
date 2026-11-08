import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { launchStatus, launchUnelevated } from './acceptance-platform.mjs'

function windowsLauncher(script: { statusAfterStart?: string[]; statusAfterDelay?: string[]; alive?: boolean }) {
  const lines: string[] = []
  const calls: string[][] = []
  const tracked: unknown[] = []
  const stopped: unknown[] = []
  let clock = 0
  const host = {
    copyFile: async () => {},
    execute: async (command: string, args: string[]) => {
      calls.push([command, ...args])
      if (command !== 'powershell.exe') return ''
      lines.push(...script.statusAfterStart ?? [])
      return `${JSON.stringify({ harness: high, launcher: 31, outputLabel: 'Mandatory Label\\Medium Mandatory Level:(OI)(CI)(NW)' })}\r\n`
    },
    readFile: async () => {
      if (!lines.length) throw Object.assign(new Error('missing status'), { code: 'ENOENT' })
      return `\uFEFF${lines.join('\r\n')}\r\n`
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
  return { host, calls, tracked, stopped }
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

const launcherScript = fileURLToPath(new URL('./windows-unelevated.ps1', import.meta.url))

// Add-Type compiles through CodeDom, which a Medium-integrity process cannot run, so only the High start mode may compile.
test('the Windows launcher compiles its native type only in start mode', () => {
  const lines = readFileSync(launcherScript, 'utf8').split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === "'start' {")
  assert.ok(start > 0, 'the script has a start mode')
  const compiling = lines.flatMap((line, index) => !line.trim().startsWith('#') && /\bAdd-Type\b/.test(line) ? [index] : [])
  assert.ok(compiling.length > 0, 'the script compiles its native type')
  assert.deepEqual(compiling.filter((index) => index < start).map((index) => lines[index]!.trim()), [])
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
test('the Windows launcher start mode runs a real executable as an unelevated standard user at Medium integrity and records its exit', { skip: process.platform !== 'win32' }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-unelevated-'))
  try {
    const status = join(directory, 'hostname-launch.jsonl')
    const started = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', launcherScript, '-Mode', 'start',
      '-Executable', join(process.env.SystemRoot!, 'System32', 'hostname.exe'), '-Log', join(directory, 'hostname.log'),
      '-Output', join(directory, 'hostname.stdout.log'), '-Status', status], { encoding: 'utf8', timeout: 120000 })
    assert.equal(started.status, 0, started.stderr)
    const harness = JSON.parse(started.stdout) as { harness: Record<string, unknown>; launcher: number; outputLabel: string }
    assertToken(harness.harness)
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
    // The exit line is the launcher's last statement, but PowerShell still holds the directory and its library until it ends.
    for (let attempt = 0; attempt < 120 && launcherRunning(harness.launcher); attempt++) await new Promise((resolve) => setTimeout(resolve, 250))
    assert.equal(launcherRunning(harness.launcher), false, `launcher ${harness.launcher} still runs 30 s after its exit line`)
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
