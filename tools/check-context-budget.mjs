#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CLAUDE_PATH = join(REPO_ROOT, "CLAUDE.md")
const RULES_PATH = join(REPO_ROOT, ".claude", "rules")
const BASELINE_PATH = join(REPO_ROOT, "tools", "context-budget.json")
const BASELINE_REPO_PATH = "tools/context-budget.json"
const ON_DEMAND_BASELINE_PATH = join(REPO_ROOT, "tools", "on-demand-budget.json")
const ON_DEMAND_BASELINE_REPO_PATH = "tools/on-demand-budget.json"
/** Empty on purpose: no `@` import is permitted in the repository CLAUDE.md. */
const EXPECTED_IMPORTS = new Set()
const EXPECTED_UNCONDITIONAL_RULES = new Set([".claude/rules/core.md"])
/**
 * The only shapes the always-loaded ceiling can ever measure. A baseline key outside this set would
 * sit in the ceiling without ever being measured against, which is a budget reporting green over a
 * file it never read.
 */
const MEASURABLE_BASELINE_KEY = /^(?:CLAUDE\.md|\.claude\/rules\/[^/]+\.md)$/
/**
 * The SECOND measured set, and it means something different from the first: these files are NOT
 * loaded every turn. They are instruction files a skill pulls in WHEN IT RUNS, so their cost is paid
 * per invocation rather than per turn. They get their own shrink-only ceiling in a separate baseline
 * file so no reader can mistake one budget for the other, and they are deliberately excluded from
 * the full-session total. Adding a path here is a human judgement that the file is on-demand
 * instruction text worth capping; the ceiling itself is always measured, never hand written.
 *
 * BEFORE YOU ADD AN ENTRY: pin the file to `eol=lf` in .gitattributes first. A byte ceiling over an
 * unpinned file means two different things on two platforms, because a CRLF checkout carries one
 * extra byte per line; this very file measured 54,305 on a Windows checkout and 53,533 on a Linux
 * one before it was pinned, so a ceiling taken from either reading would have passed every local
 * check and failed the first CI run. REQUIRED_EOL_ATTRIBUTE turns that from advice into a gate.
 */
const ON_DEMAND_FILES = [".claude/skills/orchestrate/SKILL.md"]
/** Every byte-budgeted file must check out identically everywhere, or its ceiling is meaningless. */
const REQUIRED_EOL_ATTRIBUTE = "lf"

const USAGE = `usage: check-context-budget.mjs [--check | --write-baseline] [--json]

Three figures, and they mean three different things:

  1. ALWAYS-LOADED total, ENFORCED. This repository's CLAUDE.md plus its unconditional
     .claude/rules/*.md files: the context that loads on EVERY turn, which is the reason this
     budget exists. Ratcheted shrink-only against tools/context-budget.json, and CI-blocking.

  2. ON-DEMAND total, ENFORCED SEPARATELY. Instruction files a skill loads WHEN IT RUNS, not every
     turn. Ratcheted shrink-only against tools/on-demand-budget.json. It is a per-invocation cost,
     so it is deliberately NOT added to figure 1 or figure 3. Confusing the two misreads both: a
     large on-demand file costs nothing on a turn that never runs it, and a small always-loaded
     file costs something on every turn there is.

  3. FULL SESSION, REPORTED AND NEVER ENFORCED. Figure 1 plus the user-level Claude context outside
     this repository: ~/.claude/CLAUDE.md, the unconditional ~/.claude/rules/*.md files, the
     project memory index at ~/.claude/projects/<project-slug>/memory/MEMORY.md, and whatever
     their @ imports pull in (today, the brain vault's hot.md).

Figure 3 can never be enforced. This tool derives REPO_ROOT from its own location, so it has no
jurisdiction over a path outside the repository: those files differ on every machine and CI has none
of them at all, so ratcheting that total would fail every run on a figure no contributor can change.

Every file in figures 1 and 2 must be pinned to eol=lf in .gitattributes, and that is enforced here
rather than merely documented. A CRLF checkout carries one extra byte per line, so a ceiling taken
over an unpinned file passes on the platform it was measured on and fails on the other. Pin a file
before you budget it.

Every external file is reported with its ORIGIN, because that is what tells a reader how far to
trust the list. "declared" and "derived" are this tool's own judgement about what the runtime loads,
and they go stale silently if the runtime changes; "imported" was discovered by following an @
import and maintains itself. The memory index is derived rather than discovered because nothing
imports it: the runtime loads it from a directory named after the project path with every character
outside [A-Za-z0-9] replaced by a hyphen. An external file that cannot be read is NAMED with its
reason and the full-session total is reported as partial, never counted as zero and never dropped.

  --check           compare with the target branch's committed baselines (default)
  --write-baseline  write both baselines from the current measurement
  --json            print the result as machine-readable JSON
  --help, -h        print this usage and exit 0

exit codes:
  0  within both budgets, or baselines written
  1  either byte budget or a structural allowlist exceeded
  2  invalid arguments, malformed baseline, or tool error`

