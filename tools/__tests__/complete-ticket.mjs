import { existsSync, readFileSync } from "node:fs"

import { T, check, orcaEnv, stage } from "./_harness.mjs"

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
const project = (present = true) => JSON.stringify({
  items: present ? [{
    content: { number: 221, repository: "thomasluizon/orbit-tickets", type: "Issue" },
    id: "PVTI_complete",
    status: "In Review",
  }] : [],
  totalCount: present ? 1 : 0,
})

const plan = ({ present = true, state = "OPEN", includeWrites = true, body = "Ticket body", repoLabel = "repo:ui", label = "", commentExit = 0 } = {}) => {
  const scope = `${present}-${state}-${label}`
  const statusMarker = stage(`complete-ticket/${scope}-status`, "pending")
  const closeMarker = stage(`complete-ticket/${scope}-close`, "pending")
  const commentCapture = stage(`complete-ticket/${scope}-comment.txt`, "unwritten")
  const entries = [
    { match: "issue view 221 --repo thomasluizon/orbit-tickets", stdout: issue(state, body, repoLabel) },
    { match: "project item-list 2 --owner thomasluizon", stdout: project(present) },
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
}
