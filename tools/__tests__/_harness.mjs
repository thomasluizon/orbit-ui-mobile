/**
 * The shared prelude every harness case module imports: the reporter, the temp fixture
 * root, the process runners, and the stubs that keep the suite hermetic.
 *
 * TOOLS_DIR is NOT derived here. tools/test-tools.mjs resolves it once from its own
 * location and calls configure() before loading a single case module, so a case body can
 * never silently resolve tools/__tests__ as the tools directory.
 */

import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

/**
 * Injected by the runner. These are live bindings: configure() runs before any case
 * module is imported, so every module reads the runner's own resolution.
 */
export let TOOLS_DIR = ""
export let REPO_ROOT = ""
export let SELF = ""

export const configure = ({ toolsDir, self }) => {
  TOOLS_DIR = toolsDir
  REPO_ROOT = resolve(toolsDir, "..")
  SELF = self
}

/** The one path helper case modules use, so injection failure surfaces as a wrong path. */
export const toolPath = (file) => join(TOOLS_DIR, file)

/** Case keys naming a file that is not in tools/. A skip here would exit 0 on a typo. */
export const orphanCaseKeys = (caseKeys, toolsDir) => caseKeys.filter((file) => !existsSync(join(toolsDir, file)))

export const EM_DASH = String.fromCharCode(0x2014)

let fails = 0

/**
 * Every assertion is attributed to the case module the runner is currently driving, so the
 * runner can name a module that asserted nothing at all. One module owns exactly one unit,
 * so the scope is the whole attribution: nothing is inferred from an assertion's wording.
 */
const RUNNER_TALLY_KEY = "(runner)"
const tally = new Map()
let currentScope = null

export const beginToolScope = (tool) => {
  currentScope = tool
}
export const endToolScope = () => {
  currentScope = null
}
export const assertionTally = () => Object.fromEntries(tally)

