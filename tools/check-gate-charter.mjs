#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs"
import { dirname, extname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-gate-charter.mjs [--root <repository>]

  Verifies that every repository gate declares its pull request scope, snapshot
  regeneration command, and sourced constants in tools/gate-charter.json.

  --root <repository>  check this repository instead of the script's repository
  --help, -h           print this usage and exit 0

exit codes: 0 charter complete, 1 charter violation, 2 usage or configuration error`

const ALLOWED_SCOPES = new Set(["changed-files", "whole-tree-advisory"])
const REQUIRED_FIELDS = ["scope", "snapshot", "constants"]

function parseArguments(argv) {
  let repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--help" || argument === "-h") {
      console.log(USAGE)
      process.exit(0)
    }
    if (argument === "--root") {
      const value = argv[index + 1]
      if (!value) throw new Error("--root requires a repository path")
      repositoryRoot = resolve(value)
      index += 1
      continue
    }
    throw new Error(`unknown argument: ${argument}`)
  }
  return repositoryRoot
}

function filesIn(repositoryRoot, directory, predicate) {
  const absoluteDirectory = resolve(repositoryRoot, directory)
  return readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => `${directory}/${entry.name}`)
}

function guardJobIds(repositoryRoot) {
  const lines = guardWorkflowSource(repositoryRoot).split(/\r?\n/)
  const jobsLine = lines.findIndex((line) => /^jobs:\s*$/.test(line))
  if (jobsLine < 0) throw new Error(".github/workflows/guards.yml has no jobs mapping")
  const jobLines = lines.slice(jobsLine + 1).filter((line) => /^  \S/.test(line))
  const jobs = jobLines.map((line) => line.match(/^  (['"]?)([a-zA-Z0-9_-]+)\1:\s*$/)?.[2])
  if (jobs.some((job) => job === undefined)) {
    throw new Error("guards.yml job ids must contain only letters, digits, underscores, or hyphens")
  }
  return jobs
    .map((job) => `.github/workflows/guards.yml#${job}`)
}

function guardWorkflowSource(repositoryRoot) {
  return readFileSync(resolve(repositoryRoot, ".github/workflows/guards.yml"), "utf8")
}

function guardJobBlock(workflowSource, job) {
  const lines = workflowSource.split(/\r?\n/)
  const start = lines.findIndex((line) => line === `  ${job}:`)
  if (start < 0) return ""
  const next = lines.findIndex((line, index) => index > start && /^  [a-zA-Z0-9_-]+:\s*$/.test(line))
  return lines.slice(start, next < 0 ? lines.length : next).join("\n")
}

function gateIds(repositoryRoot) {
  return [
    ...filesIn(repositoryRoot, "tools", (name) => /^check-.*\.mjs$/.test(name)),
    ...filesIn(repositoryRoot, "eslint-rules", (name) => [".cjs", ".js", ".mjs"].includes(extname(name)) && !name.startsWith("_")),
    ...filesIn(repositoryRoot, ".claude/hooks", (name) => [".cjs", ".js", ".mjs"].includes(extname(name)) && name !== "test-hooks.mjs"),
    ...guardJobIds(repositoryRoot),
  ].sort()
}

function validateEntry(id, entry) {
  const problems = []
  if (entry === null || Array.isArray(entry) || typeof entry !== "object") {
    return [`${id}: entry must be an object`]
  }
  const fields = Object.keys(entry)
  for (const field of REQUIRED_FIELDS) {
    if (!fields.includes(field)) problems.push(`${id}: missing ${field}`)
  }
  for (const field of fields) {
    if (!REQUIRED_FIELDS.includes(field)) problems.push(`${id}: unknown field ${field}`)
  }
  if (!ALLOWED_SCOPES.has(entry.scope)) {
    problems.push(`${id}: scope must be changed-files or whole-tree-advisory`)
  }
  if (entry.snapshot !== "none" && (typeof entry.snapshot !== "string" || entry.snapshot.trim() === "")) {
    problems.push(`${id}: snapshot must be none or a regeneration command`)
  }
  if (entry.constants !== "none") {
    if (!Array.isArray(entry.constants) || entry.constants.length === 0) {
      problems.push(`${id}: constants must be none or a non-empty array`)
    } else {
      entry.constants.forEach((constant, index) => {
        if (constant === null || Array.isArray(constant) || typeof constant !== "object") {
          problems.push(`${id}: constants[${index}] must be an object`)
          return
        }
        if (typeof constant.name !== "string" || constant.name.trim() === "") {
          problems.push(`${id}: constants[${index}] needs a name`)
        }
        if (typeof constant.source !== "string" || constant.source.trim() === "") {
          problems.push(`${id}: constants[${index}] needs a source`)
        }
        for (const field of Object.keys(constant)) {
          if (!["name", "source"].includes(field)) {
            problems.push(`${id}: constants[${index}] has unknown field ${field}`)
          }
        }
      })
    }
  }
  return problems
}

function run(repositoryRoot) {
  const charterPath = resolve(repositoryRoot, "tools/gate-charter.json")
  const charter = JSON.parse(readFileSync(charterPath, "utf8"))
  if (charter === null || Array.isArray(charter) || typeof charter !== "object") {
    throw new Error("tools/gate-charter.json must be an object keyed by gate id")
  }
  const expected = gateIds(repositoryRoot)
  const workflowSource = guardWorkflowSource(repositoryRoot)
  const declared = Object.keys(charter).sort()
  const problems = []
  for (const id of expected) {
    if (!(id in charter)) problems.push(`${id}: missing registry entry`)
  }
  for (const id of declared) {
    if (!expected.includes(id)) problems.push(`${id}: registry entry names no gate`)
    else {
      problems.push(...validateEntry(id, charter[id]))
      const guardJob = id.match(/^\.github\/workflows\/guards\.yml#(.+)$/)?.[1]
      if (guardJob && charter[id]?.scope === "whole-tree-advisory" &&
          !/^\s{8}continue-on-error:\s*true\s*$/m.test(guardJobBlock(workflowSource, guardJob))) {
        problems.push(`${id}: whole-tree-advisory job must make its reporting step continue-on-error`)
      }
    }
  }
  if (problems.length > 0) {
    console.error("Gate charter violations:")
    problems.forEach((problem) => console.error(`  ${problem}`))
    return 1
  }
  console.log(`Gate charter passed. ${expected.length} gates registered.`)
  return 0
}

let repositoryRoot
try {
  repositoryRoot = parseArguments(process.argv.slice(2))
  process.exitCode = run(repositoryRoot)
} catch (error) {
  console.error(`check-gate-charter: ${error.message}\n`)
  console.error(USAGE)
  process.exitCode = 2
}
