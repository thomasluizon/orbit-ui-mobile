#!/usr/bin/env node
/** Decide section 4a mergeability from one fail-closed, read-only snapshot. */

import { execFileSync } from "node:child_process"

import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: mergeability.mjs --repo <owner/name> --pr <number> [--json]

  --repo <owner/name>  GitHub repository containing the pull request (required)
  --pr <number>        pull request number to decide (required)
  --json               print the machine-readable verdict
  --help, -h           print this usage and exit 0

Reads GitHub and Linear only. Prints MERGEABLE or HELD and one line per condition.
exit codes: 0 MERGEABLE, 1 HELD, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (message) => {
  console.error(message)
  process.exit(2)
}
const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}
const knownFlags = new Set(["--repo", "--pr", "--json", "--help", "-h"])
const unknown = process.argv.slice(2).filter((value) => value.startsWith("-") && !knownFlags.has(value))
if (unknown.length) fail(`${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const repo = argOf("--repo")
const pr = argOf("--pr")
const asJson = process.argv.includes("--json")
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) fail(`${USAGE}\n\n--repo must be an owner/name slug`)
if (!pr || !/^\d+$/.test(pr)) fail(`${USAGE}\n\n--pr must be a positive pull request number`)

const GH = process.env.GH_BIN || "gh"
const ORCA = process.env.ORCA_BIN || "orca"
const [owner, name] = repo.split("/")
let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(error.message)
}
const reviewState = config.linear?.states?.review
if (typeof reviewState !== "string" || !reviewState) fail(".claude/orchestrator.json must declare linear.states.review")

const QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number url title body headRefName isDraft mergeStateStatus headRefOid labels(first:100){pageInfo{hasNextPage}nodes{name}} reviews(first:100){pageInfo{hasNextPage}nodes{state author{login} commit{oid}}} comments(first:100){pageInfo{hasNextPage}nodes{author{login} body}} reviewThreads(first:100){pageInfo{hasNextPage}nodes{isResolved}} commits(last:1){nodes{commit{statusCheckRollup{state contexts(first:100){pageInfo{hasNextPage}nodes{__typename ... on CheckRun{name status conclusion} ... on StatusContext{context state}}}}}}}}}}`

const command = (file, args) => {
  try {
    return { ok: true, raw: execFileSync(file, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }) }
  } catch (error) {
    return { ok: false, error: (error.stderr?.toString() || error.stdout?.toString() || error.message).trim() }
  }
}
const parse = (raw, source) => {
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch {
    return { ok: false, error: `${source} returned unparseable output: ${raw.trim().slice(0, 240) || "empty output"}` }
  }
}
const githubPullRequest = () => {
  const result = command(GH, ["api", "graphql", "-f", `query=${QUERY}`, "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${pr}`])
  if (!result.ok) return { ok: false, error: `GitHub pull-request lookup failed: ${result.error}` }
  const parsed = parse(result.raw, "GitHub pull-request lookup")
  if (!parsed.ok) return parsed
  if (parsed.value.errors?.length) return { ok: false, error: `GitHub pull-request lookup failed: ${parsed.value.errors.map((entry) => entry.message).join("; ")}` }
  const pullRequest = parsed.value.data?.repository?.pullRequest
  return pullRequest ? { ok: true, value: pullRequest } : { ok: false, error: "GitHub pull-request lookup returned no pull request" }
}
const linearIssue = (identifier) => {
  const result = command(ORCA, ["linear", "issue", identifier, "--json"])
  if (!result.ok) return { ok: false, error: `Linear issue lookup failed: ${result.error}` }
  const parsed = parse(result.raw, "Linear issue lookup")
  if (!parsed.ok) return parsed
  if (parsed.value.ok === false) return { ok: false, error: `Linear issue lookup failed: ${parsed.value.error?.message ?? "unknown error"}` }
  const issue = parsed.value.result?.issue ?? parsed.value.issue ?? parsed.value.result
  return issue && typeof issue === "object" && Object.hasOwn(issue, "state")
    ? { ok: true, value: issue }
    : { ok: false, error: "Linear issue lookup returned no issue" }
}

const conditions = []
const add = (name, ok, detail) => conditions.push({ name, ok, detail })
const first = githubPullRequest()
if (!first.ok) {
  add("github-pull-request", false, first.error)
} else {
  const pullRequest = first.value
  const complete = (connection) => connection?.pageInfo?.hasNextPage === false
  const contexts = pullRequest.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts
  const checks = contexts?.nodes
  const failedConclusion = new Set(["FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "ACTION_REQUIRED"])
  const checkTerminal =
    complete(pullRequest.labels) && complete(pullRequest.reviews) && complete(pullRequest.comments) && complete(pullRequest.reviewThreads) && complete(contexts) &&
    Array.isArray(checks) && checks.length > 0 && checks.every((check) => check.__typename === "CheckRun" ? check.status === "COMPLETED" && !failedConclusion.has(check.conclusion) : !["FAILURE", "ERROR", "PENDING", "EXPECTED"].includes(check.state))
  add("draft", pullRequest.isDraft === false, pullRequest.isDraft ? "pull request is a draft" : "pull request is ready for review")
  add("check-rollup", checkTerminal, !Array.isArray(checks) ? "check rollup is unavailable" : `${checks.length} check(s), ${checkTerminal ? "all terminal with no failed conclusion" : "a check is pending, failed, or inventory is incomplete"}`)
  add("merge-state", pullRequest.mergeStateStatus === "CLEAN", `merge state is ${pullRequest.mergeStateStatus ?? "absent"}, requires CLEAN`)
  add("unresolved-review-threads", pullRequest.reviewThreads?.nodes?.every((thread) => thread.isResolved) === true && complete(pullRequest.reviewThreads), `${pullRequest.reviewThreads?.nodes?.filter((thread) => !thread.isResolved).length ?? "unknown"} unresolved thread(s)`)
  const firstApproval = pullRequest.reviews?.nodes?.some((review) => ["claude", "claude[bot]"].includes(review.author?.login) && review.state === "APPROVED" && review.commit?.oid === pullRequest.headRefOid)
  add("first-reviewer", Boolean(firstApproval) && complete(pullRequest.reviews), firstApproval ? `claude approved head ${pullRequest.headRefOid}` : `claude has no APPROVED review on head ${pullRequest.headRefOid ?? "absent"}`)
  const codexReviews = pullRequest.reviews?.nodes?.filter((review) => review.author?.login === "chatgpt-codex-connector" && ["APPROVED", "COMMENTED"].includes(review.state)) ?? []
  const codexComments = pullRequest.comments?.nodes?.filter((comment) => comment.author?.login === "chatgpt-codex-connector") ?? []
  const mentionedCommits = codexComments.flatMap((comment) => [...(comment.body ?? "").matchAll(/\b[0-9a-f]{7,40}\b/gi)].map((match) => match[0]))
  const secondOnHead = codexReviews.some((review) => review.commit?.oid === pullRequest.headRefOid) || mentionedCommits.some((commit) => pullRequest.headRefOid?.startsWith(commit))
  const observedSecond = [...codexReviews.map((review) => review.commit?.oid), ...mentionedCommits].filter(Boolean)
  add("second-reviewer", secondOnHead && complete(pullRequest.reviews) && complete(pullRequest.comments), secondOnHead ? `chatgpt-codex-connector reviewed head ${pullRequest.headRefOid}` : `chatgpt-codex-connector reviewed ${observedSecond.join(", ") || "no named commit"}; head is ${pullRequest.headRefOid ?? "absent"}`)
  const issueIdentifier = [pullRequest.headRefName, pullRequest.title, pullRequest.body].map((value) => (value ?? "").match(/\b[A-Z]+-\d+\b/)?.[0]).find(Boolean)
  if (!issueIdentifier) {
    add("linear-issue", false, "no Linear issue identifier appears in the branch, title, or body")
  } else {
    const issueResult = linearIssue(issueIdentifier)
    if (!issueResult.ok) {
      add("linear-issue", false, issueResult.error)
    } else {
      const issue = issueResult.value
      const state = issue.state?.name ?? issue.state
      const labels = (issue.labels ?? []).map((label) => typeof label === "string" ? label : label.name)
      add("linear-in-review", state === reviewState, `issue ${issueIdentifier} is ${state ?? "absent"}, requires ${reviewState}`)
      add("two-strikes", !labels.includes("attempts:2"), labels.includes("attempts:2") ? "issue carries attempts:2" : "issue has no attempts:2 label")
    }
  }
  const finalRead = githubPullRequest()
  add("head-stability", finalRead.ok && finalRead.value.headRefOid === pullRequest.headRefOid, finalRead.ok ? `head was ${pullRequest.headRefOid} and is ${finalRead.value.headRefOid}` : finalRead.error)
}

const mergeable = conditions.length > 0 && conditions.every((condition) => condition.ok)
const verdict = { verdict: mergeable ? "MERGEABLE" : "HELD", repo, pr: Number(pr), conditions }
if (asJson) {
  console.log(JSON.stringify(verdict, null, 2))
} else {
  console.log(verdict.verdict)
  for (const condition of conditions) console.log(`${condition.ok ? "OK" : "HELD"} ${condition.name}: ${condition.detail}`)
}
process.exit(mergeable ? 0 : 1)
