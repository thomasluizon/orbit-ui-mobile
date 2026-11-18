import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { launchGateStampPath, passLaunchGate } from "../lib/launch-gate.mjs"
import { processStartIdentity } from "../lib/run-state.mjs"

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

  const held = checkout("held")
  mkdirSync(join(held, ".git", "orbit-launch-gate-lock"), { recursive: true })
  // A live owner holds the lock: this test process itself, with its real start identity.
  const owner = join(held, ".git", "orbit-launch-gate-lock", "owner.json")
  writeFileSync(owner, JSON.stringify({ pid: process.pid, processStartIdentity: processStartIdentity(process.pid), claimId: "other launcher" }))
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
