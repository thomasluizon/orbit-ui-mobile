import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

interface Step { name?: string; uses?: string; if?: string; shell?: string; run?: string; with?: Record<string, string> }
interface Workflow { jobs: Record<string, { uses?: string; env?: Record<string, string>; steps?: Step[] }> }
const require = createRequire(import.meta.url)
const { load } = require('js-yaml') as { load: (source: string) => Workflow }
const workflow = (name: string) => load(readFileSync(new URL(`../../../.github/workflows/${name}.yml`, import.meta.url), 'utf8'))

it.each(['desktop-build', 'desktop-release'])('%s restores verified downloads before native compilation', name => {
  const build = workflow(name).jobs.build!
  const steps = build.steps!
  const cache = steps.find(step => step.name === 'Cache Windows App SDK downloads')!
  expect(cache.uses).toBe('actions/cache@v6')
  expect(cache.if).toBe("runner.os == 'Windows'")
  expect(cache.with?.path).toBe(build.env?.ORBIT_WINDOWS_DOWNLOAD_CACHE)
  expect(cache.with?.key).toContain('matrix.target')
  expect(cache.with?.key).toContain("hashFiles('apps/desktop/src-tauri/native/windows/downloads.json')")
  expect(cache.with?.['restore-keys']).toBeUndefined()
  const nativeStep = steps.findIndex(step => step.run?.includes('cargo '))
  expect(steps.indexOf(cache)).toBeLessThan(nativeStep)
  const host = steps.find(step => step.name === 'Report Windows PowerShell version')!
  expect(host.shell).toBe('powershell')
  expect(host.if).toBe("runner.os == 'Windows'")
  expect(host.run).toContain('$PSVersionTable.PSVersion')
})

it('keeps web releases on the reusable desktop test and publication paths', () => {
  const release = workflow('release')
  expect(release.jobs['desktop-test']?.uses).toBe('./.github/workflows/desktop-build.yml')
  expect(release.jobs['desktop-release']?.uses).toBe('./.github/workflows/desktop-release.yml')
})
