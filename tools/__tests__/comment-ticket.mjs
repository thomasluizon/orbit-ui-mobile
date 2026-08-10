import { existsSync, readFileSync } from "node:fs"

import { T, check, orcaEnv, stage } from "./_harness.mjs"

const TOOL = "comment-ticket.mjs"

const issue = () => JSON.stringify({
  blockedBy: { nodes: [], totalCount: 0 },
  blocking: { nodes: [], totalCount: 0 },
  body: "Ticket body",
  labels: [{ name: "repo:ui" }],
  number: 221,
  state: "OPEN",
  stateReason: null,
  title: "Ticket title",
  url: "https://github.com/thomasluizon/orbit-tickets/issues/221",
})

const project = () => JSON.stringify({
  items: [{ content: { number: 221, repository: "thomasluizon/orbit-tickets", type: "Issue" }, id: "PVTI_comment", status: "Todo" }],
  totalCount: 1,
})

const plan = (label) => {
  const bodyCapture = stage(`comment-ticket/${label}-body.txt`, "unwritten")
  const statusMarker = stage(`comment-ticket/${label}-status`, "pending")
  const projectReadMarker = stage(`comment-ticket/${label}-project-read`, "must remain")
  return {
    bodyCapture,
    statusMarker,
    projectReadMarker,
    entries: [
      { match: "issue view 221 --repo thomasluizon/orbit-tickets", stdout: issue() },
      { match: "project item-list 2 --owner thomasluizon", stdout: project(), removePath: projectReadMarker },
      { match: "issue comment 221 --repo thomasluizon/orbit-tickets", stdout: "", ignoreTicketShape: true, stdinFile: bodyCapture },
      { match: "project item-edit 2 --owner thomasluizon", stdout: "", ignoreTicketShape: true, removePath: statusMarker },
    ],
  }
}

export const cases = () => {
  check(TOOL, "refuses a missing issue reference", ["--body-file", "-"], { status: 2, stderr: /--issue is required/ })
  check(TOOL, "refuses a missing body file", ["--issue", "#221"], { status: 2, stderr: /--body-file is required/ })
  check(TOOL, "refuses an unknown migrated identifier", ["--issue", "ORB-999999", "--body-file", "-"], { status: 2, stderr: /Unknown migrated ticket ORB-999999/ })

  const empty = stage("comment-ticket/empty.md", "   \n")
  check(TOOL, "refuses an empty comment body", ["--issue", "#221", "--body-file", empty], { status: 2, stderr: /the comment body is empty/ })
  check(TOOL, "refuses an unreadable body file", ["--issue", "#221", "--body-file", `${empty}.absent`], { status: 2, stderr: /cannot read/ })

  const posted = plan("posted")
  const body = stage("comment-ticket/decisions.md", "Decisions from step 2b\n\n- Claude Design, not Pencil.\n")
  check(TOOL, "posts the comment body verbatim", ["--issue", "#221", "--body-file", body], { status: 0, stdout: /"number": 221/ }, { env: orcaEnv(posted.entries) })
  T(`${TOOL}: the comment carried the file's exact bytes`, readFileSync(posted.bodyCapture, "utf8") === readFileSync(body, "utf8"), readFileSync(posted.bodyCapture, "utf8"))
  T(`${TOOL}: commenting reads no Projects board item`, existsSync(posted.projectReadMarker))
  /** A decisions comment is not a lifecycle transition. Moving Status here would be a second, unasked write. */
  T(`${TOOL}: commenting never touches board Status`, existsSync(posted.statusMarker))
}
