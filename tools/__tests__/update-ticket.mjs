import { existsSync, readFileSync } from "node:fs"

import { T, check, orcaEnv, same, stage } from "./_harness.mjs"

const TOOL = "update-ticket.mjs"
const COMMENTS = "api repos/thomasluizon/orbit-tickets/issues/7/comments --method POST --input -"

/** One comment write. The call removes its marker file, so a marker that remains names a write that never ran. */
const writePlan = (label, { exit = 0 } = {}) => {
  const marker = stage(`update-ticket/${label}-write`, "pending")
  const capture = stage(`update-ticket/${label}-body`, "")
  return { marker, capture, env: orcaEnv([{ match: COMMENTS, exit, removePath: marker, stdinFile: capture }]) }
}

export const cases = () => {
  const note = stage("update-ticket/note.md", "Use the second label.\n\nThen run the tests.\n")
  const args = (flag, file = note) => ["note", flag, "--ticket", "7", "--body-file", file]

  for (const [flag, marker] of [["--decision", "<!-- orbit-decision -->"], ["--owner", "<!-- orbit-owner -->"]]) {
    const plan = writePlan(flag.slice(2))
    check(TOOL, `note ${flag} writes one comment on the ticket`, args(flag), { status: 0, stdout: new RegExp(`"note": "${flag.slice(2)}"`) }, { env: plan.env })
    same(`${TOOL}: note ${flag} puts its marker on the first line and keeps the text`, existsSync(plan.marker) ? null : JSON.parse(readFileSync(plan.capture, "utf8")).body, `${marker}\nUse the second label.\n\nThen run the tests.\n`)
  }

  const stdin = writePlan("stdin")
  check(TOOL, "reads the note from stdin", args("--decision", "-"), { status: 0 }, { env: stdin.env, input: "From stdin." })
  same(`${TOOL}: the stdin note keeps its text`, existsSync(stdin.marker) ? null : JSON.parse(readFileSync(stdin.capture, "utf8")).body, "<!-- orbit-decision -->\nFrom stdin.\n")

  const refused = writePlan("refused")
  const refusals = [
    ["refuses a note with no mode", ["note", "--ticket", "7", "--body-file", note], /exactly one of --owner and --decision/],
    ["refuses both modes", [...args("--owner"), "--decision"], /exactly one of --owner and --decision/],
    ["refuses an unknown command", ["close", "--ticket", "7"], /usage: update-ticket\.mjs/],
    ["refuses an unknown flag", [...args("--owner"), "--force"], /usage: update-ticket\.mjs/],
    ["refuses a missing ticket", ["note", "--owner", "--body-file", note], /--ticket exactly once/],
    ["refuses a ticket that is no number", ["note", "--owner", "--ticket", "#7", "--body-file", note], /takes a ticket number/],
    ["refuses a missing body file", args("--owner", "missing.md"), /body could not be read/],
    ["refuses an empty note", args("--owner", stage("update-ticket/empty.md", " \n")), /the note is empty/],
    ["refuses a note that brings its own marker", args("--decision", stage("update-ticket/marked.md", "<!-- orbit-decision -->\nText")), /the tool adds it/],
  ]
  for (const [name, argv, stderr] of refusals) check(TOOL, name, argv, { status: 2, stderr }, { env: refused.env })
  T(`${TOOL}: a refusal writes nothing`, existsSync(refused.marker))

  const failed = writePlan("failed", { exit: 1 })
  check(TOOL, "a failed GitHub write exits 1", args("--decision"), { status: 1, stderr: /update-ticket: gh api/ }, { env: failed.env })

  writeCases()
}

const BUG = ["Bug"]
const SOUND = "Class: Clipped label\n\n## Permanent fix\n\neslint-rules/label-fit.cjs\n"
const comment = (id, body, createdAt = "2026-11-20T00:00:00Z") => ({ id, url: `https://example.test/c/${id}`, body, createdAt, author: { login: "thomasluizon" } })
const ticketOf = ({ body = "Problem", labels = [], comments = [] }) => JSON.stringify({ data: { repository: { issue: { number: 7, title: "T", body, state: "OPEN", createdAt: "2026-11-01T00:00:00Z", labels: { nodes: labels.map((name) => ({ name })) }, comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: comments } } } } })

/** The gh calls of one body or part write. A call that ran removes its marker file, so a marker that remains names a write that never ran. */
const ticketPlan = (label, ticket, { write }) => {
  const marker = stage(`update-ticket/${label}-write`, "pending")
  const capture = stage(`update-ticket/${label}-input`, "")
  return {
    marker,
    capture,
    wrote: () => !existsSync(marker),
    input: () => readFileSync(capture, "utf8"),
    env: orcaEnv([
      { match: "query DriveTicket(", stdout: ticketOf(ticket) },
      { match: "issue list --repo thomasluizon/orbit-tickets", stdout: "[]" },
      { match: write.match, stdout: write.stdout ?? "", removePath: marker, stdinFile: capture },
    ]),
  }
}

const BODY_WRITE = { match: "issue edit 7 --repo thomasluizon/orbit-tickets --body-file -" }
const EDIT_WRITE = (id) => ({ match: "api graphql --input -", stdout: JSON.stringify({ data: { updateIssueComment: { issueComment: { id } } } }) })
const PART_5 = "## Part 5 of 15: Old title\n\nOld work"

