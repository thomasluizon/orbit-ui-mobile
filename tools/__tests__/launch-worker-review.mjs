import { spawn, spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { REPO_ROOT, T, TOOLS_DIR, check, orcaEnv, root, run, stage } from "./_harness.mjs"
import { emulatorPortClaimDirectory } from "../lib/review-run.mjs"
import { clearWorkerLaunchReservation, gitDirectoryOf, reserveWorkerLaunch } from "../lib/run-state.mjs"
import { sealOrder } from "../lib/run-notes.mjs"
import { discardAttemptLogs, githubAuthEnv, launch, launchConfig, stubEngine } from "./launch-worker.mjs"
import { limitResultLine } from "./claude-usage-limit.mjs"

const TOOL = "launch-worker.mjs"

/** A stub worker that finds its result file in the launcher's pointer, the way a real worker reads it. */
const reviewStub = (label, body) => stage(`launch-worker-review/${label}.cjs`, `const fs = require("node:fs")
const { spawnSync } = require("node:child_process")
const pointer = process.argv.at(-1)
const resultPath = /Write your complete result to (.+?); its first line/.exec(pointer)[1]
const argumentAfter = (flag) => process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : null
const git = (directory, ...args) => spawnSync("git", ["-C", directory, "-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", ...args], { encoding: "utf8" })
${body}
`)

let sequence = 0
/**
 * A fixture repository with one tracked file, a detached run worktree at its head, and an order and output
 * outside both. The staged launcher is a checkout with the real .claude/settings.json, as in production.
 * `headFiles` adds files to the head under review, such as a changed hook.
 */
const reviewFixture = (label, body, overrides = {}, configuration = {}, headFiles = {}) => {
  const fixture = launch(`review-${label}`, { ...launchConfig({ ...stubEngine(reviewStub(label, body)), ...overrides }), ...configuration })
  plainGit(fixture.base, ["init", "-q"])
  cpSync(join(REPO_ROOT, ".claude", "settings.json"), join(fixture.base, ".claude", "settings.json"))
  writeFileSync(join(fixture.worktree, "tracked.txt"), "committed\n")
  for (const [path, contents] of Object.entries(headFiles)) {
    mkdirSync(dirname(join(fixture.worktree, path)), { recursive: true })
    writeFileSync(join(fixture.worktree, path), contents)
  }
  fixture.git(["add", "--", "tracked.txt", ...Object.keys(headFiles)])
  fixture.git(["commit", "-q", "-m", "a tracked file"])
  const runDirectory = join(dirname(fixture.worktree), `launch-worker-review-${label}-head`)
  fixture.git(["worktree", "add", "-q", "--detach", runDirectory])
  const order = stage(`launch-worker-review/${label}-order.md`, sealOrder("Review the head and write the verdict first.\n"))
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
const settingsFile = argumentAfter("--settings")
fs.writeFileSync(resultPath, verdict + "\\n" + JSON.stringify({ cwd: process.cwd(), proof: process.env.ORBIT_DEVICE_PROOF ?? null, marker: process.env.ORBIT_LAUNCH_WORKER ?? null, readOnly: process.env.ORBIT_READ_ONLY_RUN ?? null, githubTokens: [process.env.GH_TOKEN ?? null, process.env.GITHUB_TOKEN ?? null], serial: process.env.ANDROID_SERIAL ?? null, port: process.env.ORBIT_PROOF_EMULATOR_PORT ?? null, wakes, settingSources: argumentAfter("--setting-sources"), settings: settingsFile === null ? null : fs.readFileSync(settingsFile, "utf8") }) + "\\n")
`, {}, {}, {
    // The head under review changes its hook to allow everything. The worker must never load it.
    ".claude/hooks/forbid-worker-browser.mjs": "process.exit(0)\n",
    ".claude/settings.json": JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/forbid-worker-browser.mjs"' }] }] } }),
  })
  // The coordinator holds both token variables, as a real launch does. The read-only worker must find neither (thread OypN).
  const env = { ...githubAuthEnv({ queuedRuns: launchConfig().caps.maxQueuedRuns + 1 }), ORBIT_TEST_WAKE_DIRECTORY: wakeDirectory(clean.base), GH_TOKEN: "coordinator-owner-token", GITHUB_TOKEN: "coordinator-github-token" }
  const refusedTicket = run(TOOL, ["--issue", "ORB-201", "--worktree", clean.worktree, "--prompt", clean.prompt], { path: clean.path, env })
  T(`${TOOL}: the same queue refuses ticket work at admission`, refusedTicket.status === 8 && /ADMISSION_REFUSED/.test(refusedTicket.stdout), refusedTicket.stdout || refusedTicket.stderr)
  const runs = [1, 2, 3].map((attempt) => launchReview(clean, `a review in a detached worktree publishes its result (launch ${attempt}, above both admission caps)`, { status: 0 }, { env }))
  const [first] = runs
  const observed = first.published ? JSON.parse(first.published.split("\n")[1]) : null
  T(`${TOOL}: the published review result is the worker's own text, with the verdict first`,
    first.report?.published === true && first.report.verdict === "VERDICT: CLEAN" && first.published?.startsWith("VERDICT: CLEAN\n") && first.report.writes?.length === 0,
    JSON.stringify(first.report))
  T(`${TOOL}: the review worker runs in the run directory with the launcher marker and no device proof marker`,
    observed?.cwd === clean.runDirectory && observed.marker === "1" && observed.readOnly === "1" && observed.proof === null && observed.serial === null, JSON.stringify(observed))
  const launcherCheckout = realpathSync(clean.base)
  const hookCommands = observed?.settings ? Object.values(JSON.parse(observed.settings).hooks).flat().flatMap((group) => group.hooks).map((hook) => hook.command) : []
  T(`${TOOL}: a review worker loads no settings file of the head under review: only user settings and the launcher's file (thread vkfg)`,
    observed?.settingSources === "user" && hookCommands.length > 0, JSON.stringify({ settingSources: observed?.settingSources, hookCommands }))
  T(`${TOOL}: each hook of a review worker whose head changed its hook runs from the launcher checkout, never from the head (thread vkfg)`,
    hookCommands.length > 0 && hookCommands.every((command) => command.includes(`"${launcherCheckout}/.claude/hooks/`)) &&
      !observed.settings.includes(clean.runDirectory) && !observed.settings.includes("CLAUDE_PROJECT_DIR") &&
      hookCommands.some((command) => command.endsWith(`${launcherCheckout}/.claude/hooks/forbid-worker-browser.mjs"`)),
    hookCommands.join("\n"))
  T(`${TOOL}: a review worker's environment holds no GitHub token, so \`echo $GH_TOKEN\`, \`printenv GH_TOKEN\` and \`env\` print none (thread OypN)`,
    observed?.githubTokens?.length === 2 && observed.githubTokens.every((token) => token === null), JSON.stringify(observed?.githubTokens))
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
  T(`${TOOL}: a review runs the review tier of the configuration with no --tier`,
    plan.tier === "review" && plan.model === "gate-stub-review" && plan.args?.includes("--gate-effort=xhigh") && plan.args.slice(-4, -2).join(" ") !== "" && plan.args.includes("gate-stub-review"), planned.stdout)
  const explicit = check(TOOL, "--tier review is the same as the default", [...clean.argv("review", clean.output()), "--tier", "review", "--dry-run"], { status: 0 }, { path: clean.path })
  T(`${TOOL}: an explicit review tier resolves the same plan`, JSON.parse(explicit.stdout || "{}").tier === "review", explicit.stdout)
  for (const tier of ["default", "mechanical", "deep", "max"]) {
    check(TOOL, `--review refuses the ${tier} tier`, [...clean.argv("review", clean.output()), "--tier", tier, "--dry-run"], { status: 2, stderr: /--tier must be review with --review/ }, { path: clean.path })
  }
  const proofPlanned = check(TOOL, "a proof dry run keeps the default tier", [...clean.argv("proof", clean.output()), "--dry-run"], { status: 0 }, { path: clean.path })
  T(`${TOOL}: a proof runs the default tier, never the review tier`, JSON.parse(proofPlanned.stdout || "{}").tier === "default", proofPlanned.stdout)
  check(TOOL, "--proof refuses the review tier", [...clean.argv("proof", clean.output()), "--tier", "review", "--dry-run"], { status: 2, stderr: /--tier must be default, mechanical, deep or max, got "review"/ }, { path: clean.path })
  T(`${TOOL}: the review dry run names the protected directories: the directory that holds the repositories and each worktree`,
    plan.writeSandbox?.includes(dirname(clean.worktree)) && plan.writeSandbox.includes(clean.worktree) && plan.writeSandbox.includes(clean.runDirectory) && plan.proofEmulatorPort === null,
    JSON.stringify(plan.writeSandbox))
  T(`${TOOL}: the review dry run protects the launcher checkout, so the worker cannot change the hooks it runs under (thread vkfg)`,
    plan.writeSandbox?.includes(launcherCheckout) && plan.args?.includes("--setting-sources") && plan.args.includes("--settings"), JSON.stringify(plan.args))

  reserveWorkerLaunch({ launcherPid: process.pid, issue: "ORB-201", runDirectory: clean.runDirectory, repositoryKey: "ui", branch: "HEAD", headSha: null, tier: "default", timestamp: new Date().toISOString(), relaunchReason: null }, null, clean.runDirectory)
  try {
    launchReview(clean, "a review into a run directory that a live launcher holds is refused", { status: 2, stderr: new RegExp(`already has a launcher pid ${process.pid}`) })
  } finally {
    clearWorkerLaunchReservation(process.pid, clean.runDirectory)
  }

  const proof = launchReview(clean, "a device proof publishes its result", { status: 0 }, { mode: "proof", env })
  const proofEnvironment = JSON.parse(proof.published?.split("\n")[1] ?? "{}")
  T(`${TOOL}: a device proof carries the device proof marker and its own verdict line`,
    proof.report?.mode === "proof" && proof.report.verdict === "PROOF: PASS" && proofEnvironment.proof === "1", JSON.stringify(proof.report))
  const port = Number(proofEnvironment.port)
  T(`${TOOL}: a device proof pins one even emulator port from 5560 and its serial (finding 15)`,
    Number.isInteger(port) && port % 2 === 0 && port >= 5560 && port <= 5680 && proofEnvironment.serial === `emulator-${port}`, JSON.stringify(proofEnvironment))
  // With no token in the environment, `gh` reads its own sign-in: another account would fail each read, so the launch refuses it (thread OypN).
  const otherAccount = launchReview(clean, "a review whose gh sign-in is not the repository owner is refused", { status: 2, stderr: /not the repository owner "test-owner"/ },
    { env: orcaEnv([{ match: "api user --jq .login", stdout: "someone-else\n" }]) })
  T(`${TOOL}: a refused gh sign-in publishes nothing`, otherAccount.published === null && !existsSync(otherAccount.outputFile), otherAccount.result.stderr)
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
  // Each refused directory gets its own output, so a launch that wrongly starts cannot fail the next case.
  const refusedDirectory = (name, directory, pattern) => {
    const refusedOut = fixture.output()
    const refused = check(TOOL, name, ["--review", "--order", fixture.order, "--out", refusedOut, "--directory", directory], { status: 2, stderr: pattern }, { path: fixture.path })
    T(`${TOOL}: ${name.replace(" is refused", "")} publishes nothing`, !existsSync(refusedOut), refused.stderr)
  }
  refusedDirectory("a review in the git directory of the configured repository is refused (thread __od)", join(fixture.worktree, ".git"), /is inside a git directory/)
  if (process.platform !== "darwin") return
  const branchWorktree = join(dirname(fixture.worktree), "launch-worker-review-usage-branch")
  fixture.git(["worktree", "add", "-q", "-b", "ticket-branch", branchWorktree])
  const plainSibling = join(dirname(fixture.worktree), "launch-worker-review-usage-plain")
  mkdirSync(plainSibling, { recursive: true })
  for (const [name, directory, pattern] of [
    ["a review in the configured primary checkout is refused (thread vkfc)", fixture.worktree, /is the configured repository/],
    ["a review in a branch worktree is refused (thread vkfc)", branchWorktree, /is on a branch; make a detached worktree at the head/],
    ["a review in the directory that holds the configured repository is refused (thread yoYL)", dirname(fixture.worktree), /holds the protected directory/],
    ["a review in a plain directory next to the configured repository is refused (thread __od)", plainSibling, /is outside git and sits inside the protected directory/],
  ]) {
    refusedDirectory(name, directory, pattern)
  }
  const copy = dirname(stage("launch-worker-review/usage-copy/tracked.txt", "a copy of the head\n"))
  const copied = check(TOOL, "a review in a copy outside git and outside every protected directory still publishes (thread __od)",
    ["--review", "--order", fixture.order, "--out", out, "--directory", copy], { status: 0 }, { path: fixture.path, env: githubAuthEnv() })
  discardAttemptLogs(copied.stdout)
  T(`${TOOL}: the review in a copy publishes the worker's own result`, existsSync(out) && readFileSync(out, "utf8") === "VERDICT: CLEAN\n", copied.stderr)
  const workers = launchConfig().workers
  const codex = reviewFixture("codex", "fs.writeFileSync(resultPath, 'VERDICT: CLEAN\\n')", {}, { worker: "codex", workers: { ...workers, codex: { ...workers.codex, command: process.execPath } } })
  check(TOOL, "a review on an engine with no read-only hooks is refused (thread vkfg)", codex.argv("review", codex.output()), { status: 2, stderr: /needs the claude worker engine/ }, { path: codex.path })
}

