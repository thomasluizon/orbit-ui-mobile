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

const plan = (present, labels = [{ name: "repo:ui" }]) => {
  const addMarker = stage(`add-ticket-to-project/${present ? "present" : "absent"}`, "pending")
  return {
    addMarker,
    entries: [
      ...githubIssueReadPlan({ ...JSON.parse(issue), labels }),
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

  const invalidRoutes = [
    { name: "no routing label", labels: ["Bug"], message: /#446.*no routing label.*found: Bug/i },
    { name: "multiple routing labels", labels: ["repo:ui", "repo:api"], message: /#446.*multiple routing labels.*repo:ui.*repo:api/i },
    { name: "an unconfigured routing label", labels: ["repo:unknown"], message: /#446.*unconfigured routing label.*repo:unknown/i },
  ]
  for (const route of invalidRoutes) {
    for (const hasCard of [false, true]) {
      const scenario = `refuses ${route.name} ${hasCard ? "with an existing card" : "before adding a card"}`
      const refused = plan(hasCard, route.labels.map((name) => ({ name })))
      check(TOOL, scenario, ["--issue", "#446"], { status: 1, stderr: route.message }, { env: orcaEnv(refused.entries) })
      T(`${TOOL}: ${scenario} makes no board write`, existsSync(refused.addMarker), "project item-add ran and removed the write marker")
    }
  }
}
