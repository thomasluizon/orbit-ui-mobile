/**
 * What an unattended run has left to do, and what will wake it.
 *
 * WHY it exists, measured 2026-08-06: the ONLY thing that continues a `--sleep` run is a background
 * task completing and re-invoking the session. Nothing verified one existed. The orchestrator ended a
 * turn saying "CI will wake me" with nothing scheduled, and the night simply stopped, leaving an
 * artifact trail identical to a run that finished. A queue that ends silently is worse than one that
 * fails loudly, because nobody looks for it.
 *
 * These records live in `.git/`, because that directory is per-checkout, never committed, writable,
 * and needs no gitignore entry:
 *
 *   .git/orbit-orchestrate-run.json     the ORCHESTRATOR is its only writer: which session, whether
 *                                       --sleep is on, and which tickets remain.
 *   .git/orbit-wake-sources/<pid>.json  one file per live wake source, written by launch-worker.mjs
 *                                       when it starts and removed when it exits.
 *   .git/orbit-worker-launches/<id>.json one file per attempted worker launch that was admitted.
 *
 * One file per wake source rather than an array in one file: under `--parallel` three launchers write
 * at once, and a read-modify-write on a shared array loses entries. A crashed launcher leaks its file
 * instead of removing it. The reader checks the process start identity as well as liveness, because
 * a reused pid must never turn an old registration into evidence that a worker still exists.
 *
 * Status writes fail soft for readers. Launch admission fails closed if ownership cannot be
 * published before a worker starts.
 */

import { spawnSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const GITDIR_LINE = /^gitdir:[ \t]*(.+?)[ \t]*$/m
// Linux proc_pid_stat(5): Z is zombie; x is the historical spelling of dead state X.
const LINUX_DEAD_PROCESS_STATES = new Set(["Z", "X", "x"])
export const PENDING_WAKE_SOURCE_MAX_AGE_MS = 45_000
const DARWIN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
// BSD ps prints `Ss   Thu Sep 24 14:06:02 2026` for `stat=,lstart=` under LC_ALL=C and TZ=UTC0.
const DARWIN_PS_LINE = /^(\S+)\s+[A-Z][a-z]{2} ([A-Z][a-z]{2}) +(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})\s*$/

/**
 * macOS has no /proc, so its start identity comes from `ps`. Read on the M5 Pro for this port
 * (2026-09-24): a live pid prints one line, a missing pid prints nothing and exits 1. `lstart` has
 * one-second resolution and is absolute time, so a reboot cannot repeat it, and exec keeps it.
 * Returns the BSD state string and the start in epoch seconds, or null when the probe fails.
 */
export const darwinProcessStart = (pid) => {
  const result = spawnSync("ps", ["-o", "stat=,lstart=", "-p", String(pid)], {
    encoding: "utf8", timeout: 3000, env: { ...process.env, LC_ALL: "C", TZ: "UTC0" },
  })
  const match = result.status === 0 ? DARWIN_PS_LINE.exec(result.stdout.trim()) : null
  const month = match ? DARWIN_MONTHS.indexOf(match[2]) : -1
  if (month < 0) return null
  const [, state, , day, hours, minutes, seconds, year] = match
  return { state, startSeconds: Date.UTC(Number(year), month, Number(day), Number(hours), Number(minutes), Number(seconds)) / 1000 }
}
/**
 * A ledger row's `merged` value must LOOK like a merge commit sha, because the whole safety
 * argument for that field is that a reader can check it against GitHub. A `blocker` may be any
 * non-empty string, since a false one prints a loud BLOCKED banner; a false `merged` ends an
 * unattended night in silence. `orchestrate/SKILL.md` hands the run a template whose value is the
 * literal "<merge commit sha once it is merged, or absent>", which a non-empty-string test accepts.
 * `.claude/hooks/_lib/rules-sleep.mjs` carries the same rule for the Stop hook; the two must not
 * drift, and `.claude/hooks/test-hooks.mjs` asserts that they have not.
 */
