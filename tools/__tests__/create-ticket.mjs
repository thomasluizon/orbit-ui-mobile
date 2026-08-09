import { existsSync, readFileSync } from "node:fs"

import { T, check, orcaEnv, stage } from "./_harness.mjs"

const TOOL = "create-ticket.mjs"
const LABELS = JSON.stringify([{ name: "repo:ui" }, { name: "Improvement" }])
const BLOCKER = JSON.stringify({
  blockedBy: { nodes: [], totalCount: 0 },
  blocking: { nodes: [], totalCount: 0 },
  body: "Blocker body",
  labels: [{ name: "repo:ui" }],
  number: 221,
  state: "OPEN",
  stateReason: null,
  title: "Existing blocker",
  url: "https://github.com/thomasluizon/orbit-tickets/issues/221",
})
const EMPTY_PROJECT = JSON.stringify({ items: [], totalCount: 0 })

const readPlan = ({ labels = LABELS, milestones = "Harness Context and Calibration\n", blocker = BLOCKER } = {}) => [
  { match: "label list --repo thomasluizon/orbit-tickets --limit 1000 --json name", stdout: labels },
  { match: "api repos/thomasluizon/orbit-tickets/milestones?state=all&per_page=100", stdout: milestones },
  { match: "issue view 221 --repo thomasluizon/orbit-tickets", stdout: blocker },
  { match: "project item-list 2 --owner thomasluizon", stdout: EMPTY_PROJECT },
]

const createPlan = (label, overrides = {}) => {
  const createdMarker = stage(`create-ticket/${label}-created`, "pending")
  const boardMarker = stage(`create-ticket/${label}-board`, "pending")
  const statusMarker = stage(`create-ticket/${label}-status`, "pending")
  const relationMarker = stage(`create-ticket/${label}-relation`, "pending")
  const bodyCapture = stage(`create-ticket/${label}-body`, "")
  return {
    markers: { createdMarker, boardMarker, statusMarker, relationMarker, bodyCapture },
    plan: [
      ...readPlan(overrides),
      {
        match: "issue create --repo thomasluizon/orbit-tickets",
        stdout: overrides.createdOutput ?? "https://github.com/thomasluizon/orbit-tickets/issues/900\n",
        verifiedTicketOutput: "issueCreateUrl",
        removePath: createdMarker,
        stdinFile: bodyCapture,
      },
      {
        match: "project item-add 2 --owner thomasluizon --url https://github.com/thomasluizon/orbit-tickets/issues/900",
        stdout: "",
        exit: overrides.boardExit ?? 0,
        ignoreTicketShape: true,
        removePath: boardMarker,
      },
      {
        match: "project item-edit 2 --owner thomasluizon --url https://github.com/thomasluizon/orbit-tickets/issues/900 --field Status --value Todo",
        stdout: "",
        exit: overrides.statusExit ?? 0,
        ignoreTicketShape: true,
        removePath: statusMarker,
      },
      {
        match: "issue edit 900 --repo thomasluizon/orbit-tickets --add-blocked-by 221",
        stdout: "",
        exit: overrides.relationExit ?? 0,
        ignoreTicketShape: true,
        removePath: relationMarker,
      },
    ],
  }
}

const argv = (bodyFile) => [
  "--title", "Repair the harness",
  "--body-file", bodyFile,
  "--label", "repo:ui",
  "--label", "Improvement",
  "--milestone", "Harness Context and Calibration",
  "--blocked-by", "ORB-215",
]

export const cases = async () => {
  check(TOOL, "refuses a missing label argument", ["--title", "x", "--body-file", "-"], { status: 2, stderr: /usage: create-ticket\.mjs/ })
  check(TOOL, "refuses a missing body file", ["--title", "x", "--body-file", "missing.md", "--label", "repo:ui"], { status: 2, stderr: /body could not be read/ })

  const bodyFile = stage("create-ticket/ticket.md", "Full ticket body\n")
  const success = createPlan("success")
  const result = check(
    TOOL,
    "creates one issue, configures its board state, and writes its resolved blockers",
    argv(bodyFile),
    { status: 0, stdout: /"number": 900[\s\S]*"milestone": "Harness Context and Calibration"[\s\S]*"status": "Todo"/ },
    { env: orcaEnv(success.plan) },
  )
  T(
    `${TOOL}: every successful creation write ran and the body travelled through stdin`,
    !existsSync(success.markers.createdMarker) &&
      !existsSync(success.markers.boardMarker) &&
      !existsSync(success.markers.statusMarker) &&
      !existsSync(success.markers.relationMarker) &&
      readFileSync(success.markers.bodyCapture, "utf8") === "Full ticket body\n",
    result.stderr,
  )

  const missingLabel = createPlan("missing-label", { labels: JSON.stringify([{ name: "repo:ui" }]) })
  check(TOOL, "an unknown label refuses before issue creation", argv(bodyFile), { status: 1, stderr: /Unknown ticket label\(s\): Improvement/ }, { env: orcaEnv(missingLabel.plan) })
  T(`${TOOL}: the missing-label refusal wrote nothing`, existsSync(missingLabel.markers.createdMarker))

  const missingMilestone = createPlan("missing-milestone", { milestones: "Launch\n" })
  check(TOOL, "an unknown milestone refuses before issue creation", argv(bodyFile), { status: 1, stderr: /create it as a separate explicit action first/ }, { env: orcaEnv(missingMilestone.plan) })
  T(`${TOOL}: the missing-milestone refusal wrote nothing`, existsSync(missingMilestone.markers.createdMarker))

  const unknownBlocker = createPlan("unknown-blocker")
  const unknownBlockerArgv = argv(bodyFile)
  unknownBlockerArgv[unknownBlockerArgv.length - 1] = "ORB-999999"
  check(TOOL, "an unmapped blocker refuses before issue creation", unknownBlockerArgv, { status: 1, stderr: /Unknown migrated ticket ORB-999999/ }, { env: orcaEnv(unknownBlocker.plan) })
  T(`${TOOL}: the unknown-blocker refusal wrote nothing`, existsSync(unknownBlocker.markers.createdMarker))

  const boardFailure = createPlan("board-failure", { boardExit: 1 })
  check(TOOL, "a failed board add stops the creation sequence", argv(bodyFile), { status: 1, stderr: /project item-add .* failed/ }, { env: orcaEnv(boardFailure.plan) })
  T(
    `${TOOL}: a failed board add writes no status or relation afterward`,
    existsSync(boardFailure.markers.statusMarker) && existsSync(boardFailure.markers.relationMarker),
  )

  const statusFailure = createPlan("status-failure", { statusExit: 1 })
  check(TOOL, "a failed Status write stops before relations", argv(bodyFile), { status: 1, stderr: /project item-edit .* failed/ }, { env: orcaEnv(statusFailure.plan) })
  T(`${TOOL}: a failed Status write leaves the relation untouched`, existsSync(statusFailure.markers.relationMarker))
}
