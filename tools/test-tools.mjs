#!/usr/bin/env node
/**
 * The harness execution gate: every script under tools/ is EXECUTED here, never
 * merely read. A harness cannot certify itself by review - claude-review.yml runs a
 * fresh session on every PR, but it reviews the DIFF, so a broken tool can be read,
 * approved and merged. tools/launch-worker.mjs shipped in PR #604 reading `orca
 * terminal wait`'s "not yet" (exit 1 with an ok:false payload) as a fatal error,
 * which only running it caught.
 *
 * Three layers:
 *   1. Structural coverage: every tools/<script> has a COVERAGE entry, so tool N+1
 *      cannot land uncovered.
 *   2. Universal contract (tools/CONVENTIONS.md): --help exits 0 with usage on
 *      stdout, and invalid input exits non-zero instead of doing the work.
 *   3. Decision paths: one case module per tool under tools/__tests__/, hermetic.
 *      External calls (orca, gh, git, Linear) are stubbed or dry-run - this gate
 *      creates no worktree, opens no network connection and touches no Linear issue.
 *
 * This file is the RUNNER and stays the single entry point. It owns exactly four
 * things: the CLI contract, TOOLS_DIR, the case-module registry, and the three
 * layers above. Every case body lives in tools/__tests__/<tool>.mjs and every shared
 * helper in tools/__tests__/_harness.mjs, so two tickets editing two tools no longer
 * edit the same file. TOOLS_DIR is resolved here once and injected, because a case
 * body that re-derived it from its own location would resolve tools/__tests__ and
 * silently break every join against it.
 *
 * Deliberately NOT re-asserted here: the verdicts of the tools guards.yml already
 * executes (dash ban, copy register, frontmatter, suppressions ratchet). Those have
 * their own jobs; this gate proves their CLI contract, not their findings.
 *
 * Run: node tools/test-tools.mjs   (exits non-zero on any failure)
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: test-tools.mjs

  Executes every script in tools/ and asserts its CLI contract and decision paths.
  Takes no arguments; hermetic (no network, no worktree, no Linear).

  --help, -h  print this usage and exit 0

exit codes: 0 every check passed, 1 a failing check, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

if (process.argv.length > 2) {
  console.error(`test-tools: takes no arguments, got: ${process.argv.slice(2).join(" ")}\n`)
  console.error(USAGE)
  process.exit(2)
}

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url))
const SELF = "test-tools.mjs"

// Loaded after the CLI contract, so --help and a bad argument stage no fixture root.
const { BASH, T, assertionTally, beginToolScope, check, configure, endToolScope, failureCount, orphanCaseKeys, stage, toolPath } =
  await import("./__tests__/_harness.mjs")
const { compareCoverage, formatCoverage, formatDrops, readBaselineShape } = await import("./lib/harness-coverage.mjs")

configure({ toolsDir: TOOLS_DIR, self: SELF })

/** Each tool's decision-path module: [tools/ script, tools/__tests__/ module, export]. */
const CASE_MODULES = [
  ["mergeability.mjs", "mergeability", "cases"],
  ["ai-quota.mjs", "ai-quota", "cases"],
  ["automation-budget.mjs", "automation-budget", "cases"],
  ["merge-sweep.sh", "merge-sweep", "cases"],
  ["merge-sweep-cov.sh", "merge-sweep", "coverageCases"],
  ["new-ticket.mjs", "new-ticket", "cases"],
  ["check-tier-labels.mjs", "check-tier-labels", "cases"],
  ["refresh-tier-labels.mjs", "refresh-tier-labels", "cases"],
  ["launch-worker.mjs", "launch-worker", "cases"],
  ["preflight.mjs", "preflight", "cases"],
  ["nudge-worker.mjs", "nudge-worker", "cases"],
  ["pr-watch.mjs", "pr-watch", "cases"],
  ["worker-watch.mjs", "worker-watch", "cases"],
  ["teardown-worktree.mjs", "teardown-worktree", "cases"],
  ["orca-web-port.mjs", "orca-web-port", "cases"],
  ["worker-status.mjs", "worker-status", "cases"],
  ["compose-prompt.mjs", "compose-prompt", "cases"],
  ["wave-plan.mjs", "wave-plan", "cases"],
  ["check-dashes.mjs", "check-dashes", "cases"],
  ["check-lockstep.mjs", "check-lockstep", "cases"],
  ["check-context-budget.mjs", "check-context-budget", "cases"],
  ["capture-surfaces.mjs", "capture-surfaces", "cases"],
  ["check-ticket.mjs", "check-ticket", "cases"],
  ["check-push-target.mjs", "check-push-target", "cases"],
  ["check-frontmatter.mjs", "check-frontmatter", "cases"],
  ["check-calibration.mjs", "check-calibration", "cases"],
  ["check-required-gates.mjs", "check-required-gates", "cases"],
  ["check-harness-coverage.mjs", "check-harness-coverage", "cases"],
  ["review-rounds.mjs", "review-rounds", "cases"],
]

