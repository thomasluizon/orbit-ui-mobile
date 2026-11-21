import { existsSync, readFileSync } from "node:fs"

import { T, REPO_ROOT, check, orcaEnv, stage } from "./_harness.mjs"

const TOOL = "create-ticket.mjs"
const RECORDED = JSON.parse(readFileSync(new URL("../__fixtures__/drive-github.json", import.meta.url), "utf8"))
const ISSUE_URL = "https://github.com/thomasluizon/orbit-tickets/issues/900\n"

/** The gh calls of one creation, in order. A call that ran removes its marker file, so a marker that remains names a call that never ran. */
const createPlan = (label, { labels = RECORDED.ticketOperations.labels, boardExit = 0 } = {}) => {
  const markers = Object.fromEntries(["created", "board", "status"].map((step) => [step, stage(`create-ticket/${label}-${step}`, "pending")]))
  const bodyCapture = stage(`create-ticket/${label}-body`, "")
  return {
    markers,
    bodyCapture,
    plan: [
      { match: "label list --repo thomasluizon/orbit-tickets", stdout: JSON.stringify(labels) },
      { match: "issue create --repo thomasluizon/orbit-tickets", stdout: ISSUE_URL, removePath: markers.created, stdinFile: bodyCapture },
      { match: "DriveProjectItems", stdout: JSON.stringify(RECORDED.ticketStatus.projectItems) },
      { match: "DriveAddItem", stdout: JSON.stringify({ data: RECORDED.ticketOperations.addItem.data }), exit: boardExit, removePath: markers.board },
      { match: "DriveStatus", stdout: JSON.stringify(RECORDED.ticketStatus.update), removePath: markers.status },
    ],
  }
}

const argv = (bodyFile) => ["--title", "Repair the harness", "--body-file", bodyFile, "--label", "repo:ui", "--label", "Improvement"]

export const cases = () => {
  check(TOOL, "refuses a missing label argument", ["--title", "x", "--body-file", "-"], { status: 2, stderr: /usage: create-ticket\.mjs/ })
  check(TOOL, "refuses a missing body file", ["--title", "x", "--body-file", "missing.md", "--label", "repo:ui"], { status: 2, stderr: /body could not be read/ })

  const bodyFile = stage("create-ticket/ticket.md", "Full ticket body\n")
  const success = createPlan("success")
  const result = check(TOOL, "creates one issue and sets its board state", argv(bodyFile), { status: 0, stdout: /"number": 900[\s\S]*"status": "Todo"/ }, { env: orcaEnv(success.plan), cwd: REPO_ROOT })
  T(
    `${TOOL}: every creation write ran and the body travelled through stdin`,
    Object.values(success.markers).every((marker) => !existsSync(marker)) && readFileSync(success.bodyCapture, "utf8") === "Full ticket body\n",
    result.stderr,
  )

  const unknownLabel = createPlan("unknown-label", { labels: [{ name: "repo:ui" }] })
  check(TOOL, "an unknown label refuses before issue creation", argv(bodyFile), { status: 1, stderr: /Unknown ticket label\(s\): Improvement/ }, { env: orcaEnv(unknownLabel.plan) })
  T(`${TOOL}: the unknown-label refusal wrote nothing`, existsSync(unknownLabel.markers.created))

  const boardFailure = createPlan("board-failure", { boardExit: 1 })
  check(TOOL, "a failed board add stops the creation sequence", argv(bodyFile), { status: 1, stderr: /DriveAddItem[\s\S]* failed/ }, { env: orcaEnv(boardFailure.plan) })
  T(`${TOOL}: a failed board add writes no Status afterward`, existsSync(boardFailure.markers.status))
}
