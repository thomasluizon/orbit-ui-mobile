import { existsSync, readFileSync } from "node:fs"

import { T, check, orcaEnv, same, stage } from "./_harness.mjs"

const TOOL = "mark-legacy-notes.mjs"

const comment = (id, body) => ({ id, url: `https://example.test/${id}`, body, createdAt: "2026-11-18T04:12:08Z", lastEditedAt: null, author: { login: "owner" } })
const COMMENTS = [
  comment("IC_notes", "Notes of the local review `2451-r24` (not blocking).\n\nA note."),
  comment("IC_review", "Review note of ui#2451 round 22."),
  comment("IC_launch", "## Launch 3 of the worker"),
  comment("IC_run", "<!-- orbit-run-note: kind=round-note round=1 -->\nText"),
  comment("IC_order", "# Owner order: no spinner anywhere"),
  comment("IC_later", "A note.\nReview note of ui#1."),
  comment("IC_marked", "<!-- orbit-drive:legacy -->\nNotes of the local review `1`."),
  comment("IC_launched", "<!-- orbit-drive:launch -->\n{}"),
]
const LEGACY = COMMENTS.slice(0, 4)

const page = { data: { repository: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ number: 7, title: "T", body: "B", lastEditedAt: null, labels: { nodes: [] }, blockedBy: { nodes: [] }, comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: COMMENTS } }] } } } }

/** The ticket read, then one edit for each legacy comment. The shim matches the command line only, so one sequence answers every edit. */
const plan = (label) => {
  const written = stage(`mark-legacy-notes/${label}-write`, "pending")
  const capture = stage(`mark-legacy-notes/${label}-body`, "")
  const sequence = stage(`mark-legacy-notes/${label}-sequence`, "0")
  const responseSequence = LEGACY.map(({ id }) => ({ stdout: JSON.stringify({ data: { updateIssueComment: { issueComment: { id } } } }) }))
  return {
    written,
    capture,
    env: orcaEnv([
      { match: "DriveTickets", stdout: JSON.stringify(page) },
      { match: "api graphql --input -", removePath: written, stdinFile: capture, sequenceFile: sequence, responseSequence },
    ]),
  }
}

export const cases = () => {
  const listed = LEGACY.map(({ url, body }) => `#7 ${url} ${body.split("\n")[0]}`)

  const dry = plan("dry")
  const read = check(TOOL, "a dry run lists the legacy notes", ["--dry-run"], { status: 0 }, { env: dry.env })
  same(`${TOOL}: a dry run prints each legacy note and no other comment`, read.stdout.trim().split("\n"), [...listed, "Would mark 4 comment(s)."])
  T(`${TOOL}: a dry run writes nothing`, existsSync(dry.written))

  const real = plan("real")
  const marked = check(TOOL, "a run marks each legacy note", [], { status: 0 }, { env: real.env })
  same(`${TOOL}: a run prints each comment it marks`, marked.stdout.trim().split("\n"), [...listed, "Marked 4 comment(s)."])
  const last = existsSync(real.written) ? null : JSON.parse(readFileSync(real.capture, "utf8")).variables
  same(`${TOOL}: the edit puts the legacy marker before the whole old body`, last, { id: "IC_run", body: `<!-- orbit-drive:legacy -->\n${LEGACY[3].body}` })

  check(TOOL, "an unknown option is a usage error", ["--force"], { status: 2, stderr: /unknown option: --force/ })
  check(TOOL, "a failed read exits 1", [], { status: 1, stderr: /mark-legacy-notes: gh api graphql/ }, { env: orcaEnv([{ match: "DriveTickets", exit: 1 }]) })
}