const launchInBackground = (fixture, argv, env) => new Promise((settle) => {
  const child = spawn(process.execPath, [fixture.path, ...argv], { cwd: REPO_ROOT, env: { ...process.env, ...githubAuthEnv(), ...env }, stdio: ["ignore", "pipe", "pipe"] })
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk) => { stdout += chunk })
  child.stderr.on("data", (chunk) => { stderr += chunk })
  child.on("close", (status) => settle({ status, stdout, stderr }))
})

/** Two proofs launched together each claim their own port, and each claim ends with its launcher (thread vkfZ). */
const concurrentProofCase = async () => {
  const fixture = reviewFixture("proof-ports", `
setTimeout(() => fs.writeFileSync(resultPath, "PROOF: PASS\\n" + process.env.ORBIT_PROOF_EMULATOR_PORT + "\\n"), 3000)
`)
  const secondRun = join(dirname(fixture.worktree), "launch-worker-review-proof-ports-second")
  fixture.git(["worktree", "add", "-q", "--detach", secondRun])
  const outputs = [fixture.output(), fixture.output()]
  const results = await Promise.all([
    launchInBackground(fixture, fixture.argv("proof", outputs[0]), {}),
    launchInBackground(fixture, ["--proof", "--order", fixture.order, "--out", outputs[1], "--directory", secondRun], {}),
  ])
  for (const result of results) discardAttemptLogs(result.stdout)
  const ports = outputs.map((output) => existsSync(output) ? Number(readFileSync(output, "utf8").split("\n")[1]) : null)
  T(`${TOOL}: two proofs launched together pin two different emulator ports (thread vkfZ)`,
    results.every((result) => result.status === 0) && ports.every((port) => Number.isInteger(port) && port >= 5560) && ports[0] !== ports[1],
    JSON.stringify({ ports, statuses: results.map((result) => result.status), stderr: results.map((result) => result.stderr.slice(-400)) }))
  const claimDirectory = emulatorPortClaimDirectory(fixture.base)
  const claims = existsSync(claimDirectory) ? readdirSync(claimDirectory) : null
  T(`${TOOL}: each proof launcher releases its port claim when it exits`, claims?.length === 0, JSON.stringify(claims))
}