const MERGE_SHA = /^[0-9a-f]{7,40}$/

/**
 * The directory git itself keeps state in. An ordinary checkout carries a `.git` DIRECTORY; a linked
 * worktree carries a `.git` FILE pointing at <main>/.git/worktrees/<name>. Following that line keeps
 * the state PER CHECKOUT, so a worktree can never read or clobber the orchestrating session's record.
 */
export const gitDirectoryOf = (repoRoot) => {
  const marker = join(repoRoot, ".git")
  try {
    if (statSync(marker).isDirectory()) return marker
    const gitdir = GITDIR_LINE.exec(readFileSync(marker, "utf8"))
    return gitdir ? resolve(repoRoot, gitdir[1]) : marker
  } catch {
    return marker
  }
}

/** tools/lib/ -> the repository root that owns this checkout's `.git`. */
export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url))

export const runStatePath = (repoRoot = REPO_ROOT) => join(gitDirectoryOf(repoRoot), "orbit-orchestrate-run.json")
export const wakeSourceDirectory = (repoRoot = REPO_ROOT) => join(gitDirectoryOf(repoRoot), "orbit-wake-sources")
export const workerLaunchDirectory = (repoRoot = REPO_ROOT) => join(gitDirectoryOf(repoRoot), "orbit-worker-launches")
const occupiedWorktreePath = (repoRoot) => join(workerLaunchDirectory(repoRoot), "occupied-worktree.json")
const processIsMissing = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return true
  try { process.kill(pid, 0); return false } catch (error) { return error?.code === "ESRCH" }
}

const readWorkerLaunchRecords = (repoRoot = REPO_ROOT) => {
  const directory = workerLaunchDirectory(repoRoot)
  let names
  try {
    names = readdirSync(directory).filter((name) => name.endsWith(".json") && (name.includes("-slot-") || name.includes("-override-")))
  } catch {
    return []
  }
  const records = []
  for (const name of names) {
    try {
      records.push({ name, launch: JSON.parse(readFileSync(join(directory, name), "utf8")) })
    } catch {
      /* an unreadable launch cannot prove that the branch cap was reached */
    }
  }
  return records.sort((left, right) =>
    String(left.launch?.timestamp).localeCompare(String(right.launch?.timestamp)) || left.name.localeCompare(right.name))
}

export const readWorkerLaunches = (repoRoot = REPO_ROOT) => readWorkerLaunchRecords(repoRoot).map((record) => record.launch)

const readLaunchFiles = (paths) => paths.flatMap((path) => {
  try {
    return [JSON.parse(readFileSync(path, "utf8"))]
  } catch {
    return []
  }
})

const writeAtomicFile = (path, contents) => {
  const unpublished = `${path}.${randomUUID()}.unpublished`
  try {
    writeFileSync(unpublished, contents, { flag: "wx" })
    renameSync(unpublished, path)
  } finally {
    rmSync(unpublished, { force: true })
  }
}

const claimLaunchFile = (path, launch) => {
  const unpublished = `${path}.${randomUUID()}.unpublished`
  try {
    writeFileSync(unpublished, `${JSON.stringify(launch, null, 2)}\n`, { flag: "wx" })
    // A rename could replace another launcher's claim. A hard link publishes the complete file
    // only if the destination is still absent.
    linkSync(unpublished, path)
    return { claimed: true, occupied: true, recorded: true }
  } catch {
    return { claimed: false, occupied: existsSync(path), recorded: false }
  } finally {
    rmSync(unpublished, { force: true })
  }
}

const processDefinitelyGone = (pid, identity) => {
  if (processIsMissing(pid)) return true
  const currentIdentity = processStartIdentity(pid)
  return typeof identity === "string" && currentIdentity !== null && currentIdentity !== identity
}

const reclaimOwner = (launch) => ({
  launcherPid: launch.launcherPid,
  launcherProcessStartIdentity: processStartIdentity(launch.launcherPid),
})

