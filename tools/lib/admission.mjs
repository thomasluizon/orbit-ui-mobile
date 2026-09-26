import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { runBounded } from "./bounded-process.mjs"
import { repositorySlug } from "./github-auth.mjs"
import { gitDirectoryOf, processIsAlive, processStartIdentity, REPO_ROOT, workerLaunchDirectory } from "./run-state.mjs"

/** The checked-in repo paths are Windows paths. On macOS, their final directory names match the
 * verified GitHub origins, while the Windows checkouts themselves do not exist. */
export const configuredRepositorySlug = (path, owner) => {
  if (existsSync(path)) return repositorySlug(path)
  const name = path.replaceAll("\\", "/").split("/").filter(Boolean).at(-1)
  if (!/^[A-Za-z0-9._-]+$/.test(name ?? "")) throw new Error(`invalid configured repository path: ${path}`)
  return `${owner}/${name}`
}

export const ADMISSION_REFUSED_EXIT = 8
const LOCK_WAIT_MS = 5000
const LOCK_RETRY_MS = 25
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const reservationDirectory = workerLaunchDirectory
const lockPath = (repoRoot) => join(gitDirectoryOf(repoRoot), "orbit-admission.lock")

/**
 * GitHub can show a new pull request, or create its Actions runs, after the launcher that opened it
 * has exited. So a released claim keeps holding a queued run, and a pull request until its branch
 * has one, for this window instead of vanishing (reviews of ui#1105). The window, not a guess about
 * GitHub's timing, is where this guard's regress stops (D117).
 */
export const RELEASE_HOLD_MS = 5 * 60 * 1000

const publishReservation = (directory, name, reservation) => {
  const unpublished = join(directory, `${name}.${randomUUID()}.unpublished`)
  writeFileSync(unpublished, JSON.stringify(reservation), { flag: "wx" })
  renameSync(unpublished, join(directory, `${name}.json`))
}

export const releaseAdmission = (reservationId, repoRoot = REPO_ROOT, releasedAt = Date.now()) => {
  if (!reservationId) return
  const directory = reservationDirectory(repoRoot)
  const reservation = readReservation(join(directory, `admission-${reservationId}.json`))
  if (!reservation || Number.isFinite(reservation.releasedAt)) return
  publishReservation(directory, `admission-${reservationId}`, { ...reservation, releasedAt })
}

const acquireLock = async (repoRoot, startIdentity, waitMs) => {
  const path = lockPath(repoRoot)
  const deadline = Date.now() + waitMs
  mkdirSync(gitDirectoryOf(repoRoot), { recursive: true })
  while (true) {
    try {
      writeFileSync(path, JSON.stringify({ pid: process.pid, startIdentity, timestamp: new Date().toISOString() }), { flag: "wx" })
      return () => rmSync(path, { force: true })
    } catch (error) {
      if (error.code !== "EEXIST") throw error
    }
    const stat = statSync(path, { throwIfNoEntry: false })
    if (stat) {
      let holder
      try { holder = JSON.parse(readFileSync(path, "utf8")) } catch { holder = null }
      const observedIdentity = Number.isInteger(holder?.pid) ? processStartIdentity(holder.pid) : null
      if (Number.isInteger(holder?.pid) && typeof holder.startIdentity === "string" &&
          observedIdentity !== holder.startIdentity && (observedIdentity !== null || !processIsAlive(holder.pid))) {
        const current = statSync(path, { throwIfNoEntry: false })
        if (current && current.ino === stat.ino && current.mtimeMs === stat.mtimeMs) rmSync(path, { force: true })
      } else if (!holder && Date.now() - stat.mtimeMs > LOCK_WAIT_MS) {
        const current = statSync(path, { throwIfNoEntry: false })
        if (current && current.ino === stat.ino && current.mtimeMs === stat.mtimeMs) rmSync(path, { force: true })
      }
    }
    if (Date.now() >= deadline) throw new Error(`admission lock timed out after ${waitMs} ms`)
    await sleep(LOCK_RETRY_MS)
  }
}

/**
 * Only a run created in the last 24 hours counts as queued. Measured 2026-09-25: 8 orbit-ui-mobile
 * runs created 2026-09-13 sit at `status: queued` with zero jobs, and GitHub refuses to remove them
 * (`gh run cancel`: "Cannot cancel a workflow run that is completed"; force-cancel HTTP 409; DELETE
 * HTTP 403). A raw count would carry them forever. The real queue on 2026-09-24 and 25 held a run
 * for about an hour, far inside this window.
 */
export const QUEUED_RUN_WINDOW_MS = 24 * 60 * 60 * 1000

export const queuedRunsPath = (slug, now) => {
  const since = new Date(now - QUEUED_RUN_WINDOW_MS).toISOString().replace(/\.\d{3}Z$/, "Z")
  return `repos/${slug}/actions/runs?status=queued&created=${encodeURIComponent(`>=${since}`)}&per_page=1`
}

export const readGithub = async (path, environment) => {
  const result = await runBounded(environment.GH_BIN || "gh", ["api", path], {
    env: environment, timeoutMs: 30000, maxBuffer: 8 * 1024 * 1024,
  })
  if (result.timedOut || result.error || result.status !== 0) {
    throw new Error(`GitHub read ${path} failed: ${result.stderr || result.error?.message || `exit ${result.status}`}`)
  }
  try { return JSON.parse(result.stdout) } catch (error) {
    throw new Error(`GitHub read ${path} returned invalid JSON: ${error.message}`)
  }
}

