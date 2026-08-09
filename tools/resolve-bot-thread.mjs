#!/usr/bin/env node
/**
 * Reply to ONE Codex review thread and then resolve it. Never the other way round, and never the
 * resolve alone.
 *
 * A resolved thread with no reply is worse than an open one: it reads as handled and records no
 * reason, so a later reader cannot tell a fix from a shrug. Measured 2026-08-05, PR #681 is merged
 * with a P2 thread still open and `isOutdated=true`, which means the code moved underneath it and
 * the record will never say whether it was addressed.
 *
 * So the ordering is a gate, not a convention: the reply is posted first, and the resolve is
 * attempted ONLY after the reply is confirmed. A failed or empty reply exits non-zero having
 * mutated nothing, which makes a bare resolve impossible rather than discouraged.
 *
 * The reply body arrives on stdin, per tools/CONVENTIONS.md. Callers send one of three shapes:
 *   fixed in <sha>            the finding was addressed in this pull request
 *   not applicable because X  the finding does not hold, with the reason
 *   filed as ORB-N            the finding is real and deferred to its own ticket
 */

import { readFileSync } from "node:fs"

import { runBounded } from "./lib/bounded-process.mjs"
import { githubEnvironment, redactSecrets, repositorySlug } from "./lib/github-auth.mjs"
import { misdirectedWriteNote, nodeTargetVerdict } from "./lib/github-target.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: resolve-bot-thread.mjs --thread <PRRT_...> --repo <ui|api|landing> --pr <number> [--dry-run]
       resolve-bot-thread.mjs --thread <PRRT_...> --repo <ui|api|landing> --pr <number> --resolve-only

  --thread <id>    the review thread node id, opaque (required). It MUST be copied from output
                   produced in this run, never typed and never reconstructed
  --repo <key>      repository whose owner selects the process-local GitHub token, AND whose
                   origin slug the thread is ASSERTED to belong to before any write (required)
  --pr <number>     pull request the thread is ASSERTED to belong to before any write (required)
  --command-timeout-seconds <s>  hard bound for each GitHub child (default: 45)
  --resolve-only   retry ONLY the resolve, for a run whose reply already landed. Reads no stdin,
                   and first VERIFIES a reply exists on the thread, so the no-bare-resolve rule
                   still holds by construction rather than by trusting the caller
  --dry-run        print the resolved plan as JSON and exit 0, mutating nothing
  --help, -h       print this usage and exit 0

The reply body is read from STDIN and must not be empty. Send one of:
  fixed in <sha>  ·  not applicable because <reason>  ·  filed as ORB-N

Resolves the node FIRST and refuses unless its repository.nameWithOwner equals the slug --repo
resolves to and its pullRequest.number equals --pr. A node id is globally unique, so a wrong id is
a live target on another pull request or in somebody else's repository, not a failed lookup. A
node that does not resolve at all is also refused.

Then posts addPullRequestReviewThreadReply, then resolveReviewThread ONLY if the reply succeeded. A
resolve is never attempted on its own: a thread closed without a reason is indistinguishable from
one nobody read.

Prints ONE JSON object on stdout: threadId, targetRepository, targetPullRequest, replied, resolved,
isResolved. Errors go to stderr.

