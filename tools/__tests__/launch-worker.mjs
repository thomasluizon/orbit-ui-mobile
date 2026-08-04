import { existsSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { T, check, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig } from "./_harness.mjs"

const TOOL = "launch-worker.mjs"

/**
 * Derived from the shipped .claude/orchestrator.json rather than hand-written, so a fixture cannot
 * agree with a guess about the schema while the real config carries something else. Only `command`
 * is swapped by default: the configured worker is `codex`, which is not installed in CI, and a
 * gate that needs a model CLI on PATH is not hermetic.
 */
const launchConfig = ({ engine = {}, timeouts = {} } = {}) => {
  const real = realOrchestratorConfig()
  return {
    ...real,
    workers: { ...real.workers, [real.worker]: { ...real.workers[real.worker], command: process.execPath, ...engine } },
    timeouts: { ...real.timeouts, ...timeouts },
  }
}

/**
 * A worker the gate can spawn for real without spawning a model session: node running a script
 * that only sleeps. `args` is the script PATH and not `-e`, because node refuses the `--model`
 * the launcher appends after an `--eval` script ("bad option: --model"), measured.
 */
const stubEngine = (script) => ({ engine: { args: [script], models: { default: { model: "gate-stub", args: [] } } } })

const SLEEPER = stage("launch-worker/sleeping-worker.js", "setTimeout(() => {}, 60000)\n")
const IMMEDIATE = stage("launch-worker/immediate-worker.js", "process.exit(0)\n")

const launch = (label, config) => {
  const repo = stageRepo(`launch-worker-${label}`)
  if (!repo) return null
  const staged = stageWithConfig(`launch-worker-${label}`, TOOL, config)
  return { ...staged, worktree: repo.path, prompt: stage(`launch-worker/${label}-prompt.md`, "the work order, verbatim\n") }
}

/** The launcher writes its worker log outside every repository, so the fixture root cannot hold it. */
const discardLog = (stdout) => {
  try {
    const { logFile } = JSON.parse(stdout)
    if (logFile) rmSync(logFile, { force: true })
    return logFile
  } catch {
    return null
  }
}

export const cases = () => {
  const fixture = launch("dry-run", launchConfig())
  if (!fixture) {
    T(`${TOOL}: a real git worktree fixture is available`, false, "could not stage a git repository")
    return
  }
  const argv = ["--issue", "ORB-201", "--worktree", fixture.worktree, "--prompt", fixture.prompt]
  const options = { path: fixture.path }

  check(TOOL, "refuses a malformed issue", ["--issue", "orb-201", "--worktree", fixture.worktree, "--prompt", fixture.prompt], { status: 2, stderr: /--issue must be a Linear identifier/ }, options)
  check(TOOL, "refuses a missing worktree flag", ["--issue", "ORB-201", "--prompt", fixture.prompt], { status: 2, stderr: /--worktree is required/ }, options)
  check(TOOL, "refuses a missing prompt flag", ["--issue", "ORB-201", "--worktree", fixture.worktree], { status: 2, stderr: /--prompt is required/ }, options)
  check(TOOL, "refuses a worktree that does not exist", ["--issue", "ORB-201", "--worktree", join(fixture.base, "absent"), "--prompt", fixture.prompt], { status: 2, stderr: /worktree not found/ }, options)
  check(TOOL, "refuses a prompt file that does not exist", ["--issue", "ORB-201", "--worktree", fixture.worktree, "--prompt", join(fixture.base, "absent.md")], { status: 2, stderr: /prompt file not found/ }, options)
  check(TOOL, "refuses an empty prompt file", ["--issue", "ORB-201", "--worktree", fixture.worktree, "--prompt", stage("launch-worker/empty-prompt.md", "")], { status: 2, stderr: /prompt file is empty/ }, options)

  /** A work order written into the tree becomes part of the worker's own diff, and then the
   * reviewer reads instructions authored by the change under review. */
  const insidePrompt = join(fixture.worktree, "work-order.md")
  writeFileSync(insidePrompt, "the work order, verbatim\n")
  check(
    TOOL,
    "refuses a prompt file living inside the worktree it would be committed into",
    ["--issue", "ORB-201", "--worktree", fixture.worktree, "--prompt", insidePrompt],
    { status: 2, stderr: /prompt file lives inside the worktree[\s\S]*scratchpad/ },
    options,
  )
  rmSync(insidePrompt, { force: true })

  const plain = dirname(stage("launch-worker/not-a-worktree/marker.txt", "no git here\n"))
  check(TOOL, "refuses a directory that is not a git worktree", ["--issue", "ORB-201", "--worktree", plain, "--prompt", fixture.prompt], { status: 2, stderr: /is not a git worktree/ }, options)

  const unresolvable = launch("unresolvable", launchConfig({ engine: { command: "orbit-not-a-real-worker-binary" } }))
  check(
    TOOL,
    "an unresolvable worker executable fails closed with exit 3 rather than at spawn time",
    ["--issue", "ORB-201", "--worktree", unresolvable.worktree, "--prompt", unresolvable.prompt],
    { status: 3, stderr: /could not resolve the .* worker executable "orbit-not-a-real-worker-binary" on PATH/ },
    { path: unresolvable.path },
  )

  const dryRun = check(TOOL, "--dry-run resolves the plan and exits 0", [...argv, "--dry-run", "--codex-only"], { status: 0, stdout: /"dryRun": true/ }, options)
  const real = realOrchestratorConfig()
  const engine = real.workers[real.worker]
  let plan = null
  try {
    plan = JSON.parse(dryRun.stdout)
  } catch {
    plan = null
  }
  T(
    `${TOOL}: --dry-run spawns nothing, so the log file it names was never opened`,
    plan !== null && typeof plan.logFile === "string" && !existsSync(plan.logFile),
    plan === null ? dryRun.stdout || dryRun.stderr : `${plan.logFile} exists, so the worker was started`,
  )
  T(
    `${TOOL}: the engine, tier, and model come from .claude/orchestrator.json`,
    plan !== null && plan.engine === real.worker && plan.tier === "default" && plan.model === engine.models.default.model,
    JSON.stringify(plan),
  )
  T(
    `${TOOL}: the resolved implementer is gpt-5.6-sol at high reasoning effort (D21)`,
    plan !== null && plan.model === "gpt-5.6-sol" && plan.args.includes('model_reasoning_effort="high"'),
    JSON.stringify(plan?.args),
  )
  T(
    `${TOOL}: the worker is handed the prompt PATH and the branch, never the prompt text`,
    plan !== null && plan.branch === "main" && plan.args.at(-1).includes(fixture.prompt) && !plan.args.at(-1).includes("the work order, verbatim"),
    JSON.stringify(plan?.args?.at(-1)),
  )
  T(`${TOOL}: --codex-only is recorded and changes no model`, plan !== null && plan.codexOnly === true && plan.model === engine.models.default.model, JSON.stringify(plan))

  const exits = launch("exits", launchConfig(stubEngine(IMMEDIATE)))
  const exited = check(
    TOOL,
    "a worker that exits on its own is reported EXITED with its code",
    ["--issue", "ORB-201", "--worktree", exits.worktree, "--prompt", exits.prompt],
    { status: 0, stdout: /"exitCode": 0,\s*"outcome": "EXITED"/ },
    { path: exits.path },
  )
  const exitedLog = discardLog(exited.stdout)
  T(
    `${TOOL}: a real launch writes its log outside the worktree it is about to hand back`,
    typeof exitedLog === "string" && exitedLog.includes("orbit-workers") && !exitedLog.startsWith(exits.worktree),
    exited.stdout || exited.stderr,
  )

  /**
   * Both clocks are read from config.timeouts, and the only way to prove that is to move them:
   * a hardcoded 45 and 10 minutes would leave a sleeping worker running until the suite's own
   * timeout, and would print those numbers rather than the configured ones.
   */
  const noProgress = launch("no-progress", launchConfig({ ...stubEngine(SLEEPER), timeouts: { hardCeilingMinutes: 5, noProgressMinutes: 0.02, pollSeconds: 0.2 } }))
  const stalled = check(
    TOOL,
    "a worker that writes nothing is killed on the configured no-progress clock",
    ["--issue", "ORB-201", "--worktree", noProgress.worktree, "--prompt", noProgress.prompt],
    { status: 1, stdout: /"outcome": "KILLED_NO_PROGRESS"/, stderr: /has not moved HEAD or written a file for 0\.02 minutes/ },
    { path: noProgress.path },
  )
  discardLog(stalled.stdout)

  const ceiling = launch("ceiling", launchConfig({ ...stubEngine(SLEEPER), timeouts: { hardCeilingMinutes: 0.02, noProgressMinutes: 5, pollSeconds: 0.2 } }))
  const killed = check(
    TOOL,
    "a worker still running at the configured ceiling is killed with its process tree",
    ["--issue", "ORB-201", "--worktree", ceiling.worktree, "--prompt", ceiling.prompt],
    { status: 1, stdout: /"outcome": "KILLED_HARD_CEILING"/, stderr: /passed the 0\.02 minute ceiling; killing the worker process tree/ },
    { path: ceiling.path },
  )
  discardLog(killed.stdout)

  const brokenClock = launch("broken-clock", launchConfig({ timeouts: { pollSeconds: 0 } }))
  const refused = run(TOOL, ["--issue", "ORB-201", "--worktree", brokenClock.worktree, "--prompt", brokenClock.prompt, "--dry-run"], { path: brokenClock.path })
  T(
    `${TOOL}: a config with a zero clock is refused before anything is launched`,
    refused.status === 2 && /timeouts\.pollSeconds must be a positive number/.test(refused.stderr),
    `exit ${refused.status}: ${refused.stderr || refused.stdout}`,
  )
}
