import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { acknowledgeIntake, intakeSource, updateIntakeSource } from "../lib/auto-work-intake.mjs"
import { readRunState, writeRunState } from "../lib/run-state.mjs"
import { T, root } from "./_harness.mjs"
import * as intake from "../lib/auto-work-intake.mjs"

export const cases = () => {
  const simple = { person: true, clear: true, concerns: [], classification: "praise", replyKind: "thanks" }
  for (const receipt of [simple,
    { ...simple, classification: "bug", replyKind: "known bug", ticket: "https://github.com/thomasluizon/orbit-tickets/issues/1" },
    { ...simple, classification: "question", replyKind: "supported how-to", evidence: "FEATURES.md" }]) {
    T("intake: clear authorized replies are sent", intake.replyDisposition?.(receipt) === "send")
  }
  for (const receipt of [
    ...["billing", "feature request", "spam", "noise", "unknown"].map((classification) => ({ ...simple, classification })),
    ...["billing", "refund", "complaint", "account", "data", "unclear"].map((concern) => ({ ...simple, concerns: [concern] })),
    { ...simple, clear: false }, { ...simple, concerns: undefined }, { ...simple, replyKind: "unclear" },
    { ...simple, classification: "bug", replyKind: "known bug" },
    { ...simple, classification: "question", replyKind: "supported how-to" },
  ]) T("intake: every other reply remains a draft", intake.replyDisposition?.(receipt) === "draft")
  const cutover = join(root, "intake-cutover")
  mkdirSync(join(cutover, ".git"), { recursive: true })
  const legacy = { gmail: { completed: { handled: { id: "handled", classification: "noise" } }, pending: {}, highWater: "handled" },
    play: { completed: {}, pending: { review: { id: "review" } }, highWater: null }, wake: { seen: { board: ["#1"] }, failures: {} } }
  writeRunState({ sessionId: "parent", sleep: true, autoWork: true, intake: legacy }, cutover)
  T("intake: before the intake file exists, a read returns the marks of the local run record",
    JSON.stringify(intake.readIntake(cutover)) === JSON.stringify(legacy) && intakeSource("gmail", cutover).completed.handled.classification === "noise", JSON.stringify(intake.readIntake(cutover)))
  intake.updateIntake("wake", () => ({ seen: { board: ["#1", "#2"] }, failures: {} }), cutover)
  writeRunState({ sessionId: "parent", sleep: true, autoWork: true, intake: null }, cutover)
  T("intake: the first write of the intake file carries the marks of the local run record to GitHub",
    intakeSource("gmail", cutover).completed.handled?.classification === "noise" && intakeSource("play", cutover).pending.review?.id === "review" &&
    intake.readIntake(cutover).wake.seen.board.length === 2, JSON.stringify(intake.readIntake(cutover)))
  writeRunState({ sessionId: "parent", sleep: true, autoWork: true, intake: { gmail: { completed: {}, pending: {}, highWater: "stale" } } }, cutover)
  T("intake: after the intake file exists, the local run record is never read", intakeSource("gmail", cutover).highWater === "handled")
  const checkout = join(root, "intake")
  mkdirSync(join(checkout, ".git"), { recursive: true })
  writeRunState({ sessionId: "parent", sleep: true, autoWork: true }, checkout)
  updateIntakeSource("gmail", (gmail) => ({ ...gmail, pending: { ...gmail.pending, mail: { id: "mail" } }, highWater: "mail" }), checkout)
  for (const receipt of [{ id: "mail", classification: "invalid", person: false },
    { id: "mail", classification: "bug", person: false }, { id: "mail", classification: "question", person: true }]) {
    let refused = false
    try { acknowledgeIntake("gmail", receipt, checkout) } catch { refused = true }
    T("intake: incomplete dispositions leave the message pending", refused && intakeSource("gmail", checkout).pending.mail.id === "mail")
  }
  updateIntakeSource("gmail", (gmail) => ({ ...gmail, pending: { ...gmail.pending, mail: { ...gmail.pending.mail, draftId: "draft" } } }), checkout)
  acknowledgeIntake("gmail", { id: "mail", classification: "bug", person: true, ticket: "https://github.com/thomasluizon/orbit-tickets/issues/1" }, checkout)
  writeRunState({ sessionId: "child", relay: { from: "parent" }, sleep: true }, checkout)
  T("intake: a relay retains classification, carrying ticket and draft", intakeSource("gmail", checkout).completed.mail.draftId === "draft" &&
    intakeSource("gmail", checkout).completed.mail.classification === "bug" && !intakeSource("gmail", checkout).pending.mail && readRunState(checkout).autoWork === true)
  updateIntakeSource("play", (play) => ({ ...play, pending: { ...play.pending, review: { id: "review" } } }), checkout)
  let refused = false
  try { acknowledgeIntake("play", { id: "review", classification: "praise", person: true }, checkout) } catch { refused = true }
  T("intake: review acknowledgement requires the saved reply", refused)
  acknowledgeIntake("play", { id: "review", classification: "praise", person: true, reply: "Obrigado!" }, checkout)
  T("intake: review reply stays in the durable run log beside Gmail receipts", intakeSource("play", checkout).completed.review.reply === "Obrigado!" && intakeSource("gmail", checkout).completed.mail.draftId === "draft")
}
