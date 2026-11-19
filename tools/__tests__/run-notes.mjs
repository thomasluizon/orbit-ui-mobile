import { composeRunNote, latestRunNote, orderSealProblem, parseRunNote, reviewVerdict, runNotesIn, sealOrder } from "../lib/run-notes.mjs"

import { T, same } from "./_harness.mjs"

const UNIT = "lib/run-notes.mjs"
const HEAD = "a".repeat(40)

const refusal = (note) => {
  try { composeRunNote(note); return null } catch (error) { return error.message }
}

export const cases = () => {
  const round = composeRunNote({ kind: "round-note", round: 2, head: HEAD, body: "Fix the two findings.\n\n" })
  T(`${UNIT}: a round note starts with its marker and names its round and head`, round.startsWith(`<!-- orbit-run-note: kind=round-note round=2 head=${HEAD} -->\n## Fix round 2 note for head`) && round.endsWith("Fix the two findings.\n"), round)
  same(`${UNIT}: a round note parses back to its fields`, parseRunNote(round), { kind: "round-note", round: "2", head: HEAD })
  same(`${UNIT}: a comment without a leading marker is no run note`, parseRunNote(`Quoted later: ${round}`), null)
  for (const [label, note, message] of [
    ["a round note without a round", { kind: "round-note", head: HEAD, body: "x" }, /--round/],
    ["a round note with a short head", { kind: "round-note", round: 1, head: "abc1234", body: "x" }, /--head/],
    ["a review without a verdict line", { kind: "review", head: HEAD, body: "Looks fine." }, /VERDICT: CLEAN or VERDICT: DEFECTS/],
    ["a review with zero defects", { kind: "review", head: HEAD, body: "VERDICT: DEFECTS (0)" }, /VERDICT/],
    ["a report without commits", { kind: "report", body: "done" }, /--commits/],
    ["a report with a commit that is no SHA", { kind: "report", commits: ["main"], body: "done" }, /--commits/],
    ["an unknown kind", { kind: "chat", body: "x" }, /kind must be one of/],
    ["an empty body", { kind: "decision", body: "  \n" }, /needs a body/],
    ["a body that carries another marker", { kind: "decision", body: round }, /another run note marker/],
  ]) T(`${UNIT}: ${label} is refused`, message.test(refusal(note) ?? ""), refusal(note))
  const review = composeRunNote({ kind: "review", head: HEAD, body: "\nVERDICT: DEFECTS (2)\n\n1. tools/a.mjs:3 misses the retry." })
  same(`${UNIT}: a review records its verdict in the marker`, parseRunNote(review), { kind: "review", head: HEAD, verdict: "defects-2" })
  same(`${UNIT}: a clean review records a clean verdict`, parseRunNote(composeRunNote({ kind: "review", head: HEAD, body: "VERDICT: CLEAN" })).verdict, "clean")
  same(`${UNIT}: the verdict is the first non-empty line only`, reviewVerdict("Summary\nVERDICT: CLEAN"), null)
  same(`${UNIT}: a report names its commits`, parseRunNote(composeRunNote({ kind: "report", commits: ["abc1234", "def5678"], body: "tests pass" })).commits, "abc1234,def5678")
  const decision = composeRunNote({ kind: "decision", body: "Batch the round notes of one round into one comment." })
  same(`${UNIT}: a decision needs only its body`, parseRunNote(decision), { kind: "decision" })

  const comments = [
    { body: round, createdAt: "2026-11-18T01:00:00Z", author: "a" },
    { body: "A plain comment.", createdAt: "2026-11-18T02:00:00Z", author: "b" },
    { body: composeRunNote({ kind: "round-note", round: 3, head: "b".repeat(40), body: "Round three." }), createdAt: "2026-11-18T03:00:00Z", author: "a" },
    { body: review, createdAt: "2026-11-18T04:00:00Z", author: "a" },
  ]
  same(`${UNIT}: the latest round note is the newest one`, latestRunNote(comments, "round-note")?.note.round, "3")
  same(`${UNIT}: a kind with no comment has no latest note`, latestRunNote(comments, "decision"), null)
  same(`${UNIT}: every marker in a composed order is found`, runNotesIn(`# Ticket\n\n${round}\n---\n${review}`).map((note) => note.kind), ["round-note", "review"])

  const sealed = sealOrder("# Ticket\n\nbody\n\n\n")
  same(`${UNIT}: a sealed order passes`, orderSealProblem(sealed), null)
  T(`${UNIT}: an unsealed order is refused`, /carries no seal/.test(orderSealProblem("# Ticket\n") ?? ""))
  T(`${UNIT}: text appended after the seal is refused`, /carries no seal/.test(orderSealProblem(`${sealed}\nmore\n`) ?? ""))
  T(`${UNIT}: an edit above the seal is refused`, /changed after/.test(orderSealProblem(sealed.replace("body", "b0dy")) ?? ""))
  same(`${UNIT}: sealing is stable`, sealOrder("# Ticket\n\nbody\n"), sealOrder("# Ticket\n\nbody\n\n"))
}
