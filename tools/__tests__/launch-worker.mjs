import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

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
      { status: 2, stderr: /requires timeouts.measurementNoProgressMinutes/ },
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

  /** A work order written into the tree becomes part of the worker's own diff, and then the
   * reviewer reads instructions authored by the change under review. */
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
    { path: exits.path, env: githubAuthEnv() },
  )
  const exitedLog = discardLog(exited.stdout)
  T(
    `${TOOL}: a real launch writes its log outside the worktree it is about to hand back`,
    typeof exitedLog === "string" && exitedLog.includes("orbit-workers") && !exitedLog.startsWith(exits.worktree),
    exited.stdout || exited.stderr,
  )

  const githubTimeout = launch("github-timeout", launchConfig(stubEngine(IMMEDIATE)))
  const githubDescendantPidFile = stage("launch-worker/github-descendant.pid", "")
  const githubTimedOut = check(
    TOOL,
    "a hanging post-worker GitHub call is bounded",
    ["--issue", "ORB-201", "--worktree", githubTimeout.worktree, "--prompt", githubTimeout.prompt, "--codex-only", "--command-timeout-seconds", "1"],
    { status: 1, stdout: /"outcome": "PR_BODY_ENFORCEMENT_FAILED"/, stderr: /GitHub command timed out after 1s/ },
    { path: githubTimeout.path, env: orcaEnv([
      { match: "auth token --user test-owner", stdout: "test-github-token" },
      { match: "pr list --head main --json number,body,baseRefOid,headRefOid,statusCheckRollup", stdout: "", hangTreePidFile: githubDescendantPidFile },
    ]) },
  )
  discardLog(githubTimedOut.stdout)
  const githubDescendantPid = Number(readFileSync(githubDescendantPidFile, "utf8"))
  T(`${TOOL}: post-worker GitHub timeout removes the complete child process tree`, Number.isInteger(githubDescendantPid) && !processIsRunning(githubDescendantPid), `descendant ${githubDescendantPid} still alive`)

  const bodyEdit = launch("body-edit-invalidation", launchConfig(stubEngine(IMMEDIATE)))
  const bodyEditHead = bodyEdit.worktree && spawnSync("git", ["-C", bodyEdit.worktree, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).stdout.trim()
  const bodyEdited = check(
    TOOL,
    "a codex-only launcher persists the old Guards baseline before editing the PR body",
    ["--issue", "ORB-201", "--worktree", bodyEdit.worktree, "--prompt", bodyEdit.prompt, "--codex-only"],
    { status: 0, stdout: /"outcome": "EXITED"/ },
    { path: bodyEdit.path, env: orcaEnv([
      { match: "auth token --user test-owner", stdout: "test-github-token" },
      { match: "pr list --head main --json number,body,baseRefOid,headRefOid,statusCheckRollup", stdout: JSON.stringify([{
        number: 200,
        body: "Implements ORB-201.",
        baseRefOid: "base-sha",
        headRefOid: bodyEditHead,
        statusCheckRollup: [{ workflowName: "Guards", name: "Harness tools", startedAt: "2026-08-07T10:00:00Z" }],
      }]) },
      { match: `run list --workflow guards.yml --commit ${bodyEditHead}`, stdout: JSON.stringify([{ databaseId: 10, createdAt: "2026-08-07T09:00:00Z", headSha: bodyEditHead, status: "completed", conclusion: "success" }]) },
      { match: "pr edit 200 --body-file -", stdout: "" },
    ]) },
  )
  discardLog(bodyEdited.stdout)
  const bodyEditGitPath = spawnSync("git", ["-C", bodyEdit.worktree, "rev-parse", "--git-common-dir"], { encoding: "utf8", windowsHide: true }).stdout.trim()
  const bodyEditReceiptPath = resolve(bodyEdit.worktree, bodyEditGitPath, "orbit-body-edit-invalidations", "200.json")
  let bodyEditReceipt = null
  try {
    bodyEditReceipt = JSON.parse(readFileSync(bodyEditReceiptPath, "utf8"))
  } catch {
    bodyEditReceipt = null
  }
  T(
    `${TOOL}: launcher body edit receipt is pinned to the exact head/base and pre-edit Guards run`,
    bodyEditReceipt?.headSha === bodyEditHead && bodyEditReceipt?.baseSha === "base-sha" && bodyEditReceipt?.guardsRuns?.[0]?.name === "Harness tools" && bodyEditReceipt?.preEditWorkflowRuns?.[0]?.databaseId === 10,
    JSON.stringify(bodyEditReceipt),
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

  reviewCases()
}

/**
 * The reviewer half of the launcher. It exists because /orchestrate step 8 demands a session that
 * did not write the code, launched from the MAIN CHECKOUT, and the guardrail hook refuses a raw
 * `claude` from an orchestrating session: the launcher's marker is the only exemption a
 * main-checkout reviewer can claim.
 */
const reviewConfig = () => {
  const real = realOrchestratorConfig()
  const stub = (engineName, reviewModel) => ({
    ...real.workers[engineName],
    command: process.execPath,
    args: [IMMEDIATE],
    models: { ...real.workers[engineName].models, review: { model: reviewModel, args: [] } },
  })
  return {
    ...real,
    workers: {
      ...real.workers,
      [real.reviewer]: stub(real.reviewer, "gate-stub-reviewer"),
      // Stubbed too, because --codex-only moves the reviewer onto the WORKER engine, and a gate
      // that needs the real codex CLI on PATH is not hermetic.
      [real.worker]: stub(real.worker, "gate-stub-fallback-reviewer"),
    },
  }
}

/**
 * A reviewer runs in the checkout the tool itself sits in, so the staged base has to BE a git
 * repository. Staging it as one is what proves the launcher resolves the main checkout from its own
 * location rather than from a flag a caller could point anywhere.
 */
const stageReviewFixture = (label) => {
  const staged = stageWithConfig(label, TOOL, reviewConfig())
  for (const args of [["init", "-q", "--initial-branch=main"], ["config", "user.email", "gate@orbit.test"], ["config", "user.name", "Orbit Gate"], ["commit", "-q", "--allow-empty", "-m", "base"]]) {
    if (spawnSync("git", ["-C", staged.base, ...args], { encoding: "utf8" }).status !== 0) return null
  }
  const apiPath = join(dirname(staged.base), `${label}-api-primary`)
  mkdirSync(apiPath, { recursive: true })
  for (const args of [["init", "-q", "--initial-branch=main"], ["config", "user.email", "gate@orbit.test"], ["config", "user.name", "Orbit Gate"], ["commit", "-q", "--allow-empty", "-m", "base"]]) {
    if (spawnSync("git", ["-C", apiPath, ...args], { encoding: "utf8" }).status !== 0) return null
  }
  /**
   * The contract must be COMMITTED in both fixtures, because the gate compares committed blobs
   * rather than working-tree bytes. A fixture that only copied the files on disk would leave both
   * blobs unreadable, and the gate would then be exercised only through its missing-contract arm.
   */
  const sourceRoot = join(TOOLS_DIR, "..")
  for (const repoPath of [staged.base, apiPath]) {
    const destination = join(repoPath, ".claude", "skills", "pr-review")
    mkdirSync(destination, { recursive: true })
    cpSync(join(sourceRoot, ".claude", "skills", "pr-review", "SKILL.md"), join(destination, "SKILL.md"))
    cpSync(join(sourceRoot, ".claude", "skills", "pr-review", "rubric.md"), join(destination, "rubric.md"))
    for (const args of [
      ["add", "--", ".claude/skills/pr-review/SKILL.md", ".claude/skills/pr-review/rubric.md"],
      ["commit", "-q", "-m", "pr-review contract"],
    ]) {
      if (spawnSync("git", ["-C", repoPath, ...args], { encoding: "utf8" }).status !== 0) return null
    }
  }
  const config = reviewConfig()
  config.repos = { ...config.repos, ui: staged.base, api: apiPath }
  writeFileSync(staged.configPath, `${JSON.stringify(config, null, 2)}\n`)
  return { ...staged, apiPath }
}

const reviewCases = () => {
  const staged = stageReviewFixture("launch-worker-review")
  if (!staged) {
    T(`${TOOL}: a git-backed main-checkout fixture is available`, false, "could not stage a git repository")
    return
  }
  const prompt = stage("launch-worker/review-order.md", "the review order, verbatim\n")
  const options = { path: staged.path }

  check(TOOL, "--review refuses a missing repository", ["--issue", "ORB-201", "--review", "--prompt", prompt, "--dry-run"], { status: 2, stderr: /--review requires --repo/ }, options)
  check(TOOL, "--review refuses an unknown repository", ["--issue", "ORB-201", "--review", "--repo", "ghost", "--prompt", prompt, "--dry-run"], { status: 2, stderr: /--repo must name a configured repository/ }, options)

  check(
    TOOL,
    "--review refuses --worktree, so a reviewer cannot read the PR's own AGENTS.md",
    ["--issue", "ORB-201", "--review", "--repo", "ui", "--worktree", staged.base, "--prompt", prompt],
    { status: 2, stderr: /--review refuses --worktree/ },
    options,
  )

  check(
    TOOL,
    "--review needs no --worktree",
    ["--issue", "ORB-201", "--review", "--repo", "ui", "--prompt", prompt, "--dry-run"],
    { status: 0, stdout: /"review": true/ },
    options,
  )

  const plan = check(
    TOOL,
    "--review resolves the reviewer engine and the review model tier",
    ["--issue", "ORB-201", "--review", "--repo", "ui", "--prompt", prompt, "--dry-run"],
    { status: 0, stdout: /"tier": "review"/ },
    options,
  )
  const resolved = JSON.parse(plan.stdout)
  const real = realOrchestratorConfig()
  T(
    `${TOOL}: --review runs the reviewer engine, not the implementer's`,
    resolved.engine === real.reviewer && resolved.engine !== real.worker,
    `engine ${resolved.engine}, reviewer ${real.reviewer}, worker ${real.worker}`,
  )
  T(
    `${TOOL}: --review runs in the main checkout the tool sits in`,
    resolved.runDirectory === staged.base,
    `runDirectory ${resolved.runDirectory}, expected ${staged.base}`,
  )
  T(
    `${TOOL}: --review hands the reviewer the review tier's model`,
    resolved.model === "gate-stub-reviewer",
    `model ${resolved.model}`,
  )
  T(
    `${TOOL}: the review pointer tells the reviewer not to fix what it finds`,
    resolved.args.at(-1).includes("you do not fix what you find"),
    resolved.args.at(-1),
  )

  check(
    TOOL,
    "--review refuses a review order written inside the main checkout",
    ["--issue", "ORB-201", "--review", "--repo", "ui", "--prompt", stage(`staged/launch-worker-review/review-order.md`, "committed by accident\n"), "--dry-run"],
    { status: 2, stderr: /review order written into a repository gets committed/ },
    options,
  )

  /**
   * The fallback reviewer. --codex-only means the Claude quota is exhausted, so resolving the
   * configured reviewer there would launch the one engine that is known to be unavailable, and the
   * only path meant to survive a quota outage would be the only path that cannot run.
   */
  const fallback = check(
    TOOL,
    "--review with --codex-only reviews on the worker engine, never the unavailable Claude reviewer",
    ["--issue", "ORB-201", "--review", "--repo", "ui", "--codex-only", "--prompt", prompt, "--dry-run"],
    { status: 0, stdout: /"tier": "review"/ },
    options,
  )
  const degraded = JSON.parse(fallback.stdout)
  T(
    `${TOOL}: --review --codex-only resolves the worker engine, not the reviewer engine`,
    degraded.engine === real.worker && degraded.engine !== real.reviewer,
    `engine ${degraded.engine}, worker ${real.worker}, reviewer ${real.reviewer}`,
  )
  T(
    `${TOOL}: --review --codex-only still resolves the review tier, not the implementer's`,
    degraded.tier === "review" && degraded.model === "gate-stub-fallback-reviewer",
    `tier ${degraded.tier}, model ${degraded.model}`,
  )
  T(
    `${TOOL}: --review --codex-only still runs in the main checkout`,
    degraded.runDirectory === staged.base,
    `runDirectory ${degraded.runDirectory}`,
  )

  const api = check(TOOL, "--review --repo api runs from the API primary main checkout", ["--issue", "ORB-201", "--review", "--repo", "api", "--prompt", prompt, "--dry-run"], { status: 0, stdout: /"repositoryKey": "api"/ }, options)
  T(`${TOOL}: API review cwd is the configured API primary checkout`, JSON.parse(api.stdout).runDirectory === staged.apiPath, api.stdout)

  /**
   * THE 2026-08-08 regression, and the reason this gate reads git rather than the disk. Both repos
   * set core.autocrlf=true, orbit-ui-mobile pinned `.claude/skills/**\/*.md text eol=lf` and
   * orbit-api did not, so the SAME committed blob materialized LF in one checkout and CRLF in the
   * other: +230 bytes on SKILL.md, +289 on rubric.md. `git status` was clean in both. The old
   * working-tree sha256 refused every ui and api review and stood 76 tickets down over nothing.
   *
   * Rewriting the API working tree with CRLF and leaving the commit alone reproduces that exactly.
   */
  const apiSkillPath = join(staged.apiPath, ".claude", "skills", "pr-review", "SKILL.md")
  const committedText = readFileSync(apiSkillPath, "utf8")
  writeFileSync(apiSkillPath, committedText.replaceAll("\n", "\r\n"))
  T(
    `${TOOL}: the CRLF working tree really does differ from the committed bytes`,
    readFileSync(apiSkillPath).length > Buffer.byteLength(committedText),
    "the fixture did not actually change the working-tree bytes, so the next assertion would prove nothing",
  )
  check(
    TOOL,
    "identical committed blobs PASS parity even when the checkouts differ byte for byte",
    ["--issue", "ORB-201", "--review", "--repo", "api", "--prompt", prompt, "--dry-run"],
    { status: 0, stdout: /"repositoryKey": "api"/ },
    options,
  )
  writeFileSync(apiSkillPath, committedText)

  /** Real drift is a different COMMIT, and it must still fail. A gate that stopped refusing real
   * drift would be worse than the one it replaced. */
  writeFileSync(apiSkillPath, "drift\n")
  for (const args of [["add", "--", ".claude/skills/pr-review/SKILL.md"], ["commit", "-q", "-m", "drift"]]) {
    spawnSync("git", ["-C", staged.apiPath, ...args], { encoding: "utf8" })
  }
  check(TOOL, "a DIFFERENT committed blob still fails parity before launch", ["--issue", "ORB-201", "--review", "--repo", "api", "--prompt", prompt, "--dry-run"], { status: 2, stderr: /pr-review parity failed/ }, options)

  /** An uncommitted contract is a missing contract, never a match. Two unreadable blobs comparing
   * equal is exactly how a gate reports OK over an absent file. */
  const bare = stageReviewFixture("launch-worker-review-uncommitted")
  if (bare) {
    spawnSync("git", ["-C", bare.apiPath, "rm", "-q", "--cached", ".claude/skills/pr-review/SKILL.md"], { encoding: "utf8" })
    spawnSync("git", ["-C", bare.apiPath, "commit", "-q", "-m", "remove the contract"], { encoding: "utf8" })
    check(
      TOOL,
      "a pr-review contract that is not committed is refused, never treated as a match",
      ["--issue", "ORB-201", "--review", "--repo", "api", "--prompt", stage("launch-worker/uncommitted-prompt.md", "review order\n"), "--dry-run"],
      { status: 2, stderr: /could not read the committed blob/ },
      { path: bare.path },
    )
  }
}
