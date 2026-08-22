import { existsSync, readFileSync } from "node:fs"

import { T, check, githubIssueReadPlan, orcaEnv, stage } from "./_harness.mjs"

const TOOL = "complete-ticket.mjs"

/** orbit-tickets#81's rollout line, the step that closed with the ticket and was never surfaced. */
const ROLLOUT_BODY = "## Rollout / kill switch\n\n* Rollout: merge, deploy to Render, then set `PostHog:ApiKey` in the Render env.\n"

const issue = (state = "OPEN", body = "Ticket body", repoLabel = "repo:ui") => JSON.stringify({
  blockedBy: { nodes: [], totalCount: 0 },
  blocking: { nodes: [], totalCount: 0 },
  body,
  labels: [{ name: repoLabel }],
  number: 221,
  state,
  stateReason: state === "OPEN" ? null : "COMPLETED",
  title: "Ticket title",
  url: "https://github.com/thomasluizon/orbit-tickets/issues/221",
})
const project = (present = true, status = "In Review") => JSON.stringify({
  data: { repository: { issue: {
    number: 221,
    state: "OPEN",
    projectItems: {
      pageInfo: { hasNextPage: false, endCursor: "cursor-one" },
      nodes: present ? [{
        id: "PVTI_complete",
        project: { id: "PVT_kwHOBE6dNc4Bfy2y", number: 2 },
        fieldValueByName: { name: status },
      }] : [],
    },
  } } },
})

/**
 * A ticket GitHub already closed from a merge commit, which is the shape --repair-status exists for:
 * the issue is CLOSED and the board column is still wherever the worker left it.
 */
const closedIssue = (stateReason = "COMPLETED") => JSON.stringify({
  blockedBy: { nodes: [], totalCount: 0 },
  blocking: { nodes: [], totalCount: 0 },
  body: "Ticket body",
  labels: [{ name: "repo:ui" }],
  number: 221,
  state: "CLOSED",
  stateReason,
  title: "Ticket title",
  url: "https://github.com/thomasluizon/orbit-tickets/issues/221",
})

const repairPlan = ({ stateReason = "COMPLETED", status = "In Review", expected = "Done" } = {}) => {
  const marker = stage(`complete-ticket/repair-${stateReason}-${status}`, "pending")
  return {
    marker,
    entries: [
      ...githubIssueReadPlan(closedIssue(stateReason)),
      { match: "api graphql -F o=thomasluizon -F r=orbit-tickets -F n=221", stdout: project(true, status), ticketEnvelope: "issueProjectItems" },
      {
        match: `project item-edit 2 --owner thomasluizon --url https://github.com/thomasluizon/orbit-tickets/issues/221 --field Status --value ${expected}`,
        stdout: "",
        ignoreTicketShape: true,
        removePath: marker,
      },
    ],
  }
}

const plan = ({ present = true, state = "OPEN", includeWrites = true, body = "Ticket body", repoLabel = "repo:ui", label = "", commentExit = 0 } = {}) => {
  const scope = `${present}-${state}-${label}`
  const statusMarker = stage(`complete-ticket/${scope}-status`, "pending")
  const closeMarker = stage(`complete-ticket/${scope}-close`, "pending")
  const commentCapture = stage(`complete-ticket/${scope}-comment.txt`, "unwritten")
  const entries = [
    ...githubIssueReadPlan(issue(state, body, repoLabel)),
    { match: "api graphql -F o=thomasluizon -F r=orbit-tickets -F n=221", stdout: project(present), ticketEnvelope: "issueProjectItems" },
    {
      match: "issue comment 221 --repo thomasluizon/orbit-tickets",
      stdout: "",
      stderr: commentExit === 0 ? "" : "comment write refused",
      exit: commentExit,
      ignoreTicketShape: true,
      stdinFile: commentCapture,
    },
  ]
  if (includeWrites) {
    entries.push(
      {
        match: "project item-edit 2 --owner thomasluizon --url https://github.com/thomasluizon/orbit-tickets/issues/221 --field Status --value Done",
        stdout: "",
        ignoreTicketShape: true,
        removePath: statusMarker,
      },
      {
        match: "issue close 221 --repo thomasluizon/orbit-tickets --reason completed",
        stdout: "",
        ignoreTicketShape: true,
        removePath: closeMarker,
      },
    )
  }
  return { entries, statusMarker, closeMarker, commentCapture }
}

