import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { LaunchGateExpired, launchGateStampPath, passLaunchGate } from "../lib/launch-gate.mjs"
import { acquireRelayLock, processStartIdentity, RelayLockHeld } from "../lib/run-state.mjs"

import { T, root, same } from "./_harness.mjs"

const UNIT = "lib/launch-gate.mjs"

const checkout = (label) => {
  const directory = join(root, "launch-gate", label)
  mkdirSync(join(directory, ".git"), { recursive: true })
  return directory
}

/** A clock that only moves when the gate sleeps, and a load series read one value per check. */
const machine = (loads, start = 1_000_000) => {
  let clock = start
  const sleeps = []
  return { sleeps, now: () => clock, readLoad: () => loads.length > 1 ? loads.shift() : loads[0],
    sleep: async (milliseconds) => { sleeps.push(milliseconds); clock += milliseconds } }
}

export const cases = async () => {
  const idle = checkout("idle")
  const quiet = machine([3])
  const first = await passLaunchGate({ loadMax: 60, spacingSeconds: 45, repoRoot: idle, ...quiet })
  T(`${UNIT}: the first launch on a quiet machine passes at once`, first.waitedMs === 0 && quiet.sleeps.length === 0, JSON.stringify(first))
  same(`${UNIT}: a passed launch records its time`, JSON.parse(readFileSync(launchGateStampPath(idle), "utf8")).lastLaunchAt, 1_000_000)

  const spaced = machine([3], 1_000_000 + 10_000)
  const second = await passLaunchGate({ loadMax: 60, spacingSeconds: 45, repoRoot: idle, ...spaced, pollMs: 5000 })
  T(`${UNIT}: the next launch waits until the spacing since the previous launch has passed`, second.waitedMs === 35_000 && spaced.sleeps.length === 7, JSON.stringify({ second, sleeps: spaced.sleeps }))

  const busy = checkout("busy")
  const loaded = machine([75, 61, 60, 59.5])
  const underLoad = await passLaunchGate({ loadMax: 60, spacingSeconds: 45, repoRoot: busy, ...loaded, pollMs: 5000 })
  T(`${UNIT}: a launch waits until the one-minute load is under the ceiling`, underLoad.load === 59.5 && loaded.sleeps.length === 3, JSON.stringify({ underLoad, sleeps: loaded.sleeps }))

  const stuck = checkout("stuck")
  const never = machine([100])
  const clockSleep = never.sleep
  // Without a deadline the gate never ends, so a guard turns the endless wait into a failure.
  never.sleep = async (milliseconds) => {
    if (never.sleeps.length >= 20) throw new Error("the gate kept waiting past its deadline")
    await clockSleep(milliseconds)
  }
  let expired = null
  try { await passLaunchGate({ loadMax: 60, spacingSeconds: 0, repoRoot: stuck, ...never, pollMs: 5000, maxWaitMs: 12_000 }) } catch (error) { expired = error }
  T(`${UNIT}: a wait that reaches maxWaitMs throws LaunchGateExpired at the deadline, not a poll later, with the load it read`,
    expired instanceof LaunchGateExpired && expired.waitedMs === 12_000 && expired.load === 100 && never.sleeps.join() === "5000,5000,2000", JSON.stringify({ expired: expired?.message, sleeps: never.sleeps }))
  T(`${UNIT}: an expired wait records no launch`, (() => { try { readFileSync(launchGateStampPath(stuck)); return false } catch (error) { return error.code === "ENOENT" } })())
  const lastMoment = machine([100, 3])
  const atDeadline = await passLaunchGate({ loadMax: 60, spacingSeconds: 0, repoRoot: checkout("last-moment"), ...lastMoment, pollMs: 5000, maxWaitMs: 5000 })
  T(`${UNIT}: a launch that passes on the last check at the deadline is admitted`, atDeadline.load === 3 && atDeadline.waitedMs === 5000, JSON.stringify(atDeadline))

  const held = checkout("held")
  mkdirSync(join(held, ".git", "orbit-launch-gate-lock"), { recursive: true })
  // A live owner holds the lock: this test process itself, with its real start identity.
  const owner = join(held, ".git", "orbit-launch-gate-lock", "owner.json")
  writeFileSync(owner, JSON.stringify({ pid: process.pid, processStartIdentity: processStartIdentity(process.pid), claimId: "other launcher" }))
  let refused = null
  try { acquireRelayLock(held, "orbit-launch-gate-lock") } catch (error) { refused = error }
  T(`${UNIT}: a lock that a live owner holds throws RelayLockHeld, the class that every waiting caller tests`, refused instanceof RelayLockHeld, String(refused))
  const waiting = machine([3])
  let released = false
  const blocked = passLaunchGate({ loadMax: 60, spacingSeconds: 0, repoRoot: held, ...waiting,
    sleep: async (milliseconds) => { waiting.sleeps.push(milliseconds); if (!released) { released = true; rmSync(owner) } } })
  const afterLock = await blocked
  T(`${UNIT}: a launch waits while another launcher holds the gate lock`, waiting.sleeps.length === 1 && afterLock.load === 3, JSON.stringify({ afterLock, sleeps: waiting.sleeps }))

  const corrupt = checkout("corrupt")
  writeFileSync(launchGateStampPath(corrupt), "{")
  let refusal = null
  try { await passLaunchGate({ loadMax: 60, spacingSeconds: 45, repoRoot: corrupt, ...machine([3]) }) } catch (error) { refusal = error.message }
  T(`${UNIT}: an unreadable stamp stops the launch instead of skipping the spacing`, /cannot read the launch gate stamp/.test(refusal ?? ""), refusal)
}
