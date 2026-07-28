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
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"
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
 *
 * A `sequence` entry answers successive calls differently, which is the only way to
 * drive a retry loop: launch-worker.mjs re-sends a prompt pointer that did not land,
 * so "delivered on the second send" needs the second `terminal read` to differ from
 * the first. The counter cannot live in memory (every stub call is its own process),
 * so it is derived from the call log, which is why `sequence` requires ORBIT_ORCA_LOG.
 */
const ORCA_SHIM = stage(
  "orca-shim.cjs",
  `const { spawnSync } = require("node:child_process")
const { appendFileSync, existsSync, readFileSync, rmSync } = require("node:fs")
const argv = process.argv.slice(1)
if (argv[0] && existsSync(argv[0])) return
const line = argv.join(" ")
const plan = JSON.parse(process.env.ORBIT_ORCA_STUB || "[]")
const match = plan.find((entry) => line.includes(entry.match))
if (!match) {
  process.stdout.write(JSON.stringify({ ok: false, error: { code: "stub-miss", message: "unstubbed orca call: " + line } }))
  process.exit(9)
}
if (match.delayMs) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, match.delayMs)
if (match.removePath) rmSync(match.removePath, { recursive: true, force: true })
if (match.pruneRepo) spawnSync("git", ["-C", match.pruneRepo, "worktree", "prune"])
let out = match.stdout
let exit = match.exit ?? 0
if (Array.isArray(match.sequence)) {
  const log = process.env.ORBIT_ORCA_LOG
  const previous = log && existsSync(log)
    ? readFileSync(log, "utf8").split("\\n").filter(Boolean).filter((entry) => JSON.parse(entry).join(" ").includes(match.match)).length
    : 0
  const selected = match.sequence[Math.min(previous, match.sequence.length - 1)]
  out = typeof selected === "string" ? selected : selected.stdout
  if (typeof selected !== "string") exit = selected.exit ?? exit
}
if (process.env.ORBIT_ORCA_LOG) appendFileSync(process.env.ORBIT_ORCA_LOG, JSON.stringify(argv) + "\\n")
process.stdout.write(out.replaceAll("__NOW__", String(Date.now())))
process.exit(exit)
`,
)

/**
 * NODE_OPTIONS treats a backslash inside quotes as an escape, so the shim path goes in POSIX form.
 * The same shim answers `gh`, because it keys on the command line and nothing else: pr-watch.mjs
 * shells out to `gh api graphql`, and a stub plan entry matching `number=615` answers it.
 */
const orcaEnv = (plan) => ({
  ORCA_BIN: process.execPath,
  GH_BIN: process.execPath,
  NODE_OPTIONS: `--require "${ORCA_SHIM.replaceAll("\\", "/")}"`,
  ORBIT_ORCA_STUB: JSON.stringify(plan),
})

const MERGE_SWEEP_GH_DIR = join(root, "merge-sweep-bin")
const MERGE_SWEEP_GH = stage(
  "merge-sweep-bin/gh",
  `#!/usr/bin/env node
const { appendFileSync, existsSync, writeFileSync } = require("node:fs")
const argv = process.argv.slice(2)
const line = argv.join(" ")
appendFileSync(process.env.ORBIT_MERGE_SWEEP_LOG, JSON.stringify(argv) + "\\n")
if (line.includes("/actions/workflows")) process.exit(0)
if (argv[0] === "pr" && argv[1] === "update-branch") process.exit(0)
if (argv[0] === "pr" && argv[1] === "view") {
  if (line.includes("--json headRefOid")) {
    const moved = process.env.ORBIT_MERGE_SWEEP_MOVE_MARKER && existsSync(process.env.ORBIT_MERGE_SWEEP_MOVE_MARKER)
    process.stdout.write(moved ? process.env.ORBIT_MERGE_SWEEP_CHANGED_HEAD : process.env.ORBIT_MERGE_SWEEP_HEAD)
  } else if (line.includes("headRefName")) {
    process.stdout.write(process.env.ORBIT_MERGE_SWEEP_BRANCH)
  } else {
    const checks = [{ name: "review", status: "COMPLETED", conclusion: "SUCCESS" }]
    if (process.env.ORBIT_MERGE_SWEEP_SONAR === "success") {
      checks.push({ name: "SonarCloud Code Analysis", status: "COMPLETED", conclusion: "SUCCESS" })
    }
    if (process.env.ORBIT_MERGE_SWEEP_SONAR === "coverage-failure") {
      checks.push({ name: "SonarCloud Code Analysis", status: "COMPLETED", conclusion: "FAILURE" })
    }
    process.stdout.write(JSON.stringify({
      mergeStateStatus: process.env.ORBIT_MERGE_SWEEP_STATE,
      reviewDecision: "APPROVED",
      statusCheckRollup: checks,
      headRefOid: process.env.ORBIT_MERGE_SWEEP_HEAD,
    }))
  }
  process.exit(0)
}
if (argv[0] === "pr" && argv[1] === "merge") {
  if (process.env.ORBIT_MERGE_SWEEP_MOVE_MARKER) {
    writeFileSync(process.env.ORBIT_MERGE_SWEEP_MOVE_MARKER, "")
    process.exit(1)
  }
  process.exit(0)
}
if (line.includes("/check-runs")) {
  process.stdout.write("Coverage on New Code is below the required threshold")
  process.exit(0)
}
if (argv[0] === "api" && argv[1] === "graphql") process.exit(0)
process.stderr.write("unstubbed gh call: " + line)
process.exit(9)
`,
)
chmodSync(MERGE_SWEEP_GH, 0o755)

const mergeSweepEnv = ({ changedHead = "", head, moveAtMerge = false, sonar = "success", state = "CLEAN", log }) => ({
  PATH: `${MERGE_SWEEP_GH_DIR}${delimiter}${process.env.PATH}`,
  ORBIT_MERGE_SWEEP_BRANCH: "feature/orb-106",
  ORBIT_MERGE_SWEEP_CHANGED_HEAD: changedHead,
  ORBIT_MERGE_SWEEP_HEAD: head,
  ORBIT_MERGE_SWEEP_LOG: log,
  ORBIT_MERGE_SWEEP_MOVE_MARKER: moveAtMerge ? `${log}.moved` : "",
  ORBIT_MERGE_SWEEP_SONAR: sonar,
  ORBIT_MERGE_SWEEP_STATE: state,
})

