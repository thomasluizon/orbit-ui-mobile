import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { acknowledgeIntake, intakeSource, saveIntakeSource } from "../lib/auto-work-intake.mjs"
import { readRunState, writeRunState } from "../lib/run-state.mjs"
import { T, root } from "./_harness.mjs"

export const cases = () => {
  const checkout = join(root, "intake")
  mkdirSync(join(checkout, ".git"), { recursive: true })
  writeRunState({ sessionId: "parent", sleep: true, autoWork: true }, checkout)
  saveIntakeSource("gmail", { completed: {}, pending: { mail: { id: "mail" } }, highWater: "mail" }, checkout)
  for (const receipt of [{ id: "mail", classification: "invalid", person: false },
    { id: "mail", classification: "bug", person: false }, { id: "mail", classification: "question", person: true }]) {
    let refused = false
    try { acknowledgeIntake("gmail", receipt, checkout) } catch { refused = true }
    T("intake: incomplete dispositions leave the message pending", refused && intakeSource("gmail", checkout).pending.mail.id === "mail")
  }
  const current = intakeSource("gmail", checkout)
  saveIntakeSource("gmail", { ...current, pending: { mail: { id: "mail", draftId: "draft" } } }, checkout)
  acknowledgeIntake("gmail", { id: "mail", classification: "bug", person: true, ticket: "https://github.com/thomasluizon/orbit-tickets/issues/1" }, checkout)
  writeRunState({ sessionId: "child", relay: { from: "parent" }, sleep: true }, checkout)
  T("intake: a relay retains classification, carrying ticket and draft", intakeSource("gmail", checkout).completed.mail.draftId === "draft" &&
    intakeSource("gmail", checkout).completed.mail.classification === "bug" && !intakeSource("gmail", checkout).pending.mail && readRunState(checkout).autoWork === true)
  saveIntakeSource("play", { completed: {}, pending: { review: { id: "review" } }, highWater: null }, checkout)
  let refused = false
  try { acknowledgeIntake("play", { id: "review", classification: "praise", person: true }, checkout) } catch { refused = true }
  T("intake: review acknowledgement requires the saved reply", refused)
  acknowledgeIntake("play", { id: "review", classification: "praise", person: true, reply: "Obrigado!" }, checkout)
  T("intake: review reply stays in the durable run log beside Gmail receipts", intakeSource("play", checkout).completed.review.reply === "Obrigado!" && intakeSource("gmail", checkout).completed.mail.draftId === "draft")
}
