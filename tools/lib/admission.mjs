import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { readGithub } from "./github-read.mjs"
import { isCloudTaskId, isTerminalTaskStatus, mirrorPathFor, reservationPathFor } from "./cloud-worker.mjs"
import { redactSecrets, repositorySlug } from "./github-auth.mjs"
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

export const bindCloudAdmission = (reservationId, stateRoot, cloudReservationId, repoRoot = REPO_ROOT) => {
  if (!reservationId) return
  reservationPathFor(stateRoot, cloudReservationId)
  const directory = reservationDirectory(repoRoot)
  const reservation = readReservation(join(directory, `admission-${reservationId}.json`))
  if (!reservation || Number.isFinite(reservation.releasedAt)) throw new Error("admission claim was released before Cloud submission")
  publishReservation(directory, `admission-${reservationId}`, { ...reservation, cloud: { stateRoot, reservationId: cloudReservationId } })
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

export const QUEUED_RUN_WINDOW_MS = 24 * 60 * 60 * 1000

export const queuedRunsPath = (slug, now) => {
  const since = new Date(now - QUEUED_RUN_WINDOW_MS).toISOString().replace(/\.\d{3}Z$/, "Z")
  return `repos/${slug}/actions/runs?status=queued&created=${encodeURIComponent(`>=${since}`)}&per_page=1`
}

const openPullRequests = async (slug, environment, readOptions) => {
  let count = 0
  for (let page = 1; ; page += 1) {
    const pulls = await readGithub(`repos/${slug}/pulls?state=open&per_page=100&page=${page}`, environment, readOptions)
    if (!Array.isArray(pulls) || pulls.some((pull) => !Number.isInteger(pull.number))) {
      throw new Error(`GitHub open pull requests for ${slug} had an unexpected shape`)
    }
    count += pulls.length
    if (pulls.length < 100) return count
  }
}

const branchPullRequests = async (slug, owner, branch, environment, readOptions) => {
  const head = encodeURIComponent(`${owner}:${branch}`)
  const pulls = await readGithub(`repos/${slug}/pulls?head=${head}&state=open&per_page=100`, environment, readOptions)
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

const cloudReceipt = (cloud) => {
  const reservationPath = reservationPathFor(cloud.stateRoot, cloud.reservationId)
  if (existsSync(reservationPath)) {
    try {
      const reservation = JSON.parse(readFileSync(reservationPath, "utf8"))
      if (reservation.submissionState !== "confirmed" || !isCloudTaskId(reservation.taskId)) return reservation
      const mirrorPath = mirrorPathFor(cloud.stateRoot, reservation.taskId)
      if (existsSync(mirrorPath)) return JSON.parse(readFileSync(mirrorPath, "utf8"))
      return reservation
    } catch { return null }
  }
  const directory = join(cloud.stateRoot, "receipts")
  if (!existsSync(directory)) return null
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".json")) continue
    let receipt
    try { receipt = JSON.parse(readFileSync(join(directory, name), "utf8")) } catch { continue }
    if (receipt?.kind === "task-receipt" && receipt.transitionReservationId === cloud.reservationId) return receipt
  }
  return null
}

const cloudTerminalAt = (receipt) => {
  if (receipt?.submissionState === "released") return Date.parse(receipt.released?.at ?? "")
  if (isTerminalTaskStatus(receipt?.terminal?.status)) return Date.parse(receipt.terminal.at)
  return NaN
}

const liveReservations = async (repoRoot, owner, environment, now, readOptions) => {
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
    if (!Number.isFinite(reservation.releasedAt) && reservation.cloud) {
      const terminalAt = cloudTerminalAt(cloudReceipt(reservation.cloud))
      if (Number.isFinite(terminalAt)) releaseAdmission(name.slice("admission-".length, -".json".length), repoRoot, terminalAt)
    } else if (!Number.isFinite(reservation.releasedAt)) {
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
    const branchHasPullRequest = (await branchPullRequests(reservation.repository, owner, reservation.branch, environment, readOptions)).length > 0
    if (reservation.cloud && branchHasPullRequest && !Number.isFinite(released)) {
      releaseAdmission(name.slice("admission-".length, -".json".length), repoRoot, now)
    }
    counts.queuedRuns++
    if (!branchHasPullRequest) counts.pullRequests++
  }
  return counts
}