const mergeSweepCalls = (log) =>
  existsSync(log)
    ? readFileSync(log, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : []

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

const orchestratorConfig = (repoPath, worker, engineName) =>
  JSON.stringify({
    worker: engineName,
    workers: { [engineName]: worker },
    attemptsBeforeRewrite: 2,
    linear: { team: "ORB", states: { working: "In Progress", review: "In Review", done: "Done" } },
    repos: { ui: repoPath },
  })

const INTERACTIVE_WORKER = { command: "claude", args: ["--permission-mode", "bypassPermissions", "--model", "opus"], interactive: true }
const INTERACTIVE_CODEX = { command: "codex", args: ["-c", 'windows.sandbox="unelevated"', "--dangerously-bypass-approvals-and-sandbox"], interactive: true }

/**
 * Stages a private copy of launch-worker.mjs beside a hand-written
 * .claude/orchestrator.json, because the tool resolves that config from its own
 * location. Returns the copy's path so each config variant is a fresh, isolated run.
 * The engine name is what the top-level `worker` key selects, which is the only way to
 * exercise a non-default engine: the tool has no engine-override flag by design.
 */
const stageLaunchWorker = (label, worker, engineName = "claude") => {
  const base = join(root, "launch", label)
  const repoPath = join(base, "repos", "ui")
  mkdirSync(repoPath, { recursive: true })
  mkdirSync(join(base, "tools"), { recursive: true })
  mkdirSync(join(base, ".claude"), { recursive: true })
  writeFileSync(join(base, ".claude", "orchestrator.json"), orchestratorConfig(repoPath, worker, engineName))
  cpSync(join(TOOLS_DIR, "launch-worker.mjs"), join(base, "tools", "launch-worker.mjs"))
  /** The copy imports tools/lib/tui-repaint.mjs by relative path, so the staged tree carries it too. */
  cpSync(join(TOOLS_DIR, "lib"), join(base, "tools", "lib"), { recursive: true })
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

/**
 * Kept in step with tools/launch-worker.mjs's WORKER_CONTRACT. Each entry is a clause a worker
 * broke in practice, so deleting one from the launcher must fail this gate rather than quietly
 * shipping a worker that stalls on a question or babysits someone else's PR.
 */
const WORKER_CONTRACT_MARKER = "## Standing worker contract (injected by tools/launch-worker.mjs)"
const REQUIRED_CONTRACT_CLAUSES = {
  "asking a question": /Never ask a question/,
  "dropping a blocked criterion": /A blocked sub-step never blocks the PR/,
  "watching its own PR or another ticket": /Never poll your own PR's CI[\s\S]*never watch another ticket/,
  "arming a monitor that outlives the contract": /Never arm a background monitor/,
  "resolving a watch-and-stop conflict by doing both": /STOP wins/,
  "merging or pushing to main": /Never merge any PR, never push to/,
  "blanket staging that sweeps in a sibling's artifacts": /Stage explicitly[\s\S]*git add -A/,
  "pushing a commit it has not read back": /Verify before pushing[\s\S]*git show --stat HEAD/,
  "writing into another worker's worktree": /Never write into another worktree/,
  "delegating independent slices while keeping conflicts and PR evidence inline": /Delegate independent slices[\s\S]*SAME file[\s\S]*final gate run[\s\S]*review round/,
}

/**
 * The trust screen as each CLI really paints it, verbatim, because the launcher matches this
 * text and nothing else once the wait comes back without a blockedReason. A regex that drifts
 * one character from these strings hangs a worker forever with nobody at the keyboard, which is
 * exactly what shipped: the claude alternation read "createdoron" against a real
 * "createdorone" and could never match. Review caught it; this is the coverage that should have.
 */
const TRUST_SCREENS = {
  claude: {
    engine: { command: "claude", args: ["--permission-mode", "bypassPermissions"], interactive: true },
    answer: "1",
    /**
     * ONE screen per alternative the profile claims to recognise, each phrased so that only
     * that alternative can match. A single fixture carrying the whole real screen is NOT
     * coverage: the first version of this case included "Yes, I trust this folder" alongside
     * the question, so the `trustthisfolder` alternative matched and the case stayed green with
     * the shipped `createdoron` typo still in place. Verified by reintroducing that typo.
     */
    screens: [
      { label: "the created-or-trust wording", tail: "Quick safety check\nIs this a project you created or one you trust?\n 1. Yes, proceed\n 2. No, exit" },
      { label: "the trust-the-files wording", tail: "Do you trust the files in this directory?\n 1. Yes, proceed\n 2. No, exit" },
      { label: "the trust-this-folder wording", tail: "Quick safety check\n 1. Yes, I trust this folder\n 2. No, exit" },
    ],
  },
  codex: {
    engine: { command: "codex", args: ["--dangerously-bypass-approvals-and-sandbox"], interactive: true },
    answer: "",
    screens: [{ label: "the trust-the-contents wording", tail: "You are in C:\\wt\nDoyoutrustthecontentsofthisdirectory?\n> 1. Yes, continue2.No,quitPress enter to continue" }],
  },
}

/**
 * A real launch needs a real checkout to `git switch -c` into, since git is not stubbed here.
 * Everything else the launch touches is orca, which is.
 */
const stageCheckout = (base) => {
  const path = join(base, "checkout")
  mkdirSync(path, { recursive: true })
  for (const argv of [["init", "-q"], ["config", "user.email", "gate@orbit.test"], ["config", "user.name", "Orbit Gate"], ["commit", "-q", "--allow-empty", "-m", "base"]]) {
    const result = spawnSync("git", ["-C", path, ...argv], { encoding: "utf8" })
    if (result.status !== 0) return null
  }
  return path
}

/**
 * Drives the launcher down the UNPROTECTED trust path: the wait reports not-idle with NO
 * blockedReason, so the screen text is the only signal left. Returns the orca calls the launch
 * made, so the assertion is on what was actually sent to the terminal.
 */
const runTrustScreen = (label, engineName, tail) => {
  const { engine, answer } = TRUST_SCREENS[engineName]
  const staged = stageLaunchWorker(label, engine, engineName)
  const checkout = stageCheckout(staged.base)
  if (!checkout) return null
  const log = join(staged.base, "orca-calls.log")
  const promptFile = stage(`${label}-prompt.md`, "the ticket body verbatim\n")
  const plan = [
    ...linearIssueStub(["repo:ui"]),
    { match: "worktree create", stdout: JSON.stringify({ ok: true, result: { worktree: { path: checkout, branch: "refs/heads/thomasluizon/orb-75" } } }) },
    { match: "terminal create", stdout: JSON.stringify({ ok: true, result: { terminal: { handle: "t1" } } }) },
    { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: false } } }) },
    { match: "terminal read", stdout: JSON.stringify({ ok: true, result: { terminal: { tail: [tail] } } }) },
    { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree rm", stdout: JSON.stringify({ ok: true, result: {} }) },
  ]
  const result = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], { path: staged.path, env: { ...orcaEnv(plan), ORBIT_ORCA_LOG: log } })
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []
  return { calls, answer, result }
}

const trustScreenCases = () => {
  for (const [engineName, { screens }] of Object.entries(TRUST_SCREENS)) {
    screens.forEach(({ label, tail }, index) => {
      const name = `launch-worker.mjs: answers ${engineName}'s trust screen on ${label}, from the terminal text alone`
      const outcome = runTrustScreen(`trust-${engineName}-${index}`, engineName, tail)
      if (!outcome) {
        T(name, false, "could not stage a git checkout for the launch; git is required for this case")
        return
      }
      /** node resolves the shim's argv[0] to an absolute path, so the subcommand is its basename. */
      const send = outcome.calls.find((argv) => argv[0].split(/[\\/]/).pop() === "terminal" && argv[1] === "send")
      const sent = send ? send[send.indexOf("--text") + 1] : null
      T(
        name,
        Boolean(send) && sent === outcome.answer && send.includes("--enter"),
        `with no blockedReason the screen text is the ONLY signal, so this is the path a drifted regex breaks.\n     expected a terminal send of ${JSON.stringify(outcome.answer)} + Enter, got ${send ? JSON.stringify(send) : "no terminal send at all"}\n     launcher stderr: ${(outcome.result.stderr || "").trim().split("\n").slice(0, 5).join("\n     ")}`,
      )
    })
  }
}

/**
 * The empty composer a swallowed pointer leaves behind, verbatim from the 2026-07-27 ORB-88
 * launch: the worker alive, idle, holding no work, with orca having reported the send accepted.
 */
const EMPTY_COMPOSER = ' (logo)   Claude Code v2.1.220\n> Try "how do I log an error?"\n  Opus 5@high  ctx [..........] --%'

/**
 * Drives a launch to the prompt pointer, with `terminal read` answering `tails` in order:
 * "delivered" is a tail carrying the pointer as a user line, anything else is a tail without it.
 * Returns the orca calls, because the assertion that matters is how many sends really happened.
 */
const runPointerLaunch = (label, tails, { repainting = false } = {}) => {
  const staged = stageLaunchWorker(label, INTERACTIVE_WORKER)
  const checkout = stageCheckout(staged.base)
  if (!checkout) return null
  const log = join(staged.base, "orca-calls.log")
  const promptFile = stage(`${label}-prompt.md`, "the ticket body verbatim\n")
  const painted = `> Read ${promptFile} and execute it in full. That file is your complete work order for ORB-75:`
  const plan = [
    ...linearIssueStub(["repo:ui"]),
    { match: "worktree create", stdout: JSON.stringify({ ok: true, result: { worktree: { path: checkout, branch: "refs/heads/thomasluizon/orb-75" } } }) },
    { match: "terminal create", stdout: JSON.stringify({ ok: true, result: { terminal: { handle: "t1" } } }) },
    { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: true } } }) },
    /**
     * Frozen lastOutputAt is a settled TUI, so the launch sends instead of waiting out a repaint.
     *
     * `repainting` has to be a SEQUENCE, not a fresh stamp on every call: the tui-idle wait
     * before the pointer uses the same repaint check, so a terminal that paints from the first
     * call never gets past it and the pointer branch stays unreached. Measured: the first version
     * of this stub died at "never reached tui-idle after 6 waits". The first two calls are the
     * idle wait's own before/after pair and must be equal; every call after them is stamped
     * fresh, which is a TUI that starts painting once the pointer has been sent.
     */
    repainting
      ? {
          match: "terminal show",
          sequence: [
            JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }),
            JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }),
            '{"ok":true,"result":{"terminal":{"lastOutputAt":__NOW__}}}',
          ],
        }
      : { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }) },
    {
      match: "terminal read",
      sequence: tails.map((tail) => JSON.stringify({ ok: true, result: { terminal: { tail: [tail === "delivered" ? painted : tail] } } })),
    },
    { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal switch", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree set", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree rm", stdout: JSON.stringify({ ok: true, result: {} }) },
  ]
  const result = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: staged.path,
    env: { ...orcaEnv(plan), ORBIT_ORCA_LOG: log },
  })
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []
  const sends = calls.filter((argv) => argv[0].split(/[\\/]/).pop() === "terminal" && argv[1] === "send").length
  return { result, calls, sends }
}

/**
 * The ORB-88 defect: `terminal send` succeeded, the launcher exited 0 printing a full plan, and
 * the pointer never became a user turn. An exit code may not assert a state it never verified,
 * so these three cases pin the read-back: it lands, it lands on a retry, it never lands.
 */
