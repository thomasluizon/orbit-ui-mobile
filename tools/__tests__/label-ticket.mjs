import { existsSync } from "node:fs"

import { T, check, githubIssueReadPlan, orcaEnv, stage } from "./_harness.mjs"

const TOOL = "label-ticket.mjs"

const issue = (labels) => JSON.stringify({
  blockedBy: { nodes: [], totalCount: 0 },
  blocking: { nodes: [], totalCount: 0 },
  body: "Ticket body",
  labels: labels.map((name) => ({ name })),
  number: 221,
  state: "OPEN",
  stateReason: null,
  title: "Ticket title",
  url: "https://github.com/thomasluizon/orbit-tickets/issues/221",
})

const labelList = JSON.stringify([{ name: "repo:ui" }, { name: "Improvement" }, { name: "needs:conversation" }])

export const cases = () => {
  check(TOOL, "refuses a missing issue reference", ["--add", "needs:conversation"], { status: 2, stderr: /--issue is required/ })
  check(TOOL, "refuses a call with nothing to do", ["--issue", "#221"], { status: 2, stderr: /nothing to do/ })
  check(TOOL, "refuses a label both added and removed", ["--issue", "#221", "--add", "Bug", "--remove", "Bug"], { status: 2, stderr: /both added and removed/ })
  check(TOOL, "refuses a flag with no label name", ["--issue", "#221", "--add"], { status: 2, stderr: /--add needs a label name/ })
  check(TOOL, "refuses an unknown migrated identifier", ["--issue", "ORB-999999", "--add", "Bug"], { status: 2, stderr: /Unknown migrated ticket ORB-999999/ })

  /** Validation happens against the LIVE label list, before any write. */
  const editMarker = stage("label-ticket/edit-not-reached", "must remain")
  check(
    TOOL,
    "refuses a label the repository does not declare, before any write",
    ["--issue", "#221", "--add", "orbit-not-a-label"],
    { status: 1, stderr: /Unknown ticket label\(s\): orbit-not-a-label/ },
    {
      env: orcaEnv([
        { match: "label list --repo thomasluizon/orbit-tickets", stdout: labelList },
        { match: "issue edit 221 --repo thomasluizon/orbit-tickets", stdout: "", ignoreTicketShape: true, removePath: editMarker },
      ]),
    },
  )
  T(`${TOOL}: a refused label never reaches gh issue edit`, existsSync(editMarker))

  /**
   * The stubbed issue view already carries the target label, so stdout alone cannot prove the
   * mutation ran: deleting the editLabels write would still print the label. The removePath marker
   * is the proof of execution: only the matched `issue edit ... --add-label` command consumes it.
   */
  const addReached = stage("label-ticket/add-reached", "consumed by the edit command")
  check(
    TOOL,
    "adds a validated label and reports the resulting label set",
    ["--issue", "#221", "--add", "needs:conversation"],
    { status: 0, stdout: /"needs:conversation"/ },
    {
      env: orcaEnv([
        { match: "label list --repo thomasluizon/orbit-tickets", stdout: labelList },
        { match: "issue edit 221 --repo thomasluizon/orbit-tickets --add-label needs:conversation", stdout: "", ignoreTicketShape: true, removePath: addReached },
        ...githubIssueReadPlan(issue(["repo:ui", "Improvement", "needs:conversation"])),
      ]),
    },
  )
  T(`${TOOL}: the add mutation actually reached gh issue edit`, !existsSync(addReached))

  const removeReached = stage("label-ticket/remove-reached", "consumed by the edit command")
  check(
    TOOL,
    "removes a validated label through --remove-label",
    ["--issue", "#221", "--remove", "needs:conversation"],
    { status: 0, stdout: /"number": 221/ },
    {
      env: orcaEnv([
        { match: "label list --repo thomasluizon/orbit-tickets", stdout: labelList },
        { match: "issue edit 221 --repo thomasluizon/orbit-tickets --remove-label needs:conversation", stdout: "", ignoreTicketShape: true, removePath: removeReached },
        ...githubIssueReadPlan(issue(["repo:ui", "Improvement"])),
      ]),
    },
  )
  T(`${TOOL}: the remove mutation actually reached gh issue edit`, !existsSync(removeReached))
}
