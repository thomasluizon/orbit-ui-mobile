#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const usage = `usage: sweep-actions-caches.mjs --repository <owner/name> [--dry-run]

  Keeps the GitHub Actions cache of one repository under its budget. It deletes, in this order:
  1. every entry on the merge ref of a pull request that is not open,
  2. every CodeQL overlay base database that a newer one on the same ref replaces,
  3. over the cap, the least recently read large entries until the total is at or under the cap: pull request
     refs first, then older versions on main, then the newest main entry of a family nobody read for 24 hours.
  A pass marker, a newest main entry read within 24 hours and the newest main entry of a release family are
  never deleted. --dry-run prints the selection and deletes nothing.
  The gh CLI reads GH_TOKEN, which needs the actions: write and pull-requests: read permissions.

exit codes: 0 swept, 1 a list or delete request failed, 2 invalid arguments`

const GIGABYTE = 1_000_000_000

// WHY 9 GB: the repository limit is 10 GB (GET /repos/{owner}/{repo}/actions/cache/storage-limit returns
// max_cache_size_gb 10). Each main push writes a 0.85 GB CodeQL overlay base database before the next sweep, and
// the open pull requests hold under 0.15 GB, while the newest main entries measure 8.56 GB after the macOS npm and NDK trims.
// The release jobs read the Gradle, Rust and Windows App SDK families and write none of them (cache-save-rules.test.mjs,
// windows-download-workflow.test.ts). Each Android Release writes a 0.12 GB ccache entry in its own family, inside the
// 0.44 GB under the cap; the iOS Release device ccache family (RELEASE_FAMILY_KEYS) has no saved entry to measure yet.
export const CAP_BYTES = 9 * GIGABYTE

// WHY 5 MB: every pass marker and unit result entry is under 0.3 MB and the NSIS tools entry is 1.9 MB, while
// the smallest entry that counts for the budget is the 7.3 MB Gradle home entry.
export const LARGE_ENTRY_BYTES = 5_000_000

// WHY 24 hours: Desktop Build, the least frequent reader of a large main family that a push or a pull request reads,
// went at most 22.8 hours between two of its last 60 runs (Mobile Android Build and Mobile iOS Build 6.4 hours), so
// such a family that nobody read for 24 hours is one main stopped restoring. This tier acts only over the cap.
export const ORPHAN_AFTER_MS = 24 * 60 * 60 * 1000

// WHY: a release writes these families and restores them at its next run, and a release is a dispatch with no bound
// on its gap (iOS Release went 62.7 hours between two of its last 9 runs), so a read older than 24 hours does not show
// that main stopped restoring one. The full key, not the restore prefix: the Mobile Android Build -compile and
// -compile-partial- entries also start with ccache-android-release-, and a prefix would keep the newest partial entry
// forever. cache-save-rules.test.mjs derives these patterns from the key of every release save step.
export const RELEASE_FAMILY_KEYS = [
  /^ccache-android-release-[0-9a-f]{64}-\d+$/,
  /^macos-26-[A-Z0-9]+-xcode-26\.6-ios-device-ccache-v1-[0-9a-f]{64}$/,
]

const PULL_REQUEST_REF = /^refs\/pull\/(\d+)\/merge$/
const PASS_MARKER_KEY = /-pass-v\d+-/
// github/codeql-action at 33d7b85da1a04171e211befe2c739303b9a4c066, src/overlay/caching.ts getCacheSaveKey:
// the key is the restore prefix, then the commit SHA, the run id and the run attempt.
const OVERLAY_BASE_KEY = /^(codeql-overlay-base-database-.+-)[0-9a-f]{40}-\d+-\d+$/

// A key family is a key with its version parts (a hash, a dotted version, a run number) replaced, so a new
// lockfile, toolchain or commit gives a new version of the same family.
const VERSION_PART = /[0-9a-f]{8,}|\d+(?:\.\d+)+|(?<=-)\d+(?=-|$)/g

const isPassMarker = (cache) => PASS_MARKER_KEY.test(cache.key)
const isReleaseFamily = (cache) => RELEASE_FAMILY_KEYS.some((pattern) => pattern.test(cache.key))
export const keyFamily = (key) => key.replace(VERSION_PART, '#')
const totalBytes = (caches) => caches.reduce((sum, cache) => sum + cache.size_in_bytes, 0)

function closedPullRequestEntries(caches, openPullRequests) {
  return caches.filter((cache) => {
    const number = PULL_REQUEST_REF.exec(cache.ref)?.[1]
    return number !== undefined && !openPullRequests.has(Number(number))
  })
}

function supersededOverlayBases(caches) {
  const newestByFamily = new Map()
  const overlayBases = caches.filter((cache) => OVERLAY_BASE_KEY.test(cache.key))
  for (const cache of overlayBases) {
    const family = `${cache.ref} ${OVERLAY_BASE_KEY.exec(cache.key)[1]}`
    const newest = newestByFamily.get(family)
    if (!newest || Date.parse(cache.created_at) > Date.parse(newest.created_at)) newestByFamily.set(family, cache)
  }
  const newest = new Set(newestByFamily.values())
  return overlayBases.filter((cache) => !newest.has(cache))
}

// The newest entry of each family on the default ref is the one main restores.
function newestOfEachDefaultFamily(caches, defaultRef) {
  const newestByFamily = new Map()
  for (const cache of caches.filter((entry) => entry.ref === defaultRef)) {
    const family = keyFamily(cache.key)
    const newest = newestByFamily.get(family)
    if (!newest || Date.parse(cache.created_at) > Date.parse(newest.created_at)) newestByFamily.set(family, cache)
  }
  return new Set(newestByFamily.values())
}

function leastRecentlyReadOverCap(caches, defaultRef, capBytes, now) {
  const newest = newestOfEachDefaultFamily(caches, defaultRef)
  const inUse = (cache) => newest.has(cache) && (isReleaseFamily(cache) || now - Date.parse(cache.last_accessed_at) < ORPHAN_AFTER_MS)
  const tier = (cache) => (cache.ref !== defaultRef ? 0 : newest.has(cache) ? 2 : 1)
  const candidates = caches
    .filter((cache) => cache.size_in_bytes >= LARGE_ENTRY_BYTES && !inUse(cache))
    .sort((left, right) =>
      tier(left) - tier(right) || Date.parse(left.last_accessed_at) - Date.parse(right.last_accessed_at))
  const selected = []
  let remainingBytes = totalBytes(caches)
  for (const cache of candidates) {
    if (remainingBytes <= capBytes) break
    selected.push(cache)
    remainingBytes -= cache.size_in_bytes
  }
  return selected
}

/**
 * Selects the cache entries to delete. Each cache is one item of `actions_caches` from
 * GET /repos/{owner}/{repo}/actions/caches: https://docs.github.com/en/rest/actions/cache
 */
export function selectCachesToDelete({ caches, openPullRequests, defaultRef, now = Date.now(), capBytes = CAP_BYTES }) {
  const open = new Set(openPullRequests)
  const selection = []
  let kept = caches.filter((cache) => !isPassMarker(cache))
  const select = (entries, reason) => {
    const deleted = new Set(entries)
    for (const cache of entries) selection.push({ cache, reason })
    kept = kept.filter((cache) => !deleted.has(cache))
  }
  select(closedPullRequestEntries(kept, open), 'closed pull request')
  select(supersededOverlayBases(kept), 'superseded overlay base database')
  const markerBytes = totalBytes(caches.filter(isPassMarker))
  select(leastRecentlyReadOverCap(kept, defaultRef, capBytes - markerBytes, now), 'over the cap')
  return selection
}

function ghJson(gh, argumentsList) {
  return JSON.parse(gh(argumentsList))
}

export function sweep({ gh, repository, dryRun, now = Date.now(), log = console.log }) {
  const pages = ghJson(gh, ['api', '--paginate', '--slurp', `repos/${repository}/actions/caches?per_page=100`])
  const caches = pages.flatMap((page) => page.actions_caches)
  const pullPages = ghJson(gh, ['api', '--paginate', '--slurp', `repos/${repository}/pulls?state=open&per_page=100`])
  const openPullRequests = pullPages.flat().map((pullRequest) => pullRequest.number)
  const defaultRef = `refs/heads/${ghJson(gh, ['api', `repos/${repository}`]).default_branch}`
  const selection = selectCachesToDelete({ caches, openPullRequests, defaultRef, now })
  const megabytes = (bytes) => `${(bytes / 1_000_000).toFixed(1)} MB`
  const failures = []
  for (const { cache, reason } of selection) {
    log(`${dryRun ? 'would delete' : 'delete'} ${cache.id} ${megabytes(cache.size_in_bytes)} ${cache.ref} ${cache.key} (${reason})`)
    if (dryRun) continue
    try {
      gh(['api', '--method', 'DELETE', `repos/${repository}/actions/caches/${cache.id}`])
    } catch (error) {
      failures.push(`${cache.id}: ${error.message}`)
    }
  }
  const before = totalBytes(caches)
  const after = before - totalBytes(selection.map(({ cache }) => cache))
  log(`${caches.length} entries, ${megabytes(before)} before; ${selection.length} selected, ${megabytes(after)} after; cap ${megabytes(CAP_BYTES)}`)
  if (after > CAP_BYTES) log(`::warning::The main entries read within 24 hours and the release families keep the total over the cap: trim a cache family or raise CAP_BYTES.`)
  if (failures.length) throw new Error(`${failures.length} delete requests failed:\n${failures.join('\n')}`)
}

function main(argumentsList) {
  if (argumentsList.length === 1 && ['--help', '-h'].includes(argumentsList[0])) {
    console.log(usage)
    return 0
  }
  const dryRun = argumentsList.includes('--dry-run')
  const rest = argumentsList.filter((argument) => argument !== '--dry-run')
  const [flag, repository] = rest
  if (rest.length !== 2 || flag !== '--repository' || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    console.error(usage)
    return 2
  }
  try {
    sweep({ gh: (ghArguments) => execFileSync('gh', ghArguments, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }), repository, dryRun })
    return 0
  } catch (error) {
    console.error(error.message)
    return 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
