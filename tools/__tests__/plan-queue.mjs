import { existsSync } from "node:fs"

import { check, realOrchestratorConfig, run, stage, stageWithConfig, T } from "./_harness.mjs"

const TOOL = "plan-queue.mjs"

const ticket = (
  identifier,
  {
    title = `${identifier} work`,
    state = "OPEN",
    status = "Todo",
    labels = ["repo:ui"],
    body = "## Scope\n\n- Do the work",
    blockedBy = [],
    milestone = null,
    projectItemId = `item-${identifier}`,
  } = {},
) => ({
  identifier,
  number: Number(identifier.split("-")[1]),
  url: `https://github.com/thomasluizon/orbit-tickets/issues/${Number(identifier.split("-")[1])}`,
  title,
  body,
  state,
  stateReason: null,
  labels: labels.map((name) => ({ name })),
  blockedBy: blockedBy.map((reference) => ({ number: Number(reference.split("-")[1]) })),
  blocking: [],
  status,
  milestone,
  projectItemId,
})

const planOf = (result) => {
  try {
    return JSON.parse(result.stdout)
  } catch {
    return null
  }
}

const obeysWaveOrder = (plan) => {
  const admitted = new Map(plan.admitted.map((entry) => [entry.identifier, entry]))
  return plan.admitted.every((entry) => entry.blockedBy.every((blocker) => !admitted.has(blocker) || admitted.get(blocker).wave < entry.wave))
}

