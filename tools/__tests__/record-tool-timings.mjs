import { readFileSync } from "node:fs"

import { TIMINGS_MARKER, TIMINGS_METHOD } from "../lib/test-shards.mjs"
import { check, orcaEnv, stage, T } from "./_harness.mjs"

const TOOL = "record-tool-timings.mjs"
const RUN = "42944546478"

/** The jobs of PR Tests run 42944546478 from `gh run view 42944546478 --json jobs`, steps and urls left out. */
const RUN_JOBS = [
  { completedAt: "2026-11-11T02:34:33Z", conclusion: "success", databaseId: 130276875435, name: "Tool tests (4/4)", startedAt: "2026-11-11T02:29:55Z", status: "completed" },
  { completedAt: "2026-11-11T02:39:58Z", conclusion: "success", databaseId: 130276875441, name: "Tool tests (2/4)", startedAt: "2026-11-11T02:35:47Z", status: "completed" },
  { completedAt: "2026-11-11T02:49:37Z", conclusion: "success", databaseId: 130276875557, name: "Tool tests (1/4)", startedAt: "2026-11-11T02:43:33Z", status: "completed" },
  { completedAt: "2026-11-11T02:46:36Z", conclusion: "success", databaseId: 130276875583, name: "Tool tests (3/4)", startedAt: "2026-11-11T02:42:14Z", status: "completed" },
  { completedAt: "2026-11-11T03:04:37Z", conclusion: "success", databaseId: 130289557004, name: "Tool and Hook Tests", startedAt: "2026-11-11T03:04:35Z", status: "completed" },
]
const SECONDS = { 1: { "check-feature-parity": 293.7 }, 2: { "android-emulator": 20.2, admission: 6.9 }, 3: { "arch-map": 0.2 }, 4: { "board-view": 0.8 } }

/** One shard job log in the shape `gh run view --job <id> --log` prints: job name, step, timestamp, then the line. */
const shardLog = (index, withTimings = true) => [
  `Tool tests (${index}/4)\tUNKNOWN STEP\t2026-11-11T02:43:34.5163643Z ##[group]Runner Image Provisioner`,
  `Tool tests (${index}/4)\tUNKNOWN STEP\t2026-11-11T02:49:33.7612538Z PASS a case`,
  ...(withTimings ? [`Tool tests (${index}/4)\tUNKNOWN STEP\t2026-11-11T02:49:33.7612538Z ${TIMINGS_MARKER}${JSON.stringify({ shard: `${index}/4`, fixedSeconds: index / 2, seconds: SECONDS[index] })}`] : []),
  "",
].join("\n")

/** No entry answers the whole-run log, so a call that is not per job misses the stub and fails the run. */
const ghPlan = ({ jobs = RUN_JOBS, jobsExit = 0, withoutTimings } = {}) => orcaEnv([
  jobsExit === 0
    ? { match: `run view ${RUN} --repo`, stdout: JSON.stringify({ jobs }) }
    : { match: `run view ${RUN} --repo`, stdout: "", stderr: "HTTP 502: Bad Gateway", exit: jobsExit },
  ...RUN_JOBS.slice(0, 4).map((job) => {
    const index = Number(/\((\d)\/4\)/.exec(job.name)[1])
    return { match: `run view --job ${job.databaseId} --repo`, stdout: shardLog(index, index !== withoutTimings) }
  }),
])

export const cases = () => {
  const previous = JSON.stringify({ regenerate: "old", sourceRun: 1, method: "Per-module CI seconds of the five Tool tests shards in PR Tests run 42915781433.", stale: true, fixedSeconds: 9, seconds: { removed: 1 } })
  const output = stage("record-tool-timings/timings.json", previous)
  const written = check(TOOL, "merges the timing line of every shard job into the timings file", [RUN, "--output", output], { status: 0, stdout: /wrote 5 module timings from 4 shards of run 42944546478/ }, { env: ghPlan() })
  const timings = written.status === 0 ? JSON.parse(readFileSync(output, "utf8")) : {}
  T(`${TOOL}: the timings name their source run and hold every shard's module seconds`,
    timings.sourceRun === Number(RUN) && timings.fixedSeconds === 2 &&
      JSON.stringify(timings.seconds) === JSON.stringify({ admission: 6.9, "android-emulator": 20.2, "arch-map": 0.2, "board-view": 0.8, "check-feature-parity": 293.7 }),
    JSON.stringify(timings))
  T(`${TOOL}: a regeneration writes the fixed method and carries no field of the previous file`,
    timings.method === TIMINGS_METHOD && !/\d{6,}|five/.test(timings.method) && timings.regenerate === "node tools/record-tool-timings.mjs <run-id>" &&
      JSON.stringify(Object.keys(timings)) === JSON.stringify(["regenerate", "sourceRun", "method", "fixedSeconds", "seconds"]),
    JSON.stringify(timings))

  const incomplete = stage("record-tool-timings/incomplete.json", previous)
  check(TOOL, "a shard log with no timing line exits 2 and names the missing shard", [RUN, "--output", incomplete], { status: 2, stderr: /no timing line for shard 1\/4/ }, { env: ghPlan({ withoutTimings: 1 }) })
  T(`${TOOL}: an incomplete shard set leaves the timings file unchanged`, readFileSync(incomplete, "utf8") === previous)
  check(TOOL, "a run with no Tool tests job exits 2", [RUN, "--output", incomplete], { status: 2, stderr: /no "Tool tests \(i\/n\)" job/ }, { env: ghPlan({ jobs: RUN_JOBS.slice(4) }) })
  check(TOOL, "a failed jobs read exits 1 with the gh error", [RUN, "--output", incomplete], { status: 1, stderr: /HTTP 502/ }, { env: ghPlan({ jobsExit: 1 }) })
  check(TOOL, "a run id is required", ["--output", incomplete], { status: 2, stderr: /<run-id> is required/ })
  check(TOOL, "a non-numeric run id is refused", ["latest"], { status: 2, stderr: /invalid argument: latest/ })
  check(TOOL, "--output needs a path", [RUN, "--output"], { status: 2, stderr: /--output requires a path/ })
}