const gateCases = {}
for (const [file, module, exported] of CASE_MODULES) {
  const loaded = await import(`./__tests__/${module}.mjs`)
  if (typeof loaded[exported] !== "function") {
    console.error(`test-tools: tools/__tests__/${module}.mjs exports no ${exported}() for ${file}`)
    process.exit(1)
  }
  gateCases[file] = loaded[exported]
}

/** argv that must be refused before the tool does any work. */
const INVALID_INPUT = {
  "agent-review.ps1": { argv: ["--orbit-not-a-flag"], status: 1 },
  "agent-review.sh": { argv: ["--orbit-not-a-flag"], status: 1 },
  "ai-quota.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "arch-map.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "automation-budget.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "capture-surfaces.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-context-budget.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-calibration.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-copy.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-dashes.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-frontmatter.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-harness-coverage.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-lockstep.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-push-target.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-required-gates.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-suppressions-ratchet.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-tier-labels.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-ticket.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "compose-prompt.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "launch-worker.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "merge-sweep-cov.sh": { argv: ["--orbit-not-a-flag", "zzz"], status: 2 },
  "merge-sweep.sh": { argv: ["--orbit-not-a-flag", "zzz"], status: 2 },
  "mergeability.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "new-ticket.mjs": { argv: [], status: 2 },
  "nudge-worker.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "orca-web-port.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "preflight.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "pr-watch.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "redesign-coverage.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "refresh-tier-labels.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "review-rounds.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "rollup.sh": { argv: ["--orbit-not-a-flag"], status: 2 },
  "surface-manifest.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "teardown-worktree.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "wave-plan.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "worker-status.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "worker-watch.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
}

console.log("# structural coverage")
const scripts = readdirSync(TOOLS_DIR)
  .filter((file) => /\.(mjs|sh|ps1)$/.test(file) && file !== SELF)
  .sort()
const uncovered = scripts.filter((file) => !INVALID_INPUT[file])
T(
  `every tools/ script has coverage (${scripts.length} scripts)`,
  uncovered.length === 0,
  `no COVERAGE entry for: ${uncovered.join(", ")}\n     Add one to INVALID_INPUT (and a CASE_MODULES row plus a tools/__tests__ module if it has decision paths) in tools/${SELF}.`,
)
T("the coverage guard actually enumerated scripts", scripts.length > 0, "tools/ resolved to zero scripts, so this gate proved nothing")
const pending = Object.keys(INVALID_INPUT).filter((file) => !scripts.includes(file))
for (const file of pending) console.log(`PENDING ${file} (covered here, not present on this branch)`)

console.log("\n# universal contract (tools/CONVENTIONS.md)")
T("a real bash is resolvable", Boolean(BASH) || !scripts.some((file) => file.endsWith(".sh")), "no working bash found; set ORBIT_BASH to one (the PATH bash on Windows is the WSL stub)")
for (const file of scripts) {
  if (file.endsWith(".sh") && !BASH) continue
  check(file, "--help exits 0 with usage on stdout", ["--help"], { status: 0, stdout: /usage|Usage/ })
  const invalid = INVALID_INPUT[file]
  if (invalid) check(file, "invalid input is refused", invalid.argv, { status: invalid.status })
}

