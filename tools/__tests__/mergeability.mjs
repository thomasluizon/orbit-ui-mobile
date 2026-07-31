import { readFileSync } from "node:fs"

import { T, stage, orcaEnv, run } from "./_harness.mjs"

const mergeabilityCases = () => {
  const head = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const stale = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  const localReview = (recommendation = "APPROVE", markerHead = head, commit = head, at = "2026-07-31T10:00:00Z") => ({
    state: "COMMENTED",
    body: `<!-- orbit-local-review: ${JSON.stringify({ version: 1, head: markerHead, recommendation })} -->`,
    submittedAt: at,
    updatedAt: at,
    lastEditedAt: null,
    url: "https://github.com/orbit/ui/pull/615#pullrequestreview-local",
    author: { login: "local-reviewer" },
    commit: { oid: commit },
  })
  const checkRun = (name, conclusion, createdAt = "2026-07-31T14:55:29Z", startedAt = createdAt) => ({
    __typename: "CheckRun",
    name,
    status: "COMPLETED",
    conclusion,
    startedAt,
    checkSuite: { createdAt },
  })
  const pullRequest = (overrides = {}) => ({
    number: 615,
    url: "https://github.com/orbit/ui/pull/615",
    title: "ORB-143 merge decision",
    body: "",
    headRefName: "feature/orb-143-mergeability",
    isDraft: false,
    mergeStateStatus: "CLEAN",
    reviewDecision: "",
    headRefOid: head,
    files: { pageInfo: { hasNextPage: false }, nodes: [{ path: "tools/example.mjs" }] },
    labels: { pageInfo: { hasNextPage: false }, nodes: [] },
    reviews: {
      pageInfo: { hasNextPage: false },
      nodes: [localReview()],
    },
    comments: { pageInfo: { hasNextPage: false }, nodes: [] },
    reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
    commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS", contexts: { pageInfo: { hasNextPage: false }, nodes: [checkRun("CI", "SUCCESS")] } } } }] },
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
  T("mergeability.mjs: current local approval evidence is MERGEABLE", mergeable.status === 0 && /^MERGEABLE\r?\n/.test(mergeable.stdout) && (mergeable.stdout.match(/^OK /gm) ?? []).length === 10, mergeable.stderr || mergeable.stdout)
  T("mergeability.mjs: only records the GitHub and Linear read verbs", mergeable.calls.length === 4 && mergeable.calls.every((call) => (/[\\/]api$/.test(call[0]) && call[1] === "graphql") || (/[\\/]linear$/.test(call[0]) && call[1] === "issue")), JSON.stringify(mergeable.calls))
  T("mergeability.mjs: the atomic GitHub snapshot requests the complete changed-files inventory", mergeable.calls.filter((call) => /[\\/]api$/.test(call[0])).every((call) => call.some((argument) => argument.includes("files(first:100){pageInfo{hasNextPage}nodes{path}}"))), JSON.stringify(mergeable.calls))
  const machine = runCase("machine", pullRequest(), { json: true })
  T("mergeability.mjs: JSON output carries the consumable verdict and conditions", machine.status === 0 && JSON.parse(machine.stdout).verdict === "MERGEABLE" && JSON.parse(machine.stdout).conditions.length === 10, machine.stderr || machine.stdout)
  const draft = runCase("draft", pullRequest({ isDraft: true }))
  T("mergeability.mjs: a draft is HELD even when GitHub says CLEAN", draft.status === 1 && /^HELD\r?\n/.test(draft.stdout) && /HELD draft: pull request is a draft/.test(draft.stdout), draft.stderr || draft.stdout)
  const unresolved = runCase("unresolved", pullRequest({ reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [{ isResolved: false }] } }))
  T("mergeability.mjs: an unresolved review thread is HELD", unresolved.status === 1 && /HELD unresolved-review-threads: 1 unresolved thread/.test(unresolved.stdout), unresolved.stderr || unresolved.stdout)
  const missingEvidence = runCase("missing-evidence", pullRequest({ reviews: { pageInfo: { hasNextPage: false }, nodes: [] } }))
  T("mergeability.mjs: absent local review evidence is HELD", missingEvidence.status === 1 && /HELD review-evidence: AWAITING_REVIEW/.test(missingEvidence.stdout), missingEvidence.stderr || missingEvidence.stdout)
  const incompleteFiles = runCase("incomplete-files", pullRequest({ files: { pageInfo: { hasNextPage: true }, nodes: [{ path: "tools/example.mjs" }] } }))
  T("mergeability.mjs: an incomplete changed-files inventory is HELD", incompleteFiles.status === 1 && /HELD review-evidence: INCOMPLETE: file inventory has another page/.test(incompleteFiles.stdout), incompleteFiles.stderr || incompleteFiles.stdout)
  const needsWork = runCase("needs-work", pullRequest({ reviews: { pageInfo: { hasNextPage: false }, nodes: [localReview("NEEDS_WORK")] } }))
  T("mergeability.mjs: latest NEEDS_WORK evidence is HELD", needsWork.status === 1 && /HELD review-evidence: NEEDS_WORK/.test(needsWork.stdout), needsWork.stderr || needsWork.stdout)
  const staleApproval = runCase("stale-approval", pullRequest({ reviews: { pageInfo: { hasNextPage: false }, nodes: [localReview(), { state: "APPROVED", body: "", submittedAt: "2026-07-31T09:00:00Z", updatedAt: "2026-07-31T09:00:00Z", lastEditedAt: null, url: "https://github.com/orbit/ui/pull/615#pullrequestreview-native", author: { login: "reviewer" }, commit: { oid: stale } }] } }))
  T("mergeability.mjs: any present stale native approval is HELD", staleApproval.status === 1 && /HELD review-evidence: STALE_NATIVE_APPROVAL/.test(staleApproval.stdout), staleApproval.stderr || staleApproval.stdout)
  const currentApproval = runCase("current-approval", pullRequest({ reviews: { pageInfo: { hasNextPage: false }, nodes: [localReview(), { state: "APPROVED", body: "", submittedAt: "2026-07-31T09:00:00Z", updatedAt: "2026-07-31T09:00:00Z", lastEditedAt: null, url: "https://github.com/orbit/ui/pull/615#pullrequestreview-native", author: { login: "reviewer" }, commit: { oid: head } }] } }))
  T("mergeability.mjs: current local and native approvals remain acceptable", currentApproval.status === 0 && /OK review-evidence: APPROVE/.test(currentApproval.stdout), currentApproval.stderr || currentApproval.stdout)
  const changesRequested = runCase("changes-requested", pullRequest({ reviewDecision: "CHANGES_REQUESTED" }))
  T("mergeability.mjs: CHANGES_REQUESTED remains HELD", changesRequested.status === 1 && /HELD review-decision: review decision is CHANGES_REQUESTED/.test(changesRequested.stdout), changesRequested.stderr || changesRequested.stdout)
  const latestCheck = runCase("latest-check", pullRequest({ commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE", contexts: { pageInfo: { hasNextPage: false }, nodes: [checkRun("CI", "SUCCESS", "2026-07-31T14:55:29Z"), checkRun("CI", "CANCELLED", "2026-07-31T14:53:08Z")] } } } }] } }))
  T("mergeability.mjs: a newer successful check supersedes an older cancellation regardless of array order", latestCheck.status === 0 && /OK check-rollup: 1 check\(s\), all terminal/.test(latestCheck.stdout), latestCheck.stderr || latestCheck.stdout)
  const sameSuiteRerun = runCase("same-suite-rerun", pullRequest({ commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE", contexts: { pageInfo: { hasNextPage: false }, nodes: [checkRun("CI", "SUCCESS", "2026-07-31T14:53:08Z", "2026-07-31T14:55:37Z"), checkRun("CI", "CANCELLED", "2026-07-31T14:53:08Z", "2026-07-31T14:53:17Z")] } } } }] } }))
  T("mergeability.mjs: a newer successful same-suite rerun supersedes its older cancellation", sameSuiteRerun.status === 0 && /OK check-rollup: 1 check\(s\), all terminal/.test(sameSuiteRerun.stdout), sameSuiteRerun.stderr || sameSuiteRerun.stdout)
  const tiedCheck = runCase("tied-check", pullRequest({ commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE", contexts: { pageInfo: { hasNextPage: false }, nodes: [checkRun("CI", "SUCCESS"), checkRun("CI", "CANCELLED")] } } } }] } }))
  T("mergeability.mjs: exact check start timestamp ties fail closed", tiedCheck.status === 1 && /HELD check-rollup:/.test(tiedCheck.stdout), tiedCheck.stderr || tiedCheck.stdout)
  const missingTimestamp = runCase("missing-check-timestamp", pullRequest({ commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE", contexts: { pageInfo: { hasNextPage: false }, nodes: [checkRun("CI", "SUCCESS", "2026-07-31T14:55:29Z", "2026-07-31T14:55:37Z"), checkRun("CI", "CANCELLED", "2026-07-31T14:53:08Z", null)] } } } }] } }))
  T("mergeability.mjs: a cancelled duplicate with no start timestamp cannot be discarded", missingTimestamp.status === 1 && /HELD check-rollup:/.test(missingTimestamp.stdout), missingTimestamp.stderr || missingTimestamp.stdout)
  const wrongState = runCase("wrong-state", pullRequest(), { issue: { state: { name: "In Progress" }, labels: [] } })
  T("mergeability.mjs: a linked issue outside In Review is HELD", wrongState.status === 1 && /HELD linear-in-review: issue ORB-143 is In Progress, requires In Review/.test(wrongState.stdout), wrongState.stderr || wrongState.stdout)
  const missingState = runCase("missing-state", pullRequest(), { issue: { labels: [] } })
  T("mergeability.mjs: a missing Linear workflow state is HELD with a consumable verdict", missingState.status === 1 && /HELD linear-issue: Linear issue lookup returned no issue with a workflow state/.test(missingState.stdout), missingState.stderr || missingState.stdout)
  const strikes = runCase("strikes", pullRequest(), { issue: { state: { name: "In Review" }, labels: [{ name: "attempts:2" }] } })
  T("mergeability.mjs: attempts:2 is HELD", strikes.status === 1 && /HELD two-strikes: issue carries attempts:2/.test(strikes.stdout), strikes.stderr || strikes.stdout)
  const finalStrikes = runCase("final-strikes", pullRequest(), { finalIssue: { state: { name: "In Review" }, labels: [{ name: "attempts:2" }] } })
  T("mergeability.mjs: attempts:2 added before the final handoff is HELD", finalStrikes.status === 1 && /HELD linear-stability: issue ORB-143 is In Review with attempts:2 on final read/.test(finalStrikes.stdout), finalStrikes.stderr || finalStrikes.stdout)
  const missingLabels = runCase("missing-labels", pullRequest(), { issue: { state: { name: "In Review" } } })
  T("mergeability.mjs: missing Linear labels are HELD rather than treated as empty", missingLabels.status === 1 && /HELD two-strikes: Linear issue labels are unavailable/.test(missingLabels.stdout), missingLabels.stderr || missingLabels.stdout)
  const missingLabelsJson = runCase("missing-labels-json", pullRequest(), { issue: { state: { name: "In Review" } }, json: true })
  T("mergeability.mjs: missing Linear labels emit a machine-readable HELD verdict", missingLabelsJson.status === 1 && JSON.parse(missingLabelsJson.stdout).conditions.some((condition) => condition.name === "two-strikes" && !condition.ok && condition.detail === "Linear issue labels are unavailable"), missingLabelsJson.stderr || missingLabelsJson.stdout)
  const cancelled = runCase("cancelled-check", pullRequest({ commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS", contexts: { pageInfo: { hasNextPage: false }, nodes: [checkRun("CI", "CANCELLED")] } } } }] } }))
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

export { mergeabilityCases as cases }