export const checkAdmission = async ({ config, repositoryKey, branch, environment, worktree, now = Date.now(), repoRoot = REPO_ROOT, lockWaitMs = LOCK_WAIT_MS }) => {
  const limits = { maxOpenPullRequests: config.caps.maxOpenPullRequests, maxQueuedRuns: config.caps.maxQueuedRuns }
  const counts = { openPullRequests: null, queuedRuns: null, reservations: null }
  const transientErrors = { count: 0, last: null }
  const observation = { counts, limits, transientErrors }
  const readOptions = { onTransientError: (text) => {
    transientErrors.count++
    transientErrors.last = redactSecrets(text, [environment.GH_TOKEN, environment.GITHUB_TOKEN])
  } }
  let unlock
  try {
    const startIdentity = processStartIdentity(process.pid)
    if (!startIdentity) throw new Error("could not verify admission launcher process start identity")
    unlock = await acquireLock(repoRoot, startIdentity, lockWaitMs)
    const targetPath = config.repos[repositoryKey]
    const owner = repositorySlug(existsSync(targetPath) ? targetPath : worktree).split("/")[0]
    const target = configuredRepositorySlug(config.repos[repositoryKey], owner)
    const existing = await branchPullRequests(target, owner, branch, environment, readOptions)
    if (existing.length > 0) return { admitted: true, existingPullRequest: existing[0].number, ...observation }
    // Reconcile first, then read the fleet counts. A PR appearing between these reads can
    // temporarily count twice, but cannot disappear from both the claim and GitHub total.
    counts.reservations = await liveReservations(repoRoot, owner, environment, now, readOptions)
    counts.openPullRequests = 0
    counts.queuedRuns = 0
    for (const path of Object.values(config.repos)) {
      const slug = configuredRepositorySlug(path, owner)
      counts.openPullRequests += await openPullRequests(slug, environment, readOptions)
      const runs = await readGithub(queuedRunsPath(slug, now), environment, readOptions)
      if (!Number.isInteger(runs?.total_count) || runs.total_count < 0) {
        throw new Error(`GitHub queued runs for ${slug} had an unexpected shape`)
      }
      counts.queuedRuns += runs.total_count
    }
    if (counts.openPullRequests + counts.reservations.pullRequests > limits.maxOpenPullRequests ||
        counts.queuedRuns + counts.reservations.queuedRuns > limits.maxQueuedRuns) {
      return { admitted: false, reason: "ADMISSION_REFUSED", ...observation, error: null }
    }
    const reservationId = randomUUID()
    mkdirSync(reservationDirectory(repoRoot), { recursive: true })
    publishReservation(reservationDirectory(repoRoot), `admission-${reservationId}`,
      { pid: process.pid, startIdentity, repository: target, branch, timestamp: new Date(now).toISOString() })
    return { admitted: true, reservationId, ...observation }
  } catch (error) {
    return { admitted: false, reason: "ADMISSION_REFUSED", ...observation, error: redactSecrets(error.message, [environment.GH_TOKEN, environment.GITHUB_TOKEN]) }
  } finally {
    if (unlock) unlock()
  }
}

/** Snapshot counts never reconcile, release, reserve, lock or delete admission records. */
export const readAdmissionCounts = ({ repoRoot = REPO_ROOT, snapshots, limits, now = Date.now() }) => {
  const reservations = { pullRequests: 0, queuedRuns: 0, unreadable: 0 }
  const directory = reservationDirectory(repoRoot)
  const names = existsSync(directory) ? readdirSync(directory).filter((name) => name.startsWith("admission-") && name.endsWith(".json")) : []
  for (const name of names) {
    const reservation = readReservation(join(directory, name))
    if (!reservation) { reservations.unreadable++; continue }
    const terminalAt = reservation.cloud ? cloudTerminalAt(cloudReceipt(reservation.cloud)) : NaN
    const releasedAt = Number.isFinite(reservation.releasedAt) ? reservation.releasedAt : terminalAt
    if (Number.isFinite(releasedAt) && now - releasedAt >= RELEASE_HOLD_MS) continue
    reservations.queuedRuns++
    const snapshot = snapshots.find((entry) => entry.slug === reservation.repository)
    if (!snapshot?.openBranches.includes(reservation.branch)) reservations.pullRequests++
  }
  const complete = snapshots.every((entry) => entry.status === "OK" && Number.isInteger(entry.openPullRequests) && Number.isInteger(entry.queuedRuns)) && reservations.unreadable === 0
  const openPullRequests = complete ? snapshots.reduce((sum, entry) => sum + entry.openPullRequests, 0) : null
  const queuedRuns = complete ? snapshots.reduce((sum, entry) => sum + entry.queuedRuns, 0) : null
  return { openPullRequests, queuedRuns, reservations, complete,
    slotFree: complete && openPullRequests + reservations.pullRequests <= limits.maxOpenPullRequests && queuedRuns + reservations.queuedRuns <= limits.maxQueuedRuns }
}