console.log("\n# decision paths")
T(
  "a path resolved inside a case module equals the runner's",
  toolPath(SELF) === join(TOOLS_DIR, SELF) && existsSync(toolPath(SELF)),
  `the module resolved ${toolPath(SELF)}, the runner resolved ${join(TOOLS_DIR, SELF)}; TOOLS_DIR was not injected`,
)
const caseKeyProbe = dirname(stage("case-key-guard/present.mjs", "#!/usr/bin/env node\n"))
T(
  "a case key naming a real tools/ script is not an orphan",
  orphanCaseKeys(["present.mjs"], caseKeyProbe).length === 0,
  `orphanCaseKeys reported ${orphanCaseKeys(["present.mjs"], caseKeyProbe).join(", ")} for a staged, existing script`,
)
T(
  "a case key naming no real tools/ script is reported by name",
  orphanCaseKeys(["present.mjs", "absent.mjs"], caseKeyProbe).join(",") === "absent.mjs",
  `orphanCaseKeys reported ${orphanCaseKeys(["present.mjs", "absent.mjs"], caseKeyProbe).join(", ")} instead of absent.mjs`,
)
const orphanedCaseKeys = orphanCaseKeys(Object.keys(gateCases), TOOLS_DIR)
T(
  "every registered case key names a real tools/ script",
  orphanedCaseKeys.length === 0,
  `CASE_MODULES rows with no tools/ script: ${orphanedCaseKeys.join(", ")}\n     A skipped key exits 0 while its cases never run. Delete the row or restore the script.`,
)
for (const [file, cases] of Object.entries(gateCases)) {
  if (orphanedCaseKeys.includes(file)) continue
  beginToolScope(file)
  await cases()
  endToolScope()
}

/**
 * The coverage ratchet. Silent coverage loss is the root defect this ticket exists to remove:
 * on its own PR1 a bare `return` disabled about 60 assertions and this suite still printed PASS
 * lines and exited 0, and a later head replaced two case bodies with `--help` greps and nothing
 * failed. Both were caught by a human reading a diff. The tally is taken by EXECUTION, because
 * a static count over the source cannot see an unreachable `return`.
 *
 * Printed every run, so a drop stays visible even when the label allows it.
 */
console.log("\n# assertion coverage")
// The two verdicts below are excluded from the tally by construction: an assertion whose
// subject IS the tally cannot be inside it. Every one of the tool buckets is ratcheted, so the
// suite's printed assertion total is the tally plus exactly these two.
const tally = assertionTally()
const baselinePath = join(TOOLS_DIR, "harness-coverage-baseline.json")
let baseline = null
let baselineProblem = existsSync(baselinePath) ? null : `no baseline at ${baselinePath}`
if (!baselineProblem) {
  try {
    baseline = JSON.parse(readFileSync(baselinePath, "utf8"))
  } catch (error) {
    baselineProblem = `${baselinePath} is unreadable: ${error.message}`
  }
  baselineProblem = baselineProblem ?? readBaselineShape(baseline)
}
const reseeding = process.env.ORBIT_HARNESS_COVERAGE_RESEED === "1"
const coverage = compareCoverage(baseline ?? { tools: {} }, tally)
console.log(formatCoverage(tally, coverage))
T(
  "the coverage baseline is readable and well formed",
  baselineProblem === null,
  `${baselineProblem}\n     Without a baseline this gate cannot see an assertion that stopped running, which is the defect it exists for.`,
)
T(
  reseeding ? "per-tool assertion coverage may drop under coverage:reseed" : "no tool lost assertion coverage",
  reseeding || coverage.drops.length === 0,
  `${coverage.drops.length} tool(s) lost coverage:\n${formatDrops(coverage.drops)}\n     An assertion that stops running prints nothing at all. Restore the cases, or apply the\n     coverage:reseed label and reseed ${baselinePath} if the loss is deliberate.`,
)
if (reseeding && coverage.drops.length > 0) {
  console.log(`coverage:reseed accepted ${coverage.drops.length} drop(s):\n${formatDrops(coverage.drops)}`)
}
if (coverage.growth.length > 0) {
  console.log(`${coverage.growth.length} tool(s) gained coverage; reseed the baseline to record the new figures.`)
}
/** The executed tally, for the deliberate reseed. Written only when a path is asked for. */
if (process.env.ORBIT_HARNESS_COVERAGE_TALLY) {
  writeFileSync(process.env.ORBIT_HARNESS_COVERAGE_TALLY, `${JSON.stringify(tally, null, 2)}\n`)
  console.log(`tally written: ${process.env.ORBIT_HARNESS_COVERAGE_TALLY}`)
}

const failures = failureCount()
console.log(`\n${failures === 0 ? "ORBIT TOOLS GATE OK" : `ORBIT TOOLS GATE FAILED (${failures})`}`)
process.exit(failures === 0 ? 0 : 1)