const toRepoPath = (absolutePath) => relative(REPO_ROOT, absolutePath).replace(/\\/g, "/")
const byteCount = (path) => readFileSync(path).byteLength
const estimatedTokens = (bytes) => Math.floor(bytes / 4)
const signed = (number) => `${number >= 0 ? "+" : ""}${number}`
const sumBytes = (values) => values.reduce((total, bytes) => total + bytes, 0)

function parseArguments() {
  const argumentsList = process.argv.slice(2)
  if (argumentsList.includes("--help") || argumentsList.includes("-h")) return { help: true }

  const known = new Set(["--check", "--write-baseline", "--json"])
  const unknown = argumentsList.find((argument) => !known.has(argument))
  const checks = argumentsList.filter((argument) => argument === "--check").length
  const writes = argumentsList.filter((argument) => argument === "--write-baseline").length
  const jsonFlags = argumentsList.filter((argument) => argument === "--json").length
  if (unknown || checks > 1 || writes > 1 || jsonFlags > 1 || (checks && writes)) {
    throw new Error(USAGE)
  }

  return {
    help: false,
    json: jsonFlags === 1,
    mode: writes === 1 ? "write" : "check",
  }
}

function hasPathsFrontmatter(text) {
  const normalized = text.replace(/^\uFEFF/, "")
  if (!normalized.startsWith("---\n") && !normalized.startsWith("---\r\n")) return false
  const lines = normalized.split(/\r?\n/)
  const closing = lines.indexOf("---", 1)
  if (closing === -1) return false
  return lines.slice(1, closing).some((line) => /^paths\s*:/.test(line))
}

function measureRepository() {
  if (!existsSync(CLAUDE_PATH) || !statSync(CLAUDE_PATH).isFile()) {
    throw new Error("CLAUDE.md is missing")
  }
  if (!existsSync(RULES_PATH) || !statSync(RULES_PATH).isDirectory()) {
    throw new Error(".claude/rules is missing")
  }

  const claudeText = readFileSync(CLAUDE_PATH, "utf8")
  const imports = claudeText
    .split(/\r?\n/)
    .filter((line) => line.startsWith("@"))
    .sort()
  const unexpectedImports = imports.filter((line) => !EXPECTED_IMPORTS.has(line))

  const unconditionalRules = []
  for (const name of readdirSync(RULES_PATH).filter((name) => name.endsWith(".md")).sort()) {
    const absolutePath = join(RULES_PATH, name)
    if (!statSync(absolutePath).isFile()) continue
    if (!hasPathsFrontmatter(readFileSync(absolutePath, "utf8"))) {
      unconditionalRules.push(toRepoPath(absolutePath))
    }
  }
  const unexpectedRules = unconditionalRules.filter((file) => !EXPECTED_UNCONDITIONAL_RULES.has(file))

  const enforcedPaths = [CLAUDE_PATH, ...unconditionalRules.map((file) => join(REPO_ROOT, file))]
  const files = Object.fromEntries(enforcedPaths.map((path) => [toRepoPath(path), byteCount(path)]))
  const enforcedBytes = sumBytes(Object.values(files))

  return {
    files,
    enforcedBytes,
    estimatedTokens: estimatedTokens(enforcedBytes),
    imports,
    unconditionalRules,
    unexpectedImports,
    unexpectedRules,
  }
}

