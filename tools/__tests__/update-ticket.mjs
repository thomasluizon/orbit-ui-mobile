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
}
