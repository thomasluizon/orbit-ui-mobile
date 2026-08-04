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

/**
 * The PATH `bash` on Windows is the WSL stub, which fails with no such file. Resolve
 * a real one and fail loudly rather than skipping every .sh tool.
 */
export const resolveBash = () => {
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

export const BASH = resolveBash()

/**
 * The repository's real .claude/orchestrator.json. A fixture derives from the shipped file
 * rather than a hand-typed copy, so a fixture cannot silently agree with a guess about the
 * schema while the real config carries something else.
 */
export const realOrchestratorConfig = () => JSON.parse(readFileSync(join(REPO_ROOT, ".claude", "orchestrator.json"), "utf8"))

let linearEnvelopeManifest

const linearEnvelopes = () => {
  if (!linearEnvelopeManifest) {
    linearEnvelopeManifest = JSON.parse(readFileSync(join(TOOLS_DIR, "__fixtures__", "orca-linear-envelopes.json"), "utf8"))
  }
  return linearEnvelopeManifest.commands
}

const jsonType = (value) => {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value === "object" ? "object" : typeof value
}

const STATE_TYPES = new Set(["triage", "backlog", "unstarted", "started", "completed", "canceled", "duplicate"])
const RELATIONSHIPS = new Set(["blocks", "blockedBy", "relatedTo", "duplicateOf"])

const assertRecordedLinearValue = (command, value, recordedPaths, path = "$") => {
  const actualType = jsonType(value)
  const recorded = recordedPaths[path]
  if (!recorded) throw new Error(`orca fixture ${command} asserts unrecorded key ${path}`)
  if (!recorded.types.includes(actualType)) {
    const expected = recorded.types.join(" | ")
    throw new Error(`orca fixture ${command} asserts type ${actualType} at ${path}; recorded types: ${expected}`)
  }
  if (/\.state\.type$/.test(path) && typeof value === "string" && !STATE_TYPES.has(value)) {
    throw new Error(`orca fixture ${command} asserts unsupported enum at ${path}: ${JSON.stringify(value)}`)
  }
  if (/\.relations\[\]\.relationship$/.test(path) && typeof value === "string" && !RELATIONSHIPS.has(value)) {
    throw new Error(`orca fixture ${command} asserts unsupported enum at ${path}: ${JSON.stringify(value)}`)
  }
  if (actualType === "array") {
    for (const item of value) assertRecordedLinearValue(command, item, recordedPaths, `${path}[]`)
    return
  }
  if (actualType !== "object") return
  for (const [key, child] of Object.entries(value)) {
    assertRecordedLinearValue(command, child, recordedPaths, `${path}.${key}`)
  }
}

const linearEnvelopeName = (command, response) => {
  if (response?.ok === false || response?.error) {
    if (/\blinear\s+create\b/.test(command)) return "createError"
    if (/\blinear\s+team\s+labels\b/.test(command)) return "teamLabelsError"
    if (/\blinear\s+issue\b/.test(command)) return "issueError"
    return null
  }
  if (/\blinear\s+status\s+set\b/.test(command)) return "statusSet"
  if (/\blinear\s+create\b/.test(command)) return "create"
  if (/\blinear\s+list-issues\b/.test(command)) return "listIssues"
  if (/\blinear\s+team\s+labels\b/.test(command)) return "teamLabels"
  if (!/\blinear\s+issue\b/.test(command)) return null
  if (/\s--full(?:\s|$)/.test(command)) return "issueFull"
  if (/\s--attachments(?:\s|$)/.test(command) || Object.hasOwn(response?.result ?? {}, "attachments")) return "issueAttachments"
  if (/\s--comments(?:\s|$)/.test(command) || Object.hasOwn(response?.result ?? {}, "comments")) return "issueComments"
  if (/\s--relations(?:\s|$)/.test(command) || Object.hasOwn(response?.result ?? {}, "relations")) return "issueRelations"
  return "issueDefault"
}

/**
 * Every stubbed Linear reply is checked against tools/__fixtures__/orca-linear-envelopes.json,
 * which is RECORDED output from the real orca CLI. This is the guard against the most expensive
 * mistake available here: inventing a field and adding the mock that agrees with the invention,
 * so the harness stays green over a defect. The fixture is never regenerated to make a case pass.
 */
const assertOrcaLinearStub = (entry, stdout) => {
  const command = String(entry.match)
  if (!/\blinear\s+/.test(command)) return
  let response
  let parsedJson = false
  try {
    response = JSON.parse(stdout)
    parsedJson = true
  } catch {
    response = null
  }
  const envelopeName = linearEnvelopeName(command, response)
  if (!envelopeName) throw new Error(`orca fixture ${command} has no recorded invocation envelope`)
  if (!parsedJson) {
    if (entry.allowNonJsonLinear === true) return
    throw new Error(`orca fixture ${command} has non-JSON stdout without allowNonJsonLinear: true`)
  }
  const envelope = linearEnvelopes()[envelopeName]
  if (!envelope) throw new Error(`orca fixture ${command} has no recorded invocation envelope (${envelopeName})`)
  assertRecordedLinearValue(command, response, envelope.paths)
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
  `const { existsSync, rmSync } = require("node:fs")
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
process.stdout.write(match.stdout)
process.exit(match.exit ?? 0)
`,
)

/**
 * NODE_OPTIONS treats a backslash inside quotes as an escape, so the shim path goes in POSIX form.
 * The same shim answers `gh`, because it keys on the command line and nothing else: verify-delivery.mjs
 * shells out to `gh pr list`, and a stub plan entry matching `pr list --head` answers it.
 */
export const orcaEnv = (plan) => {
  for (const entry of plan) assertOrcaLinearStub(entry, entry.stdout)
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
