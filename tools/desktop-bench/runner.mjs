import { createRequire } from 'node:module'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { platform, release, arch, cpus, totalmem, homedir } from 'node:os'
import { buildShells, readFixtures } from './build.mjs'
import { startProxy } from './server.mjs'
import { assertFree, delay, execute, start, stop, stopAll, treeSample, waitFor, waitForHttp } from './host.mjs'
import { markdown, percentile, summarize } from './measurements.mjs'

const require = createRequire(import.meta.url)
const note = (message) => process.stdout.write(`[desktop-bench] ${message}\n`)

async function measure({ shell, cache, iteration, executable, profile, environment, proxy, macProbe, windowsScript, work }) {
  proxy.reset()
  const launchedAt = Date.now()
  const handle = start(process.platform === 'darwin' ? macProbe : executable, process.platform === 'darwin' ? ['launch', executable] : [], {
    env: { ...environment, ORBIT_BENCH_PROFILE: profile }, log: join(work, `${shell}-${iteration}-${cache}.log`),
  })
  let members = []
  try {
    const usable = await waitFor(() => proxy.read('usable'), `${shell} usable Hoje`)
    if (usable.visibility !== 'visible') throw new Error('Shell must be visible for measurement')
    const baseline = await treeSample(handle, macProbe, windowsScript)
    members = baseline.members
    const idleStarted = Date.now()
    await delay(10000)
    const tenSeconds = await treeSample(handle, macProbe, windowsScript)
    await delay(Math.max(0, 60000 - (Date.now() - idleStarted)))
    const sixtySeconds = await treeSample(handle, macProbe, windowsScript)
    members = sixtySeconds.members
    const finalByPid = new Map(members.map((entry) => [entry.pid, entry]))
    for (const entry of baseline.members) {
      if (!finalByPid.has(entry.pid)) throw new Error(`Idle process ${entry.pid} exited; CPU accounting would be incomplete`)
    }
    const initialCpu = baseline.members.reduce((sum, entry) => sum + entry.cpuSeconds, 0)
    const finalCpu = members.reduce((sum, entry) => sum + entry.cpuSeconds, 0)
    proxy.workload()
    const completed = await waitFor(() => proxy.read('complete'), `${shell} scroll and Astra workload`)
    if (completed.visibility !== 'visible') throw new Error('Shell became hidden during workload')
    const result = {
      shell, cache, iteration, startupMs: usable.epochMs - launchedAt,
      resident10Bytes: tenSeconds.residentBytes, resident60Bytes: sixtySeconds.residentBytes,
      idleCpuSeconds: finalCpu - initialCpu, idleElapsedMs: sixtySeconds.epochMs - baseline.epochMs,
      scrollP95Ms: percentile(completed.frames, 0.95), scrollSlowFrames: completed.frames.filter((value) => value > 16.7).length,
      firstTokenMs: completed.firstTokenMs, finalPartMs: completed.finalPartMs,
      requestDispatchMs: completed.requestDispatchMs, finalEventMs: completed.finalEventMs,
      frames: completed.frames, processes: { baseline, tenSeconds, sixtySeconds },
    }
    note(`${shell} ${iteration + 1} ${cache}: usable ${result.startupMs.toFixed(1)} ms, RSS ${(result.resident60Bytes / 1048576).toFixed(1)} MiB, idle CPU ${result.idleCpuSeconds.toFixed(2)} s`)
    return result
  } finally {
    if (!members.length && handle.child.exitCode === null) members = (await treeSample(handle, macProbe, windowsScript)).members
    await stop(handle, members.filter((entry) => entry.responsible).map((entry) => entry.pid))
    await delay(1000)
  }
}