export const T = (name, ok, detail = "") => {
  if (!ok) fails++
  const tool = currentScope ?? RUNNER_TALLY_KEY
  tally.set(tool, (tally.get(tool) ?? 0) + 1)
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `\n     ${detail}`}`)
}

export const root = mkdtempSync(join(tmpdir(), "orbit-tools-gate-"))

process.on("exit", () => {
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    /* a transient lock on the fixture root must never mask the suite's verdict */
  }
})

export const stage = (relativePath, body) => {
  const path = join(root, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
  return path
}

/** `kill(pid, 0)` also succeeds for a defunct child on Linux. A zombie has terminated and cannot
 * retain work or ports, so process-tree assertions must not call it alive while PID 1 delays reaping. */
export const processIsRunning = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  if (process.platform !== "linux") return true
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
    const stateOffset = stat.lastIndexOf(") ") + 2
    return stat.slice(stateOffset, stateOffset + 1) !== "Z"
  } catch {
    return false
  }
}

/**
 * The PATH `bash` on Windows is the WSL stub, which fails with no such file. Resolve
 * a real one and fail loudly rather than skipping every .sh tool.
 */
export const resolveBash = () => {
  const candidates = [
    process.env.ORBIT_BASH,
    // On Windows the PATH `bash` may be the WSL app-execution alias. Its `--version` probe can
    // wait forever and spawn a child that outlives a killed test runner. Known Git Bash paths are
    // deterministic and do not cross that alias. POSIX keeps the ordinary PATH lookup.
    process.platform === "win32" ? null : "bash",
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  ].filter(Boolean)
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8", timeout: 5000, windowsHide: true })
    if (!probe.error && probe.status === 0) return candidate
  }
  return null
}

export const BASH = resolveBash()

/**
 * The repository's real .claude/orchestrator.json. A fixture derives from the shipped file
 * rather than a hand-typed copy, so a fixture cannot silently agree with a guess about the
 * schema while the real config carries something else.
 */
export const realOrchestratorConfig = () => JSON.parse(readFileSync(join(REPO_ROOT, ".claude", "orchestrator.json"), "utf8"))

let ghEnvelopeManifest

const ghEnvelopes = () => {
  if (!ghEnvelopeManifest) {
    ghEnvelopeManifest = JSON.parse(readFileSync(join(TOOLS_DIR, "__fixtures__", "gh-issue-envelopes.json"), "utf8"))
  }
  return ghEnvelopeManifest.commands
}

const jsonType = (value) => {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value === "object" ? "object" : typeof value
}

const ISSUE_STATES = new Set(["OPEN", "CLOSED"])
const STATE_REASONS = new Set(["COMPLETED", "NOT_PLANNED", "DUPLICATE", "REOPENED"])
const BOARD_STATUSES = new Set(["Backlog", "Todo", "In Progress", "In Review", "Done", "Canceled", "Duplicate"])

const assertRecordedGhValue = (command, value, recordedPaths, path = "$") => {
  const actualType = jsonType(value)
  const recorded = recordedPaths[path]
  if (!recorded) throw new Error(`gh fixture ${command} asserts unrecorded key ${path}`)
  if (!recorded.types.includes(actualType)) {
    const expected = recorded.types.join(" | ")
    throw new Error(`gh fixture ${command} asserts type ${actualType} at ${path}; recorded types: ${expected}`)
  }
  if (/(?:^|\.)state$/.test(path) && typeof value === "string" && !ISSUE_STATES.has(value)) {
    throw new Error(`gh fixture ${command} asserts unsupported enum at ${path}: ${JSON.stringify(value)}`)
  }
  if (/\.stateReason$/.test(path) && value !== null && (typeof value !== "string" || !STATE_REASONS.has(value))) {
    throw new Error(`gh fixture ${command} asserts unsupported enum at ${path}: ${JSON.stringify(value)}`)
  }
  if (/\.status$/.test(path) && typeof value === "string" && !BOARD_STATUSES.has(value)) {
    throw new Error(`gh fixture ${command} asserts unsupported enum at ${path}: ${JSON.stringify(value)}`)
  }
  if (actualType === "array") {
    for (const item of value) assertRecordedGhValue(command, item, recordedPaths, `${path}[]`)
    return
  }
  if (actualType !== "object") return
  for (const [key, child] of Object.entries(value)) {
    assertRecordedGhValue(command, child, recordedPaths, `${path}.${key}`)
  }
}

const ghEnvelopeName = (command, entry) => {
  /** Before the generic issue view; the lookahead keeps a multi-field list like `--json comments,body` out of this envelope. */
  if (/\bissue\s+view\b[\s\S]*--json\s+comments(?=\s|$)/.test(command)) return "issueViewComments"
  if (/\bissue\s+view\b/.test(command)) return (entry.exit ?? 0) === 0 ? "issueView" : "issueViewError"
  if (/\bissue\s+list\b/.test(command)) return "issueList"
  if (/\bproject\s+item-list\b/.test(command)) return "projectItemList"
  if (/\blabel\s+list\b/.test(command)) return "labelList"
  // Writes deliberately have NO envelope. Recording one would mean mutating real tickets, and the
  // recorder is read-only, so a write stub proves itself with the explicit exit-code-only escape
  // instead of against an invented success object.
  return null
}

/**
 * What counts as a ticket command at all. Anything matching this must either resolve to a recorded
 * envelope or declare the explicit exit-code-only escape. `gh pr ...` and everything else is not a
 * ticket command and is left alone, which is what keeps the PR stubs working.
 */
const TICKET_COMMAND = /\b(?:issue|project|label)\s+[a-z-]+/

/**
 * Every stubbed GitHub ticket reply is checked against tools/__fixtures__/gh-issue-envelopes.json,
 * which is RECORDED output from the real gh CLI. This is the guard against the most expensive
 * mistake available here: inventing a field and adding the mock that agrees with the invention,
 * so the harness stays green over a defect. The fixture is never regenerated to make a case pass.
 */
const assertGhTicketStub = (entry) => {
  const command = String(entry.match)
  const envelopeName = ghEnvelopeName(command, entry)
  const output = envelopeName === "issueViewError" ? String(entry.stderr ?? "") : String(entry.stdout ?? "")
  /**
   * The read-only recorder cannot create an issue to capture this write output. The exact installed
   * GitHub CLI v2.97.0 source does provide it: pkg/cmd/issue/create/create.go ends the successful
   * submit path with `fmt.Fprintln(opts.IO.Out, newIssue.URL)`. Keep this narrower than the generic
   * exit-code escape so no JSON field can be invented under it.
   */
  if (entry.verifiedTicketOutput === "issueCreateUrl") {
    if (!/\bissue\s+create\b/.test(command)) throw new Error(`gh fixture ${command} applies issueCreateUrl to a non-create command`)
    if (!/^https:\/\/github\.com\/thomasluizon\/orbit-tickets\/issues\/[1-9]\d*\/?\r?\n?$/.test(output)) {
      throw new Error(`gh fixture ${command} asserts an invalid verified issue-create URL`)
    }
    return
  }
  /**
   * A ticket command with no recorded envelope is a hole, not a pass. The Linear guard this
   * replaced refused any `orca linear` command it had no envelope for, and only skipped commands
   * that were not Linear at all. Skipping every unrecognised `gh issue` and `gh project` command
   * would have let `issue close`, `issue edit`, `issue create` and `project item-add`, which are
   * exactly the ticket mutations, carry any invented output shape a stub liked.
   *
   * The escape is deliberate and explicit, as it was before: a write whose caller branches only on
   * the exit code declares `ignoreTicketShape: true` AND keeps its output empty. Empty output is
   * stronger than an invented success object the real CLI may never emit, and requiring the flag
   * means a test author states that intent rather than getting it by omission.
   */
  if (entry.ignoreTicketShape === true && output === "") return
  if (!envelopeName) {
    if (TICKET_COMMAND.test(command)) {
      throw new Error(`gh fixture ${command} has no recorded invocation envelope; record one, or declare ignoreTicketShape: true with empty output`)
    }
    return
  }
  const envelope = ghEnvelopes()[envelopeName]
  if (!envelope) throw new Error(`gh fixture ${command} has no recorded invocation envelope (${envelopeName})`)
  if (envelopeName === "issueViewError") {
    assertRecordedGhValue(command, output, envelope.paths)
    return
  }
  let response
  try {
    response = JSON.parse(output)
  } catch {
    throw new Error(`gh fixture ${command} has non-JSON stdout`)
  }
  assertRecordedGhValue(command, response, envelope.paths)
}

/**
 * orca is stubbed by pointing ORCA_BIN at this node binary and preloading a shim.
 * The shim answers a stubbed plan when node was invoked as orca (argv[1] is a
 * subcommand, not a file) and stands aside when node is running the tool itself.
 * An unstubbed call exits 9 with a stub-miss payload, so an unexpected orca call is
 * a loud failure rather than a silent pass.
 */
export const ORCA_SHIM = stage(
  "orca-shim.cjs",
  `const { existsSync, readFileSync, rmSync, writeFileSync } = require("node:fs")
