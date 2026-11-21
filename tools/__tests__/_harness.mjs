import { spawn, spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

/** Injected by the runner. These are live bindings: configure() runs before any case module is imported. */
export let TOOLS_DIR = ""
export let REPO_ROOT = ""

export const configure = ({ toolsDir }) => {
  TOOLS_DIR = toolsDir
  REPO_ROOT = resolve(toolsDir, "..")
}

/** The one path helper case modules use, so injection failure surfaces as a wrong path. */
export const toolPath = (file) => join(TOOLS_DIR, file)

export const EM_DASH = String.fromCharCode(0x2014)

let fails = 0
let assertions = 0

export const T = (name, ok, detail = "") => {
  if (!ok) fails++
  assertions++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `\n     ${detail}`}`)
}

/** One check that `got` and `want` serialize to the same JSON; a failure prints both. */
export const same = (name, got, want) => T(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)

// Resolve the temp root to its real path so fixtures match paths returned by git.
export const root = mkdtempSync(join(realpathSync(tmpdir()), "orbit-tools-gate-"))

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

/** `kill(pid, 0)` also succeeds for a defunct child. A zombie has terminated and cannot
 * retain work or ports, so process-tree assertions must not call it alive while PID 1 delays reaping. */
export const processIsRunning = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  if (process.platform === "darwin") {
    const state = spawnSync("ps", ["-p", String(pid), "-o", "stat="], { encoding: "utf8" })
    return state.status === 0 && !state.stdout.trim().startsWith("Z")
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

/** Interrupt only after the fake GitHub read has started its complete process tree. */
export const interruptGithubRead = async ({ path, args, env, signal, pidFile, descendantPidFile, startupTimeoutMs = 60000, cleanupPids = () => [] }) => {
  const child = spawn(process.execPath, [path, ...args], {
    env: { ...process.env, ...env }, detached: process.platform !== "win32",
  })
  const killTree = () => {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { windowsHide: true })
      return
    }
    try { process.kill(-child.pid, "SIGKILL") } catch { /* the process group may have already exited */ }
  }
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk) => { stdout += chunk })
  child.stderr.on("data", (chunk) => { stderr += chunk })
  let exited = false
  child.once("exit", () => { exited = true })
  const closed = new Promise((resolve) => child.once("close", (status, signal) => resolve({ status, signal })))
  const readPid = (file) => existsSync(file) ? Number(readFileSync(file, "utf8")) : null
  const startupDeadline = Date.now() + startupTimeoutMs
  let pids
  while (true) {
    pids = [readPid(pidFile), readPid(descendantPidFile)]
    if (pids.every(processIsRunning) || exited || Date.now() >= startupDeadline) break
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  const started = !exited && pids.every(processIsRunning)
  const startupError = started ? null : exited
    ? "Tool exited before both GitHub shim pid files held live pids"
    : `GitHub shim pid files did not hold live pids within ${startupTimeoutMs}ms`
  if (started) child.kill(signal)
  else if (!exited) killTree()
  const watchdog = setTimeout(killTree, 3000)
  const exit = await closed
  clearTimeout(watchdog)
  // Extra cleanup pids must not turn an unreported process tree into successful GitHub startup.
  pids = [...pids, child.pid, ...cleanupPids()]
  const cleanupDeadline = Date.now() + 1000
  while (pids.some(processIsRunning) && Date.now() < cleanupDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  const terminated = pids.every((pid) => !processIsRunning(pid))
  for (const pid of pids) {
    if (processIsRunning(pid)) {
      try { process.kill(pid, "SIGKILL") } catch { /* the child can exit before cleanup */ }
    }
  }
  return { ...exit, started, startupError, terminated, stdout, stderr }
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

export const ORCA_SHIM = stage(
  "orca-shim.cjs",
  `const { existsSync, readFileSync, rmSync, writeFileSync, writeSync } = require("node:fs")
const { spawn } = require("node:child_process")
const argv = process.argv.slice(1)
if (argv[0] && existsSync(argv[0])) return
const line = argv.join(" ")
const plan = JSON.parse(process.env.ORBIT_ORCA_STUB || "[]")
let match = plan.find((entry) => line.includes(entry.match))
if (!match) {
  process.stdout.write(JSON.stringify({ ok: false, error: { code: "stub-miss", message: "unstubbed orca call: " + line } }))
  process.exit(9)
}
if (Array.isArray(match.responseSequence) && match.sequenceFile) {
  const index = existsSync(match.sequenceFile) ? Number(readFileSync(match.sequenceFile, "utf8")) : 0
  writeFileSync(match.sequenceFile, String(index + 1))
  match = { ...match, ...match.responseSequence[Math.min(index, match.responseSequence.length - 1)] }
}
if (match.removePath) rmSync(match.removePath, { recursive: true, force: true })
if (match.argvFile) writeFileSync(match.argvFile, JSON.stringify(argv))
if (match.stdinFile) writeFileSync(match.stdinFile, readFileSync(0, "utf8"))
if (match.delayMs) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, match.delayMs)
if (Array.isArray(match.stdoutSequence) && match.sequenceFile) {
  const index = existsSync(match.sequenceFile) ? Number(readFileSync(match.sequenceFile, "utf8")) : 0
  const selected = match.stdoutSequence[Math.min(index, match.stdoutSequence.length - 1)]
  writeFileSync(match.sequenceFile, String(index + 1))
  process.stdout.write(selected)
} else {
  process.stdout.write(match.stdout || "")
}
if (match.hangTreePidFile) {
  if (match.stderr) writeSync(2, match.stderr)
  const descendantSource = 'require("node:fs").writeFileSync(' + JSON.stringify(match.hangTreePidFile) + ', String(process.pid)); setInterval(() => {}, 1000)'
  // The descendant publishes readiness itself and must not redispatch the CLI preload with empty argv.
  spawn(process.execPath, ["-e", descendantSource], { stdio: "ignore", env: { ...process.env, NODE_OPTIONS: "" } })
  if (match.hangPidFile) writeFileSync(match.hangPidFile, String(process.pid))
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
}
process.stderr.write(match.stderr || "")
process.exit(match.exit ?? 0)
`,
)

/**
 * NODE_OPTIONS treats a backslash inside quotes as an escape, so the shim path goes in POSIX form.
 * The same shim answers `gh`, because it keys on the command line and nothing else.
 */
export const orcaEnv = (plan) => {
  return {
    ORCA_BIN: process.execPath,
    GH_BIN: process.execPath,
    PULLFROG_BIN: process.execPath,
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

/** A copy of one tool and of tools/lib under the fixture root, so a case can run the tool beside a stub of its sibling files. */
export const stageTool = (label, tool) => {
  const base = join(root, "staged", label)
  mkdirSync(join(base, "tools"), { recursive: true })
  cpSync(join(TOOLS_DIR, tool), join(base, "tools", tool))
  cpSync(join(TOOLS_DIR, "lib"), join(base, "tools", "lib"), { recursive: true })
  return { path: join(base, "tools", tool), base }
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
export const assertionCount = () => assertions
