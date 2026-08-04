import { spawnSyncHidden as spawnSync } from "../lib/subprocess-options.mjs"
import { generateKeyPairSync, sign } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { STRIKE_LEDGER_ENV } from "../lib/strike-ledger.mjs"
import { recordWorkerLaunch, signWorkerLaunchRecord, verifyWorkerLaunchCompletion, workerCompletionSigningPayload, workerDeliveryEvidence, workerLaunchSigningPayload } from "../lib/worker-launch-provenance.mjs"
import { WORKER_LAUNCH_AUTHORITY_PRIVATE_KEY, WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY, WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY_ENV, WORKER_LAUNCH_LEDGER, T, reviewMarker, root, stage, orcaEnv, run, check, exitedProbePid } from "./_harness.mjs"

const stageWorkerStatusWorktree = (label = "worker-status") => {
  const base = join(root, label)
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
    filesHasNextPage = false,
    approvalHead,
    includeApproval = true,
    includeLocalReview = true,
    isDraft = false,
    localReviewHead,
    localRecommendation = "APPROVE",
    prHead,
    pullRequests,
    reviewDecision = "APPROVED",
    reviews = [],
    reviewsHasNextPage = false,
    reviewThreads = [],
    reviewThreadsHasNextPage = false,
  } = {},
) => [
  {
    match: "pr list",
    stdout: JSON.stringify(pullRequests ?? [{ number: 75, url: "https://github.com/orbit/orbit/pull/75", state: "OPEN", baseRefName: "main", isDraft }]),
  },
  {
    match: "api graphql",
    stdout: JSON.stringify({
      data: {
        viewer: { login: "worker" },
        repository: {
          pullRequest: {
            headRefOid: prHead,
            files: { pageInfo: { hasNextPage: filesHasNextPage }, nodes: [{ path: "reviewed.txt" }] },
            reviewDecision,
            reviews: {
              pageInfo: { hasNextPage: reviewsHasNextPage },
              nodes: [
                ...reviews,
                ...(includeLocalReview ? [{
                  id: "PRR_local_review",
                  author: { login: "local-reviewer", __typename: "User" },
                  state: "COMMENTED",
                  body: localReviewHead ?? prHead
                    ? reviewMarker({ repository: "orbit/orbit", pullRequest: 75, head: localReviewHead ?? prHead, recommendation: localRecommendation, findingIds: localRecommendation === "NEEDS_WORK" ? ["finding-0123456789abcdef0123456789abcdef"] : [] })
                    : '<!-- orbit-local-review: {"version":1} -->',
                  submittedAt: "2026-07-28T11:00:00Z",
                  updatedAt: "2026-07-28T11:00:00Z",
                  lastEditedAt: null,
                  url: "https://github.com/orbit/orbit/pull/75#pullrequestreview-local",
                  commit: { oid: localReviewHead ?? prHead },
                }] : []),
                ...(includeApproval ? [{
                  id: "PRR_current_approval",
                  author: { login: "human-approver", __typename: "User" },
                  state: "APPROVED",
                  body: "",
                  submittedAt: "2026-07-28T10:00:00Z",
                  updatedAt: "2026-07-28T10:00:00Z",
                  lastEditedAt: null,
                  url: "https://github.com/orbit/orbit/pull/75#pullrequestreview-native",
                  commit: { oid: approvalHead ?? prHead },
                }] : []),
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
    [
      "--worktree",
      fixture.worktree,
      "--issue",
      "ORB-75",
      ...(options.verifyReview ? ["--verify-review"] : []),
      ...(options.consumeRelaunch ? ["--consume-relaunch"] : []),
      "--json",
    ],
    {
      env: {
        ...orcaEnv(
          workerStatusPlan(attachments, {
            approvalHead: options.approvalHead,
            includeApproval: options.includeApproval,
            includeLocalReview: options.includeLocalReview,
            isDraft: options.isDraft,
            comments: options.comments,
            commentsHasNextPage: options.commentsHasNextPage,
            filesHasNextPage: options.filesHasNextPage,
            /** An explicit null is the "graphql answered without a head" case, so it must survive. */
            prHead: "prHead" in options ? options.prHead : fixture.prHead,
            pullRequests: options.pullRequests,
            reviewDecision: options.reviewDecision,
            localRecommendation: options.localRecommendation,
            localReviewHead: options.localReviewHead,
            reviews: options.reviews,
            reviewsHasNextPage: options.reviewsHasNextPage,
            reviewThreads: options.reviewThreads,
            reviewThreadsHasNextPage: options.reviewThreadsHasNextPage,
          }),
        ),
        [STRIKE_LEDGER_ENV]: "strikeLedger" in options ? options.strikeLedger : STRIKE_LEDGER,
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

const gitPath = (worktreePath, revParseFlag) =>
  resolve(worktreePath, spawnSync("git", ["-C", worktreePath, "rev-parse", revParseFlag], { encoding: "utf8" }).stdout.trim())

const pidMarkerPath = (worktreePath) => join(gitPath(worktreePath, "--git-dir"), "orbit-worker-pids.jsonl")

/**
 * The launcher's marker, written by hand so a case can pin BOTH the pid and the claim age. Every
 * age here is an absolute hour count this module declares, never one derived from the tool's own
 * reuse backstop, so moving that backstop turns a case red rather than being quietly followed.
 */
const hoursAgo = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString()
const writePidMarker = (worktreePath, rows) =>
  writeFileSync(
    pidMarkerPath(worktreePath),
    rows.map((row, index) => {
      const publicKey = WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY
      const privateKey = WORKER_LAUNCH_AUTHORITY_PRIVATE_KEY
      let record = {
        version: 1,
        launchId: `fixture-orb-75-${Date.now()}-${index}`,
        issue: "ORB-75",
        worktreePath: resolve(worktreePath),
        pid: row.pid,
        startedAt: row.startedAt,
        launchMode: "existing-worktree",
        engine: "codex",
        invocation: {
          command: "codex",
          args: ["exec", "-c", 'windows.sandbox="unelevated"', "--dangerously-bypass-approvals-and-sandbox", "-c", 'model_reasoning_effort="max"', "-c", 'service_tier="fast"', "--model", "gpt-5.6-luna"],
        },
        branch: "feature/orb-75-worker-status",
        launcherPid: process.pid,
        issuedAt: new Date().toISOString(),
        completionAttestation: {
          algorithm: "ed25519",
          publicKey,
        },
      }
      record = signWorkerLaunchRecord(record, privateKey)
      recordWorkerLaunch(record, WORKER_LAUNCH_LEDGER, WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY)
      const completedHead = row.completed === false
        ? null
        : (row.completedHead ?? spawnSync("git", ["-C", worktreePath, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim())
      if (row.completed !== false) {
        const unsignedCompletion = { completedAt: new Date().toISOString(), completedHead, exitCode: 0 }
        const completion = {
          ...unsignedCompletion,
          signature: sign(
            null,
            Buffer.from(workerCompletionSigningPayload(record, unsignedCompletion), "utf8"),
            privateKey,
          ).toString("base64"),
        }
        const completedRecord = { ...record, completion }
        recordWorkerLaunch(completedRecord, WORKER_LAUNCH_LEDGER, WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY)
        return `${JSON.stringify(record)}\n${JSON.stringify(completedRecord)}\n`
      }
      return `${JSON.stringify(record)}\n`
    }).join(""),
  )
const clearPidMarker = (worktreePath) => rmSync(pidMarkerPath(worktreePath), { force: true })
const writeForgedPidMarker = (worktreePath, pid) =>
  writeFileSync(pidMarkerPath(worktreePath), `${JSON.stringify({
    version: 1,
    launchId: "forged-worker-launch",
    issue: "ORB-75",
    worktreePath: resolve(worktreePath),
    pid,
    startedAt: hoursAgo(1),
    launchMode: "existing-worktree",
    engine: "codex",
    invocation: { command: "codex", args: ["exec"] },
    branch: "feature/orb-75-worker-status",
    launcherPid: process.pid,
    issuedAt: new Date().toISOString(),
  })}\n`)

/**
 * The relaunch allowance counts rows in the SHARED strike ledger under scope "relaunch", the same
 * store clause 4 uses under scope "finding", so these cases drive the real store rather than a
 * private mirror of it. Isolated by the ledger's own env override, never the operator's home file.
 */
const STRIKE_LEDGER = join(root, "worker-status-strikes.jsonl")
const writeRelaunchStrikes = (rows) =>
  writeFileSync(STRIKE_LEDGER, rows.map((row) => `${JSON.stringify({ scope: "relaunch", recordedAt: "2026-07-30T00:00:00.000Z", ...row })}\n`).join(""))
const clearStrikeLedger = () => rmSync(STRIKE_LEDGER, { force: true })
const relaunchStrikeCount = (issue, headSha) =>
  existsSync(STRIKE_LEDGER)
    ? readFileSync(STRIKE_LEDGER, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((entry) => entry.scope === "relaunch" && entry.issue === issue && entry.key === headSha).length
    : 0

/**
 * The shape a stalled worker leaves behind: an open pull request carrying a live finding, whose
 * only approval sits on an older commit, so nothing approves the head the worker abandoned.
 */
const unapprovedPullRequest = (fixture) => ({
  approvalHead: fixture.reviewedCommit,
  reviewDecision: "CHANGES_REQUESTED",
  reviewThreads: [
    reviewThread({
      author: "claude[bot]",
      authorType: "Bot",
      id: "PRRT_outstanding",
      isResolved: false,
      reviewedCommit: fixture.reviewedCommit,
    }),
  ],
})

export const cases = () => {
    const attackerRoot = generateKeyPairSync("ed25519")
    const completionAttestation = generateKeyPairSync("ed25519")
    const forgedLaunch = {
      version: 1,
      launchId: "forged-root-launch",
      issue: "ORB-75",
      worktreePath: join(root, "forged-root-worktree"),
      pid: process.pid,
      startedAt: new Date(Date.now() - 1000).toISOString(),
      launchMode: "existing-worktree",
      engine: "codex",
      invocation: { command: "codex", args: ["exec"] },
      branch: "feature/orb-75-worker-status",
      launcherPid: process.pid,
      issuedAt: new Date(Date.now() - 1000).toISOString(),
      completionAttestation: {
        algorithm: "ed25519",
        publicKey: completionAttestation.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
      },
    }
    forgedLaunch.launchSignature = sign(null, Buffer.from(workerLaunchSigningPayload(forgedLaunch), "utf8"), attackerRoot.privateKey).toString("base64")
    const forgedCompletion = { completedAt: new Date().toISOString(), completedHead: "a".repeat(40), exitCode: 0 }
    forgedLaunch.completion = {
      ...forgedCompletion,
      signature: sign(null, Buffer.from(workerCompletionSigningPayload(forgedLaunch, forgedCompletion), "utf8"), completionAttestation.privateKey).toString("base64"),
    }
    const sameKeyAttacker = generateKeyPairSync("ed25519")
    const sameKeyPublic = sameKeyAttacker.publicKey.export({ format: "der", type: "spki" }).toString("base64")
    const sameKeyForgedLaunch = {
      ...forgedLaunch,
      launchId: "forged-same-key-launch",
      completionAttestation: { algorithm: "ed25519", publicKey: sameKeyPublic },
    }
    sameKeyForgedLaunch.launchSignature = sign(null, Buffer.from(workerLaunchSigningPayload(sameKeyForgedLaunch), "utf8"), sameKeyAttacker.privateKey).toString("base64")
    sameKeyForgedLaunch.completion = {
      ...forgedCompletion,
      signature: sign(null, Buffer.from(workerCompletionSigningPayload(sameKeyForgedLaunch, forgedCompletion), "utf8"), sameKeyAttacker.privateKey).toString("base64"),
    }
    T(
      "worker-status.mjs: worker-generated launch and completion keys cannot satisfy Sol's expected authority",
      verifyWorkerLaunchCompletion(forgedLaunch, WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY) === false &&
        verifyWorkerLaunchCompletion(sameKeyForgedLaunch, WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY) === false &&
        workerDeliveryEvidence({ issue: "ORB-75", branch: sameKeyForgedLaunch.branch, head: forgedCompletion.completedHead, worktreePath: sameKeyForgedLaunch.worktreePath, invocation: { engine: sameKeyForgedLaunch.engine, command: sameKeyForgedLaunch.invocation.command, args: sameKeyForgedLaunch.invocation.args }, authorityPublicKey: WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY, records: [sameKeyForgedLaunch] }).ok === false,
      "a completion signed by one worker-generated key must be rejected by the explicit launcher authority",
    )
    check("worker-status.mjs", "requires --worktree", ["--issue", "ORB-75"], { status: 2, stderr: /--worktree is required/ })
    check("worker-status.mjs", "requires a Linear issue identifier", ["--worktree", root, "--issue", "nope"], { status: 2, stderr: /Linear identifier/ })
    const fixture = stageWorkerStatusWorktree()
    if (!fixture) {
      T("worker-status.mjs: real git fixture is available", false, "could not create and push the worker-status Git fixture")
      return
    }
    const screenshot = { title: "about-en.png", url: "https://raw.githubusercontent.com/orbit/orbit/evidence/about-en.png" }
    const critique = { title: "render critique", url: "https://raw.githubusercontent.com/orbit/orbit/evidence/render-critique.md" }
    writePidMarker(fixture.worktree, [{ pid: process.pid, startedAt: hoursAgo(1) }])
    const complete = runWorkerStatusCase(fixture, [screenshot, critique])
    T(
      "worker-status.mjs: screenshot and critique present is OK",
      complete.status === 0 &&
        complete.verdict?.ok === true &&
        complete.verdict.checks.find((entry) => entry.name === "review-not-changes-requested")?.ok === true &&
        complete.verdict.checks.find((entry) => entry.name === "review-evidence")?.ok === true &&
        complete.verdict.checks.find((entry) => entry.name === "screenshot-attached")?.ok === true &&
        complete.verdict.checks.find((entry) => entry.name === "critique-attached")?.ok === true,
      `exit ${complete.status}\n     ${(complete.stderr || complete.stdout).slice(0, 600)}`,
    )
    const implementationReady = run(
      "worker-status.mjs",
      ["--worktree", fixture.worktree, "--issue", "ORB-75", "--implementation", "--authority-public-key", WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY, "--json"],
      { env: { ORBIT_WORKER_LAUNCH_LEDGER: WORKER_LAUNCH_LEDGER } },
    )
    let implementationVerdict = null
    try { implementationVerdict = JSON.parse(implementationReady.stdout) } catch { /* assertion below reports the raw result */ }
    T(
      "worker-status.mjs: implementation mode authoritatively accepts Luna's clean signed local handoff",
      implementationReady.status === 0 && implementationVerdict?.verdict === "IMPLEMENTATION_READY" && implementationVerdict?.checks.every((check) => check.ok),
      `exit ${implementationReady.status}\n     ${(implementationReady.stderr || implementationReady.stdout).slice(0, 600)}`,
    )
    const implementationMissingAuthority = run(
      "worker-status.mjs",
      ["--worktree", fixture.worktree, "--issue", "ORB-75", "--implementation", "--json"],
      { env: { ORBIT_WORKER_LAUNCH_LEDGER: WORKER_LAUNCH_LEDGER } },
    )
    T(
      "worker-status.mjs: implementation mode refuses to trust an ambient or absent authority",
      implementationMissingAuthority.status === 2 && /--implementation requires --authority-public-key/.test(implementationMissingAuthority.stderr),
      `exit ${implementationMissingAuthority.status}\n     ${implementationMissingAuthority.stderr}`,
    )
    const implementationMalformedAuthority = run(
      "worker-status.mjs",
      ["--worktree", fixture.worktree, "--issue", "ORB-75", "--implementation", "--authority-public-key", "not-an-ed25519-key", "--json"],
      { env: { ORBIT_WORKER_LAUNCH_LEDGER: WORKER_LAUNCH_LEDGER, [WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY_ENV]: undefined } },
    )
    T(
      "worker-status.mjs: implementation mode refuses a malformed authority",
      implementationMalformedAuthority.status === 2 && /authority public key is malformed/.test(implementationMalformedAuthority.stderr),
      `exit ${implementationMalformedAuthority.status}\n     ${implementationMalformedAuthority.stderr}`,
    )
    const oldReceiptFixture = stageWorkerStatusWorktree("worker-status-old-receipt")
    if (!oldReceiptFixture) {
      T("worker-status.mjs: old receipt fixture is available", false, "could not create the old receipt fixture")
    } else {
      writePidMarker(oldReceiptFixture.worktree, [{ pid: exitedProbePid(), startedAt: hoursAgo(1), completedHead: oldReceiptFixture.prHead }])
      writeFileSync(join(oldReceiptFixture.worktree, "new-head.txt"), "manual follow-up\n")
      spawnSync("git", ["-C", oldReceiptFixture.worktree, "add", "new-head.txt"], { encoding: "utf8" })
      spawnSync("git", ["-C", oldReceiptFixture.worktree, "commit", "-q", "-m", "unissued follow-up"], { encoding: "utf8" })
      spawnSync("git", ["-C", oldReceiptFixture.worktree, "push", "-q", "origin", "feature/orb-75-worker-status"], { encoding: "utf8" })
      const newHead = spawnSync("git", ["-C", oldReceiptFixture.worktree, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim()
      const oldReceipt = runWorkerStatusCase(oldReceiptFixture, [screenshot, critique], { prHead: newHead })
      T(
        "worker-status.mjs: a genuine old launcher receipt cannot deliver an unissued new head",
        oldReceipt.status === 1 &&
          oldReceipt.verdict?.checks.find((entry) => entry.name === "pr-head-match")?.ok === true &&
          oldReceipt.verdict?.checks.find((entry) => entry.name === "worker-completed-head")?.ok === false &&
          oldReceipt.verdict?.unmet.includes("worker-completed-head"),
        `exit ${oldReceipt.status}\n     ${(oldReceipt.stderr || oldReceipt.stdout).slice(0, 600)}`,
      )
    }
    const incompleteFiles = runWorkerStatusCase(fixture, [screenshot, critique], { filesHasNextPage: true })
    T(
      "worker-status.mjs: an incomplete changed-files inventory blocks delivery",
      incompleteFiles.status === 1 &&
        incompleteFiles.verdict?.unmet.includes("review-evidence") &&
        incompleteFiles.verdict.unmet.includes("review-thread-inventory") &&
        incompleteFiles.verdict.checks.find((entry) => entry.name === "review-evidence")?.detail === "INCOMPLETE: file inventory has another page",
      `exit ${incompleteFiles.status}\n     ${(incompleteFiles.stderr || incompleteFiles.stdout).slice(0, 600)}`,
    )
    /**
     * The verdict LITERAL, not `ok === true` implying it. A rename of the string, or a ternary slip
     * that let liveness reach a met contract, would otherwise pass every other case in this module.
     */
    writePidMarker(fixture.worktree, [{ pid: process.pid, startedAt: hoursAgo(1) }])
    const deliveredWhileAlive = runWorkerStatusCase(fixture, [screenshot, critique])
    T(
      "worker-status.mjs: a met contract is DELIVERED by name, and liveness does not enter into it",
      deliveredWhileAlive.status === 0 &&
        deliveredWhileAlive.verdict?.verdict === "DELIVERED" &&
        deliveredWhileAlive.verdict.liveness.state === "alive",
      `exit ${deliveredWhileAlive.status}\n     ${(deliveredWhileAlive.stderr || deliveredWhileAlive.stdout).slice(0, 600)}`,
    )
    writeFileSync(WORKER_LAUNCH_LEDGER, "")
    writePidMarker(fixture.worktree, [{ pid: process.pid, startedAt: hoursAgo(1), completed: false }])
    const liveWithoutCompletion = runWorkerStatusCase(fixture, [screenshot, critique])
    T(
      "worker-status.mjs: live liveness cannot substitute for a completed-head receipt",
      liveWithoutCompletion.status === 1 &&
        liveWithoutCompletion.verdict?.verdict === "WORKING" &&
        liveWithoutCompletion.verdict?.liveness.state === "alive" &&
        liveWithoutCompletion.verdict?.unmet.includes("worker-completed-head"),
      `exit ${liveWithoutCompletion.status}\n     ${(liveWithoutCompletion.stderr || liveWithoutCompletion.stdout).slice(0, 600)}`,
    )
    writeForgedPidMarker(fixture.worktree, process.pid)
    const forgedWorker = runWorkerStatusCase(fixture, [screenshot, critique])
    T(
      "worker-status.mjs: a manually authored worker row cannot satisfy liveness or delivery",
      forgedWorker.status === 1 &&
        forgedWorker.verdict?.verdict === "UNKNOWN" &&
        forgedWorker.verdict.liveness.detail.includes("without launcher-issued provenance") &&
        forgedWorker.verdict.unmet.includes("worker-launch-provenance"),
      `exit ${forgedWorker.status}\n     ${(forgedWorker.stderr || forgedWorker.stdout).slice(0, 600)}`,
    )
    writePidMarker(fixture.worktree, [{ pid: process.pid, startedAt: hoursAgo(1) }])
    const draft = runWorkerStatusCase(fixture, [screenshot, critique], { isDraft: true })
    T(
      "worker-status.mjs: a draft pull request is explicitly not ready for review",
      draft.status === 1 &&
        draft.verdict?.unmet.length === 1 &&
        draft.verdict.unmet[0] === "pr-ready-for-review" &&
        draft.verdict.checks.find((entry) => entry.name === "pr-ready-for-review")?.detail.includes("draft pull request"),
      `exit ${draft.status}\n     ${(draft.stderr || draft.stdout).slice(0, 600)}`,
    )
    const changesRequested = runWorkerStatusCase(fixture, [screenshot, critique], {
      includeApproval: false,
      reviewDecision: "CHANGES_REQUESTED",
    })
    T(
      "worker-status.mjs: CHANGES_REQUESTED does not report done",
      changesRequested.status === 1 &&
        changesRequested.verdict?.unmet.length === 1 &&
        changesRequested.verdict.unmet[0] === "review-not-changes-requested",
      `exit ${changesRequested.status}\n     ${(changesRequested.stderr || changesRequested.stdout).slice(0, 600)}`,
    )
    /**
     * Branch protection requires zero approvals, and the merge sweep therefore treats an absent
     * reviewDecision as clear unless it says CHANGES_REQUESTED. No APPROVED submission is the
     * ordinary shape after the review workflow is deleted, not unfinished review work.
     */
    const noApprovalRequired = runWorkerStatusCase(fixture, [screenshot, critique], {
      includeApproval: false,
      reviewDecision: null,
    })
    T(
      "worker-status.mjs: current local evidence with no native approval or CHANGES_REQUESTED is DELIVERED",
      noApprovalRequired.status === 0 &&
        noApprovalRequired.verdict?.verdict === "DELIVERED" &&
        noApprovalRequired.verdict.unmet.length === 0 &&
        noApprovalRequired.verdict.checks.find((entry) => entry.name === "review-not-changes-requested")?.ok === true &&
        noApprovalRequired.verdict.checks.find((entry) => entry.name === "review-evidence")?.ok === true,
      `exit ${noApprovalRequired.status}\n     ${(noApprovalRequired.stderr || noApprovalRequired.stdout).slice(0, 600)}`,
    )
    const currentApprovalWithEmptyDecision = runWorkerStatusCase(fixture, [screenshot, critique], {
      reviewDecision: "",
    })
    T(
      "worker-status.mjs: a current-head approval stays valid when zero required approvals empties reviewDecision",
      currentApprovalWithEmptyDecision.status === 0 &&
        currentApprovalWithEmptyDecision.verdict?.verdict === "DELIVERED" &&
        currentApprovalWithEmptyDecision.verdict.checks.find((entry) => entry.name === "review-not-changes-requested")?.ok === true &&
        currentApprovalWithEmptyDecision.verdict.checks.find((entry) => entry.name === "review-evidence")?.ok === true,
      `exit ${currentApprovalWithEmptyDecision.status}\n     ${(currentApprovalWithEmptyDecision.stderr || currentApprovalWithEmptyDecision.stdout).slice(0, 600)}`,
    )
    const staleApprovalWithNoDecision = runWorkerStatusCase(fixture, [screenshot, critique], {
      approvalHead: fixture.reviewedCommit,
      reviewDecision: null,
    })
    T(
      "worker-status.mjs: an existing stale approval still blocks when reviewDecision is absent",
      staleApprovalWithNoDecision.status === 1 &&
        staleApprovalWithNoDecision.verdict?.unmet.length === 1 &&
        staleApprovalWithNoDecision.verdict.unmet[0] === "review-evidence" &&
        staleApprovalWithNoDecision.verdict.checks.find((entry) => entry.name === "review-not-changes-requested")?.ok === true,
      `exit ${staleApprovalWithNoDecision.status}\n     ${(staleApprovalWithNoDecision.stderr || staleApprovalWithNoDecision.stdout).slice(0, 600)}`,
    )
    const staleApproval = runWorkerStatusCase(fixture, [screenshot, critique], {
      approvalHead: fixture.reviewedCommit,
    })
    T(
      "worker-status.mjs: an approval from an older commit does not approve the current PR head",
      staleApproval.status === 1 &&
        staleApproval.verdict?.unmet.length === 1 &&
        staleApproval.verdict.unmet[0] === "review-evidence" &&
        staleApproval.verdict.checks.find((entry) => entry.name === "review-not-changes-requested")?.ok === true,
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
          paginated.verdict?.unmet.includes("review-thread-inventory") &&
          (label === "review bodies"
            ? paginated.verdict.unmet.length === 2 && paginated.verdict.unmet.includes("review-evidence")
            : paginated.verdict.unmet.length === 1),
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
    const deadPid = exitedProbePid()
    T("worker-status.mjs: the harness can name an exited process", Number.isInteger(deadPid), `probe pid was ${deadPid}`)

    /**
     * The AWAITING-MERGE / STALLED boundary, driven while the local head still matches the PR head
     * so the only unmet item is the one each case is about. AWAITING-MERGE means "no relaunch can
     * help": an approved head whose remaining gap is D7 bookkeeping. The moment the same approved
     * head carries one live review thread, a worker is exactly what it needs, so it is STALLED and
     * an allowance is spendable. Classifying that shape AWAITING-MERGE stranded the pull request:
     * only STALLED relaunches, so the thread could never be reconciled.
     */
    clearStrikeLedger()
    writePidMarker(fixture.worktree, [{ pid: deadPid, startedAt: hoursAgo(1) }])
    const awaitingReview = runWorkerStatusCase(fixture, [screenshot, critique], {
      includeApproval: false,
      includeLocalReview: false,
      reviewDecision: null,
    })
    T(
      "worker-status.mjs: a dead worker without local evidence is AWAITING-REVIEW",
      awaitingReview.status === 1 &&
        awaitingReview.verdict?.verdict === "AWAITING-REVIEW" &&
        awaitingReview.verdict.unmet.length === 1 &&
        awaitingReview.verdict.unmet[0] === "review-evidence" &&
        awaitingReview.verdict.relaunch.allowed === false,
      `exit ${awaitingReview.status}\n     ${(awaitingReview.stderr || awaitingReview.stdout).slice(0, 600)}`,
    )
    const staleLocalReview = runWorkerStatusCase(fixture, [screenshot, critique], {
      includeApproval: false,
      localReviewHead: fixture.reviewedCommit,
      reviewDecision: null,
    })
    T(
      "worker-status.mjs: a prior-head local approval waits for a fresh reviewer, not a worker relaunch",
      staleLocalReview.status === 1 &&
        staleLocalReview.verdict?.verdict === "AWAITING-REVIEW" &&
        staleLocalReview.verdict.unmet.length === 1 &&
        staleLocalReview.verdict.unmet[0] === "review-evidence" &&
        staleLocalReview.verdict.checks.find((entry) => entry.name === "review-evidence")?.detail.startsWith("STALE:") &&
        staleLocalReview.verdict.relaunch.allowed === false,
      `exit ${staleLocalReview.status}\n     ${(staleLocalReview.stderr || staleLocalReview.stdout).slice(0, 600)}`,
    )
    const absentReviewWithHeadMismatch = runWorkerStatusCase(fixture, [screenshot, critique], {
      includeApproval: false,
      includeLocalReview: false,
      prHead: fixture.reviewedCommit,
      reviewDecision: null,
    })
    T(
      "worker-status.mjs: absent evidence does not hide a worker-actionable PR head mismatch",
      absentReviewWithHeadMismatch.status === 1 &&
        absentReviewWithHeadMismatch.verdict?.verdict === "STALLED" &&
        absentReviewWithHeadMismatch.verdict.unmet.includes("pr-head-match") &&
        absentReviewWithHeadMismatch.verdict.unmet.includes("review-evidence") &&
        absentReviewWithHeadMismatch.verdict.relaunch.allowed === true,
      `exit ${absentReviewWithHeadMismatch.status}\n     ${(absentReviewWithHeadMismatch.stderr || absentReviewWithHeadMismatch.stdout).slice(0, 600)}`,
    )
    const malformedLocalReview = runWorkerStatusCase(fixture, [screenshot, critique], {
      includeApproval: false,
      reviewDecision: null,
      reviews: [{
        id: "PRR_malformed_local",
        author: { login: "local-reviewer", __typename: "User" },
        state: "COMMENTED",
        body: '<!-- orbit-local-review: {"version":1} -->',
        submittedAt: "2026-07-28T12:00:00Z",
        updatedAt: "2026-07-28T12:00:00Z",
        lastEditedAt: null,
        url: "https://github.com/orbit/orbit/pull/75#pullrequestreview-malformed",
        commit: { oid: fixture.prHead },
      }],
    })
    T(
      "worker-status.mjs: a selected malformed local marker waits for a fresh reviewer",
      malformedLocalReview.status === 1 &&
        malformedLocalReview.verdict?.verdict === "AWAITING-REVIEW" &&
        malformedLocalReview.verdict.unmet.length === 1 &&
        malformedLocalReview.verdict.unmet[0] === "review-evidence" &&
        malformedLocalReview.verdict.checks.find((entry) => entry.name === "review-evidence")?.detail.startsWith("MALFORMED:") &&
        malformedLocalReview.verdict.relaunch.allowed === false,
      `exit ${malformedLocalReview.status}\n     ${(malformedLocalReview.stderr || malformedLocalReview.stdout).slice(0, 600)}`,
    )
    const incompleteLocalReview = runWorkerStatusCase(fixture, [screenshot, critique], {
      includeApproval: false,
      reviewDecision: null,
      reviewsHasNextPage: true,
    })
    T(
      "worker-status.mjs: incomplete review inventory remains STALLED rather than launching a reviewer",
      incompleteLocalReview.status === 1 &&
        incompleteLocalReview.verdict?.verdict === "STALLED" &&
        incompleteLocalReview.verdict.unmet.includes("review-evidence") &&
        incompleteLocalReview.verdict.unmet.includes("review-thread-inventory") &&
        incompleteLocalReview.verdict.relaunch.allowed === true,
      `exit ${incompleteLocalReview.status}\n     ${(incompleteLocalReview.stderr || incompleteLocalReview.stdout).slice(0, 600)}`,
    )
    const needsWork = runWorkerStatusCase(fixture, [screenshot, critique], {
      includeApproval: false,
      localRecommendation: "NEEDS_WORK",
      reviewDecision: null,
    })
    T(
      "worker-status.mjs: a dead worker with latest NEEDS_WORK evidence is NEEDS-WORK",
      needsWork.status === 1 &&
        needsWork.verdict?.verdict === "NEEDS-WORK" &&
        needsWork.verdict.unmet.length === 1 &&
        needsWork.verdict.unmet[0] === "review-evidence" &&
        needsWork.verdict.relaunch.findings.some((finding) => finding.kind === "local-review-needs-work" && finding.id === "finding-0123456789abcdef0123456789abcdef" && finding.body.includes("NEEDS_WORK")) &&
        needsWork.verdict.relaunch.allowed === true,
      `exit ${needsWork.status}\n     ${(needsWork.stderr || needsWork.stdout).slice(0, 600)}`,
    )
    const needsWorkGrant = runWorkerStatusCase(fixture, [screenshot, critique], {
      consumeRelaunch: true,
      includeApproval: false,
      localRecommendation: "NEEDS_WORK",
      reviewDecision: null,
    })
    T(
      "worker-status.mjs: --consume-relaunch grants the durable worker budget for NEEDS-WORK",
      needsWorkGrant.status === 0 && needsWorkGrant.verdict?.relaunch.consumed === 1,
      `exit ${needsWorkGrant.status}\n     ${(needsWorkGrant.stderr || needsWorkGrant.stdout).slice(0, 600)}`,
    )
    clearStrikeLedger()
    const awaitingMerge = runWorkerStatusCase(fixture, [screenshot])
    T(
      "worker-status.mjs: a dead worker with an approved head and zero outstanding review work is AWAITING-MERGE",
      awaitingMerge.status === 1 &&
        awaitingMerge.verdict?.verdict === "AWAITING-MERGE" &&
        awaitingMerge.verdict.liveness.state === "gone" &&
        awaitingMerge.verdict.unmet.length === 1 &&
        awaitingMerge.verdict.unmet[0] === "critique-attached" &&
        awaitingMerge.verdict.checks.find((entry) => entry.name === "review-evidence")?.ok === true &&
        awaitingMerge.verdict.relaunch.allowed === false &&
        awaitingMerge.verdict.relaunch.refusal.includes("AWAITING-MERGE"),
      `exit ${awaitingMerge.status}\n     ${(awaitingMerge.stderr || awaitingMerge.stdout).slice(0, 600)}`,
    )
    const awaitingMergeWithoutApproval = runWorkerStatusCase(fixture, [screenshot], {
      includeApproval: false,
      reviewDecision: null,
    })
    T(
      "worker-status.mjs: no native approval never turns bookkeeping-only AWAITING-MERGE into STALLED",
      awaitingMergeWithoutApproval.status === 1 &&
        awaitingMergeWithoutApproval.verdict?.verdict === "AWAITING-MERGE" &&
        awaitingMergeWithoutApproval.verdict.unmet.length === 1 &&
        awaitingMergeWithoutApproval.verdict.unmet[0] === "critique-attached" &&
        awaitingMergeWithoutApproval.verdict.checks.find((entry) => entry.name === "review-not-changes-requested")?.ok === true &&
        awaitingMergeWithoutApproval.verdict.checks.find((entry) => entry.name === "review-evidence")?.ok === true &&
        awaitingMergeWithoutApproval.verdict.relaunch.allowed === false,
      `exit ${awaitingMergeWithoutApproval.status}\n     ${(awaitingMergeWithoutApproval.stderr || awaitingMergeWithoutApproval.stdout).slice(0, 600)}`,
    )
    const approvedWithLiveThread = {
      reviewThreads: [
        reviewThread({
          author: "claude[bot]",
          authorType: "Bot",
          id: "PRRT_open_under_approval",
          isResolved: false,
          reviewedCommit: fixture.reviewedCommit,
        }),
      ],
    }
    const stalledUnderApproval = runWorkerStatusCase(fixture, [screenshot, critique], approvedWithLiveThread)
    T(
      "worker-status.mjs: an approved head with one unresolved thread is STALLED, never AWAITING-MERGE",
      stalledUnderApproval.status === 1 &&
        stalledUnderApproval.verdict?.verdict === "STALLED" &&
        stalledUnderApproval.verdict.checks.find((entry) => entry.name === "review-evidence")?.ok === true &&
        stalledUnderApproval.verdict.unmet.length === 1 &&
        stalledUnderApproval.verdict.unmet[0] === "review-threads" &&
        stalledUnderApproval.verdict.relaunch.allowed === true,
      `exit ${stalledUnderApproval.status}\n     ${(stalledUnderApproval.stderr || stalledUnderApproval.stdout).slice(0, 600)}`,
    )
    const grantedUnderApproval = runWorkerStatusCase(fixture, [screenshot, critique], {
      ...approvedWithLiveThread,
      consumeRelaunch: true,
    })
    T(
      "worker-status.mjs: --consume-relaunch grants on an approved head whose review thread is still open",
      grantedUnderApproval.status === 0 &&
        grantedUnderApproval.verdict?.relaunch.consumed === 1 &&
        relaunchStrikeCount("ORB-75", fixture.prHead) === 1,
      `exit ${grantedUnderApproval.status}\n     ${(grantedUnderApproval.stderr || grantedUnderApproval.stdout).slice(0, 600)}`,
    )
    clearStrikeLedger()
    clearPidMarker(fixture.worktree)

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

    const abandoned = unapprovedPullRequest(fixture)

    clearStrikeLedger()
    writePidMarker(fixture.worktree, [{ pid: deadPid, startedAt: hoursAgo(1) }])
    const stalled = runWorkerStatusCase(fixture, [screenshot, critique], abandoned)
    T(
      "worker-status.mjs: a dead worker with outstanding review work on an open pull request is STALLED",
      stalled.status === 1 &&
        stalled.verdict?.verdict === "STALLED" &&
        stalled.verdict.liveness.state === "gone" &&
        stalled.verdict.relaunch.allowed === true &&
        stalled.verdict.relaunch.cap === 2 &&
        stalled.verdict.relaunch.remaining === 2 &&
        stalled.verdict.relaunch.scope === "relaunch" &&
        stalled.verdict.relaunch.headSha === fixture.prHead,
      `exit ${stalled.status}\n     ${(stalled.stderr || stalled.stdout).slice(0, 600)}`,
    )
    T(
      "worker-status.mjs: a STALLED relaunch carries the outstanding findings, not the ticket body alone",
      stalled.verdict?.relaunch.findings.some((finding) => finding.kind === "unresolved-thread" && finding.id === "PRRT_outstanding" && finding.path === "reviewed.txt" && finding.body.includes("review finding")) &&
        stalled.verdict.relaunch.unmet.includes("review-threads"),
      JSON.stringify(stalled.verdict?.relaunch ?? null).slice(0, 600),
    )

    writePidMarker(fixture.worktree, [{ pid: process.pid, startedAt: hoursAgo(15) }])
    const working = runWorkerStatusCase(fixture, [screenshot, critique], abandoned)
    T(
      "worker-status.mjs: a live worker with outstanding review work is WORKING, never STALLED",
      working.status === 1 &&
        working.verdict?.verdict === "WORKING" &&
        working.verdict.liveness.state === "alive" &&
        working.verdict.relaunch.allowed === false,
      `exit ${working.status}\n     ${(working.stderr || working.stdout).slice(0, 600)}`,
    )

    writePidMarker(fixture.worktree, [{ pid: process.pid, startedAt: hoursAgo(17) }])
    const recycled = runWorkerStatusCase(fixture, [screenshot, critique], abandoned)
    T(
      "worker-status.mjs: a pid alive past the reuse backstop is UNKNOWN, neither alive nor gone",
      recycled.status === 1 &&
        recycled.verdict?.verdict === "UNKNOWN" &&
        recycled.verdict.liveness.state === "unknown" &&
        recycled.verdict.liveness.detail.includes("reuse backstop") &&
        recycled.verdict.relaunch.allowed === false,
      `exit ${recycled.status}\n     ${(recycled.stderr || recycled.stdout).slice(0, 600)}`,
    )

    clearPidMarker(fixture.worktree)
    const unreadableLiveness = runWorkerStatusCase(fixture, [screenshot, critique], abandoned)
    T(
      "worker-status.mjs: liveness that cannot be read is UNKNOWN and recommends no relaunch",
      unreadableLiveness.status === 1 &&
        unreadableLiveness.verdict?.verdict === "UNKNOWN" &&
        unreadableLiveness.verdict.liveness.state === "unknown" &&
        unreadableLiveness.verdict.liveness.detail.includes("no launcher PID marker") &&
        unreadableLiveness.verdict.relaunch.allowed === false,
      `exit ${unreadableLiveness.status}\n     ${(unreadableLiveness.stderr || unreadableLiveness.stdout).slice(0, 600)}`,
    )
    const refusedOnUnknown = runWorkerStatusCase(fixture, [screenshot, critique], { ...abandoned, consumeRelaunch: true })
    T(
      "worker-status.mjs: --consume-relaunch on UNKNOWN liveness is refused and writes nothing",
      refusedOnUnknown.status === 4 &&
        refusedOnUnknown.verdict?.relaunch.allowed === false &&
        relaunchStrikeCount("ORB-75", fixture.prHead) === 0,
      `exit ${refusedOnUnknown.status}\n     ${(refusedOnUnknown.stderr || refusedOnUnknown.stdout).slice(0, 600)}`,
    )

    writePidMarker(fixture.worktree, [{ pid: deadPid, startedAt: hoursAgo(1) }])
    const idle = runWorkerStatusCase(fixture, [screenshot, critique], { ...abandoned, pullRequests: [] })
    T(
      "worker-status.mjs: no open pull request and no live worker is IDLE, not STALLED",
      idle.status === 1 &&
        idle.verdict?.verdict === "IDLE" &&
        idle.verdict.liveness.state === "gone" &&
        idle.verdict.relaunch.allowed === false &&
        idle.verdict.relaunch.refusal.includes("IDLE"),
      `exit ${idle.status}\n     ${(idle.stderr || idle.stdout).slice(0, 600)}`,
    )

    writeRelaunchStrikes([
      { issue: "ORB-75", key: fixture.prHead },
      { issue: "ORB-75", key: fixture.prHead },
    ])
    const spent = runWorkerStatusCase(fixture, [screenshot, critique], abandoned)
    T(
      "worker-status.mjs: an unchanged head SHA does not earn a fresh relaunch allowance",
      spent.verdict?.verdict === "STALLED" &&
        spent.verdict.relaunch.allowed === false &&
        spent.verdict.relaunch.consumed === 2 &&
        spent.verdict.relaunch.remaining === 0,
      `exit ${spent.status}\n     ${(spent.stderr || spent.stdout).slice(0, 600)}`,
    )
    writeRelaunchStrikes([
      { issue: "ORB-75", key: fixture.reviewedCommit },
      { issue: "ORB-75", key: fixture.reviewedCommit },
      { scope: "finding", issue: "ORB-75", key: "PRRT_outstanding" },
      { scope: "finding", issue: "ORB-75", key: "PRRT_outstanding" },
    ])
    const pushedNewHead = runWorkerStatusCase(fixture, [screenshot, critique], abandoned)
    T(
      "worker-status.mjs: a new head SHA earns a fresh relaunch allowance, and clause 4 strikes do not spend it",
      pushedNewHead.verdict?.verdict === "STALLED" &&
        pushedNewHead.verdict.relaunch.allowed === true &&
        pushedNewHead.verdict.relaunch.consumed === 0 &&
        pushedNewHead.verdict.relaunch.remaining === 2,
      `exit ${pushedNewHead.status}\n     ${(pushedNewHead.stderr || pushedNewHead.stdout).slice(0, 600)}`,
    )

    clearStrikeLedger()
    const grants = [1, 2].map((expected) => {
      const granted = runWorkerStatusCase(fixture, [screenshot, critique], { ...abandoned, consumeRelaunch: true })
      return granted.status === 0 && granted.verdict?.relaunch.consumed === expected && relaunchStrikeCount("ORB-75", fixture.prHead) === expected
    })
    const exhausted = runWorkerStatusCase(fixture, [screenshot, critique], { ...abandoned, consumeRelaunch: true })
    T(
      "worker-status.mjs: --consume-relaunch spends the cap once per grant and then refuses",
      grants.every(Boolean) &&
        exhausted.status === 4 &&
        exhausted.verdict?.relaunch.allowed === false &&
        relaunchStrikeCount("ORB-75", fixture.prHead) === 2,
      `grants ${JSON.stringify(grants)} exhausted exit ${exhausted.status}\n     ${(exhausted.stderr || exhausted.stdout).slice(0, 600)}`,
    )
    clearStrikeLedger()
    clearPidMarker(fixture.worktree)

    /**
     * `pr list` and the head graphql call are two separate reads. When the second resolves without
     * a head while the first still reports OPEN, keying the allowance on the local head would hand
     * out a relaunch against a SHA GitHub never saw, so the read is reported failed instead.
     */
    const unreadablePrHead = runWorkerStatusCase(fixture, [screenshot, critique], { prHead: null })
    T(
      "worker-status.mjs: an OPEN pull request whose head could not be read exits 3 instead of keying the allowance on the local head",
      unreadablePrHead.status === 3 &&
        /returned no pull request head/.test(unreadablePrHead.stderr) &&
        unreadablePrHead.stderr.includes("gh pr list reports OPEN"),
      `exit ${unreadablePrHead.status}\n     ${(unreadablePrHead.stderr || unreadablePrHead.stdout).slice(0, 600)}`,
    )

    /**
     * The strike ledger's two fail-closed guards, driven from its heaviest consumer because no
     * consumer drove either one. An empty override is the isolation that silently stopped applying
     * and wrote the operator's real home ledger instead; a malformed line is a count that would
     * otherwise read short and hand out an allowance already spent.
     */
    const emptyLedgerOverride = runWorkerStatusCase(fixture, [screenshot, critique], { strikeLedger: "" })
    T(
      "worker-status.mjs: an empty strike-ledger override is a usage error, never a silent fall back to the home ledger",
      emptyLedgerOverride.status === 2 && emptyLedgerOverride.stderr.includes(`${STRIKE_LEDGER_ENV} must not be empty`),
      `exit ${emptyLedgerOverride.status}\n     ${(emptyLedgerOverride.stderr || emptyLedgerOverride.stdout).slice(0, 600)}`,
    )
    writeFileSync(STRIKE_LEDGER, `${JSON.stringify({ scope: "relaunch", issue: "ORB-75", key: fixture.prHead })}\n{ not json\n`)
    const malformedLedgerLine = runWorkerStatusCase(fixture, [screenshot, critique], abandoned)
    T(
      "worker-status.mjs: a malformed strike-ledger line fails the allowance read closed rather than counting short",
      malformedLedgerLine.status === 3 && /line 2 is not JSON/.test(malformedLedgerLine.stderr),
      `exit ${malformedLedgerLine.status}\n     ${(malformedLedgerLine.stderr || malformedLedgerLine.stdout).slice(0, 600)}`,
    )
    clearStrikeLedger()

    check("worker-status.mjs", "refuses an unknown option", ["--worktree", root, "--issue", "ORB-75", "--orbit-not-a-flag"], {
      status: 2,
      stderr: /unknown option\(s\): --orbit-not-a-flag/,
    })
    check("worker-status.mjs", "--help documents every verdict and every exit code", ["--help"], {
      status: 0,
      stdout: new RegExp(
        `DELIVERED[\\s\\S]*WORKING[\\s\\S]*AWAITING-REVIEW[\\s\\S]*NEEDS-WORK[\\s\\S]*STALLED[\\s\\S]*AWAITING-MERGE[\\s\\S]*IDLE[\\s\\S]*UNKNOWN[\\s\\S]*${STRIKE_LEDGER_ENV}[\\s\\S]*1 unmet items[\\s\\S]*2 usage error[\\s\\S]*3 a git, gh or orca command failed, an OPEN pull request's head could not be read[\\s\\S]*4 --consume-relaunch refused`,
      ),
    })
    check("worker-status.mjs", "--help pins the reuse backstop the cases are written against", ["--help"], {
      status: 0,
      stdout: /claimed more than 16 hours ago/,
    })
  }