const reclaimIsStale = (path) => {
  try {
    const claim = JSON.parse(readFileSync(path, "utf8"))
    return processDefinitelyGone(claim.launcherPid, claim.launcherProcessStartIdentity)
  } catch {
    return false
  }
}

const removeStaleReclaim = (path) => {
  if (!reclaimIsStale(path)) return false
  const recovered = `${path}.${randomUUID()}.recovered`
  try { renameSync(path, recovered) } catch { return false }
  try {
    // Another launcher may have replaced the stale sentinel between our first read and rename.
    // Restore a live replacement without overwriting a third launcher's claim.
    if (reclaimIsStale(recovered)) return true
    try { linkSync(recovered, path) } catch { /* a newer sentinel already owns the path */ }
    return false
  } finally {
    rmSync(recovered, { force: true })
  }
}

/** Each exact slot name can be claimed once, so no read-then-decide race can exceed the cap. */
export const reserveWorkerLaunch = (launch, cap, repoRoot = REPO_ROOT) => {
  const directory = workerLaunchDirectory(repoRoot)
  try {
    mkdirSync(directory, { recursive: true })
  } catch {
    if (Number.isInteger(launch.launcherPid)) {
      return { allowed: false, occupiedLauncherPid: null, earlierLaunches: [], recorded: false }
    }
    return { allowed: true, earlierLaunches: [], recorded: false }
  }
  if (Number.isInteger(launch.launcherPid)) {
    const wakeStates = readWakeSourceStates(repoRoot)
    const occupied = [...wakeStates.live, ...wakeStates.orphaned].find((source) =>
      isWakeSourceAlive({ pid: source.workerPid, processStartIdentity: source.workerProcessStartIdentity }))
    if (occupied) return { allowed: false, occupiedWorkerPid: occupied.workerPid, earlierLaunches: [], recorded: false }
    const path = occupiedWorktreePath(repoRoot)
    const reclaimPath = `${path}.reclaim`
    let claimed = false
    for (let attempt = 0; attempt < 3; attempt++) {
      if (existsSync(reclaimPath)) {
        if (!removeStaleReclaim(reclaimPath)) return { allowed: false, occupiedLauncherPid: null, earlierLaunches: [], recorded: false }
      }
      const claim = claimLaunchFile(path, {
        launcherPid: launch.launcherPid,
        launcherProcessStartIdentity: processStartIdentity(launch.launcherPid),
        gateProtocol: 1,
      })
      if (claim.claimed) {
        if (!claim.recorded) {
          rmSync(path, { force: true })
          return { allowed: false, occupiedLauncherPid: null, earlierLaunches: [], recorded: false }
        }
        claimed = true
        break
      }
      if (!claim.occupied) return { allowed: false, occupiedLauncherPid: null, earlierLaunches: [], recorded: false }
      let previous
      let previousContents
      try {
        previousContents = readFileSync(path, "utf8")
        previous = JSON.parse(previousContents)
      } catch { previous = null }
      if (!previous) return { allowed: false, occupiedLauncherPid: null, earlierLaunches: [], recorded: false }
      // Older launchers could start a child before publishing its pid. Their pid-less claim cannot
      // prove the worktree is free after the launcher dies.
      if (previous.gateProtocol !== 1 && !Number.isInteger(previous.workerPid)) {
        return { allowed: false, occupiedLauncherPid: previous.launcherPid ?? null, earlierLaunches: [], recorded: false }
      }
      if (isWakeSourceAlive({ pid: previous.workerPid, processStartIdentity: previous.workerProcessStartIdentity })) {
        return { allowed: false, occupiedWorkerPid: previous.workerPid, earlierLaunches: [], recorded: false }
      }
      if (isWakeSourceAlive({ pid: previous.launcherPid, processStartIdentity: previous.launcherProcessStartIdentity })) {
        return { allowed: false, occupiedLauncherPid: previous.launcherPid, earlierLaunches: [], recorded: false }
      }
      if (!processDefinitelyGone(previous.launcherPid, previous.launcherProcessStartIdentity) ||
          !processDefinitelyGone(previous.workerPid, previous.workerProcessStartIdentity)) {
        return { allowed: false, occupiedLauncherPid: previous.launcherPid, earlierLaunches: [], recorded: false }
      }
      const reclaim = claimLaunchFile(reclaimPath, reclaimOwner(launch))
      if (!reclaim.claimed) {
        return { allowed: false, occupiedLauncherPid: previous.launcherPid, earlierLaunches: [], recorded: false }
      }
      try {
        if (readFileSync(path, "utf8") === previousContents) rmSync(path)
      } catch { /* the next claim observes the current occupant */ }
      finally {
        rmSync(reclaimPath, { force: true })
      }
    }
    if (!claimed) return { allowed: false, occupiedLauncherPid: null, earlierLaunches: [], recorded: false }
  }
  const branchKey = createHash("sha256").update(`${launch.repositoryKey}\0${launch.branch}`).digest("hex")
  const slotPaths = Array.from({ length: cap }, (_, index) => join(directory, `${branchKey}-slot-${index + 1}.json`))
  for (let index = 0; index < slotPaths.length; index++) {
    const claim = claimLaunchFile(slotPaths[index], launch)
    if (claim.claimed) {
      return { allowed: true, earlierLaunches: readLaunchFiles(slotPaths.slice(0, index)), recorded: claim.recorded }
    }
    if (!claim.occupied) {
      return { allowed: true, earlierLaunches: readLaunchFiles(slotPaths.slice(0, index)), recorded: false }
    }
  }
  const earlierLaunches = readLaunchFiles(slotPaths)
  if (launch.relaunchReason === null) {
    if (Number.isInteger(launch.launcherPid)) clearWorkerLaunchReservation(launch.launcherPid, repoRoot)
    return { allowed: false, earlierLaunches, recorded: false }
  }
  const overridePath = join(directory, `${branchKey}-override-${randomUUID()}.json`)
  const override = claimLaunchFile(overridePath, launch)
  return { allowed: true, earlierLaunches, recorded: override.recorded }
}

