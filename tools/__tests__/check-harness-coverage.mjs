import { readFileSync } from "node:fs"
import { join } from "node:path"

import { TOOLS_DIR, T, stage, run } from "./_harness.mjs"

const TOOL = "check-harness-coverage.mjs"
const COMMITTED_BASELINE = join(TOOLS_DIR, "harness-coverage-baseline.json")

const baselineFile = (label, tools) =>
  stage(
    `harness-coverage/${label}/baseline.json`,
    `${JSON.stringify({ version: 1, total: Object.values(tools).reduce((sum, count) => sum + count, 0), tools }, null, 2)}\n`,
  )

const tallyFile = (label, tally) => stage(`harness-coverage/${label}/tally.json`, JSON.stringify(tally))

const ratchet = (label, tools, tally, extra = []) =>
  run(TOOL, ["--tally", tallyFile(label, tally), "--baseline", baselineFile(label, tools), ...extra])

const cases = () => {
  /**
   * The ordered cases. A baseline one higher than the real count is exactly the shape of the
   * two losses measured on this ticket's PR1: a bare `return` that disabled about 60 assertions
   * while the suite still printed PASS lines and exited 0, and two case bodies replaced by
   * `--help` greps. Neither printed anything at all, which is why the count has to be taken by
   * execution rather than read off the source.
   */
  const dropped = ratchet("dropped", { "launch-worker.mjs": 128, "worker-watch.mjs": 11 }, { "launch-worker.mjs": 128, "worker-watch.mjs": 10 })
  T(
    `${TOOL}: a baseline one higher than the real count fails naming the tool and both numbers`,
    dropped.status === 1 &&
      /worker-watch\.mjs: 11 assertions in the baseline, 10 now \(-1\)/.test(dropped.stdout) &&
      !/launch-worker\.mjs: \d+ assertions in the baseline/.test(dropped.stdout),
    `exit ${dropped.status}\n     ${dropped.stdout.trim()}`,
  )

  const reseedBaseline = baselineFile("reseeded", { "launch-worker.mjs": 128, "worker-watch.mjs": 11 })
  const reseeded = run(TOOL, [
    "--tally",
    tallyFile("reseeded", { "launch-worker.mjs": 128, "worker-watch.mjs": 10 }),
    "--baseline",
    reseedBaseline,
    "--reseed",
  ])
  const reseededBaseline = JSON.parse(readFileSync(reseedBaseline, "utf8"))
  T(
    `${TOOL}: the same drop passes under the reseed flag and rewrites the baseline`,
    reseeded.status === 0 && reseededBaseline.tools["worker-watch.mjs"] === 10 && reseededBaseline.total === 138,
    `exit ${reseeded.status}\n     ${reseeded.stdout.trim()}\n     baseline: ${JSON.stringify(reseededBaseline)}`,
  )

  const grew = ratchet("grew", { "launch-worker.mjs": 128 }, { "launch-worker.mjs": 141 })
  T(
    `${TOOL}: a count higher than the baseline passes and prints the new figure`,
    grew.status === 0 && /launch-worker\.mjs\s+141/.test(grew.stdout) && /gained coverage/.test(grew.stdout),
    `exit ${grew.status}\n     ${grew.stdout.trim()}`,
  )

  // A deleted case module does not shrink a count, it removes the key. Reading a missing tool
  // as "nothing to compare" would let a whole module vanish silently.
  const vanished = ratchet("vanished", { "launch-worker.mjs": 128, "nudge-worker.mjs": 9 }, { "launch-worker.mjs": 128 })
  T(
    `${TOOL}: a tool missing from the tally entirely is a drop to zero`,
    vanished.status === 1 && /nudge-worker\.mjs: 9 assertions in the baseline, 0 now \(-9\)/.test(vanished.stdout),
    `exit ${vanished.status}\n     ${vanished.stdout.trim()}`,
  )

  const unchanged = ratchet("unchanged", { "launch-worker.mjs": 128 }, { "launch-worker.mjs": 128 })
  T(
    `${TOOL}: an unchanged count passes and prints the totals`,
    unchanged.status === 0 && /TOTAL\s+128\s+\(baseline 128\)/.test(unchanged.stdout),
    `exit ${unchanged.status}\n     ${unchanged.stdout.trim()}`,
  )

  // Fail CLOSED on anything that would let the ratchet compare against nothing.
  const inconsistentTotal = run(TOOL, [
    "--tally",
    tallyFile("inconsistent", { "launch-worker.mjs": 128 }),
    "--baseline",
    stage("harness-coverage/inconsistent/baseline.json", JSON.stringify({ version: 1, total: 1, tools: { "launch-worker.mjs": 128 } })),
  ])
  T(
    `${TOOL}: a baseline whose total disagrees with its counts is refused`,
    inconsistentTotal.status === 2 && /per-tool counts sum to 128/.test(inconsistentTotal.stderr),
    `exit ${inconsistentTotal.status}\n     ${(inconsistentTotal.stderr || inconsistentTotal.stdout).trim()}`,
  )
  const wrongVersion = run(TOOL, [
    "--tally",
    tallyFile("wrong-version", { "launch-worker.mjs": 1 }),
    "--baseline",
    stage("harness-coverage/wrong-version/baseline.json", JSON.stringify({ version: 2, total: 1, tools: { "launch-worker.mjs": 1 } })),
  ])
  T(
    `${TOOL}: a baseline of an unknown version is refused`,
    wrongVersion.status === 2 && /baseline version is 2/.test(wrongVersion.stderr),
    `exit ${wrongVersion.status}\n     ${(wrongVersion.stderr || wrongVersion.stdout).trim()}`,
  )
  const emptyTally = run(TOOL, ["--tally", tallyFile("empty", {}), "--baseline", baselineFile("empty", { "launch-worker.mjs": 1 })])
  T(
    `${TOOL}: an empty tally is refused rather than read as a clean run`,
    emptyTally.status === 2 && /tally is empty/.test(emptyTally.stderr),
    `exit ${emptyTally.status}\n     ${(emptyTally.stderr || emptyTally.stdout).trim()}`,
  )
  const fractionalTally = run(TOOL, [
    "--tally",
    stage("harness-coverage/fractional/tally.json", JSON.stringify({ "launch-worker.mjs": 1.5 })),
    "--baseline",
    baselineFile("fractional", { "launch-worker.mjs": 1 }),
  ])
  T(
    `${TOOL}: a non-integer tally count is refused`,
    fractionalTally.status === 2 && /non-negative integers/.test(fractionalTally.stderr),
    `exit ${fractionalTally.status}\n     ${(fractionalTally.stderr || fractionalTally.stdout).trim()}`,
  )
  const missingTally = run(TOOL, ["--baseline", baselineFile("missing-tally", { "launch-worker.mjs": 1 })])
  T(
    `${TOOL}: a missing tally argument is refused`,
    missingTally.status === 2 && /--tally <path> is required/.test(missingTally.stderr),
    `exit ${missingTally.status}\n     ${(missingTally.stderr || missingTally.stdout).trim()}`,
  )

  const asJson = ratchet("json", { "launch-worker.mjs": 128 }, { "launch-worker.mjs": 127 }, ["--json"])
  const parsed = asJson.status === 1 ? JSON.parse(asJson.stdout) : null
  T(
    `${TOOL}: the JSON verdict names the drop with both numbers`,
    parsed !== null && parsed.drops.length === 1 && parsed.drops[0].tool === "launch-worker.mjs" && parsed.drops[0].baseline === 128 && parsed.drops[0].observed === 127,
    `exit ${asJson.status}\n     ${asJson.stdout.trim()}`,
  )

  // The committed baseline is the one this repository actually ratchets against, so its shape
  // is asserted here rather than trusted.
  const committed = JSON.parse(readFileSync(COMMITTED_BASELINE, "utf8"))
  T(
    `${TOOL}: the committed baseline is well formed and covers every case module`,
    committed.version === 1 &&
      Object.values(committed.tools).every((count) => Number.isInteger(count) && count > 0) &&
      committed.total === Object.values(committed.tools).reduce((sum, count) => sum + count, 0) &&
      Object.keys(committed.tools).length > 20,
    `tools/harness-coverage-baseline.json: ${Object.keys(committed.tools ?? {}).length} tools, total ${committed.total}`,
  )
}

export { cases }
