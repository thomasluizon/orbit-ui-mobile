import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { relaySession } from "../relay-session.mjs"
import { adoptRelayRun, openSessionChain } from "../lib/session-chain.mjs"
import { processStartIdentity, readRunState, registerWakeSource, writeRunState } from "../lib/run-state.mjs"
import { T, realOrchestratorConfig, stageRepo, toolPath } from "./_harness.mjs"

const usage = JSON.parse(readFileSync(new URL("./fixtures/session-usage.json", import.meta.url), "utf8"))
const created = readFileSync(new URL("./fixtures/orca-relay-create.json", import.meta.url), "utf8")
const prompt = "/sleep\nRead .claude/specs/relay.md. Every identifier is a lead to verify.\n## Goal\nFinish the spec. gh issue list\n## In flight\nNone.\n## Sleep\nContinue.\n## Previous prompt, disposition\nCarried.\n"

const fixture = (label, { tokens = 400000, calls = 20 } = {}) => {
  const repo = stageRepo(`relay-${label}`)
  const checkout = repo.path
  mkdirSync(join(checkout, ".claude", "handoffs"), { recursive: true })
  mkdirSync(join(checkout, ".claude", "specs"), { recursive: true })
  writeFileSync(join(checkout, ".claude", "orchestrator.json"), JSON.stringify(realOrchestratorConfig()))
  writeFileSync(join(checkout, ".claude", "handoffs", "NEXT.md"), prompt)
  writeFileSync(join(checkout, ".claude", "specs", "relay.md"), "# Relay\n## Open questions\nAn owner question.\n")
  repo.git(["add", ".claude/handoffs/NEXT.md", ".claude/specs/relay.md", ".claude/orchestrator.json"])
  repo.git(["commit", "-qm", "handoff"])
  repo.git(["push", "-q"])
  const transcriptPath = join(checkout, ".git", "transcript.jsonl")
  const decisionLogPath = join(checkout, ".git", "sleep-decisions.md")
  writeFileSync(decisionLogPath, "Decision and reasoning copied in full.\n")
  writeFileSync(transcriptPath, Array.from({ length: calls }, (_, index) => JSON.stringify({ type: "assistant", timestamp: new Date(Date.now() - (calls - index) * 1000).toISOString(),
    message: { id: `call-${index}`, model: "claude-opus-5-5", usage: { ...usage, cache_read_input_tokens: tokens - 670 } } })).join("\n") + "\n")
  writeRunState({ sessionId: "predecessor", sleep: true, remaining: ["#1091"], decisionLogPath, openOwnerQuestions: ["An owner question."],
    relay: { from: "predecessor", pending: true, measuredTokens: tokens, permissionMode: "bypassPermissions", transcriptPath, triggeredAt: new Date().toISOString() } }, checkout)
  return { ...repo, checkout, transcriptPath }
}

const executeFor = (checkout, { confirm = true, wrongMode = false, commands = [] } = {}) => (binary, args, cwd, environment) => {
  if (binary === "git") {
    const result = spawnSync(binary, args, { cwd, encoding: "utf8" })
    if (result.status !== 0) throw new Error("git refused")
    return result.stdout.trim()
  }
  commands.push(args)
  if (args[1] === "create") return created
  if (args[1] === "send" && args.includes("--text") && confirm) {
    const nominated = readRunState(checkout).relay.successorSessionId
    if (wrongMode) writeRunState({ sessionId: nominated, sleep: false, relay: { from: "predecessor" } }, checkout)
    else adoptRelayRun(nominated, checkout)
  }
  return ""
}

const failure = async (options) => {
  try { await relaySession(options); return null } catch (error) { return error.message }
}

