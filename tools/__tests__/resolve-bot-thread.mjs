import { readFileSync } from "node:fs"

import { processIsRunning, T, check, orcaEnv, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig } from "./_harness.mjs"

const TOOL = "resolve-bot-thread.mjs"
const THREAD = "PRRT_kwDOR5Siws6Wfy_V"
let testedToolPath = null

const OURS = "thomasluizon/orbit-ui-mobile"
const THEIRS = "benhook1013/FireMUD"

const REPLY_OK = JSON.stringify({ data: { addPullRequestReviewThreadReply: { comment: { id: "IC_1", url: "https://github.com/thomasluizon/orbit-ui-mobile/pull/681#discussion_r1" } } } })
const RESOLVE_OK = JSON.stringify({ data: { resolveReviewThread: { thread: { id: THREAD, isResolved: true } } } })

/** The pre-write target read, which now runs on BOTH paths before anything is mutated. */
const threadNode = ({ nameWithOwner = OURS, isResolved = false, totalCount = 2, pullRequest = 681 } = {}) =>
  JSON.stringify({ data: { node: { isResolved, comments: { totalCount }, repository: nameWithOwner === null ? null : { nameWithOwner }, pullRequest: { number: pullRequest } } } })

const UNRESOLVABLE_NODE = JSON.stringify({ data: { node: null } })

/**
 * The three documents are told apart by a token unique to each, because the shim keys on the whole
 * command line and all three are `gh api graphql`. Order matters here: the target read's document
 * contains `PullRequestReviewThread`, and so would any entry keyed on that substring, so the read
 * entry is matched by `repository{ nameWithOwner }`, which appears in no mutation.
 */
const plan = ({ reply = REPLY_OK, replyExit = 0, resolve = RESOLVE_OK, resolveExit = 0, target = threadNode(), targetExit = 0 } = {}) =>
  orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "addPullRequestReviewThreadReply", stdout: reply, exit: replyExit },
    { match: "resolveReviewThread", stdout: resolve, exit: resolveExit },
    { match: "nameWithOwner", stdout: target, exit: targetExit },
  ])

const parsed = (result) => {
  try {
    return JSON.parse(result.stdout)
  } catch {
    return null
  }
}

const post = (body, options = {}, argv = []) => run(TOOL, ["--thread", THREAD, "--repo", "ui", ...argv], { path: testedToolPath, env: plan(options), input: body })

