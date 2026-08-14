#!/usr/bin/env node
/**
 * Resolve a scope into ONE ordered execution plan for /orchestrate, and print it as JSON.
 *
 * A scope is an explicit ticket list, a GitHub milestone, or the whole open board. The plan names
 * which tickets are admissible, which are deferred and why, what order they run in, which of them
 * stack on each other, and which may run concurrently.
 *
 * It PLANS. It creates no worktree, launches no worker, opens no pull request and writes nothing to
 * the ticket system. Every decision below is derived from the ticket adapter, so an
 * unreachable ticket is a refusal rather than a guess.
 *
 * The ordering rule that matters: a ticket whose blocker is not itself in this queue cannot run,
 * because its branch would have to contain work that does not exist yet. A ticket whose blocker IS
 * in the queue does not have to wait for a merge when its dependencies form one stackable chain.
 * Other DAG shapes run against main in a later wave, after every blocker has landed.
 */

import { listMilestones, listTickets, readTickets, resolveTicket } from "./lib/github-issues.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { classifyConversationFirst, classifyExecutability } from "./lib/ticket-executability.mjs"

const USAGE = `usage: plan-queue.mjs (--tickets ORB-1,ORB-2 | --project <name> | --board) [options]

  --tickets <list>   comma or space separated ticket references, in no particular order
  --project <name>   every open ticket in the matching GitHub milestone
  --board            every open ticket on the configured GitHub project
  --limit <n>        cap the tickets read for --project/--board (default 250)
  --format <fmt>     json (default) or markdown
  --sleep            plan for an unattended run: a ticket that has to be talked through first
                     is deferred NEEDS_CONVERSATION with its open questions, because nobody is
                     awake to answer them. Attended, the same ticket is admitted and its
                     questions travel with it for step 2b to ask
  --help, -h         print this usage and exit 0

Exactly one of --tickets, --project or --board is required.

Prints ONE JSON object on stdout: scope, admitted, deferred, stacks, waves. Errors go to stderr.

  admitted[]  identifier, repo, title, labels, blockedBy, stackParent, branchMode,
              wave, unlocks, warnings, conversation
  deferred[]  identifier, reason, questions  (BLOCKED_OUTSIDE_QUEUE,
              UNSTACKABLE_BLOCKERS_IN_QUEUE, NO_REPO_LABEL, AMBIGUOUS_REPO, CLOSED,
              NOT_REPRODUCED, NOT_CODE_WORK, MULTI_PR, NEEDS_CONVERSATION)
  stacks[]    repo, branchBase, members[]   one stack per dependency chain within a repo
  waves[][]   identifiers that may run concurrently, each wave depending only on earlier ones

A ticket is admitted when it is open, carries exactly one repo:* label, every ticket blocking it is
either closed or also admitted here, and its body does not say a headless agent cannot execute it.

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

const VALUE_FLAGS = new Set(["--tickets", "--project", "--limit", "--format"])
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, "--board", "--sleep", "--help", "-h"])
/**
 * A flag's VALUE is skipped before the unknown-option check, so `--limit -1` complains about the
 * limit rather than about an unknown option it is not.
 */
const unknown = process.argv.slice(2).filter((value, index, argv) => value.startsWith("-") && !KNOWN_FLAGS.has(value) && !VALUE_FLAGS.has(argv[index - 1]))
if (unknown.length) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const ticketsArg = argOf("--tickets")
const projectArg = argOf("--project")
const board = process.argv.includes("--board")
const sleep = process.argv.includes("--sleep")
const format = argOf("--format") ?? "json"
const limitArg = argOf("--limit") ?? "250"

const safeValue = (value) => typeof value === "string" && value.length > 0 && !value.startsWith("-")
const scopeCount = [safeValue(ticketsArg), safeValue(projectArg), board].filter(Boolean).length
if (scopeCount === 0) fail(2, `${USAGE}\n\none of --tickets, --project or --board is required`)
if (scopeCount > 1) fail(2, `${USAGE}\n\n--tickets, --project and --board are mutually exclusive`)
if (!["json", "markdown"].includes(format)) fail(2, `${USAGE}\n\n--format must be json or markdown`)
const limit = Number(limitArg)
if (!Number.isInteger(limit) || limit < 1) fail(2, `${USAGE}\n\n--limit must be a positive integer`)

const isClosed = (ticket) => ticket?.state === "CLOSED"

const labelNames = (issue) => (issue?.labels ?? []).map((label) => label.name)
const repoLabels = (issue) => labelNames(issue).filter((name) => name.startsWith("repo:"))

const ticketReferences = async () => {
  if (safeValue(ticketsArg)) {
    return ticketsArg
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  }
  try {
    if (safeValue(projectArg)) {
      const milestones = (await listMilestones()).sort((left, right) => left.localeCompare(right))
      if (!milestones.includes(projectArg)) {
        throw new Error(`unknown project ${JSON.stringify(projectArg)}; available milestones: ${milestones.join(", ") || "none"}`)
      }
      return (await listTickets({ state: "open", milestone: projectArg })).slice(0, limit).map((ticket) => ticket.identifier ?? `#${ticket.number}`)
    }
    return (await listTickets({ state: "open" }))
      .filter((ticket) => typeof ticket.projectItemId === "string")
      .slice(0, limit)
      .map((ticket) => ticket.identifier ?? `#${ticket.number}`)
  } catch (error) {
    fail(2, `ticket list failed: ${error.message}`)
  }
}

