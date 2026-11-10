import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { channelAdvance, channelVersion, planShellRelease, shellFloor, sourceOnMain } from '../scripts/release-plan.ts'
import compatibility from '../../web/web-compatibility.json'
import channel from '../__fixtures__/channel-staging.json'

/** WHY: Git-driven cases can exceed five seconds on Windows runners; allow headroom for process startup (#1818). */
const gitTestTimeout = 30_000
const directories: string[] = []
const originalDirectory = process.cwd()
afterEach(() => {
  process.chdir(originalDirectory)
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true }))
})

const channelRelease = { assets: [{ id: 726086829, name: 'latest.json' }, { id: 726086785, name: 'latest.json.sig' }] }
const apiRoot = 'https://api.github.com/repos/thomasluizon/orbit-ui-mobile/releases'
const noWait = async () => {}

function channelFetch(overrides: Record<string, () => Response> = {}) {
  const routes: Record<string, () => Response> = {
    [`${apiRoot}/tags/desktop-staging`]: () => Response.json(channelRelease),
    [`${apiRoot}/assets/726086829`]: () => new Response(channel.manifest),
    [`${apiRoot}/assets/726086785`]: () => new Response(channel.signature),
    ...overrides,
  }
  return vi.fn((url: string) => {
    if (url.startsWith('https://github.com/')) return Promise.resolve(new Response('Gateway Time-out', { status: 504 }))
    const route = routes[url]
    if (!route) return Promise.reject(new Error(`Unexpected request ${url}`))
    return Promise.resolve(route())
  })
}

it('reads and verifies the real published staging channel through the release asset endpoint', async () => {
  vi.stubEnv('TAURI_SIGNING_PUBLIC_KEY', channel.publicKey)
  vi.stubGlobal('fetch', channelFetch())
  expect(await channelVersion('staging', noWait)).toBe('0.1.1')
  const urls = vi.mocked(fetch).mock.calls.map(requestedUrl)
  expect(urls).toEqual([`${apiRoot}/tags/desktop-staging`, `${apiRoot}/assets/726086829`, `${apiRoot}/assets/726086785`])
  expect(vi.mocked(fetch).mock.calls[1]![1]).toMatchObject({ headers: { Accept: 'application/octet-stream' } })
})

it('retries a gateway error from the asset endpoint and gives up after four attempts', async () => {
  vi.stubEnv('TAURI_SIGNING_PUBLIC_KEY', channel.publicKey)
  let manifestCalls = 0
  vi.stubGlobal('fetch', channelFetch({ [`${apiRoot}/assets/726086829`]: () => (++manifestCalls < 3 ? new Response(null, { status: 504 }) : new Response(channel.manifest)) }))
  expect(await channelVersion('staging', noWait)).toBe('0.1.1')
  expect(manifestCalls).toBe(3)
  vi.stubGlobal('fetch', channelFetch({ [`${apiRoot}/assets/726086829`]: () => new Response(null, { status: 504 }) }))
  await expect(channelVersion('staging', noWait)).rejects.toThrow(`${apiRoot}/assets/726086829 failed after 4 attempts: status 504`)
  expect(vi.mocked(fetch).mock.calls.filter(call => requestedUrl(call).endsWith('/assets/726086829'))).toHaveLength(4)
  vi.stubGlobal('fetch', channelFetch({ [`${apiRoot}/tags/desktop-staging`]: () => new Response(null, { status: 504 }) }))
  await expect(channelVersion('staging', noWait)).rejects.toThrow(`${apiRoot}/tags/desktop-staging failed after 4 attempts: status 504`)
})

