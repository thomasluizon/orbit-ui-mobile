import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  T,
  TOOLS_DIR,
  REVIEW_AUTHORITY_PUBLIC_KEY,
  WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY,
  WORKER_LAUNCH_LEDGER,
  mergeSweepCalls,
  mergeSweepEnv as baseMergeSweepEnv,
  reviewMarker,
  root,
  run,
  toolPath,
  writeCompletedWorkerLaunch,
} from "./_harness.mjs"

const EXPECTED_HEAD = "1111111111111111111111111111111111111111"
const CHANGED_HEAD = "2222222222222222222222222222222222222222"
const UPDATED_HEAD = "3333333333333333333333333333333333333333"
const BASE_TIP = "4444444444444444444444444444444444444444"
const REVIEWED_THROUGH = "2026-07-28T00:00:00Z"
const NEWER_REVIEW = "2026-07-28T00:00:01Z"

const argsFor = (expected = EXPECTED_HEAD, includeExpected = true) => [
  "--authority-public-key",
  WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY,
  "--review-authority-public-key",
  REVIEW_AUTHORITY_PUBLIC_KEY,
  ...(includeExpected ? ["--expected-head", `615=${expected}`] : []),
  "--reviewed-through",
  `615=${REVIEWED_THROUGH}`,
  "--issue",
  "615=ORB-150",
  "thomasluizon/orbit-ui-mobile",
  "615",
]

const reviewEvidenceJson = (head, approvalCommits = "__HEAD__", recommendation = "APPROVE") => {
  const local = {
    id: "PRR_local_review",
    state: "COMMENTED",
    body: reviewMarker({
      repository: "thomasluizon/orbit-ui-mobile",
      pullRequest: 615,
      head,
      recommendation,
      findingIds: recommendation === "NEEDS_WORK" ? ["finding-0123456789abcdef0123456789abcdef"] : [],
    }),
    submittedAt: "2026-07-31T10:00:00Z",
    updatedAt: "2026-07-31T10:00:00Z",
    lastEditedAt: null,
    url: "https://github.com/thomasluizon/orbit-ui-mobile/pull/615#review-local",
    author: { login: "local-reviewer" },
    commit: { oid: head },
  }
  const nativeHeads = approvalCommits === "__HEAD__" ? [head] : String(approvalCommits).split(/\s+/).filter(Boolean)
  const native = nativeHeads.map((oid, index) => ({
    id: `PRR_native_review_${index}`,
    state: "APPROVED",
    body: "",
    submittedAt: `2026-07-31T09:00:0${index}Z`,
    updatedAt: `2026-07-31T09:00:0${index}Z`,
    lastEditedAt: null,
    url: `https://github.com/thomasluizon/orbit-ui-mobile/pull/615#review-native-${index}`,
    author: { login: "native-reviewer" },
    commit: { oid },
  }))
  return JSON.stringify({ headRefOid: head, files: { pageInfo: { hasNextPage: false }, nodes: [{ path: "tools/example.mjs" }] }, reviews: { pageInfo: { hasNextPage: false }, nodes: [local, ...native] } })
}

const fixtureEnv = (options = {}) => {
  const evidenceHead = options.updatedHead || options.head
  if (/^[0-9a-f]{40}$/.test(evidenceHead ?? "") && options.workerDelivery !== false) {
    writeCompletedWorkerLaunch({ issue: "ORB-150", branch: "feature/orb-106", head: evidenceHead })
  }
  return baseMergeSweepEnv({
    ...options,
    approvalCommits: options.reviewEvidenceJson ?? reviewEvidenceJson(evidenceHead, options.approvalCommits, options.recommendation ?? "APPROVE"),
  })
}

const callsFor = (log) => mergeSweepCalls(log)
const mergeCalls = (calls) => calls.filter(([group, command]) => group === "pr" && command === "merge")
const linearWrites = (calls) =>
  calls.filter(([group, command, action]) => group === "orca" && command === "linear" && action === "status")

const detail = (result, calls) =>
  `exit ${result.status}\n     stdout: ${result.stdout.trim()}\n     stderr: ${result.stderr.trim()}\n     calls: ${JSON.stringify(calls)}`

