import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { check, root } from "./_harness.mjs"
import { syntheticSession } from "./relay-cost.mjs"

const TOOL = "measure-relay-cost.mjs"

const ledgerOf = (label, sessions) => {
  const directory = join(root, "measure-relay-cost", label)
  mkdirSync(directory, { recursive: true })
  const entries = sessions.map((options, index) => {
    const session = syntheticSession(options)
    const transcriptPath = join(directory, `session-${index}.jsonl`)
    writeFileSync(transcriptPath, session.text)
    const armedAt = options.armedMinutesBefore === undefined ? null : new Date(Date.parse(session.triggeredAt) - options.armedMinutesBefore * 60_000).toISOString()
    return { sessionId: `session-${index}`, startedAt: `2026-11-0${index + 1}T00:00:00.000Z`, transcriptPath, triggeredAt: session.triggeredAt, forced: options.forced ?? null, armedAt, shipped: Array.from({ length: index + 1 }, (_, number) => ({ repository: "ui", pullRequest: number + 1 })) }
  })
  const ledger = join(directory, "ledger.json")
  writeFileSync(ledger, JSON.stringify({ chains: [{ id: "chain", entries }] }))
  return ledger
}

export const cases = () => {
  const ledger = ledgerOf("usable", [{}, { growth: 1400 }, { growth: 1600 }])
  check(TOOL, "a ledger of three sessions prints the model and a recommendation", ["--ledger", ledger], { status: 0, stdout: /sessions read: 3, usable for the model: 3[\s\S]*recommended soft \d+, hard \d+[\s\S]*3 merged pull requests/ })
  check(TOOL, "the report sweeps the current threshold", ["--ledger", ledger], { status: 0, stdout: /threshold 200000: [\d.]+ x the minimum/ })
  check(TOOL, "--json prints the recommendation as data", ["--ledger", ledger, "--json"], { status: 0, stdout: /"soft": \d+,\s+"hard": \d+/ })
  check(TOOL, "--since keeps only the later sessions", ["--ledger", ledger, "--since", "2026-11-03T00:00:00Z"], { status: 0, stdout: /sessions read: 1, usable for the model: 1/ })
  const policy = ledgerOf("policy", [{ forced: false, armedMinutesBefore: 10 }, { forced: true, armedMinutesBefore: 30 }, { forced: false }])
  check(TOOL, "the report prints the forced share and the delay from arming to the relay start", ["--ledger", policy], { status: 0, stdout: /policy: 3 relays, 1 forced at the hard ceiling \(33%\); 2 armed, arm to relay start median 20\.0 min, p90 30\.0 min/ })
  check(TOOL, "--json carries the forced share and the arming delay", ["--ledger", policy, "--json"], { status: 0, stdout: /"forced": 1,[\s\S]*"armToRelayMinutesMedian": 20/ })
  check(TOOL, "an unreadable ledger exits 1", ["--ledger", join(root, "measure-relay-cost", "absent.json")], { status: 1, stderr: /is unreadable/ })
  const short = ledgerOf("short", [{ workCalls: 3 }])
  check(TOOL, "a ledger with no usable session exits 1", ["--ledger", short], { status: 1, stderr: /no session has an entry/ })
  check(TOOL, "a date that does not parse is a usage error", ["--ledger", ledger, "--since", "soon"], { status: 2, stderr: /--since is not a date/ })
  check(TOOL, "a flag with no value is a usage error", ["--ledger"], { status: 2, stderr: /--ledger needs a value/ })
}
