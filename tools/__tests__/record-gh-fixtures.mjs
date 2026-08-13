import { readFileSync } from "node:fs"

import { check, orcaEnv, root, T } from "./_harness.mjs"
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
    `${TOOL}: derives the populated project item paths read by the adapter`,
    ["content.type", "content.number", "content.repository", "id", "status"].every(
      (path) => manifest.commands.projectItemList.paths[`$.items[].${path}`],
    ),
    JSON.stringify(manifest.commands.projectItemList.paths),
  )

  /**
   * The drift regression: recording live on 2026-08-13 flipped `$.stateReason` from null to string
   * because the one sampled ticket had been closed, and every stub of an open ticket then failed.
   * A second recording over the same manifest must union the observed types, never replace them.
   */
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
}
