#!/usr/bin/env node
/** Records the per-module CI seconds of every Tool tests shard of one PR Tests run into tools/test-tools-timings.json. */

import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { repositorySlug } from "./lib/github-auth.mjs"
import { mergeTimingLines, TIMINGS_METHOD } from "./lib/test-shards.mjs"

const USAGE = `usage: record-tool-timings.mjs <run-id> [--output <path>]

  Reads the jobs of PR Tests run <run-id> in the ui repository (the origin of this checkout) with
  read-only gh commands, fetches the log of every "Tool tests (i/n)" job one job at a time, and
  merges the "# tool-timings" line of each shard into the module seconds that size the shards.
  Every shard 1..n must have exactly one timing line, so no module drops out of the table.
  Defaults to tools/test-tools-timings.json.

  --output <path>  write the timings to this path
  --help, -h       print this usage and exit 0

exit codes: 0 timings written, 1 a gh command or the write failed, 2 usage error or the run has no
complete shard set`

const REGENERATE = "node tools/record-tool-timings.mjs <run-id>"
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
let runId
let outputPath = fileURLToPath(new URL("./test-tools-timings.json", import.meta.url))
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--output") {
    if (index + 1 >= args.length || args[index + 1].startsWith("-")) usageError("--output requires a path")
    outputPath = resolve(args[++index])
  } else if (/^\d+$/.test(args[index]) && runId === undefined) {
    runId = args[index]
  } else {
    usageError(`invalid argument: ${args[index]}`)
  }
}
if (runId === undefined) usageError("a numeric <run-id> is required")

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

let merged
try {
  merged = mergeTimingLines(logs.join("\n"))
} catch (error) {
  console.error(`record-tool-timings: run ${runId}: ${error.message}`)
  process.exit(2)
}
try {
  writeFileSync(outputPath, `${JSON.stringify({ regenerate: REGENERATE, sourceRun: Number(runId), method: TIMINGS_METHOD, ...merged }, null, 2)}\n`)
} catch (error) {
  console.error(`record-tool-timings: could not write ${outputPath}: ${error.message}`)
  process.exit(1)
}
console.log(`record-tool-timings: wrote ${Object.keys(merged.seconds).length} module timings from ${shardJobs.length} shards of run ${runId} to ${outputPath}`)
