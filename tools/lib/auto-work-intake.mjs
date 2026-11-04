import { readRunState, writeRunState, REPO_ROOT } from "./run-state.mjs"

export const intakeRun = (repoRoot = REPO_ROOT) => {
  const state = readRunState(repoRoot)
  if (!state?.sessionId || !state.sleep || !state.autoWork ||
      (repoRoot === REPO_ROOT && process.env.CLAUDE_CODE_SESSION_ID && process.env.CLAUDE_CODE_SESSION_ID !== state.sessionId)) throw new Error("No matching active auto-work run")
  return state
}

export const intakeSource = (source, repoRoot = REPO_ROOT) => intakeRun(repoRoot).intake?.[source] ?? { completed: {}, pending: {}, highWater: null }

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
  if (["bug", "feature request"].includes(receipt.classification) && !/^https:\/\/github\.com\/thomasluizon\/orbit-tickets\/issues\/\d+$/.test(receipt.ticket ?? "")) throw new Error("A bug or request needs its carrying ticket")
  if (typeof receipt.person !== "boolean") throw new Error("Classify whether a person needs a reply")
  if (receipt.person && source === "gmail" && !item.draftId) throw new Error("Create the Gmail reply draft before acknowledging")
  if (receipt.person && source !== "gmail" && (typeof receipt.reply !== "string" || !receipt.reply.trim())) throw new Error("Save the review reply in the receipt")
  const pending = { ...current.pending }
  delete pending[receipt.id]
  return saveIntakeSource(source, { ...current, pending,
    completed: { ...current.completed, [receipt.id]: { ...receipt, ...(item.draftId ? { draftId: item.draftId } : {}), completedAt: new Date().toISOString() } } }, repoRoot)
}
