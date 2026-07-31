import { readFileSync } from "node:fs"

import { T, stage, orcaEnv, run } from "./_harness.mjs"

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

export { mergeabilityCases as cases }