/** The declared on-demand instruction files, measured in the repository that owns them. */
function measureOnDemandContext() {
  const onDemandFiles = {}
  const onDemandMissingFiles = []
  for (const repoPath of ON_DEMAND_FILES) {
    const absolutePath = join(REPO_ROOT, repoPath)
    if (existsSync(absolutePath) && statSync(absolutePath).isFile()) onDemandFiles[repoPath] = byteCount(absolutePath)
    else onDemandMissingFiles.push(repoPath)
  }
  return { onDemandFiles, onDemandBytes: sumBytes(Object.values(onDemandFiles)), onDemandMissingFiles }
}

/** Outside REPO_ROOT is a trust boundary: a failure returns its REASON so the path can be NAMED. */
const readExternal = (absolutePath) => {
  try {
    return statSync(absolutePath).isFile() ? { contents: readFileSync(absolutePath) } : { reason: "not a file" }
  } catch (error) {
    return { reason: error.code === "ENOENT" ? "absent" : `unreadable (${error.code})` }
  }
}

const listExternalRules = (directory) => {
  try {
    return readdirSync(directory)
      .filter((name) => name.endsWith(".md"))
      .sort()
  } catch {
    return null
  }
}

/** Home-relative where possible, so the report does not print a path nobody else has. */
const externalLabel = (absolutePath) => {
  const fromHome = relative(homedir(), absolutePath).replace(/\\/g, "/")
  return fromHome.startsWith("../") ? absolutePath.replace(/\\/g, "/") : `~/${fromHome}`
}

/**
 * The runtime keys a project's memory directory on the project path with every character outside
 * [A-Za-z0-9] replaced by a hyphen. Verified live against seven real directories under
 * ~/.claude/projects, including one with a dot segment and one with a Windows drive colon.
 * In a git worktree this derives that worktree's OWN index, which is the honest answer: a session
 * opened elsewhere loaded a different index and this tool cannot see where it was opened.
 */
const projectMemoryIndexPath = () =>
  join(homedir(), ".claude", "projects", REPO_ROOT.replace(/[^A-Za-z0-9]/g, "-"), "memory", "MEMORY.md")

/**
 * The always-loaded context this repository does not own. Two kinds of entry, and the distinction is
 * reported because it says how the list can rot: a DECLARED or DERIVED path is this tool's judgement
 * about what the runtime loads and goes stale silently if the runtime changes, while an IMPORTED one
 * was found by following an `@` import and maintains itself. Imports are followed transitively,
 * since an import of an import loads just the same; `visited` is what stops a cycle, not a depth
 * limit, so no reachable file is left unmeasured. Reported, never enforced, for the reason in USAGE.
 */
function measureExternalContext() {
  const rulesDirectory = join(homedir(), ".claude", "rules")
  const externalUnreadableFiles = []
  const pending = [
    { path: join(homedir(), ".claude", "CLAUDE.md"), origin: "declared", importedBy: null },
    { path: projectMemoryIndexPath(), origin: "derived", importedBy: null },
  ]

  const ruleNames = listExternalRules(rulesDirectory)
  if (ruleNames === null) {
    externalUnreadableFiles.push({ file: externalLabel(rulesDirectory), origin: "declared", reason: "absent", importedBy: null })
  } else {
    pending.push(...ruleNames.map((name) => ({ path: join(rulesDirectory, name), origin: "declared", importedBy: null })))
  }

  const externalFiles = []
  const visited = new Set()
  while (pending.length > 0) {
    const entry = pending.shift()
    if (visited.has(entry.path)) continue
    visited.add(entry.path)
    const read = readExternal(entry.path)
    if (read.contents === undefined) {
      externalUnreadableFiles.push({ file: externalLabel(entry.path), origin: entry.origin, reason: read.reason, importedBy: entry.importedBy })
      continue
    }
    const text = read.contents.toString("utf8")
    if (dirname(entry.path) === rulesDirectory && hasPathsFrontmatter(text)) continue
    externalFiles.push({ file: externalLabel(entry.path), bytes: read.contents.byteLength, origin: entry.origin, importedBy: entry.importedBy })
    for (const line of text.split(/\r?\n/).filter((candidate) => candidate.startsWith("@"))) {
      pending.push({ path: resolve(dirname(entry.path), line.slice(1).trim()), origin: "imported", importedBy: externalLabel(entry.path) })
    }
  }

  return {
    externalFiles,
    externalUnreadableFiles,
    externalBytes: sumBytes(externalFiles.map((file) => file.bytes)),
  }
}

