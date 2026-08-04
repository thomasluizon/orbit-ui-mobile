/**
 * The shared prelude every harness case module imports: the reporter, the temp fixture
 * root, the process runners, and the stubs that keep the suite hermetic.
 *
 * TOOLS_DIR is NOT derived here. tools/test-tools.mjs resolves it once from its own
 * location and calls configure() before loading a single case module, so a case body can
 * never silently resolve tools/__tests__ as the tools directory.
 */

import { spawnHidden as spawn, spawnSyncHidden as spawnSync } from "../lib/subprocess-options.mjs"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"

import {
  issueReviewProvenance,
} from "../lib/review-provenance.mjs"
import {
  recordWorkerLaunch,
  signWorkerLaunchRecord,
  workerCompletionSigningPayload,
  WORKER_LAUNCH_AUTHORITY_PRIVATE_KEY_ENV,
  WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY_ENV,
} from "../lib/worker-launch-provenance.mjs"

/**
 * Injected by the runner. These are live bindings: configure() runs before any case
 * module is imported, so every module reads the runner's own resolution.
 */
export let TOOLS_DIR = ""
export let REPO_ROOT = ""
export let SELF = ""

export const configure = ({ toolsDir, self }) => {
  TOOLS_DIR = toolsDir
  REPO_ROOT = resolve(toolsDir, "..")
  SELF = self
}

/** The one path helper case modules use, so injection failure surfaces as a wrong path. */
export const toolPath = (file) => join(TOOLS_DIR, file)

/** Case keys naming a file that is not in tools/. A skip here would exit 0 on a typo. */
export const orphanCaseKeys = (caseKeys, toolsDir) => caseKeys.filter((file) => !existsSync(join(toolsDir, file)))

export const EM_DASH = String.fromCharCode(0x2014)

let fails = 0

/**
 * Every assertion is attributed to a tool, so the coverage ratchet can see a case body that
 * stopped running. Attribution prefers the `<tool>.<ext>:` prefix the reporter names carry,
 * because one case module owns both merge sweeps; it falls back to whichever module the runner
 * is currently driving, and finally to the runner itself for the structural checks.
 */
const TOOL_PREFIX = /^([A-Za-z0-9_.-]+\.(?:mjs|sh|ps1)):/
export const RUNNER_TALLY_KEY = "(runner)"
const tally = new Map()
let currentScope = null

export const beginToolScope = (tool) => {
  currentScope = tool
}
export const endToolScope = () => {
  currentScope = null
}
export const assertionTally = () => Object.fromEntries(tally)

export const T = (name, ok, detail = "") => {
  if (!ok) fails++
  const tool = TOOL_PREFIX.exec(name)?.[1] ?? currentScope ?? RUNNER_TALLY_KEY
  tally.set(tool, (tally.get(tool) ?? 0) + 1)
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `\n     ${detail}`}`)
}

export const root = mkdtempSync(join(tmpdir(), "orbit-tools-gate-"))
process.env.ORBIT_HARNESS_TEST = "1"
export const REVIEW_EVIDENCE_LEDGER = join(root, "review-provenance.jsonl")
export const WORKER_LAUNCH_LEDGER = join(root, "worker-launches.jsonl")

const reviewAuthority = generateKeyPairSync("ed25519")
export const REVIEW_AUTHORITY_PRIVATE_KEY = reviewAuthority.privateKey.export({ format: "pem", type: "pkcs8" })
export const REVIEW_AUTHORITY_PUBLIC_KEY = reviewAuthority.publicKey.export({ format: "der", type: "spki" }).toString("base64")
const workerLaunchAuthority = generateKeyPairSync("ed25519")
export const WORKER_LAUNCH_AUTHORITY_PRIVATE_KEY = workerLaunchAuthority.privateKey.export({ format: "pem", type: "pkcs8" })
export const WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY = workerLaunchAuthority.publicKey.export({ format: "der", type: "spki" }).toString("base64")
export { WORKER_LAUNCH_AUTHORITY_PRIVATE_KEY_ENV, WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY_ENV }
process.env[WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY_ENV] = WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY
process.env[WORKER_LAUNCH_AUTHORITY_PRIVATE_KEY_ENV] = WORKER_LAUNCH_AUTHORITY_PRIVATE_KEY

export const writeCompletedWorkerLaunch = ({
  issue,
  branch,
  head,
  worktreePath = join(root, "worker-delivery", issue, branch.replace(/[^A-Za-z0-9_.-]/g, "_")),
  engine = "codex",
  invocation = {
    command: "codex",
    args: ["exec", "-c", 'windows.sandbox="unelevated"', "--dangerously-bypass-approvals-and-sandbox"],
  },
  launchMode = "existing-worktree",
} = {}) => {
  const authorityPublicKey = WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY
  const privateKey = WORKER_LAUNCH_AUTHORITY_PRIVATE_KEY
  let launchRecord = {
    version: 1,
    launchId: `fixture-${issue}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    issue,
    worktreePath: resolve(worktreePath),
    pid: process.pid,
    startedAt: new Date(Date.now() - 1000).toISOString(),
    launchMode,
    engine,
    invocation,
    branch,
    launcherPid: process.pid,
    issuedAt: new Date(Date.now() - 1000).toISOString(),
    completionAttestation: {
      algorithm: "ed25519",
      publicKey: authorityPublicKey,
    },
  }
  launchRecord = signWorkerLaunchRecord(launchRecord, privateKey)
  const unsignedCompletion = { completedAt: new Date().toISOString(), completedHead: head, exitCode: 0 }
  const completion = {
    ...unsignedCompletion,
    signature: sign(
      null,
      Buffer.from(workerCompletionSigningPayload(launchRecord, unsignedCompletion), "utf8"),
      privateKey,
    ).toString("base64"),
  }
  const completedRecord = { ...launchRecord, completion }
  recordWorkerLaunch(launchRecord, WORKER_LAUNCH_LEDGER, authorityPublicKey)
  recordWorkerLaunch(completedRecord, WORKER_LAUNCH_LEDGER, authorityPublicKey)
  return { launchRecord, completedRecord }
}

