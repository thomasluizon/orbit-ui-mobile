import { existsSync } from "node:fs"

import { T, check, githubIssueReadPlan, orcaEnv, stage } from "./_harness.mjs"

const TOOL = "relate-ticket.mjs"

/**
 * `blockedBy` here only feeds githubIssueReadPlan's DEPENDENCY stub, which returns a plain array of
 * issue numbers. It is never rendered into the issue payload itself, because the fixture guard
 * rightly refuses a shape the recorded response never carried.
 */
const issue = (number, blockedBy = []) => JSON.stringify({
  blockedBy: { nodes: blockedBy.map((value) => ({ number: value })), totalCount: blockedBy.length },
  blocking: { nodes: [], totalCount: 0 },
  body: "Ticket body",
  labels: [{ name: "repo:ui" }],
  number,
  state: "OPEN",
  stateReason: null,
  title: "Ticket title",
  url: `https://github.com/thomasluizon/orbit-tickets/issues/${number}`,
})

export const cases = () => {
  check(TOOL, "refuses a missing issue reference", ["--add-blocked-by", "#221"], { status: 2, stderr: /--issue is required/ })
  check(TOOL, "refuses a call with nothing to do", ["--issue", "#221"], { status: 2, stderr: /nothing to do/ })
  check(TOOL, "refuses a flag with no reference", ["--issue", "#221", "--add-blocked-by"], { status: 2, stderr: /needs a ticket reference/ })
  check(TOOL, "refuses an unknown migrated identifier", ["--issue", "ORB-999999", "--add-blocked-by", "#221"], { status: 2, stderr: /Unknown migrated ticket ORB-999999/ })

  /**
   * The blocker is READ before the edge is written. A reference that does not exist must fail here,
   * because a wrong issue number does not error on GitHub, it lands an edge on a stranger's issue
   * (core rule 3).
   */
  const unproven = stage("relate-ticket/edit-not-reached", "must remain")
  check(
    TOOL,
    "proves the blocker exists before writing the edge",
    ["--issue", "#221", "--add-blocked-by", "#999"],
    { status: 1 },
    {
      env: orcaEnv([
        { match: "api repos/thomasluizon/orbit-tickets/issues/999 --jq", stdout: "", stderr: "issue not found", exit: 1, ignoreTicketShape: true },
        { match: "issue edit 221 --repo thomasluizon/orbit-tickets", stdout: "", ignoreTicketShape: true, removePath: unproven },
      ]),
    },
  )
  T(`${TOOL}: no edge was written when the blocker could not be read`, existsSync(unproven))

  /** A ticket that blocks itself is never a real dependency and would deadlock the queue. */
  check(
    TOOL,
    "refuses a ticket that blocks itself",
    ["--issue", "#221", "--add-blocked-by", "#221"],
    { status: 1, stderr: /cannot block itself/ },
    { env: orcaEnv([...githubIssueReadPlan(issue(221))]) },
  )

  const written = stage("relate-ticket/edit-written", "pending")
  check(
    TOOL,
    "adds a blocked-by edge to an existing ticket",
    ["--issue", "#221", "--add-blocked-by", "#345"],
    { status: 0, stdout: /"blockedBy"/ },
    {
      env: orcaEnv([
        ...githubIssueReadPlan(issue(345)),
        ...githubIssueReadPlan(issue(221)),
        {
          match: "issue edit 221 --repo thomasluizon/orbit-tickets --add-blocked-by 345",
          stdout: "",
          ignoreTicketShape: true,
          removePath: written,
        },
      ]),
    },
  )
  T(`${TOOL}: the edge reached the ticket`, !existsSync(written))

  /**
   * GitHub fails the WHOLE call on one duplicate edge, so a re-run would drop every new edge beside
   * it. An edge that already exists is therefore filtered out before the write, and a call with
   * nothing left to change writes nothing at all.
   */
  const untouched = stage("relate-ticket/edit-skipped", "must remain")
  check(
    TOOL,
    "writes nothing when the edge already exists",
    ["--issue", "#221", "--add-blocked-by", "#345"],
    { status: 0 },
    {
      env: orcaEnv([
        ...githubIssueReadPlan(issue(345)),
        ...githubIssueReadPlan(issue(221, [345])),
        { match: "issue edit 221 --repo thomasluizon/orbit-tickets", stdout: "", ignoreTicketShape: true, removePath: untouched },
      ]),
    },
  )
  T(`${TOOL}: a duplicate edge never reached gh issue edit`, existsSync(untouched))
}
