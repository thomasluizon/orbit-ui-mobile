import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, root, stage, orcaEnv, run, check } from "./_harness.mjs"

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

export const cases = () => {
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
  }
