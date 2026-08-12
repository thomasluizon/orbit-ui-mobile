import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { processIsRunning, T, check, orcaEnv, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig, TOOLS_DIR } from "./_harness.mjs"

const TOOL = "launch-worker.mjs"

/**
 * Derived from the shipped .claude/orchestrator.json rather than hand-written, so a fixture cannot
 * agree with a guess about the schema while the real config carries something else. Only `command`
 * is swapped by default: the configured worker is `codex`, which is not installed in CI, and a
 * gate that needs a model CLI on PATH is not hermetic.
 */
const launchConfig = ({ engine = {}, timeouts = {}, caps = {} } = {}) => {
  const real = realOrchestratorConfig()
  return {
    ...real,
    workers: { ...real.workers, [real.worker]: { ...real.workers[real.worker], command: process.execPath, ...engine } },
    timeouts: { ...real.timeouts, ...timeouts },
    caps: { ...real.caps, ...caps },
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
/** Floods stdout the way ORB-201 did, which is how a 61.73 MB log happened. It never exits on its
 * own, so the only thing that can end it is the launcher noticing the flood. */
const FLOODER = stage("launch-worker/flooding-worker.js", "const line = 'x'.repeat(4096)\nsetInterval(() => { for (let i = 0; i < 64; i++) process.stdout.write(line + '\\n') }, 5)\n")

const launch = (label, config) => {
  const repo = stageRepo(`launch-worker-${label}`)
  if (!repo) return null
  repo.git(["remote", "set-url", "origin", `https://github.com/test-owner/${label}.git`])
  const staged = stageWithConfig(`launch-worker-${label}`, TOOL, config)
  return { ...staged, worktree: repo.path, prompt: stage(`launch-worker/${label}-prompt.md`, "the work order, verbatim\n") }
}

const githubAuthEnv = () => orcaEnv([{ match: "auth token --user test-owner", stdout: "test-github-token" }])

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

  /**
   * The no-progress clock samples HEAD and file mtimes, so a ticket whose work IS measurement looks
   * byte for byte like a hung worker. ORB-225 was killed mid-Lighthouse on 2026-08-08 with real
   * measurements in its log and zero commits, and only succeeded once they were recovered by hand.
   *
   * The cap is raised for those tickets; the SIGNAL is deliberately unchanged. Counting log growth
   * was the obvious alternative and it is the wrong one: ORB-201's log reached 61.73 MB in 37
   * minutes while delivering nothing, so a log-growth signal could not fire for the exact runaway
   * the clock exists to catch.
   */
  const measured = check(TOOL, "--measurement resolves the longer no-progress cap", [...argv, "--measurement", "--dry-run"], { status: 0 }, options)
  const measuredPlan = JSON.parse(measured.stdout)
  discardLog(measured.stdout)
  const ordinary = check(TOOL, "without --measurement the ordinary cap applies", [...argv, "--dry-run"], { status: 0 }, options)
  const ordinaryPlan = JSON.parse(ordinary.stdout)
  discardLog(ordinary.stdout)
  T(
    `${TOOL}: the measurement cap is longer than the ordinary one, and both are reported`,
    measuredPlan.measurement === true && ordinaryPlan.measurement === false && measuredPlan.noProgressMinutes > ordinaryPlan.noProgressMinutes,
    `measurement ${measuredPlan.noProgressMinutes}, ordinary ${ordinaryPlan.noProgressMinutes}`,
  )
  T(
    `${TOOL}: the HARD CEILING is unchanged by --measurement, so a hung measurement worker still dies`,
    realOrchestratorConfig().timeouts.hardCeilingMinutes > measuredPlan.noProgressMinutes,
    "a measurement cap at or above the hard ceiling would disable the no-progress clock entirely",
  )
  const noMeasurementCap = launch("no-measurement-cap", (() => {
    const config = launchConfig()
    delete config.timeouts.measurementNoProgressMinutes
    return config
  })())
  if (noMeasurementCap) {
    check(
      TOOL,
      "--measurement refuses when the config declares no measurement cap, rather than falling back",
      ["--issue", "ORB-201", "--worktree", noMeasurementCap.worktree, "--prompt", noMeasurementCap.prompt, "--measurement", "--dry-run"],
      { status: 2, stderr: /requires timeouts\.measurementNoProgressMinutes/ },
      { path: noMeasurementCap.path },
    )
  }

  check(TOOL, "refuses a malformed ticket reference", ["--issue", "ticket-201", "--worktree", fixture.worktree, "--prompt", fixture.prompt], { status: 2, stderr: /--issue must be ORB-N, #N, or N/ }, options)
  check(TOOL, "accepts a post-migration #N reference", ["--issue", "#9001", "--worktree", fixture.worktree, "--prompt", fixture.prompt, "--dry-run"], { status: 0, stdout: /"issue": "#9001"/ }, options)
  check(TOOL, "accepts a post-migration plain number and normalizes it", ["--issue", "9001", "--worktree", fixture.worktree, "--prompt", fixture.prompt, "--dry-run"], { status: 0, stdout: /"issue": "#9001"/ }, options)
  check(TOOL, "refuses a missing worktree flag", ["--issue", "ORB-201", "--prompt", fixture.prompt], { status: 2, stderr: /--worktree is required/ }, options)
  check(TOOL, "refuses a missing prompt flag", ["--issue", "ORB-201", "--worktree", fixture.worktree], { status: 2, stderr: /--prompt is required/ }, options)
  check(TOOL, "refuses a worktree that does not exist", ["--issue", "ORB-201", "--worktree", join(fixture.base, "absent"), "--prompt", fixture.prompt], { status: 2, stderr: /worktree not found/ }, options)
  check(TOOL, "refuses a prompt file that does not exist", ["--issue", "ORB-201", "--worktree", fixture.worktree, "--prompt", join(fixture.base, "absent.md")], { status: 2, stderr: /prompt file not found/ }, options)
  check(TOOL, "refuses an empty prompt file", ["--issue", "ORB-201", "--worktree", fixture.worktree, "--prompt", stage("launch-worker/empty-prompt.md", "")], { status: 2, stderr: /prompt file is empty/ }, options)

  /** A work order written into the tree becomes part of the worker's own diff, so the pull request
   * ships the prompt and Pullfrog reviews it as if it were product code. */
  const insidePrompt = join(fixture.worktree, "work-order.md")
  writeFileSync(insidePrompt, "the work order, verbatim\n")
  check(
    TOOL,
    "refuses a prompt file living inside the worktree it would be committed into",
    ["--issue", "ORB-201", "--worktree", fixture.worktree, "--prompt", insidePrompt],
    { status: 2, stderr: /prompt file lives inside[\s\S]*work order written into a repository gets committed[\s\S]*scratchpad/ },
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

  const dryRun = check(TOOL, "--dry-run resolves the plan and exits 0", [...argv, "--dry-run"], { status: 0, stdout: /"dryRun": true/ }, options)
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
    { path: noProgress.path, env: githubAuthEnv() },
  )
  discardLog(stalled.stdout)

  /**
   * A worker that floods its own log is a runaway, and it used to die unexplained. Measured on the
   * 2026-08-08 night: ORB-201 wrote 61.73 MB in 36.9 minutes, 28.6 KB/s, eight times the next
   * fastest writer, and its log is one enormous git diff (5,928 hunk headers, 41,215 deleted
   * lines). It is the only log in that batch carrying "code-mode host closed its stdout", and
   * ORB-162 died 3 seconds later mid-write with no error line at all.
   *
   * The proximate failure is the vendor's code-mode host, not this harness. What IS the harness's is
   * that nothing bounded the flood, so the outcome now names it with the byte count attached.
   */
  const flood = launch("log-runaway", launchConfig({ ...stubEngine(FLOODER), timeouts: { hardCeilingMinutes: 5, noProgressMinutes: 5, pollSeconds: 0.2 }, caps: { workerLogMegabytes: 1 } }))
  const flooded = check(
    TOOL,
    "a worker flooding its own log is killed and the outcome NAMES the runaway",
    ["--issue", "ORB-201", "--worktree", flood.worktree, "--prompt", flood.prompt],
    { status: 1, stdout: /"outcome": "KILLED_LOG_RUNAWAY"/, stderr: /MB of worker log, past the 1 MB cap/ },
    { path: flood.path, env: githubAuthEnv() },
  )
  discardLog(flooded.stdout)

  /** An ordinary worker must not trip the cap, or the bound is just a shorter ceiling. */
  const belowCap = launch("log-below-cap", launchConfig({ ...stubEngine(IMMEDIATE), caps: { workerLogMegabytes: 32 } }))
  const quiet = check(
    TOOL,
    "an ordinary worker well under the log cap exits normally",
    ["--issue", "ORB-201", "--worktree", belowCap.worktree, "--prompt", belowCap.prompt],
    { status: 0, stdout: /"outcome": "EXITED"/ },
    { path: belowCap.path, env: githubAuthEnv() },
  )
  discardLog(quiet.stdout)

  const ceiling = launch("ceiling", launchConfig({ ...stubEngine(SLEEPER), timeouts: { hardCeilingMinutes: 0.02, noProgressMinutes: 5, pollSeconds: 0.2 } }))
  const killed = check(
    TOOL,
    "a worker still running at the configured ceiling is killed with its process tree",
    ["--issue", "ORB-201", "--worktree", ceiling.worktree, "--prompt", ceiling.prompt],
    { status: 1, stdout: /"outcome": "KILLED_HARD_CEILING"/, stderr: /passed the 0\.02 minute ceiling; killing the worker process tree/ },
    { path: ceiling.path, env: githubAuthEnv() },
  )
  discardLog(killed.stdout)

  const descendantPidFile = stage("launch-worker/descendant.pid", "")
  const treeWorker = stage(
    "launch-worker/tree-worker.js",
    `const { spawn } = require("node:child_process")\nconst { writeFileSync } = require("node:fs")\nconst child = spawn(process.execPath, ["-e", "setInterval(() => {}, 60000)"], { stdio: "ignore" })\nwriteFileSync(${JSON.stringify(descendantPidFile)}, String(child.pid))\nsetInterval(() => {}, 60000)\n`,
  )
  const tree = launch("process-tree", launchConfig({ ...stubEngine(treeWorker), timeouts: { hardCeilingMinutes: 0.02, noProgressMinutes: 5, pollSeconds: 0.2 } }))
  const treeKilled = check(TOOL, "a hanging worker tree is timed out", ["--issue", "ORB-201", "--worktree", tree.worktree, "--prompt", tree.prompt], { status: 1, stdout: /KILLED_HARD_CEILING/ }, { path: tree.path, env: githubAuthEnv() })
  discardLog(treeKilled.stdout)
  const descendantPid = Number(readFileSync(descendantPidFile, "utf8"))
  const descendantAlive = processIsRunning(descendantPid)
  T(`${TOOL}: timeout removes the complete process tree, not only the parent`, Number.isInteger(descendantPid) && !descendantAlive, `descendant ${descendantPid} still alive`)

  const brokenClock = launch("broken-clock", launchConfig({ timeouts: { pollSeconds: 0 } }))
  const refused = run(TOOL, ["--issue", "ORB-201", "--worktree", brokenClock.worktree, "--prompt", brokenClock.prompt, "--dry-run"], { path: brokenClock.path })
  T(
    `${TOOL}: a config with a zero clock is refused before anything is launched`,
    refused.status === 2 && /timeouts\.pollSeconds must be a positive number/.test(refused.stderr),
    `exit ${refused.status}: ${refused.stderr || refused.stdout}`,
  )

}