const scopeIds = await ticketReferences()
for (const reference of scopeIds) {
  try {
    resolveTicket(reference)
  } catch (error) {
    fail(2, error.message)
  }
}
if (scopeIds.length === 0) {
  console.error(`the scope resolved to zero tickets; nothing to plan`)
  process.exit(1)
}

/**
 * One normalized read per ticket. The adapter returns the blocked-by connection in the same read,
 * so the graph cannot silently disappear behind a smaller list shape.
 */
const fetched = new Map()
for (const reference of scopeIds) {
  const resolved = resolveTicket(reference)
  const id = resolved.identifier ?? `#${resolved.number}`
  if (fetched.has(id)) continue
  let ticket
  try {
    ticket = (await readTickets([resolved.number]))[0]
  } catch (error) {
    fail(2, `ticket read failed for ${id}: ${error.message}`)
  }
  const blockedBy = ticket.blockedBy.map(({ number }) => resolveTicket(number).identifier ?? `#${number}`)
  fetched.set(id, { issue: ticket, blockedBy })
}

/**
 * A blocker outside the scope still has to be resolved, because "is it merged" is the whole
 * question. Reading it costs one call and answers it from state rather than from optimism.
 */
const blockerState = new Map()
for (const { blockedBy } of fetched.values()) {
  for (const blocker of blockedBy) {
    if (fetched.has(blocker) || blockerState.has(blocker)) continue
    const resolved = resolveTicket(blocker)
    try {
      const [ticket] = await readTickets([resolved.number])
      blockerState.set(blocker, isClosed(ticket))
    } catch (error) {
      fail(2, `blocker read failed for ${blocker}: ${error.message}`)
    }
  }
}

try {
  readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}

const deferred = []
const candidates = new Map()
for (const [id, entry] of fetched) {
  const { issue } = entry
  if (isClosed(issue)) {
    deferred.push({ identifier: id, reason: "CLOSED", detail: issue.status ?? issue.stateReason ?? "closed" })
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
  /**
   * The executability pass, and the reason it runs HERE rather than at the scope gate: a ticket
   * dropped before the fixed point below cascades correctly onto whatever depended on it, and a
   * ticket named at 23:00 is a decision Thomas can make before bed rather than a slot burned at 03:00.
   */
  const { deferrals, warnings } = classifyExecutability(issue.body)
  if (deferrals.length > 0) {
    const [first, ...also] = deferrals
    deferred.push({ identifier: id, reason: first.reason, detail: also.length > 0 ? `${first.detail}. It also reads as ${also.map((entry) => entry.reason).join(" and ")}` : first.detail })
    continue
  }
  /**
   * The conversation pass, and why it is not a deferral in both modes: a ticket whose acceptance
   * criteria carry a human grant, or whose body contradicts itself about which tool is current, can
   * be executed by a headless worker. It just cannot be executed CORRECTLY without asking first.
   * ORB-30 (#36) is the case: 34,709 characters naming Pencil as the prototyping tool in one section
   * and Claude Design in another while saying Pencil is retired.
   *
   * Attended, that is a conversation, so the ticket stays admitted and its questions travel with it
   * for step 2b. Under `--sleep` nobody is awake to answer, so it defers with the questions attached
   * and Thomas wakes to a decision list rather than a confidently wrong pull request.
   */
  const conversation = classifyConversationFirst(issue.body, { labels: issue.labels })
  if (conversation.conversationFirst && sleep) {
    deferred.push({
      identifier: id,
      reason: "NEEDS_CONVERSATION",
      detail: `reads as conversation-first (${conversation.signals.map((signal) => signal.kind).join(", ")}, from the ${conversation.source}) and nobody is awake to answer. Run it attended`,
      questions: conversation.questions,
    })
    continue
  }
  candidates.set(id, {
    ...entry,
    repo: repos[0].slice("repo:".length),
    warnings: conversation.conversationFirst
      ? [...warnings, `CONVERSATION FIRST (${conversation.signals.map((signal) => signal.kind).join(", ")}): ask its ${conversation.questions.length} open question(s) at step 2b before any worker spawns`]
      : warnings,
    conversation: conversation.conversationFirst ? conversation : null,
  })
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
    fail(2, `a blocking cycle exists among ${[...remaining].sort().join(", ")}; no order can satisfy it`)
  }
  waves.push(ready)
  for (const id of ready) {
    remaining.delete(id)
    placed.add(id)
  }
}

