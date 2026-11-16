import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { downloadReleaseAsset, findRelease, type Sleep } from './release-asset.ts'
import { assertReleaseCandidate, assertSourceLineage, compareVersions, releaseSettings, repository, signedManifest, tagFor, versionFromTag } from './release.ts'

/** The paths that change the shipped shell. The lockfile counts only through `desktopLockClosure`. */
const shellPaths = ['apps/desktop', '.github/actions/desktop-nsis-tools', 'apps/web/web-compatibility.json', '.github/workflows/desktop-release.yml']

interface LockEntry {
  version?: string; resolved?: string; integrity?: string; link?: boolean
  dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>; devDependencies?: Record<string, string>
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
}

/** The package directory that encloses an installed path, or the root: `a/node_modules/b` -> `a`. */
function enclosingPackage(path: string): string {
  const index = path.lastIndexOf('/node_modules/')
  return index >= 0 ? path.slice(0, index) : ''
}

/** npm's lookup: the nearest `node_modules/<name>` from the requiring package up to the root. */
function resolveInstalled(packages: Record<string, LockEntry>, from: string, name: string): string | undefined {
  for (let base = from; ; base = enclosingPackage(base)) {
    const candidate = base ? `${base}/node_modules/${name}` : `node_modules/${name}`
    if (packages[candidate]) return candidate
    if (!base) return undefined
  }
}

/**
 * The lockfile entries that the desktop workspace installs, as stable text. A lockfile change outside them, such as a
 * web or mobile dependency, cannot change the shipped shell, so it keeps the published shell.
 */
export function desktopLockClosure(lockfile: string | null): string {
  if (lockfile === null) return ''
  const packages = (JSON.parse(lockfile) as { packages?: Record<string, LockEntry> }).packages ?? {}
  const closure = new Map<string, Pick<LockEntry, 'version' | 'resolved' | 'integrity' | 'link'>>()
  const pending = ['apps/desktop']
  while (pending.length > 0) {
    const path = pending.pop()!
    const entry = packages[path]
    if (!entry || closure.has(path)) continue
    closure.set(path, { version: entry.version, resolved: entry.resolved, integrity: entry.integrity, link: entry.link })
    if (entry.link && entry.resolved) pending.push(entry.resolved)
    const declared = { ...entry.dependencies, ...entry.optionalDependencies, ...entry.peerDependencies, ...(path === 'apps/desktop' ? entry.devDependencies : {}) }
    for (const name of Object.keys(declared)) {
      const installed = resolveInstalled(packages, path, name)
      if (installed) pending.push(installed)
    }
  }
  return JSON.stringify([...closure].sort(([left], [right]) => left.localeCompare(right)))
}

function lockfileAt(commit: string): string | null {
  const present = spawnSync('git', ['cat-file', '-e', `${commit}:package-lock.json`], { encoding: 'utf8' })
  return present.status === 0 ? git('show', `${commit}:package-lock.json`) : null
}

export function planShellRelease(variant: string, source: string, previous: string | null, tags: string[], minimum = '0.0.0', requested?: string, rollback = false) {
  releaseSettings(variant, previous ?? '0.1.0')
  releaseSettings(variant, minimum)
  if (!/^[a-f0-9]{40}$/.test(source) || git('rev-parse', 'HEAD') !== source) {
    throw new Error('Desktop checkout must equal the selected web commit')
  }
  if (requested) {
    assertReleaseCandidate(variant, requested, previous, source, rollback, tags)
    assertMinimum(variant, requested, minimum)
    return requested
  }
  assertSourceLineage(variant, previous, source, rollback)
  if (previous) {
    const tag = tagFor(variant, previous)
    const baseline = git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`)
    if (!git('diff', '--name-only', baseline, source, '--', ...shellPaths) && desktopLockClosure(lockfileAt(baseline)) === desktopLockClosure(lockfileAt(source))) {
      assertMinimum(variant, previous, minimum)
      return null
    }
  }
  const versions = tags.filter(tag => tag.startsWith(`desktop-${variant}-v`))
    .map(tag => versionFromTag(variant, tag))
  if (previous) versions.push(previous)
  for (const version of versions) releaseSettings(variant, version)
  const highest = versions.sort(compareVersions).at(-1)
  const next = highest ? highest.split('.').map(Number) : null
  let version = next ? `${next[0]}.${next[1]}.${next[2]! + 1}` : '0.1.0'
  if (compareVersions(version, minimum) < 0) version = minimum
  releaseSettings(variant, version)
  return version
}

export function sourceOnMain(source: string): boolean {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', source, 'refs/remotes/origin/main'], { encoding: 'utf8' })
  if (result.status === 0) return true
  if (result.status === 1) return false
  throw new Error(`Cannot compare the desktop source with main: ${result.stderr.trim()}`)
}

export function channelAdvance(source: string, version: string | null, variant: string, previous: string | null, minimum: string): boolean {
  if (version === null) return false
  if (sourceOnMain(source)) return true
  if (previous && compareVersions(previous, minimum) < 0) {
    throw new Error(`Desktop ${variant} stays at ${previous}, below the web minimum shell version ${minimum}; merge the floor change to main first`)
  }
  return false
}

export function shellFloor(compatibility: { minimumShellVersion: string; signInMinimumShellVersion: string }): string {
  return [compatibility.minimumShellVersion, compatibility.signInMinimumShellVersion].sort(compareVersions).at(-1)!
}

function assertMinimum(variant: string, version: string, minimum: string) {
  releaseSettings(variant, version)
  if (compareVersions(version, minimum) < 0) throw new Error('Desktop release must meet the web minimum shell version')
}

export async function channelVersion(variant: string, sleep?: Sleep): Promise<string | null> {
  const { channel } = releaseSettings(variant, '0.1.0')
  const release = await findRelease(repository, channel, sleep)
  if (!release) return null
  const bytes = await downloadReleaseAsset(repository, release, 'latest.json', sleep)
  const signature = await downloadReleaseAsset(repository, release, 'latest.json.sig', sleep)
  return signedManifest(bytes, signature.toString('utf8'), process.env.TAURI_SIGNING_PUBLIC_KEY ?? '').version
}

async function main() {
  const variant = process.env.DESKTOP_VARIANT ?? ''
  const source = process.env.SOURCE_SHA ?? ''
  const compatibility = JSON.parse(readFileSync(new URL('../../web/web-compatibility.json', import.meta.url), 'utf8')) as { minimumShellVersion: string; signInMinimumShellVersion: string }
  const previous = await channelVersion(variant)
  const floor = shellFloor(compatibility)
  const version = planShellRelease(variant, source, previous, git('tag', '--list', `desktop-${variant}-v*`).split('\n'), floor, process.env.DESKTOP_VERSION || undefined, process.env.DESKTOP_ROLLBACK === 'true')
  const advance = channelAdvance(source, version, variant, previous, floor)
  appendFileSync(process.env.GITHUB_OUTPUT!, `shell_changed=${version !== null}\nadvance_channel=${advance}\nversion=${version ?? ''}\n`)
  let outcome = `unchanged from ${previous}`
  if (advance) outcome = `publish ${version}`
  else if (version) outcome = `build and verify ${version} without publication, because main does not contain the source`
  appendFileSync(process.env.GITHUB_STEP_SUMMARY!, `Desktop ${variant}: ${outcome}. Source: ${source}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
