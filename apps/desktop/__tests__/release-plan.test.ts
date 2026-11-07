import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { channelVersion, planShellRelease, shellFloor } from '../scripts/release-plan.ts'
import compatibility from '../../web/web-compatibility.json'
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
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{}'))
    .mockResolvedValueOnce(new Response(channel.manifest)).mockResolvedValueOnce(new Response(channel.signature)))
  expect(await channelVersion('staging')).toBe('0.1.1')
  expect(fetch).toHaveBeenNthCalledWith(1,
    'https://api.github.com/repos/thomasluizon/orbit-ui-mobile/releases/tags/desktop-staging', expect.objectContaining({ signal: expect.any(AbortSignal) }))
})

it('treats only an absent channel release as a first release and rejects missing assets', async () => {
  vi.stubEnv('TAURI_SIGNING_PUBLIC_KEY', channel.publicKey)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })))
  expect(await channelVersion('production')).toBeNull()
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
  await expect(channelVersion('staging')).rejects.toThrow('503')
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response(null, { status: 404 }))
  await expect(channelVersion('staging')).rejects.toThrow('manifest: 404')
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response(channel.manifest))
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
  await expect(channelVersion('staging')).rejects.toThrow('signature: 404')
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response(channel.manifest.replace('0.1.1', '0.1.2')))
    .mockResolvedValueOnce(new Response(channel.signature))
  await expect(channelVersion('staging')).rejects.toThrow('verification failed')
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
  let parents: string[] = []
  try { parents = ['-p', git('rev-parse', '--verify', 'HEAD')] } catch { /* Initial fixture commit has no parent. */ }
  const commit = git('commit-tree', git('write-tree'), ...parents, '-m', 'fixture')
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

it('admits the reusable production dispatch and skips unchanged shell publication', () => {
  const require = createRequire(import.meta.url)
  const { load } = require('js-yaml') as { load: (source: string) => {
    jobs: { validate: { steps: { name?: string; run?: string }[] } }
  } }
  const workflow = load(readFileSync(new URL('../../../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'))
  const planning = workflow.jobs.validate.steps.find(step => step.name === 'Plan shell publication')!.run!
  const guard = planning.slice(0, planning.indexOf('node --experimental-strip-types'))
  const admission = spawnSync('bash', ['-c', guard], { encoding: 'utf8', env: {
    ...process.env, EVENT_NAME: 'workflow_dispatch', DESKTOP_VARIANT: 'production',
    STAGING_ADMITTED: 'true', FORCE_UNSTAGED: '', GITHUB_REF: 'refs/heads/main',
  } })
  expect(admission.status, admission.stdout + admission.stderr).toBe(0)
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
  expect(() => planShellRelease('staging', source, '0.1.2', [])).toThrow('Command failed')
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
  expect(workflow.jobs['desktop-release']!.with!.staging_admitted).toBe("${{ inputs.environment == 'production' }}")
  for (const environment of ['staging', 'production']) {
    expect(workflow.jobs[environment]!.needs).toContain('desktop-release')
  }
})

it('rejects a requested version whose immutable tag already exists', () => {
  const source = repository()
  expect(() => planShellRelease('staging', source, '0.1.1', ['desktop-staging-v0.1.1'], '0.0.0', '0.1.1')).toThrow('tag already exists')
}, gitTestTimeout)

it('rejects requested non-increasing versions and source outside the published lineage', () => {
  const ancestor = repository()
  const descendant = commit('apps/desktop/shell.rs', 'new shell')
  git('tag', 'desktop-staging-v0.2.0', descendant)
  expect(() => planShellRelease('staging', descendant, '0.2.0', [], '0.0.0', '0.1.9')).toThrow('version must increase')
  git('update-ref', 'HEAD', ancestor)
  expect(() => planShellRelease('staging', ancestor, '0.2.0', [], '0.0.0', '0.3.0')).toThrow('must descend')
  expect(planShellRelease('staging', ancestor, '0.2.0', [], '0.0.0', '0.3.0', true)).toBe('0.3.0')
}, gitTestTimeout)

it('publishes at least the web sign-in floor so web never gates sign-in on an unpublished shell', () => {
  expect(shellFloor(compatibility)).toBe(compatibility.signInMinimumShellVersion)
  expect(shellFloor({ minimumShellVersion: '0.0.0', signInMinimumShellVersion: '0.1.26' })).toBe('0.1.26')
  expect(shellFloor({ minimumShellVersion: '1.0.0', signInMinimumShellVersion: '0.1.26' })).toBe('1.0.0')
})