const executeScenario = (file, label, environment, outputPattern, { handoff = false, expectedHead = EXPECTED_HEAD, includeExpected = true } = {}) => {
  const log = join(root, `${file}-${label.replace(/[^A-Za-z0-9]+/g, "-")}.log`)
  if (environment.workerDelivery === false) writeFileSync(WORKER_LAUNCH_LEDGER, "")
  const result = run(file, argsFor(expectedHead, includeExpected), {
    env: fixtureEnv({ head: expectedHead, log, sonar: "success", state: "CLEAN", ...environment }),
  })
  const calls = callsFor(log)
  const merges = mergeCalls(calls)
  const headRead = calls.some(([group, command, ...argv]) => group === "pr" && command === "view" && argv.includes("headRefOid"))
  T(`${file}: ${label} exits without a process failure`, result.status === 0, detail(result, calls))
  T(`${file}: ${label} reports the expected readiness decision`, outputPattern.test(result.stdout), detail(result, calls))
  T(`${file}: ${label} never invokes a merge command`, merges.length === 0, detail(result, calls))
  T(`${file}: ${label} never mutates Linear`, linearWrites(calls).length === 0, detail(result, calls))
  T(`${file}: ${label} reads the current pull-request head`, headRead, detail(result, calls))
  if (handoff) {
    T(`${file}: ${label} emits the human handoff`, /HUMAN-MERGE-REQUIRED/.test(result.stdout), detail(result, calls))
  }
}

const invalidCases = (file) => {
  const cases = [
    ["requires an issue value", ["--issue"], /--issue requires <pr-number>=<ORB-N>/],
    ["rejects a malformed issue mapping", ["--issue", "615=150", "thomasluizon/orbit-ui-mobile", "615"], /issue mappings must be <pr-number>=<ORB-N>/],
    ["rejects an unknown flag", ["--orbit-not-a-flag"], /unknown argument/],
    ["requires a repository and pull request", [], /Usage:/],
    ["requires an issue mapping for every pull request", ["thomasluizon/orbit-ui-mobile", "615"], /issue mapping is required for PR 615/],
  ]
  for (const [label, argv, expected] of cases) {
    const result = run(file, argv)
    T(`${file}: ${label} fails before external work`, result.status === 2 && expected.test(`${result.stdout}\n${result.stderr}`), detail(result, []))
  }
}