const order = waves.flat()
const depthOf = new Map(order.map((id, index) => [id, index]))
const blockedTicketsById = new Map(order.map((id) => [id, []]))
for (const [id, entry] of candidates) {
  for (const blocker of entry.blockedBy) blockedTicketsById.get(blocker)?.push(id)
}
const unlocksById = new Map()
for (const id of order) {
  const unlocked = new Set()
  const frontier = [...blockedTicketsById.get(id)]
  while (frontier.length > 0) {
    const unlockedId = frontier.pop()
    if (unlocked.has(unlockedId)) continue
    unlocked.add(unlockedId)
    frontier.push(...blockedTicketsById.get(unlockedId))
  }
  unlocksById.set(id, unlocked.size)
}

/**
 * A stack is a dependency chain inside ONE repository. Cross-repo blockers can never stack, because
 * GitHub requires every branch in a stack to live in the same repository, so those stay independent
 * pull requests against main and the api one has to merge and deploy first.
 *
 * A branch has exactly ONE parent, so a ticket can stack only when its same-repo blockers form one
 * chain. Picking one parent for independent blockers would plan a branch that does not contain the
 * other blockers' work while claiming all are satisfied. Such a ticket instead opens against main
 * in its DAG-ordered wave, after every blocker; only a cycle is genuinely unorderable and refused.
 */
const sameRepoBlockersOf = (id) => {
  const entry = candidates.get(id)
  return entry.blockedBy.filter((blocker) => candidates.get(blocker)?.repo === entry.repo)
}

const stackParentById = new Map()
const branchModeById = new Map()
for (const id of order) {
  const sameRepo = sameRepoBlockersOf(id)
  const parent = sameRepo.slice().sort((left, right) => depthOf.get(right) - depthOf.get(left) || right.localeCompare(left))[0] ?? null
  const ancestors = new Set()
  for (let cursor = parent; cursor; cursor = stackParentById.get(cursor)) {
    ancestors.add(cursor)
  }
  const stackable = sameRepo.every((blocker) => ancestors.has(blocker))
  const stackParent = stackable ? parent : null
  stackParentById.set(id, stackParent)
  branchModeById.set(id, stackable ? (stackParent ? "stacked" : "main") : "unstackable")
}

/**
 * An unstackable ticket cannot run in this queue at all, and saying so is the only honest verdict.
 *
 * The first attempt annotated it and admitted it anyway, on the reasoning that a later wave gates
 * it. That reasoning is wrong: waves order tickets in TIME, and nothing merges between them, so a
 * later wave confers no code. Three independent reviewers reached the same defect on #685.
 *
 * There is no live "have the blockers merged yet" check worth writing, because the answer is fixed
 * by construction. `sameRepoBlockersOf` counts only blockers that are CANDIDATES, and a blocker
 * whose work already merged is Done, so it was deferred as CLOSED and never became one.
 * Every blocker still counted here is therefore open and in THIS queue, and cannot merge before the
 * ticket that waits on it. So the ticket defers.
 *
 * This amends an acceptance criterion of ORB-235, which said no diamond may land in `deferred`. That
 * criterion was written under the same wrong assumption. What ORB-235 actually bought is intact and
 * is the part that mattered: the board PLANS instead of refusing, and one unrunnable ticket costs
 * itself rather than the whole night.
 */