const pointerDeliveryCases = () => {
  const first = runPointerLaunch("pointer-first", ["delivered"])
  if (!first) {
    T("launch-worker.mjs: a delivered pointer exits 0", false, "could not stage a git checkout for the launch; git is required for this case")
    return
  }
  T(
    "launch-worker.mjs: a pointer that lands on the first send exits 0 with the plan unchanged",
    first.result.status === 0 && /"pointerSends": 1/.test(first.result.stdout) && /"terminal": "t1"/.test(first.result.stdout) && /"branch": "feature\/orb-75-/.test(first.result.stdout),
    `exit ${first.result.status}, ${first.sends} send(s)\n     stdout: ${first.result.stdout.trim().slice(0, 300)}\n     stderr: ${first.result.stderr.trim().split("\n").slice(-3).join("\n     ")}`,
  )
  T("launch-worker.mjs: a pointer that lands is sent exactly once", first.sends === 1, `sent ${first.sends} time(s)`)

  const second = runPointerLaunch("pointer-second", [EMPTY_COMPOSER, "delivered"])
  T(
    "launch-worker.mjs: a pointer the composer swallowed is re-sent, and the plan reports how many sends it took",
    second.result.status === 0 && /"pointerSends": 2/.test(second.result.stdout) && second.sends === 2,
    `exit ${second.result.status}, ${second.sends} send(s)\n     stdout: ${second.result.stdout.trim().slice(0, 300)}\n     stderr: ${second.result.stderr.trim().split("\n").slice(-3).join("\n     ")}`,
  )

  const never = runPointerLaunch("pointer-never", [EMPTY_COMPOSER])
  T(
    "launch-worker.mjs: a pointer that never becomes a user turn is a launch FAILURE, not a success",
    never.result.status === 1 && /never showed the prompt pointer/.test(never.result.stderr),
    `exit ${never.result.status}, expected 1\n     stderr: ${never.result.stderr.trim().split("\n").slice(-4).join("\n     ")}`,
  )
  T("launch-worker.mjs: the undelivered launch is bounded, not retried forever", never.sends === 3, `sent ${never.sends} time(s), expected the 3-send bound`)

  /**
   * The branch every other case misses, because they all freeze lastOutputAt: a TUI that keeps
   * repainting past the settle window. The first shape of this loop settled ONCE and then fell
   * through to another send, which queues into a running turn and cuts it short (ORB-75). The
   * assertion is the send COUNT: one send, then settle, then give up. Never a second send.
   */
  const busyThroughout = runPointerLaunch("pointer-busy", [EMPTY_COMPOSER], { repainting: true })
  T(
    "launch-worker.mjs: a TUI that keeps painting is never sent to a second time",
    busyThroughout.sends === 1,
    `sent ${busyThroughout.sends} time(s); a re-send into a repainting TUI is the ORB-75 corruption\n     stderr: ${busyThroughout.result.stderr.trim().split("\n").slice(-4).join("\n     ")}`,
  )
  T(
    "launch-worker.mjs: a TUI that never goes quiet is a launch failure naming that cause",
    busyThroughout.result.status === 1 && /never went quiet/.test(busyThroughout.result.stderr),
    `exit ${busyThroughout.result.status}\n     stderr: ${busyThroughout.result.stderr.trim().split("\n").slice(-4).join("\n     ")}`,
  )
  T(
    "launch-worker.mjs: the undelivered launch leaves no orphaned worktree",
    never.calls.some((argv) => argv[0].split(/[\\/]/).pop() === "worktree" && argv[1] === "rm"),
    `no worktree rm in: ${never.calls.map((argv) => argv.slice(0, 2).join(" ")).join(" | ")}`,
  )
}

const runTerminalCreateLaunch = (label, terminalCreateSequence) => {
  const staged = stageLaunchWorker(label, INTERACTIVE_WORKER)
  const checkout = join(staged.base, "checkout")
  const git = (args) => spawnSync("git", ["-C", staged.repoPath, ...args], { encoding: "utf8" })
  for (const args of [
    ["init", "-q", "--initial-branch=main"],
    ["config", "user.email", "gate@orbit.test"],
    ["config", "user.name", "Orbit Gate"],
    ["commit", "-q", "--allow-empty", "-m", "base"],
    ["worktree", "add", "-q", "-b", "thomasluizon/orb-75", checkout],
  ]) {
    if (git(args).status !== 0) return null
  }

  const log = join(staged.base, "orca-calls.log")
  const promptFile = stage(`${label}-prompt.md`, "the ticket body verbatim\n")
  const painted = `> Read ${promptFile} and execute it in full. That file is your complete work order for ORB-75:`
  const plan = [
    ...linearIssueStub(["repo:ui"]),
    { match: "worktree create", stdout: JSON.stringify({ ok: true, result: { worktree: { path: checkout, branch: "refs/heads/thomasluizon/orb-75" } } }) },
    { match: "terminal create", sequence: terminalCreateSequence },
    { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: true } } }) },
    { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }) },
    { match: "terminal read", stdout: JSON.stringify({ ok: true, result: { terminal: { tail: [painted] } } }) },
    { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal switch", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree set", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree rm", stdout: JSON.stringify({ ok: true, result: {} }), removePath: checkout, pruneRepo: staged.repoPath },
  ]
  const result = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: staged.path,
    env: { ...orcaEnv(plan), ORBIT_ORCA_LOG: log },
  })
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []
  const count = (first, second) => calls.filter((argv) => argv[0].split(/[\\/]/).pop() === first && argv[1] === second).length
  const branches = git(["branch", "--list", "feature/orb-75-prove-the-harness-gate", "thomasluizon/orb-75"]).stdout.trim()
  return { result, terminalCreates: count("terminal", "create"), worktreeCreates: count("worktree", "create"), checkout, branches }
}

