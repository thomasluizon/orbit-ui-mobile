import { existsSync } from "node:fs"

import { check, githubIssueReadPlan, orcaEnv, stage, T } from "./_harness.mjs"

const TOOL = "add-ticket-to-project.mjs"
const issue = JSON.stringify({
  blockedBy: { nodes: [], totalCount: 0 },
  blocking: { nodes: [], totalCount: 0 },
  body: "Ticket body",
  labels: [{ name: "repo:ui" }],
  number: 446,
  state: "OPEN",
  stateReason: null,
  title: "Externally created ticket",
  url: "https://github.com/thomasluizon/orbit-tickets/issues/446",
})
const project = (present) => JSON.stringify({
  data: { repository: { issue: {
    number: 446,
    state: "OPEN",
    projectItems: {
      pageInfo: { hasNextPage: false, endCursor: "cursor-one" },
      nodes: present ? [{
        id: "PVTI_existing",
        project: { id: "PVT_kwHOBE6dNc4Bfy2y", number: 2 },
        fieldValueByName: { name: "Todo" },
      }] : [],
    },
  } } },
})

const plan = (present) => {
  const addMarker = stage(`add-ticket-to-project/${present ? "present" : "absent"}`, "pending")
  return {
    addMarker,
    entries: [
      ...githubIssueReadPlan(issue),
      { match: "api graphql -F o=thomasluizon -F r=orbit-tickets -F n=446", stdout: project(present), ticketEnvelope: "issueProjectItems" },
      {
        match: "project item-add 2 --owner thomasluizon --url https://github.com/thomasluizon/orbit-tickets/issues/446",
        stdout: "",
        ignoreTicketShape: true,
        removePath: addMarker,
      },
    ],
  }
}

export const cases = () => {
  const absent = plan(false)
  check(TOOL, "adds an externally created issue to the configured project", ["--issue", "#446"], { status: 0, stdout: /"added": true/ }, { env: orcaEnv(absent.entries) })
  T(`${TOOL}: the missing project card is added`, !existsSync(absent.addMarker))

  const present = plan(true)
  check(TOOL, "is a no-op when the issue already has a project card", ["--issue", "446"], { status: 0, stdout: /"added": false/ }, { env: orcaEnv(present.entries) })
  T(`${TOOL}: an existing project card is not added twice`, existsSync(present.addMarker))
}
