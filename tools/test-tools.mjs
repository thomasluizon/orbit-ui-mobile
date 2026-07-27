#!/usr/bin/env node
/**
 * The harness execution gate: every script under tools/ is EXECUTED here, never
 * merely read. A harness cannot certify itself by review - claude-review.yml runs a
 * fresh session on every PR, but it reviews the DIFF, so a broken tool can be read,
 * approved and merged. tools/launch-worker.mjs shipped in PR #604 reading `orca
 * terminal wait`'s "not yet" (exit 1 with an ok:false payload) as a fatal error,
 * which only running it caught.
 *
 * Three layers:
 *   1. Structural coverage: every tools/<script> has a COVERAGE entry, so tool N+1
 *      cannot land uncovered.
 *   2. Universal contract (tools/CONVENTIONS.md): --help exits 0 with usage on
 *      stdout, and invalid input exits non-zero instead of doing the work.
 *   3. Decision paths: the per-tool cases below, hermetic. External calls (orca, gh,
 *      git, Linear) are stubbed or dry-run - this gate creates no worktree, opens no
 *      network connection and touches no Linear issue.
 *
 * Deliberately NOT re-asserted here: the verdicts of the tools guards.yml already
 * executes (dash ban, copy register, frontmatter, suppressions ratchet). Those have
 * their own jobs; this gate proves their CLI contract, not their findings.
 *
 * Run: node tools/test-tools.mjs   (exits non-zero on any failure)
 */

import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: test-tools.mjs

  Executes every script in tools/ and asserts its CLI contract and decision paths.
  Takes no arguments; hermetic (no network, no worktree, no Linear).

  --help, -h  print this usage and exit 0

exit codes: 0 every check passed, 1 a failing check, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

if (process.argv.length > 2) {
  console.error(`test-tools: takes no arguments, got: ${process.argv.slice(2).join(" ")}\n`)
  console.error(USAGE)
  process.exit(2)
}

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(TOOLS_DIR, "..")
const SELF = "test-tools.mjs"
const EM_DASH = String.fromCharCode(0x2014)

let fails = 0
const T = (name, ok, detail = "") => {
  if (!ok) fails++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `\n     ${detail}`}`)
}

const root = mkdtempSync(join(tmpdir(), "orbit-tools-gate-"))
process.on("exit", () => {
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    /* a transient lock on the fixture root must never mask the suite's verdict */
  }
})
const stage = (relativePath, body) => {
  const path = join(root, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
  return path
}

/**
 * The PATH `bash` on Windows is the WSL stub, which fails with no such file. Resolve
 * a real one and fail loudly rather than skipping every .sh tool.
 */
const resolveBash = () => {
  const candidates = [
    process.env.ORBIT_BASH,
    "bash",
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  ].filter(Boolean)
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" })
    if (!probe.error && probe.status === 0) return candidate
  }
  return null
}
const BASH = resolveBash()

/**
 * orca is stubbed by pointing ORCA_BIN at this node binary and preloading a shim.
 * The shim answers a stubbed plan when node was invoked as orca (argv[1] is a
 * subcommand, not a file) and stands aside when node is running the tool itself.
 * An unstubbed call exits 9 with a stub-miss payload, so an unexpected orca call is
 * a loud failure rather than a silent pass.
 */
const ORCA_SHIM = stage(
  "orca-shim.cjs",
  `const { existsSync } = require("node:fs")
