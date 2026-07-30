#!/usr/bin/env node
/** Deterministic Git facts for /orchestrate.  Reads only the local repository. */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const USAGE = `usage: repo-facts.mjs <changed|presence|blob-size|conflicts> [options]

  changed --base <ref> --head <ref>              print changed paths as JSON
  presence --ref <ref> --path <path> --contains <text>
                                                   report whether text is in a blob
  presence --fetched-ref <ref> --expected-head <sha> --path <path> --contains <text>
                                                   refuse stale PR refs before reading
  blob-size --ref <ref> --baseline <json-file>   compare recorded blob byte sizes
  conflicts --base <ref> --head <ref>             enumerate merge-conflicting paths
  --help, -h                                     print this usage and exit 0

Baseline JSON is an object mapping repository paths to expected byte sizes.
All success results are JSON on stdout. Exit codes: 0 answer produced, 1 fact is
negative or a baseline/merge conflict was found, 2 usage or unreadable Git input.`

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
const [command, ...rest] = args
const valueOf = (flag) => {
  const index = rest.indexOf(flag)
  return index < 0 ? null : rest[index + 1]
}
const has = (flag) => rest.includes(flag)
const fail = (message, code = 2) => {
  console.error(message)
  process.exit(code)
}
const git = (gitArgs, options = {}) => {
  try {
    return execFileSync("git", gitArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message
    if (options.allowFailure) return { status: error.status ?? 2, stdout: error.stdout?.toString() ?? "", stderr: detail }
    fail(`git ${gitArgs.join(" ")} failed: ${detail}`)
  }
}
const requireValue = (flag) => {
  const value = valueOf(flag)
  if (!value || value.startsWith("--")) fail(`${flag} requires a value`)
  return value
}
const validCommands = new Set(["changed", "presence", "blob-size", "conflicts"])
if (!validCommands.has(command) || rest.some((arg) => arg.startsWith("--") && !["--base", "--head", "--ref", "--fetched-ref", "--expected-head", "--path", "--contains", "--baseline"].includes(arg))) fail(USAGE)

if (command === "changed") {
  const base = requireValue("--base")
  const head = requireValue("--head")
  const files = git(["diff", "--name-only", "--no-renames", `${base}...${head}`]).split(/\r?\n/).filter(Boolean)
  console.log(JSON.stringify({ base, head, files }))
  process.exit(0)
}

if (command === "presence") {
  const fetchedRef = valueOf("--fetched-ref")
  const ref = fetchedRef ?? requireValue("--ref")
  if (fetchedRef) {
    const expectedHead = requireValue("--expected-head")
    const actualHead = git(["rev-parse", `${fetchedRef}^{commit}`]).trim()
    if (actualHead !== expectedHead) fail(`stale fetched ref ${fetchedRef}: local SHA ${actualHead} does not match pull request head SHA ${expectedHead}`, 2)
  } else if (has("--expected-head")) fail("--expected-head requires --fetched-ref")
  const path = requireValue("--path")
  const contains = requireValue("--contains")
  const result = git(["show", `${ref}:${path}`], { allowFailure: true })
  if (typeof result === "object") {
    if (result.status === 128) console.log(JSON.stringify({ ref, path, present: false }))
    else fail(`could not read ${ref}:${path}: ${result.stderr}`)
    process.exit(1)
  }
  const present = result.includes(contains)
  console.log(JSON.stringify({ ref, path, present }))
  process.exit(present ? 0 : 1)
}

if (command === "blob-size") {
  const ref = requireValue("--ref")
  const baselinePath = requireValue("--baseline")
  let baseline
  try { baseline = JSON.parse(readFileSync(baselinePath, "utf8")) } catch (error) { fail(`could not read baseline ${baselinePath}: ${error.message}`) }
  if (!baseline || Array.isArray(baseline) || Object.values(baseline).some((size) => !Number.isInteger(size) || size < 0)) fail("baseline must map paths to non-negative integer byte sizes")
  const mismatches = []
  for (const [path, expected] of Object.entries(baseline)) {
    const result = git(["cat-file", "-s", `${ref}:${path}`], { allowFailure: true })
    const actual = typeof result === "object" ? null : Number(result.trim())
    if (!Number.isInteger(actual) || actual !== expected) mismatches.push({ path, expected, actual })
  }
  console.log(JSON.stringify({ ref, matches: mismatches.length === 0, mismatches }))
  process.exit(mismatches.length ? 1 : 0)
}

const base = requireValue("--base")
const head = requireValue("--head")
const merged = git(["merge-tree", "--write-tree", base, head], { allowFailure: true })
if (typeof merged !== "object") {
  console.log(JSON.stringify({ base, head, files: [] }))
  process.exit(0)
}
if (merged.status !== 1) fail(`could not calculate merge conflicts: ${merged.stderr}`)
const files = [...new Set([...merged.stdout.matchAll(/^\d+\s+\S+\s+\d+\s+([^\n]+)$/gm)].map((match) => match[1]))].sort()
console.log(JSON.stringify({ base, head, files }))
process.exit(1)
