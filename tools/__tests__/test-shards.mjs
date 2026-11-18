import { spawnSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import yaml from "js-yaml"

import { localShardCount, MAX_LOCAL_SHARDS, medianTimings, mergeTimingLines, parseShard, partitionDefects, partitionModules, runShardsInParallel, shardSeconds, slowestShardSeconds, TIMINGS_MARKER } from "../lib/test-shards.mjs"
import { BASH, REPO_ROOT, T, run, stage, toolPath } from "./_harness.mjs"

const TOOL = "lib/test-shards.mjs"

/** One shard job must finish in 6 minutes (the ticket). */
const SHARD_JOB_LIMIT_SECONDS = 360
/**
 * Checkout, setup-node, the npm version and npm ci --prefer-offline --no-audit before the harness step: the same steps took
 * 35 to 56 s in the layout shards of PR Tests runs 44216168902 and 44221130214, plus 3 to 5 s for the npm version.
 */
const SHARD_SETUP_SECONDS = 70
const SHARD_HARNESS_BUDGET_SECONDS = SHARD_JOB_LIMIT_SECONDS - SHARD_SETUP_SECONDS

const listModules = (...argv) => run("test-tools.mjs", ["--list", ...argv]).stdout.split("\n").filter((line) => /^[a-z0-9-]+$/.test(line))

export const cases = async () => {
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
  T(`${TOOL}: the shards run only when the plan names a tool input among the changed paths`,
    job?.needs === "plan" && job.if === "needs.plan.outputs.tools == 'true'", JSON.stringify({ needs: job?.needs, if: job?.if }))
  T(`${TOOL}: Tool and Hook Tests keeps its required name, runs unless cancelled and needs the plan, the shards and the hook job`,
    gate?.name === "Tool and Hook Tests" && gate.if === "${{ !cancelled() }}" && JSON.stringify(gate.needs) === JSON.stringify(["plan", "tool-tests", "hook-tests"]) &&
      JSON.stringify(gateStep?.env) === JSON.stringify({
        PLAN_RESULT: "${{ needs.plan.result }}", TOOLS_PLANNED: "${{ needs.plan.outputs.tools }}",
        TOOL_RESULT: "${{ needs.tool-tests.result }}", HOOK_RESULT: "${{ needs.hook-tests.result }}",
      }),
    JSON.stringify(gate))
  if (BASH) {
    const outcomes = ["success", "failure", "cancelled", "skipped"]
    const wrong = outcomes.flatMap((plan) => ["true", "false", ""].flatMap((planned) => outcomes.flatMap((tool) => outcomes.map((hook) => ({ plan, planned, tool, hook })))))
      .filter(({ plan, planned, tool, hook }) => {
        const env = { ...process.env, PLAN_RESULT: plan, TOOLS_PLANNED: planned, TOOL_RESULT: tool, HOOK_RESULT: hook }
        const gated = spawnSync(BASH, ["-e", "-c", gateStep.run], { env })
        return (gated.status === 0) !== (plan === "success" && hook === "success" && (tool === "success" || (tool === "skipped" && planned === "false")))
      })
    T(`${TOOL}: Tool and Hook Tests passes only when the plan and the hook job succeeded and every shard succeeded or the plan skipped them`, wrong.length === 0, JSON.stringify(wrong))
  }
  const hookCommands = workflow.jobs["hook-tests"]?.steps?.map((step) => step.run ?? "") ?? []
  T(`${TOOL}: the hook job runs the hooks harness and the workflow behavior tests`,
    workflow.jobs["hook-tests"]?.needs === undefined && hookCommands.includes("node .claude/hooks/test-hooks.mjs") &&
      hookCommands.some((command) => command.includes("tools/__tests__/guards-changed-paths.test.mjs")),
    JSON.stringify(hookCommands))
  // No other job runs these files, so a file that leaves the step leaves CI without a red check.
  const nodeTestFiles = [".github/scripts", "tools/__tests__"].flatMap((directory) =>
    readdirSync(join(REPO_ROOT, directory)).filter((name) => name.endsWith(".test.mjs")).map((name) => `${directory}/${name}`))
  const behaviorTests = (hookCommands.find((command) => command.startsWith("node --test ")) ?? "").split(" ").slice(2)
  const unlisted = nodeTestFiles.filter((file) => !behaviorTests.includes(file))
  T(`${TOOL}: the hook job runs every node test file, the critical CVE gate test among them`,
    nodeTestFiles.includes(".github/scripts/check-critical-production-cves.test.mjs") && unlisted.length === 0 &&
      behaviorTests.every((file) => nodeTestFiles.includes(file)),
    JSON.stringify({ unlisted, behaviorTests }))

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

  T(`${TOOL}: medianTimings gives each registered module the median of its runs and the largest overhead`,
    JSON.stringify(medianTimings([
      { fixedSeconds: 1, seconds: { a: 10, b: 4, gone: 1 } },
      { fixedSeconds: 2.5, seconds: { a: 30, b: 5 } },
      { fixedSeconds: 1.5, seconds: { a: 20.04, c: 7 } },
    ], ["a", "b", "c", "d"])) === JSON.stringify({ fixedSeconds: 2.5, seconds: { a: 20, b: 4.5, c: 7 }, unregistered: ["gone"] }))
  T(`${TOOL}: the shard jobs install with the offline npm cache flags their setup budget measured`,
    job?.steps?.some((step) => step.run === "npm ci --prefer-offline --no-audit --fund=false") && !job?.steps?.some((step) => step.run === "npm ci"),
    JSON.stringify(job?.steps?.map((step) => step.run).filter(Boolean)))

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
  for (const argv of [["--parallel", "0"], ["--parallel", "two"], ["--parallel", "2", "--only", "bounded-process"], ["--parallel", "2", "--shard", "1/2"]]) {
    const refused = run("test-tools.mjs", argv)
    T(`${TOOL}: test-tools.mjs ${argv.join(" ")} exits 2`, refused.status === 2 && /--parallel/.test(refused.stderr), refused.stderr)
  }
  const sizes = [[1, 1], [4, 4], [8, 8], [16, 8], [0, 1], [4.9, 4]].map(([cores, expected]) => [cores, expected, localShardCount(cores)])
  T(`${TOOL}: a full local run starts one shard for each core, at most ${MAX_LOCAL_SHARDS}, and at least one`, sizes.every(([, expected, actual]) => actual === expected), JSON.stringify(sizes))
  const capComment = /(\/\*\*[^\n]*\*\/)\nexport const MAX_LOCAL_SHARDS/.exec(readFileSync(toolPath("lib/test-shards.mjs"), "utf8"))?.[1] ?? ""
  T(`${TOOL}: the comment of MAX_LOCAL_SHARDS names the tool-tests matrix of test.yml and does not call the cap the CI shard count`,
    capComment.includes("tool-tests matrix in test.yml") && !/CI shard count/.test(capComment), capComment)
  const helpText = run("test-tools.mjs", ["--help"]).stdout
  T(`${TOOL}: the --parallel usage text says CI runs its own shard count and does not call a local run the local form of the CI shards`,
    /CI runs the tool-tests matrix of test\.yml/.test(helpText) && !/local form of the\s+CI shards/.test(helpText), helpText)
  const automatic = run("test-tools.mjs", ["--parallel", "auto", "--list"])
  T(`${TOOL}: --parallel auto is a parallel run, so it refuses --list`, automatic.status === 2 && /--parallel cannot combine/.test(automatic.stderr), automatic.stderr)
  await parallelCases()
}

/** A stub shard prints an assertion line and fails only as shard 2/3, after a delay, so the run waits for every shard. */
const parallelCases = async () => {
  const stub = stage("test-shards/stub-shard.mjs", [
    "const shard = process.argv[2]",
    "const delay = shard === \"1/3\" ? 300 : 0",
    "setTimeout(() => {",
    "  console.log(`line one of ${shard}`)",
    "  console.error(`stderr of ${shard}`)",
    "  console.log(`line two of ${shard}`)",
    "  console.log(`Assertions: ${shard === \"3/3\" ? 5 : 2} | Elapsed: 0.1s`)",
    "  process.exit(shard === \"2/3\" ? 1 : 0)",
    "}, delay)",
  ].join("\n"))
  const ended = []
  const result = await runShardsInParallel(3, (shardName) => [stub, shardName], (shardName, status, output) => ended.push({ shardName, status, output }))
  T(`${TOOL}: the parallel run names each failed shard and sums every assertion line`,
    JSON.stringify(result) === JSON.stringify({ failed: ["2/3"], assertions: 9 }), JSON.stringify(result))
  T(`${TOOL}: the parallel run reports each shard once, with its whole output and exit status`,
    ended.length === 3 && ended.every(({ shardName, status, output }) =>
      status === (shardName === "2/3" ? 1 : 0) && output.includes(`line one of ${shardName}`) && output.includes(`stderr of ${shardName}`) && output.includes(`line two of ${shardName}`)),
    JSON.stringify(ended))
  T(`${TOOL}: the shards run at one time, so the slow shard ends last`, ended.at(-1)?.shardName === "1/3", JSON.stringify(ended.map((entry) => entry.shardName)))
  const missing = await runShardsInParallel(1, () => [stage("test-shards/missing-parent/../absent.mjs", "process.exit(3)\n")], () => {})
  T(`${TOOL}: a shard that exits non-zero with no assertion line fails`, JSON.stringify(missing) === JSON.stringify({ failed: ["1/1"], assertions: 0 }), JSON.stringify(missing))
}
