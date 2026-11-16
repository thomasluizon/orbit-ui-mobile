import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { T, check, run, stage } from "./_harness.mjs"
import { clearWorkerLaunchReservation, gitDirectoryOf, reserveWorkerLaunch } from "../lib/run-state.mjs"
import { discardAttemptLogs, githubAuthEnv, launch, launchConfig, stubEngine } from "./launch-worker.mjs"
import { limitResultLine } from "./claude-usage-limit.mjs"

const TOOL = "launch-worker.mjs"

/** A stub worker that finds its result file in the launcher's pointer, the way a real worker reads it. */
const reviewStub = (label, body) => stage(`launch-worker-review/${label}.cjs`, `const fs = require("node:fs")
const { spawnSync } = require("node:child_process")
const pointer = process.argv.at(-1)
const resultPath = /Write your complete result to (.+?); its first line/.exec(pointer)[1]
const git = (directory, ...args) => spawnSync("git", ["-C", directory, "-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", ...args], { encoding: "utf8" })
${body}
`)

let sequence = 0
/** A fixture repository with one tracked file, a detached run worktree at its head, and an order and output outside both. */
const reviewFixture = (label, body, overrides = {}) => {
  const fixture = launch(`review-${label}`, launchConfig({ ...stubEngine(reviewStub(label, body)), ...overrides }))
  writeFileSync(join(fixture.worktree, "tracked.txt"), "committed\n")
  fixture.git(["add", "--", "tracked.txt"])
  fixture.git(["commit", "-q", "-m", "a tracked file"])
  const runDirectory = join(dirname(fixture.worktree), `launch-worker-review-${label}-head`)
  fixture.git(["worktree", "add", "-q", "--detach", runDirectory])
  const order = stage(`launch-worker-review/${label}-order.md`, "Review the head and write the verdict first.\n")
  const output = () => join(dirname(order), `${label}-result-${sequence += 1}.md`)
  const argv = (mode, out) => [`--${mode}`, "--order", order, "--out", out, "--directory", runDirectory]
  return { ...fixture, runDirectory, order, output, argv }
}

const launchReview = (fixture, name, expected, { mode = "review", env = {}, extra = [] } = {}) => {
  const outputFile = fixture.output()
  const result = check(TOOL, name, [...fixture.argv(mode, outputFile), ...extra], expected, { path: fixture.path, env: { ...githubAuthEnv(), ...env } })
  let report = null
  try { report = JSON.parse(result.stdout) } catch { report = null }
  discardAttemptLogs(result.stdout)
  return { result, report, outputFile, published: existsSync(outputFile) ? readFileSync(outputFile, "utf8") : null }
}

const slotFiles = (directory) => {
  try { return readdirSync(join(gitDirectoryOf(directory), "orbit-worker-launches")).filter((name) => name.includes("-slot-") || name.includes("-override-")) } catch { return [] }
}