export const recordReservedWorkerPid = (launcherPid, workerPid, repoRoot = REPO_ROOT) => {
  const path = occupiedWorktreePath(repoRoot)
  try {
    const reservation = JSON.parse(readFileSync(path, "utf8"))
    if (reservation.launcherPid !== launcherPid) return false
    const workerProcessStartIdentity = processStartIdentity(workerPid)
    if (workerProcessStartIdentity === null) return false
    writeAtomicFile(path, `${JSON.stringify({ ...reservation, workerPid, workerProcessStartIdentity })}\n`)
    return true
  } catch { return false }
}

export const clearWorkerLaunchReservation = (launcherPid, repoRoot = REPO_ROOT) => {
  const path = occupiedWorktreePath(repoRoot)
  try {
    const reservation = JSON.parse(readFileSync(path, "utf8"))
    if (reservation.launcherPid === launcherPid) rmSync(path)
  } catch { /* an unreadable reservation cannot be safely claimed */ }
}

/** The orchestrator's own run record, or null when no run has written one. */
export const readRunState = (repoRoot = REPO_ROOT) => {
  try {
    return JSON.parse(readFileSync(runStatePath(repoRoot), "utf8"))
  } catch {
    return null
  }
}

export const writeRunState = (state, repoRoot = REPO_ROOT) => {
  mkdirSync(gitDirectoryOf(repoRoot), { recursive: true })
  const previous = readRunState(repoRoot)
  const sameSession = typeof state?.sessionId === "string" && state.sessionId !== "" && previous?.sessionId === state.sessionId
  const identities = [
    ...(sameSession && Array.isArray(previous?.readinessLedger) ? previous.readinessLedger : []),
    ...(sameSession && Array.isArray(previous?.pullRequests) ? previous.pullRequests : []),
    ...(Array.isArray(state?.readinessLedger) ? state.readinessLedger : []),
    ...(Array.isArray(state?.pullRequests) ? state.pullRequests : []),
  ]
  /**
   * One row per repository and pull request, in the order each was FIRST seen, but carrying the
   * LATEST value of every field.
   *
   * First-seen-wins on the whole row was wrong. `identities` lists the previous ledger before the
   * current state, so a pull request registered before its blocker was discovered kept the old row,
   * and the blocker recorded by the later call was discarded. The run then believed nothing was
   * blocking it. Ordering still comes from the first sighting, because the ledger is append only
   * and a row must not move.
   */
  const rows = new Map()
  for (const entry of identities) {
    if (typeof entry?.repositoryKey !== "string" || !Number.isInteger(entry?.prNumber) || typeof entry?.receiptPath !== "string") continue
    const key = `${entry.repositoryKey}#${entry.prNumber}`
    const blocker = typeof entry.blocker === "string" && entry.blocker !== "" ? entry.blocker : null
    const merged = typeof entry.merged === "string" && MERGE_SHA.test(entry.merged) ? entry.merged : null
    const existing = rows.get(key)
    if (!existing) {
      rows.set(key, { repositoryKey: entry.repositoryKey, prNumber: entry.prNumber, receiptPath: entry.receiptPath, blocker, merged })
      continue
    }
    // A later sighting is the current one. It supersedes the receipt path, and it may add a blocker
    // the earlier sighting did not know about. It may also clear one that has since been resolved.
    existing.receiptPath = entry.receiptPath
    existing.blocker = blocker
    // `merged` is STICKY, which is the one place this row does not take the latest value. A blocker
    // can be resolved, so clearing it is a real transition; a merge cannot be undone, so a later
    // write that simply does not carry the sha is silence rather than a reversal. Letting silence
    // clear it would put a merged pull request back into the pending set at the next write.
    existing.merged = merged ?? existing.merged
  }
  /**
   * A ledger row whose receipt file does not exist is a promise nobody kept. Measured 2026-08-08:
   * four rows were accepted for receipts that were never written, and the Stop hook then read
   * them as unreadable rather than as absent, which is a different and much quieter failure.
   * The path is recorded either way, so the row is never silently dropped: `receiptWritten` says
   * which it is, and the hook can name it.
   *
   * `merged` is the third disposition, beside READY and BLOCKED. A pull request merged under the
   * step 9 exception can never reach a READY receipt, because the check it waits on will never
   * publish, so without this field the run that merged it met `block: true` at the next Stop and
   * had nothing left to launch. The merge sha is the fact that settles the row, and it is checkable
   * against GitHub in a way a self-asserted verdict is not.
   */
  const readinessLedger = [...rows.values()].map((row) => ({
    repositoryKey: row.repositoryKey,
    prNumber: row.prNumber,
    receiptPath: row.receiptPath,
    receiptWritten: existsSync(row.receiptPath),
    blocker: row.blocker,
    merged: row.merged,
  }))
  writeFileSync(runStatePath(repoRoot), `${JSON.stringify({ ...state, readinessLedger }, null, 2)}\n`)
}

