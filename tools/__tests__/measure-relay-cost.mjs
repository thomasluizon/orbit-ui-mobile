import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { appendChainEntry } from "../lib/session-chain.mjs"
import { T, TOOLS_DIR, check, root } from "./_harness.mjs"
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

const gitEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")))
const git = (cwd, ...args) => {
  const result = spawnSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", env: gitEnvironment })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`)
}

/** A linked worktree of a temporary repository that carries its own copy of the tool, so the tool resolves that worktree as its checkout. */
const linkedWorktreeWithTool = () => {
  const main = join(root, "measure-relay-cost", "linked", "main")
  mkdirSync(main, { recursive: true })
  git(main, "init", "-q", "-b", "main")
  git(main, "commit", "-q", "--allow-empty", "-m", "initial")
  const worktree = join(root, "measure-relay-cost", "linked", "worktree")
  git(main, "worktree", "add", "-q", "-b", "feature/linked", worktree)
  mkdirSync(join(worktree, "tools"), { recursive: true })
  cpSync(join(TOOLS_DIR, "measure-relay-cost.mjs"), join(worktree, "tools", "measure-relay-cost.mjs"))
  cpSync(join(TOOLS_DIR, "lib"), join(worktree, "tools", "lib"), { recursive: true })
  return { main, worktree }
}

export const cases = () => {
  const { main, worktree } = linkedWorktreeWithTool()
  const session = syntheticSession()
  const transcriptPath = join(worktree, "session.jsonl")
  writeFileSync(transcriptPath, session.text)
  appendChainEntry({ sessionId: "linked-session", startedAt: "2026-11-01T00:00:00.000Z", transcriptPath, triggeredAt: session.triggeredAt, forced: false, armedAt: null, shipped: [] }, worktree)
  const linked = spawnSync(process.execPath, [join(worktree, "tools", "measure-relay-cost.mjs")], { cwd: worktree, encoding: "utf8", env: gitEnvironment })
  T("measure-relay-cost: with no --ledger a linked worktree reads the ledger that appendChainEntry wrote there", linked.status === 0 && /sessions read: 1, usable for the model: 1/.test(linked.stdout), `status ${linked.status}\n${linked.stdout}${linked.stderr}`)
  const fromMain = spawnSync(process.execPath, [join(worktree, "tools", "measure-relay-cost.mjs")], { cwd: main, encoding: "utf8", env: gitEnvironment })
  T("measure-relay-cost: the default ledger does not depend on the working directory", fromMain.status === 0 && fromMain.stdout === linked.stdout, `status ${fromMain.status}\n${fromMain.stderr}`)

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
