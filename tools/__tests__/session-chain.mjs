import { mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { T, stageRepo } from "./_harness.mjs"
import { appendChainEntry, closeSessionChain, confirmChainSuccessor, openSessionChain, supersededSession, adoptRelayRun, readSessionChain } from "../lib/session-chain.mjs"
import { readRunState, writeRunState } from "../lib/run-state.mjs"

export const cases = async () => {
  const repository = stageRepo("chain")
  const checkout = repository.path
  repository.git(["checkout", "-qb", "relay-docs"])
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
  writeRunState({ sessionId: "old", sleep: true, remaining: ["#1091"], relay: { pending: true, successorSessionId: "new", successorTerminal: "term_new" } }, checkout)
  appendChainEntry({ sessionId: "old", decisions: "preserved decision" }, checkout)
  T("session-chain: an unrelated session cannot adopt a run", adoptRelayRun("unrelated", checkout) === false)
  T("session-chain: successor adopts queue without hand-copied state", adoptRelayRun("new", checkout) && readRunState(checkout).remaining[0] === "#1091" && readRunState(checkout).relay.from === "old")
  T("session-chain: durable adoption fences predecessor before chain finalization", supersededSession("old", checkout)?.terminal === "term_new")
  const recovered = openSessionChain("new", checkout)
  T("session-chain: successor reconciles interrupted chain finalization", recovered?.currentSessionId === "new" && recovered.entries[0].decisions === "preserved decision" && readSessionChain(checkout).chains.at(-1).entries[0].superseded === true)
  confirmChainSuccessor("old", "new", "term_new", 2, checkout)
  appendChainEntry({ sessionId: "new", decisions: "next decision" }, checkout)
  T("session-chain: recovered confirmation is idempotent and keeps one chain", openSessionChain("new", checkout).entries.length === 2 && readSessionChain(checkout).chains.length === 2)
  adoptionFreshnessCases()
}

const adoptionFreshnessCases = () => {
  for (const mode of ["behind", "conflict", "fetch-failure", "current"]) {
    const repository = stageRepo(`chain-freshness-${mode}`)
    const { path: checkout, git } = repository
    mkdirSync(join(checkout, "tools"), { recursive: true })
    writeFileSync(join(checkout, "tools", "probe.mjs"), "base\n")
    git(["add", "tools/probe.mjs"])
    git(["commit", "-qm", "harness base"])
    git(["push", "-q", "origin", "main"])
    const base = git(["rev-parse", "HEAD"]).stdout.trim()
    git(["checkout", "-qb", "relay-docs"])
    mkdirSync(join(checkout, ".claude", "specs"), { recursive: true })
    writeFileSync(join(checkout, ".claude", "specs", "relay.md"), "relay decisions\n")
    git(["add", ".claude/specs/relay.md"])
    git(["commit", "-qm", "relay docs"])
    if (mode === "conflict") {
      writeFileSync(join(checkout, "tools", "probe.mjs"), "relay edit\n")
      git(["add", "tools/probe.mjs"])
      git(["commit", "-qm", "relay harness edit"])
    }
    if (mode === "behind" || mode === "conflict") {
      git(["checkout", "-q", "main"])
      writeFileSync(join(checkout, "tools", "probe.mjs"), "current harness\n")
      git(["add", "tools/probe.mjs"])
      git(["commit", "-qm", "refresh harness"])
      git(["push", "-q", "origin", "main"])
      git(["checkout", "-q", "relay-docs"])
      git(["update-ref", "refs/remotes/origin/main", base])
    }
    if (mode === "fetch-failure") git(["remote", "set-url", "origin", join(checkout, "missing-origin")])
    const head = git(["rev-parse", "HEAD"]).stdout.trim()
    const main = git(["rev-parse", "main"]).stdout.trim()
    writeRunState({ sessionId: "parent", sleep: true, remaining: ["#1901"], relay: { pending: true, successorSessionId: "child", successorTerminal: "term_child" } }, checkout)
    let failure = null
    try { adoptRelayRun("child", checkout) } catch (error) { failure = error.message }
    if (mode === "behind") {
      T("session-chain: adoption fetches and merges current main before transferring the run", !failure && readFileSync(join(checkout, "tools", "probe.mjs"), "utf8") === "current harness\n" && git(["merge-base", "--is-ancestor", "origin/main", "HEAD"]).status === 0 && readRunState(checkout).sessionId === "child", failure ?? "stale harness retained")
    } else if (mode === "current") {
      T("session-chain: main plus docs adopts without a commit", !failure && git(["rev-parse", "HEAD"]).stdout.trim() === head && readRunState(checkout).sessionId === "child", failure ?? "")
    } else {
      T(`session-chain: ${mode} refuses adoption with its reason and keeps predecessor ownership`, Boolean(failure) && (mode === "conflict" ? failure.includes("tools/probe.mjs") : /fetch/.test(failure)) && readRunState(checkout).sessionId === "parent" && git(["rev-parse", "HEAD"]).stdout.trim() === head, failure ?? "adopted without freshness check")
    }
    T(`session-chain: ${mode} keeps the checked-out branch and local main`, git(["branch", "--show-current"]).stdout.trim() === "relay-docs" && git(["rev-parse", "main"]).stdout.trim() === main)
  }
}
