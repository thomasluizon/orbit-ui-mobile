#!/usr/bin/env node
/**
 * The harness execution gate: every script under tools/ is EXECUTED here, never merely
 * read. A harness cannot certify itself by review, and no CI reviewer exists to try:
 * review is a local /pr-review subagent reading the DIFF, so a broken tool can be read,
 * approved and merged. tools/launch-worker.mjs once shipped reading `orca terminal wait`'s
 * "not yet" (exit 1 with an ok:false payload) as a fatal error, which only running it caught.
 *
 * Three layers:
 *   1. Structural coverage: every tools/ script has a COVERAGE entry and every entry names a
 *      script that exists, so tool N+1 cannot land uncovered and a deleted tool cannot leave a
 *      row pointing at nothing.
 *   2. Universal contract (tools/CONVENTIONS.md): --help exits 0 with usage on stdout, and
 *      invalid input exits non-zero instead of doing the work.
 *   3. Decision paths: one case module per covered unit under tools/__tests__/, hermetic.
 *      External calls (orca, gh, git) are stubbed or dry-run - this gate creates no worktree,
 *      opens no network connection and touches no ticket.
 *
 * This file is the RUNNER and stays the single entry point. It owns exactly four things: the
 * CLI contract, TOOLS_DIR, the case-module registry, and the three layers above. Every case
 * body lives in tools/__tests__/<module>.mjs and every shared helper in
 * tools/__tests__/_harness.mjs, so two tickets editing two tools no longer edit the same file.
 * TOOLS_DIR is resolved here once and injected, because a case body that re-derived it from its
 * own location would resolve tools/__tests__ and silently break every join against it.
 *
 * Deliberately NOT re-asserted here: the verdicts of the tools guards.yml already executes (dash
 * ban, copy register, suppressions ratchet). Those have their own jobs; this gate proves their
 * CLI contract, not their findings.
 *
 * Run: node tools/test-tools.mjs   (exits non-zero on any failure)
 */

import { existsSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: test-tools.mjs

  Executes every script in tools/ and asserts its CLI contract and decision paths.
  Takes no arguments; hermetic (no network, no worktree, no ticket system).

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
const LIB_DIR = join(TOOLS_DIR, "lib")

// Loaded after the CLI contract, so --help and a bad argument stage no fixture root.
const { BASH, T, assertionTally, beginToolScope, check, configure, endToolScope, failureCount, orphanCaseKeys, stage, toolPath } =
  await import("./__tests__/_harness.mjs")

configure({ toolsDir: TOOLS_DIR, self: SELF })

/**
 * Each covered unit's decision-path module: [path under tools/, module under tools/__tests__/].
 * A library under tools/lib/ is registered by its relative path, because it has no CLI for the
 * universal contract to check and this registry is the only coverage it can carry.
 */
const CASE_MODULES = [
  ["capture-surfaces.mjs", "capture-surfaces"],
  ["check-dashes.mjs", "check-dashes"],
  ["check-push-target.mjs", "check-push-target"],
  ["check-root-allowlist.mjs", "check-root-allowlist"],
  ["comment-ticket.mjs", "comment-ticket"],
  ["compose-prompt.mjs", "compose-prompt"],
  ["complete-ticket.mjs", "complete-ticket"],
  ["create-milestone.mjs", "create-milestone"],
  ["create-ticket.mjs", "create-ticket"],
  ["launch-worker.mjs", "launch-worker"],
  ["lib/body-edit-invalidation.mjs", "body-edit-invalidation"],
  ["lib/orchestrator-config.mjs", "orchestrator-config"],
  ["lib/performance-measurement.mjs", "performance-measurement"],
  ["lib/bounded-process.mjs", "bounded-process"],
  ["lib/github-auth.mjs", "github-auth"],
  ["lib/github-issues.mjs", "github-issues"],
  ["lib/github-rate-limit.mjs", "github-rate-limit"],
  ["lib/github-target.mjs", "github-target"],
  ["lib/identifier-ledger.mjs", "identifier-ledger"],
  ["lib/manual-steps.mjs", "manual-steps"],
  ["lib/pr-body.mjs", "pr-body"],
  ["lib/readiness-receipt.mjs", "readiness-receipt"],
  ["lib/run-state.mjs", "run-state"],
  ["lib/ticket-executability.mjs", "ticket-executability"],
  ["list-bot-threads.mjs", "list-bot-threads"],
  ["orca-web-port.mjs", "orca-web-port"],
  ["plan-queue.mjs", "plan-queue"],
  ["record-readiness.mjs", "record-readiness"],
  ["record-gh-fixtures.mjs", "record-gh-fixtures"],
  ["resolve-bot-thread.mjs", "resolve-bot-thread"],
  ["salvage-worker.mjs", "salvage-worker"],
  ["sync-issue-state.mjs", "sync-issue-state"],
  ["teardown-worktree.mjs", "teardown-worktree"],
  ["verify-delivery.mjs", "verify-delivery"],
]

const gateCases = {}
for (const [file, module] of CASE_MODULES) {
  const loaded = await import(`./__tests__/${module}.mjs`)
  if (typeof loaded.cases !== "function") {
    console.error(`test-tools: tools/__tests__/${module}.mjs exports no cases() for ${file}`)
    process.exit(1)
  }
  gateCases[file] = loaded.cases
}

/** argv that must be refused before the tool does any work. One row per tools/ script. */
const INVALID_INPUT = {
  "arch-map.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "capture-surfaces.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-copy.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-dashes.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-push-target.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-root-allowlist.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-suppressions-ratchet.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "comment-ticket.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "compose-prompt.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "complete-ticket.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "create-milestone.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "create-ticket.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "launch-worker.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "list-bot-threads.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "orca-web-port.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "plan-queue.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "record-readiness.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "record-gh-fixtures.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "resolve-bot-thread.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "salvage-worker.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "sync-issue-state.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "surface-manifest.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "teardown-worktree.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "verify-delivery.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
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
/**
 * The reverse direction, and the one a deletion breaks: a row naming a script that no longer
 * exists is dead weight that reads as coverage. The harness rebuild deleted 29 tools at once and
 * every one of their rows stayed behind, so this fails rather than printing a note.
 */
const staleRows = Object.keys(INVALID_INPUT).filter((file) => !scripts.includes(file))
T(
  "every COVERAGE entry names a tools/ script that exists",
  staleRows.length === 0,
  `INVALID_INPUT rows with no tools/ script: ${staleRows.join(", ")}\n     Delete the row, or restore the script it claims to cover.`,
)

const libraries = existsSync(LIB_DIR) ? readdirSync(LIB_DIR).filter((file) => file.endsWith(".mjs")).sort() : []
const uncoveredLibraries = libraries.filter((file) => !gateCases[`lib/${file}`])
T(
  `every tools/lib/ module has a case module (${libraries.length} modules)`,
  uncoveredLibraries.length === 0,
  `no CASE_MODULES row for: ${uncoveredLibraries.map((file) => `lib/${file}`).join(", ")}\n     A library has no CLI, so a case module is the only coverage it can carry.`,
)

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
  "every registered case key names a real tools/ file",
  orphanedCaseKeys.length === 0,
  `CASE_MODULES rows with no tools/ file: ${orphanedCaseKeys.join(", ")}\n     A skipped key exits 0 while its cases never run. Delete the row or restore the file.`,
)
for (const [file, cases] of Object.entries(gateCases)) {
  if (orphanedCaseKeys.includes(file)) continue
  beginToolScope(file)
  await cases()
  endToolScope()
}

/**
 * Silent coverage loss is the defect this layer exists to remove: on an earlier revision a bare
 * `return` disabled about 60 assertions and this suite still printed PASS lines and exited 0. The
 * tally is taken by EXECUTION, because a static count over the source cannot see an unreachable
 * `return`. A case module that contributes NOTHING is the shape that reaches zero cost silently,
 * so it fails here by name rather than passing quietly.
 */
console.log("\n# assertion coverage")
const tally = assertionTally()
for (const [tool, count] of Object.entries(tally).sort(([left], [right]) => left.localeCompare(right))) {
  console.log(`${String(count).padStart(4)}  ${tool}`)
}
const silent = Object.keys(gateCases).filter((file) => !orphanedCaseKeys.includes(file) && !(tally[file] > 0))
T(
  "every registered case module ran at least one assertion",
  silent.length === 0,
  `case modules that asserted nothing: ${silent.join(", ")}\n     An assertion that stops running prints nothing at all. Restore the cases.`,
)

const failures = failureCount()
console.log(`\n${failures === 0 ? "ORBIT TOOLS GATE OK" : `ORBIT TOOLS GATE FAILED (${failures})`}`)
process.exit(failures === 0 ? 0 : 1)