const plainGit = (directory, args) => spawnSync("git", ["-C", directory, "-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", ...args], { encoding: "utf8" })

/** A repository outside the configured ones, with one tracked file. */
const looseRepository = (path) => {
  mkdirSync(path, { recursive: true })
  plainGit(path, ["init", "-q", "--initial-branch=main"])
  writeFileSync(join(path, "note.md"), "committed\n")
  plainGit(path, ["add", "--", "note.md"])
  plainGit(path, ["commit", "-q", "-m", "a note"])
  return path
}

/**
 * Each write path of the round 1 review, made by the worker's own processes. The macOS write sandbox
 * refuses all of them, so the run leaves nothing and publishes its result. Each assertion reads the
 * ground truth (refs, remote refs, file content), never the launcher's own report.
 */
const sandboxCases = () => {
  const fixture = reviewFixture("sandbox", `
const run = (command) => spawnSync("sh", ["-c", command], { cwd: process.cwd(), env: process.env, encoding: "utf8" })
for (const command of JSON.parse(process.env.ORBIT_TEST_ATTEMPTS)) run(command)
fs.writeFileSync(resultPath, "VERDICT: CLEAN\\n")
`, {}, { hygieneRoots: { workshop: join(root, "launch-worker-review-workshop"), vault: join(root, "launch-worker-review-vault", "brain") } })
  writeFileSync(join(fixture.worktree, "second.txt"), "committed\n")
  fixture.git(["add", "--", "second.txt"])
  fixture.git(["commit", "-q", "-m", "a second tracked file"])
  const other = join(dirname(fixture.worktree), "launch-worker-review-sandbox-other")
  fixture.git(["worktree", "add", "-q", "-b", "other-branch", other])
  const brain = looseRepository(join(root, "launch-worker-review-vault", "brain"))
  mkdirSync(join(root, "launch-worker-review-workshop"), { recursive: true })
  const home = join(root, "launch-worker-review-home")
  const stray = looseRepository(join(home, "Developer", "stray"))
  const scratch = join(root, "launch-worker-review-scratch")
  mkdirSync(scratch, { recursive: true })
  const head = fixture.git(["rev-parse", "HEAD"]).stdout.trim()
  const snapshot = () => ({
    primaryRefs: fixture.git(["for-each-ref", "--format=%(refname) %(objectname)"]).stdout,
    originRefs: fixture.git(["ls-remote", fixture.origin]).stdout,
    runHead: fixture.git(["rev-parse", "HEAD"], fixture.runDirectory).stdout.trim(),
    otherHead: fixture.git(["rev-parse", "HEAD"], other).stdout.trim(),
    otherTracked: readFileSync(join(other, "tracked.txt"), "utf8"),
    otherFlags: fixture.git(["ls-files", "-v"], other).stdout,
    brainHead: plainGit(brain, ["rev-parse", "HEAD"]).stdout.trim(),
    brainNote: readFileSync(join(brain, "note.md"), "utf8"),
    strayHead: plainGit(stray, ["rev-parse", "HEAD"]).stdout.trim(),
    primaryConfig: readFileSync(join(fixture.worktree, ".git", "config"), "utf8"),
    linkCounts: [join(other, "tracked.txt"), join(fixture.worktree, ".git", "config")].map((path) => statSync(path).nlink).join(" "),
  })
  const before = snapshot()
  const attempts = [
    ["GIT_CONFIG_COUNT=0 then a push (finding 1)", `GIT_CONFIG_COUNT=0 git push -q "$ORIGIN" HEAD:refs/heads/evil-env`],
    ["env -u GIT_CONFIG_COUNT then update-ref (finding 2)", `env -u GIT_CONFIG_COUNT git -C "$OTHER" update-ref refs/heads/evil-ref HEAD`],
    ["a lower-case core.hookspath push (finding 3)", `git -c core.hookspath=/nonexistent push -q "$ORIGIN" HEAD:refs/heads/evil-lower`],
    ["a --config-env hooks path push (finding 4)", `HP=/nonexistent git --config-env=core.hooksPath=HP push -q "$ORIGIN" HEAD:refs/heads/evil-configenv`],
    ["a GIT_CONFIG_PARAMETERS hooks path push (finding 5)", `GIT_CONFIG_PARAMETERS="'core.hooksPath'='/nonexistent'" git push -q "$ORIGIN" HEAD:refs/heads/evil-params`],
    ["a clone, a commit and a push from it (finding 6)", `git clone -q "$ORIGIN" "$SCRATCH/clone" && git -C "$SCRATCH/clone" -c user.email=a@b -c user.name=n commit -q --allow-empty -m w && git -C "$SCRATCH/clone" push -q origin HEAD:refs/heads/evil-clone`],
    ["an edit and a commit in the brain vault (finding 7)", `echo changed > "$BRAIN/note.md"; git -C "$BRAIN" -c user.email=a@b -c user.name=n commit -qam w`],
    ["a ref written as a file (finding 8)", `printf '%s\\n' "$HEAD_SHA" > "$PRIMARY/.git/refs/heads/evil-fs"`],
    ["a tracked edit hidden by --skip-worktree (finding 9)", `git -C "$OTHER" update-index --skip-worktree tracked.txt; printf changed > "$OTHER/tracked.txt"`],
    ["a plain tag (finding 10)", `git tag reviewer-tag`],
    ["a moved remote-tracking ref (finding 11)", `git update-ref refs/remotes/origin/main HEAD~1`],
    ["an edit and a commit in a worktree that another launcher holds (finding 13)", `printf 'reviewer write' > "$OTHER/second.txt"; git -C "$OTHER" -c core.hooksPath=/nonexistent -c user.email=a@b -c user.name=n commit -q --allow-empty -m reviewer`],
    ["a commit in an unconfigured repository under the home directory (finding 7)", `git -C "$STRAY" -c user.email=a@b -c user.name=n commit -q --allow-empty -m w`],
    ["a commit and a branch in the run directory", `git -c user.email=a@b -c user.name=n commit -q --allow-empty -m w; git branch reviewer-branch`],
    ["a hard link to a protected tracked file, then a write through the link (thread __o2)", `ln "$OTHER/tracked.txt" "$SCRATCH/linked-tracked" && printf changed >> "$SCRATCH/linked-tracked"`],
    ["a hard link to a protected git config, then a write through the link (thread __o2)", `ln "$PRIMARY/.git/config" "$SCRATCH/linked-config" && printf '[core]\\n\\thooksPath = /nonexistent\\n' >> "$SCRATCH/linked-config"`],
  ]
  reserveWorkerLaunch({ launcherPid: process.pid, issue: "ORB-201", runDirectory: other, repositoryKey: "ui", branch: "other-branch", headSha: null, tier: "default", timestamp: new Date().toISOString(), relaunchReason: null }, null, other)
  let outcome
  try {
    outcome = launchReview(fixture, "a review whose worker tries every write path of the round 1 review leaves none and publishes", { status: 0 }, {
      env: {
        HOME: home,
        ORBIT_TEST_ATTEMPTS: JSON.stringify(attempts.map(([, command]) => command)),
        ORIGIN: fixture.origin, OTHER: other, PRIMARY: fixture.worktree, BRAIN: brain, STRAY: stray, SCRATCH: scratch, HEAD_SHA: head,
      },
    })
  } finally {
    clearWorkerLaunchReservation(process.pid, other)
  }
  const after = snapshot()
  T(`${TOOL}: the sandboxed review found no write and published its result`, outcome.report?.writes?.length === 0 && outcome.published?.startsWith("VERDICT: CLEAN"), JSON.stringify(outcome.report?.writes))
  for (const [field, label] of [
    ["originRefs", "the remote holds no branch from a push, however the hooks were turned off (findings 1, 3, 4, 5, 6)"],
    ["primaryRefs", "no local branch, tag, ref file or remote-tracking ref moved (findings 2, 8, 10, 11)"],
    ["runHead", "the run directory HEAD did not move"],
    ["otherHead", "the held worktree HEAD did not move (finding 13)"],
    ["otherTracked", "the tracked file behind --skip-worktree is unchanged (finding 9)"],
    ["otherFlags", "no skip-worktree or assume-unchanged flag was set (finding 9)"],
    ["brainHead", "the brain vault HEAD did not move (finding 7)"],
    ["brainNote", "the brain vault note is unchanged (finding 7)"],
    ["strayHead", "an unconfigured repository under the home directory did not move (finding 7)"],
    ["primaryConfig", "the git config of the primary checkout is unchanged behind a hard link (thread __o2)"],
    ["linkCounts", "no protected file got a second hard link (thread __o2)"],
  ]) {
    T(`${TOOL}: sandbox: ${label}`, after[field] === before[field], `${before[field]}\n---\n${after[field]}`)
  }
  T(`${TOOL}: sandbox: the scratch directory holds no hard link to a protected file (thread __o2)`,
    !existsSync(join(scratch, "linked-tracked")) && !existsSync(join(scratch, "linked-config")), readdirSync(scratch).join(", "))
  T(`${TOOL}: sandbox: the held worktree's second tracked file is unchanged (finding 13)`, readFileSync(join(other, "second.txt"), "utf8") === "committed\n", readFileSync(join(other, "second.txt"), "utf8"))
}