export const cases = async () => {
  check(TOOL, "refuses an unknown migrated identifier", ["--issue", "ORB-999999"], { status: 2, stderr: /Unknown migrated ticket ORB-999999/ })

  const preflight = plan({ includeWrites: false })
  check(TOOL, "preflight accepts the mapped ORB identifier without writing", ["--issue", "ORB-215", "--preflight"], { status: 0, stdout: /"number": 221/ }, { env: orcaEnv(preflight.entries) })
  T(`${TOOL}: preflight made no completion write`, existsSync(preflight.statusMarker) && existsSync(preflight.closeMarker))

  const absent = plan({ present: false })
  check(TOOL, "preflight refuses a ticket absent from the configured project", ["--issue", "#221", "--preflight"], { status: 1, stderr: /absent from the configured project/ }, { env: orcaEnv(absent.entries) })
  T(`${TOOL}: a failed preflight writes nothing`, existsSync(absent.statusMarker) && existsSync(absent.closeMarker))

  const completion = plan()
  check(TOOL, "the post-merge path accepts a plain number and completes the ticket", ["--issue", "221"], { status: 0, stdout: /"number": 221/ }, { env: orcaEnv(completion.entries) })
  T(`${TOOL}: completion sets Done and closes with the completed reason`, !existsSync(completion.statusMarker) && !existsSync(completion.closeMarker))
  /** Silence is the correct output for the common case: an ordinary ticket gets no comment at all. */
  T(`${TOOL}: a ticket with no rollout section is closed without a comment`, readFileSync(completion.commentCapture, "utf8") === "unwritten")

  /**
   * The gap this whole path exists for. orbit-tickets#81 closed Done on 2026-08-08 carrying "set
   * PostHog:ApiKey in the Render env" and nothing in the merge path mentioned it. The key was in
   * fact already set, so this is a near miss; the instruction still has to reach the ticket,
   * because the ticket outlives the terminal.
   */
  const rollout = plan({ body: ROLLOUT_BODY, repoLabel: "repo:api", label: "rollout" })
  check(TOOL, "a rollout step is posted to the ticket and returned", ["--issue", "221"], { status: 0, stdout: /PostHog__ApiKey/ }, { env: orcaEnv(rollout.entries) })
  const posted = readFileSync(rollout.commentCapture, "utf8")
  T(`${TOOL}: the comment names the env var that actually binds the key`, /Key: `PostHog__ApiKey`/.test(posted), posted)
  T(`${TOOL}: the comment reached the ticket AND the ticket still completed`, !existsSync(rollout.statusMarker) && !existsSync(rollout.closeMarker))

  const preflightRollout = plan({ body: ROLLOUT_BODY, repoLabel: "repo:api", label: "preflight-rollout" })
  check(TOOL, "preflight PRINTS the manual step and posts nothing", ["--issue", "221", "--preflight"], { status: 0, stdout: /PostHog__ApiKey/ }, { env: orcaEnv(preflightRollout.entries) })
  T(`${TOOL}: preflight wrote no comment and no completion`, readFileSync(preflightRollout.commentCapture, "utf8") === "unwritten" && existsSync(preflightRollout.statusMarker))

  /**
   * Comment BEFORE close, proven by the failure path: a refused comment must abort the completion.
   * Closing first and commenting second would reintroduce the exact defect on any comment failure.
   */
  const refused = plan({ body: ROLLOUT_BODY, repoLabel: "repo:api", label: "refused", commentExit: 1 })
  check(TOOL, "a refused comment aborts the completion instead of closing silently", ["--issue", "221"], { status: 1, stderr: /complete-ticket:/ }, { env: orcaEnv(refused.entries) })
  T(`${TOOL}: the ticket was neither set Done nor closed when its step could not be recorded`, existsSync(refused.statusMarker) && existsSync(refused.closeMarker))

  /**
   * The stranded row. GitHub closes an issue itself when a merge commit names it, which leaves the
   * board column behind and makes the ordinary path refuse the ticket for being closed. Eleven rows
   * were stranded that way on 2026-08-22 with no sanctioned route to move them.
   */
  check(TOOL, "the ordinary path still refuses an already closed ticket", ["--issue", "221"], { status: 1, stderr: /is CLOSED; only an open ticket can complete after merge/ }, {
    env: orcaEnv([
      ...githubIssueReadPlan(closedIssue()),
      { match: "api graphql -F o=thomasluizon -F r=orbit-tickets -F n=221", stdout: project(true), ticketEnvelope: "issueProjectItems" },
    ]),
  })

  const repairDone = repairPlan()
  check(TOOL, "repair-status moves a completed close to Done", ["--issue", "221", "--repair-status"], { status: 0, stdout: /"status": "Done"/ }, { env: orcaEnv(repairDone.entries) })
  T(`${TOOL}: repair-status wrote the Done column`, !existsSync(repairDone.marker))

  const repairCanceled = repairPlan({ stateReason: "NOT_PLANNED", status: "Backlog", expected: "Canceled" })
  check(TOOL, "repair-status moves a not-planned close to Canceled, never Done", ["--issue", "221", "--repair-status"], { status: 0, stdout: /"status": "Canceled"/ }, { env: orcaEnv(repairCanceled.entries) })
  T(`${TOOL}: repair-status wrote the Canceled column`, !existsSync(repairCanceled.marker))

  /** Already correct is a no-op, so re-running the repair over a whole board writes nothing twice. */
  const settled = repairPlan({ status: "Done" })
  check(TOOL, "repair-status writes nothing when the column already agrees", ["--issue", "221", "--repair-status"], { status: 0, stdout: /"changed": false/ }, { env: orcaEnv(settled.entries) })
  T(`${TOOL}: repair-status left the settled row alone`, existsSync(settled.marker))

  /** An open ticket has no closed reason, so repair must refuse it rather than guess a column. */
  const openRepair = plan({ includeWrites: false, label: "open-repair" })
  check(TOOL, "repair-status refuses an open ticket", ["--issue", "221", "--repair-status"], { status: 1, stderr: /is OPEN; only a closed ticket has a Status to reconcile/ }, { env: orcaEnv(openRepair.entries) })
  T(`${TOOL}: repair-status wrote nothing for an open ticket`, existsSync(openRepair.statusMarker) && existsSync(openRepair.closeMarker))

  check(TOOL, "repair-status and preflight cannot be combined", ["--issue", "221", "--repair-status", "--preflight"], { status: 2, stderr: /different jobs/ })

  /**
   * Cancelling exists because the completion path can only say "done". Closing work that a decision
   * DELETED as completed would report it as shipped, which corrupts the only record of what shipped.
   */
  const reasonFile = stage("complete-ticket/cancel-reason.md", "Closed by D69: the whole subject was deleted.\n")
  const cancelMarkers = {
    status: stage("complete-ticket/cancel-status", "pending"),
    close: stage("complete-ticket/cancel-close", "pending"),
    comment: stage("complete-ticket/cancel-comment.txt", "unwritten"),
  }
  const cancelEntries = [
    ...githubIssueReadPlan(issue("OPEN")),
    { match: "api graphql -F o=thomasluizon -F r=orbit-tickets -F n=221", stdout: project(true), ticketEnvelope: "issueProjectItems" },
    { match: "issue comment 221 --repo thomasluizon/orbit-tickets", stdout: "", ignoreTicketShape: true, stdinFile: cancelMarkers.comment },
    {
      match: "project item-edit 2 --owner thomasluizon --url https://github.com/thomasluizon/orbit-tickets/issues/221 --field Status --value Canceled",
      stdout: "",
      ignoreTicketShape: true,
      removePath: cancelMarkers.status,
    },
    {
      match: "issue close 221 --repo thomasluizon/orbit-tickets --reason not planned",
      stdout: "",
      ignoreTicketShape: true,
      removePath: cancelMarkers.close,
    },
  ]
  check(TOOL, "cancel posts the reason, sets Canceled and closes as not planned", ["--issue", "221", "--cancel", "--reason-file", reasonFile], { status: 0, stdout: /"status": "Canceled"/ }, { env: orcaEnv(cancelEntries) })
  T(`${TOOL}: cancel wrote Canceled and closed the issue`, !existsSync(cancelMarkers.status) && !existsSync(cancelMarkers.close))
  T(`${TOOL}: the cancellation reason reached the ticket`, /D69/.test(readFileSync(cancelMarkers.comment, "utf8")))

  /** A cancellation with no reason is the state a reader cannot recover from, so the flag is required. */
  check(TOOL, "cancel refuses without a reason file", ["--issue", "221", "--cancel"], { status: 2, stderr: /--cancel requires --reason-file/ })
  const emptyReason = stage("complete-ticket/cancel-empty.md", "   \n")
  check(TOOL, "cancel refuses an empty reason", ["--issue", "221", "--cancel", "--reason-file", emptyReason], { status: 2, stderr: /reason is empty/ })
  check(TOOL, "a reason file without cancel is refused", ["--issue", "221", "--reason-file", reasonFile], { status: 2, stderr: /only valid with --cancel/ })

  const closedCancel = repairPlan()
  check(TOOL, "cancel refuses an already closed ticket", ["--issue", "221", "--cancel", "--reason-file", reasonFile], { status: 1, stderr: /is CLOSED; only an open ticket can be cancelled/ }, { env: orcaEnv(closedCancel.entries) })
  T(`${TOOL}: cancel wrote nothing to an already closed ticket`, existsSync(closedCancel.marker))
}
