import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

interface Step { name?: string; uses?: string; if?: string; run?: string }
interface Job { 'runs-on'?: string; strategy?: { matrix?: { include?: { runner?: string }[]; runner?: string[] | string } }; steps?: Step[] }
interface Workflow { jobs: Record<string, Job> }
const require = createRequire(import.meta.url)
const { load } = require('js-yaml') as { load: (source: string) => Workflow }
const workflowsDirectory = new URL('../../../.github/workflows/', import.meta.url)
const action = './.github/actions/desktop-nsis-tools'
const windowsBundling = /tauri\s+(build|bundle)|run\s+"?(build|bundle):[^\n]*@orbit\/desktop|desktop-bench\/(acceptance|run)\.mjs/

function runsOnWindows(job: Job): boolean {
  /** A matrix runner can be a fromJSON expression string; it runs on Windows when that expression names a Windows runner. */
  const matrixRunners = job.strategy?.matrix?.runner ?? []
  const runners = [job['runs-on'], ...(job.strategy?.matrix?.include?.map(entry => entry.runner) ?? []), ...(Array.isArray(matrixRunners) ? matrixRunners : [matrixRunners])]
  return runners.some(runner => runner?.toLowerCase().includes('windows'))
}

function windowsBundlingJobsMissingNsisTools(workflow: Workflow): string[] {
  const missing: string[] = []
  for (const [name, job] of Object.entries(workflow.jobs)) {
    const steps = job.steps ?? []
    const bundler = steps.findIndex(step => windowsBundling.test(step.run ?? '') && !step.if?.includes('macOS'))
    if (bundler < 0 || !runsOnWindows(job)) continue
    const provider = steps.findIndex(step => step.uses === action)
    const gate = steps[provider]?.if
    if (provider < 0 || provider > bundler || (gate !== undefined && gate !== "runner.os == 'Windows'")) missing.push(name)
  }
  return missing
}

const workflows = readdirSync(workflowsDirectory).filter(file => file.endsWith('.yml'))
  .map(file => ({ file, workflow: load(readFileSync(new URL(file, workflowsDirectory), 'utf8')) }))

it('provides the NSIS tools before every Windows bundle', () => {
  const bundling = workflows.filter(({ workflow }) => Object.values(workflow.jobs).some(job => runsOnWindows(job) && job.steps?.some(step => windowsBundling.test(step.run ?? ''))))
  expect(bundling.map(({ file }) => file).sort((left, right) => left.localeCompare(right))).toEqual(['desktop-acceptance.yml', 'desktop-benchmark.yml', 'desktop-build.yml', 'desktop-release.yml'])
  for (const { file, workflow } of bundling) expect(windowsBundlingJobsMissingNsisTools(workflow), file).toEqual([])
})

it('flags a Windows bundling job without the step, with it too late, or with it skipped on Windows', () => {
  const bundle = { name: 'Bundle', run: 'npm run build:staging -w @orbit/desktop' }
  const provide = { uses: action, if: "runner.os == 'Windows'" }
  const job = (steps: Step[], runner = 'windows-2025'): Workflow => ({ jobs: { build: { 'runs-on': runner, steps } } })
  expect(windowsBundlingJobsMissingNsisTools(job([provide, bundle]))).toEqual([])
  expect(windowsBundlingJobsMissingNsisTools(job([bundle]))).toEqual(['build'])
  expect(windowsBundlingJobsMissingNsisTools(job([bundle, provide]))).toEqual(['build'])
  expect(windowsBundlingJobsMissingNsisTools(job([{ uses: action, if: "runner.os == 'macOS'" }, bundle]))).toEqual(['build'])
  expect(windowsBundlingJobsMissingNsisTools({ jobs: { build: { strategy: { matrix: { include: [{ runner: 'windows-2025' }] } }, steps: [bundle] } } })).toEqual(['build'])
  expect(windowsBundlingJobsMissingNsisTools(job([bundle], 'macos-15'))).toEqual([])
  expect(windowsBundlingJobsMissingNsisTools({ jobs: { build: { strategy: { matrix: { runner: "${{ fromJSON(github.event_name == 'push' && '[\"windows-latest\"]' || '[\"macos-latest\"]') }}" } }, steps: [bundle] } } })).toEqual(['build'])
})
