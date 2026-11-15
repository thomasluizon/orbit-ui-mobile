#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const usage = `usage: sweep-actions-caches.mjs --repository <owner/name> [--dry-run]

  Keeps the GitHub Actions cache of one repository under its budget. It deletes, in this order:
  1. every entry on the merge ref of a pull request that is not open,
  2. every CodeQL overlay base database that a newer one on the same ref replaces,
  3. the least recently read large entries, until the total is at or under the cap.
  A pass marker is never deleted. --dry-run prints the selection and deletes nothing.
  The gh CLI reads GH_TOKEN, which needs the actions: write and pull-requests: read permissions.

exit codes: 0 swept, 1 a list or delete request failed, 2 invalid arguments`

const GIGABYTE = 1_000_000_000

// WHY 8.5 GB: the repository limit is 10 GB (GET /repos/{owner}/{repo}/actions/cache/storage-limit returns
// max_cache_size_gb 10), and one main push writes up to 1.43 GB before the next sweep (three npm entries of
// 0.47 GB each when the lockfile changes) or one 0.85 GB CodeQL overlay base database.
export const CAP_BYTES = 8.5 * GIGABYTE

// WHY 5 MB: every pass marker and unit result entry is under 0.3 MB and the NSIS tools entry is 1.9 MB, while
// the smallest entry that counts for the budget is the 7.3 MB Gradle home entry.
export const LARGE_ENTRY_BYTES = 5_000_000

const PULL_REQUEST_REF = /^refs\/pull\/(\d+)\/merge$/
const PASS_MARKER_KEY = /-pass-v\d+-/
// github/codeql-action at 33d7b85da1a04171e211befe2c739303b9a4c066, src/overlay/caching.ts getCacheSaveKey:
// the key is the restore prefix, then the commit SHA, the run id and the run attempt.
const OVERLAY_BASE_KEY = /^(codeql-overlay-base-database-.+-)[0-9a-f]{40}-\d+-\d+$/

const isPassMarker = (cache) => PASS_MARKER_KEY.test(cache.key)
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

function leastRecentlyReadOverCap(caches, defaultRef, capBytes) {
  const candidates = caches
    .filter((cache) => cache.size_in_bytes >= LARGE_ENTRY_BYTES)
    .sort((left, right) =>
      Number(left.ref === defaultRef) - Number(right.ref === defaultRef) ||
      Date.parse(left.last_accessed_at) - Date.parse(right.last_accessed_at))
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
export function selectCachesToDelete({ caches, openPullRequests, defaultRef, capBytes = CAP_BYTES }) {
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
  select(leastRecentlyReadOverCap(kept, defaultRef, capBytes - markerBytes), 'over the cap')
  return selection
}

function ghJson(gh, argumentsList) {
  return JSON.parse(gh(argumentsList))
}

export function sweep({ gh, repository, dryRun, log = console.log }) {
  const pages = ghJson(gh, ['api', '--paginate', '--slurp', `repos/${repository}/actions/caches?per_page=100`])
  const caches = pages.flatMap((page) => page.actions_caches)
  const pullPages = ghJson(gh, ['api', '--paginate', '--slurp', `repos/${repository}/pulls?state=open&per_page=100`])
  const openPullRequests = pullPages.flat().map((pullRequest) => pullRequest.number)
  const defaultRef = `refs/heads/${ghJson(gh, ['api', `repos/${repository}`]).default_branch}`
  const selection = selectCachesToDelete({ caches, openPullRequests, defaultRef })
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
