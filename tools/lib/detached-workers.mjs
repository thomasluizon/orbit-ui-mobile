/** The workers that outlive their session: what the relay carries to a successor and how that successor waits for each. */

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { isDetachedWorker, isWakeSourceAlive, readWakeSourceStates, wakeSourceDirectory, workerCompletionFile, workerLaunchDirectory } from "./run-state.mjs"

const shellQuote = (value) => /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`

/**
 * The one command that starts the successor's wake source for a worker. It exits when the completion file appears,
 * and when the supervisor (`pid` and `processStartIdentity`) is gone without it: a killed supervisor writes nothing.
 */
export const workerWaitCommand = ({ completionFile, startedAt, issue, pid, processStartIdentity }) =>
  `node tools/wait-file.mjs --file ${shellQuote(completionFile)} --started-at ${startedAt} --what ${shellQuote(`worker ${issue}`)}` +
  (Number.isInteger(pid) && typeof processStartIdentity === "string" ? ` --producer-pid ${pid} --producer-start-identity ${shellQuote(processStartIdentity)}` : "")

const carried = (source, repoRoot) => ({
  issue: source.issue,
  launcherPid: source.pid,
  workerPid: source.workerPid ?? null,
  worktree: source.runDirectory,
  branch: source.branch,
  logFile: source.logFile,
  startedAt: source.startedAt,
  entryPid: source.entryPid ?? null,
  entryProcessStartIdentity: source.entryProcessStartIdentity ?? null,
  ownerSessionId: source.ownerSessionId ?? null,
  launchRecord: join(wakeSourceDirectory(repoRoot), `${source.pid}.json`),
  completionFile: source.completionFile,
  waitCommand: workerWaitCommand(source),
})

/** The launch results of the worker supervisors, oldest first. A file that does not hold a whole result reads as corrupt. */
export const readLaunchResults = (repoRoot) => {
  const directory = join(workerLaunchDirectory(repoRoot), "results")
  let names
  try { names = readdirSync(directory).filter((name) => /^\d+\.json$/.test(name)) } catch { return [] }
  return names.map((name) => {
    let result = null
    try { result = JSON.parse(readFileSync(join(directory, name), "utf8")) } catch { /* a missing or partial file reads as corrupt below */ }
    return { name, result, modified: statSync(join(directory, name)).mtimeMs }
  }).sort((left, right) => left.modified - right.modified).map(({ name, result }) =>
    result && result.launcherPid === Number(name.slice(0, -5)) && Number.isInteger(result.exitCode) &&
    ["repositoryKey", "issue", "runDirectory", "branch", "outcome"].every((key) => typeof result[key] === "string")
      ? result : { launcherPid: Number(name.slice(0, -5)), corrupt: true })
}

/**
 * The workers that ended and whose result `sessionId` or an earlier relay still owes to the next session. The supervisor
 * clears its wake source before it writes the result, so a worker that ends while the relay runs is in neither list otherwise.
 * `previous` is the `carriedWorkers` of the run record that this session adopted.
 */
export const endedWorkersOwed = (repoRoot, sessionId, previous = []) => {
  const earlier = new Set(previous.map((worker) => worker?.launcherPid).filter(Number.isInteger))
  return readLaunchResults(repoRoot)
    .filter((result) => !result.corrupt && (result.sessionId === sessionId || earlier.has(result.launcherPid)))
    .map((result) => ({ issue: result.issue, launcherPid: result.launcherPid, branch: result.branch, worktree: result.runDirectory, completionFile: workerCompletionFile(result.launcherPid, repoRoot), ended: true }))
}

/** Every detached worker whose supervisor still runs, including one inside its start window. `live` is a read the caller already made. */
export const liveDetachedWorkers = (repoRoot, live = readWakeSourceStates(repoRoot).live) => live
  .filter((source) => isDetachedWorker(source) && typeof source.completionFile === "string" && typeof source.issue === "string")
  .map((source) => carried(source, repoRoot))

/**
 * The detached workers that no file waiter watches and that need one for `sessionId`. A worker needs a waiter when
 * its entry process is gone, or when another session launched it: only that entry wakes the session that started it.
 * `live` is a read the caller already made, so a caller that probes every source once does not probe each again.
 */
export const workersWithoutWaiter = (repoRoot, sessionId, live = readWakeSourceStates(repoRoot).live) => {
  const waiters = live.filter((source) => source.kind === "file-waiter" && typeof source.file === "string")
  return liveDetachedWorkers(repoRoot, live).filter((worker) => {
    const entryAlive = Number.isInteger(worker.entryPid) && isWakeSourceAlive({ pid: worker.entryPid, processStartIdentity: worker.entryProcessStartIdentity })
    return (!entryAlive || worker.ownerSessionId !== sessionId) && !waiters.some((waiter) => waiter.file === worker.completionFile)
  })
}