exit codes: 0 replied and resolved, 1 a mutation failed (the JSON says which),
            2 usage error, an unresolvable node, or a thread that belongs to another repository`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}

const VALUE_FLAGS = new Set(["--thread", "--repo", "--pr", "--command-timeout-seconds"])
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, "--dry-run", "--resolve-only", "--help", "-h"])
const unknown = process.argv.slice(2).filter((value, index, argv) => value.startsWith("-") && !KNOWN_FLAGS.has(value) && !VALUE_FLAGS.has(argv[index - 1]))
if (unknown.length) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const threadId = argOf("--thread")
const repoKey = argOf("--repo")
const prNumber = Number(argOf("--pr"))
const dryRun = process.argv.includes("--dry-run")
const resolveOnly = process.argv.includes("--resolve-only")
const commandTimeoutSeconds = Number(argOf("--command-timeout-seconds") ?? "45")

/**
 * Opaque, but not unvalidated. GitHub's review-thread node ids carry the PRRT_ prefix, and refusing
 * anything else here turns a caller that passed a pull request number into an exit 2 before a
 * mutation rather than a confusing API error after one.
 *
 * The shape is ALL this proves, and that is the trap. On 2026-08-08 a correctly shaped, invented id
 * passed this check and resolved to a live thread on a stranger's repository, because a node id is
 * globally unique and --repo selected only the token. The target assertion below, not this regex,
 * is what makes the write safe.
 */
if (!threadId || !/^PRRT_[A-Za-z0-9_-]+$/.test(threadId)) {
  fail(2, `${USAGE}\n\n--thread must be a review thread node id such as PRRT_kwDOABCD1234`)
}
if (!repoKey || repoKey.startsWith("-")) fail(2, `${USAGE}\n\n--repo must name a configured repository`)
if (!Number.isInteger(prNumber) || prNumber <= 0) fail(2, `${USAGE}\n\n--pr must be a positive pull request number`)
if (!Number.isFinite(commandTimeoutSeconds) || commandTimeoutSeconds <= 0) fail(2, `${USAGE}\n\n--command-timeout-seconds requires a positive number`)

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}
const githubCwd = config.repos?.[repoKey]
if (typeof githubCwd !== "string" || githubCwd.trim().length === 0) {
  fail(2, `--repo must name a configured repository (known: ${Object.keys(config.repos ?? {}).join(", ") || "none"})`)
}

let reply = ""
if (!resolveOnly) {
  let body = ""
  try {
    body = readFileSync(0, "utf8")
  } catch {
    body = ""
  }
  if (body.trim().length === 0) {
    fail(2, `${USAGE}\n\nthe reply body on stdin is empty; a thread is never resolved without a stated reason`)
  }
  reply = body.trim()
}

const GH = process.env.GH_BIN || "gh"

/**
 * `mergePullRequest` is blocked outright by .claude/hooks/_lib/rules-orchestrator.mjs wherever it
 * appears in a command string, so neither document below may ever carry that token. Both mutations
 * were verified against the live schema on 2026-08-05: resolveReviewThread takes {threadId}, and
 * addPullRequestReviewThreadReply requires {pullRequestReviewThreadId, body} with
 * pullRequestReviewId optional (it names a PENDING review, which this is not).
 */
const REPLY_MUTATION = `mutation($thread:ID!,$body:String!){
  addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$thread, body:$body}){
    comment{ id url }
  }
}`

const RESOLVE_MUTATION = `mutation($thread:ID!){
  resolveReviewThread(input:{threadId:$thread}){
    thread{ id isResolved }
  }
}`

const graphql = async (query, fields) => {
  const args = ["api", "graphql", ...fields.flatMap(([flag, value]) => [flag, value]), "-f", `query=${query}`]
  const result = await runBounded(GH, args, { cwd: githubCwd, env: githubAuth.environment, timeoutMs: commandTimeoutSeconds * 1000, maxBuffer: 8 * 1024 * 1024 })
  if (result.timedOut) return { ok: false, detail: `GitHub command timed out after ${commandTimeoutSeconds}s; the complete child process tree was terminated` }
  if (result.overflowed) return { ok: false, detail: "GitHub command exceeded the 8 MiB output bound; the complete child process tree was terminated" }
  if (result.error || result.status !== 0) return { ok: false, detail: redactSecrets((result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim().slice(0, 400), githubAuth.secrets) }
  const stdout = result.stdout
  let payload
  try {
    payload = JSON.parse(stdout)
  } catch {
    return { ok: false, detail: `unparseable JSON: ${stdout.trim().slice(0, 240) || "empty output"}` }
  }
  if (payload.errors?.length) return { ok: false, detail: payload.errors.map((entry) => entry.message).join("; ") }
  return { ok: true, data: payload.data }
}

if (dryRun) {
  console.log(JSON.stringify({ threadId, repositoryKey: repoKey, resolveOnly, replyBytes: reply.length, replyPreview: reply.slice(0, 120), replied: false, resolved: false, dryRun: true }, null, 2))
  process.exit(0)
}

let githubAuth
try {
  githubAuth = await githubEnvironment(githubCwd, { timeoutMs: commandTimeoutSeconds * 1000 })
} catch (error) {
  fail(2, redactSecrets(error.message))
}

/**
 * THE target assertion. It runs on BOTH paths, before the reply and before a bare resolve, because
 * both are writes and both are chosen by the node id alone.
 *
 * `repository { nameWithOwner }` and `pullRequest { number }` say where the node itself lives. They
 * are compared against what `--repo` resolves to through the checkout's own `origin` and the pull
 * request the caller named. Everything else in this document was already read here for
 * --resolve-only, so no write path can skip either check by taking a different query.
 *
 * --resolve-only also exists because a failed resolve after a landed reply told the caller to
 * "retry the resolve alone" and gave them no way to do it. It does NOT weaken the no-bare-resolve
 * rule: it asks GitHub whether a reply is actually on the thread and refuses when there is none.
 */
const THREAD_QUERY = `query($thread:ID!){
  node(id:$thread){ ... on PullRequestReviewThread {
    isResolved
    comments(first:100){ totalCount }
    repository{ nameWithOwner }
    pullRequest{ number }
  }}
}`

let expectedSlug
try {
  expectedSlug = repositorySlug(githubCwd)
} catch (error) {
  fail(2, `--repo ${repoKey} could not be resolved to a GitHub repository: ${redactSecrets(error.message)}`)
}

const existing = await graphql(THREAD_QUERY, [["-f", `thread=${threadId}`]])
if (!existing.ok) fail(2, `could not read thread ${threadId} to prove which repository it belongs to: ${existing.detail}`)
const thread = existing.data?.node
const target = nodeTargetVerdict({ nodeId: threadId, expectedSlug, resolvedSlug: thread?.repository?.nameWithOwner ?? null })
if (!target.ok) fail(2, target.message)
const targetPullRequest = thread?.pullRequest?.number
if (!Number.isInteger(targetPullRequest)) fail(2, `${threadId} returned no pullRequest.number, so pull request ${prNumber} is not proven. Nothing was written`)
if (targetPullRequest !== prNumber) fail(2, `${threadId} belongs to pull request ${targetPullRequest}, not pull request ${prNumber}. Nothing was written`)

if (resolveOnly) {
  if (thread.isResolved) {
    console.log(JSON.stringify({ threadId, resolveOnly: true, replied: true, resolved: true, isResolved: true, note: "already resolved; nothing to do" }, null, 2))
    process.exit(0)
  }
  /** The bot's own comment is the first, so a reply is anything beyond it. */
  if ((thread.comments?.totalCount ?? 0) < 2) {
    fail(2, `${threadId} carries no reply, so --resolve-only would close it with no stated reason. Send a reply body on stdin instead`)
  }
  const retried = await graphql(RESOLVE_MUTATION, [["-f", `thread=${threadId}`]])
  if (!retried.ok) {
    console.log(JSON.stringify({ threadId, targetRepository: target.slug, targetPullRequest, resolveOnly: true, replied: true, resolved: false, error: retried.detail, note: misdirectedWriteNote(retried.detail, target.slug) }, null, 2))
    process.exit(1)
  }
  console.log(JSON.stringify({ threadId, targetRepository: target.slug, targetPullRequest, resolveOnly: true, replied: true, resolved: true, isResolved: Boolean(retried.data?.resolveReviewThread?.thread?.isResolved) }, null, 2))
  process.exit(0)
}

const replied = await graphql(REPLY_MUTATION, [
  ["-f", `thread=${threadId}`],
  ["-f", `body=${reply}`],
])

if (!replied.ok) {
  const misdirected = misdirectedWriteNote(replied.detail, target.slug)
  console.log(
    JSON.stringify(
      {
        threadId,
        targetRepository: target.slug,
        targetPullRequest,
        replied: false,
        resolved: false,
        error: replied.detail,
        note: `the resolve was NOT attempted; a thread is never closed without its reason${misdirected ? `\n${misdirected}` : ""}`,
      },
      null,
      2,
    ),
  )
  process.exit(1)
}

const resolved = await graphql(RESOLVE_MUTATION, [["-f", `thread=${threadId}`]])

if (!resolved.ok) {
  /**
   * The reply LANDED. Saying so is what stops a retry from double-posting it: a caller that reads
   * only "failed" would repost the same reply and leave the thread with two identical comments.
   */
  const misdirected = misdirectedWriteNote(resolved.detail, target.slug)
  console.log(
    JSON.stringify(
      {
        threadId,
        targetRepository: target.slug,
        targetPullRequest,
        replied: true,
        resolved: false,
        error: resolved.detail,
        note: `the reply landed; retry with --resolve-only, do not repost the reply${misdirected ? `\n${misdirected}` : ""}`,
        retry: `node tools/resolve-bot-thread.mjs --thread ${threadId} --repo ${repoKey} --pr ${prNumber} --resolve-only`,
      },
      null,
      2,
    ),
  )
  process.exit(1)
}

console.log(
  JSON.stringify(
    {
      threadId,
      targetRepository: target.slug,
      targetPullRequest,
      replied: true,
      resolved: true,
      isResolved: Boolean(resolved.data?.resolveReviewThread?.thread?.isResolved),
      commentUrl: replied.data?.addPullRequestReviewThreadReply?.comment?.url ?? null,
    },
    null,
    2,
  ),
)
process.exit(0)