export const cases = () => {
  check(TOOL, "refuses a missing thread id", [], { status: 2, stderr: /--thread must be a review thread node id/, input: "fixed in abc123" })
  check(TOOL, "refuses a pull request number in place of a thread id", ["--thread", "681"], { status: 2, stderr: /--thread must be a review thread node id/ }, { input: "fixed in abc123" })
  check(TOOL, "refuses a malformed thread id before any mutation", ["--thread", "IC_notathread"], { status: 2, stderr: /--thread must be a review thread node id/ }, { input: "fixed in abc123" })
  check(TOOL, "refuses a missing repository before any mutation", ["--thread", THREAD], { status: 2, stderr: /--repo must name a configured repository/ }, { input: "fixed in abc123" })
  check(TOOL, "refuses a zero command timeout", ["--thread", THREAD, "--repo", "ui", "--command-timeout-seconds", "0"], { status: 2, stderr: /--command-timeout-seconds requires a positive number/ }, { input: "fixed in abc123" })

  const githubContext = stageRepo("resolve-bot-thread-github-context")
  if (!githubContext || githubContext.git(["remote", "set-url", "origin", "https://github.com/thomasluizon/orbit-ui-mobile.git"]).status !== 0) {
    T(`${TOOL}: a repository-qualified GitHub context fixture is available`, false, "could not stage GitHub context")
    return
  }
  const hermeticConfig = realOrchestratorConfig()
  hermeticConfig.repos = { ...hermeticConfig.repos, ui: githubContext.path }
  testedToolPath = stageWithConfig("resolve-bot-thread-hermetic", TOOL, hermeticConfig).path

  /**
   * THE gate. A resolve with no reason is worse than an open thread, so an empty body is refused
   * before anything is posted rather than being allowed to close a finding silently.
   */
  const empty = run(TOOL, ["--thread", THREAD, "--repo", "ui"], { path: testedToolPath, env: plan(), input: "" })
  T(`${TOOL}: an empty reply body is refused before any mutation`, empty.status === 2 && /reply body on stdin is empty/.test(empty.stderr), `exit ${empty.status}: ${empty.stderr || empty.stdout}`)

  const blank = run(TOOL, ["--thread", THREAD, "--repo", "ui"], { path: testedToolPath, env: plan(), input: "   \n\t  \n" })
  T(`${TOOL}: a whitespace-only reply body is refused too`, blank.status === 2 && /reply body on stdin is empty/.test(blank.stderr), `exit ${blank.status}: ${blank.stderr || blank.stdout}`)

  /**
   * THE incident, reproduced. On 2026-08-08 a typed `PRRT_` id resolved to a live CodeRabbit thread
   * on benhook1013/FireMUD pull request #2594 and a reply landed there under Thomas's account.
   * `--repo` chose only the token, so nothing compared the node's repository with the caller's.
   *
   * The reply and resolve stubs are BOTH present in this plan and both must go unused. That is what
   * proves nothing was written, rather than proving only that the exit code was non-zero.
   */
  const foreign = post("fixed in 4e6e4871", { target: threadNode({ nameWithOwner: THEIRS }) })
  T(
    `${TOOL}: a thread in ANOTHER repository is refused before the reply, naming both repositories`,
    foreign.status === 2 && foreign.stderr.includes(THEIRS) && foreign.stderr.includes(OURS) && foreign.stdout === "",
    `exit ${foreign.status}: ${foreign.stderr || foreign.stdout}`,
  )

  /** An id that resolves to nothing is the other half of the same defect, and it is what a typed id
   * usually looks like. It must refuse, never fall through to the write. */
  const unresolvable = post("fixed in 4e6e4871", { target: UNRESOLVABLE_NODE })
  T(
    `${TOOL}: a node that does not resolve at all is refused, and writes nothing`,
    unresolvable.status === 2 && /did not resolve/.test(unresolvable.stderr) && unresolvable.stdout === "",
    `exit ${unresolvable.status}: ${unresolvable.stderr || unresolvable.stdout}`,
  )

  /** --resolve-only writes too, so the same assertion must guard it. A gate on one path only is
   * the shape that reads as covered and is not. */
  const foreignResolveOnly = run(TOOL, ["--thread", THREAD, "--repo", "ui", "--resolve-only"], { path: testedToolPath, env: orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "nameWithOwner", stdout: threadNode({ nameWithOwner: THEIRS }) },
    { match: "resolveReviewThread", stdout: RESOLVE_OK },
  ]) })
  T(
    `${TOOL}: --resolve-only refuses a thread in another repository too`,
    foreignResolveOnly.status === 2 && foreignResolveOnly.stderr.includes(THEIRS),
    `exit ${foreignResolveOnly.status}: ${foreignResolveOnly.stderr || foreignResolveOnly.stdout}`,
  )

  const happy = post("fixed in 4e6e4871")
  const happyPlan = parsed(happy)
  T(
    `${TOOL}: a reply followed by a resolve exits 0 and reports both landed`,
    happy.status === 0 && happyPlan?.replied === true && happyPlan.resolved === true && happyPlan.isResolved === true,
    happy.stdout || happy.stderr,
  )
  T(`${TOOL}: the reply comment url is returned so the record is followable`, /#discussion_r1$/.test(happyPlan?.commentUrl ?? ""), happy.stdout)
  T(
    `${TOOL}: the resolved target is reported, so a reader can see WHERE the write landed`,
    happyPlan?.targetRepository === OURS && happyPlan?.targetPullRequest === 681,
    happy.stdout,
  )

  /**
   * The wrong DIAGNOSIS cost as much as the wrong id. GitHub answers a write it will not accept
   * with a permissions error, and that exact message was filed as a transient glitch on 2026-08-08.
   */
  const denied = post("fixed in 4e6e4871", { reply: JSON.stringify({ errors: [{ message: "thomasluizon does not have the correct permissions to execute AddPullRequestReviewThreadReply" }] }) })
  const deniedPlan = parsed(denied)
  T(
    `${TOOL}: a permissions error names the resolved target and says it usually means another owner`,
    denied.status === 1 && /another owner/.test(deniedPlan?.note ?? "") && (deniedPlan?.note ?? "").includes(OURS),
    denied.stdout || denied.stderr,
  )

  /**
   * THE machine check that a bare resolve is impossible. If the reply fails the resolve must never
   * be attempted: the stub for resolveReviewThread is present and must go unused, and the tool
   * exits non-zero having closed nothing.
   */
  const replyFailed = post("fixed in 4e6e4871", { reply: JSON.stringify({ errors: [{ message: "Resource not accessible" }] }) })
  const replyFailedPlan = parsed(replyFailed)
  T(
    `${TOOL}: a failed reply exits non-zero and never resolves the thread`,
    replyFailed.status === 1 && replyFailedPlan?.replied === false && replyFailedPlan.resolved === false && /Resource not accessible/.test(replyFailedPlan.error ?? ""),
    replyFailed.stdout || replyFailed.stderr,
  )

  const replyCrashed = post("fixed in 4e6e4871", { reply: "", replyExit: 1 })
  const replyCrashedPlan = parsed(replyCrashed)
  T(`${TOOL}: a gh failure on the reply also leaves the thread open`, replyCrashed.status === 1 && replyCrashedPlan?.replied === false && replyCrashedPlan.resolved === false, replyCrashed.stdout || replyCrashed.stderr)

  /**
   * The reply landed and the resolve did not. Saying so is what stops a retry from double-posting:
   * a caller reading only "failed" would repost the reply and leave two identical comments.
   */
  const resolveFailed = post("filed as ORB-181", { resolve: JSON.stringify({ errors: [{ message: "thread already resolved" }] }) })
  const resolveFailedPlan = parsed(resolveFailed)
  T(
    `${TOOL}: a failed resolve still reports that the reply landed, so a retry cannot double-post`,
    resolveFailed.status === 1 && resolveFailedPlan?.replied === true && resolveFailedPlan.resolved === false && /do not repost the reply/.test(resolveFailedPlan.note ?? "") && /--repo ui --resolve-only$/.test(resolveFailedPlan.retry ?? ""),
    resolveFailed.stdout || resolveFailed.stderr,
  )

  /**
   * Raised by the Codex reviewer on this pull request (#682, P2): the failed-resolve branch told the
   * caller to "retry the resolve alone" and the tool had no way to do it. --resolve-only closes that
   * gap WITHOUT weakening the rule, by asking GitHub whether a reply is really on the thread.
   */
  const threadWithReply = threadNode({ totalCount: 2 })
  const threadNoReply = threadNode({ totalCount: 1 })
  const threadDone = threadNode({ isResolved: true, totalCount: 2 })
  const retryPlan = (threadStdout, resolve = RESOLVE_OK, resolveExit = 0) =>
    orcaEnv([
      { match: "auth token --user thomasluizon", stdout: "test-github-token" },
      { match: "nameWithOwner", stdout: threadStdout },
      { match: "resolveReviewThread", stdout: resolve, exit: resolveExit },
    ])

  const retried = run(TOOL, ["--thread", THREAD, "--repo", "ui", "--resolve-only"], { path: testedToolPath, env: retryPlan(threadWithReply) })
  T(`${TOOL}: --resolve-only resolves a thread that already carries a reply`, retried.status === 0 && parsed(retried)?.resolved === true && parsed(retried)?.resolveOnly === true, retried.stdout || retried.stderr)

  const bare = run(TOOL, ["--thread", THREAD, "--repo", "ui", "--resolve-only"], { path: testedToolPath, env: retryPlan(threadNoReply) })
  T(
    `${TOOL}: --resolve-only REFUSES a thread with no reply, so it cannot become a bare resolve`,
    bare.status === 2 && /carries no reply/.test(bare.stderr),
    `exit ${bare.status}: ${bare.stderr || bare.stdout}`,
  )

  const already = run(TOOL, ["--thread", THREAD, "--repo", "ui", "--resolve-only"], { path: testedToolPath, env: retryPlan(threadDone) })
  T(`${TOOL}: --resolve-only on an already-resolved thread is a no-op exit 0`, already.status === 0 && /already resolved/.test(already.stdout), already.stdout || already.stderr)

  const retryFailed = run(TOOL, ["--thread", THREAD, "--repo", "ui", "--resolve-only"], { path: testedToolPath, env: retryPlan(threadWithReply, JSON.stringify({ errors: [{ message: "still failing" }] })) })
  T(`${TOOL}: a failing --resolve-only retry exits non-zero naming the error`, retryFailed.status === 1 && /still failing/.test(parsed(retryFailed)?.error ?? ""), retryFailed.stdout || retryFailed.stderr)

  const descendantPidFile = stage("resolve-bot-thread/descendant.pid", "")
  const hanging = run(TOOL, ["--thread", THREAD, "--repo", "ui", "--resolve-only", "--command-timeout-seconds", "1"], { path: testedToolPath, env: orcaEnv([
    { match: "auth token --user thomasluizon", stdout: "test-github-token" },
    { match: "nameWithOwner", stdout: "", hangTreePidFile: descendantPidFile },
  ]) })
  const descendantPid = Number(readFileSync(descendantPidFile, "utf8"))
  T(`${TOOL}: a hanging thread GraphQL read is bounded`, hanging.status === 2 && /timed out after 1s/.test(hanging.stderr), hanging.stderr || hanging.stdout)
  T(`${TOOL}: thread timeout removes the complete child process tree`, Number.isInteger(descendantPid) && !processIsRunning(descendantPid), `descendant ${descendantPid} still alive`)

  /** --dry-run is the seam that keeps this module hermetic: it must mutate nothing at all. */
  const dry = run(TOOL, ["--thread", THREAD, "--repo", "ui", "--dry-run"], { path: testedToolPath, env: orcaEnv([]), input: "not applicable because the code moved" })
  const dryPlan = parsed(dry)
  T(
    `${TOOL}: --dry-run exits 0 having called neither mutation`,
    dry.status === 0 && dryPlan?.dryRun === true && dryPlan.replied === false && dryPlan.resolved === false,
    dry.stdout || dry.stderr,
  )
  T(`${TOOL}: --dry-run echoes the reply it would have posted`, /not applicable because the code moved/.test(dryPlan?.replyPreview ?? ""), dry.stdout)
}
