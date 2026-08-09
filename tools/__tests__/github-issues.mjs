import { existsSync, readFileSync } from "node:fs"

import { T, orcaEnv, stage } from "./_harness.mjs"
import * as githubIssues from "../lib/github-issues.mjs"

const TOOL = "lib/github-issues.mjs"
const issue = (overrides = {}) => ({
  blockedBy: { nodes: [], totalCount: 0 },
  blocking: { nodes: [], totalCount: 0 },
  body: "Ticket body",
  labels: [{ name: "repo:ui" }, { name: "harness" }],
  number: 221,
  state: "OPEN",
  stateReason: null,
  title: "Ticket title",
  url: "https://github.com/thomasluizon/orbit-tickets/issues/221",
  ...overrides,
})
const projectItem = {
  content: {
    number: 221,
    repository: "thomasluizon/orbit-tickets",
    type: "Issue",
  },
  id: "PVTI_harness_item",
  status: "In Review",
}
const populatedProjectItems = JSON.stringify({ items: [projectItem], totalCount: 1 })
const emptyProjectItems = JSON.stringify({ items: [], totalCount: 0 })
const environmentFor = (ticketOutput = JSON.stringify(issue()), projectOutput = populatedProjectItems) =>
  orcaEnv([
    { match: "issue view 221 --repo thomasluizon/orbit-tickets", stdout: ticketOutput },
    { match: "project item-list 2 --owner thomasluizon", stdout: projectOutput },
  ])

const messageOf = async (call) => {
  try {
    await call()
    return null
  } catch (error) {
    return error.message
  }
}

