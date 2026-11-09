import { readRunState, writeRunState, REPO_ROOT } from "./run-state.mjs"

const carryingTicket = (ticket) => /^https:\/\/github\.com\/thomasluizon\/orbit-tickets\/issues\/\d+$/.test(ticket ?? "")

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

export const intakeRun = (repoRoot = REPO_ROOT) => {
  const state = readRunState(repoRoot)
  if (!state?.sessionId || !state.sleep || !state.autoWork ||
      (repoRoot === REPO_ROOT && process.env.CLAUDE_CODE_SESSION_ID && process.env.CLAUDE_CODE_SESSION_ID !== state.sessionId)) throw new Error("No matching active auto-work run")
  return state
}

export const intakeSource = (source, repoRoot = REPO_ROOT) => ({ completed: {}, pending: {}, highWater: null, ...intakeRun(repoRoot).intake?.[source] })

export const saveIntakeSource = (source, contents, repoRoot = REPO_ROOT) => {
  const state = intakeRun(repoRoot)
  writeRunState({ ...state, intake: { ...state.intake, [source]: contents } }, repoRoot)
  const confirmed = intakeSource(source, repoRoot)
  if (JSON.stringify(confirmed) !== JSON.stringify(contents)) throw new Error("Intake write was not confirmed")
  return confirmed
}

/** A completed item has both a durable disposition and the reply or ticket carrying it. */
export const acknowledgeIntake = (source, receipt, repoRoot = REPO_ROOT) => {
  const current = intakeSource(source, repoRoot)
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
  return saveIntakeSource(source, { ...current, pending,
    completed: { ...current.completed, [receipt.id]: { ...receipt, ...(item.draftId ? { draftId: item.draftId } : {}),
      ...(item.sentId ? { sentId: item.sentId } : {}), ...(item.replyPosted ? { replyPosted: item.replyPosted } : {}), completedAt: new Date().toISOString() } } }, repoRoot)
}
