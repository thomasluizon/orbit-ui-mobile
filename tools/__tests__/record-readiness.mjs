import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { newestChecks, pullRequestStateFromGraphQl, registrationFingerprint } from "../lib/readiness-receipt.mjs"
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

  /**
   * The two app ids are live, read on 2026-08-12 from
   * `gh api repos/thomasluizon/orbit-ui-mobile/branches/main/protection/required_status_checks`,
   * which pins every workflow check to 15368 (github-actions) and `pullfrog-approval` to 1768019.
   */
  const GITHUB_ACTIONS_APP = 15368
  const PULLFROG_APP = 1768019
  /** The exact node shape the confirmed GraphQL rollup returns, app identity included. */
  const checkRun = (name, appId, { status = "COMPLETED", conclusion = "SUCCESS", startedAt = "2026-08-07T10:00:00Z", workflow = "Guards" } = {}) => ({
    __typename: "CheckRun",
    name,
    status,
    conclusion,
    startedAt,
    completedAt: startedAt,
    detailsUrl: null,
    checkSuite: { app: { databaseId: appId }, workflowRun: workflow === null ? null : { workflow: { name: workflow } } },
  })
  const greenCheck = checkRun("Lint", GITHUB_ACTIONS_APP)
  /**
   * Pullfrog reviews the pull request in GitHub Actions and publishes `pullfrog-approval`, which is
   * a required status check on `main` pinned to Pullfrog's own app. The review verdict therefore
   * arrives through the required checks this tool already reads, and no separate review artifact
   * exists to pass here.
   */
  const approval = checkRun("pullfrog-approval", PULLFROG_APP, { startedAt: "2026-08-07T10:30:00Z", workflow: null })
  const writeDelivery = (baseRefName = "main", nodes = [greenCheck, approval]) => {
    const evidence = JSON.parse(readFileSync(delivery, "utf8"))
    const observed = pullRequestStateFromGraphQl({ data: { repository: { pullRequest: {
      number: 700, baseRefName, baseRefOid: BASE, headRefOid: HEAD, isDraft: false,
      statusCheckRollup: { contexts: { nodes } },
    } } } })
    evidence.checks.pullRequestState.baseBranch = baseRefName
    evidence.checks.ci.registrationFingerprint = registrationFingerprint(observed, newestChecks(observed.statusCheckRollup))
    writeFileSync(delivery, JSON.stringify(evidence))
  }
  writeDelivery()
  const live = (headRefOid = HEAD, baseRefOid = BASE, behindBy = 0, ticketStatus = "In Review", options = {}) => ({
    ...orcaEnv([
      { match: "auth token --user thomasluizon", stdout: "test-github-token" },
      { match: "api graphql", stdout: JSON.stringify({ data: { repository: { pullRequest: {
        number: 700,
        baseRefName: options.baseRefName ?? "main",
        baseRefOid,
        headRefOid,
        isDraft: options.isDraft ?? false,
        statusCheckRollup: { contexts: { nodes: options.statusCheckRollup ?? [greenCheck, approval] } },
      } } } }) },
      /**
       * The real payload carries BOTH lists, and only `checks` names the app that must provide each
       * check. Confirmed live on 2026-08-12 against the `main` protection of this repository.
       */
      { match: `branches/${encodeURIComponent(options.baseRefName ?? "main")}/protection/required_status_checks`, stdout: options.protectionResponse ?? JSON.stringify({
        contexts: ["Lint", "pullfrog-approval"],
        ...(options.omitChecks === true ? {} : { checks: options.checks ?? [{ context: "Lint", app_id: GITHUB_ACTIONS_APP }, { context: "pullfrog-approval", app_id: PULLFROG_APP }] }),
      }), exit: options.protectionExit ?? 0 },
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

  /** Complete body observed from gh api on redesign/main on 2026-09-05, exit 1. */
  const unprotected = {
    baseRefName: "redesign/main",
    protectionExit: 1,
    protectionResponse: JSON.stringify({
      message: "Branch not protected",
      documentation_url: "https://docs.github.com/rest/branches/branch-protection#get-status-checks-protection",
      status: "404",
    }),
  }
  const unprotectedCase = (name, options, expected = { status: 1, stdout: /CI_STALE/ }, head = HEAD, observedRollup = options.statusCheckRollup ?? [greenCheck, approval]) => {
    writeDelivery("redesign/main", observedRollup)
    return check(TOOL, name, argv, expected, { path: staged.path, env: live(head, BASE, 0, "In Review", { ...unprotected, ...options }) })
  }
  unprotectedCase("confirmed 404 completes and persists READY with passing CI and independent review", {}, { status: 0, stdout: /"verdict": "READY"/ })
  const unprotectedReceipt = JSON.parse(readFileSync(join(repo.path, ".git", "orbit-pr-readiness", "ui-700.json"), "utf8"))
  T(`${TOOL}: confirmed 404 persists the unprotected base and current passing evidence`,
    unprotectedReceipt.baseBranch === "redesign/main" && unprotectedReceipt.currentHeadSha === HEAD && unprotectedReceipt.ci.green === true,
    JSON.stringify(unprotectedReceipt))
  unprotectedCase("confirmed 404 with no checks completes as not READY", { statusCheckRollup: [] })
  const emptyReceipt = JSON.parse(readFileSync(join(repo.path, ".git", "orbit-pr-readiness", "ui-700.json"), "utf8"))
  T(`${TOOL}: no-check 404 writes a blocking receipt instead of leaving the previous READY receipt`,
    emptyReceipt.ci.green === false && emptyReceipt.ci.settled === false, JSON.stringify(emptyReceipt))
  unprotectedCase("unprotected passing CI without independent review cannot reach READY", { statusCheckRollup: [greenCheck] })
  unprotectedCase("unprotected review from the wrong app cannot reach READY", { statusCheckRollup: [greenCheck, checkRun("pullfrog-approval", GITHUB_ACTIONS_APP)] })
  unprotectedCase("unprotected failing CI cannot reach READY despite passing review", { statusCheckRollup: [{ ...greenCheck, conclusion: "FAILURE" }, approval] })
  unprotectedCase("unprotected pending CI cannot reach READY despite passing review", { statusCheckRollup: [{ ...greenCheck, status: "IN_PROGRESS", conclusion: null }, approval] })
  unprotectedCase("unprotected newest failed review rerun cannot reach READY", { statusCheckRollup: [greenCheck, approval, { ...approval, conclusion: "FAILURE", startedAt: "2026-08-07T11:00:00Z" }] })
  unprotectedCase("unprotected live head advance invalidates delivery evidence", {}, { status: 1, stdout: /CI_STALE/ }, "cccccccccccccccccccccccccccccccccccccccc")
  for (const [name, nodes] of [
    ["new green check", [greenCheck, approval, checkRun("Build", GITHUB_ACTIONS_APP)]],
    ["green rerun", [greenCheck, approval, { ...greenCheck, startedAt: "2026-08-07T11:00:00Z" }]],
    ["removed green check", [approval]],
  ]) {
    unprotectedCase(`same-head ${name} invalidates delivery observation`, { statusCheckRollup: nodes },
      { status: 1, stdout: /"verdict": "CI_STALE"/ }, HEAD, [greenCheck, approval])
    const staleReceipt = JSON.parse(readFileSync(join(repo.path, ".git", "orbit-pr-readiness", "ui-700.json"), "utf8"))
    T(`${TOOL}: ${name} persists blocking CI evidence`, staleReceipt.ci.green === false && staleReceipt.ci.settled === false, JSON.stringify(staleReceipt))
  }
  unprotectedCase("reordered matching evidence remains READY", { statusCheckRollup: [approval, greenCheck] },
    { status: 0, stdout: /"verdict": "READY"/ }, HEAD, [greenCheck, approval])
  unprotectedCase("superseded old runs do not invalidate matching latest evidence", {
    statusCheckRollup: [{ ...greenCheck, conclusion: "FAILURE", startedAt: "2026-08-07T09:00:00Z" }, greenCheck, approval],
  }, { status: 0, stdout: /"verdict": "READY"/ }, HEAD, [greenCheck, approval])
  const legacyDelivery = JSON.parse(readFileSync(delivery, "utf8"))
  delete legacyDelivery.checks.ci.registrationFingerprint
  writeFileSync(delivery, JSON.stringify(legacyDelivery))
  check(TOOL, "delivery without a registration fingerprint needs re-verification", argv,
    { status: 1, stdout: /"verdict": "CI_STALE"/ }, { path: staged.path, env: live(HEAD, BASE, 0, "In Review", unprotected) })
  for (const [name, protectionResponse] of [
    ["malformed JSON", "not JSON"],
    ["unconfirmed error prose", JSON.stringify({ message: "Branch not protected" })],
    ["numeric 404", JSON.stringify({ status: 404 })],
    ["another failure status", JSON.stringify({ status: "403" })],
  ]) {
    unprotectedCase(`${name} remains an environment error`, { protectionResponse }, { status: 2 })
  }
  unprotectedCase("successful malformed protection cannot masquerade as confirmed 404", { protectionExit: 0 }, { status: 2, stderr: /returned no \{ context, app_id \} checks array/ })
  writeDelivery()

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

  /**
   * The producer gate, end to end. Branch protection pins `pullfrog-approval` to app 1768019, so a
   * SUCCESS of that exact name published by any other app leaves the required check unsatisfied and
   * GitHub still refuses the merge. A receipt keyed on the context alone called this READY.
   */
  check(
    TOOL,
    "a SUCCESS pullfrog-approval published by the WRONG app cannot reach READY",
    argv,
    { status: 1, stdout: /CI_STALE/ },
    { path: staged.path, env: live(HEAD, BASE, 0, "In Review", { statusCheckRollup: [greenCheck, checkRun("pullfrog-approval", GITHUB_ACTIONS_APP, { startedAt: "2026-08-07T10:30:00Z" })] }) },
  )
  /** The same rollup clears once protection accepts any producer for that context. */
  writeDelivery("main", [greenCheck, checkRun("pullfrog-approval", GITHUB_ACTIONS_APP, { startedAt: "2026-08-07T10:30:00Z" })])
  check(
    TOOL,
    "a required check with a null app id is satisfied by any producer",
    argv,
    { status: 0, stdout: /"verdict": "READY"/ },
    { path: staged.path, env: live(HEAD, BASE, 0, "In Review", {
      statusCheckRollup: [greenCheck, checkRun("pullfrog-approval", GITHUB_ACTIONS_APP, { startedAt: "2026-08-07T10:30:00Z" })],
      checks: [{ context: "Lint", app_id: GITHUB_ACTIONS_APP }, { context: "pullfrog-approval", app_id: null }],
    }) },
  )
  /** `contexts` alone cannot decide, so a protection payload without `checks` fails closed. */
  writeDelivery()
  check(
    TOOL,
    "a protection payload carrying no checks array fails closed rather than ignoring the producer",
    argv,
    { status: 2, stderr: /returned no \{ context, app_id \} checks array/ },
    { path: staged.path, env: live(HEAD, BASE, 0, "In Review", { omitChecks: true }) },
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
