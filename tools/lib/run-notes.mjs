/**
 * Run notes: the comments that carry the run's working state on GitHub instead of in a scratchpad. Each note starts
 * with one marker line, so a tool can find the latest round note, review or decision of a ticket from its comments.
 * The order seal proves that tools/compose-prompt.mjs wrote a worker order and that nothing was appended after it.
 */

import { createHash } from "node:crypto"

export const RUN_RECORD_TITLE = "Orbit run record"
export const RUN_NOTE_KINDS = ["round-note", "review", "report", "decision"]

const MARKER = /^<!-- orbit-run-note: ([^>]*?) -->/
const MARKERS = /<!-- orbit-run-note: ([^>]*?) -->/g
const FULL_SHA = /^[0-9a-f]{40}$/
const COMMIT_SHA = /^[0-9a-f]{7,40}$/
/** The one definition of a review verdict line: the launcher publishes a result only when post-run-note accepts its first line. */
export const VERDICT = /^VERDICT: (?:CLEAN|DEFECTS \(([1-9]\d*)\))$/
const SEAL = /\n<!-- orbit-order: composed sha256=([0-9a-f]{64}) -->\n$/

const fieldsOf = (text) => Object.fromEntries(text.trim().split(/\s+/).filter(Boolean).map((pair) => {
  const separator = pair.indexOf("=")
  return separator < 0 ? [pair, ""] : [pair.slice(0, separator), pair.slice(separator + 1)]
}))

/** The marker fields of a comment that starts with a run note marker, or null for any other comment. */
export const parseRunNote = (body) => {
  const match = MARKER.exec(String(body ?? "").trimStart())
  return match ? fieldsOf(match[1]) : null
}

/** Every run note marker in a text, such as a composed order that quotes the ticket's comments. */
export const runNotesIn = (text) => [...String(text ?? "").matchAll(MARKERS)].map((match) => fieldsOf(match[1]))

/** The first non-empty line of a review result, when it is a verdict line. */
export const reviewVerdict = (text) => {
  const first = String(text ?? "").split("\n").map((line) => line.trim()).find((line) => line !== "") ?? ""
  return VERDICT.test(first) ? first : null
}

/**
 * The comment body for one run note, or an error naming what the note misses.
 * round-note: `round` (a positive integer) and `head` (the full SHA the round answers).
 * review: `head` (the full SHA reviewed) and a body whose first line is `VERDICT: CLEAN` or `VERDICT: DEFECTS (<n>)`.
 * report: `commits` (one or more commit SHAs). decision: nothing more.
 */
export const composeRunNote = ({ kind, round = null, head = null, commits = [], body }) => {
  if (!RUN_NOTE_KINDS.includes(kind)) throw new Error(`run note kind must be one of ${RUN_NOTE_KINDS.join(", ")}, got ${JSON.stringify(kind)}`)
  const text = String(body ?? "").replace(/\s*$/, "")
  if (text.trim() === "") throw new Error("a run note needs a body")
  if (text.includes("<!-- orbit-run-note:")) throw new Error("a run note body cannot carry another run note marker")
  const fields = { kind }
  let heading
  if (kind === "round-note") {
    if (!Number.isInteger(round) || round <= 0) throw new Error("a round note needs --round <positive integer>")
    if (!FULL_SHA.test(head ?? "")) throw new Error("a round note needs --head <the full SHA the round answers>")
    Object.assign(fields, { round, head })
    heading = `## Fix round ${round} note for head \`${head}\``
  } else if (kind === "review") {
    if (!FULL_SHA.test(head ?? "")) throw new Error("a review result needs --head <the full SHA that was reviewed>")
    const verdict = reviewVerdict(text)
    if (!verdict) throw new Error("a review result starts with VERDICT: CLEAN or VERDICT: DEFECTS (<n>)")
    Object.assign(fields, { head, verdict: verdict === "VERDICT: CLEAN" ? "clean" : `defects-${VERDICT.exec(verdict)[1]}` })
    heading = `## Review of head \`${head}\``
  } else if (kind === "report") {
    if (!Array.isArray(commits) || commits.length === 0 || commits.some((sha) => !COMMIT_SHA.test(sha))) throw new Error("a worker report needs --commits <sha,...>")
    fields.commits = commits.join(",")
    heading = `## Worker report: ${commits.map((sha) => `\`${sha}\``).join(", ")}`
  } else {
    heading = "## Decision"
  }
  const marker = `<!-- orbit-run-note: ${Object.entries(fields).map(([key, value]) => `${key}=${value}`).join(" ")} -->`
  return `${marker}\n${heading}\n\n${text}\n`
}

/** The newest comment of one kind, from comments sorted oldest first as readComments returns them. */
export const latestRunNote = (comments, kind) => {
  const note = [...comments].reverse().find((comment) => parseRunNote(comment.body)?.kind === kind)
  return note ? { ...note, note: parseRunNote(note.body) } : null
}

const digest = (text) => createHash("sha256").update(text, "utf8").digest("hex")

/** A composed order with its seal line: the SHA-256 of every byte before the seal. */
export const sealOrder = (text) => {
  const order = String(text).replace(/\s*$/, "\n")
  return `${order}\n<!-- orbit-order: composed sha256=${digest(order)} -->\n`
}

/** Why an order is not a sealed composed order, or null when it is one and nothing changed after the seal. */
export const orderSealProblem = (text) => {
  const match = SEAL.exec(text)
  if (!match) return "it carries no seal of tools/compose-prompt.mjs"
  return digest(text.slice(0, match.index)) === match[1] ? null : "its text changed after tools/compose-prompt.mjs sealed it"
}