/** The run directory is the one worktree the worker may write, so a tracked edit there is a write of the run. */
const runDirectoryWriteCase = () => {
  const fixture = reviewFixture("write-tracked-change", "fs.writeFileSync('tracked.txt', 'edited by the reviewer\\n')\nfs.writeFileSync(resultPath, 'VERDICT: CLEAN\\n')\n")
  const outcome = launchReview(fixture, "a review that edits a tracked file of its run directory fails with exit 5", { status: 5, stderr: /left a tracked-change in/ })
  T(`${TOOL}: a tracked edit in the run directory is reported and its result is not published`,
    outcome.report?.published === false && outcome.published === null &&
      outcome.report.writes?.some((write) => write.kind === "tracked-change" && write.directory === fixture.runDirectory && write.detail === "tracked.txt"),
    JSON.stringify(outcome.report?.writes))
}

/** The write sandbox is macOS sandbox-exec. Elsewhere the read-only mode refuses to start rather than run unguarded. */
const unsandboxedCase = () => {
  const fixture = reviewFixture("no-sandbox", "fs.writeFileSync(resultPath, 'VERDICT: CLEAN\\n')")
  const outcome = launchReview(fixture, "a read-only launch without the macOS write sandbox is refused", { status: 2, stderr: /needs the macOS write sandbox/ })
  T(`${TOOL}: a refused read-only launch publishes nothing`, outcome.published === null, outcome.result.stderr)
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

/**
 * The order that compose-prompt.mjs writes carries the seal that the launcher checks; a hand-written or changed order does not.
 * The launcher checks the seal before the write sandbox, so these cases run on every platform (thread b_tA). Off macOS the
 * composed order passes the seal and then stops at the sandbox check.
 */
const sealCases = () => {
  const fixture = reviewFixture("seal", "fs.writeFileSync(resultPath, 'VERDICT: CLEAN\\n')")
  const composeTool = join(fixture.base, "tools", "compose-prompt.mjs")
  cpSync(join(TOOLS_DIR, "compose-prompt.mjs"), composeTool)
  mkdirSync(join(fixture.base, ".claude", "playbooks"), { recursive: true })
  cpSync(join(REPO_ROOT, ".claude", "playbooks", "review-and-audit.md"), join(fixture.base, ".claude", "playbooks", "review-and-audit.md"))
  const directory = dirname(fixture.order)
  const composed = join(directory, "seal-composed-review.md")
  check("compose-prompt.mjs", "a review order is composed for the launcher",
    ["--review", "--repo", "ui", "--pr", "2145", "--head", "0123456789abcdef0123456789abcdef01234567", "--out", composed], { status: 0 }, { path: composeTool, env: orcaEnv([{ match: "config list --repo", stdout: "owner/repository\n\nprompts.review                \"Review rules of the stub.\"  [repo]\n" }]) })
  const dryRun = (order) => ["--review", "--order", order, "--out", fixture.output(), "--directory", fixture.runDirectory, "--dry-run"]
  const sandboxed = process.platform === "darwin"
  check(TOOL, sandboxed ? "a review order that compose-prompt.mjs wrote passes the seal check" : "a review order that compose-prompt.mjs wrote passes the seal check and stops at the missing write sandbox",
    dryRun(composed), sandboxed ? { status: 0 } : { status: 2, stderr: /needs the macOS write sandbox/ }, { path: fixture.path })
  const appended = join(directory, "seal-appended-review.md")
  writeFileSync(appended, `${readFileSync(composed, "utf8")}One more line.\n`)
  check(TOOL, "the same review order with one appended line exits 2", dryRun(appended), { status: 2, stderr: /is not a composed order/ }, { path: fixture.path })
  const handWritten = stage("launch-worker-review/seal-hand-written.md", "Review the head and write the verdict first.\n")
  check(TOOL, "a hand-written review order exits 2", dryRun(handWritten), { status: 2, stderr: /is not a composed order/ }, { path: fixture.path })
}

/**
 * The launcher chooses its mode on one line. After that line, the clocks, the CPU probe, the wake source and
 * the attempt loop read the values of the mode, so no later line names a mode flag (thread __pE).
 */
const modeChoiceCase = () => {
  const lines = readFileSync(join(TOOLS_DIR, TOOL), "utf8").split("\n")
  const choice = lines.findIndex((line) => line.startsWith("const launchMode = "))
  T(`${TOOL}: one line chooses between the research, read-only and ticket modes (thread __pE)`,
    choice !== -1 && ["researchLaunch(", "readOnlyLaunch(", "ticketLaunch("].every((mode) => lines[choice].includes(mode)), lines[choice] ?? "no launchMode line")
  const branches = choice === -1 ? ["no launchMode line"] : lines.slice(choice + 1)
    .map((line, index) => `${choice + index + 2}: ${line.trim()}`)
    // The cap name reviewFixAttempts and the text of a message are not mode branches.
    .filter((line) => /\b(?:research|review|proof|readOnly|ticketWork|reservesWorktree)\w*\b|\bmode ===/.test(
      line.replace(/^\d+: /, "").replaceAll("reviewFixAttempts", "").replace(/`[^`]*`|"[^"]*"/g, "\"\"")))
  T(`${TOOL}: no line after the mode choice names a mode (thread __pE)`, branches.length === 0, branches.join("\n     "))
}

export const cases = async () => {
  modeChoiceCase()
  usageCases()
  sealCases()
  if (process.platform !== "darwin") {
    unsandboxedCase()
    return
  }
  cleanCases()
  await concurrentProofCase()
  sandboxCases()
  runDirectoryWriteCase()
  publicationCases()
}
