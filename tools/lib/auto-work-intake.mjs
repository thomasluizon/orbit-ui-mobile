import { INTAKE_FILE, readRunJson, runFiles, updateRunJson } from "./run-files.mjs"
import { readRunState, REPO_ROOT } from "./run-state.mjs"

export const carryingTicket = (ticket) => /^https:\/\/github\.com\/thomasluizon\/orbit-tickets\/issues\/\d+$/.test(ticket ?? "")

/** Semantic classification belongs to the skill; every send boundary enforces this allowlist. */
export const replyDisposition = (receipt, mailItem) => {
  if (receipt?.person === false) return "none"
  if (mailItem && mailItem.bodiesComplete !== true) return "draft"
  if (receipt?.person !== true || receipt.clear !== true || !Array.isArray(receipt.concerns) || receipt.concerns.length) return "draft"
  if (receipt.classification === "praise" && receipt.replyKind === "thanks") return "send"
  if (receipt.classification === "bug" && receipt.replyKind === "known bug" && carryingTicket(receipt.ticket)) return "send"
  if (receipt.classification === "question" && receipt.replyKind === "supported how-to" && typeof receipt.evidence === "string" && receipt.evidence.trim()) return "send"
  return "draft"
}

/** The longest wait for the exact review cycle run to complete before the cycle reports a failure. */
export const REVIEW_RUN_SECONDS = 600

/** Pending Play and App Store review ids, the keys the idle auto-work waiter compares. */
export const pendingReviewKeys = (intake) => [
  ...Object.keys(intake?.play?.pending ?? {}).map((id) => `play ${id}`),
  ...Object.keys(intake?.appStore?.pending ?? {}).map((id) => `appStore ${id}`),
]

/** The local run record when it is the active auto-work run this process may write intake to; the intake itself lives on GitHub. */
const activeIntakeRun = (state, repoRoot = REPO_ROOT) => {
  if (!state?.sessionId || !state.sleep || !state.autoWork ||
      (repoRoot === REPO_ROOT && process.env.CLAUDE_CODE_SESSION_ID && process.env.CLAUDE_CODE_SESSION_ID !== state.sessionId)) throw new Error("No matching active auto-work run")
  return state
}

export const intakeRun = (repoRoot = REPO_ROOT) => activeIntakeRun(readRunState(repoRoot), repoRoot)

const MAIL_MARKS = ["id", "threadId", "draftId", "sentId", "sendAttempted", "bodiesComplete", "replyReceipt"]

/**
 * The intake with each pending Gmail message reduced to its identity and state marks. An older run record kept the
 * text, sender and subject of a pending message; Gmail holds them durably, and the intake file in git history never does.
 */
export const withoutMailContent = (intake) => {
  if (!intake?.gmail?.pending) return intake
  const pending = Object.fromEntries(Object.entries(intake.gmail.pending).map(([id, item]) =>
    [id, Object.fromEntries(MAIL_MARKS.filter((mark) => item[mark] !== undefined).map((mark) => [mark, item[mark]]))]))
  return { ...intake, gmail: { ...intake.gmail, pending } }
}

// WHY: until INTAKE_FILE exists, an older run record still holds the marks, so no reader before tools/migrate-run-state.mjs sees fewer marks than that record (thomasluizon/orbit-tickets#2152).
const legacyIntake = (repoRoot) => withoutMailContent(readRunState(repoRoot)?.intake ?? {})

/**
 * Every intake mark (Gmail, Play, App Store, the waiter's seen keys), read from INTAKE_FILE in the private tickets
 * repository. Any computer reads the same marks, so a relay or a new computer never reads a message twice.
 */
export const readIntake = (repoRoot = REPO_ROOT) => readRunJson(INTAKE_FILE, runFiles(repoRoot)).value ?? legacyIntake(repoRoot)

const intakeSourceOf = (intake, source) => ({ completed: {}, pending: {}, highWater: null, ...intake?.[source] })

export const intakeSource = (source, repoRoot = REPO_ROOT) => {
  intakeRun(repoRoot)
  return intakeSourceOf(readIntake(repoRoot), source)
}

/**
 * One compare-and-swap of the whole intake file for one key. `change` receives the whole intake object as it is now
 * and runs again when another writer replaced the file first, so it derives everything from its argument. The first
 * write of the file starts from the marks of the local run record, so it carries them to GitHub.
 */
export const updateIntake = (key, change, repoRoot = REPO_ROOT) => {
  intakeRun(repoRoot)
  let contents
  updateRunJson(INTAKE_FILE, (intake) => {
    const current = intake ?? legacyIntake(repoRoot)
    contents = change(current)
    return contents === undefined ? undefined : { ...current, [key]: contents }
  }, `intake: ${key}`, runFiles(repoRoot))
  return contents
}

export const updateIntakeSource = (source, change, repoRoot = REPO_ROOT) =>
  intakeSourceOf({ [source]: updateIntake(source, (intake) => change(intakeSourceOf(intake, source)), repoRoot) }, source)

/** A completed item has both a durable disposition and the reply or ticket carrying it. */
export const acknowledgeIntake = (source, receipt, repoRoot = REPO_ROOT) => updateIntakeSource(source, (current) => {
  const item = current.pending[receipt?.id]
  if (!item) throw new Error("No pending item matches the receipt")
  if (!["bug", "feature request", "question", "billing", "praise", "spam", "noise"].includes(receipt.classification)) throw new Error("Unknown intake classification")
  if (["bug", "feature request"].includes(receipt.classification) && !carryingTicket(receipt.ticket)) throw new Error("A bug or request needs its carrying ticket")
  if (typeof receipt.person !== "boolean") throw new Error("Classify whether a person needs a reply")
  if (receipt.person && source === "gmail" && !item.draftId && !item.sentId) throw new Error("Save the Gmail reply before acknowledging")
  if (receipt.person && replyDisposition(receipt, source === "gmail" ? item : undefined) === "send" && !(source === "gmail" ? item.sentId : item.replyPosted)) throw new Error("Confirm the simple reply was sent before acknowledging")
  if (receipt.person && source !== "gmail" && (typeof receipt.reply !== "string" || !receipt.reply.trim())) throw new Error("Save the review reply in the receipt")
  const pending = { ...current.pending }
  delete pending[receipt.id]
  return { ...current, pending,
    completed: { ...current.completed, [receipt.id]: { ...receipt, ...(item.draftId ? { draftId: item.draftId } : {}),
      ...(item.sentId ? { sentId: item.sentId } : {}), ...(item.replyPosted ? { replyPosted: item.replyPosted } : {}), completedAt: new Date().toISOString() } } }
}, repoRoot)
