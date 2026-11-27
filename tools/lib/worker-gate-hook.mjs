/**
 * The gate hook of a code worker, on the `Stop` event. It runs the gate on the worktree, writes `<git dir>/orbit-gate.json`
 * (`{ run, head, green, failures, blocks, at }`) and, for a red gate, returns `decision: "block"` so the worker fixes it.
 * It blocks at most `MAX_BLOCKS` times in one run. The next stop ends the run with `green: false`.
 * The gate commands come from `gate-commands.mjs`, the list that the size hook allows at the hard cap.
 */

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { escapeRegex } from "./escape-regex.mjs"
import { GATE_SCRIPTS, readGate, recordFile } from "./gate-commands.mjs"
import { measure } from "./worker-size-hook.mjs"

export const MAX_BLOCKS = 3
export const TAIL_LINES = 40
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000
const OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024
const WORKSPACE = /^((?:apps|packages)\/[^/]+|eslint-rules)\//
const SOURCE = /\.[cm]?[jt]sx?$/
const TOOLS_SOURCE = /^(?:tools|\.claude)\//
const TOOLS_TESTS = "tools/__tests__"

const git = (cwd, args) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr || result.error?.message || "").trim()}`)
  return result.stdout.trim()
}

const scriptsOf = (directory) => {
  try {
    return JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).scripts ?? {}
  } catch {
    return {}
  }
}

/** The text of a command for the block reason and the record. */
const textOf = ({ program, args, directory }) => `${directory === "" ? "" : `(in ${directory}) `}${[program, ...args].join(" ")}`

/**
 * The `test-tools.mjs` arguments for the changed paths of `tools/` and `.claude/`: one `--only <module>` for each module of
 * `tools/__tests__` that has the name of a changed file or names its base name with its extension. A changed path that no module
 * covers (a file that only another file of `tools/` reaches, a deleted test) gives the whole suite, so no path gates green untested.
 * A repository with no `tools/test-tools.mjs` (orbit-api, orbit-landing-page) gets no tool tests.
 */
export const toolTests = (top, paths) => {
  const changed = paths.filter((path) => TOOLS_SOURCE.test(path))
  if (changed.length === 0 || !existsSync(join(top, "tools", "test-tools.mjs"))) return []
  const folder = join(top, TOOLS_TESTS)
  const modules = existsSync(folder) ? readdirSync(folder).filter((file) => file.endsWith(".mjs") && !file.startsWith("_") && !file.endsWith(".test.mjs")).map((file) => file.slice(0, -".mjs".length)) : []
  const sources = new Map(modules.map((name) => [name, readFileSync(join(folder, `${name}.mjs`), "utf8")]))
  const selected = new Set()
  for (const path of changed) {
    const base = path.slice(path.lastIndexOf("/") + 1)
    const reference = new RegExp(`[/"']${escapeRegex(base)}["']`)
    const covering = [...sources].filter(([module, text]) => module === base.replace(/\.[^.]*$/, "") || reference.test(text)).map(([module]) => module)
    if (covering.length === 0) return [[]]
    for (const module of covering) selected.add(module)
  }
  return [...selected].sort().map((module) => ["--only", module])
}

/**
 * The gate commands for the changed paths: for each touched workspace its type check, its lint and `vitest related` on its changed
 * source files; for a diff in `tools/` or `.claude/` the tool tests of each changed module, or the whole suite for a path that no module covers; and the dash check of every changed file.
 * `paths` holds the paths of the diff, and `exists` tells which of them are still files. A deleted file is no input to a command.
 * A command runs only when the repository holds its script or its workspace manifest, so a sibling repository gets no command it cannot pass.
 */
export const gateCommands = (top, paths, exists = (path) => existsSync(join(top, path))) => {
  const present = paths.filter(exists)
  const commands = []
  const workspaces = [...new Set(paths.map((path) => WORKSPACE.exec(path)?.[1]).filter(Boolean))].filter((workspace) => existsSync(join(top, workspace, "package.json"))).sort()
  for (const workspace of workspaces) {
    const scripts = scriptsOf(join(top, workspace))
    for (const script of GATE_SCRIPTS) {
      if (script in scripts) commands.push({ program: "npm", args: ["run", script, "-w", workspace], directory: "" })
    }
    const related = present.filter((path) => path.startsWith(`${workspace}/`) && SOURCE.test(path)).map((path) => path.slice(workspace.length + 1))
    // `--passWithNoTests` keeps a change that no test reaches from turning the gate red.
    if (related.length > 0) commands.push({ program: "npx", args: ["vitest", "related", "--run", "--passWithNoTests", ...related], directory: workspace })
  }
  for (const args of toolTests(top, paths)) commands.push({ program: "node", args: ["tools/test-tools.mjs", ...args], directory: "" })
  if (present.length > 0 && existsSync(join(top, "tools", "check-dashes.mjs"))) commands.push({ program: "node", args: ["tools/check-dashes.mjs", "--files", ...present], directory: "" })
  return commands
}