const terminalCreateRetryCases = () => {
  const timeout = { stdout: JSON.stringify({ ok: false, error: { code: "timeout", message: "Terminal creation timed out" } }), exit: 1 }
  const success = { stdout: JSON.stringify({ ok: true, result: { terminal: { handle: "t1" } } }), exit: 0 }
  const recovered = runTerminalCreateLaunch("terminal-create-recovers", [timeout, success])
  if (!recovered) {
    T("launch-worker.mjs: terminal create retries can be staged", false, "could not stage a linked git worktree")
    return
  }
  T(
    "launch-worker.mjs: a terminal create timeout retries inside the same worktree and then succeeds",
    recovered.result.status === 0 && recovered.terminalCreates === 2 && recovered.worktreeCreates === 1 && /"terminal": "t1"/.test(recovered.result.stdout),
    `exit ${recovered.result.status}, terminal creates ${recovered.terminalCreates}, worktree creates ${recovered.worktreeCreates}\n     ${recovered.result.stderr.trim().split("\n").slice(-5).join("\n     ")}`,
  )

  const exhausted = runTerminalCreateLaunch("terminal-create-exhausted", [timeout, timeout, timeout])
  T(
    "launch-worker.mjs: terminal create timeout retries are bounded and preserve the timeout cause",
    exhausted.result.status === 3 && exhausted.terminalCreates === 3 && /failed after 3 attempts: Terminal creation timed out/.test(exhausted.result.stderr),
    `exit ${exhausted.result.status}, terminal creates ${exhausted.terminalCreates}\n     ${exhausted.result.stderr.trim().split("\n").slice(-6).join("\n     ")}`,
  )
  T(
    "launch-worker.mjs: exhausting terminal create retries rolls back the one worktree and both branches",
    exhausted.worktreeCreates === 1 && !existsSync(exhausted.checkout) && exhausted.branches === "",
    `worktree creates ${exhausted.worktreeCreates}, checkout exists ${existsSync(exhausted.checkout)}, branches ${JSON.stringify(exhausted.branches)}`,
  )
}

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

  const headlessCommand = stageLaunchWorker("headless-command", { command: "claude --print", args: [], interactive: true })
  check("launch-worker.mjs", "refuses a headless token hidden in the command field", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /headless invocation/ }, { path: headlessCommand.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  // Headless is a property of the CLI, not of the harness: codex's -p is --profile, an
  // interactive flag, while claude's -p is --print. One shared token list cannot tell them
  // apart, so these five cases pin both halves of the per-engine split.
  const codex = stageLaunchWorker("codex-interactive", INTERACTIVE_CODEX, "codex")
  const codexPlan = check("launch-worker.mjs", "an interactive codex entry launches", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /"engine": "codex"/ }, { path: codex.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })
  T(
    "launch-worker.mjs: the codex plan's command carries no headless token",
    codexPlan.status === 0 && !/(^|\s)(-p|--print|exec|e)(\s|"|$)/.test(JSON.parse(codexPlan.stdout).command),
    `command was: ${codexPlan.stdout.trim().slice(0, 200)}`,
  )

  const codexProfile = stageLaunchWorker("codex-profile", { ...INTERACTIVE_CODEX, args: ["-p", "my-profile"] }, "codex")
  check("launch-worker.mjs", "accepts codex -p, which is --profile and not --print", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /codex -p my-profile/ }, { path: codexProfile.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const codexExec = stageLaunchWorker("codex-exec", { command: "codex", args: ["exec", "--full-auto"], interactive: true }, "codex")
  check("launch-worker.mjs", "still refuses codex exec behind an interactive declaration", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /carries "exec", which is a headless invocation of codex/ }, { path: codexExec.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const codexExecAlias = stageLaunchWorker("codex-exec-alias", { command: "codex", args: ["e"], interactive: true }, "codex")
  check("launch-worker.mjs", "refuses codex e, the documented alias for exec", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /headless invocation of codex/ }, { path: codexExecAlias.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const unknownEngine = stageLaunchWorker("unknown-engine", { command: "aider", args: [], interactive: true }, "aider")
  check("launch-worker.mjs", "refuses an engine binary with no profile rather than waving it through", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /no engine profile for/ }, { path: unknownEngine.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  check("launch-worker.mjs", "refuses a missing prompt file", ["--issue", "ORB-75", "--prompt-file", join(root, "absent.md"), "--dry-run"], { status: 2, stderr: /prompt file not found/ }, { path: good.path })
  check("launch-worker.mjs", "refuses a non-Linear issue identifier", ["--issue", "nope", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /Linear identifier/ }, { path: good.path })

  /**
   * The standing worker contract has to be OWNED by the launcher, not by whoever composed the
   * prompt. Both clauses it carries were broken on the ORB-88 run by a worker whose hand-written
   * prompt happened not to say them: it ended a turn on a question, and it armed a monitor on
   * another ticket's PR. These cases are what makes dropping a clause fail Harness Execution.
   */
  check("launch-worker.mjs", "injects the standing worker contract into a prompt that lacks it", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /"workerContract": "appended"/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const alreadyContracted = stage("prompt-with-contract.md", `the ticket body verbatim\n\n${WORKER_CONTRACT_MARKER}\n\nclauses already here\n`)
  check("launch-worker.mjs", "does not stack a second copy on relaunch", ["--issue", "ORB-75", "--prompt-file", alreadyContracted, "--dry-run"], { status: 0, stdout: /"workerContract": "already present"/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  trustScreenCases()
  pointerDeliveryCases()
  terminalCreateRetryCases()

  const launcherSource = readFileSync(join(TOOLS_DIR, "launch-worker.mjs"), "utf8")
  for (const [clause, pattern] of Object.entries(REQUIRED_CONTRACT_CLAUSES)) {
    T(`launch-worker.mjs: the injected contract still forbids ${clause}`, pattern.test(launcherSource), `WORKER_CONTRACT no longer matches ${pattern}. A worker without this clause repeats the failure it was written for; restore it rather than relaxing this check.`)
  }
}

const TIMEOUT_PAYLOAD = JSON.stringify({ ok: false, error: { code: "timeout", message: "condition not met in time" } })
const BUSY_STUB = [{ match: "terminal wait", stdout: TIMEOUT_PAYLOAD, exit: 1 }]
const BROKEN_STUB = [{ match: "terminal wait", stdout: JSON.stringify({ ok: false, error: { code: "no-such-terminal", message: "unknown handle" } }), exit: 1 }]
/** A settled TUI emits nothing, so lastOutputAt is the SAME on both samples. */
const IDLE_STUB = [
  { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: true } } }), exit: 0 },
  { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }), exit: 0 },
  { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }), exit: 0 },
]
/**
 * The measured codex failure: orca reports tui-idle while the worker is mid-turn. The stub
 * says satisfied AND repaints (lastOutputAt is stamped fresh on every call), which is exactly
 * what a running turn looks like. A send here is the ORB-75 corruption, so this must refuse.
 */
const FALSE_IDLE_STUB = [
  { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: true } } }), exit: 0 },
  { match: "terminal show", stdout: '{"ok":true,"result":{"terminal":{"lastOutputAt":__NOW__}}}', exit: 0 },
  { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }), exit: 0 },
]

const nudgeWorkerCases = () => {
  check("nudge-worker.mjs", "rejects multi-line text", ["--terminal", "t1", "--text", "first line\nsecond line"], { status: 2, stderr: /single line/ })
  check("nudge-worker.mjs", "rejects --text together with --prompt-file", ["--terminal", "t1", "--text", "hi", "--prompt-file", stage("nudge-prompt.md", "body\n")], { status: 2, stderr: /alternatives/ })
  check("nudge-worker.mjs", "rejects a non-positive --wait-attempts", ["--terminal", "t1", "--text", "hi", "--wait-attempts", "0"], { status: 2, stderr: /positive integer/ })
  check("nudge-worker.mjs", "refuses to send while the worker is busy", ["--terminal", "t1", "--text", "hi", "--wait-attempts", "1"], { status: 1, stderr: /NOTHING was sent/ }, { env: orcaEnv(BUSY_STUB) })
  check("nudge-worker.mjs", "an orca failure that is not a timeout is a tool error", ["--terminal", "t1", "--text", "hi", "--wait-attempts", "1"], { status: 3, stderr: /unknown handle/ }, { env: orcaEnv(BROKEN_STUB) })
  check("nudge-worker.mjs", "sends once the worker is idle", ["--terminal", "t1", "--text", "hi", "--wait-attempts", "1"], { status: 0, stdout: /"sent": "hi"/ }, { env: orcaEnv(IDLE_STUB) })
  check("nudge-worker.mjs", "refuses a tui-idle that is still repainting, which is a worker mid-turn", ["--terminal", "t1", "--text", "hi", "--wait-attempts", "1"], { status: 1, stderr: /still repainting[\s\S]*NOTHING was sent/ }, { env: orcaEnv(FALSE_IDLE_STUB) })
  check("nudge-worker.mjs", "--dry-run calls orca not at all", ["--terminal", "t1", "--text", "hi", "--dry-run"], { status: 0, stdout: /"dryRun": true/ }, { env: orcaEnv([]) })
}

/**
 * pr-watch cases. Every one is a state the two hand-rolled ORB-88 loops got wrong, so the
 * regression they pin is "the watcher went back to sleep with the answer on screen".
 */
const HEAD_SHA = "d9a3f1c43e6d6c571d09fe7ea8afc55c26aa19dd"
const OLD_SHA = "1111111111111111111111111111111111111111"
const reviewOn = (state, oid) => ({ state, author: { login: "claude" }, commit: { oid } })
const checkRun = (name, conclusion) => ({ __typename: "CheckRun", name, status: "COMPLETED", conclusion })
const pullRequestStub = (number, pullRequest) => ({
  match: `number=${number}`,
  stdout: JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          number,
          url: `https://github.com/thomasluizon/orbit-ui-mobile/pull/${number}`,
          state: "OPEN",
          merged: false,
          isDraft: false,
          mergeStateStatus: "BLOCKED",
          reviewDecision: null,
          headRefOid: HEAD_SHA,
          latestReviews: { nodes: [] },
          commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS", contexts: { nodes: [checkRun("Lint", "SUCCESS")] } } } }] },
          ...pullRequest,
        },
      },
    },
  }),
})
const rollup = (...contexts) => ({ nodes: [{ commit: { statusCheckRollup: { state: "FAILURE", contexts: { nodes: contexts } } } }] })

