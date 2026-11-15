import { spawn } from "node:child_process"
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as wait } from "node:timers/promises"
import { T, realOrchestratorConfig, run, stageRepo, stageWithConfig, subagentTranscript } from "./_harness.mjs"
import { BACKGROUND_RUN_WAITER, isRelayWaiter, isWakeSourceAlive, processStartIdentity, readRunState, readWakeSourceStates, writeRunState } from "../lib/run-state.mjs"
import { checkSleepStop } from "../../.claude/hooks/_lib/rules-sleep.mjs"

const TOOL = "wait-background-runs.mjs"
const SESSION = "coordinator"

const start = (installation) => {
  const child = spawn(process.execPath, [installation.path, "--poll-seconds", "0.02"], { cwd: installation.base, env: { ...process.env, CLAUDE_CODE_SESSION_ID: SESSION } })
  const output = { stdout: "", stderr: "" }
  child.stdout.on("data", (chunk) => { output.stdout += chunk })
  child.stderr.on("data", (chunk) => { output.stderr += chunk })
  const closed = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve) })
  return { child, output, closed, watchdog: setTimeout(() => child.kill("SIGKILL"), 10000) }
}

const registered = async (installation, child) => {
  for (const deadline = Date.now() + 5000; Date.now() < deadline && child.exitCode === null; await wait(10)) {
    const source = readWakeSourceStates(installation.base).live.find((candidate) => candidate.pid === child.pid)
    if (source) return source
  }
  return null
}

export async function cases() {
  const installation = stageWithConfig("wait-background-runs", TOOL, realOrchestratorConfig())
  mkdirSync(join(installation.base, ".git"), { recursive: true })
  writeRunState({ sessionId: SESSION, sleep: true, remaining: [], relay: { pending: true } }, installation.base)
  const directory = join(installation.base, ".git", "orbit-background-runs", SESSION)
  const transcript = join(installation.base, ".git", "agent-held-task.jsonl")
  mkdirSync(directory, { recursive: true })
  // The agent works in its own checkout; every transcript entry carries the session directory as `cwd`.
  const agentCheckout = stageRepo("wait-background-runs-agent")
  const agentHead = agentCheckout.git(["rev-parse", "HEAD"]).stdout.trim()
  writeFileSync(transcript, subagentTranscript({ worktree: agentCheckout.path, sessionDirectory: installation.base, otherRepository: installation.base, scratchpad: join(installation.base, ".git") }))
  const record = (silentMinutes) => {
    const silentSince = new Date(Date.now() - silentMinutes * 60_000)
    utimesSync(transcript, silentSince, silentSince)
    writeFileSync(join(directory, "held-task.json"), JSON.stringify({ id: "held-task", type: "subagent", sessionId: SESSION, pid: process.pid,
      processStartIdentity: processStartIdentity(process.pid), observedAt: new Date(Date.now() - 120 * 60_000).toISOString(), transcript }))
  }
  const drainState = { sleep: true, sessionId: SESSION, remaining: [], relay: { pending: true } }
  const held = [{ id: "held-task", type: "subagent" }]
  const unwatched = checkSleepStop({ state: drainState, sessionId: SESSION, backgroundRuns: held, isWakeSourceAlive })
  T("background waiter: a relay drain that waits on a subagent with no waiter refuses the turn end", unwatched?.block === true && unwatched.message.includes("node tools/wait-background-runs.mjs") && unwatched.message.includes("subagent held-task"))
  T("background waiter: a relay drain with no background run still ends its turn", checkSleepStop({ state: drainState, sessionId: SESSION, isWakeSourceAlive })?.terminal === "RELAY_DRAIN")

  record(1)
  const waiting = start(installation)
  try {
    const source = await registered(installation, waiting.child)
    T("background waiter: registers a live wake source of its own kind", source?.kind === BACKGROUND_RUN_WAITER && source.sessionId === SESSION, waiting.output.stderr)
    T("background waiter: is a relay waiter, so it never holds the drain itself", source !== null && isRelayWaiter(source))
    T("background waiter: the relay drain may end its turn while the waiter lives", source !== null && checkSleepStop({
      state: drainState, sessionId: SESSION, backgroundRuns: held, wakeSources: [source], isWakeSourceAlive })?.terminal === "RELAY_DRAIN")
    await wait(100)
    T("background waiter: keeps waiting while the subagent makes progress", waiting.child.exitCode === null, waiting.output.stdout)
    rmSync(join(directory, "held-task.json"))
    const status = await waiting.closed
    const result = JSON.parse(waiting.output.stdout)
    T("background waiter: a finished run ends the wait with exit 0", status === 0 && result.reason === "FINISHED" && result.waiting.length === 0 && result.stuck.length === 0, waiting.output.stdout)
    T("background waiter: the registration is removed", readWakeSourceStates(installation.base).live.length === 0)
  } finally { waiting.child.kill("SIGKILL"); await waiting.closed; clearTimeout(waiting.watchdog) }

  record(31)
  const stuck = start(installation)
  try {
    const status = await stuck.closed
    const result = JSON.parse(stuck.output.stdout)
    T("background waiter: a subagent with no transcript progress for 30 minutes ends the wait", status === 0 && result.reason === "STUCK" && result.stuck.length === 1 &&
      result.stuck[0].id === "held-task" && result.stuck[0].worktree === agentCheckout.path && result.stuck[0].branch === "main" && result.stuck[0].lastCommit === agentHead, stuck.output.stdout + stuck.output.stderr)
    T("background waiter: one JSON result line", stuck.output.stdout.trim().split("\n").length === 1 && Number.isFinite(result.waitedSeconds))
    T("background waiter: the run state names the stuck run", readRunState(installation.base).stuckBackgroundRuns?.[0]?.id === "held-task")
  } finally { stuck.child.kill("SIGKILL"); await stuck.closed; clearTimeout(stuck.watchdog) }

  record(1)
  const interrupted = start(installation)
  try {
    await registered(installation, interrupted.child)
    interrupted.child.kill("SIGTERM")
    const status = await interrupted.closed
    T("background waiter: SIGTERM exits 143", status === 143 && JSON.parse(interrupted.output.stdout).reason === "SIGTERM", interrupted.output.stdout)
    T("background waiter: SIGTERM removes the registration", readWakeSourceStates(installation.base).live.length === 0)
  } finally { interrupted.child.kill("SIGKILL"); await interrupted.closed; clearTimeout(interrupted.watchdog) }

  const usage = run(TOOL, ["--poll-seconds", "0"], { path: installation.path })
  T("background waiter: a poll interval of zero is refused", usage.status === 2)
}