it('treats only an absent channel release as a first release and rejects missing assets', async () => {
  vi.stubEnv('TAURI_SIGNING_PUBLIC_KEY', channel.publicKey)
  vi.stubGlobal('fetch', channelFetch({ [`${apiRoot}/tags/desktop-staging`]: () => new Response(null, { status: 404 }) }))
  expect(await channelVersion('staging', noWait)).toBeNull()
  vi.stubGlobal('fetch', channelFetch({ [`${apiRoot}/tags/desktop-staging`]: () => new Response(null, { status: 403 }) }))
  await expect(channelVersion('staging', noWait)).rejects.toThrow('release desktop-staging: 403')
  vi.stubGlobal('fetch', channelFetch({ [`${apiRoot}/assets/726086829`]: () => new Response(null, { status: 404 }) }))
  await expect(channelVersion('staging', noWait)).rejects.toThrow('asset latest.json: 404')
  vi.stubGlobal('fetch', channelFetch({ [`${apiRoot}/assets/726086785`]: () => new Response(null, { status: 404 }) }))
  await expect(channelVersion('staging', noWait)).rejects.toThrow('asset latest.json.sig: 404')
  vi.stubGlobal('fetch', channelFetch({ [`${apiRoot}/assets/726086829`]: () => new Response(channel.manifest.replace('0.1.1', '0.1.2')) }))
  await expect(channelVersion('staging', noWait)).rejects.toThrow('verification failed')
  vi.stubGlobal('fetch', channelFetch({ [`${apiRoot}/tags/desktop-staging`]: () => Response.json({ assets: [] }) }))
  await expect(channelVersion('staging', noWait)).rejects.toThrow('has no asset latest.json')
})

function requestedUrl([input]: Parameters<typeof fetch>) {
  return input instanceof Request ? input.url : input.toString()
}

function git(...args: string[]) {
  return execFileSync('git', args, { encoding: 'utf8', env: {
    ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  } }).trim()
}

function commit(path: string, content: string) {
  writeFileSync(path, content)
  git('--literal-pathspecs', 'add', path)
  const head = git('for-each-ref', '--format=%(objectname)', git('symbolic-ref', 'HEAD'))
  const parents = head ? ['-p', head] : []
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

it('advances a channel only from a source that main contains, because a squash merge strands any other source', () => {
  const merged = repository()
  git('update-ref', 'refs/remotes/origin/main', merged)
  const branch = commit('apps/desktop/shell.rs', 'branch shell')
  expect(sourceOnMain(merged)).toBe(true)
  expect(sourceOnMain(branch)).toBe(false)
  git('tag', 'desktop-staging-v0.1.2', branch)
  git('update-ref', 'HEAD', merged)
  commit('web.ts', 'main moved on')
  const squashed = commit('apps/desktop/shell.rs', 'branch shell')
  expect(squashed).not.toBe(branch)
  git('update-ref', 'refs/remotes/origin/main', squashed)
  expect(() => planShellRelease('staging', squashed, '0.1.2', [])).toThrow('must descend')
  expect(sourceOnMain(squashed)).toBe(true)
  git('update-ref', '-d', 'refs/remotes/origin/main')
  expect(() => sourceOnMain(squashed)).toThrow('Cannot compare the desktop source with main')
}, gitTestTimeout)

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

it('refuses a source outside main that raises the web floor above the shell the channel keeps', () => {
  const merged = repository()
  git('update-ref', 'refs/remotes/origin/main', merged)
  mkdirSync('apps/web', { recursive: true })
  const source = commit('apps/web/web-compatibility.json', JSON.stringify({ minimumShellVersion: '1.0.0' }))
  const version = planShellRelease('staging', source, '0.1.1', [], '1.0.0')
  expect(version).toBe('1.0.0')
  expect(() => channelAdvance(source, version, 'staging', '0.1.1', '1.0.0')).toThrow('merge the floor change to main first')
  expect(channelAdvance(source, version, 'staging', '0.1.1', '0.1.0')).toBe(false)
  expect(channelAdvance(source, null, 'staging', '0.1.1', '1.0.0')).toBe(false)
  git('update-ref', 'refs/remotes/origin/main', source)
  expect(channelAdvance(source, version, 'staging', '0.1.1', '1.0.0')).toBe(true)
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