const openPullRequests = async (slug, environment) => {
  let count = 0
  for (let page = 1; ; page += 1) {
    const pulls = await readGithub(`repos/${slug}/pulls?state=open&per_page=100&page=${page}`, environment)
    if (!Array.isArray(pulls) || pulls.some((pull) => !Number.isInteger(pull.number))) {
      throw new Error(`GitHub open pull requests for ${slug} had an unexpected shape`)
    }
    count += pulls.length
    if (pulls.length < 100) return count
  }
}

const branchPullRequests = async (slug, owner, branch, environment) => {
  const head = encodeURIComponent(`${owner}:${branch}`)
  const pulls = await readGithub(`repos/${slug}/pulls?head=${head}&state=open&per_page=100`, environment)
  if (!Array.isArray(pulls) || pulls.some((pull) => !Number.isInteger(pull.number))) {
    throw new Error(`GitHub branch pull requests for ${slug} had an unexpected shape`)
  }
  return pulls
}

const readReservation = (path) => {
  try {
    const reservation = JSON.parse(readFileSync(path, "utf8"))
    return Number.isInteger(reservation?.pid) && typeof reservation.startIdentity === "string" &&
      typeof reservation.repository === "string" && typeof reservation.branch === "string" ? reservation : null
  } catch {
    return null
  }
}

/**
 * A claim is published by rename, so a file that does not parse was never a live claim: it is the
 * remains of a write interrupted before this change, and it is removed rather than refusing forever.
 * A claim stops counting toward open pull requests once its branch has one, because GitHub then
 * counts it, but it keeps counting toward queued runs while its launcher lives, because GitHub can
 * show the pull request before its Actions runs exist (review of ui#1105).
 */
const liveReservations = async (repoRoot, owner, environment, now) => {
  const directory = reservationDirectory(repoRoot)
  const counts = { pullRequests: 0, queuedRuns: 0 }
  if (!existsSync(directory)) return counts
  for (const name of readdirSync(directory)) {
    if (!name.startsWith("admission-") || !name.endsWith(".json")) continue
    const path = join(directory, name)
    const reservation = readReservation(path)
    if (!reservation) {
      rmSync(path, { force: true })
      continue
    }
    if (!Number.isFinite(reservation.releasedAt)) {
      const observedIdentity = processStartIdentity(reservation.pid)
      if (observedIdentity === null && processIsAlive(reservation.pid)) {
        throw new Error(`could not verify live admission reservation ${name}`)
      }
      if (observedIdentity !== reservation.startIdentity) releaseAdmission(name.slice("admission-".length, -".json".length), repoRoot, now)
    }
    const released = readReservation(path)?.releasedAt
    if (Number.isFinite(released) && now - released >= RELEASE_HOLD_MS) {
      rmSync(path, { force: true })
      continue
    }
    counts.queuedRuns++
    if ((await branchPullRequests(reservation.repository, owner, reservation.branch, environment)).length === 0) counts.pullRequests++
  }
  return counts
}

export const checkAdmission = async ({ config, repositoryKey, branch, environment, worktree, now = Date.now(), repoRoot = REPO_ROOT, lockWaitMs = LOCK_WAIT_MS }) => {
  const limits = { maxOpenPullRequests: config.caps.maxOpenPullRequests, maxQueuedRuns: config.caps.maxQueuedRuns }
  const counts = { openPullRequests: null, queuedRuns: null, reservations: null }
  let unlock
  try {
    const startIdentity = processStartIdentity(process.pid)
    if (!startIdentity) throw new Error("could not verify admission launcher process start identity")
    unlock = await acquireLock(repoRoot, startIdentity, lockWaitMs)
    const targetPath = config.repos[repositoryKey]
    const owner = repositorySlug(existsSync(targetPath) ? targetPath : worktree).split("/")[0]
    const target = configuredRepositorySlug(config.repos[repositoryKey], owner)
    const existing = await branchPullRequests(target, owner, branch, environment)
    if (existing.length > 0) return { admitted: true, existingPullRequest: existing[0].number, counts, limits }
    // Reconcile first, then read the fleet counts. A PR appearing between these reads can
    // temporarily count twice, but cannot disappear from both the claim and GitHub total.
    counts.reservations = await liveReservations(repoRoot, owner, environment, now)
    counts.openPullRequests = 0
    counts.queuedRuns = 0
    for (const path of Object.values(config.repos)) {
      const slug = configuredRepositorySlug(path, owner)
      counts.openPullRequests += await openPullRequests(slug, environment)
      const runs = await readGithub(queuedRunsPath(slug, now), environment)
      if (!Number.isInteger(runs?.total_count) || runs.total_count < 0) {
        throw new Error(`GitHub queued runs for ${slug} had an unexpected shape`)
      }
      counts.queuedRuns += runs.total_count
    }
    if (counts.openPullRequests + counts.reservations.pullRequests > limits.maxOpenPullRequests ||
        counts.queuedRuns + counts.reservations.queuedRuns > limits.maxQueuedRuns) {
      return { admitted: false, reason: "ADMISSION_REFUSED", counts, limits, error: null }
    }
    const reservationId = randomUUID()
    mkdirSync(reservationDirectory(repoRoot), { recursive: true })
    publishReservation(reservationDirectory(repoRoot), `admission-${reservationId}`,
      { pid: process.pid, startIdentity, repository: target, branch, timestamp: new Date(now).toISOString() })
    return { admitted: true, reservationId, counts, limits }
  } catch (error) {
    return { admitted: false, reason: "ADMISSION_REFUSED", counts, limits, error: error.message }
  } finally {
    if (unlock) unlock()
  }
}
