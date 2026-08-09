import { existsSync } from "node:fs"

import { T, check, orcaEnv, stage } from "./_harness.mjs"

const TOOL = "complete-ticket.mjs"
const issue = (state = "OPEN") => JSON.stringify({
  blockedBy: { nodes: [], totalCount: 0 },
  blocking: { nodes: [], totalCount: 0 },
  body: "Ticket body",
  labels: [{ name: "repo:ui" }],
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

const plan = ({ present = true, state = "OPEN", includeWrites = true } = {}) => {
  const statusMarker = stage(`complete-ticket/${present}-${state}-status`, "pending")
  const closeMarker = stage(`complete-ticket/${present}-${state}-close`, "pending")
  const entries = [
    { match: "issue view 221 --repo thomasluizon/orbit-tickets", stdout: issue(state) },
    { match: "project item-list 2 --owner thomasluizon", stdout: project(present) },
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
  return { entries, statusMarker, closeMarker }
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
}