export const cases = async () => {
  for (const [label, options, message] of [["below", { tokens: 399999 }, /below threshold/], ["young", { calls: 19 }, /at least 20/]]) {
    const staged = fixture(label, options)
    T(`relay-session: refuses ${label}`, message.test(await failure({ repoRoot: staged.checkout, sessionId: "predecessor" })))
  }
  const successful = fixture("success")
  const commands = []
  const result = await relaySession({ repoRoot: successful.checkout, sessionId: "predecessor", execute: executeFor(successful.checkout, { commands }), wait: async () => {}, confirmMilliseconds: 10 })
  T("relay-session: confirms only the nominated sleep successor", result.terminal === "term_successor" && readRunState(successful.checkout).relay.from === "predecessor")
  const entry = openSessionChain(result.successorSessionId, successful.checkout).entries[0]
  T("relay-session: chain records measured metrics, complete decisions and questions", entry.measuredTokens === 400000 && entry.assistantCalls === 20 && entry.decisions === "Decision and reasoning copied in full.\n" && entry.openOwnerQuestions[0] === "An owner question." && entry.superseded === true)
  T("relay-session: no terminal operation uses an empty handle", commands.filter((args) => ["send", "wait", "close"].includes(args[1])).every((args) => args[args.indexOf("--terminal") + 1] === "term_successor"))
  const encoded = commands.find((args) => args[1] === "create").at(-2).match(/Buffer.from\('([^']+)'/)[1]
  const source = Buffer.from(encoded, "base64").toString()
  T("relay-session: child scrubs the three forbidden environment keys", ["CLAUDE_CONFIG_DIR", "GH_TOKEN", "ORBIT_LAUNCH_WORKER"].every((key) => source.includes(key)) && source.includes("delete env[key]"))
  T("relay-session: model and permission mode come from observations", source.includes("claude-opus-5-5") && source.includes("bypassPermissions"))

  for (const wrongMode of [false, true]) {
    const staged = fixture(wrongMode ? "wrong-mode" : "stall")
    const operations = []
    const message = await failure({ repoRoot: staged.checkout, sessionId: "predecessor", execute: executeFor(staged.checkout, { confirm: wrongMode, wrongMode, commands: operations }), wait: async () => {}, confirmMilliseconds: 1 })
    T(`relay-session: ${wrongMode ? "attended successor" : "stall"} retains predecessor`, /did not confirm/.test(message) && readRunState(staged.checkout).sessionId === "predecessor" && readRunState(staged.checkout).relay.failures === 1)
    T("relay-session: composer stall gets one bare Enter then closes only its successor", operations.filter((args) => args[1] === "send" && !args.includes("--text")).length === 1 && operations.filter((args) => args[1] === "close").length === 1)
    T("relay-session: failure cannot retry before ten minutes", /ten minutes/.test(await failure({ repoRoot: staged.checkout, sessionId: "predecessor" })))
  }
  const live = fixture("live")
  registerWakeSource({ pid: process.pid, what: "Worker launcher", sessionId: "predecessor" }, live.checkout)
  mkdirSync(join(live.checkout, "tools"), { recursive: true })
  cpSync(toolPath("relay-session.mjs"), join(live.checkout, "tools", "relay-session.mjs"))
  cpSync(toolPath("lib"), join(live.checkout, "tools", "lib"), { recursive: true })
  const cli = spawnSync(process.execPath, [join(live.checkout, "tools", "relay-session.mjs")], { encoding: "utf8", env: { ...process.env, CLAUDE_CODE_SESSION_ID: "predecessor" } })
  T("relay-session: real CLI refuses a live launcher by pid", cli.status === 1 && cli.stderr.includes(String(process.pid)))
  const release = fixture("release")
  registerWakeSource({ pid: process.pid, what: "Release ui run 1" }, release.checkout)
  T("relay-session: release watcher blocks handoff", (await failure({ repoRoot: release.checkout, sessionId: "predecessor" })).includes(String(process.pid)))
  const unpublished = fixture("unpublished")
  writeFileSync(join(unpublished.checkout, ".claude", "specs", "relay.md"), "changed spec\n")
  T("relay-session: an uncommitted spec cannot be relayed", /not committed/.test(await failure({ repoRoot: unpublished.checkout, sessionId: "predecessor" })))
  const locked = fixture("lock")
  mkdirSync(join(locked.checkout, ".git", "orbit-relay-lock"))
  writeFileSync(join(locked.checkout, ".git", "orbit-relay-lock", "owner.json"), JSON.stringify({ pid: process.pid, processStartIdentity: processStartIdentity(process.pid) }))
  T("relay-session: occupied lock prevents a second launch", /EEXIST/.test(await failure({ repoRoot: locked.checkout, sessionId: "predecessor" })))
}