const writeCases = () => {
  const body = (name, text) => stage(`update-ticket/${name}.md`, text)
  const bodyArgs = (file, ...extra) => ["body", "--ticket", "7", "--body-file", file, ...extra]
  const partArgs = (part, file) => ["part", "--ticket", "7", "--part", String(part), "--body-file", file]

  const added = ticketPlan("body-added", { body: SOUND, labels: BUG }, { write: BODY_WRITE })
  check(TOOL, "a body write that adds a problem is refused", bodyArgs(body("no-class", "Problem\n\n## Permanent fix\n\neslint-rules/x.cjs\n"), "--confirm-replace"), { status: 1, stderr: /ticket check refuses the write[\s\S]*Class: <name>/ }, { env: added.env })
  T(`${TOOL}: the refused body write made no GitHub write`, !added.wrote())

  const older = ticketPlan("body-older", { body: "Problem", labels: BUG }, { write: BODY_WRITE })
  check(TOOL, "a body write that keeps an older problem is accepted", bodyArgs(body("older", "Problem, reworded"), "--confirm-replace"), { status: 0, stdout: /"mode": "body"/ }, { env: older.env })
  same(`${TOOL}: the accepted body write sent the new body on stdin`, older.wrote() ? older.input() : null, "Problem, reworded")

  const repair = ticketPlan("body-repair", { body: "Problem", labels: BUG }, { write: BODY_WRITE })
  check(TOOL, "a body write can repair an older problem", bodyArgs(body("repair", SOUND), "--confirm-replace"), { status: 0 }, { env: repair.env })
  T(`${TOOL}: the repairing body write ran`, repair.wrote())

  const unconfirmed = ticketPlan("body-unconfirmed", { body: SOUND, labels: BUG }, { write: BODY_WRITE })
  check(TOOL, "a body write with no --confirm-replace exits 2", bodyArgs(body("unconfirmed", SOUND)), { status: 2, stderr: /--confirm-replace is required/ }, { env: unconfirmed.env })
  T(`${TOOL}: the body write with no confirmation made no GitHub write`, !unconfirmed.wrote())

  const replace = ticketPlan("part-replace", { comments: [comment("C1", "Owner note"), comment("C5", PART_5)] }, { write: EDIT_WRITE("C5") })
  check(TOOL, "a part write replaces the live part comment through editComment", partArgs(5, body("part-new", "## Part 5 of 15: New title\n\nNew work")), { status: 0, stdout: /"part": 5[\s\S]*"added": false/ }, { env: replace.env })
  const sent = replace.wrote() ? JSON.parse(replace.input()) : null
  same(`${TOOL}: the part write edits the comment by its node id with the new text`, [sent?.variables.id, sent?.variables.body], ["C5", "## Part 5 of 15: New title\n\nNew work\n"])

  const adds = ticketPlan("part-add", { comments: [comment("C1", "## Part 1 of 15: First\n\nWork")] }, { write: { match: COMMENTS } })
  check(TOOL, "a part write adds a comment when the ticket has no such part", partArgs(2, body("part-two", "## Part 2 of 15: Second\n\nWork")), { status: 0, stdout: /"part": 2[\s\S]*"added": true/ }, { env: adds.env })
  same(`${TOOL}: the added part comment holds the text`, adds.wrote() ? JSON.parse(adds.input()).body : null, "## Part 2 of 15: Second\n\nWork\n")

  const renumber = ticketPlan("part-renumber", { comments: [comment("C5", PART_5)] }, { write: EDIT_WRITE("C5") })
  check(TOOL, "a part write that changes the number of a part is refused", partArgs(5, body("part-six", "## Part 6 of 15: Other\n\nWork")), { status: 1, stderr: /changes the number of part 5/ }, { env: renumber.env })
  T(`${TOOL}: the refused renumber made no GitHub write`, !renumber.wrote())

  const twice = ticketPlan("part-twice", { comments: [comment("C4", PART_5, "2026-11-20T00:00:00Z"), comment("C5", PART_5, "2026-11-21T00:00:00Z")] }, { write: EDIT_WRITE("C5") })
  check(TOOL, "a part write refuses a part with two live comments", partArgs(5, body("part-again", PART_5)), { status: 1, stderr: /Part 5 has two live comments/ }, { env: twice.env })
  T(`${TOOL}: the refused part with two comments made no GitHub write`, !twice.wrote())

  const usage = ticketPlan("usage", { comments: [] }, { write: BODY_WRITE })
  const usageRefusals = [
    ["refuses a part text with no part heading", partArgs(2, body("no-heading", "Work")), /must start with/],
    ["refuses a new part whose heading names another number", partArgs(3, body("other-number", "## Part 2 of 15: Second")), /does not match the heading of part 2/],
    ["refuses a part with no --part", ["part", "--ticket", "7", "--body-file", body("x", "Work")], /--part exactly once/],
    ["refuses a part that is no number", partArgs("two", body("y", "Work")), /--part takes a part number/],
    ["refuses --owner with body", bodyArgs(body("z", "Work"), "--confirm-replace", "--owner"), /belong to note/],
    ["refuses an empty body", bodyArgs(body("empty", " \n"), "--confirm-replace"), /the body is empty/],
  ]
  for (const [name, argv, stderr] of usageRefusals) check(TOOL, name, argv, { status: 2, stderr }, { env: usage.env })
  T(`${TOOL}: the usage refusals of body and part made no GitHub write`, !usage.wrote())
}
