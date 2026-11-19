#!/usr/bin/env node
/** Records the median per-module CI seconds of the Tool tests shards of one or more PR Tests runs into tools/test-tools-timings.json. */

import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { repositorySlug } from "./lib/github-auth.mjs"
import { medianTimings, mergeTimingLines, TIMINGS_METHOD } from "./lib/test-shards.mjs"

const USAGE = `usage: record-tool-timings.mjs <run-id>... [--output <path>]

  Reads the jobs of each PR Tests run <run-id> in the ui repository (the origin of this checkout)
  with read-only gh commands, fetches the log of every "Tool tests (i/n)" job one job at a time, and
  merges the "# tool-timings" line of each shard. Every shard 1..n of a run must have exactly one
  timing line, so no module drops out of the table. Each module gets the median of its seconds over
  the runs, and a module that node tools/test-tools.mjs --list does not register is left out and
  named. The first run id is sourceRun, and every run id is in sourceRuns.
  Defaults to tools/test-tools-timings.json.

  --output <path>  write the timings to this path
  --help, -h       print this usage and exit 0

exit codes: 0 timings written, 1 a gh command, the module list or the write failed, 2 usage error or
a run has no complete shard set`

const REGENERATE = "node tools/record-tool-timings.mjs <run-id>..."
const SHARD_JOB = /^Tool tests \((\d+)\/(\d+)\)$/

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const usageError = (message) => {
  console.error(`record-tool-timings: ${message}\n\n${USAGE}`)
  process.exit(2)
}
const runIds = []
let outputPath = fileURLToPath(new URL("./test-tools-timings.json", import.meta.url))
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--output") {
    if (index + 1 >= args.length || args[index + 1].startsWith("-")) usageError("--output requires a path")
    outputPath = resolve(args[++index])
  } else if (/^\d+$/.test(args[index]) && !runIds.includes(args[index])) {
    runIds.push(args[index])
  } else {
    usageError(`invalid argument: ${args[index]}`)
  }
}
if (runIds.length === 0) usageError("a numeric <run-id> is required")

let slug
try {
  slug = repositorySlug(fileURLToPath(new URL("..", import.meta.url)))
} catch (error) {
  console.error(`record-tool-timings: ${error.message}`)
  process.exit(1)
}
const gh = (argv) => {
  const result = spawnSync(process.env.GH_BIN || "gh", argv, { encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024, windowsHide: true })
  if (result.status !== 0) {
    console.error(`record-tool-timings: gh ${argv.join(" ")} failed: ${(result.stderr || result.error?.message || "").trim()}`)
    process.exit(1)
  }
  return result.stdout
}

const runTable = (runId) => {
  let jobs
  try {
    jobs = JSON.parse(gh(["run", "view", runId, "--repo", slug, "--json", "jobs"])).jobs
  } catch (error) {
    console.error(`record-tool-timings: run ${runId} returned no jobs JSON: ${error.message}`)
    process.exit(1)
  }
  const shardJobs = jobs.filter((job) => SHARD_JOB.test(job.name))
  if (shardJobs.length === 0) {
    console.error(`record-tool-timings: run ${runId} has no "Tool tests (i/n)" job`)
    process.exit(2)
  }
  // The whole-run log needs one API request per job and gh refuses it for a run with many jobs, so each shard log is fetched alone.
  const logs = shardJobs.map((job) => gh(["run", "view", "--job", String(job.databaseId), "--repo", slug, "--log"]))
  try {
    return mergeTimingLines(logs.join("\n"))
  } catch (error) {
    console.error(`record-tool-timings: run ${runId}: ${error.message}`)
    process.exit(2)
  }
}

const tables = runIds.map(runTable)
const listed = spawnSync(process.execPath, [fileURLToPath(new URL("./test-tools.mjs", import.meta.url)), "--list"], { encoding: "utf8", windowsHide: true })
if (listed.status !== 0) {
  console.error(`record-tool-timings: test-tools.mjs --list failed: ${(listed.stderr || listed.error?.message || "").trim()}`)
  process.exit(1)
}
const { unregistered, ...merged } = medianTimings(tables, listed.stdout.split("\n").filter((line) => /^[a-z0-9-]+$/.test(line)))
try {
  writeFileSync(outputPath, `${JSON.stringify({ regenerate: REGENERATE, sourceRun: Number(runIds[0]), sourceRuns: runIds.map(Number), method: TIMINGS_METHOD, ...merged }, null, 2)}\n`)
} catch (error) {
  console.error(`record-tool-timings: could not write ${outputPath}: ${error.message}`)
  process.exit(1)
}
if (unregistered.length > 0) console.log(`record-tool-timings: left out modules that test-tools.mjs does not register: ${unregistered.join(", ")}`)
console.log(`record-tool-timings: wrote ${Object.keys(merged.seconds).length} module timings, the median of ${runIds.length} run${runIds.length === 1 ? "" : "s"} (${runIds.join(", ")}), to ${outputPath}`)