/**
 * OS start identity, never the launcher's wall-clock timestamp. Windows emits UTC .NET ticks as a
 * decimal string; Linux combines /proc stat field 22 with boot_id so a reboot cannot repeat it.
 * Both sources were read for #437; macOS uses `darwinProcessStart`, whose BSD state Z is a zombie.
 * A failed probe supplies no identity evidence.
 */
export const processStartIdentity = (pid) => {
  try {
    if (process.platform === "win32") {
      const result = spawnSync("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-Command",
        `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks.ToString()`,
      ], { encoding: "utf8", windowsHide: true, timeout: 3000 })
      const ticks = result.stdout?.trim()
      return result.status === 0 && /^\d+$/.test(ticks) ? `win32:${ticks}` : null
    }
    if (process.platform === "linux") {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
      const fields = stat.slice(stat.lastIndexOf(") ") + 2).trim().split(/\s+/)
      const bootId = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()
      return !LINUX_DEAD_PROCESS_STATES.has(fields[0]) && /^\d+$/.test(fields[19]) && /^[0-9a-f-]{36}$/.test(bootId)
        ? `linux:${bootId}:${fields[19]}` : null
    }
    if (process.platform === "darwin") {
      const start = darwinProcessStart(pid)
      return start !== null && !start.state.startsWith("Z") ? `darwin:${start.startSeconds}` : null
    }
  } catch {
    /* unreadable process metadata cannot identify a wake source */
  }
  return null
}