const prWatchCases = () => {
  const argv = ["--repo", "thomasluizon/orbit-ui-mobile", "--pr", "615", "--once"]

  check(
    "pr-watch.mjs",
    "a verdict sitting on an OLDER commit does not satisfy the watch",
    argv,
    { status: 4, stdout: /"transition": "none"/ },
    { env: orcaEnv([pullRequestStub(615, { reviewDecision: "CHANGES_REQUESTED", latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", OLD_SHA)] } })]) },
  )
  check(
    "pr-watch.mjs",
    "a fresh CHANGES_REQUESTED on the current head fires, which is the silent-spin regression",
    argv,
    { status: 1, stdout: /"transition": "changes-requested"/ },
    { env: orcaEnv([pullRequestStub(615, { reviewDecision: "CHANGES_REQUESTED", latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", HEAD_SHA)] } })]) },
  )
  const approved = pullRequestStub(615, { reviewDecision: "APPROVED", mergeStateStatus: "CLEAN", latestReviews: { nodes: [reviewOn("APPROVED", HEAD_SHA)] } })
  check("pr-watch.mjs", "a fresh approval fires", argv, { status: 0, stdout: /"transition": "approved"/ }, { env: orcaEnv([approved]) })
  check(
    "pr-watch.mjs",
    "an approval the caller already acted on reports mergeable-and-approved instead of repeating itself",
    [...argv, "--acted", `615=${HEAD_SHA.slice(0, 7)}:APPROVED`],
    { status: 0, stdout: /"transition": "ready-to-merge"/ },
    { env: orcaEnv([approved]) },
  )
  check(
    "pr-watch.mjs",
    "a failing check beats an approval",
    argv,
    { status: 1, stdout: /"transition": "checks-failed"/ },
    {
      env: orcaEnv([
        pullRequestStub(615, {
          reviewDecision: "APPROVED",
          mergeStateStatus: "CLEAN",
          latestReviews: { nodes: [reviewOn("APPROVED", HEAD_SHA)] },
          commits: rollup(checkRun("Lint", "SUCCESS"), checkRun("Harness Execution", "FAILURE")),
        }),
      ]),
    },
  )
  check(
    "pr-watch.mjs",
    "a merged PR ends the watch",
    argv,
    { status: 5, stdout: /"transition": "gone"/ },
    { env: orcaEnv([pullRequestStub(615, { state: "MERGED", merged: true })]) },
  )
  check(
    "pr-watch.mjs",
    "watching several PRs reports whichever one transitioned",
    ["--repo", "thomasluizon/orbit-ui-mobile", "--pr", "615,616", "--once"],
    { status: 1, stdout: /"pr": 616[\s\S]*"transition": "changes-requested"/ },
    {
      env: orcaEnv([
        pullRequestStub(615, {}),
        pullRequestStub(616, { reviewDecision: "CHANGES_REQUESTED", latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", HEAD_SHA)] } }),
      ]),
    },
  )
  /**
   * The REAL loop, not --once: every other case here short-circuits it, and this is the code
   * that runs unattended for 90 minutes in place of two predecessors that failed silently.
   * --interval 1 --timeout 3 gives it two sleeps before the deadline, so polls > 1 is the proof
   * that it slept and came back rather than falling out of the loop on the first pass.
   */
  const timedOut = check(
    "pr-watch.mjs",
    "the polling loop sleeps, re-polls and times out reporting it, without --once",
    ["--repo", "thomasluizon/orbit-ui-mobile", "--pr", "615", "--interval", "1", "--timeout", "3"],
    { status: 4, stdout: /"transition": "timeout"/ },
    { env: orcaEnv([pullRequestStub(615, { reviewDecision: "CHANGES_REQUESTED", latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", OLD_SHA)] } })]) },
  )
  T(
    "pr-watch.mjs: the timed-out watch really polled more than once",
    timedOut.status === 4 && JSON.parse(timedOut.stdout).polls > 1,
    `polls was ${timedOut.status === 4 ? JSON.parse(timedOut.stdout).polls : "unreadable"}; one poll means the loop never slept\n     ${timedOut.stderr.trim().split("\n").slice(0, 4).join("\n     ")}`,
  )

  check("pr-watch.mjs", "refuses a baseline for a PR it is not watching", [...argv, "--acted", `616=${HEAD_SHA}:APPROVED`], { status: 2, stderr: /--pr does not watch/ })
  check("pr-watch.mjs", "refuses a malformed baseline rather than ignoring it", [...argv, "--acted", "615=APPROVED"], { status: 2, stderr: /--acted must look like/ })
  check("pr-watch.mjs", "refuses a repo that is not an owner\\/name slug", ["--repo", "orbit-ui-mobile", "--pr", "615", "--once"], { status: 2, stderr: /owner\/name slug/ })
}

/**
 * worker-watch cases. The liveness half is the whole point: a single terminal read cannot tell a
 * busy worker from an idle one, and a busy worker's tail is thousands of characters of
 * concatenated repaint fragments that hide whatever it last really said.
 */
const workerWatchCases = () => {
  const terminalHandle = "term_ca852374-175d-42cd-8407-b579a03cc13a"
  const childWorktree = (path) => ({
    path,
    repoId: "r-ui",
    projectId: "github:thomasluizon/orbit-ui-mobile",
    isMainWorktree: false,
    isArchived: false,
    branch: "refs/heads/feature/orb-75-prove-the-harness-gate",
    linkedLinearIssue: "ORB-75",
    baseRef: "main",
    comment: "ORB-75 launched: worker running",
  })
  const linearState = {
    match: "linear issue ORB-75",
    stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-75", state: { name: "In Progress" }, labels: [] } } }),
  }
  const fleet = (path, { lastOutputAt, tail }) => [
    { match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [childWorktree(path)] } }) },
    {
      match: "terminal list",
      stdout: JSON.stringify({ ok: true, result: { terminals: [{ handle: terminalHandle, worktreePath: path, title: "Claude Code", lastOutputAt: 0 }] } }).replace(
        '"lastOutputAt":0',
        `"lastOutputAt":${lastOutputAt}`,
      ),
    },
    { match: "terminal read", stdout: JSON.stringify({ ok: true, result: { terminal: { tail } } }) },
    linearState,
  ]

  check(
    "worker-watch.mjs",
    "an empty fleet says so rather than printing nothing",
    [],
    { status: 0, stdout: /no Orca worktrees/ },
    { env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [] } }) }]) },
  )

  /** __NOW__ is stamped per stub call, so the two samples differ: a TUI painting its spinner. */
  const busy = check(
    "worker-watch.mjs",
    "a repainting terminal is BUSY, and its repaint tail yields no output lines",
    ["--no-contract"],
    { status: 0, stdout: /BUSY\s+ORB-75/ },
    {
      env: orcaEnv(
        fleet("C:/wt/orb-75", {
          lastOutputAt: "__NOW__",
          tail: ["WorkingWorkingWorkingWorking (12s - esc to interupt)WorkingWorking", "  ⠋ ⠙ ⠹ ⠸  "],
        }),
      ),
    },
  )
  T("worker-watch.mjs: the repaint tail is stripped to nothing rather than printed raw", /nothing but repaint noise/.test(busy.stdout), busy.stdout.slice(0, 400))
  T("worker-watch.mjs: the ticket's Linear state is reported alongside liveness", /In Progress/.test(busy.stdout), busy.stdout.slice(0, 400))
  T(
    "worker-watch.mjs: the rendered terminal handle is complete and directly reusable",
    busy.stdout.includes(`${terminalHandle} BUSY`) && !/term_ca852374\s+BUSY/.test(busy.stdout),
    busy.stdout.slice(0, 400),
  )

  /** A frozen lastOutputAt is a settled TUI: identical samples, so IDLE. */
  const idle = check(
    "worker-watch.mjs",
    "two identical samples are IDLE, and real content survives the stripping",
    [],
    { status: 0, stdout: /IDLE\s+ORB-75/ },
    {
      env: orcaEnv(
        fleet(root, {
          lastOutputAt: "1785168487585",
          tail: ["Working (30s - esc to interupt)", "Wrote tools/pr-watch.mjs", "Which of these two approaches do you want?"],
        }),
      ),
    },
  )
  T(
    "worker-watch.mjs: the last meaningful lines survive, so a worker stopped on a question is readable",
    /Wrote tools\/pr-watch\.mjs/.test(idle.stdout) && /Which of these two approaches/.test(idle.stdout),
    idle.stdout.slice(0, 400),
  )
  T(
    "worker-watch.mjs: an unreadable contract verdict is reported, never silently dropped",
    /contract\s+unavailable/.test(idle.stdout),
    `worker-status ran against a non-repo path, so the verdict must degrade visibly\n     ${idle.stdout.slice(0, 400)}`,
  )
  check("worker-watch.mjs", "refuses a repo outside orchestrator.json", ["--repo", "zzz"], { status: 2, stderr: /--repo must be one of/ })
  check("worker-watch.mjs", "refuses a non-positive --lines", ["--lines", "0"], { status: 2, stderr: /positive integer/ })
}

/** A linked child checkout is the smallest real Git fixture that can prove teardown verification. */
const stageTeardownWorktree = (label, { dirty = false, changed = false, squashMerged = false, siblingTargetAdvance = false, branchDeleteMode } = {}) => {
  const primary = join(root, "teardown", label, "primary")
  const child = join(root, "teardown", label, "child")
  mkdirSync(primary, { recursive: true })
  const git = (cwd, args) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
  for (const args of [["init", "-q", "--initial-branch=main"], ["config", "user.email", "gate@orbit.test"], ["config", "user.name", "Orbit Gate"], ["commit", "-q", "--allow-empty", "-m", "base"], ["worktree", "add", "-q", "-b", "feature/orb-124-teardown", child]]) {
    if (git(primary, args).status !== 0) return null
  }
  if (changed) {
    writeFileSync(join(child, "captured.txt"), "not in main\n")
    if (git(child, ["add", "captured.txt"]).status !== 0 || git(child, ["commit", "-q", "-m", "captured work"]).status !== 0) return null
    if (squashMerged) {
      writeFileSync(join(primary, "captured.txt"), "not in main\n")
      if (git(primary, ["add", "captured.txt"]).status !== 0 || git(primary, ["commit", "-q", "-m", "squashed capture"]).status !== 0) return null
    }
    if (siblingTargetAdvance) {
      writeFileSync(join(primary, "sibling-ticket.txt"), "already in main\n")
      if (git(primary, ["add", "sibling-ticket.txt"]).status !== 0 || git(primary, ["commit", "-q", "-m", "sibling ticket"]).status !== 0) return null
    }
  }
  if (dirty) writeFileSync(join(child, "dirty.txt"), "uncommitted\n")
  if (branchDeleteMode) {
    const branchRef = "refs/heads/feature/orb-124-teardown"
    const hook = join(primary, ".git", "hooks", "reference-transaction")
    const head = git(primary, ["rev-parse", "main"]).stdout.trim()
    const body = branchDeleteMode === "fail"
      ? `#!/bin/sh\nif [ "$1" = "prepared" ]; then\n  while read old new ref; do\n    if [ "$ref" = "${branchRef}" ] && [ "$new" = "0000000000000000000000000000000000000000" ]; then exit 1; fi\n  done\nfi\n`
      : `#!/bin/sh\nmarker="$GIT_DIR/teardown-branch-recreated"\nif [ "$1" = "committed" ] && [ ! -f "$marker" ]; then\n  while read old new ref; do\n    if [ "$ref" = "${branchRef}" ] && [ "$new" = "0000000000000000000000000000000000000000" ]; then\n      touch "$marker"\n      git update-ref "${branchRef}" "${head}"\n    fi\n  done\nfi\n`
    writeFileSync(hook, body)
    chmodSync(hook, 0o755)
  }
  return { primary, child, branch: "feature/orb-124-teardown" }
}

const teardownWorktreeRecord = (fixture) => ({
  path: fixture.child,
  isMainWorktree: false,
  isArchived: false,
  linkedLinearIssue: "ORB-124",
  branch: `refs/heads/${fixture.branch}`,
  baseRef: "main",
})

const teardownPlan = (fixture, { state = "Done", terminals = [], removePath, removal = JSON.stringify({ ok: true, result: {} }), removalExit = 0 } = {}) => [
  { match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [teardownWorktreeRecord(fixture)] } }) },
  { match: "terminal list", stdout: JSON.stringify({ ok: true, result: { terminals } }) },
  { match: "linear issue ORB-124", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-124", state: { name: state } } } }) },
  { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
  { match: "worktree rm", stdout: removal, exit: removalExit, ...(removePath ? { removePath } : {}) },
]

const teardownWorktreeCases = () => {
  check("teardown-worktree.mjs", "refuses no selector", [], { status: 2, stderr: /provide exactly one selector/ })
  check("teardown-worktree.mjs", "refuses both selectors", ["--issue", "ORB-124", "--worktree", "path:C:/other"], { status: 2, stderr: /provide exactly one selector/ })
  check("teardown-worktree.mjs", "refuses a malformed Linear issue selector", ["--issue", "orb-124"], { status: 2, stderr: /--issue must be a Linear identifier/ })
  check("teardown-worktree.mjs", "refuses a valueless issue selector", ["--issue"], { status: 2, stderr: /selector flags require a value/ })
  check("teardown-worktree.mjs", "refuses a valueless worktree selector", ["--worktree"], { status: 2, stderr: /selector flags require a value/ })
  check("teardown-worktree.mjs", "refuses a valueless base", ["--issue", "ORB-124", "--base"], { status: 2, stderr: /selector flags require a value/ })
  check(
    "teardown-worktree.mjs",
    "refuses an issue with no active worktree",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /no active Orca worktree is linked to ORB-124/ },
    { env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [] } }) }]) },
  )

  const allGood = stageTeardownWorktree("all-good")
  if (!allGood) {
    T("teardown-worktree.mjs: real git fixture is available", false, "could not create a linked Git worktree")
    return
  }
  const primaryRefusal = stageTeardownWorktree("primary-refusal")
  const primaryRecord = { ...teardownWorktreeRecord(primaryRefusal), path: primaryRefusal.primary, isMainWorktree: true }
  check(
    "teardown-worktree.mjs",
    "refuses a primary checkout",
    ["--worktree", `path:${primaryRefusal.primary}`],
    { status: 1, stderr: /refusing to remove a primary checkout/ },
    { env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [primaryRecord] } }) }]) },
  )

  const unlinkedRefusal = stageTeardownWorktree("unlinked-refusal")
  const unlinkedRecord = { ...teardownWorktreeRecord(unlinkedRefusal), linkedLinearIssue: null }
  check(
    "teardown-worktree.mjs",
    "refuses a worktree without a linked Linear issue",
    ["--worktree", `path:${unlinkedRefusal.child}`],
    { status: 1, stderr: /refusing a worktree without a linked Linear issue/ },
    { env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [unlinkedRecord] } }) }]) },
  )
  const unavailable = check(
    "teardown-worktree.mjs",
    "runtime_unavailable is success when filesystem and git verification prove removal",
    ["--issue", "ORB-124"],
    { status: 0, stdout: /REMOVED worktree[\s\S]*REMOVED terminals[\s\S]*REMOVED local branch/ },
    {
      env: orcaEnv(
        teardownPlan(allGood, {
          removePath: allGood.child,
          removal: JSON.stringify({ ok: false, code: "runtime_unavailable", message: "connection closed" }),
          removalExit: 1,
        }),
      ),
    },
  )
  T("teardown-worktree.mjs: verified removal actually deleted the fixture", !existsSync(allGood.child), unavailable.stderr)

  const missingTerminalPath = stageTeardownWorktree("missing-terminal-path")
  check(
    "teardown-worktree.mjs",
    "ignores another fleet terminal without a worktree path",
    ["--issue", "ORB-124"],
    { status: 0, stdout: /REMOVED worktree/ },
    {
      env: orcaEnv([
        ...teardownPlan(missingTerminalPath, {
          terminals: [{ handle: "term_other_worktree", title: "other worktree" }, { handle: "term_target", worktreePath: missingTerminalPath.child, title: "target worktree" }],
          removePath: missingTerminalPath.child,
        }),
        { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1 } } }) },
      ]),
    },
  )

  const dirty = stageTeardownWorktree("dirty", { dirty: true })
  check("teardown-worktree.mjs", "a dirty tree is refused with its uncommitted path", ["--issue", "ORB-124"], { status: 1, stderr: /worktree-clean[\s\S]*dirty\.txt/ }, { env: orcaEnv(teardownPlan(dirty, { removePath: dirty.child })) })
  T("teardown-worktree.mjs: dirty refusal leaves the tree untouched", existsSync(dirty.child), "the dirty fixture was removed")

  const unmerged = stageTeardownWorktree("unmerged", { changed: true })
  check("teardown-worktree.mjs", "content absent from the target branch is refused", ["--issue", "ORB-124"], { status: 1, stderr: /tree-present-in-target/ }, { env: orcaEnv(teardownPlan(unmerged, { removePath: unmerged.child })) })

  const notDone = stageTeardownWorktree("not-done")
  check("teardown-worktree.mjs", "a closed-looking but non-Done Linear issue is refused", ["--issue", "ORB-124"], { status: 1, stderr: /linear-done[\s\S]*In Review/ }, { env: orcaEnv(teardownPlan(notDone, { state: "In Review", removePath: notDone.child })) })

  const repainting = stageTeardownWorktree("repainting")
  const log = join(root, "teardown", "repainting.log")
  check(
    "teardown-worktree.mjs",
    "a repainting terminal is refused because the worker is still working",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /terminals-idle[\s\S]*worker is still working/ },
    {
      env: {
        ...orcaEnv([
          ...teardownPlan(repainting, { terminals: [{ handle: "term_busy", worktreePath: repainting.child }] }),
          { match: "terminal show", sequence: [JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1 } } }), JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 2 } } })] },
        ]),
        ORBIT_ORCA_LOG: log,
      },
    },
  )

  const survives = stageTeardownWorktree("survives")
  check("teardown-worktree.mjs", "an ok removal response is failure when the directory survives", ["--issue", "ORB-124"], { status: 1, stderr: /removal verification failed/ }, { env: orcaEnv(teardownPlan(survives)) })

  const selector = stageTeardownWorktree("selector", { changed: true, squashMerged: true })
  check("teardown-worktree.mjs", "a path selector accepts a squash-merged tree without ancestry", ["--worktree", `path:${selector.child}`], { status: 0 }, { env: orcaEnv(teardownPlan(selector, { removePath: selector.child })) })

  const siblingAdvanced = stageTeardownWorktree("sibling-advance", { changed: true, squashMerged: true, siblingTargetAdvance: true })
  check("teardown-worktree.mjs", "a squash-merged tree is present when the target advanced on unrelated paths", ["--issue", "ORB-124"], { status: 0, stdout: /REMOVED worktree/ }, { env: orcaEnv(teardownPlan(siblingAdvanced, { removePath: siblingAdvanced.child })) })

  const branchDeleteFails = stageTeardownWorktree("branch-delete-fails", { branchDeleteMode: "fail" })
  check(
    "teardown-worktree.mjs",
    "reports a branch deletion failure after removing the worktree",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /removed worktree but could not delete local branch feature\/orb-124-teardown/ },
    { env: orcaEnv(teardownPlan(branchDeleteFails, { removePath: branchDeleteFails.child })) },
  )

  const branchRemains = stageTeardownWorktree("branch-remains", { branchDeleteMode: "retain" })
  check(
    "teardown-worktree.mjs",
    "reports a branch that remains after deletion",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /removed worktree but local branch feature\/orb-124-teardown still exists/ },
    { env: orcaEnv(teardownPlan(branchRemains, { removePath: branchRemains.child })) },
  )
}

