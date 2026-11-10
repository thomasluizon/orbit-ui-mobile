import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import yaml from "js-yaml"

import { mergeTimingLines, parseShard, partitionDefects, partitionModules, shardSeconds, slowestShardSeconds, TIMINGS_MARKER } from "../lib/test-shards.mjs"
import { BASH, REPO_ROOT, T, run, toolPath } from "./_harness.mjs"

const TOOL = "lib/test-shards.mjs"

/** One shard job must finish in 6 minutes (the ticket). */
const SHARD_JOB_LIMIT_SECONDS = 360
/** Checkout, setup-node and npm ci before the harness step: 66 s at most on PR Tests run 42915781433 (`timings.sourceRun`). */
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

  const projection = (seconds) => slowestShardSeconds({ modules: everyModule, seconds, fixedSeconds: timings.fixedSeconds, shards: listed })
  const scaled = (factor) => Object.fromEntries(Object.entries(timings.seconds).map(([module, value]) => [module, value * factor]))
  const projected = projection(timings.seconds)
  T(`${TOOL}: the slowest shard projects to ${projected.toFixed(0)}s of CI time, inside the ${SHARD_HARNESS_BUDGET_SECONDS}s budget`,
    projected <= SHARD_HARNESS_BUDGET_SECONDS,
    `the slowest shard projects to ${projected.toFixed(1)}s from run ${timings.sourceRun}\n     Add shards to the matrix in .github/workflows/test.yml, or regenerate: ${timings.regenerate}`)
  T(`${TOOL}: the projection fails when every module runs slower, so the budget can go red`,
    projection(scaled(1.5)) > SHARD_HARNESS_BUDGET_SECONDS && projection(scaled(1.5)) > projected, `${projection(scaled(1.5)).toFixed(1)}s at 1.5 times`)
  const heavy = { ...timings.seconds, "added-heavy-module": SHARD_HARNESS_BUDGET_SECONDS }
  const withHeavy = partitionModules({ modules: [...everyModule, "added-heavy-module"], seconds: heavy, shardCount })
  T(`${TOOL}: a new heavy module that lands in a shard fails the budget`,
    slowestShardSeconds({ modules: [...everyModule, "added-heavy-module"], seconds: heavy, fixedSeconds: timings.fixedSeconds, shards: withHeavy }) > SHARD_HARNESS_BUDGET_SECONDS)

  const logged = `Tool tests (1/2)\tRun\t2026-11-10T22:35:27.1Z ${TIMINGS_MARKER}${JSON.stringify({ shard: "1/2", fixedSeconds: 0.4, seconds: { b: 2.5, a: 1 } })}\n` +
    `Tool tests (2/2)\tRun\t2026-11-10T22:35:28.1Z ${TIMINGS_MARKER}${JSON.stringify({ shard: "2/2", fixedSeconds: 1.2, seconds: { c: 4 } })}\n`
  T(`${TOOL}: timing lines of every shard merge into one table`,
    JSON.stringify(mergeTimingLines(logged)) === JSON.stringify({ fixedSeconds: 1.2, seconds: { a: 1, b: 2.5, c: 4 } }) && mergeTimingLines("no timing here") === null)
  const scratch = mkdtempSync(join(tmpdir(), "test-shards-"))
  const output = join(scratch, "timings.json")
  const roundTrip = run("test-tools.mjs", ["--write-timings", output, "--source-run", "7"], { input: logged })
  const roundTripped = roundTrip.status === 0 ? JSON.parse(readFileSync(output, "utf8")) : null
  rmSync(scratch, { recursive: true, force: true })
  T(`${TOOL}: --write-timings writes the merged table with its source run and keeps the regenerate command`,
    roundTripped?.sourceRun === 7 && roundTripped.fixedSeconds === 1.2 && roundTripped.regenerate === timings.regenerate &&
      JSON.stringify(roundTripped.seconds) === JSON.stringify({ a: 1, b: 2.5, c: 4 }),
    `${roundTrip.stderr} ${JSON.stringify(roundTripped)}`)
  const written = run("test-tools.mjs", ["--write-timings", join(REPO_ROOT, "unused.json"), "--source-run", "7"], { input: "no timing here" })
  T(`${TOOL}: --write-timings refuses a log with no timing line`, written.status === 2 && /holds no/.test(written.stderr), written.stderr)
  T(`${TOOL}: --write-timings needs a numeric --source-run`,
    run("test-tools.mjs", ["--write-timings", join(REPO_ROOT, "unused.json"), "--source-run", "latest"]).status === 2 &&
      run("test-tools.mjs", ["--write-timings", join(REPO_ROOT, "unused.json")]).status === 2)

  const usage = run("test-tools.mjs", ["--shard", "0/4"])
  T(`${TOOL}: an invalid --shard exits 2`, usage.status === 2 && /--shard needs i\/n/.test(usage.stderr), usage.stderr)
  const combined = run("test-tools.mjs", ["--shard", "1/4", "--only", "bounded-process"])
  T(`${TOOL}: --shard cannot combine with --only`, combined.status === 2 && /cannot combine/.test(combined.stderr), combined.stderr)
  const timed = run("test-tools.mjs", ["--write-timings", join(REPO_ROOT, "unused.json"), "--source-run", "7", "--only", "bounded-process"])
  T(`${TOOL}: --write-timings runs nothing, so it refuses --only`, timed.status === 2 && /runs nothing/.test(timed.stderr), timed.stderr)
}
