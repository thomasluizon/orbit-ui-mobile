import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createWriteStream } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { parseMacProcesses, processTree } from './measurements.mjs'

export { delay }
const active = new Set()

export async function assertFree(port) {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(new Error(`Loopback port ${port} is occupied; no existing process was stopped`)))
    server.listen(port, '127.0.0.1', resolve)
  })
  await new Promise((resolve) => server.close(resolve))
}

export function start(command, argumentsList, { log, ...options } = {}) {
  const output = log ? createWriteStream(log, { flags: 'a' }) : null
  const child = spawn(command, argumentsList, { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], ...options })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { if (output) output.write(chunk); else stdout += chunk.toString() })
  child.stderr.on('data', (chunk) => { if (output) output.write(chunk); else stderr += chunk.toString() })
  const done = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (status, signal) => {
      output?.end()
      if (status === 0) resolve(stdout)
      else reject(new Error(`${command} exited ${status ?? signal}: ${stderr.slice(-3000)}${log ? `; see ${log}` : ''}`))
    })
  })
  done.catch(() => {})
  const handle = { child, done, log }
  active.add(handle)
  child.once('close', () => active.delete(handle))
  return handle
}

export async function stopAll() {
  const results = await Promise.allSettled([...active].map((handle) => stop(handle)))
  const failures = results.filter((result) => result.status === 'rejected')
  if (failures.length) throw new AggregateError(failures.map((result) => result.reason), 'Process cleanup failed')
}

export async function execute(command, argumentsList, options) {
  return start(command, argumentsList, options).done
}

export async function stop(handle, extraPids = []) {
  if (!handle) return
  if (process.platform === 'win32') {
    if (handle.child.exitCode === null) await execute('taskkill.exe', ['/PID', String(handle.child.pid), '/T', '/F'])
  } else {
    try { process.kill(-handle.child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    for (const pid of extraPids) {
      try { process.kill(pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
  }
  await handle.done.catch(() => {})
}

export async function waitFor(read, label, timeout = 120000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await read()
    if (value) return value
    await delay(50)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

export async function waitForHttp(url, handle) {
  return waitFor(async () => {
    if (handle && handle.child.exitCode !== null) throw new Error(`Server exited before readiness; see ${handle.log}`)
    try { return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok } catch { return false }
  }, url)
}

export async function processSnapshot(macProbe, windowsScript) {
  if (process.platform === 'win32') {
    const stdout = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', windowsScript])
    const result = JSON.parse(stdout)
    return Array.isArray(result) ? result : [result]
  }
  const processes = parseMacProcesses(await execute('ps', ['-axo', 'pid=,ppid=,rss=,time=,command=']))
  const candidates = processes
  if (candidates.length) {
    const responsible = await execute(macProbe, candidates.map((entry) => String(entry.pid)))
    for (const line of responsible.trim().split('\n')) {
      const [pid, owner] = line.split(' ').map(Number)
      const entry = processes.find((process) => process.pid === pid)
      if (entry) entry.responsible = owner
    }
  }
  return processes
}

export async function treeSample(handle, macProbe, windowsScript) {
  const members = processTree(await processSnapshot(macProbe, windowsScript), handle.child.pid)
    .filter((entry) => process.platform !== 'darwin' || entry.pid !== handle.child.pid)
  if (!members.length) throw new Error('Shell process tree disappeared')
  return { epochMs: Date.now(), residentBytes: members.reduce((sum, entry) => sum + entry.residentBytes, 0), members }
}

export async function logicalSize(path) {
  const entry = await lstat(path)
  if (entry.isSymbolicLink()) return 0
  if (!entry.isDirectory()) return entry.size
  const children = await readdir(path)
  const sizes = await Promise.all(children.map((name) => logicalSize(`${path}/${name}`)))
  return sizes.reduce((sum, size) => sum + size, 0)
}