const cleanCases = () => {
  const wakeDirectory = (base) => join(base, ".git", "orbit-wake-sources")
  const clean = reviewFixture("clean", `
fs.writeFileSync("untracked-build-output.txt", "a test run leaves this\\n")
const wakeDirectory = process.env.ORBIT_TEST_WAKE_DIRECTORY
const wakes = fs.readdirSync(wakeDirectory).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(fs.readFileSync(wakeDirectory + "/" + name, "utf8")))
const verdict = process.env.ORBIT_TEST_VERDICT ?? (process.env.ORBIT_DEVICE_PROOF === "1" ? "PROOF: PASS" : "VERDICT: CLEAN")
fs.writeFileSync(resultPath, verdict + "\\n" + JSON.stringify({ cwd: process.cwd(), proof: process.env.ORBIT_DEVICE_PROOF ?? null, marker: process.env.ORBIT_LAUNCH_WORKER ?? null, wakes }) + "\\n")
`)
  const env = { ...githubAuthEnv({ queuedRuns: launchConfig().caps.maxQueuedRuns + 1 }), ORBIT_TEST_WAKE_DIRECTORY: wakeDirectory(clean.base) }
  const refusedTicket = run(TOOL, ["--issue", "ORB-201", "--worktree", clean.worktree, "--prompt", clean.prompt], { path: clean.path, env })
  T(`${TOOL}: the same queue refuses ticket work at admission`, refusedTicket.status === 8 && /ADMISSION_REFUSED/.test(refusedTicket.stdout), refusedTicket.stdout || refusedTicket.stderr)
  const runs = [1, 2, 3].map((attempt) => launchReview(clean, `a review in a detached worktree publishes its result (launch ${attempt}, above both admission caps)`, { status: 0 }, { env }))
  const [first] = runs
  const observed = first.published ? JSON.parse(first.published.split("\n")[1]) : null
  T(`${TOOL}: the published review result is the worker's own text, with the verdict first`,
    first.report?.published === true && first.report.verdict === "VERDICT: CLEAN" && first.published?.startsWith("VERDICT: CLEAN\n") && first.report.writes?.length === 0,
    JSON.stringify(first.report))
  T(`${TOOL}: the review worker runs in the run directory with the launcher marker and no device proof marker`,
    observed?.cwd === clean.runDirectory && observed.marker === "1" && observed.proof === null, JSON.stringify(observed))
  const wake = observed?.wakes?.find((source) => source.review === true)
  T(`${TOOL}: a review registers a review wake source with its worker pid`,
    wake?.what === "review" && wake.research === false && Number.isInteger(wake.workerPid) && wake.pending !== true, JSON.stringify(observed?.wakes))
  T(`${TOOL}: a review takes no admission and no branch launch slot, so a third launch needs no relaunch reason`,
    runs.every((entry) => entry.result.status === 0) && slotFiles(clean.runDirectory).length === 0 && slotFiles(clean.worktree).length === 0 &&
      !existsSync(join(gitDirectoryOf(clean.runDirectory), "orbit-worker-launches", "occupied-worktree.json")),
    JSON.stringify(runs.map((entry) => entry.result.status)))
  T(`${TOOL}: the review wake source is gone after the run`,
    !readdirSync(wakeDirectory(clean.base)).some((name) => name.endsWith(".json")), readdirSync(wakeDirectory(clean.base)).join(", "))
  T(`${TOOL}: an untracked file in the run directory is not a write`, existsSync(join(clean.runDirectory, "untracked-build-output.txt")))

  const planned = check(TOOL, "a review dry run resolves the plan offline", [...clean.argv("review", clean.output()), "--dry-run"], { status: 0 }, { path: clean.path })
  const plan = JSON.parse(planned.stdout || "{}")
  T(`${TOOL}: the review dry run names the mode, the output and the pointer, and no ticket`,
    plan.mode === "review" && plan.issue === null && plan.runDirectory === clean.runDirectory && plan.outputFile?.endsWith(".md") &&
      plan.args?.at(-1).includes(clean.order) && plan.args.at(-1).includes("read-only review run") && plan.args.includes("--disallowed-tools"),
    planned.stdout)

  reserveWorkerLaunch({ launcherPid: process.pid, issue: "ORB-201", runDirectory: clean.runDirectory, repositoryKey: "ui", branch: "HEAD", headSha: null, tier: "default", timestamp: new Date().toISOString(), relaunchReason: null }, null, clean.runDirectory)
  try {
    launchReview(clean, "a review into a run directory that a live launcher holds is refused", { status: 2, stderr: new RegExp(`already has a launcher pid ${process.pid}`) })
  } finally {
    clearWorkerLaunchReservation(process.pid, clean.runDirectory)
  }

  const proof = launchReview(clean, "a device proof publishes its result", { status: 0 }, { mode: "proof", env })
  T(`${TOOL}: a device proof carries the device proof marker and its own verdict line`,
    proof.report?.mode === "proof" && proof.report.verdict === "PROOF: PASS" && JSON.parse(proof.published?.split("\n")[1] ?? "{}").proof === "1", JSON.stringify(proof.report))
  const misread = launchReview(clean, "a device proof that opens with a review verdict exits 1", { status: 1 }, { mode: "proof", env: { ...env, ORBIT_TEST_VERDICT: "VERDICT: CLEAN" } })
  T(`${TOOL}: a review verdict line does not publish a device proof`, misread.report?.published === false && misread.published === null, misread.result.stderr)
}

const usageCases = () => {
  const fixture = reviewFixture("usage", "fs.writeFileSync(resultPath, 'VERDICT: CLEAN\\n')")
  const out = fixture.output()
  for (const [name, argv, pattern] of [
    ["--review and --proof together are refused", [...fixture.argv("review", out), "--proof"], /choose one of --research, --review and --proof/],
    ["--review with --research is refused", [...fixture.argv("review", out), "--research"], /choose one of --research, --review and --proof/],
    ["--review refuses a ticket option", [...fixture.argv("review", out), "--issue", "ORB-201"], /unsupported --review option: --issue/],
    ["--review refuses a relaunch reason, since it holds no branch slot", [...fixture.argv("review", out), "--relaunch-reason", "again"], /unsupported --review option: --relaunch-reason/],
    ["--directory without a read-only mode is refused", ["--issue", "ORB-201", "--worktree", fixture.worktree, "--prompt", fixture.prompt, "--directory", fixture.runDirectory], /--directory requires --review or --proof/],
    ["--review needs a run directory", ["--review", "--order", fixture.order, "--out", out], /--directory is required for --review/],
  ]) {
    check(TOOL, name, argv, { status: 2, stderr: pattern }, { path: fixture.path })
  }
}