const policyCases = (file) => {
  const source = readFileSync(toolPath(file), "utf8")
  T(`${file}: the script exists in the inventory`, source.length > 0, "the merge readiness script was not readable")
  T(`${file}: no executable gh merge call remains`, !/gh\s+pr\s+merge/.test(source), "human squash merge is mandatory")
  T(`${file}: no GraphQL merge mutation remains`, !/mergePullRequest|pulls\/\{number\}\/merge/.test(source), "human squash merge is mandatory")
  T(`${file}: no admin merge flag remains`, !/--admin/.test(source), "an agent must never perform an admin merge")
  T(`${file}: the source names the human handoff`, source.includes("HUMAN-MERGE-REQUIRED"), "ready work must stop at human handoff")

  const help = run(file, ["--help"])
  T(`${file}: help exits successfully`, help.status === 0, detail(help, []))
  T(`${file}: help documents the human handoff`, /HUMAN-MERGE-REQUIRED/.test(help.stdout), detail(help, []))
  T(`${file}: help documents that the script never merges`, /never calls a merge command or merge API/.test(help.stdout), detail(help, []))

  invalidCases(file)

  executeScenario(file, "ready", {}, new RegExp(`HUMAN-MERGE-REQUIRED #615 head=${EXPECTED_HEAD}`), { handoff: true })
  executeScenario(file, "missing-worker-delivery", { workerDelivery: false }, /WORKER-DELIVERY-HELD/)
  executeScenario(file, "stale-review-evidence", { approvalCommits: CHANGED_HEAD }, /REVIEW-EVIDENCE-HELD[\s\S]*STALE_NATIVE_APPROVAL/)
  executeScenario(file, "needs-work-review", { recommendation: "NEEDS_WORK" }, /REVIEW-EVIDENCE-HELD[\s\S]*NEEDS_WORK/)
  executeScenario(file, "changes-requested", { reviewDecision: "CHANGES_REQUESTED" }, /review=CHANGES_REQUESTED|timeout: never reached a mergeable state/)
  executeScenario(file, "dirty-merge-state", { state: "DIRTY" }, /DIRTY/)
  executeScenario(file, "failed-check", { failNewHead: true }, /SKIP #615[\s\S]*FAILED/)
  executeScenario(file, "pending-review-check", { reviewRunning: true }, /timeout: checks on the current head never all concluded/)
  executeScenario(file, "new-review", { reviewTimes: `reviewer\t${NEWER_REVIEW}` }, new RegExp(`NEW-REVIEW-SINCE ${REVIEWED_THROUGH}`))
  executeScenario(file, "new-inline-comment", { inlineItems: `reviewer\t${NEWER_REVIEW}\nreviewer\t${NEWER_REVIEW}` }, new RegExp(`NEW-REVIEW-SINCE ${REVIEWED_THROUGH}`))
  executeScenario(file, "new-conversation-comment", { commentTimes: `reviewer\t${NEWER_REVIEW}` }, new RegExp(`NEW-REVIEW-SINCE ${REVIEWED_THROUGH}`))
  executeScenario(file, "unresolved-thread", { unresolvedThreads: "2" }, /UNRESOLVED-THREADS=2/)
  executeScenario(file, "review-lookup-failure", { reviewsLookupFailure: true }, /REVIEW-LOOKUP-FAILED source=reviews/)
  executeScenario(file, "comment-lookup-failure", { commentsLookupFailure: true }, /REVIEW-LOOKUP-FAILED source=issue-comments/)
  executeScenario(file, "linear-lookup-failure", { linearLookupFailure: true }, /LINEAR-STATE-REFUSED issue=ORB-150 reason=lookup-failed/)
  executeScenario(file, "linear-unknown-state", { linearState: "Done" }, /LINEAR-STATE-REFUSED issue=ORB-150 observed=Done reason=unknown-state/)
  executeScenario(file, "linear-update-required", { linearState: "In Progress" }, /LINEAR-STATE-REFUSED issue=ORB-150 observed=In Progress reason=human-update-required/)
  executeScenario(file, "changed-head", { head: CHANGED_HEAD }, new RegExp(`HEAD-MOVED expected=${EXPECTED_HEAD} actual=${CHANGED_HEAD}`), { expectedHead: EXPECTED_HEAD })
  executeScenario(file, "captured-head", { head: CHANGED_HEAD }, /HUMAN-MERGE-REQUIRED #615 head=2222222222222222222222222222222222222222/, { expectedHead: CHANGED_HEAD, includeExpected: false, handoff: true })
  executeScenario(
    file,
    "routine-update",
    { updatedHead: UPDATED_HEAD, baseTip: BASE_TIP, updateParents: `${EXPECTED_HEAD}\n${BASE_TIP}` },
    new RegExp(`HUMAN-MERGE-REQUIRED #615 head=${UPDATED_HEAD}`),
    { handoff: true },
  )
  executeScenario(
    file,
    "untrusted-update",
    { updatedHead: UPDATED_HEAD, updateParents: EXPECTED_HEAD, authenticUpdate: false },
    new RegExp(`HEAD-MOVED expected=${EXPECTED_HEAD} actual=${UPDATED_HEAD}`),
  )

  if (file === "merge-sweep-cov.sh") {
    executeScenario(
      file,
      "coverage-only-sonar",
      { sonar: "coverage-failure", state: "BLOCKED" },
      new RegExp(`HUMAN-MERGE-REQUIRED #615 coverage-only Sonar failure on head ${EXPECTED_HEAD}`),
      { handoff: true },
    )
  }
}

export const cases = () => policyCases("merge-sweep.sh")
export const coverageCases = () => policyCases("merge-sweep-cov.sh")
