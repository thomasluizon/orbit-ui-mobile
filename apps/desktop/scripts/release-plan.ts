import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertReleaseCandidate, assertSourceLineage, compareVersions, releaseSettings, repository, signedManifest, tagFor, versionFromTag } from './release.ts'

const shellPaths = [
  'apps/desktop', 'apps/web/web-compatibility.json', 'package.json', 'package-lock.json',
  '.github/workflows/desktop-build.yml', '.github/workflows/desktop-release.yml',
]

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
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
    if (!git('diff', '--name-only', baseline, source, '--', ...shellPaths)) {
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

export async function channelVersion(variant: string): Promise<string | null> {
  const { channel } = releaseSettings(variant, '0.1.0')
  const options = { signal: AbortSignal.timeout(30_000), headers: process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {} }
  const lookup = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${channel}`, options)
  if (lookup.status === 404) return null
  if (!lookup.ok) throw new Error(`Cannot look up desktop channel: ${lookup.status}`)
  const endpoint = `https://github.com/${repository}/releases/download/${channel}/latest.json`
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Cannot read desktop channel manifest: ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const signature = await fetch(`${endpoint}.sig`, { signal: AbortSignal.timeout(30_000) })
  if (!signature.ok) throw new Error(`Cannot read desktop channel signature: ${signature.status}`)
  return signedManifest(bytes, await signature.text(), process.env.TAURI_SIGNING_PUBLIC_KEY ?? '').version
}

async function main() {
  const variant = process.env.DESKTOP_VARIANT ?? ''
  const source = process.env.SOURCE_SHA ?? ''
  const compatibility: { minimumShellVersion: string; signInMinimumShellVersion: string } = JSON.parse(readFileSync(new URL('../../web/web-compatibility.json', import.meta.url), 'utf8'))
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