export const cases = async () => {
  T(
    `${TOOL}: exports only the ticket adapter surface`,
    Object.keys(githubIssues).sort().join(",") ===
      "addComment,assertRepositoryLabel,listMilestones,listTickets,readTicket,resolveTicket,setStatus",
    Object.keys(githubIssues).sort().join(","),
  )

  const migrated = githubIssues.resolveTicket("orb-215")
  T(`${TOOL}: resolves a migrated ORB identifier only through the recorded map`, migrated.number === 221 && migrated.identifier === "ORB-215", JSON.stringify(migrated))
  T(`${TOOL}: resolves a raw migrated issue number back to its identifier`, githubIssues.resolveTicket("#221").identifier === "ORB-215")
  T(`${TOOL}: leaves a post-migration raw issue without an invented identifier`, githubIssues.resolveTicket(9999).identifier === null)
  T(
    `${TOOL}: refuses an ORB identifier absent from the migration map`,
    /Unknown migrated ticket ORB-999999/.test(await messageOf(() => githubIssues.resolveTicket("ORB-999999")) ?? ""),
  )
  T(
    `${TOOL}: the fixture guard refuses a response key absent from the recording`,
    /asserts unrecorded key \$\.madeUpField/.test(
      (await messageOf(() => orcaEnv([{ match: "issue view 221", stdout: JSON.stringify(issue({ madeUpField: true })) }]))) ?? "",
    ),
  )
  T(
    `${TOOL}: the fixture guard refuses a type the recording did not observe`,
    /asserts type string at \$\.number; recorded types: number/.test(
      (await messageOf(() => orcaEnv([{ match: "issue view 221", stdout: JSON.stringify(issue({ number: "221" })) }]))) ?? "",
    ),
  )
  T(
    `${TOOL}: the fixture guard refuses an issue state outside the GitHub enum`,
    /asserts unsupported enum at \$\.state: "MERGED"/.test(
      (await messageOf(() => orcaEnv([{ match: "issue view 221", stdout: JSON.stringify(issue({ state: "MERGED" })) }]))) ?? "",
    ),
  )

  const previousGh = process.env.GH_BIN
  const previousNodeOptions = process.env.NODE_OPTIONS
  const previousStub = process.env.ORBIT_ORCA_STUB
  const applyEnvironment = (environment) => {
    process.env.GH_BIN = environment.GH_BIN
    process.env.NODE_OPTIONS = environment.NODE_OPTIONS
    process.env.ORBIT_ORCA_STUB = environment.ORBIT_ORCA_STUB
  }
  const restoreEnvironment = () => {
    for (const [name, value] of [
      ["GH_BIN", previousGh],
      ["NODE_OPTIONS", previousNodeOptions],
      ["ORBIT_ORCA_STUB", previousStub],
    ]) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }

  try {
    applyEnvironment(environmentFor())
    const read = await githubIssues.readTicket(221)
    T(
      `${TOOL}: readTicket returns the exact normalized shape`,
      Object.keys(read).join(",") ===
        "number,url,title,body,state,stateReason,labels,blockedBy,blocking,status,projectItemId,identifier",
      JSON.stringify(read),
    )
    T(
      `${TOOL}: readTicket strips label metadata and normalizes relation connections`,
      JSON.stringify(read.labels) === JSON.stringify([{ name: "repo:ui" }, { name: "harness" }]) &&
        Array.isArray(read.blockedBy) &&
        read.blockedBy.length === 0 &&
        Array.isArray(read.blocking),
      JSON.stringify(read),
    )
    T(
      `${TOOL}: a populated board item supplies the recorded status and project item id`,
      read.status === "In Review" && read.projectItemId === "PVTI_harness_item",
      JSON.stringify(read),
    )

    applyEnvironment(environmentFor(JSON.stringify(issue()), emptyProjectItems))
    const absent = await githubIssues.readTicket(221)
    T(
      `${TOOL}: a ticket absent from the configured board has null project fields`,
      absent.status === null && absent.projectItemId === null,
      JSON.stringify(absent),
    )

    applyEnvironment(
      orcaEnv([
        {
          match: "api repos/thomasluizon/orbit-tickets/milestones?state=all&per_page=100 --paginate --jq .[].title",
          stdout: "Future\nHarness Context and Calibration\n",
        },
      ]),
    )
    const milestones = await githubIssues.listMilestones()
    T(
      `${TOOL}: listMilestones returns every title from the verified paginated read`,
      milestones.join(",") === "Future,Harness Context and Calibration",
      JSON.stringify(milestones),
    )

    applyEnvironment(
      orcaEnv([
        {
          match: "issue list --repo thomasluizon/orbit-tickets --state all --limit 1000 --json number,url,title,body,state,stateReason,labels,blockedBy,blocking --label repo:ui --label harness --milestone Harness Context and Calibration",
          stdout: JSON.stringify([issue()]),
        },
        { match: "project item-list 2 --owner thomasluizon", stdout: populatedProjectItems },
      ]),
    )
    const listed = await githubIssues.listTickets({ labels: ["repo:ui", "harness"], state: "all", milestone: "Harness Context and Calibration" })
    T(`${TOOL}: listTickets normalizes each issue and preserves the mapped identifier`, listed.length === 1 && listed[0].identifier === "ORB-215", JSON.stringify(listed))
    T(
      `${TOOL}: listTickets refuses an empty milestone before invoking GitHub`,
      /must be null or a non-empty string/.test(await messageOf(() => githubIssues.listTickets({ milestone: "" })) ?? ""),
    )

    const statusMarker = stage("github-issues/status-write", "must be removed")
    applyEnvironment(
      orcaEnv([
        {
          match: "project item-edit 2 --owner thomasluizon --url https://github.com/thomasluizon/orbit-tickets/issues/221 --field Status --value In Review",
          stdout: "",
          // A write whose caller branches only on the exit code. Declared, not assumed: the fixture
          // recorder is read-only, so no real success object for this command was ever recorded.
          ignoreTicketShape: true,
          removePath: statusMarker,
        },
      ]),
    )
    await githubIssues.setStatus(221, "In Review")
    T(`${TOOL}: setStatus writes the configured board field`, !existsSync(statusMarker))
    T(
      `${TOOL}: setStatus refuses Done before starting a child`,
      /never targets Done before merge/.test(await messageOf(() => githubIssues.setStatus(221, "Done")) ?? ""),
    )
    T(
      `${TOOL}: setStatus refuses a status absent from the recorded options`,
      /Unknown ticket status/.test(await messageOf(() => githubIssues.setStatus(221, "Shipped")) ?? ""),
    )

    const commentMarker = stage("github-issues/comment-write", "must be removed")
    const commentBody = stage("github-issues/comment-body", "")
    applyEnvironment(
      orcaEnv([
        {
          match: "issue comment 221 --repo thomasluizon/orbit-tickets --body-file -",
          stdout: "",
          // Exit-code-only write, declared explicitly. See the note on the setStatus stub above.
          ignoreTicketShape: true,
          removePath: commentMarker,
          stdinFile: commentBody,
        },
      ]),
    )
    await githubIssues.addComment(221, "Ready for review")
    T(
      `${TOOL}: addComment posts the exact body through stdin and depends only on the exit code`,
      !existsSync(commentMarker) && readFileSync(commentBody, "utf8") === "Ready for review",
    )

    applyEnvironment(
      orcaEnv([
        { match: "issue view 221 --repo thomasluizon/orbit-tickets", stdout: "", stderr: "GraphQL: issue not found", exit: 1 },
        { match: "project item-list 2 --owner thomasluizon", stdout: populatedProjectItems },
      ]),
    )
    T(
      `${TOOL}: a failed GitHub issue read is reported rather than normalized`,
      /failed: GraphQL: issue not found/.test(await messageOf(() => githubIssues.readTicket(221)) ?? ""),
    )
  } finally {
    restoreEnvironment()
  }

  const valid = { labels: [{ name: "repo:ui" }, { name: "harness" }] }
  T(`${TOOL}: the repository assertion accepts exactly one matching repo label`, githubIssues.assertRepositoryLabel(valid, "ui") === valid)
  for (const [label, ticket, pattern] of [
    ["missing", { labels: [{ name: "harness" }] }, /no repo:\* label/],
    ["wrong", { labels: [{ name: "repo:api" }] }, /expected exactly repo:ui/],
    ["ambiguous", { labels: [{ name: "repo:ui" }, { name: "repo:api" }] }, /repo:ui and repo:api/],
  ]) {
    T(
      `${TOOL}: the repository assertion refuses the ${label} repository label case`,
      pattern.test(await messageOf(() => githubIssues.assertRepositoryLabel(ticket, "ui")) ?? ""),
    )
  }

  /**
   * THE fixture guard, tested on itself.
   *
   * The guard exists so nobody can invent a field and then write the mock that agrees with the
   * invention. When it was first ported from the Linear version it only validated the five READ
   * commands it had recorded envelopes for, and returned quietly for everything else. That let
   * `issue close`, `issue edit`, `issue create` and `project item-add`, which are exactly the
   * ticket mutations, carry any output shape a stub felt like claiming.
   *
   * These cases fail if that hole is ever reopened. A guard nobody tests is a guard that silently
   * stops guarding.
   */
  const rejects = (plan) => {
    try {
      orcaEnv(plan)
      return null
    } catch (error) {
      return error.message
    }
  }
  T(
    `${TOOL}: the fixture guard refuses a recorded read that asserts an unrecorded key`,
    /asserts unrecorded key/.test(rejects([{ match: "issue view 700 --repo r --json number", stdout: JSON.stringify({ inventedField: 1 }) }]) ?? ""),
  )
  for (const write of ["issue close 700 --repo r", "issue edit 700 --add-blocked-by 3", "issue create --title x", "project item-add 2 --owner o"]) {
    T(
      `${TOOL}: the fixture guard refuses an undeclared ticket write (${write.split(" ").slice(0, 2).join(" ")})`,
      /has no recorded invocation envelope/.test(rejects([{ match: write, stdout: JSON.stringify({ inventedField: 1 }) }]) ?? ""),
    )
  }
  T(
    `${TOOL}: the exit-code-only escape is accepted when it is declared and its output is empty`,
    rejects([{ match: "issue close 700 --repo r", stdout: "", ignoreTicketShape: true }]) === null,
  )
  T(
    `${TOOL}: the escape cannot smuggle an invented success object through a non-empty output`,
    /has no recorded invocation envelope/.test(rejects([{ match: "issue close 700 --repo r", stdout: '{"inventedField":1}', ignoreTicketShape: true }]) ?? ""),
  )
  T(
    `${TOOL}: a command that is not a ticket command is left alone, so the pull request stubs keep working`,
    rejects([{ match: "pr list --head some-branch", stdout: "[]" }]) === null,
  )
}