export const reviewMarker = ({ head, recommendation, findingIds = [], repository = "orbit/ui", pullRequest = 615, reviewNodeId = "PRR_local_review" }) => {
  const provenance = issueReviewProvenance({
    repository,
    pullRequest,
    head,
    reviewNodeId,
    recommendation,
    findingIds,
    ledgerPath: REVIEW_EVIDENCE_LEDGER,
    privateKey: REVIEW_AUTHORITY_PRIVATE_KEY,
  })
  return `<!-- orbit-local-review: ${JSON.stringify({ version: 1, head, recommendation, provenance })} -->`
}

export const forgedReviewMarker = ({ head, recommendation, findingIds = [], repository = "orbit/ui", pullRequest = 615 }) =>
  `<!-- orbit-local-review: ${JSON.stringify({
    version: 1,
    head,
    recommendation,
    provenance: {
      version: 1,
      issuer: "tools/launch-pr-review.mjs",
      evidenceId: "forged-review-evidence",
      repository,
      pullRequest,
      signature: "A".repeat(88),
      findingIds,
    },
  })} -->`

process.on("exit", () => {
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    /* a transient lock on the fixture root must never mask the suite's verdict */
  }
})

export const stage = (relativePath, body) => {
  const path = join(root, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
  return path
}

export const LOCKSTEP_PATHS = [
  ".claude/skills/pr-review/SKILL.md",
  ".claude/skills/pr-review/rubric.md",
  ".claude/skills/_shared/verification-protocol.md",
  ".claude/agents/contract-aligner.md",
  ".claude/agents/security-reviewer.md",
  ".claude/skills/second-opinion/second-opinion.mjs",
]

export const lockstepFingerprint = (ui, api) =>
  createHash("sha256").update(JSON.stringify({ ui: [ui], api: [api] })).digest("hex")

export const lockstepFixture = (label, uiBody = "shared\n", apiBody = uiBody, declarations = []) => {
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

export const lockstepDefaultApiFixture = (label) => {
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
export const resolveBash = () => {
  const candidates = [
    process.env.ORBIT_BASH,
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "bash",
  ].filter(Boolean)
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" })
    if (!probe.error && probe.status === 0) return candidate
  }
  return null
}

export const BASH = resolveBash()

let linearEnvelopeManifest

const linearEnvelopes = () => {
  if (!linearEnvelopeManifest) {
    linearEnvelopeManifest = JSON.parse(readFileSync(join(TOOLS_DIR, "__fixtures__", "orca-linear-envelopes.json"), "utf8"))
  }
  return linearEnvelopeManifest.commands
}

const jsonType = (value) => {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value === "object" ? "object" : typeof value
}

const STATE_TYPES = new Set(["triage", "backlog", "unstarted", "started", "completed", "canceled", "duplicate"])
const RELATIONSHIPS = new Set(["blocks", "blockedBy", "relatedTo", "duplicateOf"])

const assertRecordedLinearValue = (command, value, recordedPaths, path = "$") => {
  const actualType = jsonType(value)
  const recorded = recordedPaths[path]
  if (!recorded) throw new Error(`orca fixture ${command} asserts unrecorded key ${path}`)
  if (!recorded.types.includes(actualType)) {
    const expected = recorded.types.join(" | ")
    throw new Error(`orca fixture ${command} asserts type ${actualType} at ${path}; recorded types: ${expected}`)
  }
  if (/\.state\.type$/.test(path) && typeof value === "string" && !STATE_TYPES.has(value)) {
    throw new Error(`orca fixture ${command} asserts unsupported enum at ${path}: ${JSON.stringify(value)}`)
  }
  if (/\.relations\[\]\.relationship$/.test(path) && typeof value === "string" && !RELATIONSHIPS.has(value)) {
    throw new Error(`orca fixture ${command} asserts unsupported enum at ${path}: ${JSON.stringify(value)}`)
  }
  if (actualType === "array") {
    for (const item of value) assertRecordedLinearValue(command, item, recordedPaths, `${path}[]`)
    return
  }
  if (actualType !== "object") return
  for (const [key, child] of Object.entries(value)) {
    assertRecordedLinearValue(command, child, recordedPaths, `${path}.${key}`)
  }
}

const linearEnvelopeName = (command, response) => {
  if (response?.ok === false || response?.error) {
    if (/\blinear\s+create\b/.test(command)) return "createError"
    if (/\blinear\s+team\s+labels\b/.test(command)) return "teamLabelsError"
    if (/\blinear\s+issue\b/.test(command)) return "issueError"
    return null
  }
  if (/\blinear\s+status\s+set\b/.test(command)) return "statusSet"
  if (/\blinear\s+create\b/.test(command)) return "create"
  if (/\blinear\s+list-issues\b/.test(command)) return "listIssues"
  if (/\blinear\s+team\s+labels\b/.test(command)) return "teamLabels"
  if (!/\blinear\s+issue\b/.test(command)) return null
  if (/\s--full(?:\s|$)/.test(command)) return "issueFull"
  if (/\s--attachments(?:\s|$)/.test(command) || Object.hasOwn(response?.result ?? {}, "attachments")) return "issueAttachments"
  if (/\s--comments(?:\s|$)/.test(command) || Object.hasOwn(response?.result ?? {}, "comments")) return "issueComments"
  if (/\s--relations(?:\s|$)/.test(command) || Object.hasOwn(response?.result ?? {}, "relations")) return "issueRelations"
  return "issueDefault"
}

const assertOrcaLinearStub = (entry, stdout) => {
  const command = String(entry.match)
  if (!/\blinear\s+/.test(command)) return
  let response
  let parsedJson = false
  try {
    response = JSON.parse(stdout)
    parsedJson = true
  } catch {
    response = null
  }
  const envelopeName = linearEnvelopeName(command, response)
  if (!envelopeName) throw new Error(`orca fixture ${command} has no recorded invocation envelope`)
  if (!parsedJson) {
    if (entry.allowNonJsonLinear === true) return
    throw new Error(`orca fixture ${command} has non-JSON stdout without allowNonJsonLinear: true`)
  }
  const envelope = linearEnvelopes()[envelopeName]
  if (!envelope) throw new Error(`orca fixture ${command} has no recorded invocation envelope (${envelopeName})`)
  assertRecordedLinearValue(command, response, envelope.paths)
}

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
export const ORCA_SHIM = stage(
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
if (match.pruneRepo) spawnSync("git", ["-C", match.pruneRepo, "worktree", "prune"], { windowsHide: true })
let out = match.stdout
let exit = match.exit ?? 0
if (line.includes("worktree ps") && process.env.ORBIT_ENUMERATION_ACTIVITY_MARKER && existsSync(process.env.ORBIT_ENUMERATION_ACTIVITY_MARKER)) {
  try {
    const payload = JSON.parse(out)
    const result = payload.result ?? payload
    const target = process.env.ORBIT_ENUMERATION_ACTIVITY_PATH
    for (const row of result.worktrees ?? []) {
      if (row.path === target) {
        row.isActive = true
        row.agents = [{ state: "working" }]
      }
    }
    out = JSON.stringify(payload)
  } catch {
    /* The production parser reports malformed envelopes; leave the fixture untouched here. */
  }
}
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
export const orcaEnv = (plan) => {
  for (const entry of plan) {
    const outputs = Array.isArray(entry.sequence)
      ? entry.sequence.map((item) => (typeof item === "string" ? item : item.stdout))
      : [entry.stdout]
    if (outputs.length === 0) outputs.push(undefined)
    for (const stdout of outputs) assertOrcaLinearStub(entry, stdout)
  }
  return {
    ORCA_BIN: process.execPath,
    GH_BIN: process.execPath,
    NODE_OPTIONS: `--require "${ORCA_SHIM.replaceAll("\\", "/")}"`,
    ORBIT_ORCA_STUB: JSON.stringify(plan),
  }
}

export const MERGE_SWEEP_GH_DIR = join(root, "merge-sweep-bin")

export const MERGE_SWEEP_GH = stage(
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
// Emulates \`gh api --jq\` for the workflow-list lookup rather than answering it blindly. The
// fixture rows carry a real \`state\` and the filter the caller actually passed decides what is
// emitted, so a sweep selecting on \`.path\` alone still sees a non-active workflow. Answering
// this call with empty stdout pinned the detector in its absent branch and left the armed branch
// unreachable by any case. Row states must be ones the LIST endpoint really returns: a deleted
// workflow is dropped from it entirely (observed on orbit-api deploy.yml), so \`deleted\` is not a
// legal row here; \`disabled_manually\` is (observed on dep-sweep-reminder.yml).
if (line.includes("/actions/workflows")) {
  if (process.env.ORBIT_MERGE_SWEEP_WORKFLOWS_LOOKUP_FAILURE) process.exit(7)
  const jqIndex = argv.indexOf("--jq")
  const activeOnly = jqIndex !== -1 && argv[jqIndex + 1].includes('select(.state == "active")')
  const rows = (process.env.ORBIT_MERGE_SWEEP_WORKFLOWS || "").split("\\n").filter(Boolean).map((row) => row.split("\\t"))
  process.stdout.write(rows.filter((row) => !activeOnly || row[1] === "active").map((row) => row[0]).join("\\n"))
  process.exit(0)
}
if (argv[0] === "pr" && argv[1] === "update-branch") {
  if (process.env.ORBIT_MERGE_SWEEP_UPDATED_HEAD) writeFileSync(updateMarker, "")
  process.exit(0)
}
if (argv[0] === "api" && argv[1] === "graphql" && line.includes("files(first:100)")) {
  if (process.env.ORBIT_MERGE_SWEEP_APPROVAL_LOOKUP_FAILURE) process.exit(7)
  process.stdout.write(process.env.ORBIT_MERGE_SWEEP_APPROVAL_COMMITS)
  process.exit(0)
}
if (argv[0] === "api" && argv[1] === "graphql" && line.includes("commit{oid}")) {
  if (process.env.ORBIT_MERGE_SWEEP_APPROVAL_LOOKUP_FAILURE) process.exit(7)
  const approvals = process.env.ORBIT_MERGE_SWEEP_APPROVAL_COMMITS
  process.stdout.write(approvals === "__HEAD__" ? currentHead() : approvals)
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
    // Once the review workflow is deleted no run ever posts this check again, so its ABSENCE is the
    // permanent live shape and has to be expressible. Emitting it unconditionally meant every case
    // read reviewCheck=SETTLED and none could reach the ABSENT branch the detector governs.
    const checks = process.env.ORBIT_MERGE_SWEEP_REVIEW_CHECK_ABSENT
      ? []
      : [{ name: "review", status: process.env.ORBIT_MERGE_SWEEP_REVIEW_RUNNING ? "IN_PROGRESS" : "COMPLETED", conclusion: process.env.ORBIT_MERGE_SWEEP_REVIEW_RUNNING ? "" : "SUCCESS" }]
    if (process.env.ORBIT_MERGE_SWEEP_FAIL_NEW_HEAD) checks.push({ name: "new-head-gate", status: "COMPLETED", conclusion: "FAILURE" })
    if (process.env.ORBIT_MERGE_SWEEP_SONAR === "success") {
      checks.push({ name: "SonarCloud Code Analysis", status: "COMPLETED", conclusion: "SUCCESS" })
    }
    if (process.env.ORBIT_MERGE_SWEEP_SONAR === "coverage-failure") {
      checks.push({ name: "SonarCloud Code Analysis", status: "COMPLETED", conclusion: "FAILURE" })
    }
    process.stdout.write(JSON.stringify({
      mergeStateStatus: process.env.ORBIT_MERGE_SWEEP_STATE,
      reviewDecision: process.env.ORBIT_MERGE_SWEEP_REVIEW_DECISION,
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

const MERGE_SWEEP_LINEAR_ISSUE_RESPONSE = { ok: true, result: { issue: { state: { name: "In Review" } } } }
const MERGE_SWEEP_LINEAR_STATUS_RESPONSE = {
  ok: true,
  result: {
    issue: { id: "issue-150", identifier: "ORB-150", url: "https://linear.app/orbit/issue/ORB-150" },
    state: { id: "state-review", name: "In Review", type: "started" },
    previousState: { id: "state-progress", name: "In Progress" },
    meta: {},
  },
}

export const MERGE_SWEEP_ORCA = stage(
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
  const response = ${JSON.stringify(MERGE_SWEEP_LINEAR_ISSUE_RESPONSE)}
  response.result.issue.state.name = state
  process.stdout.write(JSON.stringify(response))
  process.exit(0)
}
if (argv[0] === "linear" && argv[1] === "status" && argv[2] === "set") {
  if (process.env.ORBIT_MERGE_SWEEP_LINEAR_REASSERT_FAILURE) process.exit(7)
  process.stdout.write(${JSON.stringify(JSON.stringify(MERGE_SWEEP_LINEAR_STATUS_RESPONSE))})
  process.exit(0)
}
process.exit(9)
`,
)

chmodSync(MERGE_SWEEP_ORCA, 0o755)

export const MERGE_SWEEP_BASH_ENV = stage("merge-sweep-bin/bash-env", "sleep() { :; }\n")

export const mergeSweepEnv = ({
  approvalCommits = "__HEAD__",
  approvalLookupFailure = false,
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
  reviewCheckAbsent = false,
  // Live on 2026-07-31 this reads "" for an APPROVED pull request, because
  // `required_approving_review_count` is 0 in both repositories. APPROVED is kept as the DEFAULT
  // deliberately: it is the strictly stronger premise for the A2 refusal cases, which exist to
  // show a refusal happening WITH the most positive PR-level signal in hand. The live "" value is
  // asserted by its own cases rather than by moving this default.
  reviewDecision = "APPROVED",
  // Lines of `path<TAB>state`, exactly as GitHub reports them. Empty means the repository lists no
  // workflows at all, which is what every pre-existing case assumed without saying so.
  workflows = "",
  workflowsLookupFailure = false,
  threadsLookupFailure = false,
  unresolvedThreads = "0",
  updatedHead = "",
  updateParents = "",
  log,
}) => {
  assertOrcaLinearStub("linear issue ORB-150 --json", JSON.stringify(MERGE_SWEEP_LINEAR_ISSUE_RESPONSE))
  assertOrcaLinearStub("linear status set ORB-150 --to In Review --json", JSON.stringify(MERGE_SWEEP_LINEAR_STATUS_RESPONSE))
  return {
    BASH_ENV: MERGE_SWEEP_BASH_ENV,
    PATH: `${MERGE_SWEEP_GH_DIR}${delimiter}${process.env.PATH}`,
    ORBIT_MERGE_SWEEP_APPROVAL_COMMITS: approvalCommits,
    ORBIT_MERGE_SWEEP_APPROVAL_LOOKUP_FAILURE: approvalLookupFailure ? "1" : "",
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
    ORBIT_MERGE_SWEEP_REVIEW_CHECK_ABSENT: reviewCheckAbsent ? "1" : "",
    ORBIT_MERGE_SWEEP_REVIEW_DECISION: reviewDecision,
    ORBIT_MERGE_SWEEP_WORKFLOWS: workflows,
    ORBIT_MERGE_SWEEP_WORKFLOWS_LOOKUP_FAILURE: workflowsLookupFailure ? "1" : "",
    ORBIT_MERGE_SWEEP_REVIEWS_LOOKUP_FAILURE: reviewsLookupFailure ? "1" : "",
    ORBIT_MERGE_SWEEP_REVIEWS_PAGE_TWO: reviewsPageTwo,
    ORBIT_MERGE_SWEEP_REVIEW_TIMES: reviewTimes,
    ORBIT_MERGE_SWEEP_SONAR: sonar,
    ORBIT_MERGE_SWEEP_STATE: state,
    ORBIT_MERGE_SWEEP_THREADS_LOOKUP_FAILURE: threadsLookupFailure ? "1" : "",
    ORBIT_MERGE_SWEEP_UNRESOLVED_THREADS: unresolvedThreads,
    ORBIT_MERGE_SWEEP_UPDATED_HEAD: updatedHead,
    ORBIT_MERGE_SWEEP_UPDATE_PARENTS: updateParents,
  }
}

export const mergeSweepCalls = (log) =>
  existsSync(log)
    ? readFileSync(log, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : []

let processRunSequence = 0

const killProcessTree = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { encoding: "utf8", windowsHide: true })
    if (result.status === 0) return
    try {
      process.kill(pid)
    } catch {
      /* the target may have exited between taskkill and the fallback */
    }
    return
  }
  try {
    process.kill(-pid, "SIGTERM")
  } catch {
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      /* the target may have exited before the tree kill */
    }
  }
}

const pathInsideHarnessRoot = (path) => {
  const normalizedRoot = resolve(root).toLowerCase()
  const normalizedPath = resolve(path).toLowerCase()
  const separator = process.platform === "win32" ? "\\" : "/"
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${separator}`)
}

export const run = (file, argv, options = {}) => {
  const target = options.path ?? join(TOOLS_DIR, file)
  const invocation = file.endsWith(".mjs")
    ? [process.execPath, [target, ...argv]]
    : file.endsWith(".sh")
      ? [BASH, [target, ...argv]]
      : ["pwsh", ["-NoProfile", "-File", target, ...argv]]
  const timeoutMs = options.timeoutMs ?? 180000
  const cleanupPath = options.cleanupPath ? resolve(options.cleanupPath) : null
  if (cleanupPath && (cleanupPath === resolve(root) || !pathInsideHarnessRoot(cleanupPath))) {
    throw new Error(`run cleanupPath must be a child of the harness root: ${cleanupPath}`)
  }
  const processRunRoot = join(root, "process-runs", String(++processRunSequence))
  mkdirSync(processRunRoot, { recursive: true })
  const controlPath = join(processRunRoot, "control.json")
  const resultPath = join(processRunRoot, "result.json")
  const pidPath = join(processRunRoot, "child.pid")
  const environment = {
    ...process.env,
    ORBIT_AUTOMATION_BUDGET_LEDGER: join(root, "default-automation-budget.jsonl"),
    ORBIT_LOCAL_REVIEW_PROVENANCE_LEDGER: REVIEW_EVIDENCE_LEDGER,
    ORBIT_WORKER_LAUNCH_LEDGER: WORKER_LAUNCH_LEDGER,
    ...(options.env ?? {}),
  }
  writeFileSync(
    controlPath,
    JSON.stringify({
      command: invocation[0],
      args: invocation[1],
      cwd: options.cwd ?? REPO_ROOT,
      env: environment,
      input: options.input ?? "",
      timeoutMs,
      resultPath,
      pidPath,
      processTreeObservation: options.processTreeObservation,
    }),
  )
  const runner = spawnSync(process.execPath, [join(TOOLS_DIR, "__tests__", "_process-tree-runner.mjs"), controlPath], {
    cwd: REPO_ROOT,
    stdio: "ignore",
    timeout: timeoutMs + 5000,
    windowsHide: true,
  })
  let result = null
  try {
    result = JSON.parse(readFileSync(resultPath, "utf8"))
  } catch {
    /* the runner can be killed before it writes a result; use the PID fallback below */
  }
  if (!result && existsSync(pidPath)) {
    const pid = Number(readFileSync(pidPath, "utf8"))
    killProcessTree(pid)
  }
  try {
    rmSync(processRunRoot, { recursive: true, force: true })
  } catch {
    /* a target that outlived the runner must not hide the original harness result */
  }
  if (cleanupPath) {
    try {
      rmSync(cleanupPath, { recursive: true, force: true })
    } catch {
      /* fixture cleanup is best effort after the exact process tree is gone */
    }
  }
  if (!result) {
    return {
      status: runner.error ? `spawn error: ${runner.error.message}` : `spawn error: process runner exited ${runner.status}`,
      stdout: "",
      stderr: "",
    }
  }
  return {
    status: result.timedOut ? "timed out" : result.error ? `spawn error: ${result.error}` : result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    processTree: result.processTree ?? null,
  }
}

export const runAsync = (file, argv, options = {}) => {
  const target = options.path ?? join(TOOLS_DIR, file)
  const child = spawn(process.execPath, [target, ...argv], {
    cwd: options.cwd ?? REPO_ROOT,
    env: {
      ...process.env,
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(root, "default-automation-budget.jsonl"),
      ORBIT_LOCAL_REVIEW_PROVENANCE_LEDGER: REVIEW_EVIDENCE_LEDGER,
      ORBIT_WORKER_LAUNCH_LEDGER: WORKER_LAUNCH_LEDGER,
      ...(options.env ?? {}),
    },
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

export const check = (file, name, argv, expect, options = {}) => {
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

export const DEFAULT_AUTOMATION_BUDGET = {
  tier: "routine",
  /**
   * The provider's own weekly usage is what refuses a launch; the token budget is the warning that
   * takes over only when that reading is UNAVAILABLE. Both live here because the launcher requires a
   * worker to declare the ceiling, so a fixture worker missing it fails validation rather than the
   * behaviour under test.
   */
  accountUsedPercentCeiling: 85,
  tokenBudget: 1_000_000,
  warningTokens: 800_000,
  invocationTokens: {
    default: 100_000,
    cheap: 50_000,
    deep: 250_000,
  },
}

export const orchestratorConfig = (repoPath, worker, engineName, maxParallelWorktrees = 8, maxSlicesPerWorker = 3) =>
  JSON.stringify({
    worker: engineName,
    workers: {
      [engineName]: {
        ...worker,
        automationBudget: worker.automationBudget ?? DEFAULT_AUTOMATION_BUDGET,
      },
    },
    maxParallelWorktrees,
    maxSlicesPerWorker,
    attemptsBeforeRewrite: 2,
    linear: { team: "ORB", states: { working: "In Progress", review: "In Review", done: "Done" } },
    repos: { ui: repoPath },
  })

export const CLAUDE_MODELS = {
  default: { model: "opus" },
  cheap: { model: "sonnet" },
  deep: { model: "opus", args: ["--effort", "max"] },
}

export const CODEX_MODELS = {
  default: { model: "gpt-5.6-terra", args: ["-c", 'model_reasoning_effort="medium"'] },
  cheap: { model: "gpt-5.6-luna", args: ["-c", 'model_reasoning_effort="low"'] },
  deep: { model: "gpt-5.6-sol", args: ["-c", 'model_reasoning_effort="high"'] },
}

export const INTERACTIVE_WORKER = {
  command: "claude",
  args: ["--permission-mode", "bypassPermissions"],
  models: CLAUDE_MODELS,
  interactive: true,
  automationBudget: DEFAULT_AUTOMATION_BUDGET,
}

export const INTERACTIVE_CODEX = {
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
export const stageLaunchWorker = (label, worker, engineName = "claude", maxParallelWorktrees = 8, maxSlicesPerWorker = 3) => {
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
    orchestratorConfig(repoPath, worker, engineName, maxParallelWorktrees, maxSlicesPerWorker),
  )
  cpSync(join(TOOLS_DIR, "launch-worker.mjs"), join(base, "tools", "launch-worker.mjs"))
  cpSync(join(TOOLS_DIR, "worker-supervisor.mjs"), join(base, "tools", "worker-supervisor.mjs"))
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

export const freshTierLabelSnapshot = (labels = PRESENT_TIER_LABELS) => ({
  schemaVersion: 1,
  team: "ORB",
  capturedAt: new Date().toISOString(),
  labels: [...new Set(labels)].sort(),
})

export const stageTierLabels = (
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

export const stageTierLabelRefresh = (label) => {
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

export const stagePreflight = (label, worker = { ...INTERACTIVE_CODEX, command: `"${process.execPath}"` }, engineName = "codex") => {
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

export const LINEAR_LABELS_COMMAND = "linear team labels --team ORB --json"
export const LINEAR_TEAM_REQUIRED_ERROR = JSON.stringify({
  ok: false,
  error: {
    code: "linear_team_required",
    message: "No connected Linear team matched 00000000-0000-0000-0000-000000000000.",
  },
})

export const linearLabelsResult = (labels) =>
  JSON.stringify({ ok: true, result: { labels: labels.map((name) => ({ name })) } })

export const PRESENT_TIER_LABELS = ["worker:sonnet", "tier:deep", "tier:cheap"]

export const PREFLIGHT_PASS_PLAN = [
  { match: "auth status", stdout: "logged in", exit: 0 },
  { match: "status --json", stdout: JSON.stringify({ ok: true, result: { runtime: { reachable: true } } }), exit: 0 },
  { match: LINEAR_LABELS_COMMAND, stdout: linearLabelsResult(PRESENT_TIER_LABELS), exit: 0 },
  { match: "branch --show-current", stdout: "main\n", exit: 0 },
  { match: "status --porcelain", stdout: "", exit: 0 },
]

export const preflightEnv = (plan) => ({
  ...orcaEnv(plan),
  GIT_BIN: process.execPath,
  NODE_BIN: process.execPath,
  NPM_BIN: process.execPath,
  DOTNET_BIN: process.execPath,
})

export const launchWorktreeStub = (path, isMainWorktree = false) => ({
  id: path,
  path,
  isMainWorktree,
  git: { path, isMainWorktree },
})

export const linearIssueStub = (labels, worktrees = []) => [
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
export const WORKER_CONTRACT_MARKER = "## Standing worker contract (injected by tools/launch-worker.mjs)"

export const ORCHESTRATOR_REVIEW_HANDOFF = /workers?[\s\S]*orchestrator-owned review|orchestrator[\s\S]*launches a fresh[\s\S]*review/i

export const NO_DRAFT_PULL_REQUEST_CLAUSE = "The pull request must be ready for review, never a draft."

/**
 * Each entry names the CLAUSE NUMBER it belongs to, because the pattern is matched inside that
 * clause's own block of the contract the launcher actually appended, never against the launcher
 * file as a string. Two defects made the old shape prove nothing:
 *
 *   1. `pattern.test(launcherSource)` passed with clause 3 deleted from WORKER_CONTRACT
 *      entirely and parked in a dead comment. Nothing the worker reads was asserted.
 *   2. `[\s\S]*` spanned clauses. The review-clear terminator ends clause 3 and recurs in clause
 *      5, so two tokens twenty lines apart satisfied a single clause.
 *
 * Block-scoped matching over the injected artifact closes both. Adding a clause here means
 * adding its number; a clause that moves must move here too, which is the point.
 */
export const REQUIRED_CONTRACT_CLAUSES = {
  "asking a question": { clause: 1, pattern: /Never ask a question/ },
  "verifying the unchanged ticket and brief": { clause: 1, pattern: /unchanged ticket[\s\S]*Sol execution brief[\s\S]*consistency failure/ },
  "implementing only the approved work order": { clause: 2, pattern: /Implement only the approved work order[\s\S]*Luna is the headless implementation worker[\s\S]*plan the DAG[\s\S]*mutate Linear[\s\S]*open or edit a pull request[\s\S]*publish a review[\s\S]*push[\s\S]*merge/ },
  "repairing only orchestrator-returned findings": { clause: 2, pattern: /returned\s+review\s+finding\s+may\s+be\s+repaired\s+only\s+when\s+Sol\s+passes[\s\S]*stable\s+identifier\s+and\s+evidence/ },
  "dropping a blocked criterion": { clause: 3, pattern: /A blocked criterion is explicit[\s\S]*unmet criterion[\s\S]*local completion report/ },
  "failing closed on unverified evidence": { clause: 3, pattern: /Do not\s+claim\s+that[\s\S]*a\s+gate\s+or\s+external\s+interface\s+was\s+verified/ },
  "escalating a disagreement": { clause: 4, pattern: /Escalate when a returned finding is disputed/ },
  "escalating a blocked decision": { clause: 4, pattern: /when you are[\s\S]*blocked\s+on\s+a\s+decision\s+reserved\s+for\s+Sol\s+or\s+Thomas/ },
  "escalating after two failed cycles": { clause: 4, pattern: /when\s+two\s+consecutive\s+repair\s+cycles\s+fail\s+on\s+the\s+same[\s\S]*finding/ },
  "ending at implementation handoff": { clause: 5, pattern: /Your job ends at a local implementation handoff[\s\S]*relevant local gates[\s\S]*git show --stat HEAD[\s\S]*Do not claim[\s\S]*pull request[\s\S]*review/ },
  "reporting the exact local commit": { clause: 5, pattern: /report\s+the\s+exact\s+commit\s+and\s+outcomes/ },
  "arming a detached monitor that outlives the contract": { clause: 6, pattern: /Never arm a detached background monitor/ },
  "permitting an affordable foreground blocking wait": { clause: 6, pattern: /foreground blocking wait is permitted/ },
  "merging or pushing any branch": { clause: 7, pattern: /Never merge any PR, never push any branch/ },
  "performing an admin merge": { clause: 7, pattern: /gh pr merge --admin[\s\S]*pulls\/\{number\}\/merge[\s\S]*mergePullRequest/ },
  "blanket staging that sweeps in a sibling's artifacts": { clause: 8, pattern: /Stage explicitly[\s\S]*git add -A/ },
  "reading back the local commit": { clause: 9, pattern: /Verify before handoff[\s\S]*git show --stat HEAD/ },
  "writing into another worker's worktree": { clause: 10, pattern: /Never write into another worktree/ },
  "owning implementation sequencing without extra roles": { clause: 11, pattern: /Own implementation sequencing directly[\s\S]*Do not create planning, review, or[\s\S]*coordinator roles[\s\S]*approved brief directly/ },
  "avoiding planning and approval loops": { clause: 12, pattern: /Do not create planning or approval loops[\s\S]*Sol owns the DAG[\s\S]*substantive pull request[\s\S]*consumes the brief/ },
}

/** The contract's numbered clauses, keyed by number. A clause is everything up to the next one. */
export const contractClauseBlocks = (contractText) => {
  const marks = [...contractText.matchAll(/^(\d+)\.\s/gm)]
  return Object.fromEntries(
    marks.map((mark, index) => [
      Number(mark[1]),
      contractText.slice(mark.index, index + 1 < marks.length ? marks[index + 1].index : contractText.length),
    ]),
  )
}

/** Clause names whose pattern does not match INSIDE its own clause block. */
export const missingContractClauses = (contractText) => {
  const blocks = contractClauseBlocks(contractText)
  return Object.entries(REQUIRED_CONTRACT_CLAUSES)
    .filter(([, { clause, pattern }]) => !pattern.test(blocks[clause] ?? ""))
    .map(([name]) => name)
}

/**
 * The trust screen as each CLI really paints it, verbatim, because the launcher matches this
 * text and nothing else once the wait comes back without a blockedReason. A regex that drifts
 * one character from these strings hangs a worker forever with nobody at the keyboard, which is
 * exactly what shipped: the claude alternation read "createdoron" against a real
 * "createdorone" and could never match. Review caught it; this is the coverage that should have.
 */
export const TRUST_SCREENS = {
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
export const stageCheckout = (base) => {
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
export const runTrustScreen = (label, engineName, tail) => {
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

/**
 * A worker's liveness is its launcher-written PID, not a terminal repaint: headless workers own
 * no terminal to repaint. `pid` must be a process this suite can prove alive or dead, so a live
 * case uses the harness's own PID and a dead case uses a probe process that has already exited.
 */
export const stageWorkerPidMarker = (worktreePath, pid) => {
  const gitDirectory = resolve(
    worktreePath,
    spawnSync("git", ["-C", worktreePath, "rev-parse", "--git-dir"], { encoding: "utf8" }).stdout.trim(),
  )
  const marker = join(gitDirectory, "orbit-worker-pids.jsonl")
  const authorityPublicKey = WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY
  const privateKey = WORKER_LAUNCH_AUTHORITY_PRIVATE_KEY
  let launchRecord = {
    version: 1,
    launchId: `fixture-${pid}-${Date.now()}`,
    issue: "ORB-124",
    worktreePath: resolve(worktreePath),
    pid,
    startedAt: new Date().toISOString(),
    launchMode: "existing-worktree",
    engine: "codex",
    invocation: {
      command: "codex",
      args: ["exec", "-c", 'windows.sandbox="unelevated"', "--dangerously-bypass-approvals-and-sandbox"],
    },
    branch: "feature/orb-124",
    launcherPid: process.pid,
    issuedAt: new Date().toISOString(),
    completionAttestation: {
      algorithm: "ed25519",
      publicKey: authorityPublicKey,
    },
  }
  launchRecord = signWorkerLaunchRecord(launchRecord, privateKey)
  recordWorkerLaunch(launchRecord, WORKER_LAUNCH_LEDGER, authorityPublicKey)
  writeFileSync(marker, `${JSON.stringify(launchRecord)}\n`)
  return marker
}

export const exitedProbePid = () => {
  const probe = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" })
  return probe.status === 0 ? Number(probe.stdout) : Number.NaN
}

export const budgetRecord = (identity, inputTokens, outputTokens, tier = "routine", engine = "claude", context = {}) =>
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

// new-ticket.mjs shells out to check-ticket.mjs, which makes its OWN orca call,
// so both legs are stubbed in one plan: `linear create` for the creation and
// `linear issue` for the validation the wrapper exists to perform. The shim
// stands aside for a real file path, so the nested node invocation still runs
// the real check-ticket.
export const VALID_TICKET_BODY = [
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

export const VALID_ISSUE = { identifier: "ORB-99", title: "Cover the create and validate round trip", description: VALID_TICKET_BODY, labels: [{ name: "repo:api" }, { name: "Improvement" }] }

export const failureCount = () => fails