const orcaWebPortCases = () => {
  const portFor = (name) => Number(run("orca-web-port.mjs", ["--derive", "--name", name]).stdout.trim())
  const names = Array.from({ length: 256 }, (_, index) => `generated-worktree-${index}`)
  const ports = names.map(portFor)
  check("orca-web-port.mjs", "rejects multiple operation flags", ["--setup", "--next-dev"], { status: 2, stderr: /alternatives/ })
  check("orca-web-port.mjs", "rejects --name without --derive", ["--name", "orphaned-name"], { status: 2, stderr: /requires --derive/ })
  check("orca-web-port.mjs", "requires a name for --derive", ["--derive"], { status: 2, stderr: /requires --name/ })
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
  gitFixture(["worktree", "add", "-b", "feature/collision-one", "collision-worktree-29"])
  gitFixture(["worktree", "add", "-b", "feature/collision-two", "collision-worktree-32"])
  const first = join(fixture, "one")
  const second = join(fixture, "two")
  const collision = join(fixture, "collision-worktree-32")
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
  check("orca-web-port.mjs", "refuses a deterministic port collision before persisting", ["--setup"], { status: 1, stderr: /collides with linked worktree collision-worktree-29/ }, { cwd: collision })
  T("orca-web-port.mjs: collision refusal leaves no marker behind", !existsSync(join(collision, ".orca", "web-port")))

  const primary = join(root, "orca-web-port-primary")
  mkdirSync(primary, { recursive: true })
  const gitPrimary = (argv) => spawnSync("git", argv, { cwd: primary, encoding: "utf8" })
  gitPrimary(["init", "--initial-branch=main"])
  check("orca-web-port.mjs", "the primary checkout keeps the default port", [], { status: 0, stdout: /^3000\s*$/ }, { cwd: primary })
  check("orca-web-port.mjs", "setup refuses the primary checkout", ["--setup"], { status: 1, stderr: /keeps the default web port/ }, { cwd: primary })
}

