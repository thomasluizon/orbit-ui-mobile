import { execFileSync } from 'node:child_process'
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
  const compatibility: { minimumShellVersion: string } = JSON.parse(readFileSync(new URL('../../web/web-compatibility.json', import.meta.url), 'utf8'))
  const previous = await channelVersion(variant)
  const version = planShellRelease(variant, source, previous, git('tag', '--list', `desktop-${variant}-v*`).split('\n'), compatibility.minimumShellVersion, process.env.DESKTOP_VERSION || undefined, process.env.DESKTOP_ROLLBACK === 'true')
  appendFileSync(process.env.GITHUB_OUTPUT!, `publish=${version !== null}\nversion=${version ?? ''}\n`)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY!, `Desktop ${variant}: ${version ? `publish ${version}` : `unchanged from ${previous}`}. Source: ${source}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
