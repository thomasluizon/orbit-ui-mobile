/**
 * The one-time move of a run's working state from one computer to GitHub (thomasluizon/orbit-tickets#2152): the intake
 * marks of the local run record go to the intake file, and each live scratchpad note goes to its ticket, its pull
 * request or the run record issue. A dry run reads and validates everything and writes nothing.
 */

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

import { withoutMailContent } from "./auto-work-intake.mjs"
import { INTAKE_FILE, readRunJson, updateRunJson } from "./run-files.mjs"
import { composeRunNote, RUN_RECORD_TITLE } from "./run-notes.mjs"

export const MANIFEST_KINDS = ["round-note", "review", "report", "decision", "body", "reply"]
const MIGRATION_FILE = "run-state/migration.json"

/** A manifest item that is invalid: the caller exits 2 for it, and 1 for every other failure (a GitHub read or write). */
export class ManifestError extends Error {}
const THREAD = /^PRRT_[A-Za-z0-9_-]+$/

const mergeSource = (remote, local) => {
  if (remote === undefined) return local
  if (local === undefined) return remote
  const completed = { ...local.completed, ...remote.completed }
  const pending = Object.fromEntries(Object.entries({ ...local.pending, ...remote.pending }).filter(([id]) => !completed[id]))
  return { ...local, ...remote, completed, pending, highWater: remote.highWater ?? local.highWater ?? null }
}

/**
 * The intake file after the local marks join it. A mark already on GitHub wins, a completed item never returns to
 * pending, and the waiter's seen keys stay as GitHub has them when it has any. A pending Gmail message joins as its marks
 * only: the intake file never holds mail content.
 */
export const mergeIntake = (remote, local) => {
  const merged = { ...remote }
  for (const [source, marks] of Object.entries(withoutMailContent(local) ?? {})) {
    merged[source] = source === "wake" ? remote?.wake ?? marks : mergeSource(remote?.[source], marks)
  }
  return merged
}

const positive = (value, label) => {
  if (!Number.isInteger(value) || value <= 0) throw new ManifestError(`${label} must be a positive integer`)
  return value
}

/** One manifest item checked and turned into the write it stands for; an invalid item throws before any write. */
export const planItem = (item, { readText = (path) => readFileSync(path, "utf8") } = {}) => {
  if (!MANIFEST_KINDS.includes(item?.kind)) throw new ManifestError(`manifest kind must be one of ${MANIFEST_KINDS.join(", ")}, got ${JSON.stringify(item?.kind)}`)
  if (typeof item.file !== "string" || item.file === "") throw new ManifestError(`a ${item.kind} item needs its file`)
  let text
  try { text = readText(item.file) } catch (error) { throw new ManifestError(`${item.file} cannot be read: ${error.message}`, { cause: error }) }
  if (text.trim() === "") throw new ManifestError(`${item.file} is empty`)
  if (item.kind === "body" || item.kind === "reply") {
    if (typeof item.repo !== "string" || item.repo === "") throw new ManifestError(`a ${item.kind} item needs its repo key`)
    positive(item.pr, `${item.file} pr`)
    if (item.kind === "reply" && !THREAD.test(item.thread ?? "")) throw new ManifestError(`${item.file} needs the review thread id (PRRT_...)`)
    return { ...item, target: item.kind === "body" ? `${item.repo}#${item.pr} body` : `${item.repo}#${item.pr} thread ${item.thread}`, text }
  }
  if (item.runRecord === true && item.kind !== "decision") throw new ManifestError(`${item.file}: only a decision goes to the run record issue`)
  if (item.runRecord !== true) positive(item.issue, `${item.file} issue`)
  let note
  try { note = composeRunNote({ kind: item.kind, round: item.round ?? null, head: item.head ?? null, commits: item.commits ?? [], pullfrogThreads: item.pullfrogThreads ?? 0, body: text }) } catch (error) {
    throw new ManifestError(`${item.file}: ${error.message}`, { cause: error })
  }
  return { ...item, target: item.runRecord === true ? RUN_RECORD_TITLE : `#${item.issue}`, text: note }
}

/** The identity of one planned write: its kind, its target and its exact text, so a rerun finds what an earlier run posted. */
const itemKey = ({ kind, target, text }) => createHash("sha256").update(`${kind}\0${target}\0${text}`).digest("hex").slice(0, 16)

/**
 * The whole migration. `actions` carries every GitHub write and the run record lookup, so a test drives the real
 * order of operations: every item is validated first, then the run record is found or created, then the intake
 * marks merge, then each item posts. `apply` false returns the plan and writes nothing. Each posted item is recorded in
 * `${MIGRATION_FILE}` right after it posts, so a rerun after a failure midway posts only the items that did not post.
 */
export const migrateRunState = async ({ localIntake, manifest = [], apply = false, actions, store, readText }) => {
  const items = manifest.map((item) => planItem(item, { readText }))
  const remote = readRunJson(INTAKE_FILE, store).value ?? {}
  const merged = mergeIntake(remote, localIntake ?? {})
  const intakeChanges = JSON.stringify(merged) !== JSON.stringify(remote)
  const record = await actions.findRunRecord(RUN_RECORD_TITLE)
  const done = readRunJson(MIGRATION_FILE, store).value?.posted ?? {}
  const plan = { apply, runRecord: record ? `#${record.number}` : "create", intake: { sources: Object.keys(localIntake ?? {}), changes: intakeChanges },
    items: items.map((item) => ({ kind: item.kind, target: item.target, file: item.file, alreadyPosted: itemKey(item) in done })) }
  if (!apply) return plan
  const runRecord = record ?? await actions.createRunRecord(RUN_RECORD_TITLE,
    "Run-wide decisions and the owner questions that no ticket owns, one decision run note per comment (node tools/post-run-note.mjs --kind decision --run-record). This issue stays closed so no open-ticket count includes it.\n")
  if (intakeChanges) updateRunJson(INTAKE_FILE, (current) => mergeIntake(current ?? {}, localIntake ?? {}), "intake: migrate the local run record marks", store)
  const posted = []
  for (const item of items) {
    const key = itemKey(item)
    if (key in done) continue
    if (item.kind === "body") await actions.editPullBody(item.repo, item.pr, item.text)
    else if (item.kind === "reply") await actions.replyThread(item.repo, item.pr, item.thread, item.text)
    else await actions.postComment(item.runRecord === true ? runRecord.number : item.issue, item.text)
    updateRunJson(MIGRATION_FILE, (current) => ({ ...current, posted: { ...current?.posted, [key]: { kind: item.kind, target: item.target } } }), `migration: posted ${item.kind} ${item.target}`, store)
    posted.push({ kind: item.kind, target: item.target, file: item.file })
  }
  return { ...plan, runRecord: `#${runRecord.number}`, posted }
}