function parseBaseline(text, source) {
  let baseline
  try {
    baseline = JSON.parse(text)
  } catch {
    throw new Error(`${source} is not valid JSON`)
  }

  const validFiles =
    baseline &&
    typeof baseline === "object" &&
    !Array.isArray(baseline) &&
    baseline.files &&
    typeof baseline.files === "object" &&
    !Array.isArray(baseline.files) &&
    Object.keys(baseline.files).length > 0 &&
    Object.values(baseline.files).every((bytes) => Number.isInteger(bytes) && bytes >= 0)
  const filesTotal = validFiles ? sumBytes(Object.values(baseline.files)) : -1
  if (!validFiles || !Number.isInteger(baseline.bytes) || baseline.bytes < 0 || baseline.bytes !== filesTotal) {
    throw new Error(`${source} must contain matching non-negative integer bytes and files values`)
  }
  return baseline
}

function readWorkingBaseline(absolutePath, repoPath) {
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`${repoPath} is missing`)
  }
  return parseBaseline(readFileSync(absolutePath, "utf8"), repoPath)
}

function runGit(argumentsList) {
  return spawnSync("git", argumentsList, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    windowsHide: true,
  })
}

function resolveTargetRef() {
  const configured = process.env.CONTEXT_BUDGET_BASE_REF?.trim()
  const githubBase = process.env.GITHUB_BASE_REF?.trim()
  const candidates = configured
    ? [configured]
    : githubBase
      ? [`refs/remotes/origin/${githubBase}`, githubBase]
      : ["refs/remotes/origin/main", "main"]

  for (const candidate of candidates) {
    const result = runGit(["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`])
    if (result.status === 0) return candidate
  }

  const requested = configured ?? githubBase ?? "origin/main or main"
  throw new Error(`target branch ${requested} is unavailable; fetch its history before checking`)
}

/**
 * `absentMeansUndeclared` is what lets a ceiling be introduced without a red first run: a baseline
 * present on neither side declares no ceiling at all, rather than being a missing file.
 */
function readComparisonBaseline(absolutePath, repoPath, absentMeansUndeclared = false) {
  const targetRef = resolveTargetRef()
  const listing = runGit(["ls-tree", "--name-only", targetRef, "--", repoPath])
  if (listing.status !== 0) {
    throw new Error(`could not inspect ${repoPath} on target branch ${targetRef}`)
  }
  if (listing.stdout.trim() === "") {
    if (absentMeansUndeclared && !existsSync(absolutePath)) return null
    return {
      ...readWorkingBaseline(absolutePath, repoPath),
      source: `${targetRef} (working tree bootstrap)`,
    }
  }

  const blob = runGit(["show", `${targetRef}:${repoPath}`])
  if (blob.status !== 0) {
    throw new Error(`could not read ${repoPath} from target branch ${targetRef}`)
  }
  return {
    ...parseBaseline(blob.stdout, `${repoPath} on target branch ${targetRef}`),
    source: targetRef,
  }
}

/**
 * git itself is the authority on what .gitattributes resolves to, so the pin is read with
 * `git check-attr` rather than by re-implementing pattern matching. Its output is one
 * `<path>: eol: <value>` line per path, with `unspecified` for an unpinned file; confirmed by
 * running it against pinned and unpinned paths in this repository.
 */
function unpinnedFiles(repoPaths) {
  if (repoPaths.length === 0) return []
  const result = runGit(["check-attr", "eol", "--", ...repoPaths])
  if (result.status !== 0) {
    throw new Error(`could not read .gitattributes eol settings: ${result.stderr.trim()}`)
  }
  const resolved = new Map()
  for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
    const match = /^(.*): eol: (\S+)$/.exec(line)
    if (match) resolved.set(match[1], match[2])
  }
  return repoPaths
    .map((file) => ({ file, eol: resolved.get(file) ?? "unreported" }))
    .filter((entry) => entry.eol !== REQUIRED_EOL_ATTRIBUTE)
}

function structuralFindings(measurement, baseline, onDemandBaseline) {
  const unmeasurable = baseline ? Object.keys(baseline.files).filter((file) => !MEASURABLE_BASELINE_KEY.test(file)) : []
  const undeclared = onDemandBaseline
    ? Object.keys(onDemandBaseline.files).filter((file) => !ON_DEMAND_FILES.includes(file))
    : []
  const misfiled = ON_DEMAND_FILES.filter((file) => MEASURABLE_BASELINE_KEY.test(file))
  const unpinned = unpinnedFiles([...Object.keys(measurement.files), ...Object.keys(measurement.onDemandFiles)])
  return [
    ...measurement.unexpectedImports.map((line) => `unexpected root import: ${line}`),
    ...measurement.unexpectedRules.map((file) => `unexpected unconditional rule: ${file}`),
    ...unmeasurable.map(
      (file) =>
        `${BASELINE_REPO_PATH} names ${file}, which this tool never measures, so its bytes inflate the always-loaded ceiling unchecked`,
    ),
    ...undeclared.map(
      (file) =>
        `${ON_DEMAND_BASELINE_REPO_PATH} names ${file}, which is not in the declared on-demand set, so its bytes inflate that ceiling unchecked`,
    ),
    ...measurement.onDemandMissingFiles.map(
      (file) => `declared on-demand file is missing from the repository: ${file}`,
    ),
    ...misfiled.map(
      (file) => `${file} is declared on-demand but loads on every turn, so it belongs to the always-loaded set`,
    ),
    ...unpinned.map(
      (entry) =>
        `${entry.file} is byte-budgeted but its .gitattributes eol is ${entry.eol}, not ${REQUIRED_EOL_ATTRIBUTE}, so its ceiling means a different number on a CRLF checkout than on an LF one`,
    ),
  ]
}

function outputOnDemand(result) {
  console.log("")
  console.log("on-demand instruction files, capped separately (loaded when a skill runs, NOT every turn):")
  for (const [file, bytes] of Object.entries(result.onDemandFiles)) console.log(`  ${file}: ${bytes} bytes`)
  console.log(`on-demand total: ${result.onDemandBytes} bytes`)
  if (result.onDemandBaselineBytes === null) {
    console.log("on-demand ceiling: NONE COMMITTED YET, run --write-baseline to record one")
    return
  }
  const source = result.onDemandBaselineSource === null ? "" : ` (${result.onDemandBaselineSource})`
  console.log(`on-demand ceiling: ${result.onDemandBaselineBytes} bytes${source}`)
  console.log(`on-demand delta:   ${signed(result.onDemandDeltaBytes)} bytes`)
}

function outputExternal(result) {
  console.log("")
  console.log("reported only, never enforced (outside this repository, and absent in CI):")
  for (const file of result.externalFiles) {
    const origin = file.importedBy ? `imported by ${file.importedBy}` : file.origin
    console.log(`  ${file.file}: ${file.bytes} bytes [${origin}]`)
  }
  for (const file of result.externalUnreadableFiles) {
    console.log(`  ${file.file}: UNREADABLE (${file.reason}), not counted [${file.origin}]`)
  }
  console.log(`external total:  ${result.externalBytes} bytes`)
  const partial = result.fullSessionComplete
    ? ""
    : `; PARTIAL, ${result.externalUnreadableFiles.length} external path(s) could not be read`
  console.log(
    `full session (always-loaded + reported): ${result.fullSessionComplete ? "" : "at least "}${result.fullSessionBytes} bytes (~${result.fullSessionEstimatedTokens} tokens, estimate)${partial}`,
  )
}

function outputHuman(result) {
  console.log("Always-loaded context budget")
  console.log("")
  console.log("file".padEnd(44) + "bytes".padStart(10) + "  ~tokens (estimate)".padStart(22))
  for (const [file, bytes] of Object.entries(result.files)) {
    console.log(file.padEnd(44) + String(bytes).padStart(10) + String(estimatedTokens(bytes)).padStart(22))
  }
  console.log("")
  console.log(`enforced total: ${result.enforcedBytes} bytes (~${result.estimatedTokens} tokens, estimate)`)
  if (result.baselineBytes !== null) {
    console.log(`baseline:       ${result.baselineBytes} bytes`)
    if (result.baselineSource !== null) console.log(`baseline source: ${result.baselineSource}`)
    console.log(`delta:          ${signed(result.deltaBytes)} bytes`)
  }
  outputOnDemand(result)
  outputExternal(result)
}

function growthOver(measuredFiles, baseline) {
  return baseline
    ? Object.entries(measuredFiles)
        .map(([file, bytes]) => ({ file, bytes: bytes - (baseline.files[file] ?? 0) }))
        .filter((entry) => entry.bytes > 0)
    : []
}

function reportGrowth(label, deltaBytes, growth) {
  console.error("")
  console.error(`${label} grew by ${deltaBytes} bytes beyond the committed baseline:`)
  for (const entry of growth) console.error(`  ${entry.file}: +${entry.bytes} bytes`)
}

function main() {
  let argumentsParsed
  try {
    argumentsParsed = parseArguments()
  } catch (error) {
    console.error(error.message)
    return 2
  }
  if (argumentsParsed.help) {
    console.log(USAGE)
    return 0
  }

  try {
    const measurement = { ...measureRepository(), ...measureOnDemandContext(), ...measureExternalContext() }
    let baseline = null
    let onDemandBaseline = null
    if (argumentsParsed.mode === "check") {
      baseline = readComparisonBaseline(BASELINE_PATH, BASELINE_REPO_PATH)
      onDemandBaseline = readComparisonBaseline(ON_DEMAND_BASELINE_PATH, ON_DEMAND_BASELINE_REPO_PATH, true)
    }
    const findings = structuralFindings(measurement, baseline, onDemandBaseline)

    const writing = argumentsParsed.mode === "write"
    const baselineBytes = baseline?.bytes ?? (writing ? measurement.enforcedBytes : null)
    const deltaBytes = baselineBytes === null ? null : measurement.enforcedBytes - baselineBytes
    const onDemandBaselineBytes = onDemandBaseline?.bytes ?? (writing ? measurement.onDemandBytes : null)
    const onDemandDeltaBytes = onDemandBaselineBytes === null ? null : measurement.onDemandBytes - onDemandBaselineBytes
    const fullSessionBytes = measurement.enforcedBytes + measurement.externalBytes
    const result = {
      ...measurement,
      fullSessionBytes,
      fullSessionEstimatedTokens: estimatedTokens(fullSessionBytes),
      fullSessionComplete: measurement.externalUnreadableFiles.length === 0,
      baselineBytes,
      baselineSource: baseline?.source ?? null,
      deltaBytes,
      fileGrowth: growthOver(measurement.files, baseline),
      onDemandBaselineBytes,
      onDemandBaselineSource: onDemandBaseline?.source ?? null,
      onDemandDeltaBytes,
      onDemandGrowth: growthOver(measurement.onDemandFiles, onDemandBaseline),
      structuralFindings: findings,
      status: findings.length > 0 || deltaBytes > 0 || onDemandDeltaBytes > 0 ? "over" : "ok",
    }

    if (argumentsParsed.json) console.log(JSON.stringify(result, null, 2))
    else outputHuman(result)

    if (findings.length > 0) {
      if (!argumentsParsed.json) {
        console.error("")
        console.error("Always-loaded context failed its structural allowlist:")
        for (const finding of findings) console.error(`  ${finding}`)
      }
      return 1
    }

    if (writing) {
      writeFileSync(BASELINE_PATH, `${JSON.stringify({ bytes: measurement.enforcedBytes, files: measurement.files }, null, 2)}\n`)
      writeFileSync(
        ON_DEMAND_BASELINE_PATH,
        `${JSON.stringify({ bytes: measurement.onDemandBytes, files: measurement.onDemandFiles }, null, 2)}\n`,
      )
      if (!argumentsParsed.json) {
        console.log(`${BASELINE_REPO_PATH} written: ${measurement.enforcedBytes} bytes`)
        console.log(`${ON_DEMAND_BASELINE_REPO_PATH} written: ${measurement.onDemandBytes} bytes`)
      }
      return 0
    }

    if (deltaBytes > 0 || onDemandDeltaBytes > 0) {
      if (!argumentsParsed.json) {
        if (deltaBytes > 0) reportGrowth("Always-loaded context", deltaBytes, result.fileGrowth)
        if (onDemandDeltaBytes > 0) reportGrowth("On-demand instruction files", onDemandDeltaBytes, result.onDemandGrowth)
      }
      return 1
    }
    return 0
  } catch (error) {
    console.error(`check-context-budget: ${error.message}`)
    return 2
  }
}

process.exit(main())
