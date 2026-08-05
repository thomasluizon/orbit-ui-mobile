#!/usr/bin/env node
/**
 * Resolve a scope into ONE ordered execution plan for /orchestrate, and print it as JSON.
 *
 * A scope is an explicit ticket list, a Linear project, or the whole open board. The plan names
 * which tickets are admissible, which are deferred and why, what order they run in, which of them
 * stack on each other, and which may run concurrently.
 *
 * It PLANS. It creates no worktree, launches no worker, opens no pull request and writes nothing to
 * Linear. Every decision below is derived from what `orca linear` actually returned, so an
 * unreachable ticket is a refusal rather than a guess.
 *
 * The ordering rule that matters: a ticket whose blocker is not itself in this queue cannot run,
 * because its branch would have to contain work that does not exist yet. A ticket whose blocker IS
 * in the queue does not have to wait for a merge, because its branch stacks on its blocker's branch.
 * That distinction is the whole reason stacked pull requests were adopted.
 */

import { execFileSync } from "node:child_process"

const USAGE = `usage: plan-queue.mjs (--tickets ORB-1,ORB-2 | --project <name> | --board) [options]

  --tickets <list>   comma or space separated Linear identifiers, in no particular order
  --project <name>   every open ticket in this Linear project
  --board            every open ticket on the team board
  --team <key>       Linear team key (default ORB)
  --limit <n>        cap the tickets read for --project/--board (default 250)
  --format <fmt>     json (default) or markdown
  --help, -h         print this usage and exit 0

Exactly one of --tickets, --project or --board is required.

Prints ONE JSON object on stdout: scope, admitted, deferred, stacks, waves. Errors go to stderr.

  admitted[]  identifier, repo, title, labels, visibleEffect, blockedBy, stackParent, wave
  deferred[]  identifier, reason  (BLOCKED_OUTSIDE_QUEUE, NO_REPO_LABEL, AMBIGUOUS_REPO, CLOSED)
  stacks[]    repo, branchBase, members[]   one stack per dependency chain within a repo
  waves[][]   identifiers that may run concurrently, each wave depending only on earlier ones

A ticket is admitted when it is open, carries exactly one repo:* label, and every ticket blocking it
is either closed or also admitted here. visible-effect is NOT a bar to admission: the run opens the
pull request and stops, and the human grants visual completion.

exit codes: 0 a plan was produced (it may admit zero tickets), 1 the scope resolved to no tickets
            at all, 2 usage or environment error`

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

const VALUE_FLAGS = new Set(["--tickets", "--project", "--team", "--limit", "--format"])
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, "--board", "--help", "-h"])
/**
 * A flag's VALUE is skipped before the unknown-option check, so `--limit -1` complains about the
 * limit rather than about an unknown option it is not.
 */
const unknown = process.argv.slice(2).filter((value, index, argv) => value.startsWith("-") && !KNOWN_FLAGS.has(value) && !VALUE_FLAGS.has(argv[index - 1]))
if (unknown.length) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const ticketsArg = argOf("--tickets")
const projectArg = argOf("--project")
const board = process.argv.includes("--board")
const team = argOf("--team") ?? "ORB"
const format = argOf("--format") ?? "json"
const limitArg = argOf("--limit") ?? "250"

const safeValue = (value) => typeof value === "string" && value.length > 0 && !value.startsWith("-")
const scopeCount = [safeValue(ticketsArg), safeValue(projectArg), board].filter(Boolean).length
if (scopeCount === 0) fail(2, `${USAGE}\n\none of --tickets, --project or --board is required`)
if (scopeCount > 1) fail(2, `${USAGE}\n\n--tickets, --project and --board are mutually exclusive`)
if (!["json", "markdown"].includes(format)) fail(2, `${USAGE}\n\n--format must be json or markdown`)
const limit = Number(limitArg)
if (!Number.isInteger(limit) || limit < 1) fail(2, `${USAGE}\n\n--limit must be a positive integer`)

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"

/**
 * Every orca reply is an envelope: `{ok, result}` on success and `{ok: false, error}` on failure.
 * A non-zero exit with a parseable envelope is still an answer, so the envelope is read first and
 * the exit code second. Reading it the other way around is how a "not yet" once became fatal.
 */
