import { readFileSync } from "node:fs"
import { join } from "node:path"
import yaml from "js-yaml"

import { parseShard, partitionDefects, partitionModules, shardSeconds } from "../lib/test-shards.mjs"
import { REPO_ROOT, T, run, toolPath } from "./_harness.mjs"

const TOOL = "lib/test-shards.mjs"

/** Wall time of the whole tools harness in one job on main run 42899302334 (`Run tools harness`, 16.9 minutes). */
const FULL_HARNESS_SECONDS = 1014
/** One shard's harness time budget. The ticket sets 6 minutes per job, and checkout plus npm ci take the rest. */
const SHARD_HARNESS_BUDGET_SECONDS = 240

const listModules = (...argv) => run("test-tools.mjs", ["--list", ...argv]).stdout.split("\n").filter((line) => /^[a-z0-9-]+$/.test(line))

export const cases = () => {
  const timings = JSON.parse(readFileSync(toolPath("test-tools-timings.json"), "utf8"))
  const workflow = yaml.load(readFileSync(join(REPO_ROOT, ".github/workflows/test.yml"), "utf8"))
  T(`${TOOL}: parseShard reads i/n`, JSON.stringify(parseShard("2/5")) === JSON.stringify({ index: 2, count: 5 }))
  for (const text of ["0/4", "5/4", "1", "a/b", "1/4/2", "", undefined]) {
    T(`${TOOL}: parseShard refuses ${JSON.stringify(text)}`, parseShard(text) === null)
  }

  const modules = ["a", "b", "c", "d", "e", "f", "g"]
  const seconds = { a: 90, b: 40, c: 30, d: 30, e: 20, f: 10 }
  const shards = partitionModules({ modules, seconds, shardCount: 3 })
  const defects = partitionDefects({ modules, shards })
  T(`${TOOL}: the partition runs every module exactly once, including one with no measured weight`,
    defects.missing.length === 0 && defects.duplicated.length === 0 && defects.unknown.length === 0 && shards.length === 3,
    JSON.stringify({ shards, defects }))
  T(`${TOOL}: the heaviest module sits alone on a shard that no other shard outweighs`,
    JSON.stringify(shards[0]) === JSON.stringify(["a"]) &&
      Math.max(...shards.map((shard) => shardSeconds({ modules, seconds, shard }))) === 90,
    JSON.stringify(shards))
  T(`${TOOL}: the partition is deterministic for any input order`,
    JSON.stringify(partitionModules({ modules: [...modules].reverse(), seconds, shardCount: 3 })) === JSON.stringify(shards))
  T(`${TOOL}: a shard with no module is allowed when there are more shards than modules`,
    partitionModules({ modules: ["a"], seconds, shardCount: 3 }).flat().join() === "a")

  const dropped = shards.map((shard) => shard.filter((module) => module !== "d"))
  T(`${TOOL}: dropping a module from the partition is reported as missing`,
    partitionDefects({ modules, shards: dropped }).missing.join() === "d", JSON.stringify(partitionDefects({ modules, shards: dropped })))
  const doubled = [[...shards[0], "b"], ...shards.slice(1)]
  T(`${TOOL}: a module in two shards is reported as duplicated`,
    partitionDefects({ modules, shards: doubled }).duplicated.join() === "b", JSON.stringify(partitionDefects({ modules, shards: doubled })))
  T(`${TOOL}: a shard naming an unregistered module is reported as unknown`,
    partitionDefects({ modules, shards: [[...shards[0], "ghost"], ...shards.slice(1)] }).unknown.join() === "ghost")

  const job = workflow.jobs["tool-tests"]
  const shardCount = job?.strategy?.matrix?.shard?.length
  T(`${TOOL}: the workflow runs tool tests as a matrix of numbered shards`,
    Array.isArray(job?.strategy?.matrix?.shard) && job.strategy.matrix.shard.every((value, position) => value === position + 1) &&
      job.strategy.matrix.total?.join() === String(shardCount) && job.strategy["fail-fast"] === false,
    JSON.stringify(job?.strategy))
  const shardStep = job?.steps?.find((step) => step.name === "Run tools harness shard")
  T(`${TOOL}: the workflow passes its matrix position to --shard`,
    shardStep?.run === "node tools/test-tools.mjs --shard ${{ matrix.shard }}/${{ matrix.total }}", shardStep?.run)

  const everyModule = listModules()
  T(`${TOOL}: --list names every registered case module`, everyModule.length > 100 && new Set(everyModule).size === everyModule.length,
    `${everyModule.length} modules`)
  const listed = Array.from({ length: shardCount }, (_, position) => listModules("--shard", `${position + 1}/${shardCount}`))
  const realDefects = partitionDefects({ modules: everyModule, shards: listed })
  T(`${TOOL}: every registered case module runs in exactly one workflow shard`,
    listed.every((shard) => shard.length > 0) && realDefects.missing.length === 0 && realDefects.duplicated.length === 0 && realDefects.unknown.length === 0,
    JSON.stringify({ sizes: listed.map((shard) => shard.length), realDefects }))

  const stale = Object.keys(timings.seconds).filter((module) => !everyModule.includes(module))
  T(`${TOOL}: every measured timing names a registered case module`, stale.length === 0,
    `stale timings: ${stale.join(", ")}\n     Regenerate: ${timings.regenerate}`)
  const measuredTotal = Object.values(timings.seconds).reduce((total, value) => total + value, 0)
  const slowest = Math.max(...listed.map((shard) => shardSeconds({ modules: everyModule, seconds: timings.seconds, shard })))
  T(`${TOOL}: the slowest shard fits ${SHARD_HARNESS_BUDGET_SECONDS}s once measured seconds scale to the ${FULL_HARNESS_SECONDS}s CI run`,
    measuredTotal > 0 && (slowest / measuredTotal) * FULL_HARNESS_SECONDS <= SHARD_HARNESS_BUDGET_SECONDS,
    `slowest shard holds ${((slowest / measuredTotal) * 100).toFixed(1)}% of ${measuredTotal.toFixed(1)}s\n     Add shards to the matrix in .github/workflows/test.yml, or regenerate: ${timings.regenerate}`)

  const usage = run("test-tools.mjs", ["--shard", "0/4"])
  T(`${TOOL}: an invalid --shard exits 2`, usage.status === 2 && /--shard needs i\/n/.test(usage.stderr), usage.stderr)
  const combined = run("test-tools.mjs", ["--shard", "1/4", "--only", "bounded-process"])
  T(`${TOOL}: --shard cannot combine with --only`, combined.status === 2 && /cannot combine/.test(combined.stderr), combined.stderr)
  const timed = run("test-tools.mjs", ["--write-timings", join(REPO_ROOT, "unused.json"), "--only", "bounded-process"])
  T(`${TOOL}: --write-timings refuses a partial run`, timed.status === 2 && /complete gate/.test(timed.stderr), timed.stderr)
}
