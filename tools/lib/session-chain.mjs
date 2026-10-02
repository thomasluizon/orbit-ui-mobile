import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { gitDirectoryOf, REPO_ROOT, readRunState, writeRunState } from "./run-state.mjs"
import { readSessionMetrics } from "./session-context.mjs"

export const sessionChainPath = (repoRoot = REPO_ROOT) => join(gitDirectoryOf(repoRoot), "orbit-session-chain.json")

export const readSessionChain = (repoRoot = REPO_ROOT) => {
  const path = sessionChainPath(repoRoot)
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { chains: [] }
}

export const writeSessionChain = (ledger, repoRoot = REPO_ROOT) => {
  const path = sessionChainPath(repoRoot)
  mkdirSync(gitDirectoryOf(repoRoot), { recursive: true })
  const unpublished = `${path}.${randomUUID()}.unpublished`
  writeFileSync(unpublished, `${JSON.stringify(ledger, null, 2)}\n`, { flag: "wx" })
  renameSync(unpublished, path)
}

export const openSessionChain = (sessionId, repoRoot = REPO_ROOT) => readSessionChain(repoRoot).chains.find((chain) =>
  !chain.closedAt && (chain.currentSessionId === sessionId || chain.entries.some((entry) => entry.sessionId === sessionId))) ?? null

export const appendChainEntry = (entry, repoRoot = REPO_ROOT) => {
  const ledger = readSessionChain(repoRoot)
  let chain = ledger.chains.find((row) => !row.closedAt && row.currentSessionId === entry.sessionId)
  if (!chain) {
    chain = { id: randomUUID(), currentSessionId: entry.sessionId, entries: [] }
    ledger.chains.push(chain)
  }
  const previous = chain.entries.find((row) => row.sessionId === entry.sessionId)
  if (previous) Object.assign(previous, entry)
  else chain.entries.push(entry)
  writeSessionChain(ledger, repoRoot)
  return chain.id
}

export const confirmChainSuccessor = (sessionId, successorSessionId, terminal, seconds, repoRoot = REPO_ROOT) => {
  const ledger = readSessionChain(repoRoot)
  const chain = ledger.chains.find((row) => !row.closedAt && row.currentSessionId === sessionId)
  if (!chain) throw new Error("relay chain disappeared before successor confirmation")
  const entry = chain.entries.find((row) => row.sessionId === sessionId)
  Object.assign(entry, { superseded: true, successorSessionId, successorTerminal: terminal, successorStartSeconds: seconds, endedAt: new Date().toISOString() })
  chain.currentSessionId = successorSessionId
  writeSessionChain(ledger, repoRoot)
}

/** Archived chains still guard their old terminals after the owner closes the report window. */
export const supersededSession = (sessionId, repoRoot = REPO_ROOT) => {
  const chain = readSessionChain(repoRoot).chains.find((row) => row.entries.some((entry) => entry.sessionId === sessionId && entry.superseded))
  if (!chain) return null
  const latest = chain.entries.filter((entry) => entry.superseded).at(-1)
  return { sessionId: chain.currentSessionId, terminal: latest.successorTerminal }
}

export const closeSessionChain = (sessionId, repoRoot = REPO_ROOT) => {
  const ledger = readSessionChain(repoRoot)
  const chain = ledger.chains.find((row) => !row.closedAt && row.currentSessionId === sessionId)
  if (!chain) return
  chain.closedAt = new Date().toISOString()
  writeSessionChain(ledger, repoRoot)
}

/** Only the launcher's nominated successor can adopt the predecessor's run. */
export const adoptRelayRun = (sessionId, repoRoot = REPO_ROOT) => {
  const previous = readRunState(repoRoot)
  if (!previous?.relay?.pending || previous.relay.successorSessionId !== sessionId) return false
  writeRunState({ ...previous, sessionId, sleep: true, decisionLogPath: null, openOwnerQuestions: [],
    relay: { from: previous.sessionId, pending: false } }, repoRoot)
  return true
}

export const sessionChainEntry = async (state, transcriptPath) => {
  const metrics = await readSessionMetrics(transcriptPath)
  if (typeof state.decisionLogPath !== "string") throw new Error("run state must name its decisionLogPath")
  const decisions = readFileSync(state.decisionLogPath, "utf8")
  const now = new Date().toISOString()
  const trigger = state.relay?.triggeredAt
  return { sessionId: state.sessionId, startedAt: metrics.startedAt, endedAt: now,
    measuredTokens: state.relay?.measuredTokens ?? metrics.lastCall?.contextTokens,
    maximumContextTokens: metrics.maximumContextTokens, growthPerCall: metrics.growthPerCall,
    drainMinutes: trigger ? (Date.parse(now) - Date.parse(trigger)) / 60_000 : 0,
    relayTurnCalls: trigger ? metrics.callTimestamps.filter((timestamp) => Date.parse(timestamp) >= Date.parse(trigger)).length : 0,
    assistantCalls: metrics.calls, compactions: metrics.compactions,
    shipped: (state.readinessLedger ?? []).filter((row) => row.merged).map((row) => ({ repository: row.repositoryKey, pullRequest: row.prNumber, mergeSha: row.merged })),
    decisions, openOwnerQuestions: state.openOwnerQuestions ?? [], attempts: state.relay?.attempts ?? 0 }
}