const dropped = new Map()
for (const id of order) {
  if (branchModeById.get(id) !== "unstackable") continue
  dropped.set(
    id,
    `blocked by ${sameRepoBlockersOf(id).join(", ")} in ${candidates.get(id).repo}, which do not form one chain. ` +
      `A branch has one parent, and none of those blockers can merge while this queue runs, so no branch can carry their work. Run it after they merge.`,
  )
}

/**
 * Dropping a ticket orphans anything that depended on it, so the removal is transitive. A child
 * whose blocker just left the queue is in exactly the position BLOCKED_OUTSIDE_QUEUE describes: its
 * branch would have to contain work that will not exist, and it is reported with that same reason so
 * the two identical situations do not carry two different names.
 *
 * Detail strings are computed BEFORE anything is removed, because `sameRepoBlockersOf` reads
 * `candidates` and a mutation mid-walk would silently change a later ticket's answer.
 */
for (let changed = true; changed; ) {
  changed = false
  for (const id of order) {
    if (dropped.has(id)) continue
    const orphanedBy = candidates.get(id).blockedBy.filter((blocker) => dropped.has(blocker))
    if (orphanedBy.length === 0) continue
    dropped.set(id, `blocked by ${orphanedBy.join(", ")}, which left this queue, so its branch cannot carry their work`)
    changed = true
  }
}
for (const [id, detail] of dropped) {
  deferred.push({ identifier: id, reason: branchModeById.get(id) === "unstackable" ? "UNSTACKABLE_BLOCKERS_IN_QUEUE" : "BLOCKED_OUTSIDE_QUEUE", detail })
}

const runnable = order.filter((id) => !dropped.has(id))
const runnableWaves = waves.map((wave) => wave.filter((id) => !dropped.has(id))).filter((wave) => wave.length > 0)

const admitted = runnable.map((id, index) => {
  const entry = candidates.get(id)
  return {
    identifier: id,
    repo: entry.repo,
    title: entry.issue.title,
    state: entry.issue.status ?? entry.issue.state,
    labels: labelNames(entry.issue),
    blockedBy: entry.blockedBy,
    stackParent: stackParentById.get(id),
    branchMode: branchModeById.get(id),
    wave: runnableWaves.findIndex((wave) => wave.includes(id)),
    position: index,
    unlocks: unlocksById.get(id),
    warnings: entry.warnings,
    conversation: entry.conversation ?? null,
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
  scope: safeValue(ticketsArg) ? { kind: "tickets", value: scopeIds } : safeValue(projectArg) ? { kind: "project", value: projectArg } : { kind: "board", value: "configured" },
  counts: { requested: scopeIds.length, admitted: admitted.length, deferred: deferred.length, waves: runnableWaves.length, stacks: stacks.length },
  admitted,
  deferred: deferred.sort((left, right) => left.identifier.localeCompare(right.identifier)),
  stacks,
  waves: runnableWaves,
}

if (format === "markdown") {
  const lines = [`# Queue plan (${plan.counts.admitted} admitted, ${plan.counts.deferred} deferred)`, ""]
  for (const [index, wave] of runnableWaves.entries()) {
    lines.push(`## Wave ${index + 1}`)
    for (const id of wave) {
      const ticket = byIdentifier.get(id)
      const branch =
        ticket.branchMode === "stacked"
          ? ` (stacks on ${ticket.stackParent})`
          : ticket.branchMode === "main-after-blockers-merge"
            ? " (opens against main after blockers merge; blockers do not form a stack)"
            : " (opens against main)"
      lines.push(`- ${id} \`${ticket.repo}\`${branch} ${ticket.title}`)
      for (const warning of ticket.warnings) lines.push(`  - WARNING ${warning}`)
    }
    lines.push("")
  }
  if (deferred.length > 0) {
    lines.push("## Deferred")
    for (const entry of plan.deferred) {
      lines.push(`- ${entry.identifier} ${entry.reason}: ${entry.detail}`)
      for (const question of entry.questions ?? []) lines.push(`  - ASK ${question}`)
    }
  }
  console.log(lines.join("\n"))
} else {
  console.log(JSON.stringify(plan, null, 2))
}

process.exit(0)