export async function benchmark({ repository, directory, output, repetitions }) {
  if (!['darwin', 'win32'].includes(process.platform)) throw new Error('This benchmark requires macOS or Windows')
  for (const port of [5099, 3400, 3401]) await assertFree(port)
  const nextOutput = join(repository, 'apps/web/.next')
  if (existsSync(nextOutput)) throw new Error('Remove apps/web/.next before starting this hermetic build')
  const work = join(output, 'work')
  await mkdir(work, { recursive: true })
  const environment = { ...process.env, API_BASE: 'http://127.0.0.1:5099', NEXT_PUBLIC_EVENT_API_BASE: 'http://127.0.0.1:5099', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3400', LAYOUT_PORT: '3400', ORBIT_DESKTOP_BENCH: '1', NEXT_TELEMETRY_DISABLED: '1', PATH: `/opt/homebrew/opt/rustup/bin:${process.env.PATH}` }
  const macProbe = join(work, 'mac-process')
  const windowsScript = join(directory, 'windows-process.ps1')
  let proxy
  let interrupted = false
  const interrupt = () => { interrupted = true; void stopAll() }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  try {
    const commit = (await execute('git', ['rev-parse', 'HEAD'], { cwd: repository })).trim()
    if (process.platform === 'darwin') await execute('clang', [join(directory, 'mac-process.c'), '-o', macProbe])
    note('Building release shells; build output is in the output directory under work')
    const shells = await buildShells(repository, work, environment)
    if (interrupted) throw new Error('Interrupted')
    note('Building the hermetic web application')
    await execute(process.execPath, ['--import', 'tsx', join(repository, 'apps/web/scripts/build-hermetic.mjs')], { cwd: repository, env: environment, log: join(work, 'web-build.log') })
    await execute(process.execPath, ['--import', 'tsx', join(directory, 'fixtures.ts'), join(work, 'fixtures.json')], { cwd: repository, env: environment })
    const fixtures = await readFixtures(join(work, 'fixtures.json'))
    start(process.execPath, ['--import', 'tsx', join(repository, 'apps/web/test-support/hermetic/mock-api/server.ts')], { cwd: repository, env: environment, log: join(work, 'mock.log') })
    await waitForHttp('http://127.0.0.1:5099/health')
    const seed = await fetch('http://127.0.0.1:5099/_test/session-fixtures', { method: 'PUT', headers: { Authorization: `Bearer ${fixtures.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ fixtures: fixtures.fixtures }) })
    if (!seed.ok) throw new Error(`Fixture seed failed: ${seed.status} ${await seed.text()}`)
    start(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--port', '3401', '--hostname', '127.0.0.1'], { cwd: join(repository, 'apps/web'), env: environment, log: join(work, 'web.log') })
    await waitForHttp('http://127.0.0.1:3401/')
    proxy = await startProxy({ token: fixtures.token, probePath: join(directory, 'probe.js'), port: 3400, upstreamPort: 3401 })
    await fetch('http://127.0.0.1:3400/').then((response) => response.arrayBuffer())
    const runs = []
    for (let iteration = 0; iteration < repetitions; iteration++) {
      const order = iteration % 2 ? ['electron', 'tauri'] : ['tauri', 'electron']
      for (const shell of order) {
        const profile = shell === 'tauri' ? shells.profile : join(work, 'electron-profile')
        const profiles = shell === 'tauri' && process.platform === 'darwin' ? [...shells.macStorage, profile] : [profile]
        for (const path of profiles) await rm(path, { recursive: true, force: true })
        await mkdir(profile, { recursive: true })
        for (const cache of ['cold', 'warm']) {
          if (interrupted) throw new Error('Interrupted')
          runs.push(await measure({ shell, cache, iteration, executable: shells[`${shell}Executable`], profile, environment, proxy, macProbe, windowsScript, work }))
          await writeFile(join(output, 'partial.json'), JSON.stringify(runs, null, 2))
        }
      }
    }
    const report = {
      host: `${platform()} ${release()} ${arch()}; ${cpus()[0].model}; ${cpus().length} logical CPUs; ${(totalmem() / 1073741824).toFixed(0)} GiB RAM`,
      commit, repetitions, electronVersion: shells.version, disk: shells.disk, medians: summarize(runs), runs,
      verdict: 'Tauri remains the incumbent pending the matching Windows result. Compare each metric separately; a mixed result does not establish that Electron measures best overall.',
    }
    await writeFile(join(output, 'summary.json'), JSON.stringify(report, null, 2))
    await writeFile(join(output, 'summary.md'), markdown(report))
    note(`Wrote ${join(output, 'summary.json')} and summary.md`)
  } finally {
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', interrupt)
    try { await proxy?.stop() } finally {
      try { await stopAll() } finally { await rm(nextOutput, { recursive: true, force: true }) }
    }
  }
}
