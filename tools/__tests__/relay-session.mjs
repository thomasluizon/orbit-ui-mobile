import { spawn, spawnSync } from "node:child_process"
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { relaySession } from "../relay-session.mjs"
import { adoptRelayRun, openSessionChain } from "../lib/session-chain.mjs"
import { processStartIdentity, readRunState, readWakeSourceStates, registerWakeSource, writeRunState } from "../lib/run-state.mjs"
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
  const result = await relaySession({ repoRoot: successful.checkout, sessionId: "predecessor", terminalHandle: "term_predecessor", execute: executeFor(successful.checkout, { commands }), wait: async () => {}, confirmMilliseconds: 10 })
  T("relay-session: closes the finishing handle after successor confirmation", commands.some((args) => args.join(" ") === "terminal close --terminal term_predecessor --json"))
  T("relay-session: confirms only the nominated sleep successor", result.terminal === "term_successor" && readRunState(successful.checkout).relay.from === "predecessor")
  const entry = openSessionChain(result.successorSessionId, successful.checkout).entries[0]
  T("relay-session: chain records measured metrics, complete decisions and questions", entry.measuredTokens === 400000 && entry.assistantCalls === 20 && entry.decisions === "Decision and reasoning copied in full.\n" && entry.openOwnerQuestions[0] === "An owner question." && entry.superseded === true)
  T("relay-session: no terminal operation uses an empty handle", commands.filter((args) => ["send", "wait", "close"].includes(args[1])).every((args) => ["term_successor", "term_predecessor"].includes(args[args.indexOf("--terminal") + 1])))
  const command = commands.find((args) => args[1] === "create").at(-2)
  T("relay-session: successor command contains no evaluated source", !/eval|node -e|Buffer.from/.test(command))
  let launchPayload
  try { launchPayload = JSON.parse(Buffer.from(command.split(" ").at(-1), "base64").toString()) } catch { launchPayload = null }
  T("relay-session: model, permission, session and cwd are passed as data", launchPayload?.model === "claude-opus-5-5" && launchPayload?.permissionMode === "bypassPermissions" && launchPayload?.sessionId === result.successorSessionId && launchPayload?.repoRoot === successful.checkout)

  const canceled = fixture("owner-cancel")
  mkdirSync(join(canceled.checkout, ".claude", "hooks"), { recursive: true })
  cpSync(toolPath("lib"), join(canceled.checkout, "tools", "lib"), { recursive: true })
  cpSync(new URL("../../.claude/hooks/_lib", import.meta.url), join(canceled.checkout, ".claude", "hooks", "_lib"), { recursive: true })
  cpSync(new URL("../../.claude/hooks/record-handoff-request.mjs", import.meta.url), join(canceled.checkout, ".claude", "hooks", "record-handoff-request.mjs"))
  const cancellationCommands = []
  const cancelExecute = executeFor(canceled.checkout, { confirm: false, commands: cancellationCommands })
  let rejectedEntry = false
  let rejectedOrdinaryWrite = false
  let ownerHookSucceeded = false
  const canceledError = await failure({ repoRoot: canceled.checkout, sessionId: "predecessor", confirmMilliseconds: 1, wait: async () => {},
    execute: (binary, args, cwd, environment) => {
      if (args[1] === "send" && args.includes("--text")) {
        const nominated = readRunState(canceled.checkout).relay.successorSessionId
        const hook = spawnSync(process.execPath, [join(canceled.checkout, ".claude", "hooks", "record-handoff-request.mjs")], {
          input: JSON.stringify({ session_id: "predecessor", prompt: "/handoff --sleep", transcript_path: canceled.transcriptPath }), encoding: "utf8" })
        ownerHookSucceeded = hook.status === 0 && readRunState(canceled.checkout).relay.canceledByOwner === true
        try { adoptRelayRun(nominated, canceled.checkout) } catch (error) { rejectedEntry = /cancel/i.test(error.message) }
        try { writeRunState({ sessionId: nominated, sleep: false, relay: { from: "predecessor" } }, canceled.checkout) }
        catch (error) { rejectedOrdinaryWrite = /cancel/i.test(error.message) }
      }
      return cancelExecute(binary, args, cwd, environment)
    } })
  T("relay-session: real owner hook cancels a nominated relay", ownerHookSucceeded)
  T("relay-session: canceled nominee cannot enter sleep or replace the stopped run", rejectedEntry && rejectedOrdinaryWrite)
  const canceledState = readRunState(canceled.checkout)
  T("relay-session: timeout cleanup preserves owner cancellation", /did not confirm/.test(canceledError) && canceledState.sessionId === "predecessor" && canceledState.sleep === false && canceledState.relay.pending === false && canceledState.relay.canceledByOwner === true)

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
  const dead = fixture("dead-lock")
  const lockOwner = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" })
  const ownerExited = new Promise((resolve) => lockOwner.once("exit", resolve))
  mkdirSync(join(dead.checkout, ".git", "orbit-relay-lock"))
  writeFileSync(join(dead.checkout, ".git", "orbit-relay-lock", "owner.json"), JSON.stringify({ pid: lockOwner.pid, processStartIdentity: processStartIdentity(lockOwner.pid) }))
  lockOwner.kill()
  await ownerExited
  T("relay-session: terminated lock owner can be reclaimed and relay succeeds", await failure({ repoRoot: dead.checkout, sessionId: "predecessor", execute: executeFor(dead.checkout), wait: async () => {}, confirmMilliseconds: 10 }) === null)
  const interrupted = fixture("unpublished-lock-owner")
  mkdirSync(join(interrupted.checkout, ".git", "orbit-relay-lock"))
  T("relay-session: interruption before owner publication does not strand the drain", await failure({ repoRoot: interrupted.checkout, sessionId: "predecessor", execute: executeFor(interrupted.checkout), wait: async () => {}, confirmMilliseconds: 10 }) === null)
  const retry = fixture("recovered-failure")
  mkdirSync(join(retry.checkout, ".git", "orbit-relay-lock"))
  writeFileSync(join(retry.checkout, ".git", "orbit-relay-lock", "owner.json"), JSON.stringify({ pid: lockOwner.pid, processStartIdentity: "terminated identity" }))
  writeFileSync(join(retry.checkout, ".claude", "specs", "relay.md"), "uncommitted\n")
  const retryError = await failure({ repoRoot: retry.checkout, sessionId: "predecessor", execute: executeFor(retry.checkout) })
  T("relay-session: recovered attempt still records failures and retry cooldown", /not committed/.test(retryError) && readRunState(retry.checkout).relay.failures === 1 && /ten minutes/.test(await failure({ repoRoot: retry.checkout, sessionId: "predecessor" })))
  const concurrent = fixture("concurrent")
  const concurrentCommands = []
  const options = { repoRoot: concurrent.checkout, sessionId: "predecessor", execute: executeFor(concurrent.checkout, { commands: concurrentCommands }), wait: async () => {}, confirmMilliseconds: 10 }
  const attempts = await Promise.allSettled([relaySession(options), relaySession(options)])
  T("relay-session: simultaneous attempts create only one successor", attempts.filter((attempt) => attempt.status === "fulfilled").length === 1 && concurrentCommands.filter((args) => args[1] === "create").length === 1)
  const waiters = fixture("ci-waiters")
  const currentWaiter = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" })
  const otherWaiter = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" })
  const currentExited = new Promise((resolve) => currentWaiter.once("exit", resolve))
  const otherExited = new Promise((resolve) => otherWaiter.once("exit", resolve))
  try {
    registerWakeSource({ pid: currentWaiter.pid, sessionId: "predecessor", what: "CI ui pull requests #1" }, waiters.checkout)
    registerWakeSource({ pid: otherWaiter.pid, sessionId: "other-session", what: "CI ui pull requests #2" }, waiters.checkout)
    await relaySession({ repoRoot: waiters.checkout, sessionId: "predecessor", execute: executeFor(waiters.checkout), wait: async () => {}, confirmMilliseconds: 10 })
    await currentExited
    const liveWaiters = readWakeSourceStates(waiters.checkout).live
    T("relay-session: stops only this session's CI waiters", liveWaiters.length === 1 && liveWaiters[0].pid === otherWaiter.pid)
  } finally {
    currentWaiter.kill()
    otherWaiter.kill()
    await otherExited
  }
}