/** The last `TAIL_LINES` lines of the output of a command. */
export const tailOf = (text) => text.replace(/\n+$/, "").split("\n").slice(-TAIL_LINES).join("\n")

/** Runs one command and returns `{ command, ok, tail }`. A command that does not start or runs past its limit is red. */
const run = (top, entry) => {
  const result = spawnSync(entry.program, entry.args, { cwd: join(top, entry.directory), encoding: "utf8", windowsHide: true, timeout: COMMAND_TIMEOUT_MS, maxBuffer: OUTPUT_LIMIT_BYTES })
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
  const note = result.error ? `${result.error.message}\n` : ""
  return { command: textOf(entry), ok: result.status === 0 && !result.error, tail: tailOf(`${output}${note}`) }
}

/** The rename is atomic, so a reader never sees half a file. */
const writeGate = (gitDir, record) => {
  writeFileSync(`${recordFile(gitDir)}.${process.pid}`, JSON.stringify(record))
  renameSync(`${recordFile(gitDir)}.${process.pid}`, recordFile(gitDir))
}

const STATUS = ["status", "--porcelain", "--untracked-files=all"]

/** True when the worktree holds no commit since the launch and no change. `baseline` is the head of the launch, or null. */
const untouched = (top, head, baseline, status) => (head === (baseline ?? git(top, ["merge-base", "origin/main", "HEAD"]))) && status === ""

/** The block reason: each failed command with the last lines of its output. */
export const blockReason = (failures) =>
  `The gate failed. Fix each failure, commit the fix and end the run.\n\n${failures.map(({ command, tail }) => `Failed command: ${command}\n${tail}`).join("\n\n")}`

/** The Stop output that blocks. `decision: "block"` and `reason` are the top-level fields of claude 2.1.332. */
export const blockOutput = (reason) => ({ decision: "block", reason })

/**
 * Runs the gate and writes the record. Returns the Stop output, or null when the run may end. `run` names the launch: a record
 * of another run starts the count of blocks again. `baseline` is the head at the launch. `execute` runs one gate command.
 */
export const gate = ({ cwd, run: runName = null, baseline = null, now = new Date(), execute = run }) => {
  const counted = measure(cwd)
  const head = git(counted.top, ["rev-parse", "HEAD"])
  const previous = readGate(counted.gitDir)
  const blocks = previous !== null && previous.run === runName ? previous.blocks : 0
  const finish = (record) => writeGate(counted.gitDir, { run: runName, head, ...record, at: now.toISOString() })
  // The gate tests the files of the worktree and the record names a commit, so a file that no commit holds is a failure. The driver pushes the commit.
  const status = git(counted.top, STATUS)
  if (untouched(counted.top, head, baseline, status)) {
    finish({ green: true, failures: [], blocks })
    return null
  }
  const dirty = status === "" ? [] : [{ command: `git ${STATUS.join(" ")}`, tail: tailOf(status) }]
  const failures = [...dirty, ...gateCommands(counted.top, counted.paths).map((entry) => execute(counted.top, entry)).filter((result) => !result.ok).map(({ command, tail }) => ({ command, tail }))]
  if (failures.length === 0) {
    finish({ green: true, failures: [], blocks })
    return null
  }
  if (blocks >= MAX_BLOCKS) {
    finish({ green: false, failures, blocks })
    return null
  }
  finish({ green: false, failures, blocks: blocks + 1 })
  return blockOutput(blockReason(failures))
}

const argument = (args, name) => {
  const index = args.indexOf(name)
  return index === -1 ? null : args[index + 1] ?? null
}

/**
 * Reads the hook input on stdin. A run key comes from `--run`, or from the session of the input. The hook exits 1 when it cannot
 * run the gate, which lets the worker end: the driver reads a missing record as a red gate and pushes nothing.
 */
const main = () => {
  try {
    const args = process.argv.slice(2)
    const input = JSON.parse(readFileSync(0, "utf8"))
    const output = gate({ cwd: input.cwd, run: argument(args, "--run") ?? input.session_id ?? null, baseline: argument(args, "--head") })
    if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`)
    return
  } catch (error) {
    console.error(`The gate hook could not run the gate. ${error.message}`)
  }
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main()
