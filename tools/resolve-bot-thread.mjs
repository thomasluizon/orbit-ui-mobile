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

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

import { githubEnvironment, redactSecrets } from "./lib/github-auth.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: resolve-bot-thread.mjs --thread <PRRT_...> --repo <ui|api|landing> [--dry-run]
       resolve-bot-thread.mjs --thread <PRRT_...> --repo <ui|api|landing> --resolve-only

  --thread <id>    the review thread node id, opaque (required)
  --repo <key>      repository whose owner selects the process-local GitHub token (required)
  --resolve-only   retry ONLY the resolve, for a run whose reply already landed. Reads no stdin,
                   and first VERIFIES a reply exists on the thread, so the no-bare-resolve rule
                   still holds by construction rather than by trusting the caller
  --dry-run        print the resolved plan as JSON and exit 0, mutating nothing
  --help, -h       print this usage and exit 0

The reply body is read from STDIN and must not be empty. Send one of:
  fixed in <sha>  ·  not applicable because <reason>  ·  filed as ORB-N

Posts addPullRequestReviewThreadReply, then resolveReviewThread ONLY if the reply succeeded. A
resolve is never attempted on its own: a thread closed without a reason is indistinguishable from
one nobody read.

Prints ONE JSON object on stdout: threadId, replied, resolved, isResolved. Errors go to stderr.

exit codes: 0 replied and resolved, 1 a mutation failed (the JSON says which), 2 usage error`

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

const VALUE_FLAGS = new Set(["--thread", "--repo"])
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, "--dry-run", "--resolve-only", "--help", "-h"])
const unknown = process.argv.slice(2).filter((value, index, argv) => value.startsWith("-") && !KNOWN_FLAGS.has(value) && !VALUE_FLAGS.has(argv[index - 1]))
if (unknown.length) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const threadId = argOf("--thread")
const repoKey = argOf("--repo")
const dryRun = process.argv.includes("--dry-run")
const resolveOnly = process.argv.includes("--resolve-only")

/**
 * Opaque, but not unvalidated. GitHub's review-thread node ids carry the PRRT_ prefix, and refusing
 * anything else here turns a caller that passed a pull request number into an exit 2 before a
 * mutation rather than a confusing API error after one.
 */
if (!threadId || !/^PRRT_[A-Za-z0-9_-]+$/.test(threadId)) {
  fail(2, `${USAGE}\n\n--thread must be a review thread node id such as PRRT_kwDOABCD1234`)
}
if (!repoKey || repoKey.startsWith("-")) fail(2, `${USAGE}\n\n--repo must name a configured repository`)

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

const graphql = (query, fields) => {
  const args = ["api", "graphql", ...fields.flatMap(([flag, value]) => [flag, value]), "-f", `query=${query}`]
  let stdout = ""
  try {
    stdout = execFileSync(GH, args, { cwd: githubCwd, env: githubAuth.environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 })
  } catch (error) {
    return { ok: false, detail: redactSecrets((error.stderr?.toString() || error.stdout?.toString() || error.message).trim().slice(0, 400), githubAuth.secrets) }
  }
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
  githubAuth = await githubEnvironment(githubCwd)
} catch (error) {
  fail(2, redactSecrets(error.message))
}

/**
 * --resolve-only exists because a failed resolve after a landed reply told the caller to "retry the
 * resolve alone" and gave them no way to do it. It does NOT weaken the no-bare-resolve rule: it
 * asks GitHub whether a reply is actually on the thread and refuses when there is none, so the
 * invariant is enforced against the live thread rather than trusted from a flag.
 */
const THREAD_QUERY = `query($thread:ID!){
  node(id:$thread){ ... on PullRequestReviewThread {
    isResolved
    comments(first:100){ totalCount }
  }}
}`

if (resolveOnly) {
  const existing = graphql(THREAD_QUERY, [["-f", `thread=${threadId}`]])
  if (!existing.ok) fail(2, `could not read thread ${threadId} to confirm a reply exists: ${existing.detail}`)
  const thread = existing.data?.node
  if (!thread) fail(2, `no review thread ${threadId}`)
  if (thread.isResolved) {
    console.log(JSON.stringify({ threadId, resolveOnly: true, replied: true, resolved: true, isResolved: true, note: "already resolved; nothing to do" }, null, 2))
    process.exit(0)
  }
  /** The bot's own comment is the first, so a reply is anything beyond it. */
  if ((thread.comments?.totalCount ?? 0) < 2) {
    fail(2, `${threadId} carries no reply, so --resolve-only would close it with no stated reason. Send a reply body on stdin instead`)
  }
  const retried = graphql(RESOLVE_MUTATION, [["-f", `thread=${threadId}`]])
  if (!retried.ok) {
    console.log(JSON.stringify({ threadId, resolveOnly: true, replied: true, resolved: false, error: retried.detail }, null, 2))
    process.exit(1)
  }
  console.log(JSON.stringify({ threadId, resolveOnly: true, replied: true, resolved: true, isResolved: Boolean(retried.data?.resolveReviewThread?.thread?.isResolved) }, null, 2))
  process.exit(0)
}

const replied = graphql(REPLY_MUTATION, [
  ["-f", `thread=${threadId}`],
  ["-f", `body=${reply}`],
])

if (!replied.ok) {
  console.log(JSON.stringify({ threadId, replied: false, resolved: false, error: replied.detail, note: "the resolve was NOT attempted; a thread is never closed without its reason" }, null, 2))
  process.exit(1)
}

const resolved = graphql(RESOLVE_MUTATION, [["-f", `thread=${threadId}`]])

if (!resolved.ok) {
  /**
   * The reply LANDED. Saying so is what stops a retry from double-posting it: a caller that reads
   * only "failed" would repost the same reply and leave the thread with two identical comments.
   */
  console.log(JSON.stringify({ threadId, replied: true, resolved: false, error: resolved.detail, note: `the reply landed; retry with --resolve-only, do not repost the reply`, retry: `node tools/resolve-bot-thread.mjs --thread ${threadId} --repo ${repoKey} --resolve-only` }, null, 2))
  process.exit(1)
}

console.log(
  JSON.stringify(
    {
      threadId,
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
