/** The workers that outlive their session: what the relay carries to a successor and how that successor waits for each. */

import { join } from "node:path"
import { isDetachedWorker, isWakeSourceAlive, readWakeSourceStates, wakeSourceDirectory } from "./run-state.mjs"

const shellQuote = (value) => /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`

/** The one command that starts the successor's wake source for a worker; it exits when the completion file appears. */
export const workerWaitCommand = ({ completionFile, startedAt, issue }) =>
  `node tools/wait-file.mjs --file ${shellQuote(completionFile)} --started-at ${startedAt} --what ${shellQuote(`worker ${issue}`)}`

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

/** Every detached worker whose supervisor still runs, including one inside its start window. */
export const liveDetachedWorkers = (repoRoot) => readWakeSourceStates(repoRoot).live
  .filter((source) => isDetachedWorker(source) && typeof source.completionFile === "string" && typeof source.issue === "string")
  .map((source) => carried(source, repoRoot))

/**
 * The detached workers that no file waiter watches and that need one for `sessionId`. A worker needs a waiter when
 * its entry process is gone, or when another session launched it: only that entry wakes the session that started it.
 */
export const workersWithoutWaiter = (repoRoot, sessionId) => {
  const waiters = readWakeSourceStates(repoRoot).live.filter((source) => source.kind === "file-waiter" && typeof source.file === "string")
  return liveDetachedWorkers(repoRoot).filter((worker) => {
    const entryAlive = Number.isInteger(worker.entryPid) && isWakeSourceAlive({ pid: worker.entryPid, processStartIdentity: worker.entryProcessStartIdentity })
    return (!entryAlive || worker.ownerSessionId !== sessionId) && !waiters.some((waiter) => waiter.file === worker.completionFile)
  })
}
