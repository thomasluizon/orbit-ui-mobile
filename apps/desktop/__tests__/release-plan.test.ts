import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { channelVersion, planShellRelease } from '../scripts/release-plan.ts'
import channel from '../__fixtures__/channel-staging.json'

// WHY: Git-driven cases can exceed five seconds on Windows runners; allow headroom for process startup (#1818).
const gitTestTimeout = 30_000
const directories: string[] = []
const originalDirectory = process.cwd()
afterEach(() => {
  process.chdir(originalDirectory)
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }))
})

it('reads and verifies the real published staging channel before accepting its baseline', async () => {
  vi.stubEnv('TAURI_SIGNING_PUBLIC_KEY', channel.publicKey)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(channel.manifest))
    .mockResolvedValueOnce(new Response(channel.signature)))
  expect(await channelVersion('staging')).toBe('0.1.1')
  expect(fetch).toHaveBeenNthCalledWith(1,
    'https://github.com/thomasluizon/orbit-ui-mobile/releases/download/desktop-staging/latest.json', expect.objectContaining({ signal: expect.any(AbortSignal) }))
})

it('treats only a missing channel as a first release and fails on read or signature errors', async () => {
  vi.stubEnv('TAURI_SIGNING_PUBLIC_KEY', channel.publicKey)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })))
  expect(await channelVersion('production')).toBeNull()
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
  await expect(channelVersion('staging')).rejects.toThrow('503')
  vi.mocked(fetch).mockResolvedValueOnce(new Response(channel.manifest))
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
  await expect(channelVersion('staging')).rejects.toThrow('signature')
  vi.mocked(fetch).mockResolvedValueOnce(new Response(channel.manifest.replace('0.1.1', '0.1.2')))
    .mockResolvedValueOnce(new Response(channel.signature))
  await expect(channelVersion('staging')).rejects.toThrow('release version')
})

function git(...args: string[]) {
  return execFileSync('git', args, { encoding: 'utf8', env: {
    ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  } }).trim()
}

function commit(path: string, content: string) {
  writeFileSync(path, content)
  git('--literal-pathspecs', 'add', path)
  const commit = git('commit-tree', git('write-tree'), '-m', 'fixture')
  git('update-ref', 'HEAD', commit)
  return commit
}

function repository() {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-shell-plan-'))
  directories.push(directory)
  process.chdir(directory)
  git('init', '--quiet')
  mkdirSync('apps/desktop', { recursive: true })
  const source = commit('apps/desktop/shell.rs', 'shell')
  git('tag', 'desktop-staging-v0.1.1', source)
  git('tag', 'desktop-production-v0.1.0', source)
  return source
}

it('skips shell publication for a web-only commit and compares the selected channel', () => {
  repository()
  const source = commit('web.ts', 'web')
  expect(planShellRelease('staging', source, '0.1.1', [])).toBeNull()
  expect(planShellRelease('production', source, '0.1.0', [])).toBeNull()
}, gitTestTimeout)

it('publishes changed shell sources and skips reserved versions after a failed publication', () => {
  repository()
  const source = commit('apps/desktop/shell.rs', 'changed')
  expect(planShellRelease('staging', source, '0.1.1', ['desktop-staging-v0.1.2', 'desktop-production-v9.0.0'])).toBe('0.1.3')
  expect(planShellRelease('production', source, null, [])).toBe('0.1.0')
  expect(planShellRelease('staging', source, '0.1.1', [], '1.0.0')).toBe('1.0.0')
}, gitTestTimeout)

it('publishes a shell meeting a raised web-owned compatibility floor', () => {
  repository()
  mkdirSync('apps/web', { recursive: true })
  const source = commit('apps/web/web-compatibility.json', JSON.stringify({ minimumShellVersion: '1.0.0' }))
  expect(planShellRelease('staging', source, '0.1.1', [], '1.0.0')).toBe('1.0.0')
}, gitTestTimeout)

it('fails if the baseline tag is unavailable or checkout is not the selected commit', () => {
  const source = repository()
  expect(() => planShellRelease('staging', source, '0.1.2', [])).toThrow()
  expect(() => planShellRelease('staging', 'a'.repeat(40), '0.1.1', [])).toThrow('selected web commit')
  expect(() => planShellRelease('staging', source, '0.1.1', [], '1.0.0')).toThrow('minimum shell version')
}, gitTestTimeout)

it('tests the pinned source and gates both web deployments on the reusable publisher', () => {
  const require = createRequire(import.meta.url)
  const { load } = require('js-yaml') as { load: (source: string) => {
    jobs: Record<string, { needs?: string[]; uses?: string; with?: Record<string, string> }>
  } }
  const workflow = load(readFileSync(new URL('../../../.github/workflows/release.yml', import.meta.url), 'utf8'))
  expect(workflow.jobs['desktop-test']!.uses).toBe('./.github/workflows/desktop-build.yml')
  expect(workflow.jobs['desktop-test']!.with!.source_sha).toBe('${{ needs.build.outputs.source_sha }}')
  expect(workflow.jobs['desktop-release']!.uses).toBe('./.github/workflows/desktop-release.yml')
  expect(workflow.jobs['desktop-release']!.needs).toEqual(['build', 'desktop-test', 'admission'])
  expect(workflow.jobs['desktop-release']!.with!.source_sha).toBe('${{ needs.build.outputs.source_sha }}')
  for (const environment of ['staging', 'production']) {
    expect(workflow.jobs[environment]!.needs).toContain('desktop-release')
  }
})
