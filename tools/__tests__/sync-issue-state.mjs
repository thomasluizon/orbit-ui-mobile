import { existsSync, readFileSync } from "node:fs"

import { check, githubIssueReadPlan, orcaEnv, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig, T } from "./_harness.mjs"

const TOOL = "sync-issue-state.mjs"
const HEAD = "a".repeat(40)
const BASE = "b".repeat(40)
const issue = (overrides = {}) => ({
  blockedBy: { nodes: [], totalCount: 0 },
  blocking: { nodes: [], totalCount: 0 },
  body: "Ticket body",
  labels: [{ name: "repo:ui" }],
  number: 221,
  state: "OPEN",
  stateReason: null,
  title: "Ticket title",
  url: "https://github.com/thomasluizon/orbit-tickets/issues/221",
  ...overrides,
})
const projectItems = JSON.stringify({
  data: { repository: { issue: {
    number: 221,
    state: "OPEN",
    projectItems: { nodes: [], pageInfo: { hasNextPage: false, endCursor: "cursor-one" } },
  } } },
})

export const cases = () => {
  // The pull request binding resolves the repository slug from origin, so the fixture needs a real
  // GitHub URL rather than stageRepo's local bare path.
  const repo = stageRepo("sync-issue-state")
  if (!repo || repo.git(["remote", "set-url", "origin", "https://github.com/thomasluizon/orbit-ui-mobile.git"]).status !== 0) {
    T(`${TOOL}: fixture repository initialized`, false)
    return
  }
  const config = realOrchestratorConfig()
  const staged = stageWithConfig("sync-issue-state", TOOL, { ...config, repos: { ...config.repos, ui: repo.path } })
  stage("staged/sync-issue-state/.claude/linear-to-github-map.json", JSON.stringify({ issues: { "ORB-215": { number: 221 } } }))
  const message = stage("sync-issue-state/message.md", "PR #700 is ready on the final head.")
  const argv = ["--issue", "ORB-215", "--repo", "ui", "--pr", "700", "--state", "ready", "--head-sha", HEAD, "--base-sha", BASE, "--message-file", message]
  /**
   * The pull request read that binds the write to the intended ticket. The repo:* label proves only
   * the REPOSITORY, and hundreds of tickets share it, so a mistyped --issue naming another ticket
   * with the same label used to pass. The tool now requires the live pull request to reference the
   * ticket in its branch, title or body.
   */
  const pullRequest = (overrides = {}) => ({
    number: 700,
    headRefName: "fix/orb-215-harness",
    title: "fix: harness work",
    body: "Refs ORB-215",
    ...overrides,
  })
  const readPlan = (ticket = issue(), pr = pullRequest()) => [
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "pr view 700 --repo", stdout: JSON.stringify(pr) },
    ...githubIssueReadPlan(ticket),
    { match: "api graphql -F o=thomasluizon -F r=orbit-tickets -F n=221", stdout: projectItems, ticketEnvelope: "issueProjectItems" },
  ]
  const writePlan = (statusMarker, commentMarker, stdinFile) => [
    { match: "project item-edit 2 --owner thomasluizon", stdout: "", ignoreTicketShape: true, removePath: statusMarker },
    { match: "issue comment 221 --repo thomasluizon/orbit-tickets", stdout: "", ignoreTicketShape: true, removePath: commentMarker, stdinFile },
  ]

  const statusMarker = stage("sync-issue-state/status-marker", "status")
  const commentMarker = stage("sync-issue-state/comment-marker", "comment")
  const commentBody = stage("sync-issue-state/comment-body", "")
  const first = run(TOOL, argv, { path: staged.path, env: orcaEnv([...readPlan(), ...writePlan(statusMarker, commentMarker, commentBody)]) })
  const artifact = JSON.parse(first.stdout || "null")
  T(
    `${TOOL}: moves ready to the configured review status and posts the exact comment`,
    first.status === 0 && !existsSync(statusMarker) && !existsSync(commentMarker) && readFileSync(commentBody, "utf8") === "PR #700 is ready on the final head." && artifact?.status === "In Review",
    first.stderr || first.stdout,
  )

  const duplicateCommentMarker = stage("sync-issue-state/duplicate-comment-marker", "must remain")
  const duplicateStatusMarker = stage("sync-issue-state/duplicate-status-marker", "status")
  const second = run(TOOL, argv, {
    path: staged.path,
    env: orcaEnv([
      ...readPlan(),
      { match: "project item-edit 2 --owner thomasluizon", stdout: "", ignoreTicketShape: true, removePath: duplicateStatusMarker },
      { match: "issue comment 221 --repo thomasluizon/orbit-tickets", stdout: "", ignoreTicketShape: true, removePath: duplicateCommentMarker },
    ]),
  })
  T(
    `${TOOL}: the stored signature suppresses a repeat state comment`,
    second.status === 0 && !existsSync(duplicateStatusMarker) && existsSync(duplicateCommentMarker) && JSON.parse(second.stdout).commentPosted === false,
    second.stderr || second.stdout,
  )

  for (const [name, labels, pattern] of [
    ["missing", [{ name: "harness" }], /no repo:\* label/],
    ["wrong", [{ name: "repo:api" }], /expected exactly repo:ui/],
    ["ambiguous", [{ name: "repo:ui" }, { name: "repo:api" }], /repo:ui and repo:api/],
  ]) {
    const statusUnused = stage(`sync-issue-state/${name}-status`, "must remain")
    const commentUnused = stage(`sync-issue-state/${name}-comment`, "must remain")
    const refused = run(TOOL, argv, {
      path: staged.path,
      env: orcaEnv([...readPlan(issue({ labels })), ...writePlan(statusUnused, commentUnused)]),
    })
    T(
      `${TOOL}: ${name} repository label is refused before either write`,
      refused.status === 2 && pattern.test(refused.stderr) && existsSync(statusUnused) && existsSync(commentUnused),
      refused.stderr || refused.stdout,
    )
  }

  const closedStatus = stage("sync-issue-state/closed-status", "must remain")
  const closedComment = stage("sync-issue-state/closed-comment", "must remain")
  const closed = run(TOOL, argv, {
    path: staged.path,
    env: orcaEnv([...readPlan(issue({ state: "CLOSED" })), ...writePlan(closedStatus, closedComment)]),
  })
  T(
    `${TOOL}: a closed ticket is terminal and no write can regress it`,
    closed.status === 1 && /never regresses a closed ticket/.test(closed.stderr) && existsSync(closedStatus) && existsSync(closedComment),
    closed.stderr || closed.stdout,
  )

  check(
    TOOL,
    "an ORB identifier absent from the migration map is refused without a raw-number retry",
    [...argv.slice(0, 1), "ORB-999999", ...argv.slice(2)],
    { status: 2, stderr: /Unknown migrated ticket ORB-999999/ },
    { path: staged.path, env: orcaEnv([]) },
  )
  check(
    TOOL,
    "Done is never accepted as a pre-merge synchronization target",
    [...argv.slice(0, argv.indexOf("--state") + 1), "done", ...argv.slice(argv.indexOf("--state") + 2)],
    { status: 2, stderr: /usage: sync-issue-state\.mjs/ },
    { path: staged.path, env: orcaEnv([]) },
  )

  check(
    TOOL,
    "a ticket status write failure is reported",
    argv,
    { status: 1, stderr: /ticket status synchronization failed/ },
    {
      path: staged.path,
      env: orcaEnv([
        ...readPlan(),
        { match: "project item-edit 2 --owner thomasluizon", stdout: "", stderr: "permission denied", exit: 1, ignoreTicketShape: true },
      ]),
    },
  )

  /**
   * THE binding between the write and the intended ticket.
   *
   * The repo:* label proves only the REPOSITORY, and hundreds of tickets carry the same one, so a
   * mistyped --issue that happened to name another ticket with that label used to pass every guard
   * and move a stranger's ticket. The live pull request must reference the ticket.
   */
  const unrelatedStatus = stage("sync-issue-state/unrelated-status", "status")
  const unrelatedComment = stage("sync-issue-state/unrelated-comment", "comment")
  check(
    TOOL,
    "a pull request that does not reference the ticket is refused before either write",
    argv,
    { status: 2, stderr: /does not reference ORB-215 in its branch, title, or body/ },
    {
      path: staged.path,
      env: orcaEnv([
        ...readPlan(issue(), pullRequest({ headRefName: "fix/something-else", title: "fix: unrelated", body: "No ticket here" })),
        ...writePlan(unrelatedStatus, unrelatedComment),
      ]),
    },
  )
  T(
    `${TOOL}: the unreferenced refusal wrote neither the status nor the comment`,
    existsSync(unrelatedStatus) && existsSync(unrelatedComment),
    "a refusal must write nothing",
  )

  /** The reference may live in any of the three fields, so each one is proven to satisfy it. */
  for (const [field, pr] of [
    ["branch", pullRequest({ headRefName: "fix/orb-215-work", title: "fix: x", body: "no reference" })],
    ["title", pullRequest({ headRefName: "fix/x", title: "fix: ORB-215 work", body: "no reference" })],
    ["body", pullRequest({ headRefName: "fix/x", title: "fix: x", body: "Refs ORB-215" })],
  ]) {
    const okStatus = stage(`sync-issue-state/ok-status-${field}`, "status")
    const okComment = stage(`sync-issue-state/ok-comment-${field}`, "comment")
    const okBody = stage(`sync-issue-state/ok-body-${field}`, "")
    const result = run(TOOL, argv, { path: staged.path, env: orcaEnv([...readPlan(issue(), pr), ...writePlan(okStatus, okComment, okBody)]) })
    T(`${TOOL}: a reference in the pull request ${field} satisfies the binding`, result.status === 0, result.stderr || result.stdout)
  }
}
