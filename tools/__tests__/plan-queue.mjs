import { T, check, orcaEnv, run } from "./_harness.mjs"

const TOOL = "plan-queue.mjs"

/**
 * Envelope shapes below are the RECORDED ones from tools/__fixtures__/orca-linear-envelopes.json:
 * _harness.mjs asserts every stubbed Linear reply against that manifest, so a field invented here
 * throws rather than passing. state.type carries Linear's own type, never a display name, because
 * that is what the tool branches on.
 */
const issueBody = (identifier, { title = `${identifier} work`, stateName = "Todo", stateType = "unstarted", labels = ["repo:ui"] } = {}) => ({
  id: `id-${identifier}`,
  identifier,
  title,
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
    independent.status === 0 && independentPlan?.waves.length === 1 && independentPlan.waves[0].length === 2 && independentPlan.stacks.length === 0,
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
    chainedPlan?.admitted.find((ticket) => ticket.identifier === "ORB-2")?.stackParent === "ORB-1" && chainedPlan.stacks[0]?.members.join(",") === "ORB-1,ORB-2",
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

  const markdown = run(TOOL, ["--tickets", "ORB-1", "--format", "markdown"], { env: orcaEnv([{ match: "linear issue ORB-1 --relations", stdout: relationsEnvelope("ORB-1", { labels: ["repo:ui", "visible-effect"] }) }]) })
  T(
    `${TOOL}: markdown names the wave and marks the visual debt`,
    markdown.status === 0 && /## Wave 1/.test(markdown.stdout) && /visual check owed/.test(markdown.stdout),
    markdown.stdout || markdown.stderr,
  )
}
