import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import yaml from "js-yaml"

import { mergeTimingLines, parseShard, partitionDefects, partitionModules, shardSeconds, slowestShardSeconds, TIMINGS_MARKER } from "../lib/test-shards.mjs"
import { BASH, REPO_ROOT, T, run, toolPath } from "./_harness.mjs"

const TOOL = "lib/test-shards.mjs"

/** One shard job must finish in 6 minutes (the ticket). */
const SHARD_JOB_LIMIT_SECONDS = 360
/** Checkout, setup-node and npm ci before the harness step: 66 s at most on PR Tests runs 42915781433 and 42944546478. */
const SHARD_SETUP_SECONDS = 70
const SHARD_HARNESS_BUDGET_SECONDS = SHARD_JOB_LIMIT_SECONDS - SHARD_SETUP_SECONDS

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

  T(`${TOOL}: the tool-tests job has a timeout above its ${SHARD_JOB_LIMIT_SECONDS}s budget and within twice it`,
    Number.isInteger(job?.["timeout-minutes"]) && job["timeout-minutes"] * 60 > SHARD_JOB_LIMIT_SECONDS && job["timeout-minutes"] * 60 <= 2 * SHARD_JOB_LIMIT_SECONDS,
    String(job?.["timeout-minutes"]))

  const gate = workflow.jobs["tool-hook-tests"]
  const gateStep = gate?.steps?.find((step) => step.name === "Require every tool shard and the hook tests")
  T(`${TOOL}: Tool and Hook Tests keeps its required name, runs always and needs the shards and the hook job`,
    gate?.name === "Tool and Hook Tests" && gate.if === "${{ always() }}" && JSON.stringify(gate.needs) === JSON.stringify(["tool-tests", "hook-tests"]) &&
      JSON.stringify(gateStep?.env) === JSON.stringify({ TOOL_RESULT: "${{ needs.tool-tests.result }}", HOOK_RESULT: "${{ needs.hook-tests.result }}" }),
    JSON.stringify(gate))
  if (BASH) {
    const outcomes = ["success", "failure", "cancelled", "skipped"]
    const wrong = outcomes.flatMap((tool) => outcomes.map((hook) => ({ tool, hook })))
      .filter(({ tool, hook }) => {
        const gated = spawnSync(BASH, ["-e", "-c", gateStep.run], { env: { ...process.env, TOOL_RESULT: tool, HOOK_RESULT: hook } })
        return (gated.status === 0) !== (tool === "success" && hook === "success")
      })
    T(`${TOOL}: Tool and Hook Tests passes only when every shard and the hook job succeeded`, wrong.length === 0, JSON.stringify(wrong))
  }
  const hookCommands = workflow.jobs["hook-tests"]?.steps?.map((step) => step.run ?? "") ?? []
  T(`${TOOL}: the hook job runs the hooks harness and the workflow behavior tests`,
    workflow.jobs["hook-tests"]?.needs === undefined && hookCommands.includes("node .claude/hooks/test-hooks.mjs") &&
      hookCommands.some((command) => command.includes("tools/__tests__/guards-changed-paths.test.mjs")),
    JSON.stringify(hookCommands))

  const everyModule = listModules()
  T(`${TOOL}: --list names every registered case module`, everyModule.length > 100 && new Set(everyModule).size === everyModule.length,
    `${everyModule.length} modules`)
  const listed = Array.from({ length: shardCount }, (_, position) => listModules("--shard", `${position + 1}/${shardCount}`))
  const realDefects = partitionDefects({ modules: everyModule, shards: listed })
  T(`${TOOL}: every registered case module runs in exactly one workflow shard`,
    listed.every((shard) => shard.length > 0) && realDefects.missing.length === 0 && realDefects.duplicated.length === 0 && realDefects.unknown.length === 0,
    JSON.stringify({ sizes: listed.map((shard) => shard.length), realDefects }))

  const stale = Object.keys(timings.seconds).filter((module) => !everyModule.includes(module))
  const unmeasured = everyModule.filter((module) => timings.seconds[module] === undefined)
  T(`${TOOL}: every measured timing names a registered case module`, stale.length === 0,
    `stale timings: ${stale.join(", ")}\n     Regenerate: ${timings.regenerate}`)
  // A module added after the source run has no CI number yet. It costs the mean weight in the partition and the projection,
  // so its pull request passes, and the next regeneration from that pull request's CI log records its real seconds.
  T(`${TOOL}: the timings name their source CI run and a per-shard overhead`,
    Number.isInteger(timings.sourceRun) && timings.fixedSeconds >= 0,
    `sourceRun ${timings.sourceRun}, fixedSeconds ${timings.fixedSeconds}\n     Regenerate: ${timings.regenerate}`)
  T(`${TOOL}: an unmeasured module costs the mean weight in the projection`,
    shardSeconds({ modules: ["measured", "unmeasured"], seconds: { measured: 4 }, shard: ["unmeasured"] }) === 4,
    `modules with no CI number yet: ${unmeasured.join(", ") || "none"}`)

  // A projection, not a measurement: the committed snapshot's seconds of the slowest shard's modules plus fixedSeconds.
  // It moves only when the snapshot is regenerated. The live guard is the job's timeout-minutes.
  const projection = (seconds) => slowestShardSeconds({ modules: everyModule, seconds, fixedSeconds: timings.fixedSeconds, shards: listed })
  const scaled = (factor) => Object.fromEntries(Object.entries(timings.seconds).map(([module, value]) => [module, value * factor]))
  const projected = projection(timings.seconds)
  T(`${TOOL}: the committed snapshot projects the slowest shard to ${projected.toFixed(0)}s, inside the ${SHARD_HARNESS_BUDGET_SECONDS}s budget`,
    projected <= SHARD_HARNESS_BUDGET_SECONDS,
    `the slowest shard projects to ${projected.toFixed(1)}s from run ${timings.sourceRun}\n     Split the slowest module or add shards to the matrix in .github/workflows/test.yml, then regenerate: ${timings.regenerate}`)
  T(`${TOOL}: the projection reads absolute snapshot seconds, so a uniformly slower snapshot projects proportionally slower`,
    Math.abs(projection(scaled(2)) - timings.fixedSeconds - 2 * (projected - timings.fixedSeconds)) < 0.01, `${projection(scaled(2)).toFixed(1)}s at 2 times, ${projected.toFixed(1)}s at 1 time`)
  T(`${TOOL}: no single module outweighs the budget, so a partition can fit it`,
    Math.max(...Object.values(timings.seconds)) + timings.fixedSeconds <= SHARD_HARNESS_BUDGET_SECONDS,
    `heaviest module: ${Object.entries(timings.seconds).sort(([, left], [, right]) => right - left)[0].join(" ")}s. Split it into case modules.`)

  const timingLine = (shard, seconds, fixedSeconds = 0.4) =>
    `Tool tests (${shard})\tUNKNOWN STEP\t2026-11-11T02:49:33.7612538Z ${TIMINGS_MARKER}${JSON.stringify({ shard, fixedSeconds, seconds })}\n`
  const mergeError = (text) => {
    try {
      mergeTimingLines(text)
      return ""
    } catch (error) {
      return error.message
    }
  }
  T(`${TOOL}: timing lines of every shard merge into one table`,
    JSON.stringify(mergeTimingLines(timingLine("1/2", { b: 2.5, a: 1 }) + timingLine("2/2", { c: 4 }, 1.2))) ===
      JSON.stringify({ fixedSeconds: 1.2, seconds: { a: 1, b: 2.5, c: 4 } }))
  T(`${TOOL}: a log with no timing line is refused`, /holds no "# tool-timings" line/.test(mergeError("no timing here")), mergeError("no timing here"))
  const missingShard = mergeError(timingLine("2/4", { b: 1 }) + timingLine("3/4", { c: 1 }) + timingLine("4/4", { d: 1 }))
  T(`${TOOL}: a missing shard is refused by name, so its modules cannot drop out of the table`, missingShard === "no timing line for shard 1/4", missingShard)
  const duplicateShard = mergeError(timingLine("1/2", { a: 1 }) + timingLine("1/2", { a: 2 }) + timingLine("2/2", { b: 1 }))
  T(`${TOOL}: a shard with two timing lines is refused`, duplicateShard === "more than one timing line for shard 1/2", duplicateShard)
  const mixedCount = mergeError(timingLine("1/2", { a: 1 }) + timingLine("2/2", { b: 1 }) + timingLine("3/3", { c: 1 }))
  T(`${TOOL}: timing lines of two shard counts are refused`, mixedCount === "the timing lines mix shard counts 2, 3", mixedCount)
  const unsharded = mergeError(timingLine("all", { a: 1 }))
  T(`${TOOL}: a timing line from an unsharded run is refused`, unsharded === 'a timing line names shard "all", not i/n', unsharded)

  const usage = run("test-tools.mjs", ["--shard", "0/4"])
  T(`${TOOL}: an invalid --shard exits 2`, usage.status === 2 && /--shard needs i\/n/.test(usage.stderr), usage.stderr)
  const combined = run("test-tools.mjs", ["--shard", "1/4", "--only", "bounded-process"])
  T(`${TOOL}: --shard cannot combine with --only`, combined.status === 2 && /cannot combine/.test(combined.stderr), combined.stderr)
}
