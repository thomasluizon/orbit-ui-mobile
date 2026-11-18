/**
 * The one-time move of a run's working state from one computer to GitHub (thomasluizon/orbit-tickets#2152): the intake
 * marks of the local run record go to the intake file, and each live scratchpad note goes to its ticket, its pull
 * request or the run record issue. A dry run reads and validates everything and writes nothing.
 */

import { readFileSync } from "node:fs"

import { INTAKE_FILE, readRunJson, updateRunJson } from "./run-files.mjs"
import { composeRunNote, RUN_RECORD_TITLE } from "./run-notes.mjs"

export const MANIFEST_KINDS = ["round-note", "review", "report", "decision", "body", "reply"]
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
 * pending, and the waiter's seen keys stay as GitHub has them when it has any.
 */
export const mergeIntake = (remote, local) => {
  const merged = { ...remote }
  for (const [source, marks] of Object.entries(local ?? {})) {
    merged[source] = source === "wake" ? remote?.wake ?? marks : mergeSource(remote?.[source], marks)
  }
  return merged
}

const positive = (value, label) => {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`)
  return value
}

/** One manifest item checked and turned into the write it stands for; an invalid item throws before any write. */
export const planItem = (item, { readText = (path) => readFileSync(path, "utf8") } = {}) => {
  if (!MANIFEST_KINDS.includes(item?.kind)) throw new Error(`manifest kind must be one of ${MANIFEST_KINDS.join(", ")}, got ${JSON.stringify(item?.kind)}`)
  if (typeof item.file !== "string" || item.file === "") throw new Error(`a ${item.kind} item needs its file`)
  const text = readText(item.file)
  if (text.trim() === "") throw new Error(`${item.file} is empty`)
  if (item.kind === "body" || item.kind === "reply") {
    if (typeof item.repo !== "string" || item.repo === "") throw new Error(`a ${item.kind} item needs its repo key`)
    positive(item.pr, `${item.file} pr`)
    if (item.kind === "reply" && !THREAD.test(item.thread ?? "")) throw new Error(`${item.file} needs the review thread id (PRRT_...)`)
    return { ...item, target: item.kind === "body" ? `${item.repo}#${item.pr} body` : `${item.repo}#${item.pr} thread ${item.thread}`, text }
  }
  if (item.runRecord === true && item.kind !== "decision") throw new Error(`${item.file}: only a decision goes to the run record issue`)
  if (item.runRecord !== true) positive(item.issue, `${item.file} issue`)
  const note = composeRunNote({ kind: item.kind, round: item.round ?? null, head: item.head ?? null, commits: item.commits ?? [], body: text })
  return { ...item, target: item.runRecord === true ? RUN_RECORD_TITLE : `#${item.issue}`, text: note }
}

/**
 * The whole migration. `actions` carries every GitHub write and the run record lookup, so a test drives the real
 * order of operations: every item is validated first, then the run record is found or created, then the intake
 * marks merge, then each item posts. `apply` false returns the plan and writes nothing.
 */
export const migrateRunState = async ({ localIntake, manifest = [], apply = false, actions, store, readText }) => {
  const items = manifest.map((item) => planItem(item, { readText }))
  const remote = readRunJson(INTAKE_FILE, store).value ?? {}
  const merged = mergeIntake(remote, localIntake ?? {})
  const intakeChanges = JSON.stringify(merged) !== JSON.stringify(remote)
  const record = await actions.findRunRecord(RUN_RECORD_TITLE)
  const plan = { apply, runRecord: record ? `#${record.number}` : "create", intake: { sources: Object.keys(localIntake ?? {}), changes: intakeChanges },
    items: items.map(({ kind, target, file }) => ({ kind, target, file })) }
  if (!apply) return plan
  const runRecord = record ?? await actions.createRunRecord(RUN_RECORD_TITLE,
    "Run-wide decisions and the owner questions that no ticket owns, one decision run note per comment (node tools/post-run-note.mjs --kind decision --run-record). This issue stays closed so no open-ticket count includes it.\n")
  if (intakeChanges) updateRunJson(INTAKE_FILE, (current) => mergeIntake(current ?? {}, localIntake ?? {}), "intake: migrate the local run record marks", store)
  const posted = []
  for (const item of items) {
    if (item.kind === "body") await actions.editPullBody(item.repo, item.pr, item.text)
    else if (item.kind === "reply") await actions.replyThread(item.repo, item.pr, item.thread, item.text)
    else await actions.postComment(item.runRecord === true ? runRecord.number : item.issue, item.text)
    posted.push({ kind: item.kind, target: item.target, file: item.file })
  }
  return { ...plan, runRecord: `#${runRecord.number}`, posted }
}