export const processIsAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (error) { return error?.code === "EPERM" }
}

/** Recheck the recorded process at the decision point; pid ownership alone is not evidence. */
export const isWakeSourceAlive = (source) =>
  Number.isInteger(source?.pid) && source.pid > 0 &&
  typeof source.processStartIdentity === "string" &&
  source.processStartIdentity === processStartIdentity(source.pid)

const isPendingWakeSourceFresh = (source) => {
  if (source?.pending !== true) return true
  const pendingAt = Date.parse(source.pendingAt)
  const age = Date.now() - pendingAt
  return Number.isFinite(pendingAt) && age >= 0 && age <= PENDING_WAKE_SOURCE_MAX_AGE_MS
}

/** Only registrations that still identify their live process. Sweep only proven missing pids. */
export const readWakeSourceStates = (repoRoot = REPO_ROOT) => {
  const directory = wakeSourceDirectory(repoRoot)
  let names
  try {
    names = readdirSync(directory)
  } catch {
    return { live: [], orphaned: [] }
  }
  const live = []
  const orphaned = []
  for (const name of names) {
    if (!name.endsWith(".json")) continue
    try {
      const source = JSON.parse(readFileSync(join(directory, name), "utf8"))
      if (!Number.isInteger(source?.pid) || source.pid <= 0) continue
      const probe = (pid) => {
        if (!Number.isInteger(pid) || pid <= 0) return false
        try { process.kill(pid, 0); return true } catch (error) { return error?.code === "ESRCH" ? false : null }
      }
      const launcherExists = probe(source.pid)
      const workerExists = probe(source.workerPid)
      if (launcherExists === null || workerExists === null) continue
      const launcherAlive = launcherExists && isWakeSourceAlive(source)
      const workerAlive = workerExists && isWakeSourceAlive({ pid: source.workerPid, processStartIdentity: source.workerProcessStartIdentity })
      if (launcherAlive && isPendingWakeSourceFresh(source)) live.push(source)
      else if (!launcherAlive && workerAlive) orphaned.push(source)
      else if (launcherExists === false && workerExists === false) rmSync(join(directory, name), { force: true })
    } catch {
      /* an unreadable entry is not a live wake source, and must not mask the readable ones */
    }
  }
  return { live, orphaned }
}
export const readWakeSources = (repoRoot = REPO_ROOT) => readWakeSourceStates(repoRoot).live

export const registerWakeSource = (source, repoRoot = REPO_ROOT) => {
  try {
    if (!Number.isInteger(source?.pid) || source.pid <= 0) return false
    const identity = processStartIdentity(source.pid)
    mkdirSync(wakeSourceDirectory(repoRoot), { recursive: true })
    const workerProcessStartIdentity = Number.isInteger(source.workerPid) ? processStartIdentity(source.workerPid) : null
    if ((identity === null && !Number.isInteger(source.workerPid)) ||
        (Number.isInteger(source.workerPid) && workerProcessStartIdentity === null)) return false
    writeAtomicFile(join(wakeSourceDirectory(repoRoot), `${source.pid}.json`),
      `${JSON.stringify({ ...source, processStartIdentity: identity, workerProcessStartIdentity }, null, 2)}\n`)
    return true
  } catch {
    return false
  }
}

export const clearWakeSource = (pid, repoRoot = REPO_ROOT) => {
  try {
    rmSync(join(wakeSourceDirectory(repoRoot), `${pid}.json`), { force: true })
  } catch {
    /* same: the reader checks process identity and sweeps dead entries */
  }
}