const argv = process.argv.slice(1)
if (argv[0] && existsSync(argv[0])) return
const line = argv.join(" ")
const plan = JSON.parse(process.env.ORBIT_ORCA_STUB || "[]")
const match = plan.find((entry) => line.includes(entry.match))
if (!match) {
  process.stdout.write(JSON.stringify({ ok: false, error: { code: "stub-miss", message: "unstubbed orca call: " + line } }))
  process.exit(9)
}
process.stdout.write(match.stdout)
process.exit(match.exit ?? 0)
`,
)

/** NODE_OPTIONS treats a backslash inside quotes as an escape, so the shim path goes in POSIX form. */
const orcaEnv = (plan) => ({
  ORCA_BIN: process.execPath,
  NODE_OPTIONS: `--require "${ORCA_SHIM.replaceAll("\\", "/")}"`,
  ORBIT_ORCA_STUB: JSON.stringify(plan),
})

const run = (file, argv, options = {}) => {
  const target = options.path ?? join(TOOLS_DIR, file)
  const invocation = file.endsWith(".mjs")
    ? [process.execPath, [target, ...argv]]
    : file.endsWith(".sh")
      ? [BASH, [target, ...argv]]
      : ["pwsh", ["-NoProfile", "-File", target, ...argv]]
  const result = spawnSync(invocation[0], invocation[1], {
    encoding: "utf8",
    cwd: options.cwd ?? REPO_ROOT,
    input: options.input ?? "",
    env: { ...process.env, ...(options.env ?? {}) },
    timeout: 180000,
  })
  return {
    status: result.error ? `spawn error: ${result.error.message}` : result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

const check = (file, name, argv, expect, options = {}) => {
  const result = run(file, argv, options)
  const where = `${file} ${argv.join(" ")}`
  if (expect.status !== undefined && result.status !== expect.status) {
    T(`${file}: ${name}`, false, `${where}\n     exit ${result.status}, expected ${expect.status}\n     ${(result.stderr || result.stdout).trim().split("\n").slice(0, 4).join("\n     ")}`)
    return result
  }
  if (expect.nonZero && (result.status === 0 || typeof result.status !== "number")) {
    T(`${file}: ${name}`, false, `${where}\n     exit ${result.status}, expected non-zero`)
    return result
  }
  for (const [stream, pattern] of [
    ["stdout", expect.stdout],
    ["stderr", expect.stderr],
  ]) {
    if (pattern && !pattern.test(result[stream])) {
      T(`${file}: ${name}`, false, `${where}\n     ${stream} did not match ${pattern}\n     ${result[stream].trim().split("\n").slice(0, 4).join("\n     ")}`)
      return result
    }
  }
  T(`${file}: ${name}`, true)
  return result
}

const orchestratorConfig = (repoPath, worker) =>
  JSON.stringify({
    worker: "claude",
    workers: { claude: worker },
    attemptsBeforeRewrite: 2,
    linear: { team: "ORB", states: { working: "In Progress", review: "In Review", done: "Done" } },
    repos: { ui: repoPath },
  })

const INTERACTIVE_WORKER = { command: "claude", args: ["--permission-mode", "bypassPermissions", "--model", "opus"], interactive: true }

/**
 * Stages a private copy of launch-worker.mjs beside a hand-written
 * .claude/orchestrator.json, because the tool resolves that config from its own
 * location. Returns the copy's path so each config variant is a fresh, isolated run.
 */
const stageLaunchWorker = (label, worker) => {
  const base = join(root, "launch", label)
  const repoPath = join(base, "repos", "ui")
  mkdirSync(repoPath, { recursive: true })
  mkdirSync(join(base, "tools"), { recursive: true })
  mkdirSync(join(base, ".claude"), { recursive: true })
  writeFileSync(join(base, ".claude", "orchestrator.json"), orchestratorConfig(repoPath, worker))
  cpSync(join(TOOLS_DIR, "launch-worker.mjs"), join(base, "tools", "launch-worker.mjs"))
  return { path: join(base, "tools", "launch-worker.mjs"), repoPath, base }
}

const linearIssueStub = (labels) => [
  {
    match: "linear issue ORB-75",
    stdout: JSON.stringify({
      ok: true,
      result: { issue: { identifier: "ORB-75", title: "Prove the harness gate runs", labels: labels.map((name) => ({ name })) } },
    }),
  },
]

const launchWorkerCases = () => {
  const promptFile = stage("prompt.md", "the ticket body verbatim\n")

  const good = stageLaunchWorker("interactive", INTERACTIVE_WORKER)
  check("launch-worker.mjs", "resolves the repo from the repo:* label", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /"repo": "ui"/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })
  check("launch-worker.mjs", "derives the contract branch from the title", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /"branch": "feature\/orb-75-prove-the-harness-gate/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })
  check("launch-worker.mjs", "worker:sonnet swaps the configured opus", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /--model sonnet/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui", "worker:sonnet"])) })
  check("launch-worker.mjs", "refuses a repo:* label with no repos entry", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /no repo path for "zzz"/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:zzz"])) })
  check("launch-worker.mjs", "refuses a ticket with no repo:* label and no --repo", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /carries no repo:\* label/ }, { path: good.path, env: orcaEnv(linearIssueStub([])) })

  const insidePrompt = join(good.repoPath, "prompt.md")
  writeFileSync(insidePrompt, "the ticket body verbatim\n")
  check("launch-worker.mjs", "refuses a prompt file inside a repo", ["--issue", "ORB-75", "--prompt-file", insidePrompt, "--dry-run"], { status: 2, stderr: /would be committed/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const notInteractive = stageLaunchWorker("not-interactive", { ...INTERACTIVE_WORKER, interactive: false })
  check("launch-worker.mjs", "refuses an engine declaring interactive: false", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /does not declare interactive: true/ }, { path: notInteractive.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const omitted = stageLaunchWorker("omits-interactive", { command: "claude", args: ["--model", "opus"] })
  check("launch-worker.mjs", "refuses an engine that omits interactive entirely", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /does not declare interactive: true/ }, { path: omitted.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const headless = stageLaunchWorker("headless-args", { command: "claude", args: ["-p", "--model", "opus"], interactive: true })
  check("launch-worker.mjs", "refuses headless args behind an interactive declaration", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /headless invocation/ }, { path: headless.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  check("launch-worker.mjs", "refuses a missing prompt file", ["--issue", "ORB-75", "--prompt-file", join(root, "absent.md"), "--dry-run"], { status: 2, stderr: /prompt file not found/ }, { path: good.path })
  check("launch-worker.mjs", "refuses a non-Linear issue identifier", ["--issue", "nope", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /Linear identifier/ }, { path: good.path })
}

const TIMEOUT_PAYLOAD = JSON.stringify({ ok: false, error: { code: "timeout", message: "condition not met in time" } })
const BUSY_STUB = [{ match: "terminal wait", stdout: TIMEOUT_PAYLOAD, exit: 1 }]
const BROKEN_STUB = [{ match: "terminal wait", stdout: JSON.stringify({ ok: false, error: { code: "no-such-terminal", message: "unknown handle" } }), exit: 1 }]
const IDLE_STUB = [
  { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: true } } }), exit: 0 },
  { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }), exit: 0 },
]

const nudgeWorkerCases = () => {
  check("nudge-worker.mjs", "rejects multi-line text", ["--terminal", "t1", "--text", "first line\nsecond line"], { status: 2, stderr: /single line/ })
  check("nudge-worker.mjs", "rejects --text together with --prompt-file", ["--terminal", "t1", "--text", "hi", "--prompt-file", stage("nudge-prompt.md", "body\n")], { status: 2, stderr: /alternatives/ })
  check("nudge-worker.mjs", "rejects a non-positive --wait-attempts", ["--terminal", "t1", "--text", "hi", "--wait-attempts", "0"], { status: 2, stderr: /positive integer/ })
  check("nudge-worker.mjs", "refuses to send while the worker is busy", ["--terminal", "t1", "--text", "hi", "--wait-attempts", "1"], { status: 1, stderr: /NOTHING was sent/ }, { env: orcaEnv(BUSY_STUB) })
  check("nudge-worker.mjs", "an orca failure that is not a timeout is a tool error", ["--terminal", "t1", "--text", "hi", "--wait-attempts", "1"], { status: 3, stderr: /unknown handle/ }, { env: orcaEnv(BROKEN_STUB) })
  check("nudge-worker.mjs", "sends once the worker is idle", ["--terminal", "t1", "--text", "hi", "--wait-attempts", "1"], { status: 0, stdout: /"sent": "hi"/ }, { env: orcaEnv(IDLE_STUB) })
  check("nudge-worker.mjs", "--dry-run calls orca not at all", ["--terminal", "t1", "--text", "hi", "--dry-run"], { status: 0, stdout: /"dryRun": true/ }, { env: orcaEnv([]) })
}

const orcaWebPortCases = () => {
  const portFor = (name) => Number(run("orca-web-port.mjs", ["--derive", "--name", name]).stdout.trim())
  const names = Array.from({ length: 256 }, (_, index) => `generated-worktree-${index}`)
  const ports = names.map(portFor)
  T("orca-web-port.mjs: derives the same port for the same name", portFor("recreated-worktree") === portFor("recreated-worktree"))
  T("orca-web-port.mjs: keeps generated ports inside the guarded web window", ports.every((port) => Number.isInteger(port) && port >= 3100 && port < 4100 && port !== 5000 && port !== 5432))

  const fixture = join(root, "orca-web-port")
  const gitFixture = (argv, cwd = fixture) => spawnSync("git", argv, { cwd, encoding: "utf8" })
  mkdirSync(join(fixture, "apps", "web"), { recursive: true })
  gitFixture(["init", "--initial-branch=main"])
  gitFixture(["config", "user.email", "tools@example.test"])
  gitFixture(["config", "user.name", "Orbit tools gate"])
  writeFileSync(join(fixture, "README.md"), "fixture\n")
  gitFixture(["add", "README.md"])
  gitFixture(["commit", "-m", "fixture"])
  gitFixture(["worktree", "add", "-b", "feature/one", "one"])
  gitFixture(["worktree", "add", "-b", "feature/two", "two"])
  const first = join(fixture, "one")
  const second = join(fixture, "two")
  mkdirSync(join(first, "apps", "web"), { recursive: true })
  mkdirSync(join(second, "apps", "web"), { recursive: true })
  writeFileSync(join(first, "apps", "web", ".env.local"), "API_BASE=http://example.test\n")
  check("orca-web-port.mjs", "a linked worktree without setup refuses to guess", [], { status: 1, stderr: /no assigned port/ }, { cwd: first })
  check("orca-web-port.mjs", "setup assigns the first linked worktree", ["--setup"], { status: 0, stdout: /^3\d{3}/ }, { cwd: first })
  check("orca-web-port.mjs", "setup assigns a different linked worktree", ["--setup"], { status: 0, stdout: /^3\d{3}/ }, { cwd: second })
  const firstPort = Number(run("orca-web-port.mjs", [], { cwd: first }).stdout.trim())
  const secondPort = Number(run("orca-web-port.mjs", [], { cwd: second }).stdout.trim())
  T("orca-web-port.mjs: linked worktrees report their own distinct assignments", firstPort !== secondPort && firstPort >= 3100 && secondPort >= 3100)
  T("orca-web-port.mjs: setup does not clobber an existing local environment file", readFileSync(join(first, "apps", "web", ".env.local"), "utf8") === "API_BASE=http://example.test\n")

  const primaryCheckout = spawnSync("git", ["worktree", "list", "--porcelain"], { cwd: REPO_ROOT, encoding: "utf8" }).stdout
    ?.split(/\r?\n/)
    .find((line) => line.startsWith("worktree "))
    ?.slice("worktree ".length)
  if (primaryCheckout) check("orca-web-port.mjs", "the primary checkout keeps the default port", [], { status: 0, stdout: /^3000\s*$/ }, { cwd: primaryCheckout })
  else T("orca-web-port.mjs: the primary checkout keeps the default port", false, "could not resolve the primary checkout")
}

// ORB-1 <- ORB-2 <- ORB-3 is a three-link chain, so ORB-1's reach is 2 only if
// the count is transitive. ORB-4 is unblocked but at the strike limit: it lands
// in wave 1, is excluded from `launchable` by design, and must still surface in
// `twoStrikes` (PR #613 review, D9).
const WAVE_STUB = [
  {
    match: "linear list-issues",
    stdout: JSON.stringify({ ok: true, result: { issues: [{ identifier: "ORB-1" }, { identifier: "ORB-2" }, { identifier: "ORB-3" }, { identifier: "ORB-4" }] } }),
  },
  {
    match: "linear issue ORB-1",
    stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-1", title: "first", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [] } }),
  },
  {
    match: "linear issue ORB-2",
    stdout: JSON.stringify({
      ok: true,
      result: { issue: { identifier: "ORB-2", title: "second", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-1" } }] },
    }),
  },
  {
    match: "linear issue ORB-3",
    stdout: JSON.stringify({
      ok: true,
      result: { issue: { identifier: "ORB-3", title: "third", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-2" } }] },
    }),
  },
  {
    match: "linear issue ORB-4",
    stdout: JSON.stringify({
      ok: true,
      result: { issue: { identifier: "ORB-4", title: "fourth", state: { name: "Todo", type: "unstarted" }, labels: [{ name: "attempts:2" }] }, relations: [] },
    }),
  },
]

// new-ticket.mjs shells out to check-ticket.mjs, which makes its OWN orca call,
// so both legs are stubbed in one plan: `linear create` for the creation and
// `linear issue` for the validation the wrapper exists to perform. The shim
// stands aside for a real file path, so the nested node invocation still runs
// the real check-ticket.
const VALID_TICKET_BODY = [
  "## Problem / why it matters",
  "The gate has no coverage for its own create and validate round trip.",
  "## Scope",
  "Add the coverage.",
  "## Out of scope",
  "Anything else.",
  "## Expected behaviour",
  "The round trip executes under CI.",
  "## Technical details",
  "Stub both orca legs.",
  "## Affected modules / files",
  "tools/test-tools.mjs",
  "## Acceptance criteria",
  "- the created identifier is the one validated",
  "- a defective ticket exits 1",
  "## Test scenarios",
  "- run the gate",
].join("\n\n")

const newTicketStub = (created, issue, options = {}) => [
  { match: "linear create", stdout: JSON.stringify(created), exit: options.createExit ?? 0 },
  { match: "linear issue", stdout: JSON.stringify({ ok: true, result: { issue, relations: [] } }) },
]
const CREATED_OK = { ok: true, result: { issue: { identifier: "ORB-99" } } }
const VALID_ISSUE = { identifier: "ORB-99", title: "Cover the create and validate round trip", description: VALID_TICKET_BODY, labels: [{ name: "repo:api" }] }

const gateCases = {
  "new-ticket.mjs": () => {
    const argv = ["--title", "Cover the create and validate round trip", "--project", "Backlog"]
    check("new-ticket.mjs", "validates the identifier orca reported", argv, { status: 0, stdout: /ticket ok/ }, { env: orcaEnv(newTicketStub(CREATED_OK, VALID_ISSUE)) })
    check(
      "new-ticket.mjs",
      "a created but defective ticket exits 1 naming it",
      argv,
      { status: 1, stderr: /ORB-99 was CREATED but is DEFECTIVE/ },
      { env: orcaEnv(newTicketStub(CREATED_OK, { ...VALID_ISSUE, description: "nothing" })) },
    )
    check(
      "new-ticket.mjs",
      "an orca failure creates nothing and exits 3",
      argv,
      { status: 3, stderr: /orca linear create failed/ },
      { env: orcaEnv(newTicketStub({ ok: false, error: { message: "no such project" } }, VALID_ISSUE, { createExit: 1 })) },
    )
    check(
      "new-ticket.mjs",
      "success with no identifier is a tool error, never a silent pass",
      argv,
      { status: 3, stderr: /no issue identifier/ },
      { env: orcaEnv(newTicketStub({ ok: true, result: {} }, VALID_ISSUE)) },
    )
    check("new-ticket.mjs", "requires --project so the ticket cannot be orphaned", ["--title", "Cover the create and validate round trip"], { status: 2, stderr: /--project is required/ })
  },
  "launch-worker.mjs": launchWorkerCases,
  "nudge-worker.mjs": nudgeWorkerCases,
  "orca-web-port.mjs": orcaWebPortCases,
  "worker-status.mjs": () => {
    check("worker-status.mjs", "requires --worktree", ["--issue", "ORB-75"], { status: 2, stderr: /--worktree is required/ })
    check("worker-status.mjs", "requires a Linear issue identifier", ["--worktree", root, "--issue", "nope"], { status: 2, stderr: /Linear identifier/ })
  },
  "wave-plan.mjs": () => {
    check("wave-plan.mjs", "orders a blockedBy pair into two waves", ["--project", "Redesign", "--json"], { status: 0, stdout: /"wave": 2[\s\S]*ORB-2/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "wave 1 is the unblocked ticket", ["--project", "Redesign", "--json"], { status: 0, stdout: /"launchable": \[\s*"ORB-1"\s*\]/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "reach counts the whole downstream chain, not just direct blockers", ["--project", "Redesign", "--json"], { status: 0, stdout: /"identifier": "ORB-1"[\s\S]*?"reach": 2/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "a wave-1 ticket at the strike limit is reported, not dropped", ["--project", "Redesign", "--json"], { status: 0, stdout: /"twoStrikes": \[\s*"ORB-4"\s*\]/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "text mode marks the same strike-limit ticket", ["--project", "Redesign"], { status: 0, stdout: /ORB-4[\s\S]*?TWO STRIKES/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "an empty project is nothing to plan", ["--project", "Empty"], { status: 1, stderr: /nothing to plan/ }, { env: orcaEnv([{ match: "linear list-issues", stdout: JSON.stringify({ ok: true, result: { issues: [] } }) }]) })
  },
  "check-dashes.mjs": () => {
    check("check-dashes.mjs", "an em dash in text is rejected", ["--text", `a${EM_DASH}b`], { status: 1, stderr: /Banned dash/ })
    check("check-dashes.mjs", "clean text passes", ["--text", "a plain hyphen - is fine"], { status: 0 })
  },
  "check-ticket.mjs": () => {
    check("check-ticket.mjs", "an incomplete body is rejected", ["--file", stage("ticket.md", "# A ticket\n\nno template sections here\n")], { nonZero: true })
    check("check-ticket.mjs", "a missing body file is a usage error", ["--file", join(root, "absent.md")], { status: 2 })
  },
  "check-push-target.mjs": () => {
    check("check-push-target.mjs", "a push to main is blocked", [], { status: 1, stderr: /BLOCKED/ }, { input: "refs/heads/main abc refs/heads/main def\n" })
    check("check-push-target.mjs", "a push to a feature branch is allowed", [], { status: 0 }, { input: "refs/heads/feature/x abc refs/heads/feature/x def\n" })
  },
  "check-frontmatter.mjs": () => {
    check("check-frontmatter.mjs", "runs from any cwd", [], { status: 0, stdout: /frontmatter ok/ }, { cwd: root })
  },
}

/** argv that must be refused before the tool does any work. */
const INVALID_INPUT = {
  "agent-review.ps1": { argv: ["--orbit-not-a-flag"], status: 1 },
  "agent-review.sh": { argv: ["--orbit-not-a-flag"], status: 1 },
  "arch-map.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "capture-surfaces.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-copy.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-dashes.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-frontmatter.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-push-target.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-suppressions-ratchet.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-ticket.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "launch-worker.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "merge-sweep-cov.sh": { argv: ["--orbit-not-a-flag", "zzz"], status: 2 },
  "merge-sweep.sh": { argv: ["--orbit-not-a-flag", "zzz"], status: 2 },
  "new-ticket.mjs": { argv: [], status: 2 },
  "nudge-worker.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "orca-web-port.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "redesign-coverage.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "rollup.sh": { argv: ["--orbit-not-a-flag"], status: 2 },
  "surface-manifest.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "wave-plan.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "worker-status.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
}

console.log("# structural coverage")
const scripts = readdirSync(TOOLS_DIR)
  .filter((file) => /\.(mjs|sh|ps1)$/.test(file) && file !== SELF)
  .sort()
const uncovered = scripts.filter((file) => !INVALID_INPUT[file])
T(
  `every tools/ script has coverage (${scripts.length} scripts)`,
  uncovered.length === 0,
  `no COVERAGE entry for: ${uncovered.join(", ")}\n     Add one to INVALID_INPUT (and a gateCases entry if it has decision paths) in tools/${SELF}.`,
)
T("the coverage guard actually enumerated scripts", scripts.length > 0, "tools/ resolved to zero scripts, so this gate proved nothing")
const pending = Object.keys(INVALID_INPUT).filter((file) => !scripts.includes(file))
for (const file of pending) console.log(`PENDING ${file} (covered here, not present on this branch)`)

console.log("\n# universal contract (tools/CONVENTIONS.md)")
T("a real bash is resolvable", Boolean(BASH) || !scripts.some((file) => file.endsWith(".sh")), "no working bash found; set ORBIT_BASH to one (the PATH bash on Windows is the WSL stub)")
for (const file of scripts) {
  if (file.endsWith(".sh") && !BASH) continue
  check(file, "--help exits 0 with usage on stdout", ["--help"], { status: 0, stdout: /usage|Usage/ })
  const invalid = INVALID_INPUT[file]
  if (invalid) check(file, "invalid input is refused", invalid.argv, { status: invalid.status })
}

console.log("\n# decision paths")
for (const [file, cases] of Object.entries(gateCases)) {
  if (!existsSync(join(TOOLS_DIR, file))) continue
  cases()
}

console.log(`\n${fails === 0 ? "ORBIT TOOLS GATE OK" : `ORBIT TOOLS GATE FAILED (${fails})`}`)
process.exit(fails === 0 ? 0 : 1)
