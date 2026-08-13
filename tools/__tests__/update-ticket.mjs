import { existsSync, readFileSync } from "node:fs"

import { T, check, orcaEnv, stage } from "./_harness.mjs"

const TOOL = "update-ticket.mjs"

const LIVE_BODY = "Ticket body\n"

const issue = () => JSON.stringify({
  blockedBy: { nodes: [], totalCount: 0 },
  blocking: { nodes: [], totalCount: 0 },
  body: LIVE_BODY,
  labels: [{ name: "repo:ui" }],
  number: 221,
  state: "OPEN",
  stateReason: null,
  title: "Ticket title",
  url: "https://github.com/thomasluizon/orbit-tickets/issues/221",
})

const project = () => JSON.stringify({
  items: [{ content: { number: 221, repository: "thomasluizon/orbit-tickets", type: "Issue" }, id: "PVTI_update", status: "Todo" }],
  totalCount: 1,
})

const plan = (label) => {
  const bodyCapture = stage(`update-ticket/${label}-body.txt`, "unwritten")
  const editMarker = stage(`update-ticket/${label}-edit`, "pending")
  const statusMarker = stage(`update-ticket/${label}-status`, "must remain")
  const commentMarker = stage(`update-ticket/${label}-comment`, "must remain")
  const projectReadMarker = stage(`update-ticket/${label}-project-read`, "must remain")
  return {
    bodyCapture,
    editMarker,
    statusMarker,
    commentMarker,
    projectReadMarker,
    entries: [
      { match: "issue view 221 --repo thomasluizon/orbit-tickets", stdout: issue() },
      { match: "project item-list 2 --owner thomasluizon", stdout: project(), removePath: projectReadMarker },
      { match: "issue edit 221 --repo thomasluizon/orbit-tickets", stdout: "", ignoreTicketShape: true, stdinFile: bodyCapture, removePath: editMarker },
      { match: "issue comment 221 --repo thomasluizon/orbit-tickets", stdout: "", ignoreTicketShape: true, removePath: commentMarker },
      { match: "project item-edit 2 --owner thomasluizon", stdout: "", ignoreTicketShape: true, removePath: statusMarker },
    ],
  }
}

export const cases = () => {
  check(TOOL, "refuses a missing issue reference", ["--body-file", "-", "--confirm-replace"], { status: 2, stderr: /--issue is required/ })
  check(TOOL, "refuses a missing body file", ["--issue", "#221", "--confirm-replace"], { status: 2, stderr: /--body-file is required/ })
  check(TOOL, "refuses an unknown migrated identifier", ["--issue", "ORB-999999", "--body-file", "-", "--confirm-replace"], { status: 2, stderr: /Unknown migrated ticket ORB-999999/ })

  const replacement = stage("update-ticket/replacement.md", "Ticket body\n\n## Delivery shape\n\nShip as ONE pull request.\n")
  /**
   * The overwrite destroys every omitted section, so an unflagged call must not reach GitHub at
   * all. This is the case that keeps --confirm-replace from decaying into decoration.
   */
  check(TOOL, "refuses to replace without --confirm-replace", ["--issue", "#221", "--body-file", replacement], { status: 2, stderr: /--confirm-replace is required/ })

  const empty = stage("update-ticket/empty.md", "   \n")
  check(TOOL, "refuses an empty body", ["--issue", "#221", "--body-file", empty, "--confirm-replace"], { status: 2, stderr: /the new body is empty/ })
  check(TOOL, "refuses an unreadable body file", ["--issue", "#221", "--body-file", `${empty}.absent`, "--confirm-replace"], { status: 2, stderr: /cannot read/ })

  const replaced = plan("replaced")
  check(TOOL, "replaces the body verbatim", ["--issue", "#221", "--body-file", replacement, "--confirm-replace"], { status: 0, stdout: /"changed": true/ }, { env: orcaEnv(replaced.entries) })
  T(`${TOOL}: the edit carried the file's exact bytes`, readFileSync(replaced.bodyCapture, "utf8") === readFileSync(replacement, "utf8"), readFileSync(replaced.bodyCapture, "utf8"))
  T(`${TOOL}: replacing the body edits the issue`, !existsSync(replaced.editMarker))
  /** Replacing a work order is not a lifecycle transition and not a conversation. Either write here would be unasked. */
  T(`${TOOL}: replacing the body never comments`, existsSync(replaced.commentMarker))
  T(`${TOOL}: replacing the body never touches board Status`, existsSync(replaced.statusMarker))

  /**
   * An identical write is the retry case: a caller that re-runs after a network failure must not
   * churn the issue's edit history when nothing differs.
   */
  const identical = stage("update-ticket/identical.md", LIVE_BODY)
  const unchanged = plan("unchanged")
  check(TOOL, "reports an identical body as unchanged", ["--issue", "#221", "--body-file", identical, "--confirm-replace"], { status: 0, stdout: /"changed": false/ }, { env: orcaEnv(unchanged.entries) })
  T(`${TOOL}: an identical body performs no edit`, existsSync(unchanged.editMarker))

  /** GitHub returns CRLF for a body submitted through the browser; a file on disk here is LF. */
  const crlf = stage("update-ticket/crlf.md", LIVE_BODY.replace(/\n/g, "\r\n"))
  const lineEndings = plan("line-endings")
  check(TOOL, "treats a CRLF twin of the live body as unchanged", ["--issue", "#221", "--body-file", crlf, "--confirm-replace"], { status: 0, stdout: /"changed": false/ }, { env: orcaEnv(lineEndings.entries) })
  T(`${TOOL}: a CRLF twin performs no edit`, existsSync(lineEndings.editMarker))
}
