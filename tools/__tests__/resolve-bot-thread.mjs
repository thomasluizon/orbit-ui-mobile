import { T, check, orcaEnv, run } from "./_harness.mjs"

const TOOL = "resolve-bot-thread.mjs"
const THREAD = "PRRT_kwDOR5Siws6Wfy_V"

const REPLY_OK = JSON.stringify({ data: { addPullRequestReviewThreadReply: { comment: { id: "IC_1", url: "https://github.com/thomasluizon/orbit-ui-mobile/pull/681#discussion_r1" } } } })
const RESOLVE_OK = JSON.stringify({ data: { resolveReviewThread: { thread: { id: THREAD, isResolved: true } } } })

/**
 * The two mutations are told apart by a token unique to each document, because the shim keys on the
 * whole command line and both are `gh api graphql`. Ordering the reply entry first is not what makes
 * this work: `addPullRequestReviewThreadReply` appears only in the reply document.
 */
const plan = ({ reply = REPLY_OK, replyExit = 0, resolve = RESOLVE_OK, resolveExit = 0 } = {}) =>
  orcaEnv([
    { match: "addPullRequestReviewThreadReply", stdout: reply, exit: replyExit },
    { match: "resolveReviewThread", stdout: resolve, exit: resolveExit },
  ])

const parsed = (result) => {
  try {
    return JSON.parse(result.stdout)
  } catch {
    return null
  }
}

const post = (body, options = {}, argv = []) => run(TOOL, ["--thread", THREAD, ...argv], { env: plan(options), input: body })

export const cases = () => {
  check(TOOL, "refuses a missing thread id", [], { status: 2, stderr: /--thread must be a review thread node id/, input: "fixed in abc123" })
  check(TOOL, "refuses a pull request number in place of a thread id", ["--thread", "681"], { status: 2, stderr: /--thread must be a review thread node id/ }, { input: "fixed in abc123" })
  check(TOOL, "refuses a malformed thread id before any mutation", ["--thread", "IC_notathread"], { status: 2, stderr: /--thread must be a review thread node id/ }, { input: "fixed in abc123" })

  /**
   * THE gate. A resolve with no reason is worse than an open thread, so an empty body is refused
   * before anything is posted rather than being allowed to close a finding silently.
   */
  const empty = run(TOOL, ["--thread", THREAD], { env: plan(), input: "" })
  T(`${TOOL}: an empty reply body is refused before any mutation`, empty.status === 2 && /reply body on stdin is empty/.test(empty.stderr), `exit ${empty.status}: ${empty.stderr || empty.stdout}`)

  const blank = run(TOOL, ["--thread", THREAD], { env: plan(), input: "   \n\t  \n" })
  T(`${TOOL}: a whitespace-only reply body is refused too`, blank.status === 2 && /reply body on stdin is empty/.test(blank.stderr), `exit ${blank.status}: ${blank.stderr || blank.stdout}`)

  const happy = post("fixed in 4e6e4871")
  const happyPlan = parsed(happy)
  T(
    `${TOOL}: a reply followed by a resolve exits 0 and reports both landed`,
    happy.status === 0 && happyPlan?.replied === true && happyPlan.resolved === true && happyPlan.isResolved === true,
    happy.stdout || happy.stderr,
  )
  T(`${TOOL}: the reply comment url is returned so the record is followable`, /#discussion_r1$/.test(happyPlan?.commentUrl ?? ""), happy.stdout)

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
    resolveFailed.status === 1 && resolveFailedPlan?.replied === true && resolveFailedPlan.resolved === false && /do not repost the reply/.test(resolveFailedPlan.note ?? ""),
    resolveFailed.stdout || resolveFailed.stderr,
  )

  /**
   * Raised by the Codex reviewer on this pull request (#682, P2): the failed-resolve branch told the
   * caller to "retry the resolve alone" and the tool had no way to do it. --resolve-only closes that
   * gap WITHOUT weakening the rule, by asking GitHub whether a reply is really on the thread.
   */
  const threadWithReply = JSON.stringify({ data: { node: { isResolved: false, comments: { totalCount: 2 } } } })
  const threadNoReply = JSON.stringify({ data: { node: { isResolved: false, comments: { totalCount: 1 } } } })
  const threadDone = JSON.stringify({ data: { node: { isResolved: true, comments: { totalCount: 2 } } } })
  const retryPlan = (threadStdout, resolve = RESOLVE_OK, resolveExit = 0) =>
    orcaEnv([
      { match: "PullRequestReviewThread", stdout: threadStdout },
      { match: "resolveReviewThread", stdout: resolve, exit: resolveExit },
    ])

  const retried = run(TOOL, ["--thread", THREAD, "--resolve-only"], { env: retryPlan(threadWithReply) })
  T(`${TOOL}: --resolve-only resolves a thread that already carries a reply`, retried.status === 0 && parsed(retried)?.resolved === true && parsed(retried)?.resolveOnly === true, retried.stdout || retried.stderr)

  const bare = run(TOOL, ["--thread", THREAD, "--resolve-only"], { env: retryPlan(threadNoReply) })
  T(
    `${TOOL}: --resolve-only REFUSES a thread with no reply, so it cannot become a bare resolve`,
    bare.status === 2 && /carries no reply/.test(bare.stderr),
    `exit ${bare.status}: ${bare.stderr || bare.stdout}`,
  )

  const already = run(TOOL, ["--thread", THREAD, "--resolve-only"], { env: retryPlan(threadDone) })
  T(`${TOOL}: --resolve-only on an already-resolved thread is a no-op exit 0`, already.status === 0 && /already resolved/.test(already.stdout), already.stdout || already.stderr)

  const retryFailed = run(TOOL, ["--thread", THREAD, "--resolve-only"], { env: retryPlan(threadWithReply, JSON.stringify({ errors: [{ message: "still failing" }] })) })
  T(`${TOOL}: a failing --resolve-only retry exits non-zero naming the error`, retryFailed.status === 1 && /still failing/.test(parsed(retryFailed)?.error ?? ""), retryFailed.stdout || retryFailed.stderr)

  /** --dry-run is the seam that keeps this module hermetic: it must mutate nothing at all. */
  const dry = run(TOOL, ["--thread", THREAD, "--dry-run"], { env: orcaEnv([]), input: "not applicable because the code moved" })
  const dryPlan = parsed(dry)
  T(
    `${TOOL}: --dry-run exits 0 having called neither mutation`,
    dry.status === 0 && dryPlan?.dryRun === true && dryPlan.replied === false && dryPlan.resolved === false,
    dry.stdout || dry.stderr,
  )
  T(`${TOOL}: --dry-run echoes the reply it would have posted`, /not applicable because the code moved/.test(dryPlan?.replyPreview ?? ""), dry.stdout)
}
