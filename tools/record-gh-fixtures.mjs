#!/usr/bin/env node
/** Records path and JSON-type evidence from read-only live gh invocations. */

import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: record-gh-fixtures.mjs [--output <path>]

  Records path and JSON-type manifests from read-only gh issue and project commands.
  Defaults to tools/__fixtures__/gh-issue-envelopes.json.

  --output <path>  write the manifest to this path
  --help, -h       print this usage and exit 0

exit codes: 0 fixture recorded, 1 live command or write failed, 2 usage error`

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

let outputPath = fileURLToPath(new URL("./__fixtures__/gh-issue-envelopes.json", import.meta.url))
for (let index = 0; index < args.length; index++) {
  if (args[index] !== "--output" || index + 1 >= args.length || args[index + 1].startsWith("-")) {
    console.error(`record-gh-fixtures: invalid arguments: ${args.join(" ")}\n\n${USAGE}`)
    process.exit(2)
  }
  outputPath = resolve(args[++index])
}

const config = JSON.parse(readFileSync(new URL("../.claude/orchestrator.json", import.meta.url), "utf8")).tickets
const map = JSON.parse(readFileSync(new URL("../.claude/linear-to-github-map.json", import.meta.url), "utf8"))
const sampleNumber = map.issues?.["ORB-215"]?.number
if (!Number.isInteger(sampleNumber)) {
  console.error("record-gh-fixtures: .claude/linear-to-github-map.json carries no ORB-215 issue number")
  process.exit(1)
}

const issueFields = "number,url,title,body,state,stateReason,labels,blockedBy,blocking"
const stateReasonFilter = 'if .stateReason == "" then .stateReason = null else . end'
const commands = {
  issueView: ["issue", "view", String(sampleNumber), "--repo", config.repository, "--json", issueFields, "--jq", stateReasonFilter],
  issueViewError: ["issue", "view", "2147483647", "--repo", config.repository, "--json", issueFields, "--jq", stateReasonFilter],
  issueList: ["issue", "list", "--repo", config.repository, "--state", "all", "--limit", "1000", "--json", issueFields, "--jq", `map(${stateReasonFilter})`],
  projectItemList: ["project", "item-list", String(config.projectNumber), "--owner", config.projectOwner, "--format", "json", "--limit", "1000"],
  labelList: ["label", "list", "--repo", config.repository, "--limit", "1000", "--json", "name"],
}

const jsonType = (value) => {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value === "object" ? "object" : typeof value
}

const addPaths = (paths, value, path = "$") => {
  const type = jsonType(value)
  const entry = paths[path] ?? { types: [] }
  if (!entry.types.includes(type)) entry.types.push(type)
  entry.types.sort()
  paths[path] = entry
  if (type === "array") {
    for (const item of value) addPaths(paths, item, `${path}[]`)
  } else if (type === "object") {
    for (const [key, child] of Object.entries(value)) addPaths(paths, child, `${path}.${key}`)
  }
}

const record = (name, command) => {
  const result = spawnSync(process.env.GH_BIN || "gh", command, {
    encoding: "utf8",
    env: process.env,
    timeout: 30000,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  })
  const isExpectedError = name === "issueViewError"
  if (result.error || (isExpectedError ? result.status === 0 : result.status !== 0)) {
    const detail = (result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim()
    throw new Error(`${name} did not produce its expected live result: ${detail}`)
  }
  let value
  if (isExpectedError) {
    value = result.stderr.trim()
    if (!value) throw new Error("issueViewError returned no stderr")
  } else {
    try {
      value = JSON.parse(result.stdout)
    } catch (error) {
      throw new Error(`${name} returned invalid JSON: ${error.message}`)
    }
  }
  const paths = {}
  addPaths(paths, value)
  return {
    command: ["gh", ...command.map((part) => (part === String(sampleNumber) ? "<issue-number>" : part))],
    observedExitCode: result.status,
    paths,
  }
}

try {
  const recorded = {}
  for (const [name, command] of Object.entries(commands)) recorded[name] = record(name, command)
  const manifest = {
    schemaVersion: 1,
    generation: {
      method: "Generated mechanically from read-only live gh commands. No response path or type was entered by hand.",
      generator: "tools/record-gh-fixtures.mjs",
      repository: config.repository,
      projectOwner: config.projectOwner,
      projectNumber: config.projectNumber,
    },
    commands: recorded,
  }
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`record-gh-fixtures: wrote ${outputPath}`)
} catch (error) {
  console.error(`record-gh-fixtures: ${error.message}`)
  process.exit(1)
}
