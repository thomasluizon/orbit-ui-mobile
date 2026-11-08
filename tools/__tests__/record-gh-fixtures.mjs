import { readFileSync } from "node:fs"

import { check, githubIssueReadPlan, orcaEnv, root, T, TOOLS_DIR } from "./_harness.mjs"
import { join } from "node:path"

const TOOL = "record-gh-fixtures.mjs"

export const cases = () => {
  const output = join(root, "recorded-gh-fixtures.json")
  const issueWith = (stateReason) => JSON.stringify({
    blockedBy: { nodes: [], totalCount: 0 },
    blocking: { nodes: [], totalCount: 0 },
    body: "body",
    labels: [{ name: "repo:ui" }],
    number: 221,
    state: "OPEN",
    stateReason,
    title: "title",
    url: "https://github.com/thomasluizon/orbit-tickets/issues/221",
  })
  const issue = issueWith(null)
  const plan = (issueEnvelope) => orcaEnv([
    /** Before the generic prefix, and non-empty: the recorder refuses to write comment paths it never observed. */
    {
      match: "issue view 221 --repo thomasluizon/orbit-tickets --json comments",
      stdout: JSON.stringify({ comments: [{ author: { login: "thomasluizon" }, body: "a decision", createdAt: "2026-08-13T18:58:17Z" }] }),
    },
    { match: "issue view 221 --repo thomasluizon/orbit-tickets", stdout: issueEnvelope },
    { match: "issue view 2147483647 --repo thomasluizon/orbit-tickets", stdout: "", stderr: "GraphQL: issue not found", exit: 1 },
    {
      match: "api graphql -F o=thomasluizon -F r=orbit-tickets -F n=221",
      stdout: JSON.stringify({ data: { repository: { issue: {
        number: 221,
        state: "OPEN",
        projectItems: {
          pageInfo: { hasNextPage: false, endCursor: "cursor-one" },
          nodes: [{ id: "PVTI_harness_item", project: { id: "PVT_kwHOBE6dNc4Bfy2y", number: 2 }, fieldValueByName: { name: "In Review" } }],
        },
      } } } }),
      ticketEnvelope: "issueProjectItems",
    },
    ...githubIssueReadPlan(issueEnvelope),
    {
      match: "api --paginate repos/thomasluizon/orbit-tickets/issues/318/dependencies/blocked_by",
      stdout: JSON.stringify([61]),
      ticketEnvelope: "issueDependencyNumbers",
    },
    { match: "issue list --repo thomasluizon/orbit-tickets", stdout: `[${issueEnvelope}]` },
    {
      match: "project item-list 2 --owner thomasluizon",
      stdout: JSON.stringify({
        items: [
          {
            content: { number: 221, repository: "thomasluizon/orbit-tickets", type: "Issue" },
            id: "PVTI_harness_item",
            status: "In Review",
          },
        ],
        totalCount: 1,
      }),
    },
    { match: "label list --repo thomasluizon/orbit-tickets", stdout: JSON.stringify([{ name: "repo:ui" }]) },
  ])
  const result = check(TOOL, "records only read-only live command shapes", ["--output", output], { status: 0, stdout: /record-gh-fixtures: wrote/ }, {
    env: plan(issue),
  })
  if (result.status !== 0) return
  const manifest = JSON.parse(readFileSync(output, "utf8"))
  check(TOOL, "invalid output is refused before any live command", ["--output"], { status: 2 })
  T(`${TOOL}: a read-only recording emits no write envelope`, !manifest.commands.statusWrite && !manifest.commands.commentAdd)
  T(
    `${TOOL}: derives observed paths without admitting an unobserved key`,
    Boolean(manifest.commands.issueView.paths["$.blockedBy.nodes"]) && !manifest.commands.issueView.paths["$.madeUpField"],
    JSON.stringify(manifest.commands.issueView.paths),
  )
  /**
   * The comment paths the worker prompt depends on. An envelope recorded from a ticket with no
   * comments would carry `$.comments` and nothing under it, which reads as coverage and proves
   * nothing about the shape compose-prompt.mjs renders.
   */
  T(
    `${TOOL}: derives the comment paths the worker prompt renders`,
    ["body", "createdAt", "author.login"].every((path) => manifest.commands.issueViewComments.paths[`$.comments[].${path}`]),
    JSON.stringify(manifest.commands.issueViewComments?.paths),
  )
  T(
    `${TOOL}: derives the compact REST issue paths read by the adapter`,
    ["number", "html_url", "title", "body", "state", "state_reason", "labels[].name"].every(
      (path) => manifest.commands.restIssue.paths[`$.${path}`],
    ),
    JSON.stringify(manifest.commands.restIssue?.paths),
  )
  T(
    `${TOOL}: derives populated REST dependency issue numbers`,
    Boolean(manifest.commands.issueDependencyNumbers.paths["$[]"]),
    JSON.stringify(manifest.commands.issueDependencyNumbers?.paths),
  )
  T(
    `${TOOL}: derives the issue-scoped project item paths read by the adapter`,
    ["id", "project.id", "project.number", "fieldValueByName.name"].every(
      (path) => manifest.commands.issueProjectItems.paths[`$.data.repository.issue.projectItems.nodes[].${path}`],
    ) && ["hasNextPage", "endCursor"].every(
      (path) => manifest.commands.issueProjectItems.paths[`$.data.repository.issue.projectItems.pageInfo.${path}`],
    ),
    JSON.stringify(manifest.commands.issueProjectItems?.paths),
  )
  T(
    `${TOOL}: derives the populated project item paths read by the adapter`,
    ["content.type", "content.number", "content.repository", "id", "status"].every(
      (path) => manifest.commands.projectItemList.paths[`$.items[].${path}`],
    ),
    JSON.stringify(manifest.commands.projectItemList.paths),
  )

  const rerun = check(TOOL, "a re-recording unions observed types with the manifest on disk", ["--output", output], { status: 0 }, {
    env: plan(issueWith("COMPLETED")),
  })
  if (rerun.status !== 0) return
  const unioned = JSON.parse(readFileSync(output, "utf8"))
  T(
    `${TOOL}: a nullable field stays nullable across recordings`,
    JSON.stringify(unioned.commands.issueView.paths["$.stateReason"].types) === JSON.stringify(["null", "string"]),
    JSON.stringify(unioned.commands.issueView.paths["$.stateReason"]),
  )

  /**
   * Built from the committed recording. Only #2371 keeps its nodes, because the stub exits right
   * after one write and a pipe holds 64 KiB; its review body carries a real em dash.
   */
  const recording = JSON.parse(readFileSync(join(TOOLS_DIR, "__fixtures__", "gh-review-rounds.json"), "utf8"))
  const response = structuredClone(recording.response)
  for (const [alias, node] of Object.entries(response.data.repository)) {
    if (alias === "pr2371") continue
    for (const connection of ["reviews", "reviewThreads", "timelineItems"]) node[connection] = { ...node[connection], nodes: [] }
  }
  const roundsOutput = join(root, "recorded-review-rounds.json")
  const roundsPlan = (value) => orcaEnv([{ match: "query ReviewRoundsPulls(", stdout: JSON.stringify(value) }])
  const recorded = check(TOOL, "records the raw review-rounds response for the pinned pull requests", ["--review-rounds", "--output", roundsOutput], { status: 0, stdout: /record-gh-fixtures: wrote/ }, {
    env: roundsPlan(response),
  })
  if (recorded.status !== 0) return
  const roundsText = readFileSync(roundsOutput, "utf8")
  const written = JSON.parse(roundsText)
  T(`${TOOL}: the review-rounds response is written verbatim`, JSON.stringify(written.response) === JSON.stringify(response) &&
    JSON.stringify(written.generation.numbers) === JSON.stringify(recording.generation.numbers))
  T(`${TOOL}: a recorded dash is escaped so the Dash Ban passes and the value is unchanged`,
    !/[\u2013\u2014]/.test(roundsText) && written.response.data.repository.pr2371.reviews.nodes[0].body.includes("\u2014"))
  const incomplete = structuredClone(response)
  delete incomplete.data.repository.pr2338
  check(TOOL, "refuses a review-rounds response that lacks a pinned pull request", ["--review-rounds", "--output", join(root, "incomplete-review-rounds.json")], { status: 1, stderr: /2338/ }, {
    env: roundsPlan(incomplete),
  })
}
