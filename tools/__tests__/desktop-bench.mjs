import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { T, REPO_ROOT, check, root } from './_harness.mjs'
import { cpuSeconds, median, parseMacProcesses, percentile, processTree, summarize } from '../desktop-bench/measurements.mjs'

export const cases = () => {
  check('desktop-bench/run.mjs', 'benchmark help is cwd safe', ['--help'], { status: 0, stdout: /Usage/ }, { cwd: root })
  check('desktop-bench/run.mjs', 'benchmark refuses unknown options before building', ['--unknown'], { status: 2 })
  check('desktop-bench/run.mjs', 'benchmark refuses fewer than five repetitions', ['--runs', '4'], { status: 2 })
  T('CPU parser handles minutes and day-prefixed values', cpuSeconds('126:37.41') === 7597.41 && cpuSeconds('1-02:03:04.50') === 93784.5)
  const processes = parseMacProcesses(' 10 1 100 0:01.25 app\n 11 10 200 0:02.00 helper\n 12 1 300 0:03.00 WebKit\n 99 1 900 0:04.00 other')
  processes[2].responsible = 10
  T('process accounting includes launchd WebKit helpers and excludes unrelated processes', processTree(processes, 10).map((entry) => entry.pid).join(',') === '10,11,12')
  T('RSS converts KiB to bytes', processes[1].residentBytes === 204800)
  T('median and p95 use measured distributions', median([5, 1, 4, 2, 3]) === 3 && median([2, 4]) === 3 && percentile([1, 2, 3, 4, 100], 0.95) === 100)
  for (const operation of [() => median([]), () => median([NaN]), () => summarize([]), () => parseMacProcesses('bad row'), () => cpuSeconds('unknown')]) {
    let refused = false
    try { operation() } catch { refused = true }
    T('invalid or missing measurements cannot produce a successful summary', refused)
  }
  const configs = ['tauri.conf.json', 'tauri.production.conf.json'].map((name) => readFileSync(join(REPO_ROOT, 'apps/desktop/src-tauri', name), 'utf8'))
  const releaseFiles = readdirSync(join(REPO_ROOT, '.github/workflows')).filter((name) => name.includes('release') || name === 'desktop-build.yml')
  for (const name of releaseFiles) configs.push(readFileSync(join(REPO_ROOT, '.github/workflows', name), 'utf8'))
  T('release configurations and workflows never enable the loopback feature', configs.every((source) => !source.includes('bench-loopback')))
  const result = spawnSync(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'tools/desktop-bench/test-fixture.ts')], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000 })
  T('hermetic stream follows the shared consumer protocol', result.status === 0, result.stderr)
}
