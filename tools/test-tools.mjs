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
 *   3. Decision paths: the per-tool cases below, hermetic. External calls (orca, gh,
 *      git, Linear) are stubbed or dry-run - this gate creates no worktree, opens no
 *      network connection and touches no Linear issue.
 *
 * Deliberately NOT re-asserted here: the verdicts of the tools guards.yml already
 * executes (dash ban, copy register, frontmatter, suppressions ratchet). Those have
 * their own jobs; this gate proves their CLI contract, not their findings.
 *
 * Run: node tools/test-tools.mjs   (exits non-zero on any failure)
 */

import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"
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
const REPO_ROOT = resolve(TOOLS_DIR, "..")
const SELF = "test-tools.mjs"
const EM_DASH = String.fromCharCode(0x2014)

let fails = 0
const T = (name, ok, detail = "") => {
  if (!ok) fails++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `\n     ${detail}`}`)
}

const root = mkdtempSync(join(tmpdir(), "orbit-tools-gate-"))
process.on("exit", () => {
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    /* a transient lock on the fixture root must never mask the suite's verdict */
  }
})
const stage = (relativePath, body) => {
  const path = join(root, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
  return path
}

const LOCKSTEP_PATHS = [
  ".claude/skills/pr-review/SKILL.md",
  ".claude/skills/pr-review/rubric.md",
  ".claude/skills/_shared/verification-protocol.md",
  ".claude/agents/contract-aligner.md",
  ".claude/agents/security-reviewer.md",
  ".claude/skills/second-opinion/second-opinion.mjs",
]
const lockstepFingerprint = (ui, api) =>
  createHash("sha256").update(JSON.stringify({ ui: [ui], api: [api] })).digest("hex")
const lockstepFixture = (label, uiBody = "shared\n", apiBody = uiBody, declarations = []) => {
  const uiRoot = join(root, "lockstep", label, "ui")
  const apiRoot = join(root, "lockstep", label, "api")
  const files = {}
  for (const path of LOCKSTEP_PATHS) {
    stage(join("lockstep", label, "ui", path), path === LOCKSTEP_PATHS[0] ? uiBody : "shared\n")
    stage(join("lockstep", label, "api", path), path === LOCKSTEP_PATHS[0] ? apiBody : "shared\n")
    files[path] = { declarations: path === LOCKSTEP_PATHS[0] ? declarations : [] }
  }
  const manifest = stage(join("lockstep", label, "manifest.json"), JSON.stringify({ version: 1, files }))
  return { uiRoot, apiRoot, manifest }
}
const lockstepDefaultApiFixture = (label) => {
  const fixture = lockstepFixture(label)
  const apiRoot = resolve(fixture.uiRoot, "..", "orbit-api")
  cpSync(fixture.apiRoot, apiRoot, { recursive: true })
  rmSync(fixture.apiRoot, { recursive: true, force: true })
  return { ...fixture, apiRoot }
}

/**
 * The PATH `bash` on Windows is the WSL stub, which fails with no such file. Resolve
 * a real one and fail loudly rather than skipping every .sh tool.
 */
const resolveBash = () => {
  const candidates = [
    process.env.ORBIT_BASH,
    "bash",
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  ].filter(Boolean)
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" })
    if (!probe.error && probe.status === 0) return candidate
  }
  return null
}
const BASH = resolveBash()

/**
 * orca is stubbed by pointing ORCA_BIN at this node binary and preloading a shim.
 * The shim answers a stubbed plan when node was invoked as orca (argv[1] is a
 * subcommand, not a file) and stands aside when node is running the tool itself.
 * An unstubbed call exits 9 with a stub-miss payload, so an unexpected orca call is
 * a loud failure rather than a silent pass.
 *
 * A `sequence` entry answers successive calls differently, which is the only way to
 * drive a retry loop: launch-worker.mjs re-sends a prompt pointer that did not land,
 * so "delivered on the second send" needs the second `terminal read` to differ from
 * the first. The counter cannot live in memory (every stub call is its own process),
 * so it is derived from the call log, which is why `sequence` requires ORBIT_ORCA_LOG.
 */
const ORCA_SHIM = stage(
  "orca-shim.cjs",
  `const { spawnSync } = require("node:child_process")
const { EventEmitter } = require("node:events")
const { appendFileSync, existsSync, readFileSync, rmSync } = require("node:fs")
if (process.env.ORBIT_LINEAR_PARENT_STUB) {
  const https = require("node:https")
  const { syncBuiltinESMExports } = require("node:module")
  const stub = JSON.parse(process.env.ORBIT_LINEAR_PARENT_STUB)
  https.request = (_url, options, callback) => {
    const linearRequest = new EventEmitter()
    linearRequest.end = () => {
      process.nextTick(() => {
        const linearResponse = new EventEmitter()
        linearResponse.statusCode = stub.status ?? 200
        callback(linearResponse)
        linearResponse.emit("data", Buffer.from(JSON.stringify(stub.body)))
        linearResponse.emit("end")
      })
    }
    linearRequest.destroy = (error) => process.nextTick(() => linearRequest.emit("error", error))
    if (stub.requireTimeout && options.timeout !== 5000) {
      process.nextTick(() => linearRequest.emit("error", new Error("missing Linear parent timeout")))
    }
    return linearRequest
  }
  syncBuiltinESMExports()
}
const argv = process.argv.slice(1)
if (argv[0] && existsSync(argv[0])) return
const line = argv.join(" ")
const plan = JSON.parse(process.env.ORBIT_ORCA_STUB || "[]")
const match = plan.find((entry) => line.includes(entry.match))
if (!match) {
  process.stdout.write(JSON.stringify({ ok: false, error: { code: "stub-miss", message: "unstubbed orca call: " + line } }))
  process.exit(9)
}
if (match.delayMs) {
  const timingLog = process.env.ORBIT_ORCA_TIMING_LOG
  if (timingLog) appendFileSync(timingLog, JSON.stringify({ event: "start", line, pid: process.pid }) + "\\n")
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, match.delayMs)
  if (timingLog) appendFileSync(timingLog, JSON.stringify({ event: "end", line, pid: process.pid }) + "\\n")
}
if (match.removePath) rmSync(match.removePath, { recursive: true, force: true })
if (match.pruneRepo) spawnSync("git", ["-C", match.pruneRepo, "worktree", "prune"])
let out = match.stdout
let exit = match.exit ?? 0
if (Array.isArray(match.sequence)) {
  const log = process.env.ORBIT_ORCA_LOG
  const previous = log && existsSync(log)
    ? readFileSync(log, "utf8").split("\\n").filter(Boolean).filter((entry) => JSON.parse(entry).join(" ").includes(match.match)).length
    : 0
  const selected = match.sequence[Math.min(previous, match.sequence.length - 1)]
  out = typeof selected === "string" ? selected : selected.stdout
  if (typeof selected !== "string") exit = selected.exit ?? exit
}
if (process.env.ORBIT_ORCA_LOG) appendFileSync(process.env.ORBIT_ORCA_LOG, JSON.stringify(argv) + "\\n")
process.stdout.write(out.replaceAll("__NOW__", String(Date.now())))
process.exit(exit)
`,
)

/**
 * NODE_OPTIONS treats a backslash inside quotes as an escape, so the shim path goes in POSIX form.
 * The same shim answers `gh`, because it keys on the command line and nothing else: pr-watch.mjs
 * shells out to `gh api graphql`, and a stub plan entry matching `number=615` answers it.
 */
const orcaEnv = (plan) => ({
  ORCA_BIN: process.execPath,
  GH_BIN: process.execPath,
  NODE_OPTIONS: `--require "${ORCA_SHIM.replaceAll("\\", "/")}"`,
  ORBIT_ORCA_STUB: JSON.stringify(plan),
})

const MERGE_SWEEP_GH_DIR = join(root, "merge-sweep-bin")
const MERGE_SWEEP_GH = stage(
  "merge-sweep-bin/gh",
  `#!/usr/bin/env node
const { appendFileSync, existsSync, writeFileSync } = require("node:fs")
const argv = process.argv.slice(2)
const line = argv.join(" ")
appendFileSync(process.env.ORBIT_MERGE_SWEEP_LOG, JSON.stringify(argv) + "\\n")
const updateMarker = process.env.ORBIT_MERGE_SWEEP_LOG + ".updated"
const postMergeMarker = process.env.ORBIT_MERGE_SWEEP_LOG + ".post-merge"
const currentHead = () => existsSync(updateMarker) && process.env.ORBIT_MERGE_SWEEP_UPDATED_HEAD ? process.env.ORBIT_MERGE_SWEEP_UPDATED_HEAD : process.env.ORBIT_MERGE_SWEEP_HEAD
const withUrls = (value, source) => value.split("\\n").filter(Boolean).map((item, index) => item.split("\\t").length === 2 ? item + "\\thttps://example.test/" + source + "/" + index : item).join("\\n")
const postMergeFailurePr = process.env.ORBIT_MERGE_SWEEP_POST_MERGE_FAILURE_PR
const targetsPostMergeFailure = () => line.includes("n=" + postMergeFailurePr) || line.includes("/" + postMergeFailurePr + "/")
if (line.includes("/actions/workflows")) process.exit(0)
if (argv[0] === "pr" && argv[1] === "update-branch") {
  if (process.env.ORBIT_MERGE_SWEEP_UPDATED_HEAD) writeFileSync(updateMarker, "")
  process.exit(0)
}
if (argv[0] === "api" && argv[1] === "graphql" && line.includes("reviews(first:100")) {
  if (
    process.env.ORBIT_MERGE_SWEEP_REVIEWS_LOOKUP_FAILURE ||
    (existsSync(postMergeMarker) && targetsPostMergeFailure() && process.env.ORBIT_MERGE_SWEEP_POST_MERGE_REVIEWS_LOOKUP_FAILURE)
  ) process.exit(7)
  let items = process.env.ORBIT_MERGE_SWEEP_REVIEW_TIMES
  if (process.env.ORBIT_MERGE_SWEEP_REVIEWS_PAGE_TWO && argv.includes("--paginate")) {
    items += "\\n" + process.env.ORBIT_MERGE_SWEEP_REVIEWS_PAGE_TWO
  }
  process.stdout.write(withUrls(items, "reviews"))
  process.exit(0)
}
if (argv[0] === "api" && argv[1] === "graphql" && line.includes("reviewThreads(first:100)")) {
  if (
    process.env.ORBIT_MERGE_SWEEP_THREADS_LOOKUP_FAILURE ||
    (existsSync(postMergeMarker) && targetsPostMergeFailure() && process.env.ORBIT_MERGE_SWEEP_POST_MERGE_THREADS_LOOKUP_FAILURE)
  ) process.exit(7)
  process.stdout.write(
    existsSync(postMergeMarker) && targetsPostMergeFailure() && process.env.ORBIT_MERGE_SWEEP_POST_MERGE_UNRESOLVED_THREADS
      ? process.env.ORBIT_MERGE_SWEEP_POST_MERGE_UNRESOLVED_THREADS
      : process.env.ORBIT_MERGE_SWEEP_UNRESOLVED_THREADS,
  )
  process.exit(0)
}
if (argv[0] === "pr" && argv[1] === "view") {
  if (line.includes("--json headRefOid,baseRefName,headRefName")) {
    process.stdout.write(currentHead() + "\\t" + process.env.ORBIT_MERGE_SWEEP_BASE_REF + "\\t" + process.env.ORBIT_MERGE_SWEEP_BRANCH)
  } else if (line.includes("--json headRefOid")) {
    const moved = process.env.ORBIT_MERGE_SWEEP_MOVE_MARKER && existsSync(process.env.ORBIT_MERGE_SWEEP_MOVE_MARKER)
    process.stdout.write(moved ? process.env.ORBIT_MERGE_SWEEP_CHANGED_HEAD : currentHead())
  } else if (line.includes("headRefName")) {
    process.stdout.write(process.env.ORBIT_MERGE_SWEEP_BRANCH)
  } else {
    const checks = [{ name: "review", status: process.env.ORBIT_MERGE_SWEEP_REVIEW_RUNNING ? "IN_PROGRESS" : "COMPLETED", conclusion: process.env.ORBIT_MERGE_SWEEP_REVIEW_RUNNING ? "" : "SUCCESS" }]
    if (process.env.ORBIT_MERGE_SWEEP_FAIL_NEW_HEAD) checks.push({ name: "new-head-gate", status: "COMPLETED", conclusion: "FAILURE" })
    if (process.env.ORBIT_MERGE_SWEEP_SONAR === "success") {
      checks.push({ name: "SonarCloud Code Analysis", status: "COMPLETED", conclusion: "SUCCESS" })
    }
    if (process.env.ORBIT_MERGE_SWEEP_SONAR === "coverage-failure") {
      checks.push({ name: "SonarCloud Code Analysis", status: "COMPLETED", conclusion: "FAILURE" })
    }
    process.stdout.write(JSON.stringify({
      mergeStateStatus: process.env.ORBIT_MERGE_SWEEP_STATE,
      reviewDecision: "APPROVED",
      statusCheckRollup: checks,
      headRefOid: currentHead(),
    }))
  }
  process.exit(0)
}
if (argv[0] === "pr" && argv[1] === "merge") {
  if (process.env.ORBIT_MERGE_SWEEP_MOVE_MARKER) {
    writeFileSync(process.env.ORBIT_MERGE_SWEEP_MOVE_MARKER, "")
    process.exit(1)
  }
  if (argv[2] === postMergeFailurePr && (
    process.env.ORBIT_MERGE_SWEEP_POST_MERGE_ACTIVITY ||
    process.env.ORBIT_MERGE_SWEEP_POST_MERGE_REVIEWS_LOOKUP_FAILURE ||
    process.env.ORBIT_MERGE_SWEEP_POST_MERGE_THREADS_LOOKUP_FAILURE ||
    process.env.ORBIT_MERGE_SWEEP_POST_MERGE_UNRESOLVED_THREADS
  )) writeFileSync(postMergeMarker, "")
  process.exit(0)
}
if (line.includes("/pulls/") && line.includes("/comments")) {
  if (process.env.ORBIT_MERGE_SWEEP_INLINE_LOOKUP_FAILURE) process.exit(7)
  let items = process.env.ORBIT_MERGE_SWEEP_INLINE_ITEMS
  if (process.env.ORBIT_MERGE_SWEEP_INLINE_PAGE_TWO && argv.includes("--paginate")) {
    items += "\\n" + process.env.ORBIT_MERGE_SWEEP_INLINE_PAGE_TWO
  }
  process.stdout.write(withUrls(items, "inline"))
  process.exit(0)
}
if (line.includes("/issues/") && line.includes("/comments")) {
  if (process.env.ORBIT_MERGE_SWEEP_COMMENTS_LOOKUP_FAILURE) process.exit(7)
  let items = process.env.ORBIT_MERGE_SWEEP_COMMENT_TIMES
  if (existsSync(postMergeMarker) && targetsPostMergeFailure() && process.env.ORBIT_MERGE_SWEEP_POST_MERGE_ACTIVITY) items += "\\n" + process.env.ORBIT_MERGE_SWEEP_POST_MERGE_ACTIVITY
  process.stdout.write(withUrls(items, "conversation"))
  process.exit(0)
}
if (line.includes("/git/ref/heads/")) {
  if (process.env.ORBIT_MERGE_SWEEP_BASE_REF_LOOKUP_FAILURE) process.exit(7)
  process.stdout.write(process.env.ORBIT_MERGE_SWEEP_BASE_TIP)
  process.exit(0)
}
if (line.includes("/compare/")) {
  if (process.env.ORBIT_MERGE_SWEEP_COMPARE_LOOKUP_FAILURE) process.exit(7)
  const ancestor = process.env.ORBIT_MERGE_SWEEP_BASE_ANCESTOR
  const baseTip = process.env.ORBIT_MERGE_SWEEP_BASE_TIP
  process.stdout.write(ancestor && line.includes("/compare/" + ancestor + "..." + baseTip) ? "ahead" : "diverged")
  process.exit(0)
}
if (line.includes("/git/commits/")) {
  if (process.env.ORBIT_MERGE_SWEEP_COMMITS_LOOKUP_FAILURE) process.exit(7)
  if (process.env.ORBIT_MERGE_SWEEP_COMMITS_LOOKUP_EMPTY) process.exit(0)
  const authentic = process.env.ORBIT_MERGE_SWEEP_AUTHENTIC_UPDATE === "1"
  process.stdout.write([
    authentic ? "GitHub" : "Collaborator",
    authentic ? "noreply@github.com" : "collaborator@example.test",
    authentic ? "true" : "false",
    authentic ? "valid" : "unsigned",
    "Merge branch '" + process.env.ORBIT_MERGE_SWEEP_BASE_REF + "' into " + process.env.ORBIT_MERGE_SWEEP_BRANCH,
    process.env.ORBIT_MERGE_SWEEP_UPDATE_PARENTS.replaceAll("\\n", " "),
  ].join("\\t"))
  process.exit(0)
}
if (line.includes("/check-runs")) {
  process.stdout.write("Coverage on New Code is below the required threshold")
  process.exit(0)
}
if (argv[0] === "api" && argv[1] === "graphql") process.exit(0)
process.stderr.write("unstubbed gh call: " + line)
process.exit(9)
`,
)
chmodSync(MERGE_SWEEP_GH, 0o755)
const MERGE_SWEEP_ORCA = stage(
  "merge-sweep-bin/orca",
  `#!/usr/bin/env node
const { appendFileSync } = require("node:fs")
const argv = process.argv.slice(2)
appendFileSync(process.env.ORBIT_MERGE_SWEEP_LOG, JSON.stringify(["orca", ...argv]) + "\\n")
if (argv[0] === "linear" && argv[1] === "issue") {
  const { existsSync, readFileSync, writeFileSync } = require("node:fs")
  const reads = process.env.ORBIT_MERGE_SWEEP_LOG + ".linear-reads"
  const readNumber = existsSync(reads) ? Number(readFileSync(reads, "utf8")) + 1 : 1
  writeFileSync(reads, String(readNumber))
  if (readNumber === 1 && process.env.ORBIT_MERGE_SWEEP_LINEAR_LOOKUP_FAILURE) process.exit(7)
  if (readNumber > 1 && process.env.ORBIT_MERGE_SWEEP_LINEAR_REASSERT_LOOKUP_FAILURE) process.exit(7)
  const states = process.env.ORBIT_MERGE_SWEEP_LINEAR_STATES.split(",")
  const state = states[readNumber - 1] || states.at(-1)
  process.stdout.write(JSON.stringify({ ok: true, result: { issue: { state: { name: state } } } }))
  process.exit(0)
}
if (argv[0] === "linear" && argv[1] === "status" && argv[2] === "set") {
  if (process.env.ORBIT_MERGE_SWEEP_LINEAR_REASSERT_FAILURE) process.exit(7)
  process.stdout.write(JSON.stringify({ ok: true, result: { issue: { id: "issue-150", identifier: "ORB-150", url: "https://linear.app/orbit/issue/ORB-150" }, state: { id: "state-review", name: "In Review", type: "started" }, previousState: { id: "state-progress", name: "In Progress", type: "started" }, meta: {} } }))
  process.exit(0)
}
process.exit(9)
`,
)
chmodSync(MERGE_SWEEP_ORCA, 0o755)
const MERGE_SWEEP_BASH_ENV = stage("merge-sweep-bin/bash-env", "sleep() { :; }\n")

const mergeSweepEnv = ({
  authenticUpdate = true,
  baseAncestor = "",
  baseRef = "main",
  baseRefLookupFailure = false,
  changedHead = "",
  commentTimes = "issue-commenter\t2026-07-27T22:00:00Z",
  commentsLookupFailure = false,
  baseTip = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  commitsLookupEmpty = false,
  commitsLookupFailure = false,
  compareLookupFailure = false,
  failNewHead = false,
  head,
  inlineItems = "inline-reviewer\t2026-07-27T22:00:00Z\ninline-reviewer\t2026-07-27T22:00:00Z",
  inlineLookupFailure = false,
  inlinePageTwo = "",
  linearLookupFailure = false,
  linearState = "In Review",
  linearReassertLookupFailure = false,
  linearReassertFailure = false,
  linearReassertState = linearState,
  linearPostWriteState = "In Review",
  moveAtMerge = false,
  postMergeActivity = "",
  postMergeReviewsLookupFailure = false,
  postMergeThreadsLookupFailure = false,
  postMergeUnresolvedThreads = "",
  reviewTimes = "reviewer\t2026-07-27T22:00:00Z",
  reviewsLookupFailure = false,
  reviewsPageTwo = "",
  sonar = "success",
  state = "CLEAN",
  reviewRunning = false,
  threadsLookupFailure = false,
  unresolvedThreads = "0",
  updatedHead = "",
  updateParents = "",
  log,
}) => ({
  BASH_ENV: MERGE_SWEEP_BASH_ENV,
  PATH: `${MERGE_SWEEP_GH_DIR}${delimiter}${process.env.PATH}`,
  ORBIT_MERGE_SWEEP_AUTHENTIC_UPDATE: authenticUpdate ? "1" : "",
  ORBIT_MERGE_SWEEP_BRANCH: "feature/orb-106",
  ORBIT_MERGE_SWEEP_BASE_ANCESTOR: baseAncestor,
  ORBIT_MERGE_SWEEP_BASE_REF: baseRef,
  ORBIT_MERGE_SWEEP_BASE_REF_LOOKUP_FAILURE: baseRefLookupFailure ? "1" : "",
  ORBIT_MERGE_SWEEP_BASE_TIP: baseTip,
  ORBIT_MERGE_SWEEP_CHANGED_HEAD: changedHead,
  ORBIT_MERGE_SWEEP_COMMITS_LOOKUP_EMPTY: commitsLookupEmpty ? "1" : "",
  ORBIT_MERGE_SWEEP_COMMITS_LOOKUP_FAILURE: commitsLookupFailure ? "1" : "",
  ORBIT_MERGE_SWEEP_COMMENTS_LOOKUP_FAILURE: commentsLookupFailure ? "1" : "",
  ORBIT_MERGE_SWEEP_COMMENT_TIMES: commentTimes,
  ORBIT_MERGE_SWEEP_COMPARE_LOOKUP_FAILURE: compareLookupFailure ? "1" : "",
  ORBIT_MERGE_SWEEP_HEAD: head,
  ORBIT_MERGE_SWEEP_FAIL_NEW_HEAD: failNewHead ? "1" : "",
  ORBIT_MERGE_SWEEP_INLINE_ITEMS: inlineItems,
  ORBIT_MERGE_SWEEP_INLINE_LOOKUP_FAILURE: inlineLookupFailure ? "1" : "",
  ORBIT_MERGE_SWEEP_INLINE_PAGE_TWO: inlinePageTwo,
  ORBIT_MERGE_SWEEP_LOG: log,
  ORBIT_MERGE_SWEEP_LINEAR_LOOKUP_FAILURE: linearLookupFailure ? "1" : "",
  ORBIT_MERGE_SWEEP_LINEAR_REASSERT_LOOKUP_FAILURE: linearReassertLookupFailure ? "1" : "",
  ORBIT_MERGE_SWEEP_LINEAR_REASSERT_FAILURE: linearReassertFailure ? "1" : "",
  ORBIT_MERGE_SWEEP_LINEAR_STATES: `${linearState},${linearReassertState},${linearPostWriteState}`,
  ORCA_BIN: MERGE_SWEEP_ORCA,
  ORBIT_MERGE_SWEEP_MOVE_MARKER: moveAtMerge ? `${log}.moved` : "",
  ORBIT_MERGE_SWEEP_POST_MERGE_ACTIVITY: postMergeActivity,
  ORBIT_MERGE_SWEEP_POST_MERGE_FAILURE_PR: "615",
  ORBIT_MERGE_SWEEP_POST_MERGE_REVIEWS_LOOKUP_FAILURE: postMergeReviewsLookupFailure ? "1" : "",
  ORBIT_MERGE_SWEEP_POST_MERGE_THREADS_LOOKUP_FAILURE: postMergeThreadsLookupFailure ? "1" : "",
  ORBIT_MERGE_SWEEP_POST_MERGE_UNRESOLVED_THREADS: postMergeUnresolvedThreads,
  ORBIT_MERGE_SWEEP_REVIEW_RUNNING: reviewRunning ? "1" : "",
  ORBIT_MERGE_SWEEP_REVIEWS_LOOKUP_FAILURE: reviewsLookupFailure ? "1" : "",
  ORBIT_MERGE_SWEEP_REVIEWS_PAGE_TWO: reviewsPageTwo,
  ORBIT_MERGE_SWEEP_REVIEW_TIMES: reviewTimes,
  ORBIT_MERGE_SWEEP_SONAR: sonar,
  ORBIT_MERGE_SWEEP_STATE: state,
  ORBIT_MERGE_SWEEP_THREADS_LOOKUP_FAILURE: threadsLookupFailure ? "1" : "",
  ORBIT_MERGE_SWEEP_UNRESOLVED_THREADS: unresolvedThreads,
  ORBIT_MERGE_SWEEP_UPDATED_HEAD: updatedHead,
  ORBIT_MERGE_SWEEP_UPDATE_PARENTS: updateParents,
})

const mergeSweepCalls = (log) =>
  existsSync(log)
    ? readFileSync(log, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : []

const run = (file, argv, options = {}) => {
  const target = options.path ?? join(TOOLS_DIR, file)
  const invocation = file.endsWith(".mjs")
    ? [process.execPath, [target, ...argv]]
    : file.endsWith(".sh")
      ? [BASH, [target, ...argv]]
      : ["pwsh", ["-NoProfile", "-File", target, ...argv]]
  const result = spawnSync(invocation[0], invocation[1], {
    encoding: "utf8",
    cwd: options.cwd ?? REPO_ROOT,
    input: options.input ?? "",
    env: {
      ...process.env,
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(root, "default-automation-budget.jsonl"),
      ...(options.env ?? {}),
    },
    timeout: 180000,
  })
  return {
    status: result.error ? `spawn error: ${result.error.message}` : result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

const runAsync = (file, argv, options = {}) => {
  const target = options.path ?? join(TOOLS_DIR, file)
  const child = spawn(process.execPath, [target, ...argv], {
    cwd: options.cwd ?? REPO_ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk) => {
    stdout += chunk
  })
  child.stderr.on("data", (chunk) => {
    stderr += chunk
  })
  return new Promise((resolveResult) => {
    const timeout = setTimeout(() => child.kill(), 30000)
    child.on("error", (error) => {
      clearTimeout(timeout)
      resolveResult({ status: `spawn error: ${error.message}`, stdout, stderr })
    })
    child.on("close", (status) => {
      clearTimeout(timeout)
      resolveResult({ status, stdout, stderr })
    })
  })
}

const check = (file, name, argv, expect, options = {}) => {
  const result = run(file, argv, options)
  const where = `${file} ${argv.join(" ")}`
  if (expect.status !== undefined && result.status !== expect.status) {
    T(`${file}: ${name}`, false, `${where}\n     exit ${result.status}, expected ${expect.status}\n     ${(result.stderr || result.stdout).trim().split("\n").slice(0, 4).join("\n     ")}`)
    return result
  }
  if (expect.nonZero && (result.status === 0 || typeof result.status !== "number")) {
    T(`${file}: ${name}`, false, `${where}\n     exit ${result.status}, expected non-zero`)
    return result
  }
  for (const [stream, pattern] of [
    ["stdout", expect.stdout],
    ["stderr", expect.stderr],
  ]) {
    if (pattern && !pattern.test(result[stream])) {
      T(`${file}: ${name}`, false, `${where}\n     ${stream} did not match ${pattern}\n     ${result[stream].trim().split("\n").slice(0, 4).join("\n     ")}`)
      return result
    }
  }
  T(`${file}: ${name}`, true)
  return result
}

const DEFAULT_AUTOMATION_BUDGET = {
  tier: "routine",
  tokenBudget: 1_000_000,
  warningTokens: 800_000,
  invocationTokens: {
    default: 100_000,
    cheap: 50_000,
    deep: 250_000,
  },
}

const orchestratorConfig = (repoPath, worker, engineName, maxParallelWorktrees = 8) =>
  JSON.stringify({
    worker: engineName,
    workers: {
      [engineName]: {
        ...worker,
        automationBudget: worker.automationBudget ?? DEFAULT_AUTOMATION_BUDGET,
      },
    },
    maxParallelWorktrees,
    maxSlicesPerWorker: 3,
    attemptsBeforeRewrite: 2,
    linear: { team: "ORB", states: { working: "In Progress", review: "In Review", done: "Done" } },
    repos: { ui: repoPath },
  })

const CLAUDE_MODELS = {
  default: { model: "opus" },
  cheap: { model: "sonnet" },
  deep: { model: "opus", args: ["--effort", "max"] },
}
const CODEX_MODELS = {
  default: { model: "gpt-5.6-terra", args: ["-c", 'model_reasoning_effort="medium"'] },
  cheap: { model: "gpt-5.6-luna", args: ["-c", 'model_reasoning_effort="low"'] },
  deep: { model: "gpt-5.6-sol", args: ["-c", 'model_reasoning_effort="high"'] },
}
const INTERACTIVE_WORKER = {
  command: "claude",
  args: ["--permission-mode", "bypassPermissions"],
  models: CLAUDE_MODELS,
  interactive: true,
  automationBudget: DEFAULT_AUTOMATION_BUDGET,
}
const INTERACTIVE_CODEX = {
  command: "codex",
  args: ["-c", 'windows.sandbox="unelevated"', "--dangerously-bypass-approvals-and-sandbox"],
  models: CODEX_MODELS,
  interactive: true,
  automationBudget: DEFAULT_AUTOMATION_BUDGET,
}

/**
 * Stages a private copy of launch-worker.mjs beside a hand-written
 * .claude/orchestrator.json, because the tool resolves that config from its own
 * location. Returns the copy's path so each config variant is a fresh, isolated run.
 * The engine name is what the top-level `worker` key selects, which is the only way to
 * exercise a non-default engine: the tool has no engine-override flag by design.
 */
const stageLaunchWorker = (label, worker, engineName = "claude", maxParallelWorktrees = 8) => {
  const base = join(root, "launch", label)
  const repoPath = join(base, "repos", "ui")
  mkdirSync(repoPath, { recursive: true })
  const initialized = spawnSync("git", ["-C", repoPath, "init", "-q", "--initial-branch=main"], {
    encoding: "utf8",
  })
  if (initialized.status !== 0) {
    throw new Error(`could not initialize launcher fixture ${repoPath}: ${initialized.stderr}`)
  }
  mkdirSync(join(base, "tools"), { recursive: true })
  mkdirSync(join(base, ".claude"), { recursive: true })
  writeFileSync(
    join(base, ".claude", "orchestrator.json"),
    orchestratorConfig(repoPath, worker, engineName, maxParallelWorktrees),
  )
  cpSync(join(TOOLS_DIR, "launch-worker.mjs"), join(base, "tools", "launch-worker.mjs"))
  cpSync(join(TOOLS_DIR, "automation-budget.mjs"), join(base, "tools", "automation-budget.mjs"))
  writeFileSync(
    join(base, "tools", "ai-quota.mjs"),
    `#!/usr/bin/env node
const fallback = {
  claude: { status: "OK", weeklyPercent: 10, sessionPercent: 5, resetsIn: "4h 7m" },
  codex: { status: "OK", usedPercent: 10, windowDays: 7, resetsAt: 1894060800, hasCredits: false, planType: "pro" },
}
const result = process.env.ORBIT_TEST_AI_QUOTA ? JSON.parse(process.env.ORBIT_TEST_AI_QUOTA) : fallback
console.log(JSON.stringify(result))
process.exit(result.claude?.status === "OK" || result.codex?.status === "OK" ? 0 : 1)
`,
  )
  cpSync(join(TOOLS_DIR, "lib"), join(base, "tools", "lib"), { recursive: true })
  return { path: join(base, "tools", "launch-worker.mjs"), repoPath, base }
}

const freshTierLabelSnapshot = (labels = PRESENT_TIER_LABELS) => ({
  schemaVersion: 1,
  team: "ORB",
  capturedAt: new Date().toISOString(),
  labels: [...new Set(labels)].sort(),
})

const stageTierLabels = (
  label,
  models = CODEX_MODELS,
  snapshot = freshTierLabelSnapshot(),
) => {
  const base = join(root, "tier-labels", label)
  mkdirSync(join(base, "tools"), { recursive: true })
  mkdirSync(join(base, ".claude"), { recursive: true })
  writeFileSync(
    join(base, ".claude", "orchestrator.json"),
    JSON.stringify({
      worker: "codex",
      workers: { codex: { ...INTERACTIVE_CODEX, models } },
      maxParallelWorktrees: 8,
      linear: { team: "ORB" },
      repos: {},
    }),
  )
  writeFileSync(
    join(base, ".claude", "linear-team-labels.json"),
    typeof snapshot === "string" ? snapshot : `${JSON.stringify(snapshot, null, 2)}\n`,
  )
  cpSync(join(TOOLS_DIR, "check-tier-labels.mjs"), join(base, "tools", "check-tier-labels.mjs"))
  cpSync(join(TOOLS_DIR, "lib"), join(base, "tools", "lib"), { recursive: true })
  return {
    path: join(base, "tools", "check-tier-labels.mjs"),
    snapshotPath: join(base, ".claude", "linear-team-labels.json"),
  }
}

const stageTierLabelRefresh = (label) => {
  const base = join(root, "tier-label-refresh", label)
  mkdirSync(join(base, "tools"), { recursive: true })
  mkdirSync(join(base, ".claude"), { recursive: true })
  writeFileSync(
    join(base, ".claude", "orchestrator.json"),
    JSON.stringify({
      worker: "codex",
      workers: { codex: { ...INTERACTIVE_CODEX, models: CODEX_MODELS } },
      maxParallelWorktrees: 8,
      linear: { team: "ORB" },
      repos: {},
    }),
  )
  writeFileSync(
    join(base, ".claude", "linear-team-labels.json"),
    `${JSON.stringify(freshTierLabelSnapshot(["old-label"]), null, 2)}\n`,
  )
  cpSync(
    join(TOOLS_DIR, "refresh-tier-labels.mjs"),
    join(base, "tools", "refresh-tier-labels.mjs"),
  )
  cpSync(join(TOOLS_DIR, "lib"), join(base, "tools", "lib"), { recursive: true })
  return {
    path: join(base, "tools", "refresh-tier-labels.mjs"),
    snapshotPath: join(base, ".claude", "linear-team-labels.json"),
    snapshotDirectory: join(base, ".claude"),
  }
}

const stagePreflight = (label, worker = { ...INTERACTIVE_CODEX, command: `"${process.execPath}"` }, engineName = "codex") => {
  const base = join(root, "preflight", label)
  const repoPath = join(base, "repos", "ui")
  mkdirSync(repoPath, { recursive: true })
  mkdirSync(join(base, "tools"), { recursive: true })
  mkdirSync(join(base, ".claude"), { recursive: true })
  writeFileSync(join(base, ".claude", "orchestrator.json"), orchestratorConfig(repoPath, worker, engineName))
  cpSync(join(TOOLS_DIR, "preflight.mjs"), join(base, "tools", "preflight.mjs"))
  cpSync(join(TOOLS_DIR, "lib"), join(base, "tools", "lib"), { recursive: true })
  return { path: join(base, "tools", "preflight.mjs"), repoPath }
}

const LINEAR_LABELS_COMMAND = "linear team labels --team ORB --json"
const linearLabelsResult = (labels) =>
  JSON.stringify({ ok: true, result: { labels: labels.map((name) => ({ name })) } })
const PRESENT_TIER_LABELS = ["worker:sonnet", "tier:deep", "tier:cheap"]

const PREFLIGHT_PASS_PLAN = [
  { match: "auth status", stdout: "logged in", exit: 0 },
  { match: "status --json", stdout: JSON.stringify({ ok: true, result: { runtime: { reachable: true } } }), exit: 0 },
  { match: LINEAR_LABELS_COMMAND, stdout: linearLabelsResult(PRESENT_TIER_LABELS), exit: 0 },
  { match: "branch --show-current", stdout: "main\n", exit: 0 },
  { match: "status --porcelain", stdout: "", exit: 0 },
]

const preflightEnv = (plan) => ({
  ...orcaEnv(plan),
  GIT_BIN: process.execPath,
  NODE_BIN: process.execPath,
  NPM_BIN: process.execPath,
  DOTNET_BIN: process.execPath,
})

const stageNudgeWorker = (label, worker, instrumentPause = false) => {
  const base = join(root, "nudge", label)
  mkdirSync(join(base, "tools"), { recursive: true })
  mkdirSync(join(base, ".claude"), { recursive: true })
  writeFileSync(
    join(base, ".claude", "orchestrator.json"),
    JSON.stringify({ worker, maxParallelWorktrees: 8, repos: {} }),
  )
  cpSync(join(TOOLS_DIR, "nudge-worker.mjs"), join(base, "tools", "nudge-worker.mjs"))
  return { path: join(base, "tools", "nudge-worker.mjs"), base }
}

const launchWorktreeStub = (path, isMainWorktree = false) => ({
  id: path,
  path,
  isMainWorktree,
  git: { path, isMainWorktree },
})

const linearIssueStub = (labels, worktrees = []) => [
  {
    match: "linear issue ORB-75",
    stdout: JSON.stringify({
      ok: true,
      result: { issue: { identifier: "ORB-75", title: "Prove the harness gate runs", labels: labels.map((name) => ({ name })) } },
    }),
  },
  {
    match: "worktree list",
    stdout: JSON.stringify({ ok: true, result: { worktrees } }),
  },
]

/**
 * Kept in step with tools/launch-worker.mjs's WORKER_CONTRACT. Each entry is a clause a worker
 * broke in practice, so deleting one from the launcher must fail this gate rather than quietly
 * shipping a worker that stalls on a question or babysits someone else's PR.
 */
const WORKER_CONTRACT_MARKER = "## Standing worker contract (injected by tools/launch-worker.mjs)"
const FULL_SURFACE_POLL = /worker-status\.mjs[\s\S]*full-surface completion poll[\s\S]*review submissions[\s\S]*review threads[\s\S]*nested comments[\s\S]*PR conversation comments[\s\S]*fails closed/
const NO_DRAFT_PULL_REQUEST_CLAUSE = "The pull request must be ready for review, never a draft."
const REQUIRED_CONTRACT_CLAUSES = {
  "asking a question": /Never ask a question/,
  "dropping a blocked criterion": /A blocked sub-step never blocks the PR/,
  "owning its automated review cycle": /Own the automated review cycle[\s\S]*approved with zero unresolved threads/,
  "polling every review activity surface": FULL_SURFACE_POLL,
  "replying with the fix commit before resolving": /reply on that[\s\S]*thread naming[\s\S]*the fix commit, then[\s\S]*resolve it/,
  "acknowledging non-thread review activity": /review body or PR conversation[\s\S]*activity ID[\s\S]*PR commit/,
  "resolving informational findings with audited evidence": /informational automated finding[\s\S]*No code change required: <reason>\. Evidence: <PR commit>[\s\S]*change the reviewed path/,
  "escalating a disagreement": /Escalate when you disagree with a finding/,
  "escalating a blocked decision": /when you are[\s\S]*blocked on a decision you may not make/,
  "escalating after two failed cycles": /when two consecutive cycles fail on the same[\s\S]*finding/,
  "leaving human threads unresolved": /Never resolve a thread opened by a human account/,
  "refusing completion with unresolved threads": /approval with an[\s\S]*unresolved[\s\S]*thread is not done/,
  "watching only its own ticket": /Never watch another[\s\S]*ticket, worktree, or PR/,
  "arming a detached monitor that outlives the contract": /Never arm a detached background monitor/,
  "permitting an affordable foreground blocking wait": /foreground blocking wait is permitted/,
  "merging or pushing to main": /Never merge any PR, never push to/,
  "blanket staging that sweeps in a sibling's artifacts": /Stage explicitly[\s\S]*git add -A/,
  "pushing a commit it has not read back": /Verify before pushing[\s\S]*git show --stat HEAD/,
  "writing into another worker's worktree": /Never write into another worktree/,
  "delegating independent slices while keeping conflicts and PR evidence inline": /Delegate independent slices[\s\S]*SAME file[\s\S]*final gate run[\s\S]*review round/,
}

/**
 * The trust screen as each CLI really paints it, verbatim, because the launcher matches this
 * text and nothing else once the wait comes back without a blockedReason. A regex that drifts
 * one character from these strings hangs a worker forever with nobody at the keyboard, which is
 * exactly what shipped: the claude alternation read "createdoron" against a real
 * "createdorone" and could never match. Review caught it; this is the coverage that should have.
 */
const TRUST_SCREENS = {
  claude: {
    engine: INTERACTIVE_WORKER,
    answer: "1",
    /**
     * ONE screen per alternative the profile claims to recognise, each phrased so that only
     * that alternative can match. A single fixture carrying the whole real screen is NOT
     * coverage: the first version of this case included "Yes, I trust this folder" alongside
     * the question, so the `trustthisfolder` alternative matched and the case stayed green with
     * the shipped `createdoron` typo still in place. Verified by reintroducing that typo.
     */
    screens: [
      { label: "the created-or-trust wording", tail: "Quick safety check\nIs this a project you created or one you trust?\n 1. Yes, proceed\n 2. No, exit" },
      { label: "the trust-the-files wording", tail: "Do you trust the files in this directory?\n 1. Yes, proceed\n 2. No, exit" },
      { label: "the trust-this-folder wording", tail: "Quick safety check\n 1. Yes, I trust this folder\n 2. No, exit" },
    ],
  },
  codex: {
    engine: INTERACTIVE_CODEX,
    answer: "",
    screens: [{ label: "the trust-the-contents wording", tail: "You are in C:\\wt\nDoyoutrustthecontentsofthisdirectory?\n> 1. Yes, continue2.No,quitPress enter to continue" }],
  },
}

/**
 * A real launch needs a real checkout to `git switch -c` into, since git is not stubbed here.
 * Everything else the launch touches is orca, which is.
 */
const stageCheckout = (base) => {
  const repoPath = join(base, "repos", "ui")
  const path = join(base, "checkout")
  for (const argv of [
    ["init", "-q", "--initial-branch=main"],
    ["config", "user.email", "gate@orbit.test"],
    ["config", "user.name", "Orbit Gate"],
    ["commit", "-q", "--allow-empty", "-m", "base"],
    ["worktree", "add", "-q", "--detach", path, "HEAD"],
  ]) {
    const result = spawnSync("git", ["-C", repoPath, ...argv], { encoding: "utf8" })
    if (result.status !== 0) return null
  }
  return path
}

/**
 * Drives the launcher down the UNPROTECTED trust path: the wait reports not-idle with NO
 * blockedReason, so the screen text is the only signal left. Returns the orca calls the launch
 * made, so the assertion is on what was actually sent to the terminal.
 */
const runTrustScreen = (label, engineName, tail) => {
  const { engine, answer } = TRUST_SCREENS[engineName]
  const staged = stageLaunchWorker(label, engine, engineName)
  const checkout = stageCheckout(staged.base)
  if (!checkout) return null
  const log = join(staged.base, "orca-calls.log")
  const promptFile = stage(`${label}-prompt.md`, "the ticket body verbatim\n")
  const plan = [
    ...linearIssueStub(["repo:ui"]),
    { match: "worktree create", stdout: JSON.stringify({ ok: true, result: { worktree: { path: checkout, branch: "refs/heads/thomasluizon/orb-75" } } }) },
    { match: "terminal create", stdout: JSON.stringify({ ok: true, result: { terminal: { handle: "t1" } } }) },
    { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: false } } }) },
    { match: "terminal read", stdout: JSON.stringify({ ok: true, result: { terminal: { tail: [tail] } } }) },
    { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree rm", stdout: JSON.stringify({ ok: true, result: {} }) },
  ]
  const result = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: staged.path,
    env: {
      ...orcaEnv(plan),
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(staged.base, "automation-budget.jsonl"),
      ORBIT_ORCA_LOG: log,
    },
  })
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []
  return { calls, answer, result }
}

const trustScreenCases = () => {
  for (const [engineName, { screens }] of Object.entries(TRUST_SCREENS)) {
    screens.forEach(({ label, tail }, index) => {
      const name = `launch-worker.mjs: answers ${engineName}'s trust screen on ${label}, from the terminal text alone`
      const outcome = runTrustScreen(`trust-${engineName}-${index}`, engineName, tail)
      if (!outcome) {
        T(name, false, "could not stage a git checkout for the launch; git is required for this case")
        return
      }
      /** node resolves the shim's argv[0] to an absolute path, so the subcommand is its basename. */
      const send = outcome.calls.find((argv) => argv[0].split(/[\\/]/).pop() === "terminal" && argv[1] === "send")
      const sent = send ? send[send.indexOf("--text") + 1] : null
      T(
        name,
        Boolean(send) && sent === outcome.answer && send.includes("--enter"),
        `with no blockedReason the screen text is the ONLY signal, so this is the path a drifted regex breaks.\n     expected a terminal send of ${JSON.stringify(outcome.answer)} + Enter, got ${send ? JSON.stringify(send) : "no terminal send at all"}\n     launcher stderr: ${(outcome.result.stderr || "").trim().split("\n").slice(0, 5).join("\n     ")}`,
      )
    })
  }
}

/**
 * The empty composer a swallowed pointer leaves behind, verbatim from the 2026-07-27 ORB-88
 * launch: the worker alive, idle, holding no work, with orca having reported the send accepted.
 */
const EMPTY_COMPOSER = ' (logo)   Claude Code v2.1.220\n> Try "how do I log an error?"\n  Opus 5@high  ctx [..........] --%'

/**
 * Drives a launch to the prompt pointer, with `terminal read` answering `tails` in order:
 * "delivered" is a tail carrying the pointer as a user line, anything else is a tail without it.
 * Returns the orca calls, because the assertion that matters is how many sends really happened.
 */
const runPointerLaunch = (label, tails, { repainting = false } = {}) => {
  const staged = stageLaunchWorker(label, INTERACTIVE_WORKER)
  const checkout = stageCheckout(staged.base)
  if (!checkout) return null
  const log = join(staged.base, "orca-calls.log")
  const ledger = join(staged.base, "automation-budget.jsonl")
  const promptFile = stage(`${label}-prompt.md`, "the ticket body verbatim\n")
  const painted = `> Read ${promptFile} and execute it in full. That file is your complete work order for ORB-75:`
  const plan = [
    ...linearIssueStub(["repo:ui"]),
    { match: "worktree create", stdout: JSON.stringify({ ok: true, result: { worktree: { path: checkout, branch: "refs/heads/thomasluizon/orb-75" } } }) },
    { match: "terminal create", stdout: JSON.stringify({ ok: true, result: { terminal: { handle: "t1" } } }) },
    { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: true } } }) },
    /**
     * Frozen lastOutputAt is a settled TUI, so the launch sends instead of waiting out a repaint.
     *
     * `repainting` has to be a SEQUENCE, not a fresh stamp on every call: the tui-idle wait
     * before the pointer uses the same repaint check, so a terminal that paints from the first
     * call never gets past it and the pointer branch stays unreached. Measured: the first version
     * of this stub died at "never reached tui-idle after 6 waits". The first two calls are the
     * idle wait's own before/after pair and must be equal; every call after them is stamped
     * fresh, which is a TUI that starts painting once the pointer has been sent.
     */
    repainting
      ? {
          match: "terminal show",
          sequence: [
            JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }),
            JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }),
            '{"ok":true,"result":{"terminal":{"lastOutputAt":__NOW__}}}',
          ],
        }
      : { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }) },
    {
      match: "terminal read",
      sequence: tails.map((tail) => JSON.stringify({ ok: true, result: { terminal: { tail: [tail === "delivered" ? painted : tail] } } })),
    },
    { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal switch", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree set", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree rm", stdout: JSON.stringify({ ok: true, result: {} }) },
  ]
  const result = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: staged.path,
    env: {
      ...orcaEnv(plan),
      ORBIT_AUTOMATION_BUDGET_LEDGER: ledger,
      ORBIT_ORCA_LOG: log,
    },
  })
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []
  const sends = calls.filter((argv) => argv[0].split(/[\\/]/).pop() === "terminal" && argv[1] === "send").length
  const records = existsSync(ledger)
    ? readFileSync(ledger, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : []
  return { staged, result, calls, sends, records }
}

/**
 * The ORB-88 defect: `terminal send` succeeded, the launcher exited 0 printing a full plan, and
 * the pointer never became a user turn. An exit code may not assert a state it never verified,
 * so these three cases pin the read-back: it lands, it lands on a retry, it never lands.
 */
const pointerDeliveryCases = () => {
  const first = runPointerLaunch("pointer-first", ["delivered"])
  if (!first) {
    T("launch-worker.mjs: a delivered pointer exits 0", false, "could not stage a git checkout for the launch; git is required for this case")
    return
  }
  T(
    "launch-worker.mjs: a pointer that lands on the first send exits 0 with the plan unchanged",
    first.result.status === 0 && /"pointerSends": 1/.test(first.result.stdout) && /"terminal": "t1"/.test(first.result.stdout) && /"branch": "feature\/orb-75-/.test(first.result.stdout),
    `exit ${first.result.status}, ${first.sends} send(s)\n     stdout: ${first.result.stdout.trim().slice(0, 300)}\n     stderr: ${first.result.stderr.trim().split("\n").slice(-3).join("\n     ")}`,
  )
  T("launch-worker.mjs: a pointer that lands is sent exactly once", first.sends === 1, `sent ${first.sends} time(s)`)
  const firstSend = first.calls.find((argv) => argv[0].split(/[\\/]/).pop() === "terminal" && argv[1] === "send")
  const firstPointer = firstSend?.[firstSend.indexOf("--text") + 1] ?? ""
  const firstPlan = first.result.status === 0 ? JSON.parse(first.result.stdout) : null
  T(
    "launch-worker.mjs: the worker receives its launcher-owned authoritative completion-record command",
    firstPointer.includes(`node "${join(first.staged.base, "tools", "automation-budget.mjs")}" record`) &&
      !firstPointer.includes("node tools/automation-budget.mjs record") &&
      /automation-budget\.mjs" record[\s\S]*--identity "ORB-75:[^"]+"[\s\S]*--input-tokens <provider-input-tokens>[\s\S]*--ledger "[^"]+"[\s\S]*never record zero or infer tokens from account usedPercent/.test(firstPointer) &&
      firstPointer.includes(`--ledger "${firstPlan?.automationBudget?.ledgerPath}"`),
    firstPointer,
  )
  const firstRecord = first.records[0]
  T(
    "launch-worker.mjs: an invocation reserves a pending token record before worktree mutation",
    first.records.length === 1 &&
      /^ORB-75:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(firstRecord?.identity ?? "") &&
      firstRecord?.engine === "claude" &&
      firstRecord?.tier === "routine" &&
      !Object.hasOwn(firstRecord ?? {}, "inputTokens") &&
      !Object.hasOwn(firstRecord ?? {}, "outputTokens") &&
      firstRecord?.accountContext?.scope === "account" &&
      firstRecord?.accountContext?.attributed === false &&
      firstRecord?.accountContext?.usedPercent === 10,
    JSON.stringify(first.records),
  )

  const second = runPointerLaunch("pointer-second", [EMPTY_COMPOSER, "delivered"])
  T(
    "launch-worker.mjs: a pointer the composer swallowed is re-sent, and the plan reports how many sends it took",
    second.result.status === 0 && /"pointerSends": 2/.test(second.result.stdout) && second.sends === 2,
    `exit ${second.result.status}, ${second.sends} send(s)\n     stdout: ${second.result.stdout.trim().slice(0, 300)}\n     stderr: ${second.result.stderr.trim().split("\n").slice(-3).join("\n     ")}`,
  )

  const never = runPointerLaunch("pointer-never", [EMPTY_COMPOSER])
  T(
    "launch-worker.mjs: a pointer that never becomes a user turn is a launch FAILURE, not a success",
    never.result.status === 1 && /never showed the prompt pointer/.test(never.result.stderr),
    `exit ${never.result.status}, expected 1\n     stderr: ${never.result.stderr.trim().split("\n").slice(-4).join("\n     ")}`,
  )
  T("launch-worker.mjs: the undelivered launch is bounded, not retried forever", never.sends === 3, `sent ${never.sends} time(s), expected the 3-send bound`)
  T(
    "launch-worker.mjs: any accepted send keeps its reservation pending even after a quiet read-back",
    never.records.length === 1 &&
      never.records[0]?.cancelled !== true,
    JSON.stringify(never.records),
  )

  /**
   * The branch every other case misses, because they all freeze lastOutputAt: a TUI that keeps
   * repainting past the settle window. The first shape of this loop settled ONCE and then fell
   * through to another send, which queues into a running turn and cuts it short (ORB-75). The
   * assertion is the send COUNT: one send, then settle, then give up. Never a second send.
   */
  const busyThroughout = runPointerLaunch("pointer-busy", [EMPTY_COMPOSER], { repainting: true })
  T(
    "launch-worker.mjs: a TUI that keeps painting is never sent to a second time",
    busyThroughout.sends === 1,
    `sent ${busyThroughout.sends} time(s); a re-send into a repainting TUI is the ORB-75 corruption\n     stderr: ${busyThroughout.result.stderr.trim().split("\n").slice(-4).join("\n     ")}`,
  )
  T(
    "launch-worker.mjs: a TUI that never goes quiet is a launch failure naming that cause",
    busyThroughout.result.status === 1 && /never went quiet/.test(busyThroughout.result.stderr),
    `exit ${busyThroughout.result.status}\n     stderr: ${busyThroughout.result.stderr.trim().split("\n").slice(-4).join("\n     ")}`,
  )
  T(
    "launch-worker.mjs: an ambiguous prompt send keeps its reservation pending",
    busyThroughout.records.length === 1 &&
      busyThroughout.records[0]?.cancelled !== true,
    JSON.stringify(busyThroughout.records),
  )
  T(
    "launch-worker.mjs: the undelivered launch leaves no orphaned worktree",
    never.calls.some((argv) => argv[0].split(/[\\/]/).pop() === "worktree" && argv[1] === "rm"),
    `no worktree rm in: ${never.calls.map((argv) => argv.slice(0, 2).join(" ")).join(" | ")}`,
  )
}

const runTerminalCreateLaunch = (label, terminalCreateSequence) => {
  const staged = stageLaunchWorker(label, INTERACTIVE_WORKER)
  const checkout = join(staged.base, "checkout")
  const git = (args) => spawnSync("git", ["-C", staged.repoPath, ...args], { encoding: "utf8" })
  for (const args of [
    ["init", "-q", "--initial-branch=main"],
    ["config", "user.email", "gate@orbit.test"],
    ["config", "user.name", "Orbit Gate"],
    ["commit", "-q", "--allow-empty", "-m", "base"],
    ["worktree", "add", "-q", "-b", "thomasluizon/orb-75", checkout],
  ]) {
    if (git(args).status !== 0) return null
  }

  const log = join(staged.base, "orca-calls.log")
  const promptFile = stage(`${label}-prompt.md`, "the ticket body verbatim\n")
  const painted = `> Read ${promptFile} and execute it in full. That file is your complete work order for ORB-75:`
  const plan = [
    ...linearIssueStub(["repo:ui"]),
    { match: "worktree create", stdout: JSON.stringify({ ok: true, result: { worktree: { path: checkout, branch: "refs/heads/thomasluizon/orb-75" } } }) },
    { match: "terminal create", sequence: terminalCreateSequence },
    { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: true } } }) },
    { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }) },
    { match: "terminal read", stdout: JSON.stringify({ ok: true, result: { terminal: { tail: [painted] } } }) },
    { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal switch", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree set", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree rm", stdout: JSON.stringify({ ok: true, result: {} }), removePath: checkout, pruneRepo: staged.repoPath },
  ]
  const result = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: staged.path,
    env: {
      ...orcaEnv(plan),
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(staged.base, "automation-budget.jsonl"),
      ORBIT_ORCA_LOG: log,
    },
  })
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []
  const count = (first, second) => calls.filter((argv) => argv[0].split(/[\\/]/).pop() === first && argv[1] === second).length
  const branches = git(["branch", "--list", "feature/orb-75-prove-the-harness-gate", "thomasluizon/orb-75"]).stdout.trim()
  return { result, terminalCreates: count("terminal", "create"), worktreeCreates: count("worktree", "create"), checkout, branches }
}

const terminalCreateRetryCases = () => {
  const timeout = { stdout: JSON.stringify({ ok: false, error: { code: "timeout", message: "Terminal creation timed out" } }), exit: 1 }
  const success = { stdout: JSON.stringify({ ok: true, result: { terminal: { handle: "t1" } } }), exit: 0 }
  const recovered = runTerminalCreateLaunch("terminal-create-recovers", [timeout, success])
  if (!recovered) {
    T("launch-worker.mjs: terminal create retries can be staged", false, "could not stage a linked git worktree")
    return
  }
  T(
    "launch-worker.mjs: a terminal create timeout retries inside the same worktree and then succeeds",
    recovered.result.status === 0 && recovered.terminalCreates === 2 && recovered.worktreeCreates === 1 && /"terminal": "t1"/.test(recovered.result.stdout),
    `exit ${recovered.result.status}, terminal creates ${recovered.terminalCreates}, worktree creates ${recovered.worktreeCreates}\n     ${recovered.result.stderr.trim().split("\n").slice(-5).join("\n     ")}`,
  )

  const exhausted = runTerminalCreateLaunch("terminal-create-exhausted", [timeout, timeout, timeout])
  T(
    "launch-worker.mjs: terminal create timeout retries are bounded and preserve the timeout cause",
    exhausted.result.status === 3 && exhausted.terminalCreates === 3 && /failed after 3 attempts: Terminal creation timed out/.test(exhausted.result.stderr),
    `exit ${exhausted.result.status}, terminal creates ${exhausted.terminalCreates}\n     ${exhausted.result.stderr.trim().split("\n").slice(-6).join("\n     ")}`,
  )
  T(
    "launch-worker.mjs: exhausting terminal create retries rolls back the one worktree and both branches",
    exhausted.worktreeCreates === 1 && !existsSync(exhausted.checkout) && exhausted.branches === "",
    `worktree creates ${exhausted.worktreeCreates}, checkout exists ${existsSync(exhausted.checkout)}, branches ${JSON.stringify(exhausted.branches)}`,
  )
}

const launchConcurrencyCases = async (promptFile) => {
  const atCap = stageLaunchWorker("concurrency-at-cap", INTERACTIVE_WORKER, "claude", 2)
  const firstPath = join(atCap.base, "workspaces", "orb-1")
  const secondPath = join(atCap.base, "workspaces", "orb-2")
  const refusalLog = stage("concurrency-at-cap.log", "")
  const refusal = run(
    "launch-worker.mjs",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    {
      path: atCap.path,
      env: {
        ...orcaEnv(linearIssueStub(
          ["repo:ui"],
          [launchWorktreeStub(firstPath), launchWorktreeStub(secondPath)],
        )),
        ORBIT_ORCA_LOG: refusalLog,
      },
    },
  )
  T(
    "launch-worker.mjs: refuses at the configured cap with the cap, current count, and every occupying path",
    refusal.status === 1
      && /maxParallelWorktrees cap 2/.test(refusal.stderr)
      && /current count 2/.test(refusal.stderr)
      && refusal.stderr.includes(firstPath)
      && refusal.stderr.includes(secondPath),
    `exit ${refusal.status}\n     ${refusal.stderr.trim()}`,
  )
  const refusalCalls = readFileSync(refusalLog, "utf8").split("\n").filter(Boolean).map(JSON.parse)
  T(
    "launch-worker.mjs: cap refusal happens before any worktree or branch creation",
    !refusalCalls.some((argv) => argv.join(" ").includes("worktree create")),
    refusalCalls.map((argv) => argv.join(" ")).join("\n"),
  )

  const boundary = stageLaunchWorker("concurrency-boundary", INTERACTIVE_WORKER, "claude", 2)
  const boundaryResult = check(
    "launch-worker.mjs",
    "allows a dry run with one slot remaining",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /"maxParallelWorktrees": 2[\s\S]*"occupiedWorktrees": 1/ },
    {
      path: boundary.path,
      env: orcaEnv(linearIssueStub(
        ["repo:ui"],
        [launchWorktreeStub(join(boundary.base, "workspaces", "orb-1"))],
      )),
    },
  )
  T(
    "launch-worker.mjs: below-cap dry run creates nothing",
    boundaryResult.status === 0 && !existsSync(join(boundary.base, "workspaces")),
    `exit ${boundaryResult.status}; workspaces directory exists: ${existsSync(join(boundary.base, "workspaces"))}`,
  )

  const serial = stageLaunchWorker("concurrency-serial", INTERACTIVE_WORKER, "claude", 1)
  const serialPath = join(serial.base, "workspaces", "orb-1")
  const serialLog = stage("concurrency-serial.log", "")
  const [serialIssue] = linearIssueStub(["repo:ui"])
  const serialPlan = [
    serialIssue,
    {
      match: "worktree list",
      sequence: [
        JSON.stringify({ ok: true, result: { worktrees: [] } }),
        JSON.stringify({ ok: true, result: { worktrees: [launchWorktreeStub(serialPath)] } }),
      ],
    },
  ]
  const serialOptions = {
    path: serial.path,
    env: { ...orcaEnv(serialPlan), ORBIT_ORCA_LOG: serialLog },
  }
  const firstSerial = run(
    "launch-worker.mjs",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    serialOptions,
  )
  const secondSerial = run(
    "launch-worker.mjs",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    serialOptions,
  )
  T(
    "launch-worker.mjs: cap 1 accepts the first launch and refuses the second concurrent launch",
    firstSerial.status === 0
      && secondSerial.status === 1
      && /maxParallelWorktrees cap 1/.test(secondSerial.stderr)
      && /current count 1/.test(secondSerial.stderr)
      && secondSerial.stderr.includes(serialPath),
    `first exit ${firstSerial.status}; second exit ${secondSerial.status}\n     ${secondSerial.stderr.trim()}`,
  )

  const mainOnly = stageLaunchWorker("concurrency-main-only", INTERACTIVE_WORKER, "claude", 1)
  check(
    "launch-worker.mjs",
    "does not count the repository main worktree toward cap 1",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /"occupiedWorktrees": 0/ },
    {
      path: mainOnly.path,
      env: orcaEnv(linearIssueStub(
        ["repo:ui"],
        [launchWorktreeStub(mainOnly.repoPath, true)],
      )),
    },
  )

  const archivedOnly = stageLaunchWorker("concurrency-archived-only", INTERACTIVE_WORKER, "claude", 1)
  check(
    "launch-worker.mjs",
    "does not count an archived child worktree toward cap 1",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /"occupiedWorktrees": 0/ },
    {
      path: archivedOnly.path,
      env: orcaEnv(linearIssueStub(
        ["repo:ui"],
        [{ ...launchWorktreeStub(join(archivedOnly.base, "workspaces", "archived")), isArchived: true }],
      )),
    },
  )

  const gone = stageLaunchWorker("concurrency-orca-authority", INTERACTIVE_WORKER, "claude", 1)
  const residuePath = join(gone.base, "workspaces", "removed-but-on-disk")
  mkdirSync(residuePath, { recursive: true })
  check(
    "launch-worker.mjs",
    "does not count disk residue that Orca no longer reports",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /"occupiedWorktrees": 0/ },
    { path: gone.path, env: orcaEnv(linearIssueStub(["repo:ui"], [])) },
  )

  const override = stageLaunchWorker("concurrency-override", INTERACTIVE_WORKER, "claude", 8)
  check(
    "launch-worker.mjs",
    "uses the invocation cap override for serial orchestration",
    [
      "--issue", "ORB-75",
      "--prompt-file", promptFile,
      "--max-parallel-worktrees", "1",
      "--dry-run",
    ],
    { status: 1, stderr: /maxParallelWorktrees cap 1[\s\S]*current count 1/ },
    {
      path: override.path,
      env: orcaEnv(linearIssueStub(
        ["repo:ui"],
        [launchWorktreeStub(join(override.base, "workspaces", "orb-1"))],
      )),
    },
  )
  check(
    "launch-worker.mjs",
    "refuses a non-positive invocation cap",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--max-parallel-worktrees", "0", "--dry-run"],
    { status: 2, stderr: /positive integer/ },
    { path: override.path },
  )

  const invalidConfig = stageLaunchWorker("concurrency-invalid-config", INTERACTIVE_WORKER, "claude", 0)
  check(
    "launch-worker.mjs",
    "refuses a non-positive configured cap",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /maxParallelWorktrees must be a positive integer/ },
    { path: invalidConfig.path },
  )

  const reservationRecoveryCase = (label, lockBody, lockAgeMs) => {
    const fixture = stageLaunchWorker(`concurrency-reservation-${label}`, INTERACTIVE_WORKER, "claude", 1)
    const checkout = stageCheckout(fixture.base)
    if (!checkout) {
      T(`launch-worker.mjs: reclaims a ${label} reservation`, false, "could not stage a linked Git worktree")
      return
    }
    const lockPath = join(fixture.repoPath, ".git", "orbit-launch-worker.lock")
    writeFileSync(lockPath, lockBody)
    if (lockAgeMs) {
      const staleAt = new Date(Date.now() - lockAgeMs)
      utimesSync(lockPath, staleAt, staleAt)
    }
    const result = run(
      "launch-worker.mjs",
      ["--issue", "ORB-75", "--prompt-file", promptFile],
      {
        path: fixture.path,
        env: orcaEnv(linearIssueStub(["repo:ui"], [launchWorktreeStub(checkout)])),
      },
    )
    T(
      `launch-worker.mjs: reclaims a ${label} reservation`,
      result.status === 1
        && /maxParallelWorktrees cap 1[\s\S]*current count 1/.test(result.stderr)
        && !existsSync(lockPath),
      `exit ${result.status}; lock exists: ${existsSync(lockPath)}\n     ${result.stderr.trim()}`,
    )
  }
  reservationRecoveryCase(
    "dead-owner",
    JSON.stringify({ pid: 2147483647, startedAt: Date.now() - 1000 }),
    0,
  )
  reservationRecoveryCase("stale-corrupt", "{not-json", 10000)

  const timeout = stageLaunchWorker("concurrency-reservation-timeout", INTERACTIVE_WORKER, "claude", 1)
  const timeoutCheckout = stageCheckout(timeout.base)
  if (!timeoutCheckout) {
    T("launch-worker.mjs: times out on a live reservation owner", false, "could not stage a linked Git worktree")
  } else {
    const timeoutLock = join(timeout.repoPath, ".git", "orbit-launch-worker.lock")
    writeFileSync(timeoutLock, JSON.stringify({ pid: process.pid, startedAt: Date.now() }))
    const timeoutSource = readFileSync(timeout.path, "utf8")
    const productionDeadline = "const deadline = Date.now() + 5 * 60 * 1000"
    if (!timeoutSource.includes(productionDeadline)) {
      T(
        "launch-worker.mjs: stages a bounded reservation timeout",
        false,
        "production reservation deadline expression drifted",
      )
    } else {
      writeFileSync(
        timeout.path,
        timeoutSource.replace(productionDeadline, "const deadline = Date.now() + 200"),
      )
      const timeoutLog = stage("concurrency-reservation-timeout.log", "")
      const timeoutResult = run(
        "launch-worker.mjs",
        ["--issue", "ORB-75", "--prompt-file", promptFile],
        {
          path: timeout.path,
          env: {
            ...orcaEnv(linearIssueStub(["repo:ui"], [])),
            ORBIT_ORCA_LOG: timeoutLog,
          },
        },
      )
      const timeoutCalls = readFileSync(timeoutLog, "utf8").split("\n").filter(Boolean).map(JSON.parse)
      T(
        "launch-worker.mjs: times out on a live reservation owner before listing or creating worktrees",
        timeoutResult.status === 1
          && /timed out waiting for another launch reservation/.test(timeoutResult.stderr)
          && !timeoutCalls.some((argv) => argv.join(" ").includes("worktree list"))
          && !timeoutCalls.some((argv) => argv.join(" ").includes("worktree create")),
        `exit ${timeoutResult.status}\n     ${timeoutResult.stderr.trim()}\n     ${timeoutCalls.map((argv) => argv.join(" ")).join("\n     ")}`,
      )
    }
    rmSync(timeoutLock, { force: true })
  }

  const concurrent = stageLaunchWorker("concurrency-atomic-last-slot", INTERACTIVE_WORKER, "claude", 1)
  const concurrentCheckout = stageCheckout(concurrent.base)
  if (!concurrentCheckout) {
    T(
      "launch-worker.mjs: concurrent launch reservation can be staged",
      false,
      "could not stage a linked Git worktree",
    )
    return
  }
  const concurrentLog = stage("concurrency-atomic-last-slot.log", "")
  const concurrentTimingLog = stage("concurrency-atomic-last-slot-timing.log", "")
  const concurrentPrompt = stage("concurrency-atomic-last-slot-prompt.md", "the ticket body verbatim\n")
  const painted = `> Read ${concurrentPrompt} and execute it in full. That file is your complete work order for ORB-75:`
  const [concurrentIssue] = linearIssueStub(["repo:ui"])
  const concurrentPlan = [
    concurrentIssue,
    {
      match: "worktree list",
      sequence: [
        JSON.stringify({ ok: true, result: { worktrees: [] } }),
        JSON.stringify({ ok: true, result: { worktrees: [launchWorktreeStub(concurrentCheckout)] } }),
      ],
    },
    {
      match: "worktree create",
      delayMs: 750,
      stdout: JSON.stringify({
        ok: true,
        result: { worktree: { path: concurrentCheckout, branch: "refs/heads/thomasluizon/orb-75" } },
      }),
    },
    { match: "terminal create", stdout: JSON.stringify({ ok: true, result: { terminal: { handle: "t1" } } }) },
    { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: true } } }) },
    { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }) },
    { match: "terminal read", stdout: JSON.stringify({ ok: true, result: { terminal: { tail: [painted] } } }) },
    { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal switch", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree set", stdout: JSON.stringify({ ok: true, result: {} }) },
  ]
  const concurrentOptions = {
    path: concurrent.path,
    env: {
      ...orcaEnv(concurrentPlan),
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(concurrent.base, "automation-budget.jsonl"),
      ORBIT_ORCA_LOG: concurrentLog,
      ORBIT_ORCA_TIMING_LOG: concurrentTimingLog,
    },
  }
  const concurrentArguments = ["--issue", "ORB-75", "--prompt-file", concurrentPrompt]
  const concurrentResults = await Promise.all([
    runAsync("launch-worker.mjs", concurrentArguments, concurrentOptions),
    runAsync("launch-worker.mjs", concurrentArguments, concurrentOptions),
  ])
  const concurrentCalls = readFileSync(concurrentLog, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse)
  const createCalls = concurrentCalls.filter(
    (argv) => argv[0].split(/[\\/]/).pop() === "worktree" && argv[1] === "create",
  )
  const statuses = concurrentResults.map((result) => result.status).sort()
  const concurrentRefusal = concurrentResults.find((result) => result.status === 1)
  T(
    "launch-worker.mjs: two concurrent launchers cannot both claim the last slot",
    statuses.length === 2
      && statuses[0] === 0
      && statuses[1] === 1
      && createCalls.length === 1
      && /maxParallelWorktrees cap 1[\s\S]*current count 1/.test(concurrentRefusal?.stderr ?? ""),
    `statuses ${JSON.stringify(statuses)}, worktree creates ${createCalls.length}\n     ${concurrentResults.map((result) => result.stderr.trim()).join("\n     ")}`,
  )
}

const launchWorkerCases = async () => {
  const promptFile = stage("prompt.md", "the ticket body verbatim\n")

  const good = stageLaunchWorker("interactive", INTERACTIVE_WORKER)
  const claudeDefault = check(
    "launch-worker.mjs",
    "Claude defaults to opus",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /claude[\s\S]*--model opus/ },
    { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )
  const claudeCheap = check(
    "launch-worker.mjs",
    "tier:cheap selects sonnet on Claude",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /claude[\s\S]*--model sonnet/ },
    { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:cheap"])) },
  )
  const claudeDeep = check(
    "launch-worker.mjs",
    "tier:deep selects a distinct max-effort opus invocation on Claude",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /claude[\s\S]*--effort max[\s\S]*--model opus/ },
    { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:deep"])) },
  )
  const claudeDefaultCommand = claudeDefault.status === 0 ? JSON.parse(claudeDefault.stdout).command : ""
  const claudeCheapCommand = claudeCheap.status === 0 ? JSON.parse(claudeCheap.stdout).command : ""
  const claudeDeepCommand = claudeDeep.status === 0 ? JSON.parse(claudeDeep.stdout).command : ""
  T("launch-worker.mjs: Claude cheap tier cannot resolve to the unchanged default invocation", claudeCheapCommand !== claudeDefaultCommand, `default and cheap both resolved to: ${claudeDefaultCommand}`)
  T("launch-worker.mjs: Claude deep tier cannot resolve to the unchanged default invocation", claudeDeepCommand !== claudeDefaultCommand, `default and deep both resolved to: ${claudeDefaultCommand}`)
  check(
    "launch-worker.mjs",
    "an unknown tier lists the engine's declared cheap and deep tiers",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /fast[\s\S]*cheap[\s\S]*deep/ },
    { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:fast"])) },
  )
  check(
    "launch-worker.mjs",
    "a codex-only or unknown tier is rejected on Claude",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /codex-only[\s\S]*cheap[\s\S]*deep/ },
    { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:codex-only"])) },
  )
  check(
    "launch-worker.mjs",
    "rejects the legacy worker:sonnet label with tier:cheap remediation",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /worker:sonnet[\s\S]*tier:cheap/ },
    { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui", "worker:sonnet"])) },
  )
  check(
    "launch-worker.mjs",
    "rejects conflicting tier labels",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /conflict|multiple[\s\S]*tier/i },
    { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:cheap", "tier:deep"])) },
  )
  check("launch-worker.mjs", "resolves the repo from the repo:* label", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /"repo": "ui"/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })
  check("launch-worker.mjs", "derives the contract branch from the title", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /"branch": "feature\/orb-75-prove-the-harness-gate/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })
  check("launch-worker.mjs", "refuses a repo:* label with no repos entry", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /no repo path for "zzz"/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:zzz"])) })
  check("launch-worker.mjs", "refuses a ticket with no repo:* label and no --repo", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /carries no repo:\* label/ }, { path: good.path, env: orcaEnv(linearIssueStub([])) })

  const insidePrompt = join(good.repoPath, "prompt.md")
  writeFileSync(insidePrompt, "the ticket body verbatim\n")
  check("launch-worker.mjs", "refuses a prompt file inside a repo", ["--issue", "ORB-75", "--prompt-file", insidePrompt, "--dry-run"], { status: 2, stderr: /would be committed/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })
  const longPromptDirectory = join(root, "prompt-path-guard", "x".repeat(130))
  mkdirSync(longPromptDirectory, { recursive: true })
  const longPrompt = join(longPromptDirectory, "prompt.md")
  writeFileSync(longPrompt, "the ticket body verbatim\n")
  check("launch-worker.mjs", "interactive delivery refuses a conservatively over-long prompt path", ["--issue", "ORB-75", "--prompt-file", longPrompt, "--dry-run"], { status: 2, stderr: /interactive terminal delivery can swallow long paths/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const noModels = stageLaunchWorker("no-models", { command: "claude", args: ["--permission-mode", "bypassPermissions"], interactive: true })
  check("launch-worker.mjs", "refuses an engine with no models map", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /claude[\s\S]*models/ }, { path: noModels.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const noDefault = stageLaunchWorker("no-default-model", { ...INTERACTIVE_WORKER, models: { cheap: CLAUDE_MODELS.cheap, deep: CLAUDE_MODELS.deep } })
  check("launch-worker.mjs", "refuses an engine model map with no default", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /claude[\s\S]*default/ }, { path: noDefault.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const modelInBaseArgs = stageLaunchWorker("model-in-base-args", { ...INTERACTIVE_WORKER, args: ["--model", "opus"] })
  check("launch-worker.mjs", "refuses a model flag in the engine's base args", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /non-model strings/ }, { path: modelInBaseArgs.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const noCheap = stageLaunchWorker("no-cheap-model", { ...INTERACTIVE_WORKER, models: { default: CLAUDE_MODELS.default, deep: CLAUDE_MODELS.deep } })
  check("launch-worker.mjs", "refuses an engine model map with no cheap tier", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /claude[\s\S]*cheap/ }, { path: noCheap.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const noDeep = stageLaunchWorker("no-deep-model", { ...INTERACTIVE_WORKER, models: { default: CLAUDE_MODELS.default, cheap: CLAUDE_MODELS.cheap } })
  check("launch-worker.mjs", "refuses an engine model map with no deep tier", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /claude[\s\S]*deep/ }, { path: noDeep.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const identicalTiers = stageLaunchWorker("identical-tiers", {
    ...INTERACTIVE_WORKER,
    models: { ...CLAUDE_MODELS, cheap: { model: "sonnet" }, deep: { model: "sonnet" } },
  })
  check("launch-worker.mjs", "refuses identical cheap and deep mappings", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /cheap[\s\S]*deep|deep[\s\S]*cheap/ }, { path: identicalTiers.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const unchangedCheap = stageLaunchWorker("unchanged-cheap", {
    ...INTERACTIVE_WORKER,
    models: { ...CLAUDE_MODELS, cheap: { model: "opus" } },
  })
  check(
    "launch-worker.mjs",
    "refuses a selected non-default tier identical to the default",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /cheap[\s\S]*default|default[\s\S]*cheap/ },
    { path: unchangedCheap.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:cheap"])) },
  )

  const notInteractive = stageLaunchWorker("not-interactive", { ...INTERACTIVE_WORKER, interactive: false })
  check("launch-worker.mjs", "interactive false without a headless token is refused", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /interactive: false[\s\S]*no known headless token/ }, { path: notInteractive.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const omitted = stageLaunchWorker("omits-interactive", { command: "claude", args: [], models: CLAUDE_MODELS })
  check("launch-worker.mjs", "refuses an engine that omits interactive entirely", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /must explicitly declare interactive/ }, { path: omitted.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const missingBudgetTier = stageLaunchWorker("missing-budget-tier", { ...INTERACTIVE_WORKER, automationBudget: {} })
  check(
    "launch-worker.mjs",
    "refuses a worker with no explicit routine or reserved budget tier",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /automationBudget\.tier as routine or reserved/ },
    { path: missingBudgetTier.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )
  const missingTokenBudget = stageLaunchWorker("missing-token-budget", {
    ...INTERACTIVE_WORKER,
    automationBudget: { ...DEFAULT_AUTOMATION_BUDGET, tokenBudget: undefined },
  })
  check(
    "launch-worker.mjs",
    "refuses a worker with no positive engine token budget",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /automationBudget\.tokenBudget as a positive integer/ },
    { path: missingTokenBudget.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )
  const invalidWarning = stageLaunchWorker("invalid-token-warning", {
    ...INTERACTIVE_WORKER,
    automationBudget: { ...DEFAULT_AUTOMATION_BUDGET, warningTokens: 1_000_000 },
  })
  check(
    "launch-worker.mjs",
    "refuses a warning level that is not below the engine token budget",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /automationBudget\.warningTokens[\s\S]*below tokenBudget/ },
    { path: invalidWarning.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )
  const missingProjection = stageLaunchWorker("missing-token-projection", {
    ...INTERACTIVE_WORKER,
    automationBudget: {
      ...DEFAULT_AUTOMATION_BUDGET,
      invocationTokens: { ...DEFAULT_AUTOMATION_BUDGET.invocationTokens, deep: undefined },
    },
  })
  check(
    "launch-worker.mjs",
    "refuses a worker missing a projected token count for one model tier",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /automationBudget\.invocationTokens for every declared model tier: default, cheap, deep/ },
    { path: missingProjection.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )
  const missingAddedTierProjection = stageLaunchWorker("missing-added-tier-projection", {
    ...INTERACTIVE_WORKER,
    models: { ...CLAUDE_MODELS, burst: { model: "haiku" } },
  })
  check(
    "launch-worker.mjs",
    "requires a projected token count for every tier declared by the selected engine",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /automationBudget\.invocationTokens for every declared model tier: default, cheap, deep, burst/ },
    { path: missingAddedTierProjection.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )
  check(
    "launch-worker.mjs",
    "refuses an empty ledger override instead of writing an unknown default",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /ORBIT_AUTOMATION_BUDGET_LEDGER must not be empty/ },
    { path: good.path, env: { ...orcaEnv(linearIssueStub(["repo:ui"])), ORBIT_AUTOMATION_BUDGET_LEDGER: " " } },
  )

  const headless = stageLaunchWorker("headless-args", { ...INTERACTIVE_WORKER, args: ["-p"] })
  check("launch-worker.mjs", "refuses headless args behind an interactive declaration", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /headless invocation/ }, { path: headless.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const headlessCommand = stageLaunchWorker("headless-command", { ...INTERACTIVE_WORKER, command: "claude --print", args: [] })
  check("launch-worker.mjs", "refuses a headless token hidden in the command field", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /headless invocation/ }, { path: headlessCommand.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const acceptEdits = stageLaunchWorker("accept-edits", { command: "claude", args: ["--permission-mode", "acceptEdits"], models: CLAUDE_MODELS, interactive: true })
  check("launch-worker.mjs", "refuses a claude permission mode that cannot run unattended shell commands", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /permission mode is "acceptEdits"/ }, { path: acceptEdits.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const permissionInCommand = stageLaunchWorker("permission-in-command", { command: "claude --permission-mode bypassPermissions", args: [], models: CLAUDE_MODELS, interactive: true })
  check("launch-worker.mjs", "accepts the required claude permission mode from the whole resolved invocation", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /claude --permission-mode bypassPermissions/ }, { path: permissionInCommand.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  // Headless is a property of the CLI, not of the harness: codex's -p is --profile, an
  // interactive flag, while claude's -p is --print. One shared token list cannot tell them
  // apart, so these five cases pin both halves of the per-engine split.
  const codex = stageLaunchWorker("codex-interactive", INTERACTIVE_CODEX, "codex")
  const codexPlan = check(
    "launch-worker.mjs",
    "Codex defaults to Terra at medium effort",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /codex[\s\S]*model_reasoning_effort[\s\S]*medium[\s\S]*--model gpt-5\.6-terra/ },
    { path: codex.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )
  const codexCheap = check(
    "launch-worker.mjs",
    "tier:cheap selects Luna at low effort on Codex",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /codex[\s\S]*model_reasoning_effort[\s\S]*low[\s\S]*--model gpt-5\.6-luna/ },
    { path: codex.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:cheap"])) },
  )
  const codexDeep = check(
    "launch-worker.mjs",
    "tier:deep selects Sol at high effort with the routine budget on Codex",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /codex[\s\S]*model_reasoning_effort[\s\S]*high[\s\S]*--model gpt-5\.6-sol[\s\S]*"automationBudget":\s*\{[\s\S]*"tier":\s*"routine"[\s\S]*"tokenBudget":\s*1000000[\s\S]*"warningTokens":\s*800000[\s\S]*"projectedTokens":\s*250000/ },
    { path: codex.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:deep"])) },
  )
  const codexDefaultCommand = codexPlan.status === 0 ? JSON.parse(codexPlan.stdout).command : ""
  const codexCheapCommand = codexCheap.status === 0 ? JSON.parse(codexCheap.stdout).command : ""
  const codexDeepCommand = codexDeep.status === 0 ? JSON.parse(codexDeep.stdout).command : ""
  T("launch-worker.mjs: Codex cheap tier cannot resolve to the unchanged default invocation", codexCheapCommand !== codexDefaultCommand, `default and cheap both resolved to: ${codexDefaultCommand}`)
  T("launch-worker.mjs: Codex deep tier cannot resolve to the unchanged default invocation", codexDeepCommand !== codexDefaultCommand, `default and deep both resolved to: ${codexDefaultCommand}`)
  T(
    "launch-worker.mjs: no Codex tier resolves at max reasoning",
    ![codexDefaultCommand, codexCheapCommand, codexDeepCommand].some(
      (command) => command.includes('model_reasoning_effort="max"'),
    ),
    `resolved commands: ${[codexDefaultCommand, codexCheapCommand, codexDeepCommand].join(" | ")}`,
  )
  T(
    "launch-worker.mjs: the codex plan's command carries no headless token",
    codexPlan.status === 0 && !/(^|\s)(-p|--print|exec|e)(\s|"|$)/.test(JSON.parse(codexPlan.stdout).command),
    `command was: ${codexPlan.stdout.trim().slice(0, 200)}`,
  )

  const codexProfile = stageLaunchWorker("codex-profile", { ...INTERACTIVE_CODEX, args: ["-p", "my-profile", "--dangerously-bypass-approvals-and-sandbox"] }, "codex")
  check("launch-worker.mjs", "accepts codex -p, which is --profile and not --print", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /codex -p my-profile/ }, { path: codexProfile.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const codexExec = stageLaunchWorker("codex-exec", { ...INTERACTIVE_CODEX, args: ["exec", "--full-auto"] }, "codex")
  check("launch-worker.mjs", "still refuses codex exec behind an interactive declaration", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /carries "exec", which is a headless invocation of codex/ }, { path: codexExec.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const codexExecAlias = stageLaunchWorker("codex-exec-alias", { ...INTERACTIVE_CODEX, args: ["e"] }, "codex")
  check("launch-worker.mjs", "refuses codex e, the documented alias for exec", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /headless invocation of codex/ }, { path: codexExecAlias.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const headlessCodex = stageLaunchWorker("headless-codex", { ...INTERACTIVE_CODEX, args: ["exec", "--dangerously-bypass-approvals-and-sandbox"], interactive: false }, "codex")
  check("launch-worker.mjs", "accepts codex exec when interactive false agrees with its headless token", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /codex exec/ }, { path: headlessCodex.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })
  check("launch-worker.mjs", "rejects a headless declaration without a headless token", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /has no known headless token/ }, { path: stageLaunchWorker("headless-without-token", { ...INTERACTIVE_CODEX, interactive: false }, "codex").path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const unknownEngine = stageLaunchWorker("unknown-engine", { command: "aider", args: [], models: CLAUDE_MODELS, interactive: true }, "aider")
  check("launch-worker.mjs", "refuses an engine with no quota reader rather than waving it through", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /has no quota reader/ }, { path: unknownEngine.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const unknownProfile = stageLaunchWorker("unknown-profile", { ...INTERACTIVE_WORKER, command: "aider" })
  check("launch-worker.mjs", "refuses an engine binary with no profile rather than waving it through", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /no engine profile for/ }, { path: unknownProfile.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  check("launch-worker.mjs", "refuses a missing prompt file", ["--issue", "ORB-75", "--prompt-file", join(root, "absent.md"), "--dry-run"], { status: 2, stderr: /prompt file not found/ }, { path: good.path })
  check("launch-worker.mjs", "refuses a non-Linear issue identifier", ["--issue", "nope", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /Linear identifier/ }, { path: good.path })

  /**
   * The standing worker contract has to be OWNED by the launcher, not by whoever composed the
   * prompt. Both clauses it carries were broken on the ORB-88 run by a worker whose hand-written
   * prompt happened not to say them: it ended a turn on a question, and it armed a monitor on
   * another ticket's PR. These cases are what makes dropping a clause fail Harness Execution.
   */
  check("launch-worker.mjs", "injects the standing worker contract into a prompt that lacks it", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /"workerContract": "appended"/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const alreadyContracted = stage("prompt-with-contract.md", `the ticket body verbatim\n\n${WORKER_CONTRACT_MARKER}\n\nclauses already here\n`)
  check("launch-worker.mjs", "does not stack a second copy on relaunch", ["--issue", "ORB-75", "--prompt-file", alreadyContracted, "--dry-run"], { status: 0, stdout: /"workerContract": "already present"/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const appendFailure = stageLaunchWorker("contract-append-failure", INTERACTIVE_WORKER)
  const appendFailureSource = readFileSync(appendFailure.path, "utf8")
  const appendCall = 'appendFileSync(promptFile, existingWorktreeArg ? SLICE_CONTRACT : WORKER_CONTRACT, "utf8")'
  if (!appendFailureSource.includes(appendCall)) {
    throw new Error("launch-worker fixture could not locate the worker-contract append")
  }
  writeFileSync(
    appendFailure.path,
    appendFailureSource.replace(appendCall, 'throw new Error("fixture append failure")'),
  )
  const appendFailurePrompt = stage("contract-append-failure-prompt.md", "the ticket body verbatim\n")
  const appendFailureLedger = join(appendFailure.base, "automation-budget.jsonl")
  const appendFailureLog = join(appendFailure.base, "orca-calls.log")
  const appendFailureResult = run(
    "launch-worker.mjs",
    ["--issue", "ORB-75", "--prompt-file", appendFailurePrompt],
    {
      path: appendFailure.path,
      env: {
        ...orcaEnv(linearIssueStub(["repo:ui"])),
        ORBIT_AUTOMATION_BUDGET_LEDGER: appendFailureLedger,
        ORBIT_ORCA_LOG: appendFailureLog,
      },
    },
  )
  const appendFailureCalls = readFileSync(appendFailureLog, "utf8")
  const appendFailureRecords = readFileSync(appendFailureLedger, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line))
  T(
    "launch-worker.mjs: a worker-contract append failure cancels its pre-worktree reservation",
    appendFailureResult.status === 3 &&
      /could not append the worker contract[\s\S]*fixture append failure/.test(appendFailureResult.stderr) &&
      !appendFailureCalls.includes("worktree create") &&
      appendFailureRecords.length === 2 &&
      appendFailureRecords[0]?.identity === appendFailureRecords[1]?.identity &&
      appendFailureRecords[1]?.cancelled === true,
    `exit ${appendFailureResult.status}\n     stderr: ${appendFailureResult.stderr}\n     calls: ${appendFailureCalls}\n     ledger: ${JSON.stringify(appendFailureRecords)}`,
  )

  const blocked = stageLaunchWorker("budget-blocked", INTERACTIVE_CODEX, "codex")
  const blockedLedger = stage("launch/budget-blocked.jsonl", `${budgetRecord("prior-routine", 600_000, 350_000, "routine", "codex")}\n`)
  const blockedLog = join(root, "launch", "budget-blocked-calls.jsonl")
  const blockedResult = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: blocked.path,
    env: {
      ...orcaEnv(linearIssueStub(["repo:ui"])),
      ORBIT_AUTOMATION_BUDGET_LEDGER: blockedLedger,
      ORBIT_ORCA_LOG: blockedLog,
    },
  })
  const blockedCalls = existsSync(blockedLog) ? readFileSync(blockedLog, "utf8") : ""
  T(
    "launch-worker.mjs: the routine fuse blocks before any worktree is created",
    blockedResult.status === 4 &&
      /ORB-75:[\s\S]*budget 1000000 tokens[\s\S]*observed spend 950000 tokens[\s\S]*reservation 100000 tokens/.test(blockedResult.stderr) &&
      !blockedCalls.includes("worktree create"),
    `exit ${blockedResult.status}\n     ${blockedResult.stderr}\n     ${blockedCalls}`,
  )

  const pendingLedger = stage("launch/budget-pending.jsonl", `${budgetRecord("prior-pending", undefined, undefined, "routine", "codex")}\n`)
  const pendingLog = join(root, "launch", "budget-pending-calls.jsonl")
  const pendingResult = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: blocked.path,
    env: {
      ...orcaEnv(linearIssueStub(["repo:ui"])),
      ORBIT_AUTOMATION_BUDGET_LEDGER: pendingLedger,
      ORBIT_ORCA_LOG: pendingLog,
    },
  })
  const pendingCalls = existsSync(pendingLog) ? readFileSync(pendingLog, "utf8") : ""
  T(
    "launch-worker.mjs: an absent prior token measurement fails closed before worktree creation",
    pendingResult.status === 3 &&
      /lack input or output tokens[\s\S]*prior-pending/.test(pendingResult.stderr) &&
      !pendingCalls.includes("worktree create"),
    `exit ${pendingResult.status}\n     ${pendingResult.stderr}\n     ${pendingCalls}`,
  )

  const concurrentWorker = {
    ...INTERACTIVE_WORKER,
    automationBudget: {
      tier: "routine",
      tokenBudget: 1_000,
      warningTokens: 800,
      invocationTokens: { default: 600, cheap: 500, deep: 900 },
    },
  }
  const concurrentLaunch = stageLaunchWorker("budget-concurrent-launch", concurrentWorker)
  const concurrentCheckout = stageCheckout(concurrentLaunch.base)
  if (!concurrentCheckout) {
    T("launch-worker.mjs: concurrent launchers share one atomic pre-worktree reservation", false, "could not stage the concurrent launch checkout")
  } else {
    const concurrentLedger = join(concurrentLaunch.base, "automation-budget.jsonl")
    const concurrentMarker = join(concurrentLaunch.base, "budget-lock-acquired")
    const concurrentRelease = join(concurrentLaunch.base, "budget-lock-release")
    const concurrentPrompt = stage("budget-concurrent-launch-prompt.md", "the ticket body verbatim\n")
    const concurrentPainted = `> Read ${concurrentPrompt} and execute it in full. That file is your complete work order for ORB-75:`
    const concurrentPlan = [
      ...linearIssueStub(["repo:ui"]),
      { match: "worktree create", stdout: JSON.stringify({ ok: true, result: { worktree: { path: concurrentCheckout, branch: "refs/heads/thomasluizon/orb-75" } } }) },
      { match: "terminal create", stdout: JSON.stringify({ ok: true, result: { terminal: { handle: "t1" } } }) },
      { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: true } } }) },
      { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }) },
      { match: "terminal read", stdout: JSON.stringify({ ok: true, result: { terminal: { tail: [concurrentPainted] } } }) },
      { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }) },
      { match: "terminal switch", stdout: JSON.stringify({ ok: true, result: {} }) },
      { match: "worktree set", stdout: JSON.stringify({ ok: true, result: {} }) },
      { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
      { match: "worktree rm", stdout: JSON.stringify({ ok: true, result: {} }) },
    ]
    const concurrentRunner = stage(
      "budget-concurrent-launch-runner.mjs",
      `import { spawn } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
const [tool, prompt, ledger, marker, release, firstLog, secondLog] = process.argv.slice(2)
const baseEnv = JSON.parse(process.env.CONCURRENT_LAUNCH_ENV)
const run = (extraEnv) => {
  const child = spawn(process.execPath, [tool, "--issue", "ORB-75", "--prompt-file", prompt], {
    env: { ...process.env, ...baseEnv, ORBIT_AUTOMATION_BUDGET_LEDGER: ledger, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk) => { stderr += chunk })
  return new Promise((resolve) => child.on("exit", (status) => resolve({ status, stderr })))
}
const first = run({
  AUTOMATION_BUDGET_TEST_LOCK_MARKER: marker,
  AUTOMATION_BUDGET_TEST_LOCK_RELEASE: release,
  ORBIT_ORCA_LOG: firstLog,
})
const deadline = Date.now() + 5000
while (!existsSync(marker) && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 10))
}
if (!existsSync(marker)) process.exit(9)
const second = run({ ORBIT_ORCA_LOG: secondLog })
await new Promise((resolve) => setTimeout(resolve, 100))
writeFileSync(release, "release\\n")
process.stdout.write(JSON.stringify(await Promise.all([first, second])))
`,
    )
    const firstLog = join(concurrentLaunch.base, "first-orca.jsonl")
    const secondLog = join(concurrentLaunch.base, "second-orca.jsonl")
    const concurrentResult = spawnSync(
      process.execPath,
      [
        concurrentRunner,
        join(concurrentLaunch.base, "tools", "launch-worker.mjs"),
        concurrentPrompt,
        concurrentLedger,
        concurrentMarker,
        concurrentRelease,
        firstLog,
        secondLog,
      ],
      {
        encoding: "utf8",
        timeout: 30_000,
        env: { ...process.env, CONCURRENT_LAUNCH_ENV: JSON.stringify(orcaEnv(concurrentPlan)) },
      },
    )
    const concurrentOutcomes = concurrentResult.status === 0 ? JSON.parse(concurrentResult.stdout) : []
    const concurrentRecords = existsSync(concurrentLedger)
      ? readFileSync(concurrentLedger, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
      : []
    const readCalls = (path) => existsSync(path)
      ? readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
      : []
    const firstCalls = readCalls(firstLog)
    const secondCalls = readCalls(secondLog)
    const createdWorktree = (calls) => calls.some((argumentsList) =>
      argumentsList[0].split(/[\\/]/).pop() === "worktree" && argumentsList[1] === "create")
    T(
      "launch-worker.mjs: concurrent launchers share one atomic pre-worktree reservation",
      concurrentResult.status === 0 &&
        concurrentOutcomes[0]?.status === 0 &&
        concurrentOutcomes[1]?.status === 4 &&
        /blocked:/.test(concurrentOutcomes[1]?.stderr ?? "") &&
        createdWorktree(firstCalls) &&
        !createdWorktree(secondCalls) &&
        concurrentRecords.length === 1 &&
        !Object.hasOwn(concurrentRecords[0] ?? {}, "inputTokens"),
      `exit ${concurrentResult.status}\n     stdout: ${concurrentResult.stdout}\n     stderr: ${concurrentResult.stderr}\n     ledger: ${JSON.stringify(concurrentRecords)}\n     first calls: ${JSON.stringify(firstCalls)}\n     second calls: ${JSON.stringify(secondCalls)}`,
    )
  }

  const reservedLog = join(root, "launch", "budget-reserved-calls.jsonl")
  const reservedResult = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: blocked.path,
    env: {
      ...orcaEnv([
        ...linearIssueStub(["repo:ui", "tier:deep"]),
        {
          match: "worktree create",
          stdout: JSON.stringify({ ok: false, error: { message: "stop after reserved budget" } }),
          exit: 1,
        },
      ]),
      ORBIT_AUTOMATION_BUDGET_LEDGER: blockedLedger,
      ORBIT_ORCA_LOG: reservedLog,
    },
  })
  const reservedCalls = existsSync(reservedLog)
    ? readFileSync(reservedLog, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : []
  T(
    "launch-worker.mjs: tier:deep is blocked by the routine token budget before worktree creation",
    reservedResult.status === 4 &&
      /blocked:[\s\S]*projected spend 1200000 tokens/.test(reservedResult.stderr) &&
      !reservedCalls.some((argumentsList) => argumentsList[0].split(/[\\/]/).pop() === "worktree" && argumentsList[1] === "create"),
    `exit ${reservedResult.status}\n     ${reservedResult.stderr}\n     ${reservedCalls}`,
  )

  const selectedUnavailable = stageLaunchWorker("budget-selected-unavailable", INTERACTIVE_CODEX, "codex")
  const selectedUnavailableResult = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: selectedUnavailable.path,
    env: {
      ...orcaEnv(linearIssueStub(["repo:ui"])),
      ORBIT_TEST_AI_QUOTA: JSON.stringify({
        claude: { status: "OK", weeklyPercent: 10, sessionPercent: 5, resetsIn: "4h 7m" },
        codex: { status: "UNAVAILABLE", usedPercent: null, windowDays: null, resetsAt: null, hasCredits: null, planType: null },
      }),
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(selectedUnavailable.base, "automation-budget.jsonl"),
    },
  })
  T(
    "launch-worker.mjs: an unavailable selected provider fails closed",
    selectedUnavailableResult.status === 3 && /could not read codex quota/.test(selectedUnavailableResult.stderr),
    `exit ${selectedUnavailableResult.status}\n     ${selectedUnavailableResult.stderr}`,
  )

  const malformedClaudeReset = stageLaunchWorker("budget-malformed-claude-reset", INTERACTIVE_WORKER)
  const malformedClaudeResult = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: malformedClaudeReset.path,
    env: {
      ...orcaEnv(linearIssueStub(["repo:ui"])),
      ORBIT_TEST_AI_QUOTA: JSON.stringify({
        claude: { status: "OK", weeklyPercent: 10, sessionPercent: 5, resetsIn: "later" },
        codex: { status: "OK", usedPercent: 10, windowDays: 7, resetsAt: 1894060800, hasCredits: false, planType: "pro" },
      }),
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(malformedClaudeReset.base, "automation-budget.jsonl"),
    },
  })
  T(
    "launch-worker.mjs: a malformed Claude reset duration fails closed",
    malformedClaudeResult.status === 3 && /unsupported Claude reset duration/.test(malformedClaudeResult.stderr),
    `exit ${malformedClaudeResult.status}\n     ${malformedClaudeResult.stderr}`,
  )

  const compactClaudeReset = stageLaunchWorker("budget-compact-claude-reset", INTERACTIVE_WORKER)
  const compactLog = join(root, "launch", "budget-compact-calls.jsonl")
  const compactClaudeResult = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: compactClaudeReset.path,
    env: {
      ...orcaEnv([
        ...linearIssueStub(["repo:ui"]),
        {
          match: "worktree create",
          stdout: JSON.stringify({ ok: false, error: { message: "stop after budget" } }),
          exit: 1,
        },
      ]),
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(compactClaudeReset.base, "automation-budget.jsonl"),
      ORBIT_ORCA_LOG: compactLog,
    },
  })
  const compactCalls = existsSync(compactLog)
    ? readFileSync(compactLog, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : []
  T(
    "launch-worker.mjs: a compact Claude reset duration reaches worktree creation after the fuse passes",
    compactClaudeResult.status === 3 &&
      /worktree create[\s\S]*failed: stop after budget/.test(compactClaudeResult.stderr) &&
      compactCalls.some((argumentsList) => argumentsList[0].split(/[\\/]/).pop() === "worktree" && argumentsList[1] === "create"),
    `exit ${compactClaudeResult.status}\n     ${compactClaudeResult.stderr}\n     ${JSON.stringify(compactCalls)}`,
  )

  trustScreenCases()
  pointerDeliveryCases()
  terminalCreateRetryCases()
  await launchConcurrencyCases(promptFile)

  const launcherSource = readFileSync(join(TOOLS_DIR, "launch-worker.mjs"), "utf8")
  for (const [clause, pattern] of Object.entries(REQUIRED_CONTRACT_CLAUSES)) {
    T(`launch-worker.mjs: the injected contract still enforces ${clause}`, pattern.test(launcherSource), `WORKER_CONTRACT no longer matches ${pattern}. A worker without this clause repeats the failure it was written for; restore it rather than relaxing this check.`)
  }
  const agentsSource = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8")
  T(
    "launch-worker.mjs: the injected contract forbids opening a draft pull request",
    launcherSource.includes(NO_DRAFT_PULL_REQUEST_CLAUSE),
    `WORKER_CONTRACT no longer contains ${NO_DRAFT_PULL_REQUEST_CLAUSE}`,
  )
  T(
    "AGENTS.md: the standing worker contract forbids opening a draft pull request",
    agentsSource.includes(NO_DRAFT_PULL_REQUEST_CLAUSE),
    `AGENTS.md no longer contains ${NO_DRAFT_PULL_REQUEST_CLAUSE}`,
  )
  T(
    "launch-worker.mjs: AGENTS.md requires the same full-surface completion poll",
    FULL_SURFACE_POLL.test(agentsSource),
    "AGENTS.md no longer requires worker-status to inventory every review activity surface and fail closed.",
  )
}

const tierLabelCases = () => {
  const missing = stageTierLabels(
    "missing",
    CODEX_MODELS,
    freshTierLabelSnapshot(["worker:sonnet"]),
  )
  check(
    "check-tier-labels.mjs",
    "a missing snapshotted label names the expected selectors, snapshot inventory, and shortfall",
    [],
    {
      status: 1,
      stdout: /tier-labels FAIL[\s\S]*looked for: tier:cheap, tier:deep[\s\S]*snapshot labels: worker:sonnet[\s\S]*missing: tier:cheap, tier:deep[\s\S]*problem: declared tier labels are missing/,
    },
    { path: missing.path },
  )

  const declared = stageTierLabels("declared")
  check(
    "check-tier-labels.mjs",
    "passes when a fresh canonical snapshot contains every declared tier label",
    [],
    {
      status: 0,
      stdout: /tier-labels PASS[\s\S]*looked for: tier:cheap, tier:deep[\s\S]*snapshot labels: tier:cheap, tier:deep, worker:sonnet[\s\S]*missing: \(none\)/,
    },
    { path: declared.path },
  )

  const staleSnapshot = freshTierLabelSnapshot(PRESENT_TIER_LABELS)
  staleSnapshot.capturedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
  const stale = stageTierLabels("stale", CODEX_MODELS, staleSnapshot)
  check(
    "check-tier-labels.mjs",
    "a snapshot older than 30 days fails closed",
    [],
    { status: 1, stdout: /tier-labels FAIL[\s\S]*problem: snapshot is 31 days old; refresh it before 30 days/ },
    { path: stale.path },
  )

  const nonCanonical = stageTierLabels("non-canonical", CODEX_MODELS, {
    ...freshTierLabelSnapshot(),
    editedByHand: true,
  })
  check(
    "check-tier-labels.mjs",
    "a snapshot whose shape cannot be produced by the refresh tool fails closed",
    [],
    { status: 3, stderr: /tier-labels ERROR[\s\S]*must have exactly schemaVersion 1, team, capturedAt, and labels/ },
    { path: nonCanonical.path },
  )

  const unparseable = stageTierLabels("unparseable-snapshot", CODEX_MODELS, "not-json")
  check(
    "check-tier-labels.mjs",
    "an unparseable snapshot fails closed",
    [],
    { status: 3, stderr: /tier-labels ERROR[\s\S]*could not be read as JSON/ },
    { path: unparseable.path },
  )

  const noDeclaredTiers = stageTierLabels("no-declared-tiers", {
    default: CODEX_MODELS.default,
  })
  check(
    "check-tier-labels.mjs",
    "zero declared tiers fail so a config path typo cannot report a clean run",
    [],
    { status: 1, stdout: /no non-default worker tiers are declared/ },
    { path: noDeclaredTiers.path },
  )
}

const refreshTierLabelCases = () => {
  const refreshed = stageTierLabelRefresh("success")
  const refreshResult = check(
    "refresh-tier-labels.mjs",
    "a live lookup rewrites the snapshot in canonical sorted form",
    [],
    { status: 0, stdout: /tier-labels snapshot refreshed[\s\S]*team labels: tier:cheap, tier:deep, worker:sonnet/ },
    {
      path: refreshed.path,
      env: orcaEnv([
        { match: LINEAR_LABELS_COMMAND, stdout: linearLabelsResult(PRESENT_TIER_LABELS) },
      ]),
    },
  )
  let snapshot
  try {
    snapshot = JSON.parse(readFileSync(refreshed.snapshotPath, "utf8"))
  } catch {
    snapshot = null
  }
  T(
    "refresh-tier-labels.mjs: writes exactly the canonical snapshot shape",
    refreshResult.status === 0 &&
      JSON.stringify(Object.keys(snapshot ?? {})) ===
        JSON.stringify(["schemaVersion", "team", "capturedAt", "labels"]) &&
      snapshot?.schemaVersion === 1 &&
      snapshot?.team === "ORB" &&
      new Date(snapshot?.capturedAt).toISOString() === snapshot?.capturedAt &&
      JSON.stringify(snapshot?.labels) ===
        JSON.stringify(["tier:cheap", "tier:deep", "worker:sonnet"]),
    JSON.stringify(snapshot),
  )
  T(
    "refresh-tier-labels.mjs: leaves no temporary snapshot behind",
    readdirSync(refreshed.snapshotDirectory).every(
      (name) => !name.startsWith(".linear-team-labels.") || !name.endsWith(".tmp"),
    ),
    readdirSync(refreshed.snapshotDirectory).join(", "),
  )

  const lookupFailure = stageTierLabelRefresh("lookup-failure")
  check(
    "refresh-tier-labels.mjs",
    "a live lookup error fails closed",
    [],
    { status: 3, stderr: /refresh-tier-labels ERROR[\s\S]*unavailable/i },
    {
      path: lookupFailure.path,
      env: orcaEnv([
        {
          match: LINEAR_LABELS_COMMAND,
          stdout: JSON.stringify({ ok: false, error: { message: "Linear labels unavailable" } }),
          exit: 1,
        },
      ]),
    },
  )

  const empty = stageTierLabelRefresh("empty")
  check(
    "refresh-tier-labels.mjs",
    "an empty live label result fails closed",
    [],
    { status: 3, stderr: /refresh-tier-labels ERROR[\s\S]*empty label set/i },
    {
      path: empty.path,
      env: orcaEnv([
        { match: LINEAR_LABELS_COMMAND, stdout: linearLabelsResult([]) },
      ]),
    },
  )

  const unparseable = stageTierLabelRefresh("unparseable")
  check(
    "refresh-tier-labels.mjs",
    "unparseable live label output fails closed",
    [],
    { status: 3, stderr: /refresh-tier-labels ERROR[\s\S]*unparseable JSON/i },
    {
      path: unparseable.path,
      env: orcaEnv([{ match: LINEAR_LABELS_COMMAND, stdout: "not-json" }]),
    },
  )
}

const preflightCases = () => {
  const good = stagePreflight("all-pass")
  check(
    "preflight.mjs",
    "a clean base-branch environment prints an all-PASS table",
    ["--repo", "ui"],
    { status: 0, stdout: /PASS\s+Worker shell policy[\s\S]*PASS\s+GitHub authentication[\s\S]*PASS\s+Repository working tree/ },
    { path: good.path, env: preflightEnv(PREFLIGHT_PASS_PLAN) },
  )

  const claude = stagePreflight(
    "claude-command-policy",
    {
      command: `"${process.execPath}" --permission-mode bypassPermissions`,
      args: [],
      models: CLAUDE_MODELS,
      interactive: true,
    },
    "claude",
  )
  check(
    "preflight.mjs",
    "the known-good Claude policy is accepted from the whole resolved invocation",
    ["--repo", "ui"],
    { status: 0, stdout: /PASS\s+Worker shell policy/ },
    { path: claude.path, env: preflightEnv(PREFLIGHT_PASS_PLAN) },
  )

  const acceptEdits = stagePreflight(
    "claude-accept-edits",
    {
      command: `"${process.execPath}"`,
      args: ["--permission-mode", "acceptEdits"],
      models: CLAUDE_MODELS,
      interactive: true,
    },
    "claude",
  )
  check(
    "preflight.mjs",
    "a Claude acceptEdits invocation fails with the known-good remedy",
    ["--repo", "ui"],
    { status: 1, stdout: /FAIL\s+Worker shell policy\s+set workers\.claude[\s\S]*--permission-mode bypassPermissions/ },
    { path: acceptEdits.path, env: preflightEnv(PREFLIGHT_PASS_PLAN) },
  )

  const ghFailurePlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === "auth status" ? { ...entry, stdout: "not logged in", exit: 1 } : entry,
  )
  check(
    "preflight.mjs",
    "an unauthenticated GitHub CLI fails and names the login remedy",
    ["--repo", "ui"],
    { status: 1, stdout: /FAIL\s+GitHub authentication\s+run gh auth login/ },
    { path: good.path, env: preflightEnv(ghFailurePlan) },
  )

  const orcaFailurePlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === "status --json"
      ? { ...entry, stdout: JSON.stringify({ ok: false, error: { message: "runtime unavailable" } }), exit: 1 }
      : entry,
  )
  check(
    "preflight.mjs",
    "an unreachable Orca runtime fails and names the restart remedy",
    ["--repo", "ui"],
    { status: 1, stdout: /FAIL\s+Orca reachability\s+start or restart Orca/ },
    { path: good.path, env: preflightEnv(orcaFailurePlan) },
  )

  const missingTierLabelsPlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === LINEAR_LABELS_COMMAND
      ? { ...entry, stdout: linearLabelsResult(["worker:sonnet"]) }
      : entry,
  )
  check(
    "preflight.mjs",
    "missing tier labels refuse launch with the expected, actual, and missing inventories",
    ["--repo", "ui"],
    {
      status: 1,
      stdout: /FAIL\s+Linear tier labels\s+looked for: tier:cheap, tier:deep; team labels: worker:sonnet; missing: tier:cheap, tier:deep/,
    },
    { path: good.path, env: preflightEnv(missingTierLabelsPlan) },
  )

  const tierLookupFailurePlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === LINEAR_LABELS_COMMAND
      ? {
          ...entry,
          stdout: JSON.stringify({ ok: false, error: { message: "Linear labels unavailable" } }),
          exit: 1,
        }
      : entry,
  )
  check(
    "preflight.mjs",
    "a Linear tier-label lookup error fails closed",
    ["--repo", "ui"],
    { status: 1, stdout: /FAIL\s+Linear tier labels[\s\S]*Linear tier-label lookup failed[\s\S]*unavailable/i },
    { path: good.path, env: preflightEnv(tierLookupFailurePlan) },
  )

  const emptyTierLabelsPlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === LINEAR_LABELS_COMMAND
      ? { ...entry, stdout: linearLabelsResult([]) }
      : entry,
  )
  check(
    "preflight.mjs",
    "an empty Linear tier-label result fails closed",
    ["--repo", "ui"],
    {
      status: 1,
      stdout: /FAIL\s+Linear tier labels[\s\S]*team labels: \(none\)[\s\S]*Linear returned an empty label set/,
    },
    { path: good.path, env: preflightEnv(emptyTierLabelsPlan) },
  )

  const unparseableTierLabelsPlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === LINEAR_LABELS_COMMAND
      ? { ...entry, stdout: "not-json" }
      : entry,
  )
  check(
    "preflight.mjs",
    "unparseable Linear tier-label output fails closed",
    ["--repo", "ui"],
    { status: 1, stdout: /FAIL\s+Linear tier labels[\s\S]*unparseable JSON/ },
    { path: good.path, env: preflightEnv(unparseableTierLabelsPlan) },
  )

  const dirtyPlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === "status --porcelain" ? { ...entry, stdout: " M tracked-file\n" } : entry,
  )
  check(
    "preflight.mjs",
    "a dirty target working tree fails and names the cleanup remedy",
    ["--repo", "ui"],
    { status: 1, stdout: /FAIL\s+Repository working tree\s+commit, stash, or remove changes/ },
    { path: good.path, env: preflightEnv(dirtyPlan) },
  )

  const wrongBranchPlan = PREFLIGHT_PASS_PLAN.map((entry) =>
    entry.match === "branch --show-current" ? { ...entry, stdout: "feature/not-main\n" } : entry,
  )
  check(
    "preflight.mjs",
    "a target repo off its base branch fails and names both branches",
    ["--repo", "ui"],
    { status: 1, stdout: /FAIL\s+Repository branch\s+switch ui from feature\/not-main to main/ },
    { path: good.path, env: preflightEnv(wrongBranchPlan) },
  )

  check(
    "preflight.mjs",
    "a missing ticket-specific CLI fails and names its install remedy",
    ["--repo", "ui", "--require", "orbit-cli-that-does-not-exist"],
    { status: 1, stdout: /FAIL\s+CLI orbit-cli-that-does-not-exist\s+install orbit-cli-that-does-not-exist/ },
    { path: good.path, env: preflightEnv(PREFLIGHT_PASS_PLAN) },
  )

  const jsonResult = run("preflight.mjs", ["--repo", "ui", "--json"], {
    path: good.path,
    env: preflightEnv(PREFLIGHT_PASS_PLAN),
  })
  let report
  try {
    report = JSON.parse(jsonResult.stdout)
  } catch {
    report = null
  }
  T(
    "preflight.mjs: machine-readable output carries stable check ids and the verdict",
    jsonResult.status === 0 &&
      report?.ok === true &&
      report?.checks?.some((entry) => entry.id === "worker-shell-policy" && entry.status === "PASS") &&
      report?.checks?.some((entry) => entry.id === "repo-clean" && entry.status === "PASS"),
    `exit ${jsonResult.status}\n     ${(jsonResult.stderr || jsonResult.stdout).slice(0, 500)}`,
  )
}

const TIMEOUT_PAYLOAD = JSON.stringify({ ok: false, error: { code: "timeout", message: "condition not met in time" } })
const BUSY_STUB = [{ match: "terminal wait", stdout: TIMEOUT_PAYLOAD, exit: 1 }]
const BROKEN_STUB = [{ match: "terminal wait", stdout: JSON.stringify({ ok: false, error: { code: "no-such-terminal", message: "unknown handle" } }), exit: 1 }]
const STALE_BLOCKED_WAIT = JSON.stringify({ ok: true, result: { wait: { satisfied: false, status: "running", blockedReason: "codex-trust-workspace" } } })
const DOCUMENTED_CODEX_BLOCKED_WAIT = JSON.stringify({ ok: true, result: { wait: { satisfied: false, status: "running", blockedReason: "codex-interactive-prompt" } } })
const CODEX_READY_PLACEHOLDER_CASES = [
  ["explain-codebase", "› Explain this codebase"],
  ["review-changes", "› Run /review on my current changes"],
  ["write-tests", "› Write tests for @filename"],
  ["list-skills", "› Use /skills to list available skills"],
]
/**
 * WHY: Captured 2026-07-28 from three live Codex composers. Placeholder text rotates, while
 * every ready region carries model, effort, separator and working-directory structure.
 * https://github.com/thomasluizon/orbit-ui-mobile/pull/629
 *
 * › Run /review on my current changes gpt-5.6-sol high · ~\orca\workspaces\orbit-ui-mobile\orb-106-... · Main [default]
 * › Improve documentation in @filename gpt-5.6-sol high · ~\orca\workspaces\orbit-ui-mobile\orb-113-...
 * › Explain this codebase gpt-5.6-sol high · ~\orca\workspaces\orbit-ui-mobile\orb-122-... · Main [default]
 */
const CODEX_STATUS_STRUCTURE = "gpt-5.6-sol high · ~\\orca\\workspaces\\orbit-ui-mobile\\orb-129-nudge-worker-is-unreachable-when-orca · Main [default]"
const MEASURED_CODEX_READY_TAIL = [
  "Working (52s · esc to interrupt)",
  "a · Main [default]",
  "",
  "─ Worked for 11m 02s ─────────────────────────────────────────────────────────── › Explain this codebase gpt-5.6-sol high · ~\\orca\\workspaces\\orbit-ui-mobile\\orb-129-nudge-worker-is-unreachable-when-orca · Main [default]",
]
const MEASURED_CODEX_WORKING_TAIL = [
  ...MEASURED_CODEX_READY_TAIL,
  "(7s • esc to interrupt)",
]
const LIVE_CODEX_SAMPLE_CASES = [
  ["term-0c6e56a7-idle", "recognizes the first live idle composer shape", [
    "a · Main [default]",
    "› Improve documentation in @filename",
    "gpt-5.6-sol high · ~\\orca\\workspaces\\orbit-ui-mobile\\orb-129-nudge-worker-is-unreachable-when-orca",
    "─ Worked for 10m 03s ───────────────────────────────────────────────────────────",
  ], true],
  ["term-65aa37cd-busy", "refuses the live busy composer shape", [
    "a · Main [default]",
    "› Improve documentation in @filename",
    CODEX_STATUS_STRUCTURE,
    "(7s • esc to interrupt)",
  ], false],
  ["term-652dd931-idle", "recognizes the second live idle composer shape", [
    "› Use /skills to list available skills",
    CODEX_STATUS_STRUCTURE,
  ], true],
]
/** A settled TUI emits nothing, so lastOutputAt is the SAME on both samples. */
const IDLE_STUB = [
  { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: true } } }), exit: 0 },
  { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }), exit: 0 },
  { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }), exit: 0 },
]
const staleBlockedIdleStub = (tail) => [
  { match: "terminal wait", stdout: STALE_BLOCKED_WAIT, exit: 0 },
  { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }), exit: 0 },
  { match: "terminal read", stdout: JSON.stringify({ ok: true, result: { terminal: { tail } } }), exit: 0 },
  { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }), exit: 0 },
]
const WORKING_COMPOSER_IDLE_STUB = staleBlockedIdleStub([
  "› Explain this codebase",
  CODEX_STATUS_STRUCTURE,
  "Working (52s · esc to interrupt)",
])
const MISSPELLED_WORKING_COMPOSER_IDLE_STUB = staleBlockedIdleStub([
  "› Explain this codebase",
  CODEX_STATUS_STRUCTURE,
  "Working (52s · esc to interupt)",
])
const LIVE_BLOCKED_IDLE_STUB = [
  { match: "terminal wait", stdout: STALE_BLOCKED_WAIT, exit: 0 },
  { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }), exit: 0 },
  { match: "terminal read", stdout: JSON.stringify({ ok: true, result: { terminal: { tail: ["Doyoutrustthecontents", "ofthisdirectory?"] } } }), exit: 0 },
  { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }), exit: 0 },
]
const ANSWERED_TRUST_BEFORE_READY_TAIL = [
  "Do you trust the contents of this directory?",
  "Trust once and continue",
  "› Explain this codebase",
  CODEX_STATUS_STRUCTURE,
]
const LIVE_TRUST_AFTER_COMPOSER_TAIL = [
  "› Explain this codebase",
  CODEX_STATUS_STRUCTURE,
  "Do you trust the contents of this directory?",
]
const RETAINED_COMPOSER_STATIC_SCREEN_TAIL = [
  "› Run /review on my current changes",
  "Permission required",
  "Allow this command?",
  "[y] Yes  [n] No",
]
const RETAINED_READY_STATIC_SCREEN_TAIL = [
  "› Run /review on my current changes",
  CODEX_STATUS_STRUCTURE,
  "Permission required",
  "Allow this command?",
  "[y] Yes  [n] No",
]
const ALTERNATE_MODEL_READY_TAIL = [
  "› Explain this codebase",
  "orbit-coder.v2 ultra · C:\\worktrees\\orbit-ui-mobile\\orb-129 · Main [default]",
]
const UNRECOGNIZED_BLOCKED_IDLE_STUB = [
  { match: "terminal wait", stdout: STALE_BLOCKED_WAIT, exit: 0 },
  { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }), exit: 0 },
  { match: "terminal read", stdout: JSON.stringify({ ok: true, result: { terminal: { tail: ["Allow this command?", "[y] Yes  [n] No"] } } }), exit: 0 },
  { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }), exit: 0 },
]
/**
 * The measured codex failure: orca reports tui-idle while the worker is mid-turn. The stub
 * says satisfied AND repaints (lastOutputAt is stamped fresh on every call), which is exactly
 * what a running turn looks like. A send here is the ORB-75 corruption, so this must refuse.
 */
const FALSE_IDLE_STUB = [
  { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: true } } }), exit: 0 },
  { match: "terminal show", stdout: '{"ok":true,"result":{"terminal":{"lastOutputAt":__NOW__}}}', exit: 0 },
  { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }), exit: 0 },
]
const BLOCKED_BUSY_STUB = [
  { match: "terminal wait", stdout: STALE_BLOCKED_WAIT, exit: 0 },
  { match: "terminal show", stdout: '{"ok":true,"result":{"terminal":{"lastOutputAt":__NOW__}}}', exit: 0 },
  { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }), exit: 0 },
]
const DOCUMENTED_CODEX_BLOCKED_IDLE_STUB = [
  { match: "terminal wait", stdout: DOCUMENTED_CODEX_BLOCKED_WAIT, exit: 0 },
  { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }), exit: 0 },
]

const runNudgeSignalCase = (label, name, plan, expect, expectedSends, options = {}) => {
  const log = join(root, `nudge-${label}.log`)
  check("nudge-worker.mjs", name, ["--terminal", "t1", "--text", "hi", "--wait-attempts", String(options.waitAttempts ?? 1), ...(options.argv ?? [])], expect, {
    path: options.path,
    env: { ...orcaEnv(plan), ...(options.env ?? {}), ORBIT_ORCA_LOG: log },
  })
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []
  const sends = calls.filter((argv) => argv[0].split(/[\\/]/).pop() === "terminal" && argv[1] === "send").length
  T(`nudge-worker.mjs: ${name} sends ${expectedSends} time(s)`, sends === expectedSends, `sent ${sends} time(s)`)
}

const legacyNudgeWorkerCases = () => {
  check("nudge-worker.mjs", "--help documents the engine override and fail-closed rule", ["--help"], { status: 0, stdout: /--engine <name>[\s\S]*Claude has no verified readiness profile[\s\S]*Missing, auto or unknown values[\s\S]*fail closed/ })
  check("nudge-worker.mjs", "rejects multi-line text", ["--terminal", "t1", "--text", "first line\nsecond line"], { status: 2, stderr: /single line/ })
  check("nudge-worker.mjs", "rejects --text together with --prompt-file", ["--terminal", "t1", "--text", "hi", "--prompt-file", stage("nudge-prompt.md", "body\n")], { status: 2, stderr: /alternatives/ })
  check("nudge-worker.mjs", "rejects a non-positive --wait-attempts", ["--terminal", "t1", "--text", "hi", "--wait-attempts", "0"], { status: 2, stderr: /positive integer/ })
  check("nudge-worker.mjs", "refuses to send while the worker is busy", ["--terminal", "t1", "--text", "hi", "--wait-attempts", "1"], { status: 1, stderr: /NOTHING was sent/ }, { env: orcaEnv(BUSY_STUB) })
  check("nudge-worker.mjs", "an orca failure that is not a timeout is a tool error", ["--terminal", "t1", "--text", "hi", "--wait-attempts", "1"], { status: 3, stderr: /unknown handle/ }, { env: orcaEnv(BROKEN_STUB) })
  runNudgeSignalCase("both-idle", "sends once both signals say the worker is idle", IDLE_STUB, { status: 0, stdout: /"sent": "hi"/ }, 1, { path: stageNudgeWorker("both-idle", "codex").path })
  for (const [label, placeholder] of CODEX_READY_PLACEHOLDER_CASES) {
    const readyTail = ["Worked for 13m 01s", "PR opened and issue moved to In Review", placeholder, CODEX_STATUS_STRUCTURE]
    runNudgeSignalCase(`stale-block-${label}`, `trusts the codex ready composer structure with ${placeholder}`, staleBlockedIdleStub(readyTail), { status: 0, stdout: /"sent": "hi"/, stderr: /codex-trust-workspace[\s\S]*not repainting[\s\S]*no known trust prompt[\s\S]*codex ready composer is on screen[\s\S]*blocked reason is stale[\s\S]*screen and repaint signals win/ }, 1, { path: stageNudgeWorker(`stale-block-${label}`, "codex").path })
  }
  runNudgeSignalCase("retained-composer-static-screen", "refuses a retained composer marker followed by a static permission screen", staleBlockedIdleStub(RETAINED_COMPOSER_STATIC_SCREEN_TAIL), { status: 1, stderr: /no known ready composer is on screen[\s\S]*NOTHING was sent/ }, 0, { path: stageNudgeWorker("retained-composer-static-screen", "codex").path })
  runNudgeSignalCase("retained-ready-static-screen", "refuses a retained composer and status followed by a static permission screen", staleBlockedIdleStub(RETAINED_READY_STATIC_SCREEN_TAIL), { status: 1, stderr: /no known ready composer is on screen[\s\S]*NOTHING was sent/ }, 0, { path: stageNudgeWorker("retained-ready-static-screen", "codex").path })
  runNudgeSignalCase("measured-ready-composer", "trusts the measured idle codex tail despite a historical working indicator", staleBlockedIdleStub(MEASURED_CODEX_READY_TAIL), { status: 0, stdout: /"sent": "hi"/, stderr: /codex ready composer is on screen/ }, 1, { path: stageNudgeWorker("measured-ready-composer", "codex").path })
  runNudgeSignalCase("measured-working-composer", "refuses the measured codex tail with a live working indicator after the composer", staleBlockedIdleStub(MEASURED_CODEX_WORKING_TAIL), { status: 1, stderr: /no known ready composer is on screen[\s\S]*NOTHING was sent/ }, 0, { path: stageNudgeWorker("measured-working-composer", "codex").path })
  runNudgeSignalCase("alternate-model-ready-composer", "recognizes structural status with a different codex model and effort", staleBlockedIdleStub(ALTERNATE_MODEL_READY_TAIL), { status: 0, stdout: /"sent": "hi"/, stderr: /codex ready composer is on screen/ }, 1, { path: stageNudgeWorker("alternate-model-ready-composer", "codex").path })
  for (const [label, name, tail, ready] of LIVE_CODEX_SAMPLE_CASES) {
    const expect = ready
      ? { status: 0, stdout: /"sent": "hi"/, stderr: /codex ready composer is on screen/ }
      : { status: 1, stderr: /no known ready composer is on screen[\s\S]*NOTHING was sent/ }
    runNudgeSignalCase(label, name, staleBlockedIdleStub(tail), expect, ready ? 1 : 0, { path: stageNudgeWorker(label, "codex").path })
  }
  runNudgeSignalCase("answered-trust-before-ready", "ignores answered trust text before the current codex composer", staleBlockedIdleStub(ANSWERED_TRUST_BEFORE_READY_TAIL), { status: 0, stdout: /"sent": "hi"/, stderr: /codex ready composer is on screen[\s\S]*blocked reason is stale/ }, 1, { path: stageNudgeWorker("answered-trust-before-ready", "codex").path })
  runNudgeSignalCase("live-trust-after-composer", "refuses a live trust prompt after the current codex composer", staleBlockedIdleStub(LIVE_TRUST_AFTER_COMPOSER_TAIL), { status: 1, stderr: /codex trust prompt is still on screen[\s\S]*worker remains blocked[\s\S]*NOTHING was sent/ }, 0, { path: stageNudgeWorker("live-trust-after-composer", "codex").path })
  runNudgeSignalCase("trust-without-composer", "fails closed when a trust prompt has no current composer region", LIVE_BLOCKED_IDLE_STUB, { status: 1, stderr: /current screen region could not be located[\s\S]*no codex composer marker[\s\S]*codex trust prompt is still on screen in retained tail[\s\S]*NOTHING was sent/ }, 0, { path: stageNudgeWorker("trust-without-composer", "codex").path })
  const codexProfile = stageNudgeWorker("codex-profile", "codex")
  const incidentalGreaterThanTail = [
    "› Working on the nudge predicate",
    "(8s • esc to interrupt)",
    "> quoted output painted after the working indicator",
  ]
  runNudgeSignalCase("codex-incidental-greater-than", "does not let incidental greater-than output select the claude profile for a codex worker", staleBlockedIdleStub(incidentalGreaterThanTail), { status: 1, stderr: /no known ready composer is on screen for the codex profile[\s\S]*NOTHING was sent/ }, 0, { path: codexProfile.path })
  runNudgeSignalCase("explicit-claude-profile", "fails closed for the explicitly selected unverified claude profile", staleBlockedIdleStub(incidentalGreaterThanTail), { status: 1, stderr: /claude readiness profile is unverified[\s\S]*captured Claude Code composer screen with and without a live working indicator[\s\S]*pull\/629[\s\S]*NOTHING was sent/ }, 0, { path: codexProfile.path, argv: ["--engine", "claude"] })
  const autoProfile = stageNudgeWorker("auto-profile", "auto")
  runNudgeSignalCase("auto-profile", "fails closed when the orchestrator worker is auto", staleBlockedIdleStub(["› Explain this codebase"]), { status: 1, stderr: /engine "auto" from \.claude\/orchestrator\.json worker does not resolve[\s\S]*NOTHING was sent/ }, 0, { path: autoProfile.path })
  const unknownProfile = stageNudgeWorker("unknown-profile", "future-engine")
  runNudgeSignalCase("unknown-profile", "fails closed when the orchestrator worker is unknown", staleBlockedIdleStub(["› Explain this codebase"]), { status: 1, stderr: /engine "future-engine" from \.claude\/orchestrator\.json worker does not resolve[\s\S]*NOTHING was sent/ }, 0, { path: unknownProfile.path })
  runNudgeSignalCase("unknown-engine-override", "fails closed when the engine override is unknown", staleBlockedIdleStub(["› Explain this codebase"]), { status: 1, stderr: /engine "future-engine" from --engine does not resolve[\s\S]*NOTHING was sent/ }, 0, { path: unknownProfile.path, argv: ["--engine", "future-engine"] })
  const missingProfile = stageNudgeWorker("missing-profile", undefined)
  runNudgeSignalCase("missing-profile", "fails closed when the orchestrator worker is missing", staleBlockedIdleStub(["› Explain this codebase"]), { status: 1, stderr: /engine "<missing>" from \.claude\/orchestrator\.json worker does not resolve[\s\S]*NOTHING was sent/ }, 0, { path: missingProfile.path })
  const claudeProfile = stageNudgeWorker("claude-profile", "claude")
  runNudgeSignalCase("configured-claude-profile", "fails closed for the configured unverified claude profile", staleBlockedIdleStub(incidentalGreaterThanTail), { status: 1, stderr: /claude readiness profile is unverified[\s\S]*captured Claude Code composer screen with and without a live working indicator[\s\S]*pull\/629[\s\S]*NOTHING was sent/ }, 0, { path: claudeProfile.path })
  runNudgeSignalCase("engine-override", "--engine overrides a disagreeing orchestrator worker", staleBlockedIdleStub(["› Explain this codebase", CODEX_STATUS_STRUCTURE]), { status: 0, stdout: /"engine": "codex"[\s\S]*"engineSource": "--engine"/ }, 1, { path: claudeProfile.path, argv: ["--engine", "codex"] })
  const pauseProbe = stageNudgeWorker("pause-probe", "codex", true)
  const pauseLog = join(pauseProbe.base, "pause.log")
  runNudgeSignalCase("trust-prompt-pause", "settles before retrying a trust prompt that remains on screen", LIVE_BLOCKED_IDLE_STUB, { status: 1, stderr: /attempt 1:[\s\S]*trust prompt is still on screen[\s\S]*attempt 2:[\s\S]*trust prompt is still on screen[\s\S]*NOTHING was sent/ }, 0, {
    path: pauseProbe.path,
    waitAttempts: 2,
    env: { ORBIT_PAUSE_LOG: pauseLog },
  })
  const pauses = existsSync(pauseLog) ? readFileSync(pauseLog, "utf8").trim().split("\n") : []
  T("nudge-worker.mjs: trust prompt retry applies one settle pause", pauses.length === 1 && pauses[0] === "10000", `pause log: ${JSON.stringify(pauses)}`)
  runNudgeSignalCase("working-composer", "refuses a ready-looking codex composer carrying esc to interrupt", WORKING_COMPOSER_IDLE_STUB, { status: 1, stderr: /no known ready composer is on screen[\s\S]*NOTHING was sent/ }, 0, { path: stageNudgeWorker("working-composer", "codex").path })
  runNudgeSignalCase("misspelled-working-composer", "refuses a ready-looking codex composer carrying esc to interupt", MISSPELLED_WORKING_COMPOSER_IDLE_STUB, { status: 1, stderr: /no known ready composer is on screen[\s\S]*NOTHING was sent/ }, 0, { path: stageNudgeWorker("misspelled-working-composer", "codex").path })
  runNudgeSignalCase("live-block", "refuses a static trust prompt that is still on screen", LIVE_BLOCKED_IDLE_STUB, { status: 1, stderr: /codex-trust-workspace[\s\S]*not repainting[\s\S]*codex trust prompt is still on screen[\s\S]*remains blocked[\s\S]*NOTHING was sent/ }, 0, { path: stageNudgeWorker("live-block", "codex").path })
  runNudgeSignalCase("unrecognized-block", "refuses an unrecognized static screen with no ready composer signal", UNRECOGNIZED_BLOCKED_IDLE_STUB, { status: 1, stderr: /codex-trust-workspace[\s\S]*not repainting[\s\S]*no known trust prompt[\s\S]*no known ready composer is on screen[\s\S]*worker remains blocked[\s\S]*NOTHING was sent/ }, 0, { path: stageNudgeWorker("unrecognized-block", "codex").path })
  runNudgeSignalCase("false-idle", "refuses a tui-idle that is still repainting, which is a worker mid-turn", FALSE_IDLE_STUB, { status: 1, stderr: /tui-idle[\s\S]*still repainting[\s\S]*repaint signal wins[\s\S]*NOTHING was sent/ }, 0, { path: stageNudgeWorker("false-idle", "codex").path })
  runNudgeSignalCase("both-busy", "refuses when both signals say the worker is busy", BLOCKED_BUSY_STUB, { status: 1, stderr: /codex-trust-workspace[\s\S]*TUI is repainting[\s\S]*both signals[\s\S]*NOTHING was sent/ }, 0, { path: stageNudgeWorker("both-busy", "codex").path })
  runNudgeSignalCase("documented-codex-reason", "does not treat codex-interactive-prompt as the measured stale reason", DOCUMENTED_CODEX_BLOCKED_IDLE_STUB, { status: 1, stderr: /worker is busy \(codex-interactive-prompt\)[\s\S]*NOTHING was sent/ }, 0, { path: stageNudgeWorker("documented-codex-reason", "codex").path })
  check("nudge-worker.mjs", "--dry-run calls orca not at all", ["--terminal", "t1", "--text", "hi", "--dry-run"], { status: 0, stdout: /"dryRun": true/ }, { env: orcaEnv([]) })
}

/**
 * pr-watch cases. Every one is a state the two hand-rolled ORB-88 loops got wrong, so the
 * regression they pin is "the watcher went back to sleep with the answer on screen".
 */
const HEAD_SHA = "d9a3f1c43e6d6c571d09fe7ea8afc55c26aa19dd"
const OLD_SHA = "1111111111111111111111111111111111111111"
const reviewOn = (state, oid) => ({ state, author: { login: "claude" }, commit: { oid } })
const checkRun = (name, conclusion) => ({ __typename: "CheckRun", name, status: "COMPLETED", conclusion })
const pullRequestStub = (number, pullRequest) => ({
  match: `number=${number}`,
  stdout: JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          number,
          url: `https://github.com/thomasluizon/orbit-ui-mobile/pull/${number}`,
          state: "OPEN",
          merged: false,
          isDraft: false,
          mergeStateStatus: "BLOCKED",
          reviewDecision: null,
          headRefOid: HEAD_SHA,
          latestReviews: { nodes: [] },
          commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS", contexts: { nodes: [checkRun("Lint", "SUCCESS")] } } } }] },
          ...pullRequest,
        },
      },
    },
  }),
})
const rollup = (...contexts) => ({ nodes: [{ commit: { statusCheckRollup: { state: "FAILURE", contexts: { nodes: contexts } } } }] })

const prWatchCases = () => {
  const argv = ["--repo", "thomasluizon/orbit-ui-mobile", "--pr", "615", "--once"]
  check(
    "pr-watch.mjs",
    "--help says repeated acted signals on one PR and head accumulate",
    ["--help"],
    { status: 0, stdout: /same PR and head accumulate[\s\S]*READY_TO_MERGE independently/ },
  )
  let sequenceNumber = 0
  const checkSequence = (name, states, extraArgv, expect) => {
    sequenceNumber += 1
    const log = join(root, `pr-watch-sequence-${sequenceNumber}.log`)
    const result = check(
      "pr-watch.mjs",
      name,
      ["--repo", "thomasluizon/orbit-ui-mobile", "--pr", "615", "--interval", "0.05", "--timeout", "2", ...extraArgv],
      expect,
      {
        env: {
          ...orcaEnv([{ match: "number=615", sequence: states.map((state) => pullRequestStub(615, state).stdout) }]),
          ORBIT_ORCA_LOG: log,
        },
      },
    )
    const polls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).length : 0
    T(`pr-watch.mjs: ${name} consumed the state sequence`, polls >= states.length, `polled ${polls} time(s), expected at least ${states.length}`)
    return result
  }

  check(
    "pr-watch.mjs",
    "a verdict sitting on an OLDER commit does not satisfy the watch",
    argv,
    { status: 4, stdout: /"transition": "none"/ },
    { env: orcaEnv([pullRequestStub(615, { reviewDecision: "CHANGES_REQUESTED", latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", OLD_SHA)] } })]) },
  )
  check(
    "pr-watch.mjs",
    "a fresh CHANGES_REQUESTED on the current head fires, which is the silent-spin regression",
    argv,
    { status: 1, stdout: /"transition": "changes-requested"/ },
    { env: orcaEnv([pullRequestStub(615, { reviewDecision: "CHANGES_REQUESTED", latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", HEAD_SHA)] } })]) },
  )
  const approved = pullRequestStub(615, { reviewDecision: "APPROVED", mergeStateStatus: "CLEAN", latestReviews: { nodes: [reviewOn("APPROVED", HEAD_SHA)] } })
  check("pr-watch.mjs", "a fresh approval fires", argv, { status: 0, stdout: /"transition": "approved"/ }, { env: orcaEnv([approved]) })
  check(
    "pr-watch.mjs",
    "a draft reading clean and approved is refused",
    argv,
    { status: 1, stdout: /"transition": "draft"[\s\S]*"reason": "the PR is a draft and cannot be merged"/ },
    { env: orcaEnv([pullRequestStub(615, { isDraft: true, reviewDecision: "APPROVED", mergeStateStatus: "CLEAN", latestReviews: { nodes: [reviewOn("APPROVED", HEAD_SHA)] } })]) },
  )
  check(
    "pr-watch.mjs",
    "an acted approval that became clean between watches reports readiness",
    [...argv, "--acted", `615=${HEAD_SHA.slice(0, 7)}:APPROVED`],
    { status: 0, stdout: /"transition": "ready-to-merge"/ },
    { env: orcaEnv([approved]) },
  )
  check(
    "pr-watch.mjs",
    "an acted readiness on an already clean PR does not repeat",
    [...argv, "--acted", `615=${HEAD_SHA.slice(0, 7)}:APPROVED`, "--acted", `615=${HEAD_SHA}:READY_TO_MERGE`],
    { status: 4, stdout: /"transition": "none"/ },
    { env: orcaEnv([approved]) },
  )
  const twoVerdicts = {
    reviewDecision: "CHANGES_REQUESTED",
    latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", HEAD_SHA), reviewOn("COMMENTED", HEAD_SHA)] },
  }
  check(
    "pr-watch.mjs",
    "two acted verdicts on the same PR and head both remain suppressed",
    [...argv, "--acted", `615=${HEAD_SHA}:CHANGES_REQUESTED`, "--acted", `615=${HEAD_SHA}:COMMENTED`],
    { status: 4, stdout: /"transition": "none"/ },
    { env: orcaEnv([pullRequestStub(615, twoVerdicts)]) },
  )
  check(
    "pr-watch.mjs",
    "acting only on the comment leaves changes requested actionable",
    [...argv, "--acted", `615=${HEAD_SHA}:COMMENTED`],
    { status: 1, stdout: /"transition": "changes-requested"/ },
    { env: orcaEnv([pullRequestStub(615, twoVerdicts)]) },
  )
  check(
    "pr-watch.mjs",
    "acting only on changes requested leaves the comment actionable",
    [...argv, "--acted", `615=${HEAD_SHA}:CHANGES_REQUESTED`],
    { status: 1, stdout: /"transition": "review-comment"/ },
    { env: orcaEnv([pullRequestStub(615, twoVerdicts)]) },
  )
  check(
    "pr-watch.mjs",
    "a failing check beats an approval",
    argv,
    { status: 1, stdout: /"transition": "checks-failed"/ },
    {
      env: orcaEnv([
        pullRequestStub(615, {
          reviewDecision: "APPROVED",
          mergeStateStatus: "CLEAN",
          latestReviews: { nodes: [reviewOn("APPROVED", HEAD_SHA)] },
          commits: rollup(checkRun("Lint", "SUCCESS"), checkRun("Harness Execution", "FAILURE")),
        }),
      ]),
    },
  )
  check(
    "pr-watch.mjs",
    "a merged PR ends the watch",
    argv,
    { status: 5, stdout: /"transition": "gone"/ },
    { env: orcaEnv([pullRequestStub(615, { state: "MERGED", merged: true })]) },
  )
  check(
    "pr-watch.mjs",
    "a closed PR ends the watch",
    argv,
    { status: 5, stdout: /"transition": "gone"[\s\S]*"reason": "the PR is closed unmerged"/ },
    { env: orcaEnv([pullRequestStub(615, { state: "CLOSED" })]) },
  )
  checkSequence(
    "a review decision changing on the current head fires",
    [{ reviewDecision: null }, { reviewDecision: "APPROVED" }],
    [],
    { status: 0, stdout: /"transition": "review-decision"/ },
  )
  checkSequence(
    "a non-approving review decision change needs work",
    [{ reviewDecision: "APPROVED" }, { reviewDecision: "CHANGES_REQUESTED" }],
    [],
    { status: 1, stdout: /"transition": "review-decision"/ },
  )
  checkSequence(
    "a required check concluding as failed fires",
    [
      { commits: { nodes: [{ commit: { statusCheckRollup: { state: "PENDING", contexts: { nodes: [{ ...checkRun("Lint", null), status: "IN_PROGRESS" }] } } } }] } },
      { commits: rollup(checkRun("Lint", "FAILURE")) },
    ],
    [],
    { status: 1, stdout: /"transition": "checks-failed"[\s\S]*Lint: FAILURE/ },
  )
  checkSequence(
    "a head change wins when merge state becomes clean in the same poll",
    [{ headRefOid: OLD_SHA, mergeStateStatus: "BLOCKED" }, { headRefOid: HEAD_SHA, mergeStateStatus: "CLEAN" }],
    [],
    { status: 1, stdout: /"transition": "head-changed"/ },
  )
  checkSequence(
    "clean through unknown and back to clean emits nothing",
    [{ mergeStateStatus: "CLEAN" }, { mergeStateStatus: "UNKNOWN" }, { mergeStateStatus: "CLEAN" }],
    [],
    { status: 4, stdout: /"transition": "timeout"/ },
  )
  checkSequence(
    "blocked through unknown to clean emits once for clean",
    [{ mergeStateStatus: "BLOCKED" }, { mergeStateStatus: "UNKNOWN" }, { mergeStateStatus: "CLEAN" }],
    [],
    { status: 0, stdout: /"transition": "merge-clean"/ },
  )
  checkSequence(
    "an acted approval emits readiness when the PR later becomes clean",
    [
      { reviewDecision: "APPROVED", mergeStateStatus: "BLOCKED", latestReviews: { nodes: [reviewOn("APPROVED", HEAD_SHA)] } },
      { reviewDecision: "APPROVED", mergeStateStatus: "CLEAN", latestReviews: { nodes: [reviewOn("APPROVED", HEAD_SHA)] } },
    ],
    ["--acted", `615=${HEAD_SHA}:APPROVED`],
    { status: 0, stdout: /"transition": "ready-to-merge"/ },
  )
  checkSequence(
    "non-terminal merge state churn emits nothing",
    [{ mergeStateStatus: "BLOCKED" }, { mergeStateStatus: "UNKNOWN" }, { mergeStateStatus: "BEHIND" }],
    [],
    { status: 4, stdout: /"transition": "timeout"/ },
  )
  check(
    "pr-watch.mjs",
    "watching several PRs reports whichever one transitioned",
    ["--repo", "thomasluizon/orbit-ui-mobile", "--pr", "615,616", "--once"],
    { status: 1, stdout: /"pr": 616[\s\S]*"transition": "changes-requested"/ },
    {
      env: orcaEnv([
        pullRequestStub(615, {}),
        pullRequestStub(616, { reviewDecision: "CHANGES_REQUESTED", latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", HEAD_SHA)] } }),
      ]),
    },
  )
  check(
    "pr-watch.mjs",
    "an acted ready PR does not starve a later fleet transition",
    [
      "--repo",
      "thomasluizon/orbit-ui-mobile",
      "--pr",
      "615,616",
      "--once",
      "--acted",
      `615=${HEAD_SHA}:APPROVED`,
      "--acted",
      `615=${HEAD_SHA}:READY_TO_MERGE`,
    ],
    { status: 1, stdout: /"pr": 616[\s\S]*"transition": "changes-requested"/ },
    {
      env: orcaEnv([
        approved,
        pullRequestStub(616, { reviewDecision: "CHANGES_REQUESTED", latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", HEAD_SHA)] } }),
      ]),
    },
  )
  /**
   * The REAL loop, not --once: every other case here short-circuits it, and this is the code
   * that runs unattended for 90 minutes in place of two predecessors that failed silently.
   * --interval 1 --timeout 3 gives it two sleeps before the deadline, so polls > 1 is the proof
   * that it slept and came back rather than falling out of the loop on the first pass.
   */
  const timedOut = check(
    "pr-watch.mjs",
    "the polling loop sleeps, re-polls and times out reporting it, without --once",
    ["--repo", "thomasluizon/orbit-ui-mobile", "--pr", "615", "--interval", "1", "--timeout", "3"],
    { status: 4, stdout: /"transition": "timeout"/ },
    { env: orcaEnv([pullRequestStub(615, { reviewDecision: "CHANGES_REQUESTED", latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", OLD_SHA)] } })]) },
  )
  T(
    "pr-watch.mjs: the timed-out watch really polled more than once",
    timedOut.status === 4 && JSON.parse(timedOut.stdout).polls > 1,
    `polls was ${timedOut.status === 4 ? JSON.parse(timedOut.stdout).polls : "unreadable"}; one poll means the loop never slept\n     ${timedOut.stderr.trim().split("\n").slice(0, 4).join("\n     ")}`,
  )

  check("pr-watch.mjs", "refuses a baseline for a PR it is not watching", [...argv, "--acted", `616=${HEAD_SHA}:APPROVED`], { status: 2, stderr: /--pr does not watch/ })
  check("pr-watch.mjs", "refuses a malformed baseline rather than ignoring it", [...argv, "--acted", "615=APPROVED"], { status: 2, stderr: /--acted must look like/ })
  check("pr-watch.mjs", "refuses an unknown acted signal", [...argv, "--acted", `615=${HEAD_SHA}:MERGEABLE`], { status: 2, stderr: /--acted signal must be/ })
  check("pr-watch.mjs", "refuses a repo that is not an owner\\/name slug", ["--repo", "orbit-ui-mobile", "--pr", "615", "--once"], { status: 2, stderr: /owner\/name slug/ })
}

/**
 * worker-watch cases. The liveness half is the whole point: a single terminal read cannot tell a
 * busy worker from an idle one, and a busy worker's tail is thousands of characters of
 * concatenated repaint fragments that hide whatever it last really said.
 */
const legacyWorkerWatchCases = () => {
  const terminalHandle = "term_ca852374-175d-42cd-8407-b579a03cc13a"
  const childWorktree = (path) => ({
    path,
    repoId: "r-ui",
    projectId: "github:thomasluizon/orbit-ui-mobile",
    isMainWorktree: false,
    isArchived: false,
    branch: "refs/heads/feature/orb-75-prove-the-harness-gate",
    linkedLinearIssue: "ORB-75",
    baseRef: "main",
    comment: "ORB-75 launched: worker running",
  })
  const linearState = {
    match: "linear issue ORB-75",
    stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-75", state: { name: "In Progress" }, labels: [] } } }),
  }
  const fleet = (path, { lastOutputAt, tail }) => [
    { match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [childWorktree(path)] } }) },
    {
      match: "terminal list",
      stdout: JSON.stringify({ ok: true, result: { terminals: [{ handle: terminalHandle, worktreePath: path, title: "Claude Code", lastOutputAt: 0 }] } }).replace(
        '"lastOutputAt":0',
        `"lastOutputAt":${lastOutputAt}`,
      ),
    },
    { match: "terminal read", stdout: JSON.stringify({ ok: true, result: { terminal: { tail } } }) },
    linearState,
  ]

  check(
    "worker-watch.mjs",
    "an empty fleet says so rather than printing nothing",
    [],
    { status: 0, stdout: /no Orca worktrees/ },
    { env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [] } }) }]) },
  )

  /** __NOW__ is stamped per stub call, so the two samples differ: a TUI painting its spinner. */
  const busy = check(
    "worker-watch.mjs",
    "a repainting terminal is BUSY, and its repaint tail yields no output lines",
    ["--no-contract"],
    { status: 0, stdout: /BUSY\s+ORB-75/ },
    {
      env: orcaEnv(
        fleet("C:/wt/orb-75", {
          lastOutputAt: "__NOW__",
          tail: ["WorkingWorkingWorkingWorking (12s - esc to interupt)WorkingWorking", "  ⠋ ⠙ ⠹ ⠸  "],
        }),
      ),
    },
  )
  T("worker-watch.mjs: the repaint tail is stripped to nothing rather than printed raw", /nothing but repaint noise/.test(busy.stdout), busy.stdout.slice(0, 400))
  T("worker-watch.mjs: the ticket's Linear state is reported alongside liveness", /In Progress/.test(busy.stdout), busy.stdout.slice(0, 400))
  T(
    "worker-watch.mjs: the rendered terminal handle is complete and directly reusable",
    busy.stdout.includes(`${terminalHandle} BUSY`) && !/term_ca852374\s+BUSY/.test(busy.stdout),
    busy.stdout.slice(0, 400),
  )

  /** A frozen lastOutputAt is a settled TUI: identical samples, so IDLE. */
  const idle = check(
    "worker-watch.mjs",
    "two identical samples are IDLE, and real content survives the stripping",
    [],
    { status: 0, stdout: /IDLE\s+ORB-75/ },
    {
      env: orcaEnv(
        fleet(root, {
          lastOutputAt: "1785168487585",
          tail: ["Working (30s - esc to interupt)", "Wrote tools/pr-watch.mjs", "Which of these two approaches do you want?"],
        }),
      ),
    },
  )
  T(
    "worker-watch.mjs: the last meaningful lines survive, so a worker stopped on a question is readable",
    /Wrote tools\/pr-watch\.mjs/.test(idle.stdout) && /Which of these two approaches/.test(idle.stdout),
    idle.stdout.slice(0, 400),
  )
  T(
    "worker-watch.mjs: an unreadable contract verdict is reported, never silently dropped",
    /contract\s+unavailable/.test(idle.stdout),
    `worker-status ran against a non-repo path, so the verdict must degrade visibly\n     ${idle.stdout.slice(0, 400)}`,
  )
  check("worker-watch.mjs", "refuses a repo outside orchestrator.json", ["--repo", "zzz"], { status: 2, stderr: /--repo must be one of/ })
  check("worker-watch.mjs", "refuses a non-positive --lines", ["--lines", "0"], { status: 2, stderr: /positive integer/ })
}

/** A linked child checkout is the smallest real Git fixture that can prove teardown verification. */
const stageTeardownWorktree = (label, { dirty = false, changed = false, squashMerged = false, fastForwardMerged = false, serverMerged = false, localFollowUp = false, localFollowUpMerged = false, siblingTargetAdvance = false, branchDeleteMode } = {}) => {
  const primary = join(root, "teardown", label, "primary")
  const child = join(root, "teardown", label, "child")
  const remote = join(root, "teardown", label, "remote.git")
  mkdirSync(primary, { recursive: true })
  const git = (cwd, args) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
  if (git(primary, ["init", "-q", "--bare", remote]).status !== 0) return null
  for (const args of [["init", "-q", "--initial-branch=main"], ["config", "user.email", "gate@orbit.test"], ["config", "user.name", "Orbit Gate"], ["commit", "-q", "--allow-empty", "-m", "base"], ["remote", "add", "origin", remote], ["push", "-q", "-u", "origin", "main"], ["worktree", "add", "-q", "-b", "feature/orb-124-teardown", child]]) {
    if (git(primary, args).status !== 0) return null
  }
  let mergeCommit
  if (changed) {
    writeFileSync(join(child, "captured.txt"), "not in main\n")
    if (git(child, ["add", "captured.txt"]).status !== 0 || git(child, ["commit", "-q", "-m", "captured work"]).status !== 0) return null
    if (git(child, ["push", "-q", "-u", "origin", "feature/orb-124-teardown"]).status !== 0) return null
    if (squashMerged) {
      writeFileSync(join(primary, "captured.txt"), "not in main\n")
      if (git(primary, ["add", "captured.txt"]).status !== 0 || git(primary, ["commit", "-q", "-m", "squashed capture"]).status !== 0) return null
      mergeCommit = git(primary, ["rev-parse", "HEAD"]).stdout.trim()
    }
    if (fastForwardMerged) {
      if (git(primary, ["merge", "--ff-only", "feature/orb-124-teardown"]).status !== 0) return null
      mergeCommit = git(primary, ["rev-parse", "HEAD"]).stdout.trim()
    }
    if (serverMerged) {
      if (git(primary, ["merge", "--no-ff", "-m", "server merge", "feature/orb-124-teardown"]).status !== 0) return null
      mergeCommit = git(primary, ["rev-parse", "HEAD"]).stdout.trim()
    }
    if (serverMerged) {
      writeFileSync(join(primary, "captured.txt"), "resolved on forge\n")
      if (git(primary, ["add", "captured.txt"]).status !== 0 || git(primary, ["commit", "-q", "-m", "server resolution"]).status !== 0) return null
    }
    if (siblingTargetAdvance) {
      writeFileSync(join(primary, "sibling-ticket.txt"), "already in main\n")
      if (git(primary, ["add", "sibling-ticket.txt"]).status !== 0 || git(primary, ["commit", "-q", "-m", "sibling ticket"]).status !== 0) return null
    }
    if ((squashMerged || fastForwardMerged || serverMerged || siblingTargetAdvance) && git(primary, ["push", "-q", "origin", "main"]).status !== 0) return null
  }
  const headCommit = git(child, ["rev-parse", "HEAD"]).stdout.trim()
  if (localFollowUp) {
    writeFileSync(join(child, "follow-up.txt"), "must not be removed\n")
    if (git(child, ["add", "follow-up.txt"]).status !== 0 || git(child, ["commit", "-q", "-m", "local follow-up"]).status !== 0) return null
  }
  if (localFollowUpMerged) {
    if (git(primary, ["merge", "--no-ff", "-m", "merged local follow-up", "feature/orb-124-teardown"]).status !== 0 || git(primary, ["push", "-q", "origin", "main"]).status !== 0) return null
  }
  if (dirty) writeFileSync(join(child, "dirty.txt"), "uncommitted\n")
  if (branchDeleteMode) {
    const branchRef = "refs/heads/feature/orb-124-teardown"
    const hook = join(primary, ".git", "hooks", "reference-transaction")
    const head = git(primary, ["rev-parse", "main"]).stdout.trim()
    const body = branchDeleteMode === "fail"
      ? `#!/bin/sh\nif [ "$1" = "prepared" ]; then\n  while read old new ref; do\n    if [ "$ref" = "${branchRef}" ] && [ "$new" = "0000000000000000000000000000000000000000" ]; then exit 1; fi\n  done\nfi\n`
      : `#!/bin/sh\nmarker="$GIT_DIR/teardown-branch-recreated"\nif [ "$1" = "committed" ] && [ ! -f "$marker" ]; then\n  while read old new ref; do\n    if [ "$ref" = "${branchRef}" ] && [ "$new" = "0000000000000000000000000000000000000000" ]; then\n      touch "$marker"\n      git update-ref "${branchRef}" "${head}"\n    fi\n  done\nfi\n`
    writeFileSync(hook, body)
    chmodSync(hook, 0o755)
  }
  return { primary, child, branch: "feature/orb-124-teardown", headCommit, mergeCommit: mergeCommit ?? git(primary, ["rev-parse", "HEAD"]).stdout.trim(), targetTip: git(primary, ["rev-parse", "HEAD"]).stdout.trim() }
}

const stageWorkerStatusWorktree = () => {
  const base = join(root, "worker-status")
  const worktree = join(base, "worktree")
  const remote = join(base, "remote.git")
  mkdirSync(base, { recursive: true })
  const git = (cwd, args) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
  if (git(base, ["init", "-q", "--bare", remote]).status !== 0) return null
  mkdirSync(worktree, { recursive: true })
  for (const args of [
    ["init", "-q", "--initial-branch=main"],
    ["config", "user.email", "gate@orbit.test"],
    ["config", "user.name", "Orbit Gate"],
    ["commit", "-q", "--allow-empty", "-m", "base"],
    ["remote", "add", "origin", remote],
    ["push", "-q", "-u", "origin", "main"],
    ["switch", "-q", "-c", "feature/orb-75-worker-status"],
    ["commit", "-q", "--allow-empty", "-m", "worker change"],
  ]) {
    if (git(worktree, args).status !== 0) return null
  }
  writeFileSync(join(worktree, "reviewed.txt"), "implementation\n")
  if (git(worktree, ["add", "reviewed.txt"]).status !== 0 || git(worktree, ["commit", "-q", "-m", "implement reviewed path"]).status !== 0) return null
  const implementationCommit = git(worktree, ["rev-parse", "HEAD"]).stdout.trim()
  writeFileSync(join(worktree, "reviewed.txt"), "implementation\nreviewed state\n")
  if (git(worktree, ["add", "reviewed.txt"]).status !== 0 || git(worktree, ["commit", "-q", "-m", "reviewed state"]).status !== 0) return null
  const reviewedCommit = git(worktree, ["rev-parse", "HEAD"]).stdout.trim()
  writeFileSync(join(worktree, "reviewed.txt"), "implementation\nreviewed state\nreview fix\n")
  if (git(worktree, ["add", "reviewed.txt"]).status !== 0 || git(worktree, ["commit", "-q", "-m", "fix reviewed path"]).status !== 0) return null
  const fixCommit = git(worktree, ["rev-parse", "HEAD"]).stdout.trim()
  writeFileSync(join(worktree, "other.txt"), "unrelated fix\n")
  if (git(worktree, ["add", "other.txt"]).status !== 0 || git(worktree, ["commit", "-q", "-m", "fix other path"]).status !== 0) return null
  const unrelatedCommit = git(worktree, ["rev-parse", "HEAD"]).stdout.trim()
  if (git(worktree, ["push", "-q", "-u", "origin", "feature/orb-75-worker-status"]).status !== 0) return null
  return { fixCommit, implementationCommit, unrelatedCommit, prHead: unrelatedCommit, reviewedCommit, worktree }
}

const workerStatusPlan = (
  attachments,
  {
    comments = [],
    commentsHasNextPage = false,
    approvalHead,
    isDraft = false,
    prHead,
    reviewDecision = "APPROVED",
    reviews = [],
    reviewsHasNextPage = false,
    reviewThreads = [],
    reviewThreadsHasNextPage = false,
  } = {},
) => [
  {
    match: "pr list",
    stdout: JSON.stringify([{ number: 75, url: "https://github.com/orbit/orbit/pull/75", state: "OPEN", baseRefName: "main", isDraft }]),
  },
  {
    match: "api graphql",
    stdout: JSON.stringify({
      data: {
        viewer: { login: "worker" },
        repository: {
          pullRequest: {
            headRefOid: prHead,
            reviewDecision,
            reviews: {
              pageInfo: { hasNextPage: reviewsHasNextPage },
              nodes: [
                ...reviews,
                {
                  id: "PRR_current_approval",
                  author: { login: "human-approver", __typename: "User" },
                  state: "APPROVED",
                  body: "",
                  submittedAt: "2026-07-28T10:00:00Z",
                  updatedAt: "2026-07-28T10:00:00Z",
                  commit: { oid: approvalHead ?? prHead },
                },
              ],
            },
            comments: { pageInfo: { hasNextPage: commentsHasNextPage }, nodes: comments },
            reviewThreads: { pageInfo: { hasNextPage: reviewThreadsHasNextPage }, nodes: reviewThreads },
          },
        },
      },
    }),
  },
  {
    match: "linear issue ORB-75 --attachments",
    stdout: JSON.stringify({
      ok: true,
      result: {
        issue: { identifier: "ORB-75", state: { name: "In Review" }, labels: [{ name: "visible-effect" }] },
        attachments: [{ title: "PR", url: "https://github.com/orbit/orbit/pull/75" }, ...attachments],
      },
    }),
  },
]

const reviewThread = ({
  author,
  authorType,
  findingCreatedAt = "2026-07-28T10:00:00Z",
  findingUpdatedAt = findingCreatedAt,
  followUps = [],
  id,
  isResolved,
  path = "reviewed.txt",
  reply,
  replyCreatedAt = "2026-07-28T10:00:02Z",
  resolvedBy,
  reviewedCommit,
}) => ({
  id,
  isResolved,
  path,
  resolvedBy: resolvedBy ? { login: resolvedBy } : null,
  comments: {
    pageInfo: { hasNextPage: false },
    nodes: [
      {
        id: `PRRC_${id}_finding`,
        author: { login: author, __typename: authorType },
        body: "review finding",
        createdAt: findingCreatedAt,
        updatedAt: findingUpdatedAt,
        pullRequestReview: reviewedCommit ? { id: `PRR_${id}`, commit: { oid: reviewedCommit } } : null,
      },
      ...(reply
        ? [{
            id: `PRRC_${id}_reply`,
            author: { login: resolvedBy, __typename: "User" },
            body: reply,
            createdAt: replyCreatedAt,
            updatedAt: replyCreatedAt,
            pullRequestReview: null,
          }]
        : []),
      ...followUps,
    ],
  },
})

const runWorkerStatusCase = (fixture, attachments, options = {}) => {
  const result = run(
    "worker-status.mjs",
    ["--worktree", fixture.worktree, "--issue", "ORB-75", ...(options.verifyReview ? ["--verify-review"] : []), "--json"],
    {
      env: {
        ...orcaEnv(
          workerStatusPlan(attachments, {
            approvalHead: options.approvalHead,
            isDraft: options.isDraft,
            comments: options.comments,
            commentsHasNextPage: options.commentsHasNextPage,
            prHead: options.prHead ?? fixture.prHead,
            reviewDecision: options.reviewDecision,
            reviews: options.reviews,
            reviewsHasNextPage: options.reviewsHasNextPage,
            reviewThreads: options.reviewThreads,
            reviewThreadsHasNextPage: options.reviewThreadsHasNextPage,
          }),
        ),
        ...(options.log ? { ORBIT_ORCA_LOG: options.log } : {}),
      },
    },
  )
  try {
    return { ...result, verdict: JSON.parse(result.stdout) }
  } catch {
    return { ...result, verdict: null }
  }
}

const teardownWorktreeRecord = (fixture) => ({
  path: fixture.child,
  isMainWorktree: false,
  isArchived: false,
  linkedLinearIssue: "ORB-124",
  branch: `refs/heads/${fixture.branch}`,
  baseRef: "main",
})

const mergedPullRequest = (fixture, number = 124) => ({ number, mergedAt: "2026-07-28T12:00:00Z", mergeCommit: { oid: fixture.mergeCommit }, headRefOid: fixture.headCommit })
const missingTargetPullRequest = (fixture) => ({ ...mergedPullRequest(fixture), mergeCommit: { oid: fixture.headCommit } })

const teardownPlan = (fixture, { state = "Done", terminals = [], pullRequest = mergedPullRequest(fixture), pullRequestOutput = JSON.stringify(pullRequest ? [pullRequest] : []), pullRequestExit = 0, removePath, removal = JSON.stringify({ ok: true, result: {} }), removalExit = 0 } = {}) => [
  { match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [teardownWorktreeRecord(fixture)] } }) },
  { match: "terminal list", stdout: JSON.stringify({ ok: true, result: { terminals } }) },
  { match: "linear issue ORB-124", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-124", state: { name: state } } } }) },
  { match: "pr list --head feature/orb-124-teardown --base main --state merged --limit 1 --json number,mergeCommit,headRefOid,mergedAt", stdout: pullRequestOutput, exit: pullRequestExit },
  { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
  { match: "worktree rm", stdout: removal, exit: removalExit, ...(removePath ? { removePath } : {}) },
]

const legacyTeardownWorktreeCases = () => {
  check("teardown-worktree.mjs", "refuses no selector", [], { status: 2, stderr: /provide exactly one selector/ })
  check("teardown-worktree.mjs", "refuses both selectors", ["--issue", "ORB-124", "--worktree", "path:C:/other"], { status: 2, stderr: /provide exactly one selector/ })
  check("teardown-worktree.mjs", "refuses a malformed Linear issue selector", ["--issue", "orb-124"], { status: 2, stderr: /--issue must be a Linear identifier/ })
  check("teardown-worktree.mjs", "refuses a valueless issue selector", ["--issue"], { status: 2, stderr: /selector flags require a value/ })
  check("teardown-worktree.mjs", "refuses a valueless worktree selector", ["--worktree"], { status: 2, stderr: /selector flags require a value/ })
  check("teardown-worktree.mjs", "refuses a valueless base", ["--issue", "ORB-124", "--base"], { status: 2, stderr: /selector flags require a value/ })
  check(
    "teardown-worktree.mjs",
    "refuses an issue with no active worktree",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /no active Orca worktree is linked to ORB-124/ },
    { env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [] } }) }]) },
  )

  const allGood = stageTeardownWorktree("all-good")
  if (!allGood) {
    T("teardown-worktree.mjs: real git fixture is available", false, "could not create a linked Git worktree")
    return
  }
  const primaryRefusal = stageTeardownWorktree("primary-refusal")
  const primaryRecord = { ...teardownWorktreeRecord(primaryRefusal), path: primaryRefusal.primary, isMainWorktree: true }
  check(
    "teardown-worktree.mjs",
    "refuses a primary checkout",
    ["--worktree", `path:${primaryRefusal.primary}`],
    { status: 1, stderr: /refusing to remove a primary checkout/ },
    { env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [primaryRecord] } }) }]) },
  )

  const unlinkedRefusal = stageTeardownWorktree("unlinked-refusal")
  const unlinkedRecord = { ...teardownWorktreeRecord(unlinkedRefusal), linkedLinearIssue: null }
  check(
    "teardown-worktree.mjs",
    "refuses a worktree without a linked Linear issue",
    ["--worktree", `path:${unlinkedRefusal.child}`],
    { status: 1, stderr: /refusing a worktree without a linked Linear issue/ },
    { env: orcaEnv([{ match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [unlinkedRecord] } }) }]) },
  )
  const unavailable = check(
    "teardown-worktree.mjs",
    "runtime_unavailable is success when filesystem and git verification prove removal",
    ["--issue", "ORB-124"],
    { status: 0, stdout: /REMOVED worktree[\s\S]*REMOVED terminals[\s\S]*REMOVED local branch/ },
    {
      env: orcaEnv(
        teardownPlan(allGood, {
          removePath: allGood.child,
          removal: JSON.stringify({ ok: false, code: "runtime_unavailable", message: "connection closed" }),
          removalExit: 1,
        }),
      ),
    },
  )
  T("teardown-worktree.mjs: verified removal actually deleted the fixture", !existsSync(allGood.child), unavailable.stderr)

  const missingTerminalPath = stageTeardownWorktree("missing-terminal-path")
  check(
    "teardown-worktree.mjs",
    "ignores another fleet terminal without a worktree path",
    ["--issue", "ORB-124"],
    { status: 0, stdout: /REMOVED worktree/ },
    {
      env: orcaEnv([
        ...teardownPlan(missingTerminalPath, {
          terminals: [{ handle: "term_other_worktree", title: "other worktree" }, { handle: "term_target", worktreePath: missingTerminalPath.child, title: "target worktree" }],
          removePath: missingTerminalPath.child,
        }),
        { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1 } } }) },
      ]),
    },
  )

  const dirty = stageTeardownWorktree("dirty", { dirty: true })
  check("teardown-worktree.mjs", "a dirty tree is refused with its uncommitted path", ["--issue", "ORB-124"], { status: 1, stderr: /worktree-clean[\s\S]*dirty\.txt/ }, { env: orcaEnv(teardownPlan(dirty, { removePath: dirty.child })) })
  T("teardown-worktree.mjs: dirty refusal leaves the tree untouched", existsSync(dirty.child), "the dirty fixture was removed")

  const unmerged = stageTeardownWorktree("unmerged", { changed: true })
  check("teardown-worktree.mjs", "content absent from the target branch is refused", ["--issue", "ORB-124"], { status: 1, stderr: /merge-commit-in-target/ }, { env: orcaEnv(teardownPlan(unmerged, { pullRequest: missingTargetPullRequest(unmerged), removePath: unmerged.child })) })

  const missingTarget = stageTeardownWorktree("missing-target", { changed: true })
  check("teardown-worktree.mjs", "a merged pull request whose content is absent from the target names its missing merge commit", ["--issue", "ORB-124"], { status: 1, stderr: /UNMET merge-commit-in-target: pull request #124's merge commit .* is not an ancestor of origin\/main/ }, { env: orcaEnv(teardownPlan(missingTarget, { pullRequest: missingTargetPullRequest(missingTarget) })) })

  const unreadableMergeCommit = stageTeardownWorktree("unreadable-merge-commit")
  check("teardown-worktree.mjs", "an unreadable merge commit refuses with exit 3", ["--issue", "ORB-124"], { status: 3, stderr: /UNMET merge-commit-in-target: could not read pull request #124's merge commit/ }, { env: orcaEnv(teardownPlan(unreadableMergeCommit, { pullRequest: { ...mergedPullRequest(unreadableMergeCommit), mergeCommit: { oid: "0000000000000000000000000000000000000001" } } })) })

  const lookupFailure = stageTeardownWorktree("lookup-failure", { dirty: true })
  const lookupFailureLog = join(root, "teardown", "lookup-failure.log")
  check(
    "teardown-worktree.mjs",
    "a failed merged-commit lookup reports every independent refusal",
    ["--issue", "ORB-124"],
    { status: 3, stderr: /UNMET worktree-clean: uncommitted paths: (?:\?\? )?dirty\.txt[\s\S]*UNMET pull-request-merged: gh pr list for feature\/orb-124-teardown failed[\s\S]*UNMET linear-done: issue is In Review, expected Done[\s\S]*UNMET terminals-idle: worker is still working/ },
    {
      env: {
        ...orcaEnv([
          ...teardownPlan(lookupFailure, { state: "In Review", terminals: [{ handle: "term_busy", worktreePath: lookupFailure.child }], pullRequest: null, pullRequestExit: 1, removePath: lookupFailure.child }),
          { match: "terminal show", sequence: [JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1 } } }), JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 2 } } })] },
        ]),
        ORBIT_ORCA_LOG: lookupFailureLog,
      },
    },
  )

  const unexpectedPullRequestPayload = stageTeardownWorktree("unexpected-pull-request-payload")
  check("teardown-worktree.mjs", "a merged-commit lookup with a non-array payload refuses", ["--issue", "ORB-124"], { status: 3, stderr: /gh pr list for feature\/orb-124-teardown returned an unexpected payload/ }, { env: orcaEnv(teardownPlan(unexpectedPullRequestPayload, { pullRequestOutput: JSON.stringify({ number: 124 }) })) })

  const malformedPullRequestPayload = stageTeardownWorktree("malformed-pull-request-payload")
  check("teardown-worktree.mjs", "a merged-commit lookup with malformed JSON refuses", ["--issue", "ORB-124"], { status: 3, stderr: /gh pr list for feature\/orb-124-teardown returned unparseable output/ }, { env: orcaEnv(teardownPlan(malformedPullRequestPayload, { pullRequestOutput: "not-json" })) })

  const notMerged = stageTeardownWorktree("not-merged", { dirty: true })
  const notMergedLog = join(root, "teardown", "not-merged.log")
  check(
    "teardown-worktree.mjs",
    "an unmerged pull request reports every independent refusal",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /UNMET worktree-clean: uncommitted paths: (?:\?\? )?dirty\.txt[\s\S]*UNMET pull-request-merged: pull request for feature\/orb-124-teardown is not a merged pull request with merge and head commits[\s\S]*UNMET linear-done: issue is In Review, expected Done[\s\S]*UNMET terminals-idle: worker is still working/ },
    {
      env: {
        ...orcaEnv([
          ...teardownPlan(notMerged, { state: "In Review", terminals: [{ handle: "term_busy", worktreePath: notMerged.child }], pullRequest: null, removePath: notMerged.child }),
          { match: "terminal show", sequence: [JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1 } } }), JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 2 } } })] },
        ]),
        ORBIT_ORCA_LOG: notMergedLog,
      },
    },
  )

  const ownLocalMerged = stageTeardownWorktree("own-local-merged", { changed: true, fastForwardMerged: true })
  check("teardown-worktree.mjs", "a pull request merged from the worker's own local commit tears down", ["--issue", "ORB-124"], { status: 0, stdout: /REMOVED worktree/ }, { env: orcaEnv(teardownPlan(ownLocalMerged, { removePath: ownLocalMerged.child })) })

  const serverSideMerge = stageTeardownWorktree("server-side-merge", { changed: true, serverMerged: true })
  check("teardown-worktree.mjs", "a server-side merged commit absent from the local branch tears down", ["--issue", "ORB-124"], { status: 0, stdout: /REMOVED worktree/ }, { env: orcaEnv(teardownPlan(serverSideMerge, { removePath: serverSideMerge.child })) })

  const localFollowUp = stageTeardownWorktree("local-follow-up", { changed: true, serverMerged: true, localFollowUp: true })
  check("teardown-worktree.mjs", "a local follow-up after the merged pull request is refused without suggesting a forceful merge check", ["--issue", "ORB-124"], { status: 1, stderr: /UNMET local-tip-in-pull-request-head: local tip .* is not contained in pull request #124's head .*; local commits would be lost/ }, { env: orcaEnv(teardownPlan(localFollowUp)) })

  const mergedLocalFollowUp = stageTeardownWorktree("merged-local-follow-up", { changed: true, serverMerged: true, localFollowUp: true, localFollowUpMerged: true })
  check("teardown-worktree.mjs", "a local tip behind the forge pull request head tears down", ["--issue", "ORB-124"], { status: 0, stdout: /REMOVED worktree/ }, { env: orcaEnv(teardownPlan(mergedLocalFollowUp, { pullRequest: { ...mergedPullRequest(mergedLocalFollowUp), headRefOid: mergedLocalFollowUp.targetTip }, removePath: mergedLocalFollowUp.child })) })

  const notDone = stageTeardownWorktree("not-done")
  check("teardown-worktree.mjs", "a closed-looking but non-Done Linear issue is refused", ["--issue", "ORB-124"], { status: 1, stderr: /linear-done[\s\S]*In Review/ }, { env: orcaEnv(teardownPlan(notDone, { state: "In Review", removePath: notDone.child })) })

  const repainting = stageTeardownWorktree("repainting")
  const log = join(root, "teardown", "repainting.log")
  check(
    "teardown-worktree.mjs",
    "a repainting terminal is refused because the worker is still working",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /terminals-idle[\s\S]*worker is still working/ },
    {
      env: {
        ...orcaEnv([
          ...teardownPlan(repainting, { terminals: [{ handle: "term_busy", worktreePath: repainting.child }] }),
          { match: "terminal show", sequence: [JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1 } } }), JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 2 } } })] },
        ]),
        ORBIT_ORCA_LOG: log,
      },
    },
  )

  const survives = stageTeardownWorktree("survives")
  check("teardown-worktree.mjs", "an ok removal response is failure when the directory survives", ["--issue", "ORB-124"], { status: 1, stderr: /removal verification failed/ }, { env: orcaEnv(teardownPlan(survives)) })

  const selector = stageTeardownWorktree("selector", { changed: true, squashMerged: true })
  check("teardown-worktree.mjs", "a path selector accepts a squash-merged tree without ancestry", ["--worktree", `path:${selector.child}`], { status: 0 }, { env: orcaEnv(teardownPlan(selector, { removePath: selector.child })) })

  const siblingAdvanced = stageTeardownWorktree("sibling-advance", { changed: true, squashMerged: true, siblingTargetAdvance: true })
  check("teardown-worktree.mjs", "a squash-merged tree is present when the target advanced on unrelated paths", ["--issue", "ORB-124"], { status: 0, stdout: /REMOVED worktree/ }, { env: orcaEnv(teardownPlan(siblingAdvanced, { removePath: siblingAdvanced.child })) })

  const branchDeleteFails = stageTeardownWorktree("branch-delete-fails", { branchDeleteMode: "fail" })
  check(
    "teardown-worktree.mjs",
    "reports a branch deletion failure after removing the worktree",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /removed worktree but could not delete local branch feature\/orb-124-teardown/ },
    { env: orcaEnv(teardownPlan(branchDeleteFails, { removePath: branchDeleteFails.child })) },
  )

  const branchRemains = stageTeardownWorktree("branch-remains", { branchDeleteMode: "retain" })
  check(
    "teardown-worktree.mjs",
    "reports a branch that remains after deletion",
    ["--issue", "ORB-124"],
    { status: 1, stderr: /removed worktree but local branch feature\/orb-124-teardown still exists/ },
    { env: orcaEnv(teardownPlan(branchRemains, { removePath: branchRemains.child })) },
  )
}

const orcaWebPortCases = () => {
  const portFor = (name) => Number(run("orca-web-port.mjs", ["--derive", "--name", name]).stdout.trim())
  const names = Array.from({ length: 256 }, (_, index) => `generated-worktree-${index}`)
  const ports = names.map(portFor)
  check("orca-web-port.mjs", "rejects multiple operation flags", ["--setup", "--next-dev"], { status: 2, stderr: /alternatives/ })
  check("orca-web-port.mjs", "rejects --name without --derive", ["--name", "orphaned-name"], { status: 2, stderr: /requires --derive/ })
  check("orca-web-port.mjs", "requires a name for --derive", ["--derive"], { status: 2, stderr: /requires --name/ })
  T("orca-web-port.mjs: derives the same port for the same name", portFor("recreated-worktree") === portFor("recreated-worktree"))
  T("orca-web-port.mjs: keeps generated ports inside the guarded web window", ports.every((port) => Number.isInteger(port) && port >= 3100 && port < 4100 && port !== 5000 && port !== 5432))

  const fixture = join(root, "orca-web-port")
  const gitFixture = (argv, cwd = fixture) => spawnSync("git", argv, { cwd, encoding: "utf8" })
  mkdirSync(join(fixture, "apps", "web"), { recursive: true })
  gitFixture(["init", "--initial-branch=main"])
  gitFixture(["config", "user.email", "tools@example.test"])
  gitFixture(["config", "user.name", "Orbit tools gate"])
  writeFileSync(join(fixture, "README.md"), "fixture\n")
  gitFixture(["add", "README.md"])
  gitFixture(["commit", "-m", "fixture"])
  gitFixture(["worktree", "add", "-b", "feature/one", "one"])
  gitFixture(["worktree", "add", "-b", "feature/two", "two"])
  gitFixture(["worktree", "add", "-b", "feature/collision-one", "collision-worktree-29"])
  gitFixture(["worktree", "add", "-b", "feature/collision-two", "collision-worktree-32"])
  const first = join(fixture, "one")
  const second = join(fixture, "two")
  const collision = join(fixture, "collision-worktree-32")
  mkdirSync(join(first, "apps", "web"), { recursive: true })
  mkdirSync(join(second, "apps", "web"), { recursive: true })
  writeFileSync(join(first, "apps", "web", ".env.local"), "API_BASE=http://example.test\n")
  check("orca-web-port.mjs", "a linked worktree without setup refuses to guess", [], { status: 1, stderr: /no assigned port/ }, { cwd: first })
  check("orca-web-port.mjs", "setup assigns the first linked worktree", ["--setup"], { status: 0, stdout: /^3\d{3}/ }, { cwd: first })
  check("orca-web-port.mjs", "setup assigns a different linked worktree", ["--setup"], { status: 0, stdout: /^3\d{3}/ }, { cwd: second })
  const firstPort = Number(run("orca-web-port.mjs", [], { cwd: first }).stdout.trim())
  const secondPort = Number(run("orca-web-port.mjs", [], { cwd: second }).stdout.trim())
  T("orca-web-port.mjs: linked worktrees report their own distinct assignments", firstPort !== secondPort && firstPort >= 3100 && secondPort >= 3100)
  T("orca-web-port.mjs: setup does not clobber an existing local environment file", readFileSync(join(first, "apps", "web", ".env.local"), "utf8") === "API_BASE=http://example.test\n")
  check("orca-web-port.mjs", "refuses a deterministic port collision before persisting", ["--setup"], { status: 1, stderr: /collides with linked worktree collision-worktree-29/ }, { cwd: collision })
  T("orca-web-port.mjs: collision refusal leaves no marker behind", !existsSync(join(collision, ".orca", "web-port")))

  const primary = join(root, "orca-web-port-primary")
  mkdirSync(primary, { recursive: true })
  const gitPrimary = (argv) => spawnSync("git", argv, { cwd: primary, encoding: "utf8" })
  gitPrimary(["init", "--initial-branch=main"])
  check("orca-web-port.mjs", "the primary checkout keeps the default port", [], { status: 0, stdout: /^3000\s*$/ }, { cwd: primary })
  check("orca-web-port.mjs", "setup refuses the primary checkout", ["--setup"], { status: 1, stderr: /keeps the default web port/ }, { cwd: primary })
}

const captureSurfacesCases = () => {
  const fixture = join(root, "capture-surfaces-origin")
  const tools = join(fixture, "tools")
  mkdirSync(tools, { recursive: true })
  cpSync(join(TOOLS_DIR, "capture-surfaces.mjs"), join(tools, "capture-surfaces.mjs"))
  writeFileSync(
    join(tools, "orca-web-port.mjs"),
    `if (process.env.ORBIT_CAPTURE_FAIL === "1") { process.stderr.write("unassigned\\n"); process.exit(1) }\nprocess.stdout.write(process.env.ORBIT_CAPTURE_PORT ?? "3000")\n`,
  )
  const probe = stage(
    "capture-surfaces-origin/probe.mjs",
    `import { resolveBaseUrl } from "./tools/capture-surfaces.mjs"\nconsole.log(resolveBaseUrl(process.argv[2] === "none" ? null : process.argv[2]))\n`,
  )
  check("capture-surfaces.mjs", "uses the primary checkout default when no base URL is supplied", ["none"], { status: 0, stdout: /^http:\/\/localhost:3000\s*$/ }, { path: probe })
  check("capture-surfaces.mjs", "uses the linked worktree port when no base URL is supplied", ["none"], { status: 0, stdout: /^http:\/\/localhost:3286\s*$/ }, { path: probe, env: { ORBIT_CAPTURE_PORT: "3286" } })
  check("capture-surfaces.mjs", "keeps an explicit base URL over the assigned port", ["http://localhost:7777"], { status: 0, stdout: /^http:\/\/localhost:7777\s*$/ }, { path: probe, env: { ORBIT_CAPTURE_PORT: "3286" } })
  check("capture-surfaces.mjs", "refuses capture when a linked worktree has no assigned port", ["none"], { status: 1, stderr: /could not resolve this worktree's web port/ }, { path: probe, env: { ORBIT_CAPTURE_FAIL: "1" } })
}

// ORB-1 <- ORB-2 <- ORB-3 is a three-link chain, so ORB-1's reach is 2 only if
// the count is transitive. ORB-4 is unblocked but at the strike limit: it lands
// in wave 1, is excluded from `launchable` by design, and must still surface in
// `twoStrikes` (PR #613 review, D9).
const ISSUES_WAVE_STUB = [
  { match: "linear list-issues", stdout: JSON.stringify({ ok: true, result: { issues: [{ identifier: "ORB-1" }, { identifier: "ORB-2" }, { identifier: "ORB-3" }, { identifier: "ORB-99" }] } }) },
  { match: "linear issue ORB-1", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-1", title: "requested first", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [] } }) },
  { match: "linear issue ORB-2", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-2", title: "requested second", state: { name: "Todo", type: "unstarted" }, labels: [{ name: "attempts:2" }] }, relations: [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-99" } }] } }) },
  { match: "linear issue ORB-3", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-3", title: "out-of-set dependent", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-1" } }] } }) },
  { match: "linear issue ORB-99", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-99", title: "external blocker", state: { name: "In Progress", type: "started" }, labels: [] }, relations: [] } }) },
]

const orchestrateFlagCases = () => {
  const skillPath = join(REPO_ROOT, ".claude", "skills", "orchestrate", "SKILL.md")
  const skill = readFileSync(skillPath, "utf8")
  const scopeSection = skill.slice(skill.indexOf("## 0."), skill.indexOf("## 0a."))
  T(
    "orchestrate flags: --single accepts project scope without changing it",
    /`--single` is valid with every resolved scope/.test(scopeSection)
      && /does not change which tickets belong to it/.test(scopeSection),
    scopeSection,
  )
  T(
    "orchestrate flags: --only on a project is a usage error naming both flags",
    /`--only` on a project name is also a usage error/.test(scopeSection)
      && /`--only` requires one `ORB-N` identifier and `--single` serialises a project run/.test(scopeSection),
    scopeSection,
  )
  T(
    "orchestrate flags: --only ORB-N preserves the former one-ticket boundary",
    /With `--only`, reconcile and launch THAT TICKET[\s\S]*ONLY/.test(scopeSection),
    scopeSection,
  )
  T(
    "orchestrate flags: --only rejects two or more identifiers",
    /`--only` with an explicit set is a usage error/.test(scopeSection),
    scopeSection,
  )
  T(
    "orchestrate flags: --single accepts an explicit set and runs it serially",
    /including an explicit set/.test(scopeSection)
      && /effective[\s\S]*`maxParallelWorktrees` to 1/.test(scopeSection)
      && /Wait for each ticket to reach a terminal state before launching the next/.test(scopeSection),
    scopeSection,
  )
  T(
    "orchestrate flags: --single passes cap 1 to the shared launcher enforcement",
    /--max-parallel-worktrees 1` when the run has `--single`/.test(skill),
    skill,
  )

  const recordedMainSinglePlan = {
    identifiers: ["ORB-1"],
    launchable: ["ORB-1"],
  }
  const onlyResult = run(
    "wave-plan.mjs",
    ["--issues", "ORB-1", "--json"],
    { env: orcaEnv(ISSUES_WAVE_STUB) },
  )
  let onlyPlan = null
  try {
    const parsed = JSON.parse(onlyResult.stdout)
    onlyPlan = {
      identifiers: parsed.waves.flatMap((wave) => wave.issues.map((issue) => issue.identifier)),
      launchable: parsed.launchable,
    }
  } catch {
    onlyPlan = null
  }
  T(
    "orchestrate flags: --only ORB-N resolves the recorded former --single plan",
    onlyResult.status === 0
      && JSON.stringify(onlyPlan) === JSON.stringify(recordedMainSinglePlan),
    `exit ${onlyResult.status}; expected ${JSON.stringify(recordedMainSinglePlan)}; got ${JSON.stringify(onlyPlan)}\n     ${onlyResult.stderr}`,
  )

  const tracked = spawnSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
  const textFiles = tracked.status === 0
    ? tracked.stdout
      .split("\0")
      .filter((path) => /\.(md|mjs|json|ya?ml|txt)$/i.test(path))
      .filter((path) => path.replaceAll("\\", "/") !== `tools/${SELF}`)
      .filter((path) => existsSync(join(REPO_ROOT, path)))
    : []
  const oneTicketSingle = [
    /\/orchestrate\s+ORB-(?:N|\d+)\s+--single/,
    /one ticket.{0,80}`--single`/i,
    /`--single`.{0,80}(?:one-ticket scope|THAT TICKET ONLY)/i,
  ]
  const staleUses = []
  for (const relativePath of textFiles) {
    const contents = readFileSync(join(REPO_ROOT, relativePath), "utf8")
    if (oneTicketSingle.some((pattern) => pattern.test(contents))) staleUses.push(relativePath)
  }
  T(
    "orchestrate flags: tracked-doc guard reads files and finds no one-ticket-only --single use",
    textFiles.length > 0 && staleUses.length === 0,
    `scanned ${textFiles.length} tracked text files; stale uses: ${staleUses.join(", ") || "none"}`,
  )
}

const WAVE_STUB = [
  {
    match: "linear list-issues",
    stdout: JSON.stringify({ ok: true, result: { issues: [{ identifier: "ORB-1" }, { identifier: "ORB-2" }, { identifier: "ORB-3" }, { identifier: "ORB-4" }] } }),
  },
  {
    match: "linear issue ORB-1",
    stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-1", title: "first", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [] } }),
  },
  {
    match: "linear issue ORB-2",
    stdout: JSON.stringify({
      ok: true,
      result: { issue: { identifier: "ORB-2", title: "second", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-1" } }] },
    }),
  },
  {
    match: "linear issue ORB-3",
    stdout: JSON.stringify({
      ok: true,
      result: { issue: { identifier: "ORB-3", title: "third", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-2" } }] },
    }),
  },
  {
    match: "linear issue ORB-4",
    stdout: JSON.stringify({
      ok: true,
      result: { issue: { identifier: "ORB-4", title: "fourth", state: { name: "Todo", type: "unstarted" }, labels: [{ name: "attempts:2" }] }, relations: [] },
    }),
  },
]

const delayedWaveStub = () => {
  const issues = Array.from({ length: 100 }, (_, index) => ({ identifier: `ORB-${index + 1}` }))
  return [
    { match: "linear list-issues", stdout: JSON.stringify({ ok: true, result: { issues } }) },
    ...issues.map(({ identifier }, index) => ({
      match: `linear issue ${identifier} --relations`,
      delayMs: 40,
      stdout: JSON.stringify({ ok: true, result: { issue: { identifier, title: `ticket ${index + 1}`, state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [] } }),
    })),
  ]
}

const relationFetchConcurrency = (timingLog) => {
  const events = readFileSync(timingLog, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
  let active = 0
  let peak = 0
  for (const event of events) {
    active += event.event === "start" ? 1 : -1
    peak = Math.max(peak, active)
  }
  return { events, peak, active }
}

const composePromptCases = () => {
  const output = stage("prompts/orb-125.md", "")
  const comments = [
    { user: { name: "Later reviewer" }, createdAt: "2026-07-28T10:00:00.000Z", body: "Later comment" },
    { user: { name: "First reviewer" }, createdAt: "2026-07-27T10:00:00.000Z", body: "First comment with ```ts\nconst answer = 42\n```" },
  ]
  const issue = { identifier: "ORB-125", description: "# Ticket body\n\nKeep this verbatim.", comments }
  const result = check(
    "compose-prompt.mjs",
    "writes the body and chronological, attributed comments without changing fenced Markdown",
    ["--issue", "ORB-125", "--output", output],
    { status: 0, stdout: /orb-125\.md/ },
    { env: orcaEnv([{ match: "linear issue ORB-125", stdout: JSON.stringify({ ok: true, result: { issue } }) }]) },
  )
  const prompt = readFileSync(output, "utf8")
  T(
    "compose-prompt.mjs: comment order, attribution, and fences survive composition",
    result.status === 0 && prompt.indexOf("First reviewer - 2026-07-27T10:00:00.000Z") < prompt.indexOf("Later reviewer - 2026-07-28T10:00:00.000Z") && /```ts\nconst answer = 42\n```/.test(prompt),
    prompt,
  )
  const launcher = stageLaunchWorker("compose-prompt", INTERACTIVE_WORKER)
  check("launch-worker.mjs", "accepts a composed prompt file unchanged", ["--issue", "ORB-75", "--prompt-file", output, "--dry-run"], { status: 0 }, { path: launcher.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const noComments = stage("prompts/no-comments.md", "")
  check(
    "compose-prompt.mjs",
    "omits the comments heading when the issue has no comments",
    ["--issue", "ORB-126", "--output", noComments],
    { status: 0 },
    { env: orcaEnv([{ match: "linear issue ORB-126", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-126", description: "# Body", comments: [] } } }) }]) },
  )
  T("compose-prompt.mjs: zero comments add no empty heading", !/Comments on this issue/.test(readFileSync(noComments, "utf8")))
}

const calibrationDate = (daysAgo) => {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

const calibrationFingerprint = (source) =>
  `sha256:${createHash("sha256").update(source.replaceAll("\r\n", "\n")).digest("hex")}`

const stageCalibration = (label, options = {}) => {
  const base = join(root, "calibration", label)
  const currentModel = options.currentModel ?? "gpt-current"
  const currentDefaultArgs = options.currentDefaultArgs ?? ["-c", 'model_reasoning_effort="high"']
  const stampedModel = options.stampedModel ?? "gpt-current"
  const agentSource = "---\nname: sample\n---\n"
  const skillSource = "---\nname: sample\n---\n"
  mkdirSync(join(base, "tools", "lib"), { recursive: true })
  mkdirSync(join(base, ".claude", "agents"), { recursive: true })
  mkdirSync(join(base, ".claude", "skills", "sample"), { recursive: true })
  cpSync(join(TOOLS_DIR, "check-calibration.mjs"), join(base, "tools", "check-calibration.mjs"))
  cpSync(
    join(TOOLS_DIR, "lib", "orchestrator-config.mjs"),
    join(base, "tools", "lib", "orchestrator-config.mjs"),
  )
  writeFileSync(join(base, ".claude", "agents", "sample.md"), agentSource)
  writeFileSync(join(base, ".claude", "skills", "sample", "SKILL.md"), skillSource)
  writeFileSync(
    join(base, ".claude", "orchestrator.json"),
    JSON.stringify({
      maxParallelWorktrees: 8,
      ...(options.orchestrator ?? {
        worker: "codex",
        workers: {
          codex: {
            args: [],
            models: {
              default: { model: currentModel, args: currentDefaultArgs },
              cheap: { model: "gpt-cheap" },
              deep: { model: "gpt-deep" },
            },
          },
        },
      }),
    }),
  )
  if (!options.missingArtifact) {
    const entries = options.entries ?? [
      { file: ".claude/agents/sample.md", verdict: "kept", reason: "The bounded role still fits." },
      { file: ".claude/skills/sample/SKILL.md", verdict: "kept", reason: "The bounded procedure still fits." },
    ]
    const artifact = options.artifact ?? {
      model: stampedModel,
      invocation: options.stampedInvocation ?? [
        ...currentDefaultArgs,
        "--model",
        stampedModel,
      ],
      date: options.date ?? calibrationDate(0),
      entries: entries.map((entry) => ({
        fingerprint: calibrationFingerprint(
          entry.file === ".claude/agents/sample.md"
            ? agentSource
            : entry.file === ".claude/skills/sample/SKILL.md"
              ? skillSource
              : "",
        ),
        ...entry,
      })),
    }
    writeFileSync(
      join(base, ".claude", "calibration.json"),
      options.malformed ? "{ nope" : `${JSON.stringify(artifact, null, 2)}\n`,
    )
  }
  return join(base, "tools", "check-calibration.mjs")
}

const calibrationCases = () => {
  const valid = stageCalibration("valid")
  check("check-calibration.mjs", "accepts total coverage", [], { status: 0, stdout: /PASS: 2\/2/ }, { path: valid })

  const missing = stageCalibration("missing-entry", {
    entries: [{ file: ".claude/skills/sample/SKILL.md", verdict: "kept", reason: "Still fits." }],
  })
  check("check-calibration.mjs", "names an uncovered agent", [], { status: 1, stdout: /missing entry: \.claude\/agents\/sample\.md/ }, { path: missing })

  const staleEntry = stageCalibration("stale-entry", {
    entries: [
      { file: ".claude/agents/sample.md", verdict: "kept", reason: "Still fits." },
      { file: ".claude/skills/sample/SKILL.md", verdict: "kept", reason: "Still fits." },
      { file: ".claude/agents/removed.md", verdict: "kept", reason: "No longer exists." },
    ],
  })
  check("check-calibration.mjs", "rejects an entry with no input file", [], { status: 1, stdout: /entry has no input file: \.claude\/agents\/removed\.md/ }, { path: staleEntry })

  const mismatch = stageCalibration("model-mismatch", { stampedModel: "gpt-old" })
  check("check-calibration.mjs", "rejects a model mismatch", [], { status: 1, stdout: /model mismatch/ }, { path: mismatch })
  const invocationMismatch = stageCalibration("invocation-mismatch", {
    stampedInvocation: ["-c", 'model_reasoning_effort="medium"', "--model", "gpt-current"],
  })
  check(
    "check-calibration.mjs",
    "rejects a same-model default invocation change",
    [],
    { status: 1, stdout: /invocation mismatch/ },
    { path: invocationMismatch },
  )
  const contentDrift = stageCalibration("content-drift")
  const contentDriftRoot = dirname(dirname(contentDrift))
  const changedAgentSource = "---\nname: sample\neffort: low\n---\n"
  writeFileSync(join(contentDriftRoot, ".claude", "agents", "sample.md"), changedAgentSource)
  check(
    "check-calibration.mjs",
    "rejects same-path calibrated input drift",
    [],
    { status: 1, stdout: /content fingerprint mismatch: \.claude\/agents\/sample\.md/ },
    { path: contentDrift },
  )
  check(
    "check-calibration.mjs",
    "report-only neutralizes calibrated input drift",
    ["--report-only"],
    { status: 0, stdout: /report-only[\s\S]*content fingerprint mismatch: \.claude\/agents\/sample\.md/ },
    { path: contentDrift },
  )
  check(
    "check-calibration.mjs",
    "refresh stamps changed input content",
    ["--refresh"],
    { status: 0, stdout: /PASS/ },
    { path: contentDrift },
  )
  const contentRefreshedArtifact = JSON.parse(
    readFileSync(join(contentDriftRoot, ".claude", "calibration.json"), "utf8"),
  )
  T(
    "check-calibration.mjs: refresh wrote the changed input fingerprint",
    contentRefreshedArtifact.entries[0].fingerprint === calibrationFingerprint(changedAgentSource),
    JSON.stringify(contentRefreshedArtifact.entries[0]),
  )
  const refreshable = stageCalibration("refresh", { stampedModel: "gpt-old", date: calibrationDate(91) })
  check("check-calibration.mjs", "refresh stamps the selected invocation and current date", ["--refresh"], { status: 0, stdout: /PASS/ }, { path: refreshable })
  const refreshedArtifact = JSON.parse(readFileSync(join(dirname(dirname(refreshable)), ".claude", "calibration.json"), "utf8"))
  T(
    "check-calibration.mjs: refresh wrote the live header",
    refreshedArtifact.model === "gpt-current" &&
      refreshedArtifact.date === calibrationDate(0) &&
      JSON.stringify(refreshedArtifact.invocation) ===
        JSON.stringify(["-c", 'model_reasoning_effort="high"', "--model", "gpt-current"]),
    JSON.stringify(refreshedArtifact),
  )

  const tooOld = stageCalibration("too-old", { date: calibrationDate(91) })
  check("check-calibration.mjs", "rejects a 91-day-old stamp", [], { status: 1, stdout: /91 days old/ }, { path: tooOld })

  const recent = stageCalibration("recent", { date: calibrationDate(89) })
  check("check-calibration.mjs", "accepts an 89-day-old stamp", [], { status: 0, stdout: /PASS/ }, { path: recent })

  const malformed = stageCalibration("malformed", { malformed: true })
  check("check-calibration.mjs", "malformed calibration is an operational error", [], { status: 2, stderr: /not valid JSON/ }, { path: malformed })
  const absent = stageCalibration("absent", { missingArtifact: true })
  check("check-calibration.mjs", "missing calibration is an operational error", [], { status: 2, stderr: /could not be read/ }, { path: absent })
  const malformedFingerprint = stageCalibration("malformed-fingerprint", {
    entries: [
      {
        file: ".claude/agents/sample.md",
        verdict: "kept",
        reason: "Still fits.",
        fingerprint: "sha256:not-a-hash",
      },
      { file: ".claude/skills/sample/SKILL.md", verdict: "kept", reason: "Still fits." },
    ],
  })
  check(
    "check-calibration.mjs",
    "malformed input fingerprint is an operational error",
    [],
    { status: 2, stderr: /entries\[0\]\.fingerprint must be a sha256 fingerprint/ },
    { path: malformedFingerprint },
  )
  check(
    "check-calibration.mjs",
    "report-only neutralizes a malformed input fingerprint",
    ["--report-only"],
    { status: 0, stdout: /report-only[\s\S]*entries\[0\]\.fingerprint/ },
    { path: malformedFingerprint },
  )

  const missingWorker = stageCalibration("missing-worker", {
    orchestrator: { worker: "codex", workers: {} },
  })
  check(
    "check-calibration.mjs",
    "missing selected worker is an operational error",
    [],
    { status: 2, stderr: /worker engine "codex" is missing/ },
    { path: missingWorker },
  )
  check(
    "check-calibration.mjs",
    "report-only neutralizes a missing selected worker",
    ["--report-only"],
    { status: 0, stdout: /report-only[\s\S]*worker engine "codex" is missing/ },
    { path: missingWorker },
  )
  const invalidWorker = stageCalibration("invalid-worker", {
    orchestrator: { worker: "codex", workers: { codex: { args: [], models: {} } } },
  })
  check(
    "check-calibration.mjs",
    "invalid selected worker is an operational error",
    [],
    { status: 2, stderr: /invalid models\.default mapping/ },
    { path: invalidWorker },
  )
  check(
    "check-calibration.mjs",
    "report-only neutralizes an invalid selected worker",
    ["--report-only"],
    { status: 0, stdout: /report-only[\s\S]*invalid models\.default mapping/ },
    { path: invalidWorker },
  )

  for (const [label, path] of [
    ["missing entry", missing],
    ["stale entry", staleEntry],
    ["model mismatch", mismatch],
    ["invocation mismatch", invocationMismatch],
    ["old stamp", tooOld],
    ["malformed artifact", malformed],
    ["missing artifact", absent],
  ]) {
    check("check-calibration.mjs", `report-only neutralizes ${label}`, ["--report-only"], { status: 0, stdout: /report-only/ }, { path })
  }

  check(
    "check-calibration.mjs",
    "help names every flag and exit code",
    ["--help"],
    { status: 0, stdout: /--report-only[\s\S]*--refresh[\s\S]*--help[\s\S]*exit codes: 0[\s\S]*1 calibration failed[\s\S]*2 usage/ },
  )
}

// new-ticket.mjs shells out to check-ticket.mjs, which makes its OWN orca call,
// so both legs are stubbed in one plan: `linear create` for the creation and
// `linear issue` for the validation the wrapper exists to perform. The shim
// stands aside for a real file path, so the nested node invocation still runs
// the real check-ticket.
const VALID_TICKET_BODY = [
  "## Problem / why it matters",
  "The gate has no coverage for its own create and validate round trip.",
  "## Scope",
  "Add the coverage.",
  "## Out of scope",
  "Anything else.",
  "## Expected behaviour",
  "The round trip executes under CI.",
  "## Technical details",
  "Stub both orca legs.",
  "## Affected modules / files",
  "tools/test-tools.mjs",
  "## Acceptance criteria",
  "- the created identifier is the one validated",
  "- a defective ticket exits 1",
  "## Test scenarios",
  "- run the gate",
].join("\n\n")

const newTicketStub = (created, issue, options = {}) => [
  { match: "linear create", stdout: JSON.stringify(created), exit: options.createExit ?? 0 },
  { match: "linear issue", stdout: JSON.stringify({ ok: true, result: { issue, relations: [] } }) },
]
const CREATED_OK = { ok: true, result: { issue: { identifier: "ORB-99" } } }
const VALID_ISSUE = { identifier: "ORB-99", title: "Cover the create and validate round trip", description: VALID_TICKET_BODY, labels: [{ name: "repo:api" }, { name: "Improvement" }] }

const mergeSweepCliFlagCases = () => {
  const filenames = ["merge-sweep.sh", "merge-sweep-cov.sh"]
  const scanned = filenames
    .filter((filename) => existsSync(join(TOOLS_DIR, filename)))
    .map((filename) => ({ filename, source: readFileSync(join(TOOLS_DIR, filename), "utf8") }))
  T(
    "merge sweep CLI flag guard scans both real script filenames",
    scanned.length === filenames.length,
    `scanned ${scanned.length} files; missing: ${filenames.filter((filename) => !scanned.some((entry) => entry.filename === filename)).join(", ")}`,
  )
  for (const { filename, source } of scanned) {
    T(
      `${filename}: defaults to the configured Windows Orca executable while allowing an override`,
      source.includes('ORCA_BIN="${ORCA_BIN:-C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca}"') &&
        source.includes('"$ORCA_BIN" linear issue "$issue" --json'),
      "merge sweeps must use the configured Orca executable when ORCA_BIN is unset",
    )
    const ghApiInvocations = source
      .replace(/\\\r?\n/g, " ")
      .split(/\r?\n/)
      .filter((line) => /\bgh api\b/.test(line))
    const unsupported = ghApiInvocations.filter(
      (invocation) => /(?:^|\s)--slurp(?:[=\s]|$)/.test(invocation) && /(?:^|\s)--(?:jq|template)(?:[=\s]|$)/.test(invocation),
    )
    T(
      `${filename}: never combines --slurp with --jq or --template`,
      unsupported.length === 0,
      `unsupported gh api invocation:\n     ${unsupported.join("\n     ")}`,
    )
  }
  const adoptionHelpers = scanned.map(({ filename, source }) => ({
    filename,
    helper: source.match(/^adopt_routine_update\(\).*?^}\r?$/ms)?.[0] ?? "",
  }))
  T(
    "merge sweep routine-update helpers stay in lockstep",
    adoptionHelpers.length === filenames.length &&
      adoptionHelpers.every(({ helper }) => helper.length > 0) &&
      adoptionHelpers.every(({ helper }) => helper === adoptionHelpers[0].helper),
    adoptionHelpers.map(({ filename, helper }) => `${filename}: ${helper.length} bytes`).join("\n     "),
  )
  for (const name of ["ensure_issue_in_review", "linear_state", "commit_linear_reassertion"]) {
    const helpers = scanned.map(({ filename, source }) => ({
      filename,
      helper: source.match(new RegExp(`^${name}\\(\\).*?^}\\r?$`, "ms"))?.[0] ?? "",
    }))
    T(
      `merge sweep ${name} helper stays in lockstep`,
      helpers.length === filenames.length &&
        helpers.every(({ helper }) => helper.length > 0) &&
        helpers.every(({ helper }) => helper === helpers[0].helper),
      helpers.map(({ filename, helper }) => `${filename}: ${helper.length} bytes`).join("\n     "),
    )
  }
}

const mergeSweepCases = (file) => {
  const expectedHead = "1111111111111111111111111111111111111111"
  const changedHead = "2222222222222222222222222222222222222222"
  const reviewedThrough = "2026-07-28T00:00:00Z"
  const newerReviewTime = "2026-07-28T00:00:01Z"
  const coverageAware = file === "merge-sweep-cov.sh"
  for (const [label, args, stderr] of [
    ["requires a value for --issue", ["--issue"], /--issue requires <pr-number>=<ORB-N>/],
    ["rejects a malformed issue mapping", ["--issue", "615=150", "thomasluizon/orbit-ui-mobile", "615"], /issue mappings must be <pr-number>=<ORB-N>, got: 615=150/],
    ["rejects a non-numeric issue mapping PR", ["--issue", "not-615=ORB-150", "thomasluizon/orbit-ui-mobile", "615"], /issue mapping PR must be a number, got: not-615/],
    ["rejects a duplicate issue mapping", ["--issue", "615=ORB-150", "--issue", "615=ORB-151", "thomasluizon/orbit-ui-mobile", "615"], /duplicate issue mapping for PR 615/],
    ["requires an issue mapping for every swept PR", ["thomasluizon/orbit-ui-mobile", "615"], /issue mapping is required for PR 615/],
  ]) {
    check(file, label, args, { status: 2, stderr })
  }
  const reviewedArgs = ["--expected-head", `615=${expectedHead}`, "--reviewed-through", `615=${reviewedThrough}`, "--issue", "615=ORB-150", "thomasluizon/orbit-ui-mobile", "615"]
  const matchedLog = join(root, `${file}-matched.log`)
  const matched = run(file, reviewedArgs, {
    env: mergeSweepEnv({
      head: expectedHead,
      log: matchedLog,
      sonar: coverageAware ? "coverage-failure" : "success",
      state: coverageAware ? "BLOCKED" : "CLEAN",
    }),
  })
  const matchedMerges = mergeSweepCalls(matchedLog).filter(([group, command]) => group === "pr" && command === "merge")
  const matchedMerge = matchedMerges[0] ?? []
  const matchedHeadFlag = matchedMerge.indexOf("--match-head-commit")
  T(
    `${file}: matching expected head and clean review lookups merge`,
    matched.status === 0 &&
      /MERGED #615/.test(matched.stdout) &&
      matchedMerges.length === 1 &&
      matchedHeadFlag !== -1 &&
      matchedMerge[matchedHeadFlag + 1] === expectedHead &&
      (!coverageAware || matchedMerge.includes("--admin")),
    `exit ${matched.status}\n     stdout: ${matched.stdout.trim()}\n     stderr: ${matched.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(matchedLog))}`,
  )

  const linearCalls = (log) => mergeSweepCalls(log).filter(([group, ...argv]) => group === "orca" && argv[0] === "linear")
  T(
    `${file}: an In Review issue is freshly read without a rewrite`,
    linearCalls(matchedLog).filter(([, linear, command]) => linear === "linear" && command === "issue").length === 1 &&
      !linearCalls(matchedLog).some(([, linear, command, action]) => linear === "linear" && command === "status" && action === "set"),
    `calls: ${JSON.stringify(linearCalls(matchedLog))}`,
  )

  const regressedLog = join(root, `${file}-linear-regressed.log`)
  const regressed = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, linearState: "In Progress", log: regressedLog, sonar: coverageAware ? "coverage-failure" : "success", state: coverageAware ? "BLOCKED" : "CLEAN" }),
  })
  const regressedCalls = linearCalls(regressedLog)
  T(
    `${file}: a regressed issue is reasserted and recorded after merging`,
    regressed.status === 0 && /LINEAR-STATE-REASSERTED issue=ORB-150 observed=In Progress at=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/.test(regressed.stdout) &&
      regressedCalls.filter(([, linear, command]) => linear === "linear" && command === "issue").length === 3 &&
      regressedCalls.some(([, linear, command, action, issue, to, stateName]) => linear === "linear" && command === "status" && action === "set" && issue === "ORB-150" && to === "--to" && stateName === "In Review") &&
      mergeSweepCalls(regressedLog).some(([group, command]) => group === "pr" && command === "merge"),
    `exit ${regressed.status}\n     stdout: ${regressed.stdout.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(regressedLog))}`,
  )

  const skippedReassertion = (label, reassertState) => {
    const log = join(root, `${file}-${label}.log`)
    const result = run(file, reviewedArgs, {
      env: mergeSweepEnv({ head: expectedHead, linearState: "In Progress", linearReassertState: reassertState, log, sonar: coverageAware ? "coverage-failure" : "success", state: coverageAware ? "BLOCKED" : "CLEAN" }),
    })
    const calls = linearCalls(log)
    T(
      `${file}: a post-merge ${reassertState} state is left unchanged and recorded`,
      result.status === 0 && new RegExp(`LINEAR-STATE-REASSERT-SKIPPED issue=ORB-150 observed=${reassertState} at=\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ`).test(result.stdout) &&
        calls.filter(([, linear, command]) => linear === "linear" && command === "issue").length === 2 &&
        !calls.some(([, linear, command, action]) => linear === "linear" && command === "status" && action === "set"),
      `exit ${result.status}\n     stdout: ${result.stdout.trim()}\n     calls: ${JSON.stringify(calls)}`,
    )
  }
  skippedReassertion("Done-after-merge", "Done")
  skippedReassertion("unknown-after-merge", "Blocked")

  const postWriteDisagreementLog = join(root, `${file}-post-write-disagreement.log`)
  const postWriteDisagreement = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, linearState: "In Progress", linearReassertState: "In Progress", linearPostWriteState: "Done", log: postWriteDisagreementLog, sonar: coverageAware ? "coverage-failure" : "success", state: coverageAware ? "BLOCKED" : "CLEAN" }),
  })
  T(
    `${file}: a post-write state disagreement is left unchanged and recorded`,
    postWriteDisagreement.status === 0 && /LINEAR-STATE-REASSERT-POST-WRITE-SKIPPED issue=ORB-150 observed=Done pre-write=In Progress/.test(postWriteDisagreement.stdout) &&
      linearCalls(postWriteDisagreementLog).filter(([, linear, command, action]) => linear === "linear" && command === "status" && action === "set").length === 1,
    `exit ${postWriteDisagreement.status}\n     stdout: ${postWriteDisagreement.stdout.trim()}\n     calls: ${JSON.stringify(linearCalls(postWriteDisagreementLog))}`,
  )

  const linearRefusal = (label, envOptions, output) => {
    const log = join(root, `${file}-${label}.log`)
    const result = run(file, reviewedArgs, {
      env: mergeSweepEnv({ head: expectedHead, log, sonar: coverageAware ? "coverage-failure" : "success", state: coverageAware ? "BLOCKED" : "CLEAN", ...envOptions }),
    })
    const calls = mergeSweepCalls(log)
    T(
      `${file}: ${label} refuses the merge`,
      result.status === 0 && output.test(result.stdout) && !calls.some(([group, command]) => group === "pr" && command === "merge"),
      `exit ${result.status}\n     stdout: ${result.stdout.trim()}\n     calls: ${JSON.stringify(calls)}`,
    )
  }
  linearRefusal("a failing Linear lookup", { linearLookupFailure: true }, /LINEAR-STATE-REFUSED issue=ORB-150 reason=lookup-failed/)
  const reassertFailureLog = join(root, `${file}-failed-Linear-reassert.log`)
  const reassertFailure = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, linearReassertFailure: true, linearState: "In Progress", log: reassertFailureLog, sonar: coverageAware ? "coverage-failure" : "success", state: coverageAware ? "BLOCKED" : "CLEAN" }),
  })
  T(
    `${file}: a failed post-merge Linear reassert reports the failure`,
    reassertFailure.status === 4 && /POST-MERGE-LINEAR-STATE-REASSERT-FAILED issue=ORB-150 observed=In Progress at=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/.test(reassertFailure.stdout),
    `exit ${reassertFailure.status}\n     stdout: ${reassertFailure.stdout.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(reassertFailureLog))}`,
  )
  const reassertReadFailureLog = join(root, `${file}-failed-Linear-reassert-read.log`)
  const reassertReadFailure = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, linearReassertLookupFailure: true, linearState: "In Progress", log: reassertReadFailureLog, sonar: coverageAware ? "coverage-failure" : "success", state: coverageAware ? "BLOCKED" : "CLEAN" }),
  })
  T(
    `${file}: a failed post-merge Linear re-read reports the failure`,
    reassertReadFailure.status === 4 && /POST-MERGE-LINEAR-STATE-REASSERT-FAILED issue=ORB-150 observed=In Progress at=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/.test(reassertReadFailure.stdout) &&
      !linearCalls(reassertReadFailureLog).some(([, linear, command, action]) => linear === "linear" && command === "status" && action === "set"),
    `exit ${reassertReadFailure.status}\n     stdout: ${reassertReadFailure.stdout.trim()}\n     calls: ${JSON.stringify(linearCalls(reassertReadFailureLog))}`,
  )
  linearRefusal("an unknown Linear state", { linearState: "Done" }, /LINEAR-STATE-REFUSED issue=ORB-150 observed=Done reason=unknown-state/)

  const finalReadLog = join(root, `${file}-linear-final-read.log`)
  const finalRead = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, log: finalReadLog, sonar: coverageAware ? "coverage-failure" : "success", state: coverageAware ? "BLOCKED" : "CLEAN" }),
  })
  const finalReadCalls = mergeSweepCalls(finalReadLog)
  const issueReadIndex = finalReadCalls.findIndex(([group, linear, command]) => group === "orca" && linear === "linear" && command === "issue")
  const mergeIndex = finalReadCalls.findIndex(([group, command]) => group === "pr" && command === "merge")
  const lastReviewReadIndex = finalReadCalls.slice(0, mergeIndex).reduce(
    (last, [group, ...argv], index) => group === "api" && argv.some((value) => String(value).includes("/comments")) ? index : last,
    -1,
  )
  T(
    `${file}: Linear state is freshly read at the decision boundary rather than reused`,
    finalRead.status === 0 && lastReviewReadIndex !== -1 && issueReadIndex === lastReviewReadIndex + 1 && mergeIndex === issueReadIndex + 1,
    `calls: ${JSON.stringify(finalReadCalls)}`,
  )

  const changedLog = join(root, `${file}-changed.log`)
  const changed = run(file, reviewedArgs, {
    env: mergeSweepEnv({
      head: changedHead,
      log: changedLog,
      sonar: coverageAware ? "coverage-failure" : "success",
      state: coverageAware ? "BLOCKED" : "CLEAN",
    }),
  })
  const changedCalls = mergeSweepCalls(changedLog)
  const changedMerges = changedCalls.filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: changed head skips and names both SHAs`,
    changed.status === 0 &&
      /SKIP #615/.test(changed.stdout) &&
      changed.stdout.includes(expectedHead) &&
      changed.stdout.includes(changedHead) &&
      changedMerges.length === 0 &&
      (!coverageAware || !changedCalls.some((argv) => argv.includes("--admin"))),
    `exit ${changed.status}\n     stdout: ${changed.stdout.trim()}\n     stderr: ${changed.stderr.trim()}\n     calls: ${JSON.stringify(changedCalls)}`,
  )

  const mergeRaceLog = join(root, `${file}-merge-race.log`)
  const mergeRace = run(file, reviewedArgs, {
    env: mergeSweepEnv({
      changedHead,
      head: expectedHead,
      log: mergeRaceLog,
      moveAtMerge: true,
      sonar: coverageAware ? "coverage-failure" : "success",
      state: coverageAware ? "BLOCKED" : "CLEAN",
    }),
  })
  const mergeRaceCalls = mergeSweepCalls(mergeRaceLog)
  const mergeRaceMerges = mergeRaceCalls.filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: atomic merge refusal reports a last-moment head change`,
    mergeRace.status === 0 &&
      /SKIP #615 HEAD-MOVED/.test(mergeRace.stdout) &&
      mergeRace.stdout.includes(expectedHead) &&
      mergeRace.stdout.includes(changedHead) &&
      mergeRaceMerges.length === 1 &&
      (!coverageAware || mergeRaceMerges[0].includes("--admin")),
    `exit ${mergeRace.status}\n     stdout: ${mergeRace.stdout.trim()}\n     stderr: ${mergeRace.stderr.trim()}\n     calls: ${JSON.stringify(mergeRaceCalls)}`,
  )

  const regressedMergeRaceLog = join(root, `${file}-regressed-merge-race.log`)
  const regressedMergeRace = run(file, reviewedArgs, {
    env: mergeSweepEnv({ changedHead, head: expectedHead, linearState: "In Progress", log: regressedMergeRaceLog, moveAtMerge: true, sonar: coverageAware ? "coverage-failure" : "success", state: coverageAware ? "BLOCKED" : "CLEAN" }),
  })
  const regressedMergeRaceCalls = linearCalls(regressedMergeRaceLog)
  T(
    `${file}: a refused merge never rewrites a regressed Linear issue`,
    regressedMergeRace.status === 0 && /SKIP #615 HEAD-MOVED/.test(regressedMergeRace.stdout) &&
      !regressedMergeRaceCalls.some(([, linear, command, action]) => linear === "linear" && command === "status" && action === "set"),
    `exit ${regressedMergeRace.status}\n     stdout: ${regressedMergeRace.stdout.trim()}\n     calls: ${JSON.stringify(regressedMergeRaceCalls)}`,
  )

  const bareLog = join(root, `${file}-bare.log`)
  const bare = run(file, ["--reviewed-through", `615=${reviewedThrough}`, "--issue", "615=ORB-150", "thomasluizon/orbit-ui-mobile", "615"], {
    env: mergeSweepEnv({ head: changedHead, log: bareLog }),
  })
  const bareMerges = mergeSweepCalls(bareLog).filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: invocation without expected head still merges`,
    bare.status === 0 && /MERGED #615/.test(bare.stdout) && bareMerges.length === 1,
    `exit ${bare.status}\n     stdout: ${bare.stdout.trim()}\n     stderr: ${bare.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(bareLog))}`,
  )

  check(
    file,
    "help documents the Linear issue gate, exclusive cutoff, and residual post-merge window",
    ["--help"],
    { status: 0, stdout: /(?=[\s\S]*--reviewed-through)(?=[\s\S]*--issue must map every swept PR)(?=[\s\S]*LINEAR-STATE-REASSERTED)(?=[\s\S]*LINEAR-STATE-REASSERT-SKIPPED)(?=[\s\S]*LINEAR-STATE-REASSERT-POST-WRITE-SKIPPED)(?=[\s\S]*LINEAR-STATE-REFUSED)(?=[\s\S]*review-safety query runs before the fresh Linear decision-time read)(?=[\s\S]*failed post-merge Linear state read or reassert)(?=[\s\S]*POST-MERGE-LINEAR-STATE-REASSERT-FAILED)(?=[\s\S]*cutoff is exclusive: activity at or after that timestamp counts as new\.)(?=[\s\S]*Every status check, required or not, must reach a terminal successful conclusion before merge\.)(?=[\s\S]*residual response-to-merge race)(?=[\s\S]*undetectable sub-second residual)(?=[\s\S]*exits 4)/ },
  )

  const updatedHead = "3333333333333333333333333333333333333333"
  const baseTip = "4444444444444444444444444444444444444444"
  const baseAncestor = "5555555555555555555555555555555555555555"
  const routineParents = `${expectedHead}\n${baseTip}`
  const updateCase = (label, envOptions, expect) => {
    const log = join(root, `${file}-${label}.log`)
    const result = run(file, ["--reviewed-through", `615=${reviewedThrough}`, "--issue", "615=ORB-150", "thomasluizon/orbit-ui-mobile", "615"], {
      env: mergeSweepEnv({
        baseTip,
        head: expectedHead,
        log,
        sonar: coverageAware ? "coverage-failure" : "success",
        state: coverageAware ? "BLOCKED" : "CLEAN",
        updatedHead,
        updateParents: routineParents,
        ...envOptions,
      }),
    })
    const calls = mergeSweepCalls(log)
    const merges = calls.filter(([group, command]) => group === "pr" && command === "merge")
    T(
      `${file}: ${label}`,
      expect(result, calls, merges),
      `exit ${result.status}\n     stdout: ${result.stdout.trim()}\n     stderr: ${result.stderr.trim()}\n     calls: ${JSON.stringify(calls)}`,
    )
  }

  updateCase(
    "a routine update whose second parent equals the fresh base tip adopts",
    {},
    (result, calls, merges) =>
      result.status === 0 &&
      /MERGED #615/.test(result.stdout) &&
      calls.some(([group, command]) => group === "pr" && command === "update-branch") &&
      calls.some((argv) => argv.includes("headRefOid,baseRefName,headRefName")) &&
      !calls.some((argv) => argv.includes("headRefOid,baseRefOid")) &&
      calls.some((argv) => argv.some((value) => value.includes("/git/ref/heads/main"))) &&
      calls.findIndex(([group, command]) => group === "pr" && command === "update-branch") <
        calls.findIndex((argv) => argv.some((value) => value.includes("/git/ref/heads/main"))) &&
      calls.some((argv) => argv.some((value) => value.includes(`/commits/${updatedHead}`))) &&
      !calls.some((argv) => argv.some((value) => value.includes("/compare/"))) &&
      merges.length === 1 &&
      merges[0][merges[0].indexOf("--match-head-commit") + 1] === updatedHead,
  )
  updateCase(
    "a sibling race adopts when the update parent is an ancestor of the fresh base tip",
    { baseAncestor, updateParents: `${expectedHead}\n${baseAncestor}` },
    (result, calls, merges) =>
      result.status === 0 &&
      /MERGED #615/.test(result.stdout) &&
      calls.some((argv) => argv.some((value) => value.includes(`/compare/${baseAncestor}...${baseTip}`))) &&
      merges.length === 1 &&
      merges[0][merges[0].indexOf("--match-head-commit") + 1] === updatedHead,
  )
  updateCase(
    "a pushed commit with only the prior head as its parent is refused",
    { authenticUpdate: false, updateParents: expectedHead },
    (result, _calls, merges) =>
      result.status === 0 && result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) && merges.length === 0,
  )
  updateCase(
    "an externally pushed merge with routine parents is refused",
    { authenticUpdate: false },
    (result, calls, merges) =>
      result.status === 0 &&
      result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) &&
      calls.some((argv) => argv.some((value) => value.includes(`/git/commits/${updatedHead}`))) &&
      !calls.some((argv) => argv.some((value) => value.includes("/compare/"))) &&
      merges.length === 0,
  )
  updateCase(
    "a rewritten head without the prior expected commit is refused",
    { updateParents: `${baseTip}\n6666666666666666666666666666666666666666` },
    (result, _calls, merges) =>
      result.status === 0 && result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) && merges.length === 0,
  )
  updateCase(
    "a failing fresh base ref lookup refuses adoption",
    { baseRefLookupFailure: true },
    (result, calls, merges) =>
      result.status === 0 &&
      result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) &&
      calls.some((argv) => argv.some((value) => value.includes("/git/ref/heads/main"))) &&
      !calls.some((argv) => argv.some((value) => value.includes(`/commits/${updatedHead}`))) &&
      merges.length === 0,
  )
  updateCase(
    "an empty fresh base ref lookup refuses adoption",
    { baseTip: "" },
    (result, calls, merges) =>
      result.status === 0 &&
      result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) &&
      calls.some((argv) => argv.some((value) => value.includes("/git/ref/heads/main"))) &&
      !calls.some((argv) => argv.some((value) => value.includes(`/commits/${updatedHead}`))) &&
      merges.length === 0,
  )
  updateCase(
    "an empty commits lookup refuses adoption",
    { commitsLookupEmpty: true },
    (result, calls, merges) =>
      result.status === 0 &&
      result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) &&
      calls.some((argv) => argv.some((value) => value.includes(`/commits/${updatedHead}`))) &&
      merges.length === 0,
  )
  updateCase(
    "a failing commits lookup refuses adoption",
    { commitsLookupFailure: true },
    (result, calls, merges) =>
      result.status === 0 &&
      result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) &&
      calls.some((argv) => argv.some((value) => value.includes(`/commits/${updatedHead}`))) &&
      merges.length === 0,
  )
  updateCase(
    "a failing ancestry lookup refuses adoption",
    { baseAncestor, compareLookupFailure: true, updateParents: `${expectedHead}\n${baseAncestor}` },
    (result, calls, merges) =>
      result.status === 0 &&
      result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) &&
      calls.some((argv) => argv.some((value) => value.includes(`/compare/${baseAncestor}...${baseTip}`))) &&
      merges.length === 0,
  )
  const divergentBaseParent = "6666666666666666666666666666666666666666"
  updateCase(
    "a divergent ancestry result refuses adoption",
    { updateParents: `${expectedHead}\n${divergentBaseParent}` },
    (result, calls, merges) =>
      result.status === 0 &&
      result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) &&
      calls.some((argv) => argv.some((value) => value.includes(`/compare/${divergentBaseParent}...${baseTip}`))) &&
      merges.length === 0,
  )

  const recordedPr641Updates = [
    {
      actual: "2f61618d4363acad223162bf29d1664d62952852",
      base: "9556f1b5ecf4bc6212c8d4e9b58fc5147a503fef",
      expected: "a76e984548a6824f328998d194094d14710b93cf",
    },
    {
      actual: "1e1e0e8029ca0089d52f8f6e5faf909367bc3c5d",
      base: "c737f8e8f506f35371e4a5e6586d7f5054231e88",
      expected: "2f61618d4363acad223162bf29d1664d62952852",
    },
  ]
  for (const [index, fixture] of recordedPr641Updates.entries()) {
    updateCase(
      `recorded #641 update ${index + 1} adopts`,
      {
        baseTip: fixture.base,
        head: fixture.expected,
        updatedHead: fixture.actual,
        updateParents: `${fixture.expected}\n${fixture.base}`,
      },
      (result, _calls, merges) =>
        result.status === 0 &&
        /MERGED #615/.test(result.stdout) &&
        merges.length === 1 &&
        merges[0][merges[0].indexOf("--match-head-commit") + 1] === fixture.actual,
    )
  }
  updateCase(
    "a failing check on the adopted head skips without merging",
    { failNewHead: true },
    (result, _calls, merges) =>
      result.status === 0 &&
      (coverageAware ? /SKIP #615 FAILED\(non-sonar\)=\[new-head-gate\]/ : /SKIP #615[\s\S]*FAILED=new-head-gate/).test(result.stdout) &&
      merges.length === 0,
  )
  updateCase(
    "an unsettled current-head review check skips without merging",
    { reviewRunning: true },
    (result, _calls, merges) => result.status === 0 && /SKIP #615 \(timeout: checks on the current head never all concluded \(pending=review\)\)/.test(result.stdout) && merges.length === 0,
  )

  const reconciledLog = join(root, `${file}-reconciled-before-cutoff.log`)
  const reconciled = run(file, reviewedArgs, {
    env: mergeSweepEnv({
      commentTimes: "orchestrator\t2026-07-27T23:59:59Z",
      head: expectedHead,
      log: reconciledLog,
      sonar: coverageAware ? "coverage-failure" : "success",
      state: coverageAware ? "BLOCKED" : "CLEAN",
    }),
  })
  const reconciledMerges = mergeSweepCalls(reconciledLog).filter(([group, command]) => group === "pr" && command === "merge")
  T(`${file}: a reconciled reply before the refreshed cutoff merges`, reconciled.status === 0 && reconciledMerges.length === 1, reconciled.stderr || reconciled.stdout)

  const postMergeLog = join(root, `${file}-post-merge-activity.log`)
  const postMergeUrl = "https://example.test/conversation/late"
  const postMergeActivity = run(file, reviewedArgs, {
    env: mergeSweepEnv({
      head: expectedHead,
      log: postMergeLog,
      postMergeActivity: `late-reviewer\t${newerReviewTime}\t${postMergeUrl}`,
      sonar: coverageAware ? "coverage-failure" : "success",
      state: coverageAware ? "BLOCKED" : "CLEAN",
    }),
  })
  const postMergeMerges = mergeSweepCalls(postMergeLog).filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: activity in the residual merge window is reported after the merge`,
    postMergeActivity.status === 4 &&
      postMergeActivity.stdout.includes(`POST-MERGE-ACTIVITY #615 late-reviewer at ${newerReviewTime} ${postMergeUrl}`) &&
      postMergeMerges.length === 1,
    `exit ${postMergeActivity.status}\n     stdout: ${postMergeActivity.stdout.trim()}\n     stderr: ${postMergeActivity.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(postMergeLog))}`,
  )

  const postMergeFailure = (label, envOptions, outputPattern) => {
    const log = join(root, `${file}-${label}.log`)
    const result = run(file, reviewedArgs, {
      env: mergeSweepEnv({
        head: expectedHead,
        log,
        sonar: coverageAware ? "coverage-failure" : "success",
        state: coverageAware ? "BLOCKED" : "CLEAN",
        ...envOptions,
      }),
    })
    const merges = mergeSweepCalls(log).filter(([group, command]) => group === "pr" && command === "merge")
    T(
      `${file}: ${label}`,
      result.status === 4 && outputPattern.test(result.stdout) && merges.length === 1,
      `exit ${result.status}\n     stdout: ${result.stdout.trim()}\n     stderr: ${result.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(log))}`,
    )
  }

  postMergeFailure(
    "unresolved threads in the residual merge window are reported after the merge",
    { postMergeUnresolvedThreads: "2" },
    /POST-MERGE-UNRESOLVED-THREADS #615 count=2/,
  )
  postMergeFailure(
    "a review lookup failure after the merge is reported by source",
    { postMergeReviewsLookupFailure: true },
    /POST-MERGE-REVIEW-LOOKUP-FAILED #615 source=reviews/,
  )

  const stopAfterPostMergeFailureLog = join(root, `${file}-stop-after-post-merge-failure.log`)
  const stopAfterPostMergeFailure = run(
    file,
    [
      "--expected-head",
      `615=${expectedHead}`,
      "--expected-head",
      `616=${expectedHead}`,
      "--reviewed-through",
      `615=${reviewedThrough}`,
      "--reviewed-through",
      `616=${reviewedThrough}`,
      "--issue",
      "615=ORB-150",
      "--issue",
      "616=ORB-151",
      "thomasluizon/orbit-ui-mobile",
      "615",
      "616",
    ],
    {
      env: mergeSweepEnv({
        head: expectedHead,
        log: stopAfterPostMergeFailureLog,
        postMergeReviewsLookupFailure: true,
        sonar: coverageAware ? "coverage-failure" : "success",
        state: coverageAware ? "BLOCKED" : "CLEAN",
      }),
    },
  )
  const stopAfterPostMergeFailureCalls = mergeSweepCalls(stopAfterPostMergeFailureLog)
  const stopAfterPostMergeFailureMerges = stopAfterPostMergeFailureCalls.filter(
    ([group, command]) => group === "pr" && command === "merge",
  )
  T(
    `${file}: a post-merge review failure stops the multi-PR sweep`,
    stopAfterPostMergeFailure.status === 4 &&
      stopAfterPostMergeFailureMerges.length === 1 &&
      stopAfterPostMergeFailureMerges[0][2] === "615" &&
      !stopAfterPostMergeFailureCalls.some((argv) => argv.includes("616")),
    `exit ${stopAfterPostMergeFailure.status}\n     stdout: ${stopAfterPostMergeFailure.stdout.trim()}\n     stderr: ${stopAfterPostMergeFailure.stderr.trim()}\n     calls: ${JSON.stringify(stopAfterPostMergeFailureCalls)}`,
  )

  const reviewSkip = (label, envOptions, outputPattern) => {
    const log = join(root, `${file}-${label}.log`)
    const result = run(file, reviewedArgs, {
      env: mergeSweepEnv({
        head: expectedHead,
        log,
        sonar: coverageAware ? "coverage-failure" : "success",
        state: coverageAware ? "BLOCKED" : "CLEAN",
        ...envOptions,
      }),
    })
    const merges = mergeSweepCalls(log).filter(([group, command]) => group === "pr" && command === "merge")
    T(
      `${file}: ${label}`,
      result.status === 0 && outputPattern.test(result.stdout) && merges.length === 0,
      `exit ${result.status}\n     stdout: ${result.stdout.trim()}\n     stderr: ${result.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(log))}`,
    )
  }

  reviewSkip(
    "genuine third-party activity at the refreshed cutoff skips",
    { commentTimes: `third-party\t${reviewedThrough}` },
    new RegExp(`SKIP #615 NEW-REVIEW-SINCE ${reviewedThrough} by third-party at ${reviewedThrough}`),
  )

  reviewSkip("unresolved review threads skip without merging", { unresolvedThreads: "2" }, /SKIP #615 UNRESOLVED-THREADS=2/)
  reviewSkip("a newer review skips without merging", { reviewTimes: `reviewer\t${newerReviewTime}` }, new RegExp(`SKIP #615 NEW-REVIEW-SINCE ${reviewedThrough} by reviewer at ${newerReviewTime}`))
  reviewSkip(
    "an already-submitted COMMENTED review edited after the cutoff skips without merging",
    { reviewTimes: `commented-reviewer\t2026-07-27T22:00:00Z\ncommented-reviewer\t2026-07-27T22:00:00Z\ncommented-reviewer\t${newerReviewTime}` },
    new RegExp(`SKIP #615 NEW-REVIEW-SINCE ${reviewedThrough} by commented-reviewer at ${newerReviewTime}`),
  )
  reviewSkip(
    "pagination sees a newer review timestamp on page two",
    {
      reviewTimes: "page-one-reviewer\t2026-07-27T23:00:00Z",
      reviewsPageTwo: `page-two-reviewer\t${newerReviewTime}`,
    },
    new RegExp(`SKIP #615 NEW-REVIEW-SINCE ${reviewedThrough} by page-two-reviewer at ${newerReviewTime}`),
  )
  reviewSkip("a newer issue comment skips without merging", { commentTimes: `issue-commenter\t${newerReviewTime}` }, new RegExp(`SKIP #615 NEW-REVIEW-SINCE ${reviewedThrough} by issue-commenter at ${newerReviewTime}`))
  reviewSkip("review-thread lookup failure fails closed by name", { threadsLookupFailure: true }, /SKIP #615 REVIEW-LOOKUP-FAILED source=reviewThreads/)
  reviewSkip("reviews lookup failure fails closed by name", { reviewsLookupFailure: true }, /SKIP #615 REVIEW-LOOKUP-FAILED source=reviews/)
  reviewSkip("issue-comments lookup failure fails closed by name", { commentsLookupFailure: true }, /SKIP #615 REVIEW-LOOKUP-FAILED source=issue-comments/)

  const olderEditedReviewLog = join(root, `${file}-older-edited-commented-review.log`)
  const olderEditedReview = run(file, reviewedArgs, {
    env: mergeSweepEnv({
      head: expectedHead,
      log: olderEditedReviewLog,
      reviewTimes: "commented-reviewer\t2026-07-27T21:00:00Z\ncommented-reviewer\t2026-07-27T22:00:00Z\ncommented-reviewer\t2026-07-27T23:59:59Z",
      sonar: coverageAware ? "coverage-failure" : "success",
      state: coverageAware ? "BLOCKED" : "CLEAN",
    }),
  })
  const olderEditedReviewCalls = mergeSweepCalls(olderEditedReviewLog)
  const olderEditedReviewMerges = olderEditedReviewCalls.filter(([group, command]) => group === "pr" && command === "merge")
  const paginatedReviewLookup = olderEditedReviewCalls.find((argv) => argv[0] === "api" && argv[1] === "graphql" && argv.some((value) => value.includes("reviews(first:100")))
  T(
    `${file}: a COMMENTED review edited strictly before the cutoff still merges`,
    olderEditedReview.status === 0 &&
      olderEditedReviewMerges.length === 1 &&
      paginatedReviewLookup?.includes("--paginate") &&
      !paginatedReviewLookup.includes("--slurp"),
    `exit ${olderEditedReview.status}\n     stdout: ${olderEditedReview.stdout.trim()}\n     stderr: ${olderEditedReview.stderr.trim()}\n     calls: ${JSON.stringify(olderEditedReviewCalls)}`,
  )

  const inlineOutput = (author, timestamp) =>
    new RegExp(`SKIP #615 NEW-REVIEW-SINCE ${reviewedThrough} \\(inline comment by ${author} at ${timestamp}\\)`)

  reviewSkip(
    "a newer inline comment on a resolved thread skips without merging",
    { inlineItems: `inline-reviewer\t${newerReviewTime}\ninline-reviewer\t${newerReviewTime}` },
    inlineOutput("inline-reviewer", newerReviewTime),
  )

  const olderInlineLog = join(root, `${file}-older-inline-comment.log`)
  const olderInline = run(file, reviewedArgs, {
    env: mergeSweepEnv({
      head: expectedHead,
      inlineItems: "inline-reviewer\t2026-07-27T23:00:00Z\ninline-reviewer\t2026-07-27T23:30:00Z",
      log: olderInlineLog,
      sonar: coverageAware ? "coverage-failure" : "success",
      state: coverageAware ? "BLOCKED" : "CLEAN",
    }),
  })
  const olderInlineMerges = mergeSweepCalls(olderInlineLog).filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: an older inline comment still merges`,
    olderInline.status === 0 && /MERGED #615/.test(olderInline.stdout) && olderInlineMerges.length === 1,
    `exit ${olderInline.status}\n     stdout: ${olderInline.stdout.trim()}\n     stderr: ${olderInline.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(olderInlineLog))}`,
  )

  reviewSkip(
    "an inline comment edited after the cutoff skips by updated time",
    { inlineItems: `inline-editor\t2026-07-27T23:00:00Z\ninline-editor\t${newerReviewTime}` },
    inlineOutput("inline-editor", newerReviewTime),
  )
  reviewSkip("inline-comment lookup failure fails closed by name", { inlineLookupFailure: true }, /SKIP #615 REVIEW-LOOKUP-FAILED source=inline-comments/)
  reviewSkip(
    "pagination sees a newer inline comment on page two",
    {
      inlineItems: "page-one-reviewer\t2026-07-27T23:00:00Z\npage-one-reviewer\t2026-07-27T23:00:00Z",
      inlinePageTwo: `page-two-reviewer\t${newerReviewTime}\npage-two-reviewer\t${newerReviewTime}`,
    },
    inlineOutput("page-two-reviewer", newerReviewTime),
  )

  const olderBoundaryTime = "2026-07-27T23:59:59Z"
  const genericActivityOutput = (author, timestamp) =>
    new RegExp(`SKIP #615 NEW-REVIEW-SINCE ${reviewedThrough} by ${author} at ${timestamp}`)
  const activityBoundaries = [
    {
      author: "boundary-reviewer",
      envKey: "reviewTimes",
      items: (timestamp) => `boundary-reviewer\t${timestamp}`,
      label: "reviews",
      output: genericActivityOutput,
    },
    {
      author: "boundary-inline-reviewer",
      envKey: "inlineItems",
      items: (timestamp) => `boundary-inline-reviewer\t${timestamp}\nboundary-inline-reviewer\t${timestamp}`,
      label: "inline comments",
      output: inlineOutput,
    },
    {
      author: "boundary-conversation-reviewer",
      envKey: "commentTimes",
      items: (timestamp) => `boundary-conversation-reviewer\t${timestamp}\nboundary-conversation-reviewer\t${timestamp}`,
      label: "conversation comments",
      output: genericActivityOutput,
    },
  ]
  for (const boundary of activityBoundaries) {
    reviewSkip(
      `${boundary.label} exactly at reviewed-through skip without merging`,
      { [boundary.envKey]: boundary.items(reviewedThrough) },
      boundary.output(boundary.author, reviewedThrough),
    )
    reviewSkip(
      `${boundary.label} strictly after reviewed-through skip without merging`,
      { [boundary.envKey]: boundary.items(newerReviewTime) },
      boundary.output(boundary.author, newerReviewTime),
    )

    const beforeLog = join(root, `${file}-${boundary.label}-strictly-before.log`)
    const before = run(file, reviewedArgs, {
      env: mergeSweepEnv({
        [boundary.envKey]: boundary.items(olderBoundaryTime),
        head: expectedHead,
        log: beforeLog,
        sonar: coverageAware ? "coverage-failure" : "success",
        state: coverageAware ? "BLOCKED" : "CLEAN",
      }),
    })
    const beforeMerges = mergeSweepCalls(beforeLog).filter(([group, command]) => group === "pr" && command === "merge")
    T(
      `${file}: ${boundary.label} strictly before reviewed-through still merge`,
      before.status === 0 && /MERGED #615/.test(before.stdout) && beforeMerges.length === 1,
      `exit ${before.status}\n     stdout: ${before.stdout.trim()}\n     stderr: ${before.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(beforeLog))}`,
    )
  }

  const missingCutoffLog = join(root, `${file}-missing-reviewed-through.log`)
  const missingCutoff = run(file, ["--expected-head", `615=${expectedHead}`, "--issue", "615=ORB-150", "thomasluizon/orbit-ui-mobile", "615"], {
    env: mergeSweepEnv({
      head: expectedHead,
      log: missingCutoffLog,
      sonar: coverageAware ? "coverage-failure" : "success",
      state: coverageAware ? "BLOCKED" : "CLEAN",
    }),
  })
  const missingCutoffMerges = mergeSweepCalls(missingCutoffLog).filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: a missing reviewed-through mapping fails closed`,
    missingCutoff.status === 0 && /SKIP #615 REVIEW-LOOKUP-FAILED source=reviewed-through/.test(missingCutoff.stdout) && missingCutoffMerges.length === 0,
    `exit ${missingCutoff.status}\n     stdout: ${missingCutoff.stdout.trim()}\n     stderr: ${missingCutoff.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(missingCutoffLog))}`,
  )
}

const CONTEXT_CLAUDE = [
  "# Orbit fixture",
  "",
].join("\n")
const CONTEXT_CORE = "# Core fixture\n\nAlways applies.\n"
const contextBytes = (body) => Buffer.byteLength(body, "utf8")
const contextGit = (repo, argumentsList) => {
  const result = spawnSync("git", argumentsList, { cwd: repo, encoding: "utf8" })
  if (result.status !== 0) throw new Error(`context budget git fixture failed: git ${argumentsList.join(" ")}\n${result.stderr}`)
}
const stageContextBudget = (label, options = {}) => {
  const parent = join(root, "context-budget", label)
  const repo = join(parent, "orbit-ui-mobile")
  const tools = join(repo, "tools")
  const rules = join(repo, ".claude", "rules")
  const claude = options.claude ?? CONTEXT_CLAUDE
  const core = options.core ?? CONTEXT_CORE
  mkdirSync(tools, { recursive: true })
  mkdirSync(rules, { recursive: true })
  cpSync(join(TOOLS_DIR, "check-context-budget.mjs"), join(tools, "check-context-budget.mjs"))
  writeFileSync(join(repo, "CLAUDE.md"), claude)
  writeFileSync(join(rules, "core.md"), core)
  for (const [file, body] of Object.entries(options.rules ?? {})) writeFileSync(join(rules, file), body)
  for (const [repoName, body] of Object.entries(options.siblings ?? {})) {
    const sibling = join(parent, repoName, "CLAUDE.md")
    mkdirSync(dirname(sibling), { recursive: true })
    writeFileSync(sibling, body)
  }
  const measuredFiles = {
    "CLAUDE.md": contextBytes(claude),
    ".claude/rules/core.md": contextBytes(core),
  }
  const baselineAdjustment = options.baselineAdjustment ?? 0
  const baseline = options.baseline ?? {
    bytes: Object.values(measuredFiles).reduce((sum, bytes) => sum + bytes, 0) + baselineAdjustment,
    files: {
      ...measuredFiles,
      "CLAUDE.md": measuredFiles["CLAUDE.md"] + baselineAdjustment,
    },
  }
  const baselinePath = join(tools, "context-budget.json")
  const baselineBody = typeof baseline === "string" ? baseline : `${JSON.stringify(baseline, null, 2)}\n`
  if (options.baselineOnBase !== false) writeFileSync(baselinePath, baselineBody)
  contextGit(repo, ["init", "-b", "main"])
  contextGit(repo, ["config", "user.email", "context-budget@example.test"])
  contextGit(repo, ["config", "user.name", "Context Budget Fixture"])
  const trackedPaths = [
    "CLAUDE.md",
    ".claude/rules/core.md",
    ...Object.keys(options.rules ?? {}).map((file) => `.claude/rules/${file}`),
    "tools/check-context-budget.mjs",
  ]
  if (options.baselineOnBase !== false) trackedPaths.push("tools/context-budget.json")
  contextGit(repo, ["add", "--", ...trackedPaths])
  contextGit(repo, ["commit", "-m", "Seed context budget fixture"])
  contextGit(repo, ["switch", "-c", "feature"])
  if (options.baselineOnBase === false) writeFileSync(baselinePath, baselineBody)
  return { path: join(tools, "check-context-budget.mjs"), repo, baselinePath, measuredFiles }
}

const contextBudgetCases = () => {
  const over = stageContextBudget("over", { baselineAdjustment: -1 })
  check("check-context-budget.mjs", "total over baseline exits 1 and names the offending file", ["--check"], { status: 1, stderr: /grew by 1 byte[\s\S]*CLAUDE\.md: \+1 byte/i }, { path: over.path, cwd: over.repo })

  const under = stageContextBudget("under", { baselineAdjustment: 1 })
  const underBaselineBefore = readFileSync(under.baselinePath, "utf8")
  const underResult = check("check-context-budget.mjs", "total under baseline exits 0", ["--check"], { status: 0 }, { path: under.path, cwd: under.repo })
  T(
    "check-context-budget.mjs: an under-budget check does not rewrite context-budget.json",
    underResult.status === 0 && readFileSync(under.baselinePath, "utf8") === underBaselineBefore,
    readFileSync(under.baselinePath, "utf8"),
  )

  const regenerated = stageContextBudget("regenerated")
  writeFileSync(join(regenerated.repo, "CLAUDE.md"), `${CONTEXT_CLAUDE}x`)
  check("check-context-budget.mjs", "a grown branch can regenerate its working baseline", ["--write-baseline"], { status: 0 }, { path: regenerated.path, cwd: regenerated.repo })
  check("check-context-budget.mjs", "a regenerated working baseline cannot hide growth from the target branch", ["--check"], { status: 1, stderr: /grew by 1 byte[\s\S]*CLAUDE\.md: \+1 byte/i }, { path: regenerated.path, cwd: regenerated.repo })

  const bootstrap = stageContextBudget("bootstrap", { baselineOnBase: false })
  check("check-context-budget.mjs", "a first-run baseline bootstraps only when absent from the target branch", ["--check"], { status: 0, stdout: /working tree bootstrap/ }, { path: bootstrap.path, cwd: bootstrap.repo })

  const unfetched = stageContextBudget("unfetched")
  check("check-context-budget.mjs", "an unfetched target branch fails closed", ["--check"], { status: 2, stderr: /target branch missing-base is unavailable.*fetch its history/i }, { path: unfetched.path, cwd: unfetched.repo, env: { CONTEXT_BUDGET_BASE_REF: "missing-base" } })

  const importAddition = stageContextBudget("import-addition", { claude: `${CONTEXT_CLAUDE}@../orbit-api/CLAUDE.md\n` })
  check("check-context-budget.mjs", "a removed sibling import fails even when its target is absent", ["--check"], { status: 1, stderr: /@..\/orbit-api\/CLAUDE\.md|import/i }, { path: importAddition.path, cwd: importAddition.repo })

  const unconditional = stageContextBudget("unconditional-rule", { rules: { "foo.md": "# Always loaded\n" } })
  check("check-context-budget.mjs", "a new unconditional rules file exits 1", ["--check"], { status: 1, stderr: /foo\.md/ }, { path: unconditional.path, cwd: unconditional.repo })

  const scoped = stageContextBudget("scoped-rule", { rules: { "foo.md": "---\npaths:\n  - apps/web/**\n---\n# Scoped\n" } })
  check("check-context-budget.mjs", "a rules file with paths frontmatter stays outside the budget", ["--check"], { status: 0 }, { path: scoped.path, cwd: scoped.repo })

  const siblingsAbsent = stageContextBudget("siblings-absent")
  const absentResult = check("check-context-budget.mjs", "missing sibling repos do not fail the check", ["--check"], { status: 0, stdout: /full.session/i }, { path: siblingsAbsent.path, cwd: siblingsAbsent.repo })
  T(
    "check-context-budget.mjs: missing sibling files are omitted from the printed full-session table",
    absentResult.status === 0 && !/(?:orbit-api|orbit-landing-page)\/CLAUDE\.md\s+\d/.test(absentResult.stdout.replaceAll("\\", "/")),
    absentResult.stdout,
  )

  const siblingsPresent = stageContextBudget("siblings-present", {
    siblings: {
      "orbit-api": "# API fixture\n",
      "orbit-landing-page": "# Landing fixture\n",
    },
  })
  const presentResult = check("check-context-budget.mjs", "present sibling files without imports do not change the enforced verdict", ["--check"], { status: 0 }, { path: siblingsPresent.path, cwd: siblingsPresent.repo })
  T(
    "check-context-budget.mjs: present sibling files without imports stay outside the printed full-session table",
    presentResult.status === 0 && !/(?:orbit-api|orbit-landing-page)\/CLAUDE\.md:\s+\d+ bytes/.test(presentResult.stdout.replaceAll("\\", "/")),
    presentResult.stdout,
  )

  const malformed = stageContextBudget("malformed", { baseline: "{not-json\n" })
  check("check-context-budget.mjs", "a malformed baseline is a tool error", ["--check"], { status: 2 }, { path: malformed.path, cwd: malformed.repo })

  const help = stageContextBudget("help")
  check(
    "check-context-budget.mjs",
    "help names every flag and every exit code",
    ["--help"],
    { status: 0, stdout: /(?=[\s\S]*--check)(?=[\s\S]*--write-baseline)(?=[\s\S]*--json)(?=[\s\S]*--help)(?=[\s\S]*-h)(?=[\s\S]*0)(?=[\s\S]*1)(?=[\s\S]*2)/ },
    { path: help.path, cwd: help.repo },
  )
}

const CODEX_QUOTA_RESPONSES = [
  JSON.stringify({ jsonrpc: "2.0", id: 1, result: { userAgent: "quota-test" } }),
  JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    result: {
      rateLimits: {
        primary: {
          usedPercent: 7,
          windowDurationMins: 300,
          resetsAt: 1784851200,
        },
        secondary: {
          usedPercent: 42,
          windowDurationMins: 10080,
          resetsAt: 1785456000,
        },
        credits: { hasCredits: false, balance: "0" },
        planType: "pro",
      },
    },
  }),
]
const CODEX_QUOTA_NULL_CREDITS_RESPONSES = [
  CODEX_QUOTA_RESPONSES[0],
  JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    result: {
      rateLimits: {
        primary: {
          usedPercent: 7,
          windowDurationMins: 300,
          resetsAt: 1784851200,
        },
        secondary: {
          usedPercent: 42,
          windowDurationMins: 10080,
          resetsAt: 1785456000,
        },
        credits: null,
        planType: "pro",
      },
    },
  }),
]
const CODEX_QUOTA_SHORT_ONLY_RESPONSES = [
  CODEX_QUOTA_RESPONSES[0],
  JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    result: {
      rateLimits: {
        primary: {
          usedPercent: 7,
          windowDurationMins: 300,
          resetsAt: 1784851200,
        },
        credits: { hasCredits: false, balance: "0" },
        planType: "pro",
      },
    },
  }),
]
const CODEX_APP_SERVER_DIR = join(root, "quota-codex")
stage(
  "quota-codex/app-server",
  `let buffer = ""
let responseIndex = 0
const responses = process.env.AI_QUOTA_TEST_CODEX_RESPONSES
  ? JSON.parse(process.env.AI_QUOTA_TEST_CODEX_RESPONSES)
  : ${JSON.stringify(CODEX_QUOTA_RESPONSES)}
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk) => {
  buffer += chunk
  const lines = buffer.split("\\n")
  buffer = lines.pop()
  for (const line of lines.filter(Boolean)) {
    const request = JSON.parse(line)
    if (responseIndex === 0 && (request.id !== 1 || request.method !== "initialize")) process.exit(5)
    if (responseIndex === 1 && (request.id !== 2 || request.method !== "account/rateLimits/read")) process.exit(6)
    process.stdout.write(responses[Math.min(responseIndex, responses.length - 1)] + "\\n")
    responseIndex += 1
  }
})
`,
)
const CODEX_COMSPEC_FIXTURE = stage(
  "quota-codex/comspec-fixture.mjs",
  `import { appendFileSync } from "node:fs"
appendFileSync(process.env.AI_QUOTA_TEST_COMSPEC_LOG, JSON.stringify(process.argv.slice(2)) + "\\n")
let buffer = ""
let responseIndex = 0
const responses = ${JSON.stringify(CODEX_QUOTA_RESPONSES)}
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk) => {
  buffer += chunk
  const lines = buffer.split("\\n")
  buffer = lines.pop()
  for (const line of lines.filter(Boolean)) {
    JSON.parse(line)
    process.stdout.write(responses[Math.min(responseIndex, responses.length - 1)] + "\\n")
    responseIndex += 1
  }
})
`,
)
const CODEX_TASKKILL_FIXTURE = stage(
  "quota-codex/taskkill-fixture.mjs",
  `import { appendFileSync } from "node:fs"
const argumentsList = process.argv.slice(2)
appendFileSync(process.env.AI_QUOTA_TEST_TASKKILL_LOG, JSON.stringify(argumentsList) + "\\n")
const pid = Number(argumentsList[argumentsList.indexOf("/PID") + 1])
if (Number.isSafeInteger(pid) && pid > 0) {
  try {
    process.kill(pid, "SIGTERM")
  } catch {}
}
`,
)
const ORCA_QUOTA_OK = [
  {
    match: "computer get-app-state",
    stdout: JSON.stringify({
      ok: true,
      result: { snapshot: { treeText: "1 window Orca\n41 button Usage" } },
    }),
  },
  {
    match: "computer click",
    stdout: JSON.stringify({
      ok: true,
      result: {
        snapshot: {
          treeText: "1 window Orca\n52 staticText Claude Resets in 5d 4h 5h 12% wk 34%",
        },
      },
    }),
  },
]
const aiQuotaEnv = (plan, codexBin = process.execPath) => ({
  ...orcaEnv(plan),
  CODEX_BIN: codexBin,
  AI_QUOTA_TIMEOUT_MS: "2000",
})

const aiQuotaCases = () => {
  check(
    "ai-quota.mjs",
    "returns both populated engines when both sources are reachable",
    ["--json"],
    {
      status: 0,
      stdout:
        /"claude":\s*\{[\s\S]*"status":\s*"OK"[\s\S]*"weeklyPercent":\s*34[\s\S]*"sessionPercent":\s*12[\s\S]*"codex":\s*\{[\s\S]*"status":\s*"OK"[\s\S]*"usedPercent":\s*42[\s\S]*"windowDays":\s*7[\s\S]*"hasCredits":\s*false[\s\S]*"planType":\s*"pro"/,
    },
    { cwd: CODEX_APP_SERVER_DIR, env: aiQuotaEnv(ORCA_QUOTA_OK) },
  )
  const defaultOrcaEnv = {
    ...aiQuotaEnv(ORCA_QUOTA_OK),
    AI_QUOTA_TEST_MODE: "1",
    AI_QUOTA_TEST_DEFAULT_ORCA: process.execPath,
  }
  delete defaultOrcaEnv.ORCA_BIN
  check(
    "ai-quota.mjs",
    "uses the configured Windows Orca executable when ORCA_BIN is unset",
    ["--json"],
    {
      status: 0,
      stdout:
        /"claude":\s*\{[\s\S]*"status":\s*"OK"[\s\S]*"weeklyPercent":\s*34[\s\S]*"codex":\s*\{[\s\S]*"status":\s*"OK"/,
    },
    { cwd: CODEX_APP_SERVER_DIR, env: defaultOrcaEnv },
  )
  check(
    "ai-quota.mjs",
    "keeps Codex when Orca is unavailable",
    ["--json"],
    { status: 0, stdout: /"claude":\s*\{[\s\S]*"status":\s*"UNAVAILABLE"[\s\S]*"codex":\s*\{[\s\S]*"status":\s*"OK"/ },
    {
      cwd: CODEX_APP_SERVER_DIR,
      env: aiQuotaEnv([
        {
          match: "computer get-app-state",
          stdout: JSON.stringify({ ok: false, error: { message: "Orca is not running" } }),
          exit: 1,
        },
      ]),
    },
  )
  check(
    "ai-quota.mjs",
    "selects Codex's seven-day secondary window instead of the five-hour primary",
    ["--json"],
    {
      status: 0,
      stdout:
        /"codex":\s*\{[\s\S]*"status":\s*"OK"[\s\S]*"usedPercent":\s*42[\s\S]*"windowDays":\s*7[\s\S]*"resetsAt":\s*1785456000/,
    },
    { cwd: CODEX_APP_SERVER_DIR, env: aiQuotaEnv(ORCA_QUOTA_OK) },
  )
  check(
    "ai-quota.mjs",
    "fails the Codex side closed when no authoritative seven-day window exists",
    ["--json"],
    {
      status: 0,
      stdout: /"claude":\s*\{[\s\S]*"status":\s*"OK"[\s\S]*"codex":\s*\{[\s\S]*"status":\s*"UNAVAILABLE"/,
    },
    {
      cwd: CODEX_APP_SERVER_DIR,
      env: {
        ...aiQuotaEnv(ORCA_QUOTA_OK),
        AI_QUOTA_TEST_CODEX_RESPONSES: JSON.stringify(CODEX_QUOTA_SHORT_ONLY_RESPONSES),
      },
    },
  )
  check(
    "ai-quota.mjs",
    "accepts a subscription-only Codex quota response with no credits balance",
    ["--json"],
    {
      status: 0,
      stdout: /"codex":\s*\{[\s\S]*"status":\s*"OK"[\s\S]*"usedPercent":\s*42[\s\S]*"windowDays":\s*7[\s\S]*"hasCredits":\s*null[\s\S]*"planType":\s*"pro"/,
    },
    {
      cwd: CODEX_APP_SERVER_DIR,
      env: {
        ...aiQuotaEnv([
          {
            match: "computer get-app-state",
            stdout: JSON.stringify({ ok: false, error: { message: "Orca is not running" } }),
            exit: 1,
          },
        ]),
        AI_QUOTA_TEST_CODEX_RESPONSES: JSON.stringify(CODEX_QUOTA_NULL_CREDITS_RESPONSES),
      },
    },
  )
  check(
    "ai-quota.mjs",
    "keeps Claude when codex app-server is unavailable",
    ["--json"],
    { status: 0, stdout: /"claude":\s*\{[\s\S]*"status":\s*"OK"[\s\S]*"codex":\s*\{[\s\S]*"status":\s*"UNAVAILABLE"/ },
    { env: aiQuotaEnv(ORCA_QUOTA_OK, join(root, "missing-codex")) },
  )
  check(
    "ai-quota.mjs",
    "returns both unavailable engines and a non-zero exit when neither source is reachable",
    ["--json"],
    { status: 1, stdout: /"claude":\s*\{[\s\S]*"status":\s*"UNAVAILABLE"[\s\S]*"codex":\s*\{[\s\S]*"status":\s*"UNAVAILABLE"/ },
    {
      env: aiQuotaEnv([
        {
          match: "computer get-app-state",
          stdout: JSON.stringify({ ok: false, error: { message: "Orca is not running" } }),
          exit: 1,
        },
      ], join(root, "missing-codex")),
    },
  )

  const indexLog = join(root, "ai-quota-indexes.jsonl")
  const retry = run("ai-quota.mjs", ["--json"], {
    env: {
      ...aiQuotaEnv([
        {
          match: "computer get-app-state",
          sequence: [
            JSON.stringify({ ok: true, result: { snapshot: { treeText: "1 window Orca\n41 button Usage" } } }),
            JSON.stringify({ ok: true, result: { snapshot: { treeText: "1 window Orca\n73 button Usage" } } }),
          ],
        },
        {
          match: "computer click",
          sequence: [
            JSON.stringify({ ok: true, result: { snapshot: { treeText: "1 window Orca\n10 staticText Loading" } } }),
            JSON.stringify({
              ok: true,
              result: {
                snapshot: {
                  treeText: "1 window Orca\n52 staticText Claude Resets in 5d 4h 5h 12% wk 34%",
                },
              },
            }),
          ],
        },
      ], join(root, "missing-codex")),
      ORBIT_ORCA_LOG: indexLog,
    },
  })
  const indexCalls = existsSync(indexLog) ? readFileSync(indexLog, "utf8") : ""
  T(
    "ai-quota.mjs: a retry locates Usage again and never reuses the stale element index",
    retry.status === 0 &&
      indexCalls.includes('"--element-index","41"') &&
      indexCalls.includes('"--element-index","73"'),
    `exit ${retry.status}\n     ${retry.stderr}\n     ${indexCalls}`,
  )

  const comSpecLog = join(root, "ai-quota-comspec.jsonl")
  const taskkillLog = join(root, "ai-quota-taskkill.jsonl")
  const windowsTreeEnv = {
    ...aiQuotaEnv(ORCA_QUOTA_OK),
    AI_QUOTA_TEST_MODE: "1",
    AI_QUOTA_TEST_PLATFORM: "win32",
    AI_QUOTA_TEST_COMSPEC: process.execPath,
    AI_QUOTA_TEST_COMSPEC_SCRIPT: CODEX_COMSPEC_FIXTURE,
    AI_QUOTA_TEST_COMSPEC_LOG: comSpecLog,
    AI_QUOTA_TEST_TASKKILL: process.execPath,
    AI_QUOTA_TEST_TASKKILL_SCRIPT: CODEX_TASKKILL_FIXTURE,
    AI_QUOTA_TEST_TASKKILL_LOG: taskkillLog,
  }
  delete windowsTreeEnv.CODEX_BIN
  const windowsTree = run("ai-quota.mjs", ["--json"], { env: windowsTreeEnv })
  const comSpecCalls = existsSync(comSpecLog) ? readFileSync(comSpecLog, "utf8") : ""
  const taskkillCalls = existsSync(taskkillLog) ? readFileSync(taskkillLog, "utf8") : ""
  T(
    "ai-quota.mjs: the Windows production spawn path terminates the whole app-server process tree",
    windowsTree.status === 0 &&
      /"codex":\s*\{[\s\S]*"status":\s*"OK"/.test(windowsTree.stdout) &&
      comSpecCalls.includes('["/d","/s","/c","codex app-server"]') &&
      /\["\/PID","\d+","\/T","\/F"\]/.test(taskkillCalls),
    `exit ${windowsTree.status}\n     stderr: ${windowsTree.stderr}\n     comspec: ${comSpecCalls}\n     taskkill: ${taskkillCalls}`,
  )
}

const budgetRecord = (identity, inputTokens, outputTokens, tier = "routine", engine = "claude", context = {}) =>
  JSON.stringify({
    identity,
    engine,
    tier,
    startedAt: "2030-01-02T09:00:00.000Z",
    endedAt: "2030-01-02T10:00:00.000Z",
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...context,
  })

const automationBudgetCases = () => {
  const resetAt = "2030-01-08T00:00:00Z"
  const checkArgs = (identity, ledger, invocationTokens = 100, extra = []) => [
    "check",
    "--engine",
    "claude",
    "--identity",
    identity,
    "--tier",
    "routine",
    "--reset-at",
    resetAt,
    "--warning-tokens",
    "800",
    "--budget-tokens",
    "1000",
    "--invocation-tokens",
    String(invocationTokens),
    "--ledger",
    ledger,
    ...extra,
  ]
  const recordArgs = (identity, ledger) => [
    "record",
    "--identity",
    identity,
    "--engine",
    "claude",
    "--tier",
    "routine",
    "--started-at",
    "2030-01-02T09:00:00Z",
    "--ended-at",
    "2030-01-02T10:00:00Z",
    "--input-tokens",
    "10",
    "--output-tokens",
    "5",
    "--ledger",
    ledger,
  ]
  const ledgerBelow = stage("budget/below-warning.jsonl", `${budgetRecord("fixture-below", 500, 199)}\n`)
  const ledgerWarning = stage("budget/at-warning.jsonl", `${budgetRecord("fixture-warning", 500, 200)}\n`)
  const ledgerBlock = stage("budget/cross-budget.jsonl", `${budgetRecord("fixture-block", 600, 301)}\n`)

  const belowWarning = run("automation-budget.mjs", checkArgs("next-below", ledgerBelow))
  T(
    "automation-budget.mjs: a token projection below the configured warning proceeds silently",
    belowWarning.status === 0 && belowWarning.stdout === "" && belowWarning.stderr === "",
    `exit ${belowWarning.status}\n     stdout: ${belowWarning.stdout}\n     stderr: ${belowWarning.stderr}`,
  )
  check(
    "automation-budget.mjs",
    "a token projection at the configured warning proceeds with the budget figures",
    checkArgs("next-warning", ledgerWarning),
    { status: 0, stderr: /warning[\s\S]*next-warning[\s\S]*800 tokens[\s\S]*warning 800 tokens[\s\S]*budget 1000 tokens[\s\S]*observed spend 700 tokens/ },
  )
  check(
    "automation-budget.mjs",
    "a launch that would cross the token budget is blocked with budget, spend, and invocation",
    checkArgs("next-blocked", ledgerBlock),
    { status: 4, stderr: /next-blocked[\s\S]*budget 1000 tokens[\s\S]*observed spend 901 tokens[\s\S]*reservation 100 tokens[\s\S]*projected spend 1001 tokens/ },
  )
  const exactBudget = run(
    "automation-budget.mjs",
    checkArgs("deep-exact", stage("budget/exact.jsonl", `${budgetRecord("prior-deep", 500, 250)}\n`), 250)
      .map((value) => value === "routine" ? "reserved" : value),
  )
  T(
    "automation-budget.mjs: an invocation may consume the exact remaining token budget",
    exactBudget.status === 0 && /warning[\s\S]*1000 tokens/.test(exactBudget.stderr),
    `exit ${exactBudget.status}\n     stdout: ${exactBudget.stdout}\n     stderr: ${exactBudget.stderr}`,
  )
  check(
    "automation-budget.mjs",
    "every invocation blocks when it exceeds the token budget",
    checkArgs("deep-over-budget", ledgerBlock, 250, ["--json"]).map((value) => value === "routine" ? "reserved" : value),
    { status: 4, stdout: /"status":"BLOCK"[\s\S]*"projectedTokens":1151/, stderr: /blocked:[\s\S]*projected spend 1151 tokens/ },
  )

  check(
    "automation-budget.mjs",
    "a malformed ledger is rejected instead of silently changing the fuse total",
    checkArgs("broken-check", stage("budget/broken.jsonl", "{nope}\n")),
    { status: 3, stderr: /ledger line 1 is not valid JSON/ },
  )

  const deadOwnerLedger = stage("budget/dead-lock-owner.jsonl", "")
  const deadOwnerLock = `${deadOwnerLedger}.lock`
  const deadOwnerProbe = spawnSync(
    process.execPath,
    ["-e", "process.stdout.write(String(process.pid))"],
    { encoding: "utf8" },
  )
  const deadOwnerPid = Number(deadOwnerProbe.stdout)
  writeFileSync(
    deadOwnerLock,
    `${JSON.stringify({ pid: deadOwnerPid, acquiredAt: new Date().toISOString() })}\n`,
  )
  const deadOwnerRecovery = run(
    "automation-budget.mjs",
    recordArgs("after-dead-lock", deadOwnerLedger),
  )
  T(
    "automation-budget.mjs: a lock whose owner PID is provably dead is reclaimed immediately",
    deadOwnerProbe.status === 0 &&
      Number.isSafeInteger(deadOwnerPid) &&
      deadOwnerRecovery.status === 0 &&
      !existsSync(deadOwnerLock),
    `probe exit ${deadOwnerProbe.status}, pid ${deadOwnerPid}\n     record exit ${deadOwnerRecovery.status}\n     ${deadOwnerRecovery.stderr}`,
  )

  const corruptLockLedger = stage("budget/stale-corrupt-lock.jsonl", "")
  const corruptLock = `${corruptLockLedger}.lock`
  writeFileSync(corruptLock, "{not-json\n")
  const staleLockTime = new Date(Date.now() - 10_000)
  utimesSync(corruptLock, staleLockTime, staleLockTime)
  const corruptLockRecovery = run(
    "automation-budget.mjs",
    recordArgs("after-corrupt-lock", corruptLockLedger),
  )
  T(
    "automation-budget.mjs: an old malformed lock marker is reclaimed",
    corruptLockRecovery.status === 0 && !existsSync(corruptLock),
    `record exit ${corruptLockRecovery.status}\n     ${corruptLockRecovery.stderr}`,
  )

  const liveOwnerLedger = stage("budget/live-lock-owner.jsonl", "")
  const liveOwnerLock = `${liveOwnerLedger}.lock`
  const liveOwnerMarker = `${JSON.stringify({
    pid: process.pid,
    acquiredAt: "2000-01-01T00:00:00.000Z",
  })}\n`
  writeFileSync(liveOwnerLock, liveOwnerMarker)
  utimesSync(liveOwnerLock, staleLockTime, staleLockTime)
  const liveOwnerRefusal = run(
    "automation-budget.mjs",
    recordArgs("blocked-by-live-lock", liveOwnerLedger),
    { env: { AUTOMATION_BUDGET_TEST_LOCK_TIMEOUT_MS: "100" } },
  )
  const liveOwnerPreserved =
    existsSync(liveOwnerLock) && readFileSync(liveOwnerLock, "utf8") === liveOwnerMarker
  rmSync(liveOwnerLock, { force: true })
  T(
    "automation-budget.mjs: an old lock owned by a live PID is never stolen",
    liveOwnerRefusal.status === 3 &&
      /timed out waiting for ledger lock/.test(liveOwnerRefusal.stderr) &&
      liveOwnerPreserved,
    `record exit ${liveOwnerRefusal.status}\n     preserved ${liveOwnerPreserved}\n     ${liveOwnerRefusal.stderr}`,
  )

  const contextOnlyLedger = stage(
    "budget/account-context.jsonl",
    `${budgetRecord("context-only", 1, 1, "routine", "claude", {
      accountContext: {
        scope: "account",
        attributed: false,
        usedPercent: 99,
        observedAt: "2030-01-02T10:00:00.000Z",
      },
    })}\n`,
  )
  check(
    "automation-budget.mjs",
    "account usedPercent is context and cannot affect the token fuse",
    checkArgs("context-next", contextOnlyLedger, 1, ["--json"]),
    { status: 0, stdout: /"status":"PROCEED"[\s\S]*"projectedTokens":3[\s\S]*"totalTokens":2/ },
  )

  const pendingLedger = stage("budget/pending.jsonl", `${budgetRecord("pending-invocation", undefined, undefined)}\n`)
  check(
    "automation-budget.mjs",
    "an absent token measurement fails closed instead of becoming zero",
    checkArgs("after-pending", pendingLedger),
    { status: 3, stderr: /after-pending[\s\S]*lack input or output tokens[\s\S]*pending-invocation/ },
  )
  check(
    "automation-budget.mjs",
    "an unmeasured record still fails closed for every invocation tier",
    checkArgs("reserved-after-pending", pendingLedger, 100, ["--json"])
      .map((value) => value === "routine" ? "reserved" : value),
    {
      status: 3,
      stderr: /lack input or output tokens[\s\S]*pending-invocation/,
    },
  )
  const correctedLedger = stage(
    "budget/corrected.jsonl",
    `${budgetRecord("corrected-invocation", undefined, undefined)}\n${budgetRecord("corrected-invocation", 300, 200)}\n`,
  )
  check(
    "automation-budget.mjs",
    "a later authoritative append for the same identity closes its pending measurement",
    checkArgs("after-correction", correctedLedger, 100, ["--json"]),
    { status: 0, stdout: /"projectedTokens":600[\s\S]*"totalTokens":500[\s\S]*"missingIdentities":\[\]/ },
  )

  const reportLedger = stage(
    "budget/report.jsonl",
    [
      budgetRecord("report-routine", 300, 200),
      budgetRecord("report-reserved", 100, 50, "reserved"),
      budgetRecord("report-pending", undefined, undefined),
      "",
    ].join("\n"),
  )
  check(
    "automation-budget.mjs",
    "report emits deterministic token totals and missing identities as JSON",
    ["report", "--engine", "claude", "--reset-at", resetAt, "--ledger", reportLedger, "--json"],
    {
      status: 0,
      stdout:
        /"engine":"claude","inputTokens":400,"outputTokens":250,"totalTokens":650,"routineTokens":500,"reservedTokens":150,"pendingTokens":0,"missingIdentities":\["report-pending"\],"windowStart":"2030-01-01T00:00:00.000Z","resetsAt":"2030-01-08T00:00:00.000Z"/,
    },
  )
  check(
    "automation-budget.mjs",
    "report renders deterministic token totals and missing identities as plain text",
    ["report", "--engine", "claude", "--reset-at", resetAt, "--ledger", reportLedger],
    {
      status: 0,
      stdout:
        /^claude: 650 tokens \(400 input, 250 output; 500 routine, 150 reserved\); missing identities: report-pending; resets at 2030-01-08T00:00:00.000Z\r?\n$/,
    },
  )

  const atomicLedger = join(root, "budget", "atomic-reservations.jsonl")
  const lockMarker = join(root, "budget", "atomic-lock-acquired")
  const lockRelease = join(root, "budget", "atomic-lock-release")
  const atomicRunner = stage(
    "budget/atomic-reservations.mjs",
    `import { spawn } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
const [tool, ledger, marker, release] = process.argv.slice(2)
const common = (identity) => [
  tool, "reserve", "--engine", "claude", "--identity", identity, "--tier", "routine",
  "--started-at", "2030-01-02T09:00:00.000Z", "--ended-at", "2030-01-02T10:00:00.000Z",
  "--reset-at", "2030-01-08T00:00:00Z", "--warning-tokens", "800",
  "--budget-tokens", "1000", "--invocation-tokens", "400", "--ledger", ledger,
]
const run = (identity, env = {}) => {
  const child = spawn(process.execPath, common(identity), {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk) => { stderr += chunk })
  return new Promise((resolve) => child.on("exit", (status) => resolve({ status, stderr })))
}
const first = run("atomic-a", {
  AUTOMATION_BUDGET_TEST_LOCK_MARKER: marker,
  AUTOMATION_BUDGET_TEST_LOCK_RELEASE: release,
})
const deadline = Date.now() + 5000
while (!existsSync(marker) && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 10))
}
if (!existsSync(marker)) process.exit(9)
const second = run("atomic-b")
await new Promise((resolve) => setTimeout(resolve, 100))
writeFileSync(release, "release\\n")
const results = await Promise.all([first, second])
process.stdout.write(JSON.stringify(results))
`,
  )
  const atomic = spawnSync(
    process.execPath,
    [atomicRunner, join(TOOLS_DIR, "automation-budget.mjs"), atomicLedger, lockMarker, lockRelease],
    { encoding: "utf8", timeout: 20_000 },
  )
  const atomicResults = atomic.status === 0 ? JSON.parse(atomic.stdout) : []
  const atomicRecords = existsSync(atomicLedger)
    ? readFileSync(atomicLedger, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : []
  T(
    "automation-budget.mjs: concurrent reservations proceed atomically below the budget",
    atomic.status === 0 &&
      atomicResults[0]?.status === 0 &&
      atomicResults[1]?.status === 0 &&
      !/lack input or output tokens/.test(atomicResults[1]?.stderr ?? "") &&
      atomicRecords.length === 2 &&
      new Set(atomicRecords.map((record) => record.identity)).size === 2 &&
      atomicRecords.every((record) => record.pending === true && record.reservedTokens === 400) &&
      !existsSync(`${atomicLedger}.lock`),
    `exit ${atomic.status}\n     stdout: ${atomic.stdout}\n     stderr: ${atomic.stderr}\n     ledger: ${JSON.stringify(atomicRecords)}`,
  )
  const cancelAtomic = run("automation-budget.mjs", [
    "cancel",
    "--identity",
    "atomic-a",
    "--engine",
    "claude",
    "--tier",
    "routine",
    "--started-at",
    "2030-01-02T09:00:00.000Z",
    "--ended-at",
    "2030-01-02T10:01:00.000Z",
    "--ledger",
    atomicLedger,
  ])
  const afterCancel = run("automation-budget.mjs", checkArgs("atomic-after-cancel", atomicLedger, 600, ["--json"]))
  T(
    "automation-budget.mjs: append-only cancellation releases a reservation that never started",
    cancelAtomic.status === 0 &&
      afterCancel.status === 0 &&
      /"projectedTokens":600[\s\S]*"missingIdentities":\[\]/.test(afterCancel.stdout),
    `cancel exit ${cancelAtomic.status}: ${cancelAtomic.stderr}\n     check exit ${afterCancel.status}: ${afterCancel.stderr}\n     ${afterCancel.stdout}`,
  )

  check(
    "automation-budget.mjs",
    "record appends authoritative tokens, provider cost, and explicit non-attributed account context",
    [
      "record",
      "--identity",
      "workflow:123",
      "--engine",
      "codex",
      "--tier",
      "routine",
      "--started-at",
      "2030-01-03T09:00:00Z",
      "--ended-at",
      "2030-01-03T09:05:00Z",
      "--input-tokens",
      "1200",
      "--output-tokens",
      "300",
      "--provider-estimated-cost",
      "1.25",
      "--account-used-percent",
      "88",
      "--account-observed-at",
      "2030-01-03T09:05:01Z",
      "--ledger",
      stage("budget/record.jsonl", ""),
      "--json",
    ],
    {
      status: 0,
      stdout:
        /"status":"RECORDED"[\s\S]*"identity":"workflow:123"[\s\S]*"inputTokens":1200[\s\S]*"outputTokens":300[\s\S]*"providerEstimatedCost":1.25[\s\S]*"accountContext":\{"scope":"account","attributed":false,"usedPercent":88,"observedAt":"2030-01-03T09:05:01.000Z"/,
    },
  )

  const concurrentLedger = join(root, "budget", "concurrent.jsonl")
  const concurrentRunner = stage(
    "budget/concurrent-records.mjs",
    `import { spawn } from "node:child_process"
const [tool, ledger] = process.argv.slice(2)
const base = ["--engine", "claude", "--tier", "routine", "--started-at", "2030-01-04T09:00:00Z", "--ended-at", "2030-01-04T09:01:00Z", "--input-tokens", "10", "--output-tokens", "5", "--ledger", ledger]
const run = (identity) => new Promise((resolve) => {
  const child = spawn(process.execPath, [tool, "record", "--identity", identity, ...base], { stdio: "inherit" })
  child.on("exit", (status) => resolve(status))
})
const statuses = await Promise.all([run("concurrent-a"), run("concurrent-b")])
process.exit(statuses.every((status) => status === 0) ? 0 : 1)
`,
  )
  const concurrent = spawnSync(process.execPath, [concurrentRunner, join(TOOLS_DIR, "automation-budget.mjs"), concurrentLedger], {
    encoding: "utf8",
    timeout: 10000,
  })
  const concurrentRecords = existsSync(concurrentLedger)
    ? readFileSync(concurrentLedger, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line))
    : []
  T(
    "automation-budget.mjs: two concurrent invocations append without losing a record",
    concurrent.status === 0 &&
      concurrentRecords.length === 2 &&
      new Set(concurrentRecords.map((record) => record.identity)).size === 2,
    `exit ${concurrent.status}\n     ${concurrent.stderr ?? ""}\n     ${JSON.stringify(concurrentRecords)}`,
  )
}

const mergeabilityCases = () => {
  const head = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const stale = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  const pullRequest = (overrides = {}) => ({
    number: 615,
    url: "https://github.com/orbit/ui/pull/615",
    title: "ORB-143 merge decision",
    body: "",
    headRefName: "feature/orb-143-mergeability",
    isDraft: false,
    mergeStateStatus: "CLEAN",
    headRefOid: head,
    labels: { pageInfo: { hasNextPage: false }, nodes: [] },
    reviews: {
      pageInfo: { hasNextPage: false },
      nodes: [
        { state: "APPROVED", author: { login: "claude" }, commit: { oid: head } },
        { state: "APPROVED", author: { login: "chatgpt-codex-connector" }, commit: { oid: head } },
      ],
    },
    comments: { pageInfo: { hasNextPage: false }, nodes: [] },
    reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
    commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS", contexts: { pageInfo: { hasNextPage: false }, nodes: [{ __typename: "CheckRun", name: "CI", status: "COMPLETED", conclusion: "SUCCESS" }] } } } }] },
    ...overrides,
  })
  const github = (first, final = first) => ({
    match: "query($owner:String!,$name:String!,$number:Int!)",
    sequence: [
      JSON.stringify({ data: { repository: { pullRequest: first } } }),
      JSON.stringify({ data: { repository: { pullRequest: final } } }),
    ],
  })
  const linear = (issue = { state: { name: "In Review" }, labels: [] }, final = issue) => ({
    match: "linear issue ORB-143",
    sequence: [JSON.stringify({ ok: true, result: { issue } }), JSON.stringify({ ok: true, result: { issue: final } })],
  })
  const runCase = (name, first, { final = first, issue, finalIssue, json = false, plan = [] } = {}) => {
    const log = stage(`mergeability-${name}.log`, "")
    const result = run("mergeability.mjs", ["--repo", "orbit/ui", "--pr", "615", ...(json ? ["--json"] : [])], {
      env: { ...orcaEnv([github(first, final), linear(issue, finalIssue), ...plan]), ORBIT_ORCA_LOG: log },
    })
    return { ...result, calls: readFileSync(log, "utf8").trim().split(/\r?\n/).filter(Boolean).map((entry) => JSON.parse(entry)) }
  }
  const mergeable = runCase("mergeable", pullRequest())
  T("mergeability.mjs: a complete current-head decision is MERGEABLE", mergeable.status === 0 && /^MERGEABLE\r?\n/.test(mergeable.stdout) && (mergeable.stdout.match(/^OK /gm) ?? []).length === 10, mergeable.stderr || mergeable.stdout)
  T("mergeability.mjs: only records the GitHub and Linear read verbs", mergeable.calls.length === 4 && mergeable.calls.every((call) => (/[\\/]api$/.test(call[0]) && call[1] === "graphql") || (/[\\/]linear$/.test(call[0]) && call[1] === "issue")), JSON.stringify(mergeable.calls))
  const machine = runCase("machine", pullRequest(), { json: true })
  T("mergeability.mjs: JSON output carries the consumable verdict and conditions", machine.status === 0 && JSON.parse(machine.stdout).verdict === "MERGEABLE" && JSON.parse(machine.stdout).conditions.length === 10, machine.stderr || machine.stdout)
  const draft = runCase("draft", pullRequest({ isDraft: true }))
  T("mergeability.mjs: a draft is HELD even when GitHub says CLEAN", draft.status === 1 && /^HELD\r?\n/.test(draft.stdout) && /HELD draft: pull request is a draft/.test(draft.stdout), draft.stderr || draft.stdout)
  const unresolved = runCase("unresolved", pullRequest({ reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [{ isResolved: false }] } }))
  T("mergeability.mjs: an unresolved review thread is HELD", unresolved.status === 1 && /HELD unresolved-review-threads: 1 unresolved thread/.test(unresolved.stdout), unresolved.stderr || unresolved.stdout)
  const staleSecond = runCase("stale-second", pullRequest({ reviews: { pageInfo: { hasNextPage: false }, nodes: [{ state: "APPROVED", author: { login: "claude" }, commit: { oid: head } }, { state: "APPROVED", author: { login: "chatgpt-codex-connector" }, commit: { oid: stale } }] } }))
  T("mergeability.mjs: a stale second-reviewer commit names it and the head", staleSecond.status === 1 && new RegExp(`HELD second-reviewer: .*${stale}.*${head}`).test(staleSecond.stdout), staleSecond.stderr || staleSecond.stdout)
  const commentVerdict = runCase("comment-verdict", pullRequest({ reviews: { pageInfo: { hasNextPage: false }, nodes: [{ state: "APPROVED", author: { login: "claude" }, commit: { oid: head } }] }, comments: { pageInfo: { hasNextPage: false }, nodes: [{ author: { login: "chatgpt-codex-connector" }, body: `### 💡 Codex Review\n**Reviewed commit:** \`${head.slice(0, 10)}\`` }] } }))
  T("mergeability.mjs: a current-head Codex conversation verdict satisfies the second review", commentVerdict.status === 0 && /OK second-reviewer: chatgpt-codex-connector reviewed head/.test(commentVerdict.stdout), commentVerdict.stderr || commentVerdict.stdout)
  const unlabelledHead = runCase("unlabelled-head", pullRequest({ reviews: { pageInfo: { hasNextPage: false }, nodes: [{ state: "APPROVED", author: { login: "claude" }, commit: { oid: head } }] }, comments: { pageInfo: { hasNextPage: false }, nodes: [{ author: { login: "chatgpt-codex-connector" }, body: `The current head is ${head}.` }] } }))
  T("mergeability.mjs: an unlabelled Codex comment naming the head is HELD", unlabelledHead.status === 1 && new RegExp(`HELD second-reviewer: .*no named commit.*${head}`).test(unlabelledHead.stdout), unlabelledHead.stderr || unlabelledHead.stdout)
  const staleCommentVerdict = runCase("stale-comment-verdict", pullRequest({ reviews: { pageInfo: { hasNextPage: false }, nodes: [{ state: "APPROVED", author: { login: "claude" }, commit: { oid: head } }] }, comments: { pageInfo: { hasNextPage: false }, nodes: [{ author: { login: "chatgpt-codex-connector" }, body: `### 💡 Codex Review\n**Reviewed commit:** \`${stale.slice(0, 10)}\`` }] } }))
  T("mergeability.mjs: a stale labelled Codex conversation verdict names it and the head", staleCommentVerdict.status === 1 && new RegExp(`HELD second-reviewer: .*${stale.slice(0, 10)}.*${head}`).test(staleCommentVerdict.stdout), staleCommentVerdict.stderr || staleCommentVerdict.stdout)
  const hexProse = runCase("hex-prose", pullRequest({ reviews: { pageInfo: { hasNextPage: false }, nodes: [{ state: "APPROVED", author: { login: "claude" }, commit: { oid: head } }] }, comments: { pageInfo: { hasNextPage: false }, nodes: [{ author: { login: "chatgpt-codex-connector" }, body: `Diff hunk: deadbeef\n+++ b/${head.slice(0, 10)}` }] } }))
  T("mergeability.mjs: hex-looking Codex comment prose is not a verdict", hexProse.status === 1 && new RegExp(`HELD second-reviewer: .*no named commit.*${head}`).test(hexProse.stdout), hexProse.stderr || hexProse.stdout)
  const wrongState = runCase("wrong-state", pullRequest(), { issue: { state: { name: "In Progress" }, labels: [] } })
  T("mergeability.mjs: a linked issue outside In Review is HELD", wrongState.status === 1 && /HELD linear-in-review: issue ORB-143 is In Progress, requires In Review/.test(wrongState.stdout), wrongState.stderr || wrongState.stdout)
  const nullState = runCase("null-state", pullRequest(), { issue: { state: null, labels: [] } })
  T("mergeability.mjs: a null Linear workflow state is HELD with a consumable verdict", nullState.status === 1 && /HELD linear-issue: Linear issue lookup returned no issue with a workflow state/.test(nullState.stdout), nullState.stderr || nullState.stdout)
  const strikes = runCase("strikes", pullRequest(), { issue: { state: { name: "In Review" }, labels: [{ name: "attempts:2" }] } })
  T("mergeability.mjs: attempts:2 is HELD", strikes.status === 1 && /HELD two-strikes: issue carries attempts:2/.test(strikes.stdout), strikes.stderr || strikes.stdout)
  const finalStrikes = runCase("final-strikes", pullRequest(), { finalIssue: { state: { name: "In Review" }, labels: [{ name: "attempts:2" }] } })
  T("mergeability.mjs: attempts:2 added before the final handoff is HELD", finalStrikes.status === 1 && /HELD linear-stability: issue ORB-143 is In Review with attempts:2 on final read/.test(finalStrikes.stdout), finalStrikes.stderr || finalStrikes.stdout)
  const missingLabels = runCase("missing-labels", pullRequest(), { issue: { state: { name: "In Review" } } })
  T("mergeability.mjs: missing Linear labels are HELD rather than treated as empty", missingLabels.status === 1 && /HELD two-strikes: Linear issue labels are unavailable/.test(missingLabels.stdout), missingLabels.stderr || missingLabels.stdout)
  const malformedLabels = runCase("malformed-labels", pullRequest(), { issue: { state: { name: "In Review" }, labels: {} }, json: true })
  T("mergeability.mjs: malformed Linear labels emit a machine-readable HELD verdict", malformedLabels.status === 1 && JSON.parse(malformedLabels.stdout).conditions.some((condition) => condition.name === "two-strikes" && !condition.ok && condition.detail === "Linear issue labels are unavailable"), malformedLabels.stderr || malformedLabels.stdout)
  const cancelled = runCase("cancelled-check", pullRequest({ commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS", contexts: { pageInfo: { hasNextPage: false }, nodes: [{ __typename: "CheckRun", name: "CI", status: "COMPLETED", conclusion: "CANCELLED" }] } } } }] } }))
  T("mergeability.mjs: a cancelled check is HELD", cancelled.status === 1 && /HELD check-rollup:/.test(cancelled.stdout), cancelled.stderr || cancelled.stdout)
  const movedHead = runCase("moved-head", pullRequest(), { final: pullRequest({ headRefOid: stale }) })
  T("mergeability.mjs: a moved head is HELD", movedHead.status === 1 && new RegExp(`HELD head-stability: head was ${head} and is ${stale}`).test(movedHead.stdout), movedHead.stderr || movedHead.stdout)
  const unrelatedBody = runCase("unrelated-body", pullRequest({ headRefName: "chore/merge-readiness", title: "Merge readiness SHA-256", body: "Sibling ORB-117 remains in review." }))
  T("mergeability.mjs: a body-only configured-team identifier is HELD", unrelatedBody.status === 1 && /HELD linear-issue: no configured-team Linear issue identifier appears in the branch or title/.test(unrelatedBody.stdout), unrelatedBody.stderr || unrelatedBody.stdout)
  const lowerCaseBranch = runCase("lowercase-branch", pullRequest({ title: "Merge readiness UTF-8", headRefName: "contact/orb-143-mergeability" }))
  T("mergeability.mjs: a lowercase configured-team branch identifier is accepted", lowerCaseBranch.status === 0 && /OK linear-in-review: issue ORB-143 is In Review/.test(lowerCaseBranch.stdout), lowerCaseBranch.stderr || lowerCaseBranch.stdout)
  const conflictingIdentifiers = runCase("conflicting-identifiers", pullRequest({ title: "ORB-144 merge decision" }))
  T("mergeability.mjs: conflicting configured-team branch and title identifiers are HELD", conflictingIdentifiers.status === 1 && /HELD linear-issue: configured-team Linear issue identifiers disagree: ORB-143, ORB-144/.test(conflictingIdentifiers.stdout), conflictingIdentifiers.stderr || conflictingIdentifiers.stdout)
  const errorLog = stage("mergeability-error.log", "")
  const forgeError = run("mergeability.mjs", ["--repo", "orbit/ui", "--pr", "615"], { env: { ...orcaEnv([{ match: "query($owner:String!,$name:String!,$number:Int!)", stdout: "forge offline", exit: 7 }]), ORBIT_ORCA_LOG: errorLog } })
  T("mergeability.mjs: an erroring forge lookup is HELD", forgeError.status === 1 && /HELD github-pull-request: GitHub pull-request lookup failed/.test(forgeError.stdout), forgeError.stderr || forgeError.stdout)
  const emptyLog = stage("mergeability-empty.log", "")
  const emptyIssue = run("mergeability.mjs", ["--repo", "orbit/ui", "--pr", "615"], { env: { ...orcaEnv([github(pullRequest()), { match: "linear issue ORB-143", stdout: JSON.stringify({ ok: true, result: {} }) }]), ORBIT_ORCA_LOG: emptyLog } })
  T("mergeability.mjs: an empty Linear result is HELD", emptyIssue.status === 1 && /HELD linear-issue: Linear issue lookup returned no issue/.test(emptyIssue.stdout), emptyIssue.stderr || emptyIssue.stdout)
  const badLog = stage("mergeability-unparseable.log", "")
  const unparseable = run("mergeability.mjs", ["--repo", "orbit/ui", "--pr", "615"], { env: { ...orcaEnv([{ match: "query($owner:String!,$name:String!,$number:Int!)", stdout: "not json" }]), ORBIT_ORCA_LOG: badLog } })
  T("mergeability.mjs: an unparseable forge result is HELD", unparseable.status === 1 && /HELD github-pull-request: GitHub pull-request lookup returned unparseable output/.test(unparseable.stdout), unparseable.stderr || unparseable.stdout)
}

const nudgeWorkerCases = () => {
  check("nudge-worker.mjs", "headless workers explain that a live turn cannot be injected", [], { status: 1, stderr: /mid-run injection is unavailable/ })
  check("nudge-worker.mjs", "headless workers reject an attempted injection", ["--terminal", "t1", "--text", "hi"], { status: 2, stderr: /mid-run injection is unavailable/ })
}

const workerWatchCases = () => {
  check("worker-watch.mjs", "documents the JSON report mode", ["--help"], { status: 0, stdout: /--json/ })
}

const teardownWorktreeCases = () => {
  check("teardown-worktree.mjs", "refuses no selector", [], { status: 2, stderr: /provide exactly one selector/ })
  check("teardown-worktree.mjs", "refuses both selectors", ["--issue", "ORB-124", "--worktree", "path:C:/other"], { status: 2, stderr: /provide exactly one selector/ })
  check("teardown-worktree.mjs", "refuses malformed issue selectors", ["--issue", "orb-124"], { status: 2, stderr: /Linear identifier/ })
}

const gateCases = {
  "mergeability.mjs": mergeabilityCases,
  "ai-quota.mjs": aiQuotaCases,
  "automation-budget.mjs": automationBudgetCases,
  "merge-sweep.sh": () => {
    mergeSweepCliFlagCases()
    mergeSweepCases("merge-sweep.sh")
  },
  "merge-sweep-cov.sh": () => mergeSweepCases("merge-sweep-cov.sh"),
  "new-ticket.mjs": () => {
    const argv = ["--title", "Cover the create and validate round trip", "--project", "Backlog"]
    check("new-ticket.mjs", "validates the identifier orca reported", argv, { status: 0, stdout: /ticket ok/ }, { env: orcaEnv(newTicketStub(CREATED_OK, VALID_ISSUE)) })
    check(
      "new-ticket.mjs",
      "a created but defective ticket exits 1 naming it",
      argv,
      { status: 1, stderr: /ORB-99 was CREATED but is DEFECTIVE/ },
      { env: orcaEnv(newTicketStub(CREATED_OK, { ...VALID_ISSUE, description: "nothing" })) },
    )
    check(
      "new-ticket.mjs",
      "an orca failure creates nothing and exits 3",
      argv,
      { status: 3, stderr: /orca linear create failed/ },
      { env: orcaEnv(newTicketStub({ ok: false, error: { message: "no such project" } }, VALID_ISSUE, { createExit: 1 })) },
    )
    check(
      "new-ticket.mjs",
      "success with no identifier is a tool error, never a silent pass",
      argv,
      { status: 3, stderr: /no issue identifier/ },
      { env: orcaEnv(newTicketStub({ ok: true, result: {} }, VALID_ISSUE)) },
    )
    check("new-ticket.mjs", "requires --project so the ticket cannot be orphaned", ["--title", "Cover the create and validate round trip"], { status: 2, stderr: /--project is required/ })
  },
  "check-tier-labels.mjs": tierLabelCases,
  "refresh-tier-labels.mjs": refreshTierLabelCases,
  "launch-worker.mjs": launchWorkerCases,
  "preflight.mjs": preflightCases,
  "nudge-worker.mjs": nudgeWorkerCases,
  "pr-watch.mjs": prWatchCases,
  "worker-watch.mjs": workerWatchCases,
  "teardown-worktree.mjs": teardownWorktreeCases,
  "orca-web-port.mjs": orcaWebPortCases,
  "worker-status.mjs": () => {
    check("worker-status.mjs", "requires --worktree", ["--issue", "ORB-75"], { status: 2, stderr: /--worktree is required/ })
    check("worker-status.mjs", "requires a Linear issue identifier", ["--worktree", root, "--issue", "nope"], { status: 2, stderr: /Linear identifier/ })
    const fixture = stageWorkerStatusWorktree()
    if (!fixture) {
      T("worker-status.mjs: real git fixture is available", false, "could not create and push the worker-status Git fixture")
      return
    }
    const screenshot = { title: "about-en.png", url: "https://raw.githubusercontent.com/orbit/orbit/evidence/about-en.png" }
    const critique = { title: "render critique", url: "https://raw.githubusercontent.com/orbit/orbit/evidence/render-critique.md" }
    const complete = runWorkerStatusCase(fixture, [screenshot, critique])
    T(
      "worker-status.mjs: screenshot and critique present is OK",
      complete.status === 0 &&
        complete.verdict?.ok === true &&
        complete.verdict.checks.find((entry) => entry.name === "review-approved")?.ok === true &&
        complete.verdict.checks.find((entry) => entry.name === "review-head-approved")?.ok === true &&
        complete.verdict.checks.find((entry) => entry.name === "screenshot-attached")?.ok === true &&
        complete.verdict.checks.find((entry) => entry.name === "critique-attached")?.ok === true,
      `exit ${complete.status}\n     ${(complete.stderr || complete.stdout).slice(0, 600)}`,
    )
    const draft = runWorkerStatusCase(fixture, [screenshot, critique], { isDraft: true })
    T(
      "worker-status.mjs: a draft pull request is explicitly not ready for review",
      draft.status === 1 &&
        draft.verdict?.unmet.length === 1 &&
        draft.verdict.unmet[0] === "pr-ready-for-review" &&
        draft.verdict.checks.find((entry) => entry.name === "pr-ready-for-review")?.detail.includes("draft pull request"),
      `exit ${draft.status}\n     ${(draft.stderr || draft.stdout).slice(0, 600)}`,
    )
    const changesRequested = runWorkerStatusCase(fixture, [screenshot, critique], { reviewDecision: "CHANGES_REQUESTED" })
    T(
      "worker-status.mjs: a non-approved pull request does not report done",
      changesRequested.status === 1 &&
        changesRequested.verdict?.unmet.length === 1 &&
        changesRequested.verdict.unmet[0] === "review-approved",
      `exit ${changesRequested.status}\n     ${(changesRequested.stderr || changesRequested.stdout).slice(0, 600)}`,
    )
    const staleApproval = runWorkerStatusCase(fixture, [screenshot, critique], {
      approvalHead: fixture.reviewedCommit,
    })
    T(
      "worker-status.mjs: an approval from an older commit does not approve the current PR head",
      staleApproval.status === 1 &&
        staleApproval.verdict?.unmet.length === 1 &&
        staleApproval.verdict.unmet[0] === "review-head-approved" &&
        staleApproval.verdict.checks.find((entry) => entry.name === "review-approved")?.ok === true,
      `exit ${staleApproval.status}\n     ${(staleApproval.stderr || staleApproval.stdout).slice(0, 600)}`,
    )
    const cleanAutomatedApproval = {
      id: "PRR_clean_approval",
      author: { login: "claude[bot]", __typename: "Bot" },
      state: "APPROVED",
      body: `# Code Review

**Recommendation**: APPROVE

## Findings

### Critical
None

### High
None.

### Medium
None posted (signal gate).

### Low / Info
None

## Validation
All required checks passed.`,
      submittedAt: "2026-07-28T10:00:00Z",
      updatedAt: "2026-07-28T10:00:00Z",
      commit: { oid: fixture.prHead },
    }
    const cleanApproval = runWorkerStatusCase(fixture, [screenshot, critique], {
      reviews: [cleanAutomatedApproval],
    })
    T(
      "worker-status.mjs: a clean automated approval body is not classified as finding activity",
      cleanApproval.status === 0 &&
        cleanApproval.verdict?.checks.find((entry) => entry.name === "review-activity")?.ok === true,
      `exit ${cleanApproval.status}\n     ${(cleanApproval.stderr || cleanApproval.stdout).slice(0, 600)}`,
    )
    const commentedUmbrella = {
      id: "PRR_commented_umbrella",
      author: { login: "chatgpt-codex-connector", __typename: "Bot" },
      state: "COMMENTED",
      body: "Codex Review. Inline suggestions, when present, are attached as review threads.",
      submittedAt: "2026-07-28T10:00:00Z",
      updatedAt: "2026-07-28T10:00:00Z",
      commit: { oid: fixture.prHead },
    }
    const cleanCommented = runWorkerStatusCase(fixture, [screenshot, critique], {
      reviews: [commentedUmbrella],
    })
    T(
      "worker-status.mjs: a COMMENTED umbrella body with no report finding is not finding activity",
      cleanCommented.status === 0 &&
        cleanCommented.verdict?.checks.find((entry) => entry.name === "review-activity")?.ok === true,
      `exit ${cleanCommented.status}\n     ${(cleanCommented.stderr || cleanCommented.stdout).slice(0, 600)}`,
    )
    const nestedPaginatedThread = reviewThread({
      author: "claude[bot]",
      authorType: "Bot",
      id: "PRRT_paginated_comments",
      isResolved: true,
      resolvedBy: "worker",
      reply: "No code change required: informational note only",
      reviewedCommit: fixture.reviewedCommit,
    })
    nestedPaginatedThread.comments.pageInfo.hasNextPage = true
    for (const [label, options] of [
      ["review threads", { reviewThreadsHasNextPage: true }],
      ["review bodies", { reviewsHasNextPage: true }],
      ["PR conversation comments", { commentsHasNextPage: true }],
      ["nested thread comments", { reviewThreads: [nestedPaginatedThread] }],
    ]) {
      const paginated = runWorkerStatusCase(fixture, [screenshot, critique], options)
      T(
        `worker-status.mjs: ${label} pagination fails the review inventory closed`,
        paginated.status === 1 &&
          paginated.verdict?.unmet.length === 1 &&
          paginated.verdict.unmet[0] === "review-thread-inventory",
        `exit ${paginated.status}\n     ${(paginated.stderr || paginated.stdout).slice(0, 600)}`,
      )
    }
    const linearUpload = {
      title: "about capture",
      url: "https://uploads.linear.app/8c329d15-b91e-47ac-9389-1b230452249d",
    }
    const extensionlessComplete = runWorkerStatusCase(fixture, [linearUpload, critique])
    T(
      "worker-status.mjs: extensionless Linear upload and separate critique is OK",
      extensionlessComplete.status === 0 &&
        extensionlessComplete.verdict?.ok === true &&
        extensionlessComplete.verdict.checks.find((entry) => entry.name === "screenshot-attached")?.ok === true &&
        extensionlessComplete.verdict.checks.find((entry) => entry.name === "critique-attached")?.ok === true,
      `exit ${extensionlessComplete.status}\n     ${(extensionlessComplete.stderr || extensionlessComplete.stdout).slice(0, 600)}`,
    )
    const extensionlessOnly = runWorkerStatusCase(fixture, [linearUpload])
    T(
      "worker-status.mjs: extensionless Linear upload alone is not a critique",
      extensionlessOnly.status === 1 &&
        extensionlessOnly.verdict?.unmet.length === 1 &&
        extensionlessOnly.verdict.unmet[0] === "critique-attached" &&
        extensionlessOnly.verdict.checks.find((entry) => entry.name === "screenshot-attached")?.ok === true,
      `exit ${extensionlessOnly.status}\n     ${(extensionlessOnly.stderr || extensionlessOnly.stdout).slice(0, 600)}`,
    )
    const critiqueMissing = runWorkerStatusCase(fixture, [screenshot])
    T(
      "worker-status.mjs: screenshot present and critique missing is UNMET",
      critiqueMissing.status === 1 &&
        critiqueMissing.verdict?.unmet.length === 1 &&
        critiqueMissing.verdict.unmet[0] === "critique-attached",
      `exit ${critiqueMissing.status}\n     ${(critiqueMissing.stderr || critiqueMissing.stdout).slice(0, 600)}`,
    )
    const neither = runWorkerStatusCase(fixture, [])
    T(
      "worker-status.mjs: neither screenshot nor critique present is UNMET",
      neither.status === 1 &&
        neither.verdict?.unmet.length === 2 &&
        neither.verdict.unmet.includes("screenshot-attached") &&
        neither.verdict.unmet.includes("critique-attached"),
      `exit ${neither.status}\n     ${(neither.stderr || neither.stdout).slice(0, 600)}`,
    )
    const fixedAutomatedThread = reviewThread({
      author: "claude[bot]",
      authorType: "Bot",
      id: "PRRT_fixed",
      isResolved: true,
      resolvedBy: "worker",
      reply: `Fixed in ${fixture.fixCommit}`,
      reviewedCommit: fixture.reviewedCommit,
    })
    const fixed = runWorkerStatusCase(fixture, [screenshot, critique], { reviewThreads: [fixedAutomatedThread], verifyReview: true })
    T(
      "worker-status.mjs: a resolved automated finding passes when its named fix commit changed the reviewed path",
      fixed.status === 0 &&
        fixed.verdict?.ok === true &&
        fixed.verdict.checks.find((entry) => entry.name === "pr-head-match")?.ok === true,
      `exit ${fixed.status}\n     ${(fixed.stderr || fixed.stdout).slice(0, 600)}`,
    )
    const editedAfterReplyThread = reviewThread({
      author: "claude[bot]",
      authorType: "Bot",
      findingUpdatedAt: "2026-07-28T10:00:03Z",
      id: "PRRT_edited_after_reply",
      isResolved: true,
      resolvedBy: "worker",
      reply: `Fixed in ${fixture.fixCommit}`,
      reviewedCommit: fixture.reviewedCommit,
    })
    const editedAfterReply = runWorkerStatusCase(fixture, [screenshot, critique], {
      reviewThreads: [editedAfterReplyThread],
      verifyReview: true,
    })
    T(
      "worker-status.mjs: an automated finding edited after its resolver reply needs fresh evidence",
      editedAfterReply.status === 1 &&
        editedAfterReply.verdict?.checks.find((entry) => entry.name === "resolved-thread-fixes")?.ok === false,
      `exit ${editedAfterReply.status}\n     ${(editedAfterReply.stderr || editedAfterReply.stdout).slice(0, 600)}`,
    )
    const followUp = {
      id: "PRRC_follow_up",
      author: { login: "claude[bot]", __typename: "Bot" },
      body: "follow-up finding",
      createdAt: "2026-07-28T10:00:03Z",
      updatedAt: "2026-07-28T10:00:03Z",
      pullRequestReview: null,
    }
    const followUpAfterReplyThread = reviewThread({
      author: "claude[bot]",
      authorType: "Bot",
      followUps: [followUp],
      id: "PRRT_follow_up_after_reply",
      isResolved: true,
      resolvedBy: "worker",
      reply: `Fixed in ${fixture.fixCommit}`,
      reviewedCommit: fixture.reviewedCommit,
    })
    const followUpAfterReply = runWorkerStatusCase(fixture, [screenshot, critique], {
      reviewThreads: [followUpAfterReplyThread],
      verifyReview: true,
    })
    T(
      "worker-status.mjs: an automated follow-up after the resolver reply needs fresh evidence",
      followUpAfterReply.status === 1 &&
        followUpAfterReply.verdict?.checks.find((entry) => entry.name === "resolved-thread-fixes")?.ok === false,
      `exit ${followUpAfterReply.status}\n     ${(followUpAfterReply.stderr || followUpAfterReply.stdout).slice(0, 600)}`,
    )
    followUpAfterReplyThread.comments.nodes.push({
      id: "PRRC_follow_up_reply",
      author: { login: "worker", __typename: "User" },
      body: `Fixed in ${fixture.fixCommit}`,
      createdAt: "2026-07-28T10:00:04Z",
      updatedAt: "2026-07-28T10:00:04Z",
      pullRequestReview: null,
    })
    const reconciledFollowUp = runWorkerStatusCase(fixture, [screenshot, critique], {
      reviewThreads: [followUpAfterReplyThread],
      verifyReview: true,
    })
    T(
      "worker-status.mjs: a fresh resolver reply after the automated follow-up restores verification",
      reconciledFollowUp.status === 0 &&
        reconciledFollowUp.verdict?.checks.find((entry) => entry.name === "resolved-thread-fixes")?.ok === true,
      `exit ${reconciledFollowUp.status}\n     ${(reconciledFollowUp.stderr || reconciledFollowUp.stdout).slice(0, 600)}`,
    )
    const preexistingChangeThread = reviewThread({
      author: "claude[bot]",
      authorType: "Bot",
      id: "PRRT_preexisting_change",
      isResolved: true,
      resolvedBy: "worker",
      reply: `Fixed in ${fixture.fixCommit}`,
      reviewedCommit: fixture.fixCommit,
    })
    const preexistingChange = runWorkerStatusCase(fixture, [screenshot, critique], {
      reviewThreads: [preexistingChangeThread],
      verifyReview: true,
    })
    T(
      "worker-status.mjs: a commit at the reviewed revision cannot masquerade as a later fix",
      preexistingChange.status === 1 &&
        preexistingChange.verdict?.checks.find((entry) => entry.name === "resolved-thread-fixes")?.ok === false,
      `exit ${preexistingChange.status}\n     ${(preexistingChange.stderr || preexistingChange.stdout).slice(0, 600)}`,
    )
    const earlierImplementationThread = reviewThread({
      author: "claude[bot]",
      authorType: "Bot",
      id: "PRRT_earlier_implementation",
      isResolved: true,
      resolvedBy: "worker",
      reply: `Fixed in ${fixture.implementationCommit}`,
      reviewedCommit: fixture.reviewedCommit,
    })
    const earlierImplementation = runWorkerStatusCase(fixture, [screenshot, critique], {
      reviewThreads: [earlierImplementationThread],
      verifyReview: true,
    })
    T(
      "worker-status.mjs: an implementation commit before the review cannot masquerade as its fix",
      earlierImplementation.status === 1 &&
        earlierImplementation.verdict?.checks.find((entry) => entry.name === "resolved-thread-fixes")?.ok === false,
      `exit ${earlierImplementation.status}\n     ${(earlierImplementation.stderr || earlierImplementation.stdout).slice(0, 600)}`,
    )
    const missingReviewCommitThread = reviewThread({
      author: "claude[bot]",
      authorType: "Bot",
      id: "PRRT_missing_review_commit",
      isResolved: true,
      resolvedBy: "worker",
      reply: `Fixed in ${fixture.fixCommit}`,
    })
    const missingReviewCommit = runWorkerStatusCase(fixture, [screenshot, critique], {
      reviewThreads: [missingReviewCommitThread],
      verifyReview: true,
    })
    T(
      "worker-status.mjs: a missing reviewed commit fails thread verification closed",
      missingReviewCommit.status === 1 &&
        missingReviewCommit.verdict?.checks.find((entry) => entry.name === "resolved-thread-fixes")?.ok === false,
      `exit ${missingReviewCommit.status}\n     ${(missingReviewCommit.stderr || missingReviewCommit.stdout).slice(0, 600)}`,
    )
    const informationalThread = reviewThread({
      author: "claude[bot]",
      authorType: "Bot",
      id: "PRRT_informational",
      isResolved: true,
      resolvedBy: "worker",
      reply: `No code change required: the reviewer only confirmed the expected behavior. Evidence: ${fixture.fixCommit}`,
      reviewedCommit: fixture.reviewedCommit,
    })
    const informational = runWorkerStatusCase(fixture, [screenshot, critique], {
      reviewThreads: [informationalThread],
      verifyReview: true,
    })
    T(
      "worker-status.mjs: an informational automated finding passes with an explicit no-change reason",
      informational.status === 0 &&
        informational.verdict?.checks.find((entry) => entry.name === "resolved-thread-fixes")?.ok === true,
      `exit ${informational.status}\n     ${(informational.stderr || informational.stdout).slice(0, 600)}`,
    )
    const unauditedInformationalThread = reviewThread({
      author: "claude[bot]",
      authorType: "Bot",
      id: "PRRT_informational_unaudited",
      isResolved: true,
      resolvedBy: "worker",
      reply: "No code change required: the reviewer only confirmed the expected behavior",
      reviewedCommit: fixture.reviewedCommit,
    })
    const unauditedInformational = runWorkerStatusCase(fixture, [screenshot, critique], {
      reviewThreads: [unauditedInformationalThread],
      verifyReview: true,
    })
    T(
      "worker-status.mjs: a bare informational explanation cannot bypass diff evidence",
      unauditedInformational.status === 1 &&
        unauditedInformational.verdict?.checks.find((entry) => entry.name === "resolved-thread-fixes")?.ok === false,
      `exit ${unauditedInformational.status}\n     ${(unauditedInformational.stderr || unauditedInformational.stdout).slice(0, 600)}`,
    )
    const standaloneReview = {
      id: "PRR_standalone",
      author: { login: "claude[bot]", __typename: "Bot" },
      state: "APPROVED",
      body: `# Code Review

## Findings

### Critical
None

### High
None

### Medium
Missing a concrete edge-case test.

### Low / Info
None

## Validation
Not run.`,
      submittedAt: "2026-07-28T10:00:00Z",
      updatedAt: "2026-07-28T10:00:01Z",
      commit: { oid: fixture.reviewedCommit },
    }
    const unacknowledgedReview = runWorkerStatusCase(fixture, [screenshot, critique], { reviews: [standaloneReview] })
    T(
      "worker-status.mjs: a standalone automated review body needs an auditable worker acknowledgement",
      unacknowledgedReview.status === 1 &&
        unacknowledgedReview.verdict?.checks.find((entry) => entry.name === "review-activity")?.ok === false,
      `exit ${unacknowledgedReview.status}\n     ${(unacknowledgedReview.stderr || unacknowledgedReview.stdout).slice(0, 600)}`,
    )
    const reviewAcknowledgement = {
      id: "IC_review_ack",
      author: { login: "worker", __typename: "User" },
      body: `Acknowledged PRR_standalone in ${fixture.prHead}`,
      createdAt: "2026-07-28T10:00:02Z",
      updatedAt: "2026-07-28T10:00:02Z",
    }
    const acknowledgedReview = runWorkerStatusCase(fixture, [screenshot, critique], {
      comments: [reviewAcknowledgement],
      reviews: [standaloneReview],
    })
    T(
      "worker-status.mjs: a later worker acknowledgement naming a PR commit covers a standalone review body",
      acknowledgedReview.status === 0 &&
        acknowledgedReview.verdict?.checks.find((entry) => entry.name === "review-activity")?.ok === true,
      `exit ${acknowledgedReview.status}\n     ${(acknowledgedReview.stderr || acknowledgedReview.stdout).slice(0, 600)}`,
    )
    const standaloneConversation = {
      id: "IC_standalone_bot",
      author: { login: "claude[bot]", __typename: "Bot" },
      body: "standalone conversation finding",
      createdAt: "2026-07-28T10:00:00Z",
      updatedAt: "2026-07-28T10:00:00Z",
    }
    const unacknowledgedConversation = runWorkerStatusCase(fixture, [screenshot, critique], {
      comments: [standaloneConversation],
    })
    T(
      "worker-status.mjs: a standalone automated conversation finding needs an auditable worker acknowledgement",
      unacknowledgedConversation.status === 1 &&
        unacknowledgedConversation.verdict?.checks.find((entry) => entry.name === "review-activity")?.ok === false,
      `exit ${unacknowledgedConversation.status}\n     ${(unacknowledgedConversation.stderr || unacknowledgedConversation.stdout).slice(0, 600)}`,
    )
    const conversationAcknowledgement = {
      id: "IC_conversation_ack",
      author: { login: "worker", __typename: "User" },
      body: `Acknowledged IC_standalone_bot in ${fixture.prHead}`,
      createdAt: "2026-07-28T10:00:02Z",
      updatedAt: "2026-07-28T10:00:02Z",
    }
    const acknowledgedConversation = runWorkerStatusCase(fixture, [screenshot, critique], {
      comments: [standaloneConversation, conversationAcknowledgement],
    })
    T(
      "worker-status.mjs: a later worker acknowledgement naming a PR commit covers a conversation finding",
      acknowledgedConversation.status === 0 &&
        acknowledgedConversation.verdict?.checks.find((entry) => entry.name === "review-activity")?.ok === true,
      `exit ${acknowledgedConversation.status}\n     ${(acknowledgedConversation.stderr || acknowledgedConversation.stdout).slice(0, 600)}`,
    )
    const unfixedAutomatedThread = reviewThread({
      author: "claude[bot]",
      authorType: "Bot",
      id: "PRRT_unfixed",
      isResolved: true,
      resolvedBy: "worker",
      reply: `Fixed in ${fixture.unrelatedCommit}`,
      reviewedCommit: fixture.reviewedCommit,
    })
    const unfixed = runWorkerStatusCase(fixture, [screenshot, critique], { reviewThreads: [unfixedAutomatedThread], verifyReview: true })
    T(
      "worker-status.mjs: a worker-resolved automated finding with no matching diff change is UNMET",
      unfixed.status === 1 &&
        unfixed.verdict?.checks.find((entry) => entry.name === "resolved-thread-fixes")?.ok === false,
      `exit ${unfixed.status}\n     ${(unfixed.stderr || unfixed.stdout).slice(0, 600)}`,
    )
    const humanThread = reviewThread({
      author: "human-reviewer",
      authorType: "User",
      id: "PRRT_human",
      isResolved: false,
    })
    const humanLog = stage("worker-status-human.log", "")
    const human = runWorkerStatusCase(fixture, [screenshot, critique], { log: humanLog, reviewThreads: [humanThread] })
    const humanCalls = readFileSync(humanLog, "utf8")
    T(
      "worker-status.mjs: an approved pull request with an unresolved human thread does not report done",
      human.status === 1 && human.verdict?.checks.find((entry) => entry.name === "review-threads")?.ok === false,
      `exit ${human.status}\n     ${(human.stderr || human.stdout).slice(0, 600)}`,
    )
    T(
      "worker-status.mjs: verification never auto-resolves a human-authored thread",
      !humanCalls.includes("resolveReviewThread"),
      humanCalls.slice(0, 600),
    )
    const workerResolvedHumanThread = reviewThread({
      author: "human-reviewer",
      authorType: "User",
      id: "PRRT_human_resolved",
      isResolved: true,
      resolvedBy: "worker",
      reply: `Fixed in ${fixture.fixCommit}`,
    })
    const resolvedHuman = runWorkerStatusCase(fixture, [screenshot, critique], { reviewThreads: [workerResolvedHumanThread], verifyReview: true })
    T(
      "worker-status.mjs: a human-authored thread resolved by the worker account is UNMET",
      resolvedHuman.status === 1 &&
        resolvedHuman.verdict?.checks.find((entry) => entry.name === "human-thread-resolution")?.ok === false,
      `exit ${resolvedHuman.status}\n     ${(resolvedHuman.stderr || resolvedHuman.stdout).slice(0, 600)}`,
    )
    writeFileSync(join(fixture.worktree, "reviewed.txt"), "review fix\nlocal only fix\n")
    const localGit = (args) => spawnSync("git", ["-C", fixture.worktree, ...args], { encoding: "utf8" })
    localGit(["add", "reviewed.txt"])
    localGit(["commit", "-q", "-m", "local only review fix"])
    const localOnlyCommit = localGit(["rev-parse", "HEAD"]).stdout.trim()
    const localOnlyThread = reviewThread({
      author: "claude[bot]",
      authorType: "Bot",
      id: "PRRT_local_only",
      isResolved: true,
      resolvedBy: "worker",
      reply: `Fixed in ${localOnlyCommit}`,
      reviewedCommit: fixture.reviewedCommit,
    })
    const localOnly = runWorkerStatusCase(fixture, [screenshot, critique], {
      reviewThreads: [localOnlyThread],
      verifyReview: true,
    })
    T(
      "worker-status.mjs: an unpushed local fix cannot satisfy remote PR verification",
      localOnly.status === 1 &&
        localOnly.verdict?.checks.find((entry) => entry.name === "pr-head-match")?.ok === false &&
        localOnly.verdict?.checks.find((entry) => entry.name === "resolved-thread-fixes")?.ok === false,
      `exit ${localOnly.status}\n     ${(localOnly.stderr || localOnly.stdout).slice(0, 600)}`,
    )
  },
  "compose-prompt.mjs": composePromptCases,
  "wave-plan.mjs": () => {
    orchestrateFlagCases()
    check("wave-plan.mjs", "documents the explicit issue selection mode", ["--help"], { status: 0, stdout: /--issues "ORB-a,\.\.\."/ })
    const body = (files) => `## Affected modules / files\n\n${files}\n`
    const stubDescriptions = (aDescription, bDescription, aLabels = [], bLabels = [], aRelations = [], bRelations = []) =>
      orcaEnv([
        { match: "linear list-issues", stdout: JSON.stringify({ ok: true, result: { issues: [{ identifier: "ORB-201" }, { identifier: "ORB-202" }] } }) },
        { match: "linear issue ORB-201", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-201", title: "first collision probe", description: aDescription, state: { name: "Todo", type: "unstarted" }, labels: aLabels }, relations: aRelations } }) },
        { match: "linear issue ORB-202", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-202", title: "second collision probe", description: bDescription, state: { name: "Todo", type: "unstarted" }, labels: bLabels }, relations: bRelations } }) },
      ])
    const stub = (aFiles, bFiles) => stubDescriptions(body(aFiles), body(bFiles))
    check("wave-plan.mjs", "two tickets naming a common path are reported as a collision pair", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: tools\/test-tools\.mjs/ }, { env: stub("`tools/test-tools.mjs`", "`tools/test-tools.mjs`") })
    check("wave-plan.mjs", "a backticked root file is reported as a collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: README\.md/ }, { env: stub("`README.md`", "`README.md`") })
    check("wave-plan.mjs", "a bare root file list item is reported as a collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: README\.md/ }, { env: stub("- README.md", "- README.md") })
    check("wave-plan.mjs", "checkbox root files remain collision candidates", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: CLAUDE\.md/ }, { env: stub("- [ ] CLAUDE.md\n`tools/a.mjs`", "- [x] CLAUDE.md\n`tools/b.mjs`") })
    check("wave-plan.mjs", "annotated root files remain collision candidates", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: README\.md/ }, { env: stub("- README.md: update badge link\n`tools/a.mjs`", "- README.md - revise registry\n`tools/b.mjs`") })
    check("wave-plan.mjs", "comma and word-separated bare root files remain collision candidates", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: README\.md/ }, { env: stub("README.md, CLAUDE.md and package.json\n`tools/a.mjs`", "README.md, CHANGELOG.md and eslint.config.mjs\n`tools/b.mjs`") })
    check("wave-plan.mjs", "the same relative path in different repositories is not a collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stubDescriptions(body("`CLAUDE.md`"), body("`CLAUDE.md`"), ["repo:ui"], ["repo:api"]) })
    check("wave-plan.mjs", "the same path in different waves is not a collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /WAVE 1[\s\S]*?collisions: none[\s\S]*?WAVE 2[\s\S]*?collisions: none/ }, { env: stubDescriptions(body("`tools/test-tools.mjs`"), body("`tools/test-tools.mjs`"), [], [], [], [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-201" } }]) })
    check("wave-plan.mjs", "two tickets naming disjoint paths report no collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stub("`tools/a.mjs`", "`tools/b.mjs`") })
    check("wave-plan.mjs", "dynamic route segments stay part of disjoint paths", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stub("`apps/web/app/r/[code]/page.tsx`", "`apps/web/app/(app)/social/challenges/[id]/page.tsx`") })
    check("wave-plan.mjs", "native paths collide even when each ticket also names a recognised tool path", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: apps\/mobile\/android\/app\/src\/main\/java\/com\/orbit\/MainActivity\.kt/ }, { env: stub("`tools/a.mjs`\n`apps/mobile/android/app/src/main/java/com/orbit/MainActivity.kt`", "`tools/b.mjs`\n`apps/mobile/android/app/src/main/java/com/orbit/MainActivity.kt`") })
    check("wave-plan.mjs", "ordinary dotted prose is not reported as a collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stub("e.g. `tools/a.mjs` with Node.js v20.5", "e.g. `tools/b.mjs` with Node.js v20.5") })
    check("wave-plan.mjs", "a shared URL is not reported as a file collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stub("See https://github.com/org/repo/blob/main/docs/collisions.md and `tools/a.mjs`", "See https://github.com/org/repo/blob/main/docs/collisions.md and `tools/b.mjs`") })
    check("wave-plan.mjs", "a shared bare-domain URL is not reported as a file collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stub("See github.com/org/repo/blob/main/docs/collisions.md and `tools/a.mjs`", "See github.com/org/repo/blob/main/docs/collisions.md and `tools/b.mjs`") })
    const fencedDescription = ["## Technical details", "```sh", "# Files affected: `scripts/deploy.sh`", "```", "## Affected modules / files", "`tools/test-tools.mjs`"].join("\n")
    check("wave-plan.mjs", "a heading-shaped line inside a fence cannot shadow the affected section", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: tools\/test-tools\.mjs/ }, { env: stubDescriptions(fencedDescription, body("`tools/test-tools.mjs`")) })
    const fencedAffected = (file) => body(`\`${file}\`\n\`\`\`sh\nscripts/shared-example.sh\n\`\`\``)
    check("wave-plan.mjs", "fenced examples inside the affected section are not collision candidates", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stubDescriptions(fencedAffected("tools/a.mjs"), fencedAffected("tools/b.mjs")) })
    const boundedBody = (file) => `${body(file)}\n## Test scenarios\n\n\`tools/shared-after-section.mjs\`\n`
    check("wave-plan.mjs", "a later section cannot leak a shared path into collisions", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stubDescriptions(boundedBody("`tools/a.mjs`"), boundedBody("`tools/b.mjs`")) })
    check("wave-plan.mjs", "a ticket with no affected section is reported as unknown", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /unknown \(no parseable path in Affected modules \/ files\): ORB-201/ }, { env: stubDescriptions("## Summary\n\nno affected section here\n", body("`tools/b.mjs`")) })
    check("wave-plan.mjs", "a ticket with no parseable affected path is reported as unknown", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /unknown \(no parseable path/ }, { env: stub("nothing recognisable here", "`tools/b.mjs`") })
    check("wave-plan.mjs", "the json output carries the same collision pair", ["--issues", "ORB-201,ORB-202", "--json"], { status: 0, stdout: /"files": \[\s*"tools\/test-tools\.mjs"/ }, { env: stub("`tools/test-tools.mjs`", "`tools/test-tools.mjs`") })
    check("wave-plan.mjs", "the json output carries unknown affected identifiers", ["--issues", "ORB-201,ORB-202", "--json"], { status: 0, stdout: /"unknownAffected": \[\s*"ORB-201"/ }, { env: stub("nothing recognisable here", "`tools/b.mjs`") })

    check("wave-plan.mjs", "plans one explicitly requested identifier and counts out-of-set dependents in reach", ["--issues", "ORB-1", "--json"], { status: 0, stdout: /"identifier": "ORB-1"[\s\S]*?"reach": 1[\s\S]*?"launchable": true/ }, { env: orcaEnv(ISSUES_WAVE_STUB) })
    const duplicateLog = stage("wave-plan-duplicate.log", "")
    const duplicate = run("wave-plan.mjs", ["--issues", "ORB-1,ORB-1", "--json"], { env: { ...orcaEnv(ISSUES_WAVE_STUB), ORBIT_ORCA_LOG: duplicateLog } })
    const duplicateFetches = readFileSync(duplicateLog, "utf8").split("\n").filter(Boolean).map(JSON.parse).filter((argv) => argv[0].split(/[\\/]/).pop() === "linear" && argv[1] === "issue" && argv[2] === "ORB-1")
    T("wave-plan.mjs: deduplicates explicitly requested identifiers before fetching", duplicate.status === 0 && duplicateFetches.length === 1, duplicate.stderr || duplicate.stdout)
    check("wave-plan.mjs", "renders both members of an explicit two-ticket selection", ["--issues", "ORB-1,ORB-2", "--json"], { status: 0, stdout: /"identifier": "ORB-1"[\s\S]*?"identifier": "ORB-2"/ }, { env: orcaEnv(ISSUES_WAVE_STUB) })
    check("wave-plan.mjs", "refuses explicit issues combined with another mode", ["--issues", "ORB-1", "--project", "Redesign"], { status: 2, stderr: /cannot be combined/ })
    check("wave-plan.mjs", "refuses explicit issues combined with a label", ["--issues", "ORB-1", "--label", "bug"], { status: 2, stderr: /cannot be combined/ })
    check("wave-plan.mjs", "refuses explicit issues combined with all", ["--issues", "ORB-1", "--all"], { status: 2, stderr: /cannot be combined/ })
    check("wave-plan.mjs", "requires a value for explicit issues", ["--issues"], { status: 2, stderr: /requires at least one identifier/ })
    check("wave-plan.mjs", "names an unresolved requested identifier", ["--issues", "ORB-404"], { status: 1, stderr: /unresolved requested identifier\(s\): ORB-404/ }, { env: orcaEnv([{ match: "linear issue ORB-404", stdout: JSON.stringify({ ok: false, error: { message: "not found" } }) }]) })
    check("wave-plan.mjs", "refuses a requested Done identifier", ["--issues", "ORB-3"], { status: 1, stderr: /Done requested identifier\(s\): ORB-3/ }, { env: orcaEnv([{ match: "linear issue ORB-3", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-3", title: "done", state: { name: "Done", type: "completed" }, labels: [] }, relations: [] } }) }]) })
    check("wave-plan.mjs", "uses an out-of-set team blocker while displaying only requested issues", ["--issues", "ORB-2", "--json"], { status: 0, stdout: /"blockedBy": \[\s*"ORB-99"\s*\][\s\S]*?"blockerState": "blocked by ORB-99"[\s\S]*?"launchable": false[\s\S]*?"twoStrikes": \[\s*"ORB-2"\s*\]/ }, { env: orcaEnv(ISSUES_WAVE_STUB) })
    check("wave-plan.mjs", "restricts text output to requested identifiers with their blocker state", ["--issues", "ORB-2"], { status: 0, stdout: /ORB-2[\s\S]*?blockerState: blocked by ORB-99[\s\S]*?launchable: no/, stderr: /^$/ }, { env: orcaEnv(ISSUES_WAVE_STUB) })
    check("wave-plan.mjs", "orders a blockedBy pair into two waves", ["--project", "Redesign", "--json"], { status: 0, stdout: /"wave": 2[\s\S]*ORB-2/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "wave 1 is the unblocked ticket", ["--project", "Redesign", "--json"], { status: 0, stdout: /"launchable": \[\s*"ORB-1"\s*\]/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "reach counts the whole downstream chain, not just direct blockers", ["--project", "Redesign", "--json"], { status: 0, stdout: /"identifier": "ORB-1"[\s\S]*?"reach": 2/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "a wave-1 ticket at the strike limit is reported, not dropped", ["--project", "Redesign", "--json"], { status: 0, stdout: /"twoStrikes": \[\s*"ORB-4"\s*\]/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "text mode marks the same strike-limit ticket", ["--project", "Redesign"], { status: 0, stdout: /ORB-4[\s\S]*?TWO STRIKES/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "an empty project is nothing to plan", ["--project", "Empty"], { status: 1, stderr: /nothing to plan/ }, { env: orcaEnv([{ match: "linear list-issues", stdout: JSON.stringify({ ok: true, result: { issues: [] } }) }]) })
    const timingLog = stage("wave-plan-timing.log", "")
    const delayed = run("wave-plan.mjs", ["--all"], {
      env: { ...orcaEnv(delayedWaveStub()), ORBIT_ORCA_TIMING_LOG: timingLog },
    })
    const concurrency = relationFetchConcurrency(timingLog)
    T(
      "wave-plan.mjs: fetches 100 relations in a bounded pool while preserving the table order",
      delayed.status === 0
        && concurrency.events.filter((event) => event.event === "start").length === 100
        && concurrency.peak > 1
        && concurrency.peak <= 8
        && concurrency.active === 0
        && /ORB-1[\s\S]*ORB-100/.test(delayed.stdout),
      `exit ${delayed.status}, relation events ${concurrency.events.length}, peak concurrency ${concurrency.peak}, active at exit ${concurrency.active}\n     ${delayed.stderr}`,
    )
    check(
      "wave-plan.mjs",
      "names a failing relation fetch without an execFile stack trace",
      ["--project", "Redesign"],
      { status: 2, stderr: /failed to fetch ORB-2: unavailable/ },
      { env: orcaEnv([{ ...WAVE_STUB[0] }, WAVE_STUB[1], { match: "linear issue ORB-2", stdout: JSON.stringify({ ok: false, error: { message: "unavailable" } }) }, WAVE_STUB[3], WAVE_STUB[4]]) },
    )
    check(
      "wave-plan.mjs",
      "keeps planning when one external blocker cannot be fetched",
      ["--project", "External"],
      { status: 0, stdout: /ORB-1[\s\S]*blockedBy: ORB-99/, stderr: /WARNING: blocker ORB-99 could not be fetched[\s\S]*treating it as blocking/ },
      {
        env: orcaEnv([
          { match: "linear list-issues", stdout: JSON.stringify({ ok: true, result: { issues: [{ identifier: "ORB-1" }] } }) },
          { match: "linear issue ORB-1", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-1", title: "dependent", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-99" } }] } }) },
          { match: "linear issue ORB-99", stdout: JSON.stringify({ ok: false, error: { message: "unavailable" } }) },
        ]),
      },
    )
  },
  "check-dashes.mjs": () => {
    check("check-dashes.mjs", "an em dash in text is rejected", ["--text", `a${EM_DASH}b`], { status: 1, stderr: /Banned dash/ })
    check("check-dashes.mjs", "clean text passes", ["--text", "a plain hyphen - is fine"], { status: 0 })
  },
  "check-lockstep.mjs": () => {
    const matching = lockstepFixture("matching")
    check("check-lockstep.mjs", "six matching pairs pass", ["--ui-root", matching.uiRoot, "--api-root", matching.apiRoot, "--manifest", matching.manifest], { status: 0, stdout: /HARNESS LOCKSTEP OK/ })

    const malformedManifest = lockstepFixture("malformed-manifest")
    writeFileSync(malformedManifest.manifest, JSON.stringify({ version: 1, files: {} }))
    check(
      "check-lockstep.mjs",
      "a malformed declaration manifest fails loudly",
      ["--ui-root", malformedManifest.uiRoot, "--api-root", malformedManifest.apiRoot, "--manifest", malformedManifest.manifest],
      { status: 1, stderr: /check-lockstep: unreadable comparison input: manifest must declare exactly the six lockstep paths/ },
    )

    const configuredDefault = lockstepFixture("default-configured")
    writeFileSync(join(configuredDefault.uiRoot, ".claude", "orchestrator.json"), JSON.stringify({ repos: { api: configuredDefault.apiRoot } }))
    check(
      "check-lockstep.mjs",
      "uses orchestrator repos.api when --api-root is omitted",
      ["--ui-root", configuredDefault.uiRoot, "--manifest", configuredDefault.manifest],
      { status: 0, stdout: /^HARNESS LOCKSTEP OK: 6 pairs checked\s*$/, stderr: /^$/ },
      { cwd: root },
    )

    const missingConfiguredApi = lockstepDefaultApiFixture("default-missing-api")
    writeFileSync(join(missingConfiguredApi.uiRoot, ".claude", "orchestrator.json"), JSON.stringify({ repos: {} }))
    check(
      "check-lockstep.mjs",
      "falls back to the sibling when orchestrator repos.api is missing",
      ["--ui-root", missingConfiguredApi.uiRoot, "--manifest", missingConfiguredApi.manifest],
      { status: 0, stdout: /^HARNESS LOCKSTEP OK: 6 pairs checked\s*$/, stderr: /^$/ },
      { cwd: root },
    )

    const malformedConfig = lockstepDefaultApiFixture("default-malformed-config")
    writeFileSync(join(malformedConfig.uiRoot, ".claude", "orchestrator.json"), "{not-json")
    check(
      "check-lockstep.mjs",
      "falls back to the sibling when orchestrator config is unparsable",
      ["--ui-root", malformedConfig.uiRoot, "--manifest", malformedConfig.manifest],
      { status: 0, stdout: /^HARNESS LOCKSTEP OK: 6 pairs checked\s*$/, stderr: /^$/ },
      { cwd: root },
    )

    const absentConfig = lockstepDefaultApiFixture("default-no-config")
    check(
      "check-lockstep.mjs",
      "falls back to the sibling when orchestrator config is absent",
      ["--ui-root", absentConfig.uiRoot, "--manifest", absentConfig.manifest],
      { status: 0, stdout: /^HARNESS LOCKSTEP OK: 6 pairs checked\s*$/, stderr: /^$/ },
      { cwd: root },
    )

    const divergent = lockstepFixture("divergent", "shared\nui-only\nshared-tail\n", "shared\napi-only\nshared-tail\n")
    check("check-lockstep.mjs", "an undeclared divergence fails with its file and region", ["--ui-root", divergent.uiRoot, "--api-root", divergent.apiRoot, "--manifest", divergent.manifest], { status: 1, stderr: /pr-review\/SKILL\.md: undeclared region/ })

    const staleFingerprint = lockstepFingerprint("old-ui-only", "old-api-only")
    const staleDeclaration = [{ id: "obsolete-platform-wording", justification: "The old repository wording was intentionally different.", fingerprints: [staleFingerprint] }]
    const stale = lockstepFixture("stale-declaration", "shared\ncurrent-ui\nshared-tail\n", "shared\ncurrent-api\nshared-tail\n", staleDeclaration)
    check(
      "check-lockstep.mjs",
      "a declaration that matches no current diff is stale",
      ["--ui-root", stale.uiRoot, "--api-root", stale.apiRoot, "--manifest", stale.manifest],
      { status: 1, stderr: new RegExp(`stale declaration obsolete-platform-wording \\(${staleFingerprint}\\); remove it or update the justified region`) },
    )

    const declaration = [{ id: "platform-wording", justification: "The repository names its own platform.", fingerprints: [lockstepFingerprint("ui-only", "api-only")] }]
    const declared = lockstepFixture("declared", "shared\nui-only\nshared-tail\n", "shared\napi-only\nshared-tail\n", declaration)
    check("check-lockstep.mjs", "a justified declared divergence passes", ["--ui-root", declared.uiRoot, "--api-root", declared.apiRoot, "--manifest", declared.manifest], { status: 0 })
    writeFileSync(join(declared.uiRoot, LOCKSTEP_PATHS[0]), "changed-shared\nui-only\nshared-tail\n")
    check("check-lockstep.mjs", "a change in the shared region still fails", ["--ui-root", declared.uiRoot, "--api-root", declared.apiRoot, "--manifest", declared.manifest], { status: 1, stderr: /undeclared region/ })

    const byteExact = lockstepFixture("byte-exact")
    writeFileSync(join(byteExact.uiRoot, LOCKSTEP_PATHS.at(-1)), "shared!\n")
    check("check-lockstep.mjs", "second-opinion drift fails byte for byte", ["--ui-root", byteExact.uiRoot, "--api-root", byteExact.apiRoot, "--manifest", byteExact.manifest], { status: 1, stderr: /second-opinion\/second-opinion\.mjs: whole file differs/ })

    check("check-lockstep.mjs", "an unreachable sibling fails loudly", ["--ui-root", matching.uiRoot, "--api-root", join(root, "missing-api"), "--manifest", matching.manifest], { status: 1, stderr: /unreadable comparison input/ })
  },
  "check-context-budget.mjs": contextBudgetCases,
  "capture-surfaces.mjs": captureSurfacesCases,
  "check-ticket.mjs": () => {
    check("check-ticket.mjs", "an incomplete body is rejected", ["--file", stage("ticket.md", "# A ticket\n\nno template sections here\n")], { nonZero: true })
    check("check-ticket.mjs", "a missing body file is a usage error", ["--file", join(root, "absent.md")], { status: 2 })
    const criteriaTicket = (...items) =>
      VALID_TICKET_BODY.replace("- the created identifier is the one validated\n\n- a defective ticket exits 1", items.join("\n\n"))
    check(
      "check-ticket.mjs",
      "an acceptance criterion quantifying over an open set is rejected",
      ["--file", stage("ticket-open-set.md", criteriaTicket("- every phrasing a worker could emit is blocked", "- a defective ticket exits 1"))],
      { status: 1, stderr: /quantifies over an open set/ },
    )
    check(
      "check-ticket.mjs",
      "the same criterion passes once it names the command that decides it",
      ["--file", stage("ticket-bounded-set.md", criteriaTicket("- every phrasing rejected by `node tools/check-ticket.mjs` is blocked", "- a defective ticket exits 1"))],
      { status: 0, stdout: /ticket ok/ },
    )
    check(
      "check-ticket.mjs",
      "a bound outside the quantified clause does not rescue an open set",
      ["--file", stage("ticket-stray-bound.md", criteriaTicket("- every phrasing a worker could emit is blocked and the command exits 1", "- a defective ticket exits 1"))],
      { status: 1, stderr: /quantifies over an open set/ },
    )
    check(
      "check-ticket.mjs",
      "an acceptance criterion trailing off into an unnamed remainder is rejected",
      ["--file", stage("ticket-open-tail.md", criteriaTicket("- the two documented reasons are covered, etc.", "- a defective ticket exits 1"))],
      { status: 1, stderr: /trails off into an unnamed remainder/ },
    )
    const visibleTicket = (evidence = "") => [
      "# Validate visible effect evidence",
      "",
      VALID_TICKET_BODY,
      "",
      "The component behavior is user-visible.",
      evidence,
    ].join("\n")
    check(
      "check-ticket.mjs",
      "a visible-effect body with screenshots and critique passes",
      ["--file", stage("ticket-visible-complete.md", visibleTicket("Final screenshots and the critique artifact are attached before In Review."))],
      { status: 0, stdout: /ticket ok/ },
    )
    check(
      "check-ticket.mjs",
      "a visible-effect body with screenshots but no critique names the missing critique",
      ["--file", stage("ticket-visible-no-critique.md", visibleTicket("Final screenshots are attached before In Review."))],
      { status: 1, stderr: /DEFECTIVE TICKET \(1 problems\)[\s\S]*critique artifact is attached before In Review/ },
    )
    check(
      "check-ticket.mjs",
      "a visible-effect body with neither screenshots nor critique fails both requirements",
      ["--file", stage("ticket-visible-no-evidence.md", visibleTicket())],
      { status: 1, stderr: /DEFECTIVE TICKET \(2 problems\)[\s\S]*final screenshots are attached before In Review[\s\S]*critique artifact is attached before In Review/ },
    )
    const issueStub = (labels, description = VALID_TICKET_BODY, relations = []) =>
      orcaEnv([
        {
          match: "linear issue ORB-113",
          stdout: JSON.stringify({
            ok: true,
            result: {
              issue: {
                identifier: "ORB-113",
                title: "Gate the Linear ticket type taxonomy",
                description,
                labels: labels.map((name) => ({ name })),
              },
              relations,
            },
          }),
        },
      ])
    check(
      "check-ticket.mjs",
      "issue mode rejects zero type labels and names every valid value",
      ["--issue", "ORB-113"],
      { status: 1, stderr: /exactly ONE type label required \(Feature, Bug, Improvement\); found: none/ },
      { env: issueStub(["repo:api"]) },
    )
    check(
      "check-ticket.mjs",
      "issue mode accepts exactly one type label",
      ["--issue", "ORB-113"],
      { status: 0, stdout: /ticket ok/ },
      { env: issueStub(["repo:api", "Improvement"]) },
    )
    check(
      "check-ticket.mjs",
      "issue mode rejects two type labels",
      ["--issue", "ORB-113"],
      { status: 1, stderr: /exactly ONE type label required \(Feature, Bug, Improvement\); found: Feature, Bug/ },
      { env: issueStub(["repo:api", "Feature", "Bug"]) },
    )
    check(
      "check-ticket.mjs",
      "the repo label rule still rejects two repo labels alongside one type",
      ["--issue", "ORB-113"],
      { status: 1, stderr: /exactly ONE repo label required/ },
      { env: issueStub(["repo:api", "repo:ui", "parity:no", "Feature"]) },
    )
    check(
      "check-ticket.mjs",
      "file mode remains unaffected by issue-only label validation",
      ["--file", stage("valid-ticket.md", `# Gate the Linear ticket type taxonomy\n\n${VALID_TICKET_BODY}\n`)],
      { status: 0, stdout: /ticket ok/ },
    )
    for (const [name, prose] of [
      ["once used as a measured frequency", "The callback fires once for each matching label."],
      ["depends on used for ordinary logic", "The exact message depends on which labels are present."],
      ["after used as an ordinary sequence", "After validation, the checker prints ticket ok."],
      ["after used for process order", "Cleanup runs after the terminal exits."],
      ["once used for retry timing", "The launcher retries once the daemon is responsive."],
      ["depends on and blocked by used for ordinary behavior", "The branch name depends on configuration, and startup can be blocked by a trust prompt."],
    ]) {
      check(
        "check-ticket.mjs",
        `dependency prose ignores ${name}`,
        ["--issue", "ORB-113"],
        { status: 0, stdout: /ticket ok/ },
        { env: issueStub(["repo:api", "Improvement"], `${VALID_TICKET_BODY}\n\n${prose}`) },
      )
    }
    check(
      "check-ticket.mjs",
      "a genuine named dependency without a relation is rejected",
      ["--issue", "ORB-113"],
      { status: 1, stderr: /body PROSE mentions a dependency but the issue has no blockedBy relation/ },
      { env: issueStub(["repo:api", "Improvement"], `${VALID_TICKET_BODY}\n\n## Dependencies (blockedBy)\n\nThis work depends on ORB-112.`) },
    )
    check(
      "check-ticket.mjs",
      "a named issue blocker still requires a blockedBy relation",
      ["--issue", "ORB-113"],
      { status: 1, stderr: /body PROSE mentions a dependency/ },
      { env: issueStub(["repo:api", "Improvement"], `${VALID_TICKET_BODY}\n\nThis change is blocked by ORB-1.`) },
    )
    check(
      "check-ticket.mjs",
      "an issue named anywhere in Dependencies requires a blockedBy relation",
      ["--issue", "ORB-113"],
      { status: 1, stderr: /body PROSE mentions a dependency/ },
      { env: issueStub(["repo:api", "Improvement"], `${VALID_TICKET_BODY}\n\n## Dependencies\n\nRequires ORB-112.`) },
    )
    check(
      "check-ticket.mjs",
      "a Dependencies section with no issue and no dependency phrase is accepted",
      ["--issue", "ORB-113"],
      { status: 0, stdout: /ticket ok/ },
      { env: issueStub(["repo:api", "Improvement"], `${VALID_TICKET_BODY}\n\n## Dependencies\n\nNo cross-ticket relation is required.`) },
    )
    check(
      "check-ticket.mjs",
      "a dependency-free Dependencies section may use ordinary signal words",
      ["--issue", "ORB-113"],
      { status: 0, stdout: /ticket ok/ },
      {
        env: issueStub(
          ["repo:api", "Improvement"],
          `${VALID_TICKET_BODY}\n\nNo server restart is expected; a cache flush is required if that changes.\n\n## Dependencies\n\nNone. This can proceed once the security review completes.`,
        ),
      },
    )
    check(
      "check-ticket.mjs",
      "a named dependency with its blockedBy relation is accepted",
      ["--issue", "ORB-113"],
      { status: 0, stdout: /ticket ok/ },
      {
        env: issueStub(
          ["repo:api", "Improvement"],
          `${VALID_TICKET_BODY}\n\n## Dependencies\n\nRequires ORB-112.`,
          [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-112" } }],
        ),
      },
    )
    const ledgerIssue = (line) => ({
      ...VALID_ISSUE,
      description: `${VALID_TICKET_BODY}\n\n${line}`,
      parent: { identifier: "ORB-140", title: "Harness defect ledger from the recorded run" },
    })
    const checkIssue = (name, issue, expect, relations = [], env = {}) =>
      check(
        "check-ticket.mjs",
        name,
        ["--issue", issue.identifier],
        expect,
        {
          env: {
            ...orcaEnv([{ match: `linear issue ${issue.identifier}`, stdout: JSON.stringify({ ok: true, result: { issue, relations } }) }]),
            ...env,
          },
        },
      )

    checkIssue("a ledger child with 7 occurrences passes", ledgerIssue("Ledger occurrence: 7; blocked: no"), { status: 0, stdout: /ticket ok/ })
    checkIssue("a ledger child at the threshold of 3 occurrences passes", ledgerIssue("Ledger occurrence: 3; blocked: no"), { status: 0, stdout: /ticket ok/ })
    checkIssue(
      "a non-blocking ledger child below the threshold fails with the count and threshold",
      ledgerIssue("Ledger occurrence: 2; blocked: no"),
      { status: 1, stderr: /2[\s\S]*threshold of 3/i },
    )
    for (const alias of [
      "false",
      "none",
      "n/a",
      "no.",
      "nothing",
      "did not block the run",
      "the defect could not block the run",
      "the defect could not have blocked the run",
      "the merge sweep was blocked by nothing",
      "prevented the merge sweep from being blocked",
    ]) {
      checkIssue(
        `a non-blocking ${alias} alias cannot bypass the threshold`,
        ledgerIssue(`Ledger occurrence: 2; blocked: ${alias}`),
        { status: 1, stderr: /literal no or an affirmative claim naming what it blocked/i },
      )
    }
    checkIssue(
      "a below-threshold ledger child passes when it names what blocked the run",
      ledgerIssue("Ledger occurrence: 2; blocked: the merge sweep was blocked"),
      { status: 0, stdout: /ticket ok/ },
    )
    checkIssue(
      "a bare blocking claim does not bypass the threshold",
      ledgerIssue("Ledger occurrence: 2; blocked: yes"),
      { status: 1, stderr: /literal no or an affirmative claim naming what it blocked/i },
    )
    checkIssue(
      "a bare blocking claim is rejected above the occurrence threshold",
      ledgerIssue("Ledger occurrence: 5; blocked: true"),
      { status: 1, stderr: /literal no or an affirmative claim naming what it blocked/i },
    )
    for (const claim of [
      "blocked the merge sweep",
      "the merge sweep was blocked",
    ]) {
      checkIssue(
        `an affirmative ${claim} claim passes below the threshold`,
        ledgerIssue(`Ledger occurrence: 2; blocked: ${claim}`),
        { status: 0, stdout: /ticket ok/ },
      )
    }
    checkIssue(
      "a ledger child with no occurrence line fails",
      { ...VALID_ISSUE, parent: { identifier: "ORB-140", title: "Harness defect ledger from the recorded run" } },
      { status: 1, stderr: /missing[\s\S]*Ledger occurrence/i },
    )
    checkIssue(
      "a recorded non-ledger child ticket is unaffected",
      { ...VALID_ISSUE, parent: { identifier: "ORB-88", title: "Ordinary project parent" } },
      { status: 0, stdout: /ticket ok/ },
    )
    checkIssue(
      "an unparseable ledger occurrence line fails",
      ledgerIssue("Ledger occurrence: several; blocked: no"),
      { status: 1, stderr: /ledger occurrence line is unparseable/i },
    )
    const noLinearKeyHome = join(root, "check-ticket-no-linear-key")
    mkdirSync(noLinearKeyHome, { recursive: true })
    const ledgerParentRelation = [{
      relationship: "parent",
      relatedIssue: { identifier: "ORB-140", title: "Harness defect ledger from the recorded run" },
    }]
    checkIssue(
      "an Orca parent relation validates without a separate Linear key",
      {
        ...VALID_ISSUE,
        id: "linear-child-id",
        description: `${VALID_TICKET_BODY}\n\nLedger occurrence: 3; blocked: no`,
      },
      { status: 0, stdout: /ticket ok/ },
      ledgerParentRelation,
      { USERPROFILE: noLinearKeyHome },
    )
    checkIssue(
      "an Orca ledger parent relation still requires the occurrence line",
      { ...VALID_ISSUE, id: "linear-child-without-line" },
      { status: 1, stderr: /missing[\s\S]*Ledger occurrence/i },
      ledgerParentRelation,
      { USERPROFILE: noLinearKeyHome },
    )
    checkIssue(
      "a standalone Orca issue validates without a separate Linear key",
      { ...VALID_ISSUE, id: "linear-standalone-id" },
      { status: 0, stdout: /ticket ok/ },
      [],
      { USERPROFILE: noLinearKeyHome },
    )
    const linearKeyHome = join(root, "check-ticket-linear-key")
    mkdirSync(linearKeyHome, { recursive: true })
    writeFileSync(join(linearKeyHome, ".linear-api-key"), "fixture-key")
    const partialParentRelation = [{
      relationship: "parent",
      relatedIssue: { identifier: "ORB-140" },
    }]
    checkIssue(
      "a partial Orca parent relation uses the bounded Linear fallback",
      {
        ...VALID_ISSUE,
        id: "linear-partial-parent",
        description: `${VALID_TICKET_BODY}\n\nLedger occurrence: 3; blocked: no`,
      },
      { status: 0, stdout: /ticket ok/ },
      partialParentRelation,
      {
        USERPROFILE: linearKeyHome,
        ORBIT_LINEAR_PARENT_STUB: JSON.stringify({
          requireTimeout: true,
          body: {
            data: {
              issue: {
                parent: { identifier: "ORB-140", title: "Harness defect ledger from the recorded run" },
              },
            },
          },
        }),
      },
    )
    checkIssue(
      "a Linear parent GraphQL error exits with a tool error",
      { ...VALID_ISSUE, id: "linear-parent-error" },
      { status: 2, stderr: /could not read the Linear parent relation[\s\S]*fixture GraphQL failure/i },
      partialParentRelation,
      {
        USERPROFILE: linearKeyHome,
        ORBIT_LINEAR_PARENT_STUB: JSON.stringify({
          status: 200,
          body: { errors: [{ message: "fixture GraphQL failure" }] },
        }),
      },
    )
  },
  "check-push-target.mjs": () => {
    check("check-push-target.mjs", "a push to main is blocked", [], { status: 1, stderr: /BLOCKED/ }, { input: "refs/heads/main abc refs/heads/main def\n" })
    check("check-push-target.mjs", "a push to a feature branch is allowed", [], { status: 0 }, { input: "refs/heads/feature/x abc refs/heads/feature/x def\n" })
  },
  "check-frontmatter.mjs": () => {
    check("check-frontmatter.mjs", "runs from any cwd", [], { status: 0, stdout: /frontmatter ok/ }, { cwd: root })
    stage("frontmatter-valid/SKILL.md", "---\nname: valid\ndescription: A parseable skill.\n---\n")
    check("check-frontmatter.mjs", "accepts a custom root relative to the caller", ["--root", "frontmatter-valid"], { status: 0, stdout: /frontmatter ok: 1/ }, { cwd: root })
    const malformedRoot = dirname(stage("frontmatter-malformed/SKILL.md", "---\nname: malformed\ndescription: This breaks: the description will not parse.\n---\n"))
    check("check-frontmatter.mjs", "rejects an unquoted colon-space scalar in a custom root", ["--root", malformedRoot], { status: 1, stderr: /SKILL\.md  \[description\]/ })
    check("check-frontmatter.mjs", "rejects a missing custom root", ["--root", join(root, "frontmatter-missing")], { status: 2, stderr: /root does not exist/ })
    const noFrontmatterRoot = dirname(stage("frontmatter-absent/README.md", "# No frontmatter\n"))
    check("check-frontmatter.mjs", "rejects a custom root that proves nothing", ["--root", noFrontmatterRoot], { status: 1, stderr: /No frontmatter found/ })
  },
  "check-calibration.mjs": calibrationCases,
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
  "check-lockstep.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
  "check-push-target.mjs": { argv: ["--orbit-not-a-flag"], status: 2 },
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
  `no COVERAGE entry for: ${uncovered.join(", ")}\n     Add one to INVALID_INPUT (and a gateCases entry if it has decision paths) in tools/${SELF}.`,
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
for (const [file, cases] of Object.entries(gateCases)) {
  if (!existsSync(join(TOOLS_DIR, file))) continue
  await cases()
}

console.log(`\n${fails === 0 ? "ORBIT TOOLS GATE OK" : `ORBIT TOOLS GATE FAILED (${fails})`}`)
process.exit(fails === 0 ? 0 : 1)