const orca = (args) => {
  let stdout = ""
  try {
    stdout = execFileSync(ORCA, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 })
  } catch (error) {
    stdout = error.stdout?.toString() ?? ""
    if (!stdout.trim()) fail(2, `orca ${args.join(" ")} failed: ${(error.stderr?.toString() || error.message).trim()}`)
  }
  let envelope
  try {
    envelope = JSON.parse(stdout)
  } catch {
    fail(2, `orca ${args.join(" ")} returned unparseable JSON: ${stdout.trim().slice(0, 240) || "empty output"}`)
  }
  if (envelope?.ok === false) {
    fail(2, `orca ${args.join(" ")} refused: ${envelope.error?.message ?? "no message"}`)
  }
  return envelope.result ?? {}
}

/** Linear's own state types, not display names, so a renamed column cannot silently reopen a ticket. */
const CLOSED_STATE_TYPES = new Set(["completed", "canceled", "duplicate"])
const isClosed = (issue) => CLOSED_STATE_TYPES.has(issue?.state?.type)

const labelNames = (issue) => (issue?.labels ?? []).map((label) => label.name)
const repoLabels = (issue) => labelNames(issue).filter((name) => name.startsWith("repo:"))

const identifiers = () => {
  if (safeValue(ticketsArg)) {
    return ticketsArg
      .split(/[\s,]+/)
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
  }
  const args = ["linear", "list-issues", "--team", team, "--limit", String(limit), "--json"]
  if (safeValue(projectArg)) args.push("--project", projectArg)
  const issues = orca(args).issues ?? []
  return issues.filter((issue) => !isClosed(issue)).map((issue) => issue.identifier)
}

const scopeIds = identifiers()
for (const id of scopeIds) {
  if (!/^[A-Z][A-Z0-9]*-\d+$/.test(id)) fail(2, `not a Linear identifier: ${id}`)
}
if (scopeIds.length === 0) {
  console.error(`the scope resolved to zero tickets; nothing to plan`)
  process.exit(1)
}

/**
 * One read per ticket, with relations. `list-issues` cannot return them, so a per-ticket call is the
 * only way to see a blocking edge at all, and a plan that cannot see them would order work by title.
 */
const fetched = new Map()
for (const id of scopeIds) {
  if (fetched.has(id)) continue
  const result = orca(["linear", "issue", id, "--relations", "--json"])
  const issue = result.issue
  if (!issue?.identifier) fail(2, `orca returned no issue for ${id}`)
  const blockedBy = (result.relations ?? [])
    .filter((relation) => relation.relationship === "blockedBy")
    .map((relation) => relation.relatedIssue?.identifier)
    .filter(Boolean)
  fetched.set(issue.identifier, { issue, blockedBy })
}

/**
 * A blocker outside the scope still has to be resolved, because "is it merged" is the whole
 * question. Reading it costs one call and answers it from state rather than from optimism.
 */
const blockerState = new Map()
for (const { blockedBy } of fetched.values()) {
  for (const blocker of blockedBy) {
    if (fetched.has(blocker) || blockerState.has(blocker)) continue
    const issue = orca(["linear", "issue", blocker, "--json"]).issue
    blockerState.set(blocker, Boolean(issue) && isClosed(issue))
  }
}

const deferred = []
const candidates = new Map()
for (const [id, entry] of fetched) {
  const { issue } = entry
  if (isClosed(issue)) {
    deferred.push({ identifier: id, reason: "CLOSED", detail: issue.state?.name ?? "closed" })
    continue
  }
  const repos = repoLabels(issue)
  if (repos.length === 0) {
    deferred.push({ identifier: id, reason: "NO_REPO_LABEL", detail: "no repo:* label, so the target repository is unknown" })
    continue
  }
  if (repos.length > 1) {
    deferred.push({ identifier: id, reason: "AMBIGUOUS_REPO", detail: `carries ${repos.join(" and ")}; repo:both does not exist` })
    continue
  }
  candidates.set(id, { ...entry, repo: repos[0].slice("repo:".length) })
}

/**
 * Admission is a fixed point, not one pass. Dropping a ticket for an unrunnable blocker can make a
 * SECOND ticket unrunnable, and a single pass would admit that one and plan a branch on nothing.
 */
