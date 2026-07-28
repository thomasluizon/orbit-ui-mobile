#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CLAUDE_PATH = join(REPO_ROOT, "CLAUDE.md")
const RULES_PATH = join(REPO_ROOT, ".claude", "rules")
const BASELINE_PATH = join(REPO_ROOT, "tools", "context-budget.json")
const BASELINE_REPO_PATH = "tools/context-budget.json"
const EXPECTED_IMPORTS = new Set(["@../orbit-api/CLAUDE.md", "@../orbit-landing-page/CLAUDE.md"])
const EXPECTED_UNCONDITIONAL_RULES = new Set([".claude/rules/core.md"])

const USAGE = `usage: check-context-budget.mjs [--check | --write-baseline] [--json]

  --check           compare with the target branch's tools/context-budget.json (default)
  --write-baseline  write the current enforced byte total and per-file counts
  --json            print the result as machine-readable JSON
  --help, -h        print this usage and exit 0

exit codes:
  0  within budget, or baseline written
  1  byte budget or structural allowlist exceeded
  2  invalid arguments, malformed baseline, or tool error`

const toRepoPath = (absolutePath) => relative(REPO_ROOT, absolutePath).replace(/\\/g, "/")
const byteCount = (path) => readFileSync(path).byteLength
const estimatedTokens = (bytes) => Math.floor(bytes / 4)
const signed = (number) => `${number >= 0 ? "+" : ""}${number}`

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
  const enforcedBytes = Object.values(files).reduce((total, bytes) => total + bytes, 0)

  const siblingFiles = []
  for (const importLine of imports.filter((line) => EXPECTED_IMPORTS.has(line))) {
    const absolutePath = resolve(REPO_ROOT, importLine.slice(1))
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue
    siblingFiles.push({
      file: relative(dirname(REPO_ROOT), absolutePath).replace(/\\/g, "/"),
      bytes: byteCount(absolutePath),
    })
  }
  const siblingBytes = siblingFiles.reduce((total, file) => total + file.bytes, 0)

  return {
    files,
    enforcedBytes,
    estimatedTokens: estimatedTokens(enforcedBytes),
    imports,
    unconditionalRules,
    unexpectedImports,
    unexpectedRules,
    siblingFiles,
    fullSessionBytes: enforcedBytes + siblingBytes,
    fullSessionEstimatedTokens: estimatedTokens(enforcedBytes + siblingBytes),
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
  const filesTotal = validFiles
    ? Object.values(baseline.files).reduce((total, bytes) => total + bytes, 0)
    : -1
  if (!validFiles || !Number.isInteger(baseline.bytes) || baseline.bytes < 0 || baseline.bytes !== filesTotal) {
    throw new Error(`${source} must contain matching non-negative integer bytes and files values`)
  }
  return baseline
}

function readWorkingBaseline() {
  if (!existsSync(BASELINE_PATH) || !statSync(BASELINE_PATH).isFile()) {
    throw new Error("tools/context-budget.json is missing")
  }
  return parseBaseline(readFileSync(BASELINE_PATH, "utf8"), "tools/context-budget.json")
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

function readComparisonBaseline() {
  const targetRef = resolveTargetRef()
  const listing = runGit(["ls-tree", "--name-only", targetRef, "--", BASELINE_REPO_PATH])
  if (listing.status !== 0) {
    throw new Error(`could not inspect ${BASELINE_REPO_PATH} on target branch ${targetRef}`)
  }
  if (listing.stdout.trim() === "") {
    return {
      ...readWorkingBaseline(),
      source: `${targetRef} (working tree bootstrap)`,
    }
  }

  const blob = runGit(["show", `${targetRef}:${BASELINE_REPO_PATH}`])
  if (blob.status !== 0) {
    throw new Error(`could not read ${BASELINE_REPO_PATH} from target branch ${targetRef}`)
  }
  return {
    ...parseBaseline(blob.stdout, `${BASELINE_REPO_PATH} on target branch ${targetRef}`),
    source: targetRef,
  }
}

function structuralFindings(measurement) {
  return [
    ...measurement.unexpectedImports.map((line) => `unexpected root import: ${line}`),
    ...measurement.unexpectedRules.map((file) => `unexpected unconditional rule: ${file}`),
  ]
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
    console.log(`baseline source: ${result.baselineSource}`)
    console.log(`delta:          ${signed(result.deltaBytes)} bytes`)
  }
  if (result.siblingFiles.length > 0) {
    console.log("")
    console.log("resolved sibling imports:")
    for (const file of result.siblingFiles) console.log(`  ${file.file}: ${file.bytes} bytes`)
  }
  console.log(
    `full session from resolved files: ${result.fullSessionBytes} bytes (~${result.fullSessionEstimatedTokens} tokens, estimate)`,
  )
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
    const measurement = measureRepository()
    const findings = structuralFindings(measurement)
    let baseline = null
    if (argumentsParsed.mode === "check") baseline = readComparisonBaseline()

    const baselineBytes = baseline?.bytes ?? (argumentsParsed.mode === "write" ? measurement.enforcedBytes : null)
    const deltaBytes = baselineBytes === null ? null : measurement.enforcedBytes - baselineBytes
    const fileGrowth = baseline
      ? Object.entries(measurement.files)
          .map(([file, bytes]) => ({ file, bytes: bytes - (baseline.files[file] ?? 0) }))
          .filter((entry) => entry.bytes > 0)
      : []
    const result = {
      ...measurement,
      baselineBytes,
      baselineSource: baseline?.source ?? null,
      deltaBytes,
      fileGrowth,
      structuralFindings: findings,
      status: findings.length > 0 || (deltaBytes !== null && deltaBytes > 0) ? "over" : "ok",
    }

    if (argumentsParsed.json) console.log(JSON.stringify(result, null, 2))
    else outputHuman(result)

    if (findings.length > 0) {
      if (!argumentsParsed.json) {
        console.error("")
        console.error("Context structure grew beyond the allowlist:")
        for (const finding of findings) console.error(`  ${finding}`)
      }
      return 1
    }

    if (argumentsParsed.mode === "write") {
      writeFileSync(
        BASELINE_PATH,
        JSON.stringify({ bytes: measurement.enforcedBytes, files: measurement.files }, null, 2) + "\n",
      )
      if (!argumentsParsed.json) console.log(`context-budget.json written: ${measurement.enforcedBytes} bytes`)
      return 0
    }

    if (deltaBytes > 0) {
      if (!argumentsParsed.json) {
        console.error("")
        console.error(`Always-loaded context grew by ${deltaBytes} bytes beyond the committed baseline:`)
        for (const growth of fileGrowth) console.error(`  ${growth.file}: +${growth.bytes} bytes`)
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