export const cases = () => {
  check(TOOL, "refuses no scope at all", [], { status: 2, stderr: /one of --tickets, --project or --board is required/ })
  check(TOOL, "refuses two scopes at once", ["--tickets", "ORB-10", "--board"], { status: 2, stderr: /mutually exclusive/ })
  check(TOOL, "refuses an unknown format", ["--tickets", "ORB-10", "--format", "yaml"], { status: 2, stderr: /--format must be json or markdown/ })
  check(TOOL, "refuses a non-numeric limit", ["--board", "--limit", "many"], { status: 2, stderr: /--limit must be a positive integer/ })
  check(TOOL, "an ORB identifier absent from the migration map is refused before any ticket read", ["--tickets", "ORB-999999"], { status: 2, stderr: /Unknown migrated ticket ORB-999999/ })

  const staged = stageWithConfig("plan-queue", TOOL, realOrchestratorConfig())
  stage(
    "staged/plan-queue/tools/lib/github-issues.mjs",
    `import { rmSync } from "node:fs"

const tickets = JSON.parse(process.env.ORBIT_TICKET_STUB || "[]")
const byIdentifier = new Map(tickets.map((ticket) => [ticket.identifier, ticket]))
const byNumber = new Map(tickets.map((ticket) => [ticket.number, ticket]))
export const resolveTicket = (reference) => {
  if (typeof reference === "number" || /^#?\\d+$/.test(String(reference))) {
    const number = Number(String(reference).replace(/^#/, ""))
    return { number, identifier: byNumber.get(number)?.identifier ?? null }
  }
  const identifier = String(reference).toUpperCase()
  const found = byIdentifier.get(identifier)
  if (!found) throw new Error("Unknown migrated ticket " + reference + "; refusing to guess a GitHub issue number")
  return { number: found.number, identifier }
}
export const readTicket = async (number) => {
  if (process.env.ORBIT_SINGLE_READ_MARKER) rmSync(process.env.ORBIT_SINGLE_READ_MARKER, { force: true })
  const found = byNumber.get(number)
  if (!found) throw new Error("ticket not found")
  return structuredClone(found)
}
export const readTickets = async (numbers) => {
  if (process.env.ORBIT_BULK_READ_MARKER) rmSync(process.env.ORBIT_BULK_READ_MARKER, { force: true })
  return numbers.map((number) => {
    const found = byNumber.get(number)
    if (!found) throw new Error("ticket not found")
    return structuredClone(found)
  })
}
export const listMilestones = async () => JSON.parse(process.env.ORBIT_MILESTONE_STUB || "[]")
export const listTickets = async ({ milestone = null } = {}) => tickets
  .filter((ticket) => ticket.state === "OPEN" && (milestone === null || ticket.milestone === milestone))
  .map((ticket) => structuredClone(ticket))
`,
  )
  const execute = (references, tickets, extra = [], environment = {}) => run(TOOL, ["--tickets", references.join(","), ...extra], { path: staged.path, env: { ORBIT_TICKET_STUB: JSON.stringify(tickets), ...environment } })

  const bulkReadMarker = stage("plan-queue/bulk-read-marker", "pending")
  const singleReadMarker = stage("plan-queue/single-read-marker", "must remain")
  const bulkPath = execute(["ORB-1", "ORB-2"], [ticket("ORB-1"), ticket("ORB-2")], [], {
    ORBIT_BULK_READ_MARKER: bulkReadMarker,
    ORBIT_SINGLE_READ_MARKER: singleReadMarker,
  })
  T(
    `${TOOL}: planning routes ticket hydration through the one-board bulk adapter`,
    bulkPath.status === 0 && !existsSync(bulkReadMarker) && existsSync(singleReadMarker),
    bulkPath.stderr || bulkPath.stdout,
  )

  /**
   * Two fail-closed exits that the move off Linear kept in the tool but lost from the suite. The
   * behaviour never broke; the guard against breaking it did, which is the same defect class as a
   * gate whose test cannot fail. An unattended run at 03:00 distinguishes "nothing to do" from
   * "the ticket system did not answer" by these exit codes alone.
   */
  const emptyScope = run(TOOL, ["--board"], { path: staged.path, env: { ORBIT_TICKET_STUB: "[]" } })
  T(
    `${TOOL}: a scope resolving to zero tickets exits 1 rather than printing an empty plan`,
    emptyScope.status === 1 && /resolved to zero tickets/.test(emptyScope.stderr) && emptyScope.stdout.trim() === "",
    `status ${emptyScope.status}: ${emptyScope.stderr || emptyScope.stdout}`,
  )

  const readFailure = execute(["#999999"], [ticket("ORB-1")])
  T(
    `${TOOL}: a ticket read failure is an environment error, never an empty plan`,
    readFailure.status === 2 && /ticket read failed/.test(readFailure.stderr) && readFailure.stdout.trim() === "",
    `status ${readFailure.status}: ${readFailure.stderr || readFailure.stdout}`,
  )

  const independent = execute(["ORB-1", "ORB-2"], [ticket("ORB-1"), ticket("ORB-2", { labels: ["repo:api"] })])
  const independentPlan = planOf(independent)
  T(
    `${TOOL}: two unrelated tickets share one wave and form no stack`,
    independent.status === 0 && independentPlan?.waves[0].join(",") === "ORB-1,ORB-2" && independentPlan.stacks.length === 0 && independentPlan.admitted.every((entry) => entry.branchMode === "main"),
    independent.stdout || independent.stderr,
  )

  const chained = execute(["ORB-1", "ORB-2"], [ticket("ORB-1"), ticket("ORB-2", { blockedBy: ["ORB-1"] })])
  const chainedPlan = planOf(chained)
  T(
    `${TOOL}: an in-queue blocker preserves DAG waves and same-repo stacking`,
    chained.status === 0 && chainedPlan?.waves.map((wave) => wave.join(",")).join("|") === "ORB-1|ORB-2" && chainedPlan.admitted[1].stackParent === "ORB-1" && chainedPlan.stacks[0]?.members.join(",") === "ORB-1,ORB-2",
    chained.stdout || chained.stderr,
  )

  const blockedOutside = execute(["ORB-2"], [ticket("ORB-1"), ticket("ORB-2", { blockedBy: ["ORB-1"] })])
  T(
    `${TOOL}: an open blocker outside the queue keeps the exact BLOCKED_OUTSIDE_QUEUE reason`,
    planOf(blockedOutside)?.deferred[0]?.reason === "BLOCKED_OUTSIDE_QUEUE",
    blockedOutside.stdout || blockedOutside.stderr,
  )

  const blockerDone = execute(["ORB-2"], [ticket("ORB-1", { state: "CLOSED", status: "Done" }), ticket("ORB-2", { blockedBy: ["ORB-1"] })])
  T(`${TOOL}: a closed blocker outside the queue is not a bar`, planOf(blockerDone)?.counts.admitted === 1, blockerDone.stdout || blockerDone.stderr)

  const cascade = execute(
    ["ORB-2", "ORB-3"],
    [ticket("ORB-1"), ticket("ORB-2", { blockedBy: ["ORB-1"] }), ticket("ORB-3", { blockedBy: ["ORB-2"] })],
  )
  T(
    `${TOOL}: blocker deferral cascades to a fixed point`,
    planOf(cascade)?.deferred.length === 2 && planOf(cascade).deferred.every((entry) => entry.reason === "BLOCKED_OUTSIDE_QUEUE"),
    cascade.stdout || cascade.stderr,
  )

  const crossRepo = execute(
    ["ORB-1", "ORB-2"],
    [ticket("ORB-1", { labels: ["repo:api"] }), ticket("ORB-2", { labels: ["repo:ui"], blockedBy: ["ORB-1"] })],
  )
  const crossPlan = planOf(crossRepo)
  T(
    `${TOOL}: a cross-repo blocker orders waves but never stacks`,
    crossPlan?.waves.length === 2 && crossPlan.admitted.find((entry) => entry.identifier === "ORB-2")?.stackParent === null && crossPlan.stacks.length === 0,
    crossRepo.stdout || crossRepo.stderr,
  )

  for (const [name, labels, reason] of [
    ["missing", ["Improvement"], "NO_REPO_LABEL"],
    ["ambiguous", ["repo:ui", "repo:api"], "AMBIGUOUS_REPO"],
  ]) {
    const result = execute(["ORB-1"], [ticket("ORB-1", { labels })])
    T(`${TOOL}: ${name} repository labels keep the exact deferral reason`, planOf(result)?.deferred[0]?.reason === reason, result.stdout || result.stderr)
  }

  const closed = execute(["ORB-1"], [ticket("ORB-1", { state: "CLOSED", status: "Done" })])
  T(`${TOOL}: a closed ticket keeps the exact CLOSED deferral`, planOf(closed)?.deferred[0]?.reason === "CLOSED", closed.stdout || closed.stderr)

  const cycle = execute(
    ["ORB-1", "ORB-2"],
    [ticket("ORB-1", { blockedBy: ["ORB-2"] }), ticket("ORB-2", { blockedBy: ["ORB-1"] })],
  )
  T(`${TOOL}: a blocking cycle is refused by name`, cycle.status === 2 && /blocking cycle exists among ORB-1, ORB-2/.test(cycle.stderr), cycle.stderr || cycle.stdout)

  const scopedTickets = [
    ticket("ORB-1", { milestone: "Orbit" }),
    ticket("ORB-2", { milestone: "Future" }),
    ticket("ORB-3", { projectItemId: null }),
  ]
  const scopeEnvironment = {
    ORBIT_MILESTONE_STUB: JSON.stringify(["Future", "Orbit"]),
    ORBIT_TICKET_STUB: JSON.stringify(scopedTickets),
  }
  const project = run(TOOL, ["--project", "Orbit"], {
    path: staged.path,
    env: scopeEnvironment,
  })
  T(
    `${TOOL}: project scope admits only open tickets in the matching milestone`,
    project.status === 0 && planOf(project)?.counts.requested === 1 && planOf(project).admitted[0]?.identifier === "ORB-1" && planOf(project).scope.kind === "project",
    project.stdout || project.stderr,
  )
  const unknownProject = run(TOOL, ["--project", "Typo"], { path: staged.path, env: scopeEnvironment })
  T(
    `${TOOL}: an unknown project is refused and names every available milestone`,
    unknownProject.status === 2 && /unknown project "Typo"/.test(unknownProject.stderr) && /Future, Orbit/.test(unknownProject.stderr) && unknownProject.stdout.trim() === "",
    `status ${unknownProject.status}: ${unknownProject.stderr || unknownProject.stdout}`,
  )
  const board = run(TOOL, ["--board"], { path: staged.path, env: scopeEnvironment })
  T(
    `${TOOL}: board scope excludes repository issues absent from the configured board`,
    board.status === 0 && planOf(board)?.counts.requested === 2 && planOf(board).admitted.every((entry) => entry.identifier !== "ORB-3"),
    board.stdout || board.stderr,
  )

  const forked = execute(
    ["ORB-1", "ORB-2", "ORB-3", "ORB-4"],
    [ticket("ORB-1"), ticket("ORB-2"), ticket("ORB-3"), ticket("ORB-4", { blockedBy: ["ORB-1", "ORB-2", "ORB-3"] })],
  )
  const forkedPlan = planOf(forked)
  T(
    `${TOOL}: independent same-repo blockers keep UNSTACKABLE_BLOCKERS_IN_QUEUE while the rest plans`,
    forked.status === 0 && forkedPlan?.admitted.length === 3 && forkedPlan.deferred[0]?.reason === "UNSTACKABLE_BLOCKERS_IN_QUEUE" && obeysWaveOrder(forkedPlan),
    forked.stdout || forked.stderr,
  )

  const chainedPair = execute(
    ["ORB-1", "ORB-2", "ORB-3"],
    [ticket("ORB-1"), ticket("ORB-2", { blockedBy: ["ORB-1"] }), ticket("ORB-3", { blockedBy: ["ORB-1", "ORB-2"] })],
  )
  const chainedPairPlan = planOf(chainedPair)
  T(
    `${TOOL}: chained blockers stack on the deepest parent and preserve transitive unlocks`,
    chainedPairPlan?.admitted[2]?.stackParent === "ORB-2" && chainedPairPlan.stacks[0]?.members.join(",") === "ORB-1,ORB-2,ORB-3" && chainedPairPlan.admitted.map((entry) => entry.unlocks).join(",") === "2,1,0",
    chainedPair.stdout || chainedPair.stderr,
  )

  const unexecutable = execute(
    ["ORB-1", "ORB-2", "ORB-3", "ORB-4"],
    [
      ticket("ORB-1", { body: "## Problem\n\nNOT REPRODUCED; needs a device." }),
      ticket("ORB-2", { body: "## Scope\n\nHUMAN-ONLY: flip the branch protection toggle." }),
      ticket("ORB-3", { body: "## Scope\n\nShip one PR per group of surfaces." }),
      ticket("ORB-4", { body: "## Technical details\n\nA codemod rewrites every icon import." }),
    ],
  )
  T(
    `${TOOL}: executability keeps NOT_REPRODUCED, NOT_CODE_WORK, and MULTI_PR meanings`,
    planOf(unexecutable)?.deferred.map((entry) => entry.reason).join(",") === "NOT_REPRODUCED,NOT_CODE_WORK,MULTI_PR" && planOf(unexecutable).admitted[0]?.identifier === "ORB-4",
    unexecutable.stdout || unexecutable.stderr,
  )

  const markdown = execute(
    ["ORB-1", "ORB-2", "ORB-3"],
    [ticket("ORB-1"), ticket("ORB-2", { blockedBy: ["ORB-1"] }), ticket("ORB-3")],
    ["--format", "markdown"],
  )
  const lineFor = (id) => markdown.stdout.split(/\r?\n/).find((line) => line.startsWith(`- ${id} `)) ?? ""
  T(
    `${TOOL}: markdown assertions stay positional for main and stacked tickets`,
    markdown.status === 0 && /opens against main/.test(lineFor("ORB-1")) && /stacks on ORB-1/.test(lineFor("ORB-2")) && /opens against main/.test(lineFor("ORB-3")),
    markdown.stdout || markdown.stderr,
  )
}
