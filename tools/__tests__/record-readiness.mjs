import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, check, orcaEnv, realOrchestratorConfig, stage, stageRepo, stageWithConfig } from "./_harness.mjs"

const TOOL = "record-readiness.mjs"
const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
let BASE = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

export const cases = () => {
  const repo = stageRepo("record-readiness")
  if (!repo) {
    T(`${TOOL}: a git fixture is available`, false, "could not stage repository")
    return
  }
  const real = realOrchestratorConfig()
  const staged = stageWithConfig("record-readiness", TOOL, { ...real, repos: { ui: repo.path } })
  stage(
    "staged/record-readiness/tools/lib/github-issues.mjs",
    `export const resolveTicket = (reference) => {
  const identifier = String(reference).toUpperCase()
  if (!/^ORB-\\d+$/.test(identifier)) throw new Error("unknown ticket")
  return { identifier, number: Number(identifier.slice(4)) }
}
export const readTicket = async (number) => ({
  identifier: "ORB-" + number,
  number,
  status: process.env.ORBIT_TICKET_STATUS || "In Review",
  state: "OPEN",
  stateReason: null,
  labels: JSON.parse(process.env.ORBIT_TICKET_LABELS || '[{"name":"repo:ui"}]'),
})
export const assertRepositoryLabel = (ticket, repoKey) => {
  const labels = ticket.labels.filter((label) => label.name.startsWith("repo:")).map((label) => label.name)
  if (labels.length !== 1 || labels[0] !== "repo:" + repoKey) throw new Error("ticket repository label mismatch")
  return ticket
}
`,
  )

  /** A real commit, so the fixture's origin/main is a resolvable ref like the one delivery reads. */
  mkdirSync(join(repo.path, "docs"), { recursive: true })
  writeFileSync(join(repo.path, "docs", "fixture.md"), "# readiness fixture\n")
  const committed =
    repo.git(["add", "--", "docs/fixture.md"]).status === 0 &&
    repo.git(["commit", "-q", "-m", "fixture"]).status === 0 &&
    repo.git(["push", "-q", "origin", "main"]).status === 0
  T(`${TOOL}: the fixture repository carries a commit`, committed, "could not commit into the fixture")
  BASE = repo.git(["rev-parse", "HEAD"]).stdout.trim()

  repo.git(["remote", "set-url", "origin", "https://github.com/thomasluizon/orbit-ui-mobile.git"])
  const delivery = stage("record-readiness/delivery.json", JSON.stringify({ issue: "ORB-700", verdict: "DELIVERED", checks: {
    prCount: { number: 700 }, pullRequestState: { baseBranch: "main", baseSha: BASE, headSha: HEAD, draft: false },
    upToDate: { behindBy: 0 }, ci: { pass: true, failing: [], pending: [] },
  }}))
  const ticketArtifact = stage("record-readiness/ticket.json", JSON.stringify({ issue: "ORB-700", repositoryKey: "ui", prNumber: 700, status: "In Review", lastSynchronizationResult: "SUCCESS", lastPostedState: "ready", headSha: HEAD, baseSha: BASE }))
  const argv = ["--repo", "ui", "--pr", "700", "--delivery", delivery, "--ticket", ticketArtifact]

  const greenCheck = { __typename: "CheckRun", name: "Lint", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-07T10:00:00Z", workflowName: "Guards" }
  /**
   * Pullfrog reviews the pull request in GitHub Actions and publishes `pullfrog-approval`, which is
   * a required status check on `main`. The review verdict therefore arrives through the required
   * contexts this tool already reads, and no separate review artifact exists to pass here.
   */
  const approval = { __typename: "StatusContext", context: "pullfrog-approval", state: "SUCCESS", createdAt: "2026-08-07T10:30:00Z" }
  const live = (headRefOid = HEAD, baseRefOid = BASE, behindBy = 0, ticketStatus = "In Review", options = {}) => ({
    ...orcaEnv([
      { match: "auth token --user thomasluizon", stdout: "test-github-token" },
      { match: "pr view 700", stdout: JSON.stringify({
        number: 700,
        baseRefName: "main",
        baseRefOid,
        headRefOid,
        isDraft: options.isDraft ?? false,
        statusCheckRollup: options.statusCheckRollup ?? [greenCheck, approval],
      }) },
      { match: "branches/main/protection/required_status_checks", stdout: JSON.stringify({ contexts: ["Lint", "pullfrog-approval"] }) },
      { match: "api repos/", stdout: JSON.stringify({ behind_by: behindBy }) },
    ]),
    ORBIT_TICKET_STATUS: ticketStatus,
    ORBIT_TICKET_LABELS: JSON.stringify(options.labels ?? [{ name: "repo:ui" }]),
  })

  check(TOOL, "matching final-head artifacts persist READY", argv, { status: 0, stdout: /"verdict": "READY"/ }, { path: staged.path, env: live() })

  /** The receipt carries exactly the four axes readinessVerdicts reads: draft, behindBy, ci, ticket. */
  const readyReceipt = JSON.parse(readFileSync(join(repo.path, ".git", "orbit-pr-readiness", "ui-700.json"), "utf8"))
  T(
    `${TOOL}: the persisted receipt carries exactly the identity fields and the four readiness axes`,
    Object.keys(readyReceipt ?? {}).sort().join(",") === ["issue", "repositoryKey", "prNumber", "baseBranch", "currentBaseSha", "currentHeadSha", "ci", "behindBy", "draft", "ticket"].sort().join(",") &&
      readyReceipt.draft === false &&
      readyReceipt.behindBy === 0 &&
      readyReceipt.ci.green === true &&
      readyReceipt.ticket.targetStatus === "In Review",
    JSON.stringify(readyReceipt),
  )

  /**
   * The review gate, end to end. Branch protection requires `pullfrog-approval`, and a pull request
   * Pullfrog has not approved reaches this tool as a required context the rollup does not carry.
   * That absence is the only mechanism blocking an unreviewed pull request, so it is asserted here.
   */
  check(
    TOOL,
    "a required pullfrog-approval absent from the rollup cannot reach READY",
    argv,
    { status: 1, stdout: /CI_STALE/ },
    { path: staged.path, env: live(HEAD, BASE, 0, "In Review", { statusCheckRollup: [greenCheck] }) },
  )

  const failedRerun = { ...greenCheck, conclusion: "FAILURE", startedAt: "2026-08-07T11:00:00Z" }
  check(TOOL, "a same-SHA failed CI rerun prevents READY during aggregation", argv, { status: 1, stdout: /CI_STALE/ }, { path: staged.path, env: live(HEAD, BASE, 0, "In Review", { statusCheckRollup: [greenCheck, approval, failedRerun] }) })
  check(TOOL, "a live draft pull request cannot persist READY", argv, { status: 1, stdout: /DRAFT/ }, { path: staged.path, env: live(HEAD, BASE, 0, "In Review", { isDraft: true }) })

  const advancedHead = "cccccccccccccccccccccccccccccccccccccccc"
  const advanced = check(TOOL, "a live head advance after delivery cannot persist READY", argv, { status: 1, stdout: /CI_STALE/ }, { path: staged.path, env: live(advancedHead) })
  T(`${TOOL}: live revalidation reports the actual current head`, new RegExp(`"headSha": "${advancedHead}"`).test(advanced.stdout), advanced.stdout)
  const advancedBase = "dddddddddddddddddddddddddddddddddddddddd"
  const behind = check(TOOL, "live base advancement and behind_by cannot persist READY", argv, { status: 1, stdout: /OUT_OF_DATE/ }, { path: staged.path, env: live(HEAD, advancedBase, 1) })
  T(`${TOOL}: live compare reports the current behind count`, /"behindBy": 1/.test(behind.stdout), behind.stdout)

  check(TOOL, "a live ticket status change invalidates the synchronization artifact", argv, { status: 1, stdout: /TICKET_STALE/ }, { path: staged.path, env: live(HEAD, BASE, 0, "In Progress") })
  check(
    TOOL,
    "a ticket labelled for another repository fails closed rather than recording a receipt",
    argv,
    { status: 2, stderr: /ticket repository label mismatch/ },
    { path: staged.path, env: live(HEAD, BASE, 0, "In Review", { labels: [{ name: "repo:api" }] }) },
  )
  const wrongTicket = stage("record-readiness/wrong-ticket.json", JSON.stringify({ issue: "ORB-701", repositoryKey: "api", prNumber: 701, status: "In Review", lastSynchronizationResult: "SUCCESS", lastPostedState: "ready", headSha: HEAD, baseSha: BASE }))
  check(TOOL, "a ticket receipt for another ticket, repository, or PR is rejected", [...argv.slice(0, -1), wrongTicket], { status: 2, stderr: /does not name this delivery issue, repository, and pull request/ }, { path: staged.path, env: live() })
  check(TOOL, "a missing artifact fails closed", [...argv.slice(0, -1), join(repo.path, "missing.json")], { status: 2, stderr: /could not be read as JSON/ }, { path: staged.path, env: live() })

  /**
   * The tool accepts --repo, --pr, --delivery and --ticket, and nothing else. Every other flag is
   * refused by name before any live read, so a caller that passes review evidence fails loudly
   * rather than writing a receipt that silently ignores the argument.
   */
  check(TOOL, "a --review flag is refused by name before any live read", [...argv, "--review", "review.json"], { status: 2, stderr: /unknown option\(s\): --review/ }, { path: staged.path, env: live() })
  check(TOOL, "--bot and --codex-only are refused by name before any live read", [...argv, "--bot", "bot.json", "--codex-only"], { status: 2, stderr: /unknown option\(s\): --bot --codex-only/ }, { path: staged.path, env: live() })
}