/** Each write a reviewer must never leave, made where the worker can reach it: the run directory or the primary checkout. */
const writeCases = () => {
  for (const [label, body, kind] of [
    ["commit", "git(process.cwd(), 'commit', '-q', '--allow-empty', '-m', 'a reviewer commit')", "ref-update"],
    ["primary-commit", "git(process.env.ORBIT_TEST_PRIMARY, 'commit', '-q', '--allow-empty', '-m', 'a commit in the primary checkout')", "ref-update"],
    ["tracked-change", "fs.writeFileSync(process.env.ORBIT_TEST_PRIMARY + '/tracked.txt', 'edited by the reviewer\\n')", "tracked-change"],
    ["new-branch", "git(process.cwd(), 'branch', 'reviewer-branch')", "new-branch"],
    ["push", "git(process.cwd(), 'push', '-q', process.env.ORBIT_TEST_ORIGIN, 'HEAD:refs/heads/reviewer-push')", "push"],
  ]) {
    const fixture = reviewFixture(`write-${label}`, `${body}\nfs.writeFileSync(resultPath, "VERDICT: CLEAN\\n")\n`)
    const head = fixture.git(["rev-parse", "HEAD"]).stdout.trim()
    const runHead = fixture.git(["rev-parse", "HEAD"], fixture.runDirectory).stdout.trim()
    const outcome = launchReview(fixture, `a review that leaves a ${label} fails with exit 5`, { status: 5, stderr: new RegExp(`left a ${kind} in`) },
      { env: { ORBIT_TEST_PRIMARY: fixture.worktree, ORBIT_TEST_ORIGIN: fixture.origin } })
    T(`${TOOL}: a ${label} is reported as a ${kind} and its result is not published`,
      outcome.report?.published === false && outcome.published === null && outcome.report.writes?.some((write) => write.kind === kind) &&
        outcome.report.outcome === "EXITED" && outcome.report.exitCode === 0,
      JSON.stringify(outcome.report?.writes))
    T(`${TOOL}: the guard kept the ${label} out of every ref`,
      fixture.git(["rev-parse", "HEAD"]).stdout.trim() === head && fixture.git(["rev-parse", "HEAD"], fixture.runDirectory).stdout.trim() === runHead &&
        fixture.git(["branch", "--list", "reviewer-branch"]).stdout.trim() === "" &&
        fixture.git(["ls-remote", fixture.origin, "refs/heads/reviewer-push"]).stdout.trim() === "",
      label)
  }
}

const publicationCases = () => {
  for (const [label, body, pattern] of [
    ["failed-worker", "fs.writeFileSync(resultPath, 'VERDICT: CLEAN\\n')\nprocess.exit(1)", /"exitCode": 1/],
    ["no-verdict", "fs.writeFileSync(resultPath, 'I reviewed it and it looks fine\\n')", /does not open with the review verdict line/],
    ["no-result", "", /could not publish the review result/],
  ]) {
    const fixture = reviewFixture(`publish-${label}`, body)
    const outcome = launchReview(fixture, `a ${label} run exits 1`, { status: 1 })
    T(`${TOOL}: a ${label} run publishes no result file`,
      outcome.report?.published === false && outcome.published === null && pattern.test(`${outcome.result.stdout}\n${outcome.result.stderr}`),
      `${outcome.result.stdout}\n${outcome.result.stderr}`)
  }

  const limited = reviewFixture("usage-limit", `
if (process.env.CLAUDE_CONFIG_DIR !== undefined) {
  fs.writeFileSync(resultPath, "VERDICT: CLEAN\\npartial result of the stopped attempt\\n")
  process.stdout.write(${JSON.stringify(`${limitResultLine()}\n`)})
  process.exit(1)
}
fs.writeFileSync(resultPath, fs.existsSync(resultPath) ? "VERDICT: CLEAN\\nthe stale partial result survived\\n" : "VERDICT: DEFECTS (1)\\n1. BLOCKING tools/a.mjs:1\\n")
`)
  const relaunched = launchReview(limited, "a review stopped at the worker account's usage limit is run again on the main account", { status: 0, stderr: /relaunching it once on the main account/ })
  T(`${TOOL}: the relaunched review starts from no result and publishes only its own`,
    relaunched.report?.attempts?.length === 2 && relaunched.report.account === "main" && relaunched.published?.startsWith("VERDICT: DEFECTS (1)\n"),
    JSON.stringify({ report: relaunched.report, published: relaunched.published }))

  /** The CPU probe covers Windows and macOS. On Linux a silent CPU burner is invisible and the no-progress kill is correct. */
  const cpuProbed = ["win32", "darwin"].includes(process.platform)
  const busy = reviewFixture("cpu", "const stop = Date.now() + 60000\nwhile (Date.now() < stop) {}", { timeouts: { hardCeilingMinutes: 0.15, noProgressMinutes: 0.05, pollSeconds: 0.2 } })
  const burned = launchReview(busy, cpuProbed
    ? "a review that runs tests and writes no file is NOT killed for no progress"
    : "without a CPU probe, a silent review still dies on the no-progress clock",
  { status: 1, stdout: cpuProbed ? /"outcome": "KILLED_HARD_CEILING"/ : /"outcome": "KILLED_NO_PROGRESS"/ })
  T(`${TOOL}: a killed review publishes no result file`, burned.report?.published === false && burned.published === null, burned.result.stdout)
}

export const cases = () => {
  usageCases()
  cleanCases()
  writeCases()
  publicationCases()
}