let settled = false
while (!settled) {
  settled = true
  for (const [id, entry] of [...candidates]) {
    const unmet = entry.blockedBy.filter((blocker) => {
      if (candidates.has(blocker)) return false
      return blockerState.get(blocker) !== true
    })
    if (unmet.length === 0) continue
    candidates.delete(id)
    deferred.push({ identifier: id, reason: "BLOCKED_OUTSIDE_QUEUE", detail: `blocked by ${unmet.join(", ")}, which is neither closed nor in this queue` })
    settled = false
  }
}

/**
 * Kahn's algorithm over the in-queue blocking edges. Ties break on identifier so two runs over the
 * same board produce the same plan; a plan that reordered itself between runs could not be reviewed.
 */
const waves = []
const placed = new Set()
const remaining = new Set(candidates.keys())
while (remaining.size > 0) {
  const ready = [...remaining]
    .filter((id) => candidates.get(id).blockedBy.every((blocker) => !remaining.has(blocker)))
    .sort()
  if (ready.length === 0) {
    fail(2, `a blocking cycle exists among ${[...remaining].sort().join(", ")}; Linear allows it and no order can satisfy it`)
  }
  waves.push(ready)
  for (const id of ready) {
    remaining.delete(id)
    placed.add(id)
  }
}

/**
 * A stack is a dependency chain inside ONE repository. Cross-repo blockers can never stack, because
 * GitHub requires every branch in a stack to live in the same repository, so those stay independent
 * pull requests against main and the api one has to merge and deploy first.
 */
const stackParentOf = (id) => {
  const entry = candidates.get(id)
  const sameRepo = entry.blockedBy.filter((blocker) => candidates.get(blocker)?.repo === entry.repo)
  return sameRepo.sort().at(-1) ?? null
}

const order = waves.flat()
const admitted = order.map((id, index) => {
  const entry = candidates.get(id)
  return {
    identifier: id,
    repo: entry.repo,
    title: entry.issue.title,
    state: entry.issue.state?.name ?? null,
    labels: labelNames(entry.issue),
    visibleEffect: labelNames(entry.issue).includes("visible-effect"),
    blockedBy: entry.blockedBy,
    stackParent: stackParentOf(id),
    wave: waves.findIndex((wave) => wave.includes(id)),
    position: index,
  }
})

const byIdentifier = new Map(admitted.map((ticket) => [ticket.identifier, ticket]))
const stacks = []
for (const ticket of admitted) {
  if (ticket.stackParent) continue
  const members = [ticket.identifier]
  let frontier = [ticket.identifier]
  while (frontier.length > 0) {
    const next = admitted.filter((other) => frontier.includes(other.stackParent)).map((other) => other.identifier)
    members.push(...next)
    frontier = next
  }
  if (members.length > 1) stacks.push({ repo: ticket.repo, branchBase: "main", members })
}

const plan = {
  scope: safeValue(ticketsArg) ? { kind: "tickets", value: scopeIds } : safeValue(projectArg) ? { kind: "project", value: projectArg } : { kind: "board", value: team },
  counts: { requested: scopeIds.length, admitted: admitted.length, deferred: deferred.length, waves: waves.length, stacks: stacks.length },
  admitted,
  deferred: deferred.sort((left, right) => left.identifier.localeCompare(right.identifier)),
  stacks,
  waves,
}

if (format === "markdown") {
  const lines = [`# Queue plan (${plan.counts.admitted} admitted, ${plan.counts.deferred} deferred)`, ""]
  for (const [index, wave] of waves.entries()) {
    lines.push(`## Wave ${index + 1}`)
    for (const id of wave) {
      const ticket = byIdentifier.get(id)
      const stacked = ticket.stackParent ? ` (stacks on ${ticket.stackParent})` : ""
      const visual = ticket.visibleEffect ? " [visual check owed]" : ""
      lines.push(`- ${id} \`${ticket.repo}\`${stacked}${visual} ${ticket.title}`)
    }
    lines.push("")
  }
  if (deferred.length > 0) {
    lines.push("## Deferred")
    for (const entry of plan.deferred) lines.push(`- ${entry.identifier} ${entry.reason}: ${entry.detail}`)
  }
  console.log(lines.join("\n"))
} else {
  console.log(JSON.stringify(plan, null, 2))
}

process.exit(0)