const { spawn } = require("node:child_process")
const argv = process.argv.slice(1)
if (argv[0] && existsSync(argv[0])) return
const line = argv.join(" ")
const plan = JSON.parse(process.env.ORBIT_ORCA_STUB || "[]")
const match = plan.find((entry) => line.includes(entry.match))
if (!match) {
  process.stdout.write(JSON.stringify({ ok: false, error: { code: "stub-miss", message: "unstubbed orca call: " + line } }))
  process.exit(9)
}
if (match.removePath) rmSync(match.removePath, { recursive: true, force: true })
if (match.hangTreePidFile) {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
  writeFileSync(match.hangTreePidFile, String(child.pid))
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
}
if (match.stdinFile) writeFileSync(match.stdinFile, readFileSync(0, "utf8"))
if (Array.isArray(match.stdoutSequence) && match.sequenceFile) {
  const index = existsSync(match.sequenceFile) ? Number(readFileSync(match.sequenceFile, "utf8")) : 0
  const selected = match.stdoutSequence[Math.min(index, match.stdoutSequence.length - 1)]
  writeFileSync(match.sequenceFile, String(index + 1))
  process.stdout.write(selected)
} else {
  process.stdout.write(match.stdout || "")
}
process.stderr.write(match.stderr || "")
process.exit(match.exit ?? 0)
`,
)

/**
 * NODE_OPTIONS treats a backslash inside quotes as an escape, so the shim path goes in POSIX form.
 * The same shim answers `gh`, because it keys on the command line and nothing else: verify-delivery.mjs
 * shells out to `gh pr list`, and a stub plan entry matching `pr list --head` answers it.
 */
export const orcaEnv = (plan) => {
  for (const entry of plan) assertGhTicketStub(entry)
  return {
    ORCA_BIN: process.execPath,
    GH_BIN: process.execPath,
    NODE_OPTIONS: `--require "${ORCA_SHIM.replaceAll("\\", "/")}"`,
    ORBIT_ORCA_STUB: JSON.stringify(plan),
  }
}

export const run = (file, argv, options = {}) => {
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

export const check = (file, name, argv, expect, options = {}) => {
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

/**
 * Stages a private copy of a tool beside a hand-written .claude/orchestrator.json, because
 * tools/lib/orchestrator-config.mjs resolves that config two levels up from its own location.
 * Returns the copy's path, so each config variant is a fresh, isolated run. The staged base is
 * outside every git repository, which is also what keeps the config staleness guard standing
 * aside: it refuses only a working copy it can prove disagrees with origin.
 */
export const stageWithConfig = (label, tool, config) => {
  const base = join(root, "staged", label)
  mkdirSync(join(base, "tools"), { recursive: true })
  mkdirSync(join(base, ".claude"), { recursive: true })
  writeFileSync(join(base, ".claude", "orchestrator.json"), `${JSON.stringify(config, null, 2)}\n`)
  cpSync(join(REPO_ROOT, ".claude", "linear-to-github-map.json"), join(base, ".claude", "linear-to-github-map.json"))
  cpSync(join(TOOLS_DIR, tool), join(base, "tools", tool))
  cpSync(join(TOOLS_DIR, "lib"), join(base, "tools", "lib"), { recursive: true })
  return { path: join(base, "tools", tool), base, configPath: join(base, ".claude", "orchestrator.json") }
}

/** A real git repository with a bare origin and one commit on main, under the fixture root. */
export const stageRepo = (label) => {
  const path = join(root, "repos", label)
  const origin = join(root, "repos", `${label}.git`)
  mkdirSync(path, { recursive: true })
  const git = (args, cwd = path) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
  if (spawnSync("git", ["init", "-q", "--bare", origin], { encoding: "utf8" }).status !== 0) return null
  for (const args of [
    ["init", "-q", "--initial-branch=main"],
    ["config", "user.email", "gate@orbit.test"],
    ["config", "user.name", "Orbit Gate"],
    ["commit", "-q", "--allow-empty", "-m", "base"],
    ["remote", "add", "origin", origin],
    ["push", "-q", "-u", "origin", "main"],
  ]) {
    if (git(args).status !== 0) return null
  }
  return { path, origin, git }
}

export const failureCount = () => fails
