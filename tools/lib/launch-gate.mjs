/** The machine load and launch spacing gate that every worker and research launch passes before it starts. */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { loadavg } from "node:os"
import { join } from "node:path"

import { acquireRelayLock, gitDirectoryOf, RelayLockHeld, REPO_ROOT } from "./run-state.mjs"

const LOCK_NAME = "orbit-launch-gate-lock"
/** The exit code of a launcher whose wait at the gate outlasted its allowance. */
export const LAUNCH_GATE_EXPIRED_EXIT = 10
const LAUNCH_GATE_POLL_MS = 5000

export const launchGateStampPath = (repoRoot = REPO_ROOT) => join(gitDirectoryOf(repoRoot), "orbit-launch-gate.json")

const readLastLaunch = (repoRoot) => {
  try {
    const stamp = JSON.parse(readFileSync(launchGateStampPath(repoRoot), "utf8"))
    return Number.isFinite(stamp?.lastLaunchAt) ? stamp.lastLaunchAt : 0
  } catch (error) {
    if (error.code === "ENOENT") return 0
    throw new Error(`cannot read the launch gate stamp ${launchGateStampPath(repoRoot)}: ${error.message}`, { cause: error })
  }
}

const writeLastLaunch = (repoRoot, lastLaunchAt) => {
  const path = launchGateStampPath(repoRoot)
  mkdirSync(gitDirectoryOf(repoRoot), { recursive: true })
  writeFileSync(`${path}.${process.pid}.unpublished`, `${JSON.stringify({ lastLaunchAt, pid: process.pid })}\n`)
  renameSync(`${path}.${process.pid}.unpublished`, path)
}

const claimLock = (repoRoot) => {
  try {
    return acquireRelayLock(repoRoot, LOCK_NAME)
  } catch (error) {
    if (error instanceof RelayLockHeld) return null
    throw error
  }
}

/** The wait at the gate passed `maxWaitMs` without a pass. Nothing was recorded. */
export class LaunchGateExpired extends Error {
  constructor(waitedMs, load) {
    super(`the launch gate did not pass within ${Math.round(waitedMs / 1000)} s (one-minute load ${load === null ? "unread" : load.toFixed(2)})`)
    this.name = "LaunchGateExpired"
    this.waitedMs = waitedMs
    this.load = load
  }
}

/**
 * Waits until the one-minute load is under `loadMax` and `spacingSeconds` have passed since the last launch of this checkout,
 * then records this launch. The check and the record happen under one lock, so two launchers never pass on the same slot.
 * A wait that reaches `maxWaitMs` throws `LaunchGateExpired` and records nothing, so a caller with a time limit never waits past it.
 */
export const passLaunchGate = async ({ loadMax, spacingSeconds, repoRoot = REPO_ROOT, readLoad = () => loadavg()[0], now = Date.now,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)), pollMs = LAUNCH_GATE_POLL_MS, maxWaitMs = Infinity }) => {
  const startedAt = now()
  let lastLoad = null
  for (;;) {
    const release = claimLock(repoRoot)
    if (release) {
      try {
        const load = readLoad()
        lastLoad = load
        const spacedAt = readLastLaunch(repoRoot) + spacingSeconds * 1000
        const at = now()
        if (load < loadMax && at >= spacedAt) {
          writeLastLaunch(repoRoot, at)
          return { load, waitedMs: at - startedAt }
        }
      } finally {
        release()
      }
    }
    const waitedMs = now() - startedAt
    if (waitedMs >= maxWaitMs) throw new LaunchGateExpired(waitedMs, lastLoad)
    await sleep(Math.min(pollMs, maxWaitMs - waitedMs))
  }
}
