import { T, check, orcaEnv, run } from "./_harness.mjs"

const TOOL = "plan-queue.mjs"

/**
 * Envelope shapes below are the RECORDED ones from tools/__fixtures__/orca-linear-envelopes.json:
 * _harness.mjs asserts every stubbed Linear reply against that manifest, so a field invented here
 * throws rather than passing. state.type carries Linear's own type, never a display name, because
 * that is what the tool branches on.
 */
const issueBody = (identifier, { title = `${identifier} work`, stateName = "Todo", stateType = "unstarted", labels = ["repo:ui"], description = "## Scope\n\n- Do the work" } = {}) => ({
  id: `id-${identifier}`,
  identifier,
  title,
  description,
  url: `https://linear.app/useorbitai/issue/${identifier.toLowerCase()}`,
  state: { id: `state-${stateType}`, name: stateName, type: stateType, color: "#000000" },
  labels: labels.map((name) => ({ id: `label-${name}`, name, color: "#111111" })),
})

const relationsEnvelope = (identifier, options = {}, blockedBy = []) =>
  JSON.stringify({
    id: `envelope-${identifier}`,
    ok: true,
    result: {
      issue: issueBody(identifier, options),
      relations: blockedBy.map((blocker) => ({
        id: `relation-${identifier}-${blocker}`,
        type: "blocks",
        direction: "inbound",
        relationship: "blockedBy",
        relatedIssue: { id: `id-${blocker}`, identifier: blocker, title: `${blocker} work`, url: `https://linear.app/useorbitai/issue/${blocker.toLowerCase()}` },
      })),
    },
  })

const issueEnvelope = (identifier, options = {}) => JSON.stringify({ id: `envelope-${identifier}`, ok: true, result: { issue: issueBody(identifier, options) } })

const listEnvelope = (issues) =>
  JSON.stringify({
    id: "envelope-list",
    ok: true,
    result: {
      issues: issues.map(([identifier, options]) => issueBody(identifier, options)),
      meta: { hasMore: false, limit: 250, orderBy: "updatedAt", partial: false, returned: issues.length, workspaceErrors: [] },
    },
  })

const planOf = (result) => {
  try {
    return JSON.parse(result.stdout)
  } catch {
    return null
  }
}

const obeysWaveOrder = (plan) => {
  const admitted = new Map(plan.admitted.map((ticket) => [ticket.identifier, ticket]))
  return plan.admitted.every((ticket) => ticket.blockedBy.every((blocker) => !admitted.has(blocker) || admitted.get(blocker).wave < ticket.wave))
}

