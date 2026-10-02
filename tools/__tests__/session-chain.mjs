import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { T, root } from "./_harness.mjs"
import { appendChainEntry, closeSessionChain, confirmChainSuccessor, openSessionChain, supersededSession, adoptRelayRun } from "../lib/session-chain.mjs"
import { readRunState, writeRunState } from "../lib/run-state.mjs"

export const cases = async () => {
  const checkout = join(root, "chain")
  mkdirSync(join(checkout, ".git"), { recursive: true })
  for (let index = 1; index <= 3; index++) {
    appendChainEntry({ sessionId: `s${index}`, decisions: `full decision ${index}`, openOwnerQuestions: [`question ${index}`] }, checkout)
    confirmChainSuccessor(`s${index}`, `s${index + 1}`, `term_${index + 1}`, 1, checkout)
  }
  const chain = openSessionChain("s4", checkout)
  T("session-chain: three relays plus current session form one open chain", chain.entries.length === 3 && chain.currentSessionId === "s4")
  T("session-chain: every chain question remains a candidate", chain.entries.flatMap((entry) => entry.openOwnerQuestions).join(",") === "question 1,question 2,question 3")
  T("session-chain: old terminals point to the live successor", supersededSession("s1", checkout).terminal === "term_4")
  closeSessionChain("s4", checkout)
  T("session-chain: owner closure removes the open reporting window", openSessionChain("s4", checkout) === null)
  T("session-chain: closure preserves superseded guards", supersededSession("s1", checkout).sessionId === "s4")
  writeRunState({ sessionId: "old", sleep: true, remaining: ["#1091"], relay: { pending: true, successorSessionId: "new" } }, checkout)
  T("session-chain: an unrelated session cannot adopt a run", adoptRelayRun("unrelated", checkout) === false)
  T("session-chain: successor adopts queue without hand-copied state", adoptRelayRun("new", checkout) && readRunState(checkout).remaining[0] === "#1091" && readRunState(checkout).relay.from === "old")
}
