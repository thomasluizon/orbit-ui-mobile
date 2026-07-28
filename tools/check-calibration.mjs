#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  readOrchestratorConfig,
  resolveWorkerInvocation,
} from "./lib/orchestrator-config.mjs"

const USAGE = `usage: check-calibration.mjs [--report-only] [--refresh]

  --report-only  print failures but exit 0 during the rollout window
  --refresh      validate entries, then stamp the current model and UTC date
  --help, -h     print this usage and exit 0

exit codes: 0 valid or report-only verdict, 1 calibration failed, 2 usage or malformed/missing artifact`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const knownArguments = new Set(["--report-only", "--refresh"])
const unknownArgument = process.argv.slice(2).find((argument) => !knownArguments.has(argument))
if (unknownArgument) {
  console.error(`check-calibration: unknown argument: ${unknownArgument}\n`)
  console.error(USAGE)
  process.exit(2)
}

const reportOnly = process.argv.includes("--report-only")
const refresh = process.argv.includes("--refresh")
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CALIBRATION_PATH = join(REPO_ROOT, ".claude", "calibration.json")
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000
const MAX_AGE_DAYS = 90

function finishOperational(message) {
  const verdict = `calibration ERROR${reportOnly ? " (report-only)" : ""}: ${message}`
  if (reportOnly) console.log(verdict)
  else console.error(verdict)
  process.exit(reportOnly ? 0 : 2)
}

function readJson(path, label) {
  let source
  try {
    source = readFileSync(path, "utf8")
  } catch (error) {
    finishOperational(`${label} could not be read: ${error.message}`)
  }
  try {
    return JSON.parse(source)
  } catch (error) {
    finishOperational(`${label} is not valid JSON: ${error.message}`)
  }
}

function validIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === value
}

function validateArtifactShape(artifact) {
  const problems = []
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return ["root must be an object"]
  }
  if (typeof artifact.model !== "string" || artifact.model.trim() === "") {
    problems.push("model must be a non-empty string")
  }
  if (!validIsoDate(artifact.date)) problems.push("date must be a real ISO date in YYYY-MM-DD form")
  if (!Array.isArray(artifact.entries)) {
    problems.push("entries must be an array")
    return problems
  }
  for (const [index, entry] of artifact.entries.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(`entries[${index}] must be an object`)
      continue
    }
    if (typeof entry.file !== "string" || entry.file.trim() === "") {
      problems.push(`entries[${index}].file must be a non-empty string`)
    }
    if (entry.verdict !== "changed" && entry.verdict !== "kept") {
      problems.push(`entries[${index}].verdict must be "changed" or "kept"`)
    }
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      problems.push(`entries[${index}].reason must be a non-empty string`)
    }
  }
  return problems
}

function inventory() {
  let agents
  let skillDirectories
  try {
    agents = readdirSync(join(REPO_ROOT, ".claude", "agents"), { withFileTypes: true })
    skillDirectories = readdirSync(join(REPO_ROOT, ".claude", "skills"), { withFileTypes: true })
  } catch (error) {
    finishOperational(`calibration inventory could not be read: ${error.message}`)
  }
  const agentFiles = agents
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => `.claude/agents/${entry.name}`)
  const skillFiles = skillDirectories
    .filter((entry) => entry.isDirectory())
    .map((entry) => `.claude/skills/${entry.name}/SKILL.md`)
    .filter((path) => {
      try {
        return readFileSync(join(REPO_ROOT, ...path.split("/")), "utf8") !== undefined
      } catch (error) {
        if (error.code === "ENOENT") return false
        finishOperational(`calibration inventory could not read ${path}: ${error.message}`)
      }
    })
  return [...agentFiles, ...skillFiles].sort()
}

function declaredModel() {
  try {
    const config = readOrchestratorConfig()
    const workerName = config.worker
    const worker = config.workers?.[workerName]
    resolveWorkerInvocation(workerName, worker, [])
    return worker.models.default.model
  } catch (error) {
    finishOperational(error.message)
  }
}

function coverageProblems(expectedFiles, entries) {
  const expected = new Set(expectedFiles)
  const counts = new Map()
  for (const entry of entries) counts.set(entry.file, (counts.get(entry.file) ?? 0) + 1)
  const problems = []
  for (const file of expectedFiles) {
    const count = counts.get(file) ?? 0
    if (count === 0) problems.push(`missing entry: ${file}`)
    else if (count > 1) problems.push(`duplicate entry (${count}): ${file}`)
  }
  for (const [file, count] of [...counts].sort(([left], [right]) => left.localeCompare(right))) {
    if (!expected.has(file)) problems.push(`entry has no input file: ${file}`)
    else if (count > 1 && !problems.some((problem) => problem.endsWith(`: ${file}`))) {
      problems.push(`duplicate entry (${count}): ${file}`)
    }
  }
  return problems
}

function printVerdict(problems, expectedCount, entryCount, model, date) {
  if (problems.length === 0) {
    console.log(`calibration PASS: ${entryCount}/${expectedCount} files, model ${model}, date ${date}`)
    return
  }
  console.log(`calibration FAIL${reportOnly ? " (report-only)" : ""}: ${entryCount}/${expectedCount} entries`)
  for (const problem of problems) console.log(`  ${problem}`)
}

const artifact = readJson(CALIBRATION_PATH, ".claude/calibration.json")
const shapeProblems = validateArtifactShape(artifact)
if (shapeProblems.length > 0) finishOperational(`.claude/calibration.json is malformed: ${shapeProblems.join("; ")}`)

const expectedFiles = inventory()
const currentModel = declaredModel()

let problems = coverageProblems(expectedFiles, artifact.entries)
if (refresh && problems.length === 0) {
  artifact.model = currentModel
  artifact.date = new Date().toISOString().slice(0, 10)
  try {
    writeFileSync(CALIBRATION_PATH, `${JSON.stringify(artifact, null, 2)}\n`)
  } catch (error) {
    finishOperational(`.claude/calibration.json could not be refreshed: ${error.message}`)
  }
}

if (problems.length === 0) {
  if (artifact.model !== currentModel) {
    problems.push(`model mismatch: stamp ${JSON.stringify(artifact.model)}, orchestrator ${JSON.stringify(currentModel)}`)
  }
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)
  const stamped = Date.parse(`${artifact.date}T00:00:00.000Z`)
  const ageDays = (today - stamped) / DAY_MILLISECONDS
  if (ageDays < 0) problems.push(`date is in the future: ${artifact.date}`)
  else if (ageDays >= MAX_AGE_DAYS) {
    problems.push(`stamp is ${ageDays} days old; it must be under ${MAX_AGE_DAYS} days`)
  }
}

printVerdict(problems, expectedFiles.length, artifact.entries.length, artifact.model, artifact.date)
process.exit(problems.length > 0 && !reportOnly ? 1 : 0)