export const cases = () => {
  check(TOOL, "refuses no scope at all", [], { status: 2, stderr: /one of --tickets, --project or --board is required/ })
  check(TOOL, "refuses two scopes at once", ["--tickets", "ORB-1", "--board"], { status: 2, stderr: /mutually exclusive/ })
  check(TOOL, "refuses an unknown format", ["--tickets", "ORB-1", "--format", "yaml"], { status: 2, stderr: /--format must be json or markdown/ })
  check(TOOL, "refuses a non-numeric limit", ["--board", "--limit", "many"], { status: 2, stderr: /--limit must be a positive integer/ })
  check(TOOL, "refuses a malformed identifier before calling orca", ["--tickets", "not-a-ticket"], { status: 2, stderr: /not a Linear identifier/ })

  /** Two independent tickets: one wave, no stack, and nothing invented about their relationship. */
  const independent = run(TOOL, ["--tickets", "ORB-1,ORB-2"], {
    env: orcaEnv([
      { match: "linear issue ORB-1 --relations", stdout: relationsEnvelope("ORB-1") },
      { match: "linear issue ORB-2 --relations", stdout: relationsEnvelope("ORB-2", { labels: ["repo:api"] }) },
    ]),
  })
  const independentPlan = planOf(independent)
  T(
    `${TOOL}: two unrelated tickets share one wave and form no stack`,
    independent.status === 0 &&
      independentPlan?.waves.length === 1 &&
      independentPlan.waves[0].length === 2 &&
      independentPlan.stacks.length === 0 &&
      independentPlan.admitted.every((ticket) => ticket.branchMode === "main"),
    independent.stdout || independent.stderr,
  )

  /** A blocker inside the queue is an ordering edge AND a stack edge, because the branch can carry it. */
  const chained = run(TOOL, ["--tickets", "ORB-1,ORB-2"], {
    env: orcaEnv([
      { match: "linear issue ORB-1 --relations", stdout: relationsEnvelope("ORB-1") },
      { match: "linear issue ORB-2 --relations", stdout: relationsEnvelope("ORB-2", {}, ["ORB-1"]) },
    ]),
  })
  const chainedPlan = planOf(chained)
  T(
    `${TOOL}: a blocker inside the queue orders the waves`,
    chained.status === 0 && chainedPlan?.waves.length === 2 && chainedPlan.waves[0][0] === "ORB-1" && chainedPlan.waves[1][0] === "ORB-2",
    chained.stdout || chained.stderr,
  )
  T(
    `${TOOL}: a same-repo blocker inside the queue becomes a stack parent`,
    chainedPlan?.admitted.find((ticket) => ticket.identifier === "ORB-2")?.stackParent === "ORB-1" &&
      chainedPlan.admitted.find((ticket) => ticket.identifier === "ORB-2")?.branchMode === "stacked" &&
      chainedPlan.stacks[0]?.members.join(",") === "ORB-1,ORB-2",
    chained.stdout,
  )

  /**
   * THE case this tool exists for. A blocker outside the queue that is still open cannot be
   * stacked on and cannot be assumed merged, so the ticket is refused rather than planned onto
   * a branch that would not contain its dependency.
   */
  const blockedOutside = run(TOOL, ["--tickets", "ORB-2"], {
    env: orcaEnv([
      { match: "linear issue ORB-2 --relations", stdout: relationsEnvelope("ORB-2", {}, ["ORB-1"]) },
      { match: "linear issue ORB-1 --json", stdout: issueEnvelope("ORB-1") },
    ]),
  })
  const blockedPlan = planOf(blockedOutside)
  T(
    `${TOOL}: an open blocker outside the queue defers the ticket rather than planning it`,
    blockedOutside.status === 0 && blockedPlan?.counts.admitted === 0 && blockedPlan.deferred[0]?.reason === "BLOCKED_OUTSIDE_QUEUE",
    blockedOutside.stdout || blockedOutside.stderr,
  )

  /** The same edge with the blocker already Done is not a bar at all: the work exists on main. */
  const blockerDone = run(TOOL, ["--tickets", "ORB-2"], {
    env: orcaEnv([
      { match: "linear issue ORB-2 --relations", stdout: relationsEnvelope("ORB-2", {}, ["ORB-1"]) },
      { match: "linear issue ORB-1 --json", stdout: issueEnvelope("ORB-1", { stateName: "Done", stateType: "completed" }) },
    ]),
  })
  T(`${TOOL}: a CLOSED blocker outside the queue is not a bar`, planOf(blockerDone)?.counts.admitted === 1, blockerDone.stdout || blockerDone.stderr)

  /**
   * A dropped ticket can strand a second one behind it, so admission runs to a fixed point. A
   * single pass would admit ORB-3 and plan a branch on a parent that is not in the queue.
   */
  const cascade = run(TOOL, ["--tickets", "ORB-2,ORB-3"], {
    env: orcaEnv([
      { match: "linear issue ORB-2 --relations", stdout: relationsEnvelope("ORB-2", {}, ["ORB-1"]) },
      { match: "linear issue ORB-3 --relations", stdout: relationsEnvelope("ORB-3", {}, ["ORB-2"]) },
      { match: "linear issue ORB-1 --json", stdout: issueEnvelope("ORB-1") },
    ]),
  })
  const cascadePlan = planOf(cascade)
  T(
    `${TOOL}: dropping a blocked ticket also drops what it blocks, to a fixed point`,
    cascadePlan?.counts.admitted === 0 && cascadePlan.deferred.length === 2 && cascadePlan.deferred.every((entry) => entry.reason === "BLOCKED_OUTSIDE_QUEUE"),
    cascade.stdout || cascade.stderr,
  )

  /** Cross-repo dependencies order the run but can never stack: GitHub requires one repository. */
  const crossRepo = run(TOOL, ["--tickets", "ORB-1,ORB-2"], {
    env: orcaEnv([
      { match: "linear issue ORB-1 --relations", stdout: relationsEnvelope("ORB-1", { labels: ["repo:api"] }) },
      { match: "linear issue ORB-2 --relations", stdout: relationsEnvelope("ORB-2", { labels: ["repo:ui"] }, ["ORB-1"]) },
    ]),
  })
  const crossPlan = planOf(crossRepo)
  T(
    `${TOOL}: a cross-repo blocker orders the waves but never becomes a stack parent`,
    crossPlan?.waves.length === 2 && crossPlan.admitted.find((ticket) => ticket.identifier === "ORB-2")?.stackParent === null && crossPlan.stacks.length === 0,
    crossRepo.stdout || crossRepo.stderr,
  )

  const noRepo = run(TOOL, ["--tickets", "ORB-1"], { env: orcaEnv([{ match: "linear issue ORB-1 --relations", stdout: relationsEnvelope("ORB-1", { labels: ["Improvement"] }) }]) })
  T(`${TOOL}: a ticket with no repo:* label is deferred, never guessed at`, planOf(noRepo)?.deferred[0]?.reason === "NO_REPO_LABEL", noRepo.stdout || noRepo.stderr)

  const twoRepos = run(TOOL, ["--tickets", "ORB-1"], { env: orcaEnv([{ match: "linear issue ORB-1 --relations", stdout: relationsEnvelope("ORB-1", { labels: ["repo:ui", "repo:api"] }) }]) })
  T(`${TOOL}: a ticket carrying two repo:* labels is deferred as ambiguous`, planOf(twoRepos)?.deferred[0]?.reason === "AMBIGUOUS_REPO", twoRepos.stdout || twoRepos.stderr)

  /** visible-effect is reported so the run can withhold In Review, and is NEVER a bar to admission. */
  const visual = run(TOOL, ["--tickets", "ORB-1"], { env: orcaEnv([{ match: "linear issue ORB-1 --relations", stdout: relationsEnvelope("ORB-1", { labels: ["repo:ui", "visible-effect"] }) }]) })
  const visualPlan = planOf(visual)
  T(
    `${TOOL}: a visible-effect ticket is admitted and flagged, not skipped`,
    visualPlan?.counts.admitted === 1 && visualPlan.admitted[0].visibleEffect === true,
    visual.stdout || visual.stderr,
  )

  const closed = run(TOOL, ["--tickets", "ORB-1"], { env: orcaEnv([{ match: "linear issue ORB-1 --relations", stdout: relationsEnvelope("ORB-1", { stateName: "Done", stateType: "completed" }) }]) })
  T(`${TOOL}: an already-closed ticket in the scope is deferred as CLOSED`, planOf(closed)?.deferred[0]?.reason === "CLOSED", closed.stdout || closed.stderr)

  /** Linear permits a blocking cycle. No order satisfies one, so this refuses instead of picking. */
  const cycle = run(TOOL, ["--tickets", "ORB-1,ORB-2"], {
    env: orcaEnv([
      { match: "linear issue ORB-1 --relations", stdout: relationsEnvelope("ORB-1", {}, ["ORB-2"]) },
      { match: "linear issue ORB-2 --relations", stdout: relationsEnvelope("ORB-2", {}, ["ORB-1"]) },
    ]),
  })
  T(`${TOOL}: a blocking cycle is refused by name rather than ordered arbitrarily`, cycle.status === 2 && /blocking cycle exists among ORB-1, ORB-2/.test(cycle.stderr), `exit ${cycle.status}: ${cycle.stderr || cycle.stdout}`)

  /** --project reads the board and drops closed tickets before any per-ticket call is made. */
  const project = run(TOOL, ["--project", "Harness Context and Calibration"], {
    env: orcaEnv([
      { match: "linear list-issues", stdout: listEnvelope([["ORB-1", {}], ["ORB-9", { stateName: "Done", stateType: "completed" }]]) },
      { match: "linear issue ORB-1 --relations", stdout: relationsEnvelope("ORB-1") },
    ]),
  })
  const projectPlan = planOf(project)
  T(
    `${TOOL}: --project admits the open ticket and never fetches the closed one`,
    project.status === 0 && projectPlan?.counts.requested === 1 && projectPlan.counts.admitted === 1 && projectPlan.scope.kind === "project",
    project.stdout || project.stderr,
  )

  const empty = run(TOOL, ["--board"], { env: orcaEnv([{ match: "linear list-issues", stdout: listEnvelope([]) }]) })
  T(`${TOOL}: a scope resolving to zero tickets exits 1 rather than printing an empty plan`, empty.status === 1 && /zero tickets/.test(empty.stderr), `exit ${empty.status}: ${empty.stderr || empty.stdout}`)

  const refused = run(TOOL, ["--tickets", "ORB-1"], { env: orcaEnv([{ match: "linear issue ORB-1 --relations", stdout: JSON.stringify({ id: "e", ok: false, error: { code: "not_found", message: "no such issue" } }), exit: 1, allowNonJsonLinear: false }]) })
  T(`${TOOL}: an orca refusal is an environment error, never an empty plan`, refused.status === 2 && /refused: no such issue/.test(refused.stderr), `exit ${refused.status}: ${refused.stderr || refused.stdout}`)

  /**
   * A same-repo diamond cannot stack, and cannot run either. Every blocker counted here is open and
   * in THIS queue, because a blocker whose work already merged is Done and was deferred as CLOSED
   * before it could become a candidate. So none of them can merge while the queue runs, no branch
   * can carry their work, and the ticket defers instead of opening against a main that lacks it.
   *
   * The rest of the board still plans, which is the whole difference from the exit-2 refusal this
   * replaced: one unrunnable ticket costs itself, never the other four pull requests of the night.
   */
  const forked = run(TOOL, ["--tickets", "ORB-1,ORB-2,ORB-3,ORB-4"], {
    env: orcaEnv([
      { match: "linear issue ORB-1 --relations", stdout: relationsEnvelope("ORB-1") },
      { match: "linear issue ORB-2 --relations", stdout: relationsEnvelope("ORB-2") },
      { match: "linear issue ORB-3 --relations", stdout: relationsEnvelope("ORB-3") },
      { match: "linear issue ORB-4 --relations", stdout: relationsEnvelope("ORB-4", {}, ["ORB-1", "ORB-2", "ORB-3"]) },
    ]),
  })
  const forkedPlan = planOf(forked)
  T(
    `${TOOL}: independent same-repo blockers defer the ticket while the rest of the queue still plans`,
    forked.status === 0 &&
      forkedPlan?.admitted.map((ticket) => ticket.identifier).join(",") === "ORB-1,ORB-2,ORB-3" &&
      forkedPlan.deferred.find((entry) => entry.identifier === "ORB-4")?.reason === "UNSTACKABLE_BLOCKERS_IN_QUEUE" &&
      obeysWaveOrder(forkedPlan),
    `exit ${forked.status}: ${forked.stderr || forked.stdout}`,
  )
  T(
    `${TOOL}: the deferral names the blockers, so the morning report says which ticket to merge first`,
    /ORB-1, ORB-2, ORB-3/.test(forkedPlan?.deferred.find((entry) => entry.identifier === "ORB-4")?.detail ?? ""),
    JSON.stringify(forkedPlan?.deferred),
  )

  /** The same two blockers CHAINED are representable, and the child stacks on the deeper one. */
  const chainedPair = run(TOOL, ["--tickets", "ORB-1,ORB-2,ORB-3"], {
    env: orcaEnv([
      { match: "linear issue ORB-1 --relations", stdout: relationsEnvelope("ORB-1") },
      { match: "linear issue ORB-2 --relations", stdout: relationsEnvelope("ORB-2", {}, ["ORB-1"]) },
      { match: "linear issue ORB-3 --relations", stdout: relationsEnvelope("ORB-3", {}, ["ORB-1", "ORB-2"]) },
    ]),
  })
  const chainedPairPlan = planOf(chainedPair)
  T(
    `${TOOL}: blockers that DO form a chain stack the child on the deepest one`,
    chainedPair.status === 0 && chainedPairPlan?.admitted.find((ticket) => ticket.identifier === "ORB-3")?.stackParent === "ORB-2" && chainedPairPlan.stacks[0]?.members.join(",") === "ORB-1,ORB-2,ORB-3",
    chainedPair.stdout || chainedPair.stderr,
  )
  T(
    `${TOOL}: unlocks reports transitive fan-out over the admitted graph`,
    chainedPairPlan?.admitted.map((ticket) => [ticket.identifier, ticket.unlocks]).join("|") === "ORB-1,2|ORB-2,1|ORB-3,0",
    chainedPair.stdout || chainedPair.stderr,
  )

  /** Two same-repo blockers where one is cross-repo is not a fork: only same-repo ones can stack. */
  const mixedParents = run(TOOL, ["--tickets", "ORB-1,ORB-2,ORB-3"], {
    env: orcaEnv([
      { match: "linear issue ORB-1 --relations", stdout: relationsEnvelope("ORB-1", { labels: ["repo:api"] }) },
      { match: "linear issue ORB-2 --relations", stdout: relationsEnvelope("ORB-2") },
      { match: "linear issue ORB-3 --relations", stdout: relationsEnvelope("ORB-3", {}, ["ORB-1", "ORB-2"]) },
    ]),
  })
  T(
    `${TOOL}: one same-repo blocker plus one cross-repo blocker is representable, not a fork`,
    mixedParents.status === 0 && planOf(mixedParents)?.admitted.find((ticket) => ticket.identifier === "ORB-3")?.stackParent === "ORB-2",
    mixedParents.stdout || mixedParents.stderr,
  )

  /** ORB-49's mixed diamond: five same-repo blockers and two cross-repo blockers. */
  const wideMixed = run(TOOL, ["--tickets", "ORB-10,ORB-11,ORB-12,ORB-13,ORB-14,ORB-15,ORB-16,ORB-49"], {
    env: orcaEnv([
      ...["ORB-10", "ORB-11", "ORB-12", "ORB-13", "ORB-14"].map((id) => ({ match: `linear issue ${id} --relations`, stdout: relationsEnvelope(id) })),
      ...["ORB-15", "ORB-16"].map((id) => ({ match: `linear issue ${id} --relations`, stdout: relationsEnvelope(id, { labels: ["repo:api"] }) })),
      { match: "linear issue ORB-49 --relations", stdout: relationsEnvelope("ORB-49", {}, ["ORB-10", "ORB-11", "ORB-12", "ORB-13", "ORB-14", "ORB-15", "ORB-16"]) },
    ]),
  })
  const wideMixedPlan = planOf(wideMixed)
  T(
    `${TOOL}: five same-repo and two cross-repo blockers defer the child, and the seven blockers still run`,
    wideMixed.status === 0 &&
      wideMixedPlan?.admitted.length === 7 &&
      wideMixedPlan.deferred.find((entry) => entry.identifier === "ORB-49")?.reason === "UNSTACKABLE_BLOCKERS_IN_QUEUE" &&
      obeysWaveOrder(wideMixedPlan),
    wideMixed.stdout || wideMixed.stderr,
  )
  T(
    `${TOOL}: only the same-repo blockers are named, because a cross-repo one was never stackable`,
    !/ORB-15|ORB-16/.test(wideMixedPlan?.deferred.find((entry) => entry.identifier === "ORB-49")?.detail ?? "ORB-15"),
    JSON.stringify(wideMixedPlan?.deferred),
  )

  /**
   * Both render arms, each asserted against the LINE of a ticket that must carry it.
   *
   * A document-wide regex was the original defect: `/opens against main/` passed on a fixture whose
   * only ticket had no blockers, so the arm it was written for was never rendered and breaking it
   * left the suite green. A suffix is only proven when it is bound to the ticket that earns it.
   */
  /**
   * The executability pass. Measured on the Onda 1 queue, 2026-08-06: 71 admitted, 0 deferred, and
   * ELEVEN of them not executable by a headless agent at all, each burning a worker slot or a
   * scope-gate cycle one at a time during the night. Naming them in the plan costs nothing and puts
   * every one of them in front of Thomas before he goes to bed.
   */
  const unexecutable = run(TOOL, ["--tickets", "ORB-1,ORB-2,ORB-3,ORB-4"], {
    env: orcaEnv([
      { match: "linear issue ORB-1 --relations", stdout: relationsEnvelope("ORB-1", { description: "## Problem\n\nNOT REPRODUCED; needs a device." }) },
      { match: "linear issue ORB-2 --relations", stdout: relationsEnvelope("ORB-2", { description: "## Scope\n\nHUMAN-ONLY: flip the branch protection toggle." }) },
      { match: "linear issue ORB-3 --relations", stdout: relationsEnvelope("ORB-3", { description: "## Scope\n\nShip one PR per group of surfaces." }) },
      { match: "linear issue ORB-4 --relations", stdout: relationsEnvelope("ORB-4", { description: "## Technical details\n\nA codemod rewrites every icon import." }) },
    ]),
  })
  const unexecutablePlan = planOf(unexecutable)
  T(
    `${TOOL}: a ticket no headless agent can execute is deferred by name, not admitted and failed at 03:00`,
    unexecutable.status === 0 &&
      unexecutablePlan?.counts.admitted === 1 &&
      unexecutablePlan.deferred.map((entry) => entry.reason).join(",") === "NOT_REPRODUCED,NOT_CODE_WORK,MULTI_PR" &&
      unexecutablePlan.admitted[0].identifier === "ORB-4",
    unexecutable.stdout || unexecutable.stderr,
  )

  const large = run(TOOL, ["--tickets", "ORB-5"], {
    env: orcaEnv([{ match: "linear issue ORB-5 --relations", stdout: relationsEnvelope("ORB-5", { description: `## Affected modules / files\n\n${Array.from({ length: 30 }, (unused, index) => `- apps/web/file-${index}.ts`).join("\n")}\n\n## Scope\n\n- Apply one coherent codemod.` }) }]),
  })
  const largePlan = planOf(large)
  T(
    `${TOOL}: a large coherent ticket is admitted without an override or size warning`,
    largePlan?.counts.admitted === 1 && largePlan.admitted[0].warnings.length === 0,
    large.stdout || large.stderr,
  )

  const markdown = run(TOOL, ["--tickets", "ORB-1,ORB-2,ORB-3", "--format", "markdown"], {
    env: orcaEnv([
      { match: "linear issue ORB-1 --relations", stdout: relationsEnvelope("ORB-1") },
      { match: "linear issue ORB-2 --relations", stdout: relationsEnvelope("ORB-2", { labels: ["repo:ui", "visible-effect"] }, ["ORB-1"]) },
      { match: "linear issue ORB-3 --relations", stdout: relationsEnvelope("ORB-3") },
    ]),
  })
  const lineFor = (id) => (markdown.stdout.split(/\r?\n/).find((line) => line.startsWith(`- ${id} `)) ?? "")
  T(
    `${TOOL}: markdown binds "opens against main" to a blocker-free ticket's own line`,
    markdown.status === 0 && /\(opens against main\)/.test(lineFor("ORB-1")) && /\(opens against main\)/.test(lineFor("ORB-3")),
    markdown.stdout || markdown.stderr,
  )
  T(
    `${TOOL}: markdown binds the stack suffix and the visual debt to the stacked ticket's own line`,
    /\(stacks on ORB-1\)/.test(lineFor("ORB-2")) && /visual check owed/.test(lineFor("ORB-2")) && !/visual check owed/.test(lineFor("ORB-1")),
    markdown.stdout || markdown.stderr,
  )
}