const captureSurfacesCases = () => {
  const fixture = join(root, "capture-surfaces-origin")
  const tools = join(fixture, "tools")
  mkdirSync(tools, { recursive: true })
  cpSync(join(TOOLS_DIR, "capture-surfaces.mjs"), join(tools, "capture-surfaces.mjs"))
  writeFileSync(
    join(tools, "orca-web-port.mjs"),
    `if (process.env.ORBIT_CAPTURE_FAIL === "1") { process.stderr.write("unassigned\\n"); process.exit(1) }\nprocess.stdout.write(process.env.ORBIT_CAPTURE_PORT ?? "3000")\n`,
  )
  const probe = stage(
    "capture-surfaces-origin/probe.mjs",
    `import { resolveBaseUrl } from "./tools/capture-surfaces.mjs"\nconsole.log(resolveBaseUrl(process.argv[2] === "none" ? null : process.argv[2]))\n`,
  )
  check("capture-surfaces.mjs", "uses the primary checkout default when no base URL is supplied", ["none"], { status: 0, stdout: /^http:\/\/localhost:3000\s*$/ }, { path: probe })
  check("capture-surfaces.mjs", "uses the linked worktree port when no base URL is supplied", ["none"], { status: 0, stdout: /^http:\/\/localhost:3286\s*$/ }, { path: probe, env: { ORBIT_CAPTURE_PORT: "3286" } })
  check("capture-surfaces.mjs", "keeps an explicit base URL over the assigned port", ["http://localhost:7777"], { status: 0, stdout: /^http:\/\/localhost:7777\s*$/ }, { path: probe, env: { ORBIT_CAPTURE_PORT: "3286" } })
  check("capture-surfaces.mjs", "refuses capture when a linked worktree has no assigned port", ["none"], { status: 1, stderr: /could not resolve this worktree's web port/ }, { path: probe, env: { ORBIT_CAPTURE_FAIL: "1" } })
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

const delayedWaveStub = () => {
  const issues = Array.from({ length: 100 }, (_, index) => ({ identifier: `ORB-${index + 1}` }))
  return [
    { match: "linear list-issues", stdout: JSON.stringify({ ok: true, result: { issues } }) },
    ...issues.map(({ identifier }, index) => ({
      match: `linear issue ${identifier} --relations`,
      delayMs: 40,
      stdout: JSON.stringify({ ok: true, result: { issue: { identifier, title: `ticket ${index + 1}`, state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [] } }),
    })),
  ]
}

const composePromptCases = () => {
  const output = stage("prompts/orb-125.md", "")
  const comments = [
    { user: { name: "Later reviewer" }, createdAt: "2026-07-28T10:00:00.000Z", body: "Later comment" },
    { user: { name: "First reviewer" }, createdAt: "2026-07-27T10:00:00.000Z", body: "First comment with ```ts\nconst answer = 42\n```" },
  ]
  const issue = { identifier: "ORB-125", description: "# Ticket body\n\nKeep this verbatim.", comments }
  const result = check(
    "compose-prompt.mjs",
    "writes the body and chronological, attributed comments without changing fenced Markdown",
    ["--issue", "ORB-125", "--output", output],
    { status: 0, stdout: /orb-125\.md/ },
    { env: orcaEnv([{ match: "linear issue ORB-125", stdout: JSON.stringify({ ok: true, result: { issue } }) }]) },
  )
  const prompt = readFileSync(output, "utf8")
  T(
    "compose-prompt.mjs: comment order, attribution, and fences survive composition",
    result.status === 0 && prompt.indexOf("First reviewer - 2026-07-27T10:00:00.000Z") < prompt.indexOf("Later reviewer - 2026-07-28T10:00:00.000Z") && /```ts\nconst answer = 42\n```/.test(prompt),
    prompt,
  )
  const launcher = stageLaunchWorker("compose-prompt", INTERACTIVE_WORKER)
  check("launch-worker.mjs", "accepts a composed prompt file unchanged", ["--issue", "ORB-75", "--prompt-file", output, "--dry-run"], { status: 0 }, { path: launcher.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const noComments = stage("prompts/no-comments.md", "")
  check(
    "compose-prompt.mjs",
    "omits the comments heading when the issue has no comments",
    ["--issue", "ORB-126", "--output", noComments],
    { status: 0 },
    { env: orcaEnv([{ match: "linear issue ORB-126", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-126", description: "# Body", comments: [] } } }) }]) },
  )
  T("compose-prompt.mjs: zero comments add no empty heading", !/Comments on this issue/.test(readFileSync(noComments, "utf8")))
}

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

const mergeSweepCases = (file) => {
  const expectedHead = "1111111111111111111111111111111111111111"
  const changedHead = "2222222222222222222222222222222222222222"
  const coverageAware = file === "merge-sweep-cov.sh"
  const matchedLog = join(root, `${file}-matched.log`)
  const matched = run(file, ["--expected-head", `615=${expectedHead}`, "thomasluizon/orbit-ui-mobile", "615"], {
    env: mergeSweepEnv({
      head: expectedHead,
      log: matchedLog,
      sonar: coverageAware ? "coverage-failure" : "success",
      state: coverageAware ? "BLOCKED" : "CLEAN",
    }),
  })
  const matchedMerges = mergeSweepCalls(matchedLog).filter(([group, command]) => group === "pr" && command === "merge")
  const matchedMerge = matchedMerges[0] ?? []
  const matchedHeadFlag = matchedMerge.indexOf("--match-head-commit")
  T(
    `${file}: matching expected head merges`,
    matched.status === 0 &&
      /MERGED #615/.test(matched.stdout) &&
      matchedMerges.length === 1 &&
      matchedHeadFlag !== -1 &&
      matchedMerge[matchedHeadFlag + 1] === expectedHead &&
      (!coverageAware || matchedMerge.includes("--admin")),
    `exit ${matched.status}\n     stdout: ${matched.stdout.trim()}\n     stderr: ${matched.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(matchedLog))}`,
  )

  const changedLog = join(root, `${file}-changed.log`)
  const changed = run(file, ["--expected-head", `615=${expectedHead}`, "thomasluizon/orbit-ui-mobile", "615"], {
    env: mergeSweepEnv({
      head: changedHead,
      log: changedLog,
      sonar: coverageAware ? "coverage-failure" : "success",
      state: coverageAware ? "BLOCKED" : "CLEAN",
    }),
  })
  const changedCalls = mergeSweepCalls(changedLog)
  const changedMerges = changedCalls.filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: changed head skips and names both SHAs`,
    changed.status === 0 &&
      /SKIP #615/.test(changed.stdout) &&
      changed.stdout.includes(expectedHead) &&
      changed.stdout.includes(changedHead) &&
      changedMerges.length === 0 &&
      (!coverageAware || !changedCalls.some((argv) => argv.includes("--admin"))),
    `exit ${changed.status}\n     stdout: ${changed.stdout.trim()}\n     stderr: ${changed.stderr.trim()}\n     calls: ${JSON.stringify(changedCalls)}`,
  )

  const mergeRaceLog = join(root, `${file}-merge-race.log`)
  const mergeRace = run(file, ["--expected-head", `615=${expectedHead}`, "thomasluizon/orbit-ui-mobile", "615"], {
    env: mergeSweepEnv({
      changedHead,
      head: expectedHead,
      log: mergeRaceLog,
      moveAtMerge: true,
      sonar: coverageAware ? "coverage-failure" : "success",
      state: coverageAware ? "BLOCKED" : "CLEAN",
    }),
  })
  const mergeRaceCalls = mergeSweepCalls(mergeRaceLog)
  const mergeRaceMerges = mergeRaceCalls.filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: atomic merge refusal reports a last-moment head change`,
    mergeRace.status === 0 &&
      /SKIP #615 HEAD-MOVED/.test(mergeRace.stdout) &&
      mergeRace.stdout.includes(expectedHead) &&
      mergeRace.stdout.includes(changedHead) &&
      mergeRaceMerges.length === 1 &&
      (!coverageAware || mergeRaceMerges[0].includes("--admin")),
    `exit ${mergeRace.status}\n     stdout: ${mergeRace.stdout.trim()}\n     stderr: ${mergeRace.stderr.trim()}\n     calls: ${JSON.stringify(mergeRaceCalls)}`,
  )

  const bareLog = join(root, `${file}-bare.log`)
  const bare = run(file, ["thomasluizon/orbit-ui-mobile", "615"], {
    env: mergeSweepEnv({ head: changedHead, log: bareLog }),
  })
  const bareMerges = mergeSweepCalls(bareLog).filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: invocation without expected head still merges`,
    bare.status === 0 && /MERGED #615/.test(bare.stdout) && bareMerges.length === 1,
    `exit ${bare.status}\n     stdout: ${bare.stdout.trim()}\n     stderr: ${bare.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(bareLog))}`,
  )
}

const gateCases = {
  "merge-sweep.sh": () => mergeSweepCases("merge-sweep.sh"),
  "merge-sweep-cov.sh": () => mergeSweepCases("merge-sweep-cov.sh"),
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
  "pr-watch.mjs": prWatchCases,
  "worker-watch.mjs": workerWatchCases,
  "teardown-worktree.mjs": teardownWorktreeCases,
  "orca-web-port.mjs": orcaWebPortCases,
  "worker-status.mjs": () => {
    check("worker-status.mjs", "requires --worktree", ["--issue", "ORB-75"], { status: 2, stderr: /--worktree is required/ })
    check("worker-status.mjs", "requires a Linear issue identifier", ["--worktree", root, "--issue", "nope"], { status: 2, stderr: /Linear identifier/ })
  },
  "compose-prompt.mjs": composePromptCases,
  "wave-plan.mjs": () => {
    check("wave-plan.mjs", "orders a blockedBy pair into two waves", ["--project", "Redesign", "--json"], { status: 0, stdout: /"wave": 2[\s\S]*ORB-2/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "wave 1 is the unblocked ticket", ["--project", "Redesign", "--json"], { status: 0, stdout: /"launchable": \[\s*"ORB-1"\s*\]/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "reach counts the whole downstream chain, not just direct blockers", ["--project", "Redesign", "--json"], { status: 0, stdout: /"identifier": "ORB-1"[\s\S]*?"reach": 2/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "a wave-1 ticket at the strike limit is reported, not dropped", ["--project", "Redesign", "--json"], { status: 0, stdout: /"twoStrikes": \[\s*"ORB-4"\s*\]/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "text mode marks the same strike-limit ticket", ["--project", "Redesign"], { status: 0, stdout: /ORB-4[\s\S]*?TWO STRIKES/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "an empty project is nothing to plan", ["--project", "Empty"], { status: 1, stderr: /nothing to plan/ }, { env: orcaEnv([{ match: "linear list-issues", stdout: JSON.stringify({ ok: true, result: { issues: [] } }) }]) })
    const start = Date.now()
    const delayed = run("wave-plan.mjs", ["--all"], { env: orcaEnv(delayedWaveStub()) })
    T("wave-plan.mjs: fetches 100 relations in a bounded pool while preserving the table order", delayed.status === 0 && Date.now() - start < 3000 && /ORB-1[\s\S]*ORB-100/.test(delayed.stdout), `exit ${delayed.status}, elapsed ${Date.now() - start}ms\n     ${delayed.stderr}`)
    check(
      "wave-plan.mjs",
      "names a failing relation fetch without an execFile stack trace",
      ["--project", "Redesign"],
      { status: 2, stderr: /failed to fetch ORB-2: unavailable/ },
      { env: orcaEnv([{ ...WAVE_STUB[0] }, WAVE_STUB[1], { match: "linear issue ORB-2", stdout: JSON.stringify({ ok: false, error: { message: "unavailable" } }) }, WAVE_STUB[3], WAVE_STUB[4]]) },
    )
    check(
      "wave-plan.mjs",
      "keeps planning when one external blocker cannot be fetched",
      ["--project", "External"],
      { status: 0, stdout: /ORB-1[\s\S]*blockedBy: ORB-99/, stderr: /WARNING: blocker ORB-99 could not be fetched[\s\S]*treating it as blocking/ },
      {
        env: orcaEnv([
          { match: "linear list-issues", stdout: JSON.stringify({ ok: true, result: { issues: [{ identifier: "ORB-1" }] } }) },
          { match: "linear issue ORB-1", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-1", title: "dependent", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-99" } }] } }) },
          { match: "linear issue ORB-99", stdout: JSON.stringify({ ok: false, error: { message: "unavailable" } }) },
        ]),
      },
    )
  },
  "check-dashes.mjs": () => {
    check("check-dashes.mjs", "an em dash in text is rejected", ["--text", `a${EM_DASH}b`], { status: 1, stderr: /Banned dash/ })
    check("check-dashes.mjs", "clean text passes", ["--text", "a plain hyphen - is fine"], { status: 0 })
  },
  "capture-surfaces.mjs": captureSurfacesCases,
  "check-ticket.mjs": () => {
    check("check-ticket.mjs", "an incomplete body is rejected", ["--file", stage("ticket.md", "# A ticket\n\nno template sections here\n")], { nonZero: true })
    check("check-ticket.mjs", "a missing body file is a usage error", ["--file", join(root, "absent.md")], { status: 2 })
    const issue = (sentence) => ({
      match: "linear issue ORB-99",
      stdout: JSON.stringify({
        ok: true,
        result: {
          issue: { identifier: "ORB-99", title: "Keep explicit issue dependencies precise", description: `${VALID_TICKET_BODY}\n\n${sentence}`, labels: [{ name: "repo:api" }] },
          relations: [],
        },
      }),
    })
    for (const sentence of [
      "Cleanup runs after the terminal exits.",
      "The launcher retries once the daemon is responsive.",
      "The branch name depends on configuration, and startup can be blocked by a trust prompt.",
    ]) {
      check("check-ticket.mjs", `ordinary prose does not imply a dependency: ${sentence}`, ["--issue", "ORB-99"], { status: 0, stdout: /ticket ok/ }, { env: orcaEnv([issue(sentence)]) })
    }
    check(
      "check-ticket.mjs",
      "a named issue blocker still requires a blockedBy relation",
      ["--issue", "ORB-99"],
      { status: 1, stderr: /body PROSE mentions a dependency/ },
      { env: orcaEnv([issue("This change is blocked by ORB-1.")]) },
    )
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
  "compose-prompt.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "launch-worker.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "merge-sweep-cov.sh": { argv: ["--orbit-not-a-flag", "zzz"], status: 2 },
  "merge-sweep.sh": { argv: ["--orbit-not-a-flag", "zzz"], status: 2 },
  "new-ticket.mjs": { argv: [], status: 2 },
  "nudge-worker.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "orca-web-port.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "pr-watch.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "redesign-coverage.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "rollup.sh": { argv: ["--orbit-not-a-flag"], status: 2 },
  "surface-manifest.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "teardown-worktree.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "wave-plan.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "worker-status.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "worker-watch.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
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
