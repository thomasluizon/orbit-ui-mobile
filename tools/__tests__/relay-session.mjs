import { spawn, spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as wait } from "node:timers/promises"
import { closeRelayTerminal, relaySession } from "../relay-session.mjs"
import { adoptRelayRun, appendChainEntry, confirmChainSuccessor, openSessionChain, readSessionChain, writeSessionChain } from "../lib/session-chain.mjs"
import { ownerQuestionCandidates, questionFilterGaps, recordQuestionFilter } from "../lib/owner-questions.mjs"
import { processStartIdentity, readRunState, readWakeSourceStates, registerWakeSource, updateRunState, writeRunState } from "../lib/run-state.mjs"
import { readHandoffRequest, recordHandoffRequest } from "../lib/handoff-prompt.mjs"
import { T, realOrchestratorConfig, stageRepo, stageWithConfig, toolPath } from "./_harness.mjs"
import { ANSWERABLE, PRODUCT, exitedPid, reusedPidRecord, stageClaudeSessions } from "./owner-questions-core.mjs"
import { checkRelayStop } from "../../.claude/hooks/_lib/rules-relay.mjs"

const usage = JSON.parse(readFileSync(new URL("./fixtures/session-usage.json", import.meta.url), "utf8"))
const created = readFileSync(new URL("./fixtures/orca-relay-create.json", import.meta.url), "utf8")
const listing = JSON.parse(readFileSync(new URL("./fixtures/orca-relay-list.json", import.meta.url), "utf8"))
const appState = JSON.parse(readFileSync(new URL("./fixtures/orca-relay-app-state.json", import.meta.url), "utf8"))
const prompt = "/sleep\nRead .claude/specs/relay.md. Every identifier is a lead to verify.\n## Goal\nFinish the spec. gh issue list\n## In flight\nNone.\n## Sleep\nContinue.\n## Previous prompt, disposition\nCarried.\n"
/** The shipped crossing value, so every case follows the config instead of a copy of it. */
const relayThreshold = realOrchestratorConfig().relay.softTokens

/** `chain` earlier sessions each relayed with the same `questions`; `filter` records every candidate as queued. */
const fixture = (label, { tokens = relayThreshold, calls = 20, crank = false, crankPrompt = crank, autoWork = false, questions = ["An owner question."], chain = 0, filter = true } = {}) => {
  const repo = stageRepo(`relay-${label}`)
  const checkout = repo.path
  repo.git(["checkout", "-qb", "relay-docs"])
  mkdirSync(join(checkout, ".claude", "handoffs"), { recursive: true })
  mkdirSync(join(checkout, ".claude", "specs"), { recursive: true })
  writeFileSync(join(checkout, ".claude", "orchestrator.json"), JSON.stringify(realOrchestratorConfig()))
  writeFileSync(join(checkout, ".claude", "handoffs", "NEXT.md"), (autoWork ? prompt.replace("/sleep\n", "/auto-work\n") : prompt) + (crankPrompt ? "## Crank\nInvoke /crank immediately after /sleep entry.\n" : ""))
  writeFileSync(join(checkout, ".claude", "specs", "relay.md"), "# Relay\n## Open questions\nAn owner question.\n")
  repo.git(["add", ".claude/handoffs/NEXT.md", ".claude/specs/relay.md", ".claude/orchestrator.json"])
  repo.git(["commit", "-qm", "handoff"])
  repo.git(["push", "-q", "-u", "origin", "relay-docs"])
  const transcriptPath = join(checkout, ".git", "transcript.jsonl")
  const decisionLogPath = join(checkout, ".git", "sleep-decisions.md")
  writeFileSync(decisionLogPath, "Decision and reasoning copied in full.\n")
  writeFileSync(transcriptPath, Array.from({ length: calls }, (_, index) => JSON.stringify({ type: "assistant", timestamp: new Date(Date.now() - (calls - index) * 1000).toISOString(),
    message: { id: `call-${index}`, model: "claude-opus-5-5", usage: { ...usage, cache_read_input_tokens: tokens - 670 } } })).join("\n") + "\n")
  writeRunState({ sessionId: "predecessor", sleep: true, crank, autoWork, intake: { gmail: { completed: ["message-1"] } }, remaining: ["#1091"], decisionLogPath, openOwnerQuestions: questions,
    relay: { from: "predecessor", pending: true, measuredTokens: tokens, permissionMode: "bypassPermissions", transcriptPath, triggeredAt: new Date().toISOString() } }, checkout)
  for (let index = 1; index <= chain; index++) {
    appendChainEntry({ sessionId: `earlier-${index}`, openOwnerQuestions: questions }, checkout)
    confirmChainSuccessor(`earlier-${index}`, index === chain ? "predecessor" : `earlier-${index + 1}`, `term_${index}`, 1, checkout)
  }
  if (filter) recordQuestionFilter("predecessor", ownerQuestionCandidates("predecessor", checkout).map((row) => ({ id: row.id, disposition: "queued" })), checkout)
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

const closeCases = async (successful, result) => {
  const request = { repoRoot: successful.checkout, sessionId: "predecessor", terminalHandle: "term_predecessor", ...result }
  const ledger = readSessionChain(successful.checkout)
  const receipt = () => readSessionChain(successful.checkout).chains[0].entries[0].terminalClose
  for (const mutate of [
    (entry) => { entry.superseded = false },
    (entry) => { entry.successorSessionId = "unconfirmed" },
    (entry) => { entry.successorTerminal = "term_other" },
  ]) {
    const unfenced = structuredClone(ledger)
    mutate(unfenced.chains[0].entries[0])
    writeSessionChain(unfenced, successful.checkout)
    const commands = []
    closeRelayTerminal(request, (_binary, args) => { commands.push(args); return "" })
    T("relay-session: missing chain fence prevents all terminal commands", commands.length === 0 && receipt().status === "refused")
  }
  writeSessionChain(ledger, successful.checkout)
  const successorState = readRunState(successful.checkout)
  writeRunState({ ...successorState, relay: { ...successorState.relay, from: "other" } }, successful.checkout)
  const commands = []
  closeRelayTerminal(request, (_binary, args) => { commands.push(args); return "" })
  T("relay-session: mismatched run successor prevents close", commands.length === 0 && receipt().status === "refused")
  writeRunState(successorState, successful.checkout)
  for (const terminalHandle of ["", result.terminal]) {
    closeRelayTerminal({ ...request, terminalHandle }, (_binary, args) => { commands.push(args); return "" })
    T("relay-session: missing or successor finishing handle prevents close", commands.length === 0 && receipt().status === "refused")
  }
  for (const mode of ["closed", "cli-only", "invisible", "shared-tab", "incomplete", "click-failed", "still-open", "fence-lost", "shared-during-observation", "moved-during-observation", "collateral-close"]) {
    writeSessionChain(ledger, successful.checkout)
    const operations = []
    let clicked = false
    let observed = false
    const snapshot = structuredClone(appState)
    // The installed tab renderer supplies this label; the captured provider supplies index syntax.
    snapshot.result.snapshot.treeText += "\n\t7 botão Close tab Relay predecessor term_predecessor"
    const inventory = structuredClone(listing)
    if (mode === "shared-tab") inventory.result.terminals[1].tabId = inventory.result.terminals[0].tabId
    if (mode === "incomplete") inventory.result.truncated = true
    closeRelayTerminal(request, (_binary, args) => {
      operations.push(args)
      if (args[0] === "terminal" && args[1] === "close") {
        if (mode !== "cli-only") throw new Error("Orca close failed")
      }
      if (args[1] === "list") {
        const remaining = structuredClone(inventory)
        if (observed && mode === "shared-during-observation") remaining.result.terminals[1].tabId = remaining.result.terminals[0].tabId
        if (observed && mode === "moved-during-observation") remaining.result.terminals[0].tabId = "tab_2"
        if (clicked && mode !== "still-open") remaining.result.terminals.shift()
        if (clicked && mode === "collateral-close") remaining.result.terminals.shift()
        return JSON.stringify(remaining)
      }
      if (args[1] === "get-app-state") {
        observed = true
        if (mode === "fence-lost") {
          const unfenced = structuredClone(ledger)
          unfenced.chains[0].entries[0].superseded = false
          writeSessionChain(unfenced, successful.checkout)
        }
        return JSON.stringify(mode === "invisible" ? appState : snapshot)
      }
      if (args[1] === "click") {
        if (mode === "click-failed") throw new Error("computer click failed")
        clicked = true
      }
      return ""
    })
    const computerCommands = operations.filter((args) => args[0] === "computer")
    const succeeded = ["closed", "cli-only"].includes(mode)
    T(`relay-session: ${mode} cleanup records its observed outcome`, receipt().status === (succeeded ? "closed" : "failed") && (!succeeded || receipt().path === (mode === "cli-only" ? "orca-cli" : "computer-use")))
    T(`relay-session: ${mode} fallback never precedes direct close`, operations[0].join(" ") === "terminal close --terminal term_predecessor --json" && (mode !== "cli-only" || computerCommands.length === 0))
    if (mode === "closed") T("relay-session: computer fallback clicks only the fresh predecessor control", operations.some((args) => args.join(" ") === "computer click --app Orca --no-screenshot --json --window-id 42 --element-index 7"))
    if (["invisible", "shared-tab", "incomplete", "fence-lost", "shared-during-observation", "moved-during-observation"].includes(mode)) T(`relay-session: ${mode} fallback refuses an unsafe GUI close`, !clicked)
    if (["shared-during-observation", "moved-during-observation"].includes(mode)) T(`relay-session: ${mode} keeps the unfenced terminal open`, !operations.some((args) => args.includes("term_successor")) && /tab/.test(receipt().failure))
    if (mode === "collateral-close") T("relay-session: a GUI close that removes another terminal is recorded as failed", /also removed term_successor/.test(receipt().failure))
  }
  writeSessionChain(ledger, successful.checkout)
}

const detachedCloseCase = async () => {
  const staged = fixture("detached-close")
  cpSync(toolPath("lib"), join(staged.checkout, "tools", "lib"), { recursive: true })
  cpSync(toolPath("relay-session.mjs"), join(staged.checkout, "tools", "relay-session.mjs"))
  const stub = join(staged.checkout, ".git", "orca-stub.mjs")
  const log = join(staged.checkout, ".git", "closed.json")
  writeFileSync(stub, `#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs"
import { adoptRelayRun, readSessionChain } from "../tools/lib/session-chain.mjs"
import { readRunState } from "../tools/lib/run-state.mjs"
const args = process.argv.slice(2)
if (args[1] === "create") process.stdout.write(${JSON.stringify(created)})
if (args[1] === "send" && args.includes("--text")) adoptRelayRun(readRunState().relay.successorSessionId)
if (args[1] === "close") writeFileSync(${JSON.stringify(log)}, JSON.stringify({ args, entry: readSessionChain().chains[0].entries[0], lockHeld: existsSync(".git/orbit-relay-lock/owner.json") }))
`, { mode: 0o755 })
  const cli = spawnSync(process.execPath, [join(staged.checkout, "tools", "relay-session.mjs")], {
    cwd: staged.checkout, encoding: "utf8", env: { ...process.env, CLAUDE_CODE_SESSION_ID: "predecessor", ORCA_TERMINAL_HANDLE: "term_predecessor", ORCA_CLI_COMMAND: stub }, timeout: 10000,
  })
  let receipt
  for (let attempt = 0; attempt < 100; attempt++) {
    receipt = readSessionChain(staged.checkout).chains[0]?.entries[0]?.terminalClose
    if (receipt?.status === "closed") break
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  const observed = existsSync(log) ? JSON.parse(readFileSync(log, "utf8")) : null
  T("relay-session: detached CLI cleanup follows durable report and lock release", cli.status === 0 && observed?.entry.superseded === true && !observed.lockHeld && JSON.stringify(observed.entry.terminalClose.report) === cli.stdout.trim() && receipt?.status === "closed", cli.stderr)
  T("relay-session: detached CLI closes exactly the finishing handle", observed?.args.join(" ") === "terminal close --terminal term_predecessor --json")
}

const fileWaiterCase = async () => {
  const staged = fixture("file-waiters")
  cpSync(toolPath("lib"), join(staged.checkout, "tools", "lib"), { recursive: true })
  const waiterPath = join(staged.checkout, "tools", "wait-file.mjs")
  cpSync(toolPath("wait-file.mjs"), waiterPath)
  const file = join(staged.checkout, ".git", "DONE")
  const trigger = join(staged.checkout, ".git", "finish-check")
  const check = spawn(process.execPath, ["-e", `
    const { existsSync, writeFileSync } = require("node:fs")
    const timer = setInterval(() => {
      if (!existsSync(${JSON.stringify(trigger)})) return
      writeFileSync(${JSON.stringify(file)}, JSON.stringify({ exitCode: 0 }))
      clearInterval(timer)
    }, 10)
  `], { detached: process.platform !== "win32", stdio: "ignore" })
  const checkClosed = new Promise((resolve) => check.once("close", resolve))
  const waiters = []
  const startWaiter = (sessionId) => {
    const environment = { ...process.env }
    delete environment.CLAUDE_CODE_SESSION_ID
    if (sessionId) environment.CLAUDE_CODE_SESSION_ID = sessionId
    const child = spawn(process.execPath, [waiterPath, "--file", file, "--what", "detached gate", "--poll-seconds", "0.01"], {
      cwd: staged.checkout, env: environment,
    })
    let stdout = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    const closed = new Promise((resolve) => child.once("close", (status) => resolve({ status, stdout })))
    waiters.push({ child, closed })
    return child
  }
  try {
    const current = startWaiter("predecessor")
    const fallback = startWaiter(null)
    const other = startWaiter("other-session")
    let live = []
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      live = readWakeSourceStates(staged.checkout).live
      if (live.length === 3) break
      await wait(10)
    }
    T("relay file waiter: real registrations are live", live.length === 3)
    T("relay file waiter: explicit and run-state session ownership", live.find((source) => source.pid === current.pid)?.sessionId === "predecessor" && live.find((source) => source.pid === fallback.pid)?.sessionId === "predecessor")
    const verdict = checkRelayStop({ enabled: true, softTokens: 400000, hardTokens: 500000, measuredTokens: 400000,
      state: readRunState(staged.checkout), sessionId: "predecessor", wakeSources: live })
    T("relay file waiter: live waiters do not block hook drain", verdict?.begin === false)
    const message = await failure({ repoRoot: staged.checkout, sessionId: "predecessor", execute: executeFor(staged.checkout), wait: async () => {}, confirmMilliseconds: 10 })
    T("relay file waiter: live waiters do not block relay tool", message === null, String(message))
    await Promise.race([Promise.all(waiters.slice(0, 2).map((entry) => entry.closed)), wait(2000)])
    T("relay file waiter: relay stops this session's waiters", current.exitCode === 143 && fallback.exitCode === 143)
    T("relay file waiter: only the other session's registration remains", readWakeSourceStates(staged.checkout).live.map((source) => source.pid).join() === String(other.pid))
    T("relay file waiter: detached check remains running", check.exitCode === null && !existsSync(file))
    if (message === null) {
      const successor = startWaiter(readRunState(staged.checkout).sessionId)
      const successorDeadline = Date.now() + 5000
      while (Date.now() < successorDeadline && !readWakeSourceStates(staged.checkout).live.some((source) => source.pid === successor.pid)) await wait(10)
      T("relay file waiter: successor registers before check completion", readWakeSourceStates(staged.checkout).live.some((source) => source.pid === successor.pid) && !existsSync(file))
      writeFileSync(trigger, "finish")
      const completed = await Promise.race([waiters.at(-1).closed, wait(5000)])
      T("relay file waiter: successor wakes on the same completion file", completed?.status === 0 && JSON.parse(completed.stdout).file === file && JSON.parse(completed.stdout).found === true && successor.exitCode === 0)
    }
  } finally {
    for (const { child } of waiters) child.kill("SIGKILL")
    check.kill("SIGKILL")
    await Promise.all([...waiters.map((entry) => entry.closed), checkClosed])
  }
}

const questionFilterCases = async () => {
  const relay = (staged, operations = []) => failure({ repoRoot: staged.checkout, sessionId: "predecessor", execute: executeFor(staged.checkout, { commands: operations }), wait: async () => {}, confirmMilliseconds: 10 })
  const duplicated = fixture("questions-answerable", { questions: ANSWERABLE, chain: 7, filter: false })
  const unfilteredOperations = []
  const unfiltered = await relay(duplicated, unfilteredOperations)
  T("relay-session: a relay with no recorded question filter is refused before any launch", /relay question filter: no recorded filter/.test(unfiltered) && unfilteredOperations.length === 0 && readRunState(duplicated.checkout).sessionId === "predecessor", String(unfiltered))
  recordQuestionFilter("predecessor", ownerQuestionCandidates("predecessor", duplicated.checkout).map((row) => ({ id: row.id, disposition: "answered", record: "the Decisions section of the spec" })), duplicated.checkout)
  const settled = await relay(duplicated)
  const emptied = readRunState(duplicated.checkout)
  T("relay-session: a relay with 16 answerable duplicate questions queues 0", settled === null && emptied.sessionId !== "predecessor" && emptied.openOwnerQuestions.length === 0, String(settled))
  T("relay-session: the successor owes its own filter before the next relay", /no recorded filter/.test(questionFilterGaps(emptied.sessionId, duplicated.checkout).join()))
  const settledEntry = openSessionChain(emptied.sessionId, duplicated.checkout).entries.at(-1)
  T("relay-session: the chain keeps the 16 dispositions and the successor owes none of them again", settledEntry.questionFilter.dispositions.length === 16 && ownerQuestionCandidates(emptied.sessionId, duplicated.checkout).length === 0)

  const product = { question: PRODUCT, blocks: ["#2101"] }
  const surviving = fixture("questions-product", { questions: [...ANSWERABLE, product], chain: 3, filter: false })
  const filter = () => recordQuestionFilter("predecessor", ownerQuestionCandidates("predecessor", surviving.checkout).map((row) =>
    row.question === product.question ? { id: row.id, disposition: "queued" } : { id: row.id, disposition: "decided", record: "decision log" }), surviving.checkout)
  filter()
  updateRunState((state) => ({ ...state, openOwnerQuestions: [...state.openOwnerQuestions, "Which file holds the mapper?"] }), surviving.checkout, { sessionId: "predecessor" })
  const lateOperations = []
  const late = await relay(surviving, lateOperations)
  T("relay-session: a question that enters the queue after the filter refuses the relay", late === "relay question filter: no disposition for: Which file holds the mapper?" && lateOperations.length === 0, String(late))
  filter()
  const carried = await relay(surviving)
  const inherited = readRunState(surviving.checkout)
  T("relay-session: a real product question survives once in the successor queue", carried === null && inherited.sessionId !== "predecessor" && inherited.openOwnerQuestions.length === 1 && inherited.openOwnerQuestions[0].question === product.question, String(carried))
  T("relay-session: the surviving question keeps every source and blocker", inherited.openOwnerQuestions[0].sources.join() === "earlier-1,earlier-2,earlier-3,predecessor" && inherited.openOwnerQuestions[0].blocks.join() === "#2101", JSON.stringify(inherited.openOwnerQuestions))
}

/** An owner handoff never runs /questions --relay, so its chain closure needs neither that pass nor, with no open chain, the run state. */
const ownerHandoffCases = () => {
  let staged = 0
  /** The unattended session is live: its Claude session record names this live process. */
  const liveClaude = stageClaudeSessions("relay-owner-live", { owner: process.pid, unattended: process.pid })
  const ownerCheckout = (state, claudeDirectory = liveClaude) => {
    const installation = stageWithConfig(`relay-owner-${++staged}`, "relay-session.mjs", realOrchestratorConfig())
    mkdirSync(join(installation.base, ".git"), { recursive: true })
    if (state) writeRunState(state(installation.base), installation.base)
    recordHandoffRequest("owner", { command: "wrap-up", sleep: true, crank: false, origin: "owner" }, new Date().toISOString(), installation.base)
    const invoke = (flag) => spawnSync(process.execPath, [installation.path, flag], { encoding: "utf8", env: { ...process.env, CLAUDE_CODE_SESSION_ID: "owner", CLAUDE_CONFIG_DIR: claudeDirectory } })
    return { checkout: installation.base, invoke }
  }
  /** A finished attended run of another session, complete enough that a chain entry could be built from it. */
  const finishedRun = (checkout) => {
    const transcriptPath = join(checkout, ".git", "finished.jsonl")
    const decisionLogPath = join(checkout, ".git", "finished-decisions.md")
    writeFileSync(transcriptPath, `${JSON.stringify({ type: "assistant", timestamp: new Date().toISOString(), message: { id: "call-0", model: "claude-opus-5-5", usage } })}\n`)
    writeFileSync(decisionLogPath, "A decision of the finished run.\n")
    return { sessionId: "finished", sleep: false, autoWork: false, transcriptPath, decisionLogPath, openOwnerQuestions: [...ANSWERABLE, PRODUCT] }
  }

  const unowned = ownerCheckout(finishedRun)
  let relayPassRefusal = null
  try { recordQuestionFilter("owner", [], unowned.checkout, liveClaude) } catch (error) { relayPassRefusal = error.message }
  const unownedClosed = unowned.invoke("--close-chain")
  const untouched = readRunState(unowned.checkout)
  T("relay-session: an owner handoff in a session that owns no run closes without the relay pass that would refuse it", /has no disposition/.test(relayPassRefusal) &&
    unownedClosed.status === 0 && unownedClosed.stderr === "" && untouched.sessionId === "finished" && untouched.questionFilter === undefined &&
    untouched.openOwnerQuestions.length === ANSWERABLE.length + 1, `${relayPassRefusal} ${unownedClosed.stderr}`)

  /** Every file under the checkout, its git directory included, plus the refs its origin holds. */
  const snapshot = (repo) => {
    const files = {}
    const walk = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) walk(path)
        else files[path] = readFileSync(path, "base64")
      }
    }
    walk(repo.path)
    return JSON.stringify({ files, origin: repo.git(["ls-remote", "origin"]).stdout })
  }
  const nextSteps = {
    sleep: "session unattended runs unattended in this checkout; say stop in that session, then run this handoff again",
    "auto-work handoff": "session unattended handed off an auto-work run that no successor adopted yet; start that successor from the committed NEXT.md, then run this handoff again",
  }
  for (const [label, run] of [["sleep", { sleep: true }], ["auto-work handoff", { sleep: false, autoWork: true, ownerHandoff: { from: "unattended", promptHash: "bound" } }]]) {
    const repo = stageRepo(`relay-owner-check-${label.replace(/\W+/g, "-")}`)
    cpSync(toolPath("lib"), join(repo.path, "tools", "lib"), { recursive: true })
    cpSync(toolPath("relay-session.mjs"), join(repo.path, "tools", "relay-session.mjs"))
    writeRunState({ sessionId: "unattended", ...run }, repo.path)
    recordHandoffRequest("owner", { command: "wrap-up", sleep: true, crank: false, origin: "owner" }, new Date().toISOString(), repo.path)
    const before = snapshot(repo)
    const checked = spawnSync(process.execPath, [join(repo.path, "tools", "relay-session.mjs"), "--owner-check"], { encoding: "utf8", env: { ...process.env, CLAUDE_CODE_SESSION_ID: "owner", CLAUDE_CONFIG_DIR: liveClaude } })
    T(`relay-session: --owner-check beside another session's ${label} names the owner's next step and writes or pushes nothing`, checked.status === 1 &&
      checked.stderr === `RELAY_FAILED: ${nextSteps[label]}\n` && snapshot(repo) === before, checked.stderr)
    const beside = ownerCheckout(() => ({ sessionId: "unattended", ...run }))
    const refused = beside.invoke("--close-chain")
    T(`relay-session: --close-chain beside another session's ${label} repeats that refusal and binds no carry for the owner`, refused.status === 1 &&
      refused.stderr === `RELAY_FAILED: ${nextSteps[label]}\n` && readRunState(beside.checkout).ownerHandoff?.from !== "owner", refused.stderr)
  }
  const reusedPid = reusedPidRecord(process.pid)
  for (const [label, sessions] of [["has no session record", {}], ["has a session record of a process that exited", { unattended: exitedPid() }],
    ["has a session record whose pid a later process reuses", { unattended: reusedPid }]]) {
    const gone = ownerCheckout(() => ({ sessionId: "unattended", sleep: true }), stageClaudeSessions(`relay-owner-gone-${label.replace(/\W+/g, "-")}`, { owner: process.pid, ...sessions }))
    const goneCheck = gone.invoke("--owner-check")
    const goneClose = gone.invoke("--close-chain")
    T(`relay-session: an unattended run of another session that ${label} never blocks an owner handoff`, goneCheck.status === 0 && goneClose.status === 0 &&
      readRunState(gone.checkout).sessionId === "unattended", `${goneCheck.stderr} ${goneClose.stderr}`)
  }
  const blindClaude = stageClaudeSessions("relay-owner-blind", {})
  const blind = ownerCheckout(() => ({ sessionId: "unattended", sleep: true }), blindClaude)
  const blindCheck = blind.invoke("--owner-check")
  const unseen = `cannot find this session's Claude session record in ${join(blindClaude, "sessions")}, so the liveness of session unattended is unknown; use a session on the Claude account of session unattended, then run this handoff again`
  T("relay-session: --owner-check that cannot find this session's own Claude session record keeps the unattended run's hold and names why", blindCheck.status === 1 &&
    blindCheck.stderr === `RELAY_FAILED: ${unseen}\n`, blindCheck.stderr)
  const relaying = ownerCheckout(() => ({ sessionId: "unattended", sleep: true, relay: { pending: true, successorSessionId: "nominee", successorTerminal: "term_nominee" } }),
    stageClaudeSessions("relay-owner-nominee", { owner: process.pid, unattended: exitedPid(), nominee: process.pid }))
  const relayingCheck = relaying.invoke("--owner-check")
  T("relay-session: a pending relay whose predecessor died holds the run while its nominee is live", relayingCheck.status === 1 &&
    relayingCheck.stderr === "RELAY_FAILED: session nominee is the relay successor of session unattended and has not adopted the run yet; wait for that relay to finish, or say stop in session nominee, then run this handoff again\n", relayingCheck.stderr)
  const adopted = { ownerHandoff: { from: "earlier", promptHash: "bound", successorSessionId: "stopped" } }
  for (const [label, record] of [["a stopped auto-work run", {}], ["an adopted, then stopped auto-work run", adopted]]) {
    const stopped = ownerCheckout(() => ({ sessionId: "stopped", sleep: false, autoWork: true, ...record }))
    const stoppedCheck = stopped.invoke("--owner-check")
    const stoppedClose = stopped.invoke("--close-chain")
    T(`relay-session: ${label} of another session never blocks an owner handoff`, stoppedCheck.status === 0 && stoppedClose.status === 0 &&
      JSON.stringify(readRunState(stopped.checkout).ownerHandoff) === JSON.stringify(record.ownerHandoff), `${stoppedCheck.stderr} ${stoppedClose.stderr}`)
  }

  const foreignChain = ownerCheckout(finishedRun)
  appendChainEntry({ sessionId: "earlier" }, foreignChain.checkout)
  confirmChainSuccessor("earlier", "owner", "term_owner", 1, foreignChain.checkout)
  const wrongClosure = foreignChain.invoke("--close-chain")
  const ledger = readSessionChain(foreignChain.checkout)
  T("relay-session: an owner handoff never closes its chain from another session's run state", wrongClosure.status === 1 && wrongClosure.stderr.includes("no matching CLAUDE_CODE_SESSION_ID") &&
    openSessionChain("owner", foreignChain.checkout)?.entries.length === 1 && ledger.chains.length === 1, `${wrongClosure.stderr} ${JSON.stringify(ledger.chains)}`)

  const foreignRetry = ownerCheckout((checkout) => ({ ...finishedRun(checkout), relay: { pending: true, lastAttemptAt: "2026-01-01T00:00:00.000Z" } }))
  const retry = foreignRetry.invoke("--retry-wake")
  T("relay-session: a retry wake from a session that owns no run is refused", retry.status === 1 && retry.stderr.includes("no matching CLAUDE_CODE_SESSION_ID") && retry.stdout === "", `${retry.stdout} ${retry.stderr}`)

  const owned = fixture("questions-owner", { questions: [...ANSWERABLE, PRODUCT], chain: 2, filter: false })
  recordHandoffRequest("predecessor", { command: "wrap-up", origin: "owner" }, new Date().toISOString(), owned.checkout)
  cpSync(toolPath("lib"), join(owned.checkout, "tools", "lib"), { recursive: true })
  cpSync(toolPath("relay-session.mjs"), join(owned.checkout, "tools", "relay-session.mjs"))
  const closed = spawnSync(process.execPath, [join(owned.checkout, "tools", "relay-session.mjs"), "--close-chain"], { encoding: "utf8", env: { ...process.env, CLAUDE_CODE_SESSION_ID: "predecessor" } })
  const closedEntry = readSessionChain(owned.checkout).chains.find((chain) => chain.entries.some((entry) => entry.sessionId === "predecessor"))?.entries.at(-1)
  T("relay-session: an owner handoff that owns its run closes its chain with an unfiltered question queue", closed.status === 0 && openSessionChain("predecessor", owned.checkout) === null &&
    readRunState(owned.checkout).questionFilter === undefined && closedEntry?.openOwnerQuestions.length === ANSWERABLE.length + 1, closed.stderr)
}

export const cases = async () => {
  await fileWaiterCase()
  await questionFilterCases()
  ownerHandoffCases()
  for (const [label, options, message] of [["below", { tokens: relayThreshold - 1 }, /below the soft threshold/], ["young", { calls: 19 }, /at least 20/]]) {
    const staged = fixture(label, options)
    T(`relay-session: refuses ${label}`, message.test(await failure({ repoRoot: staged.checkout, sessionId: "predecessor" })))
  }
  for (const source of ["state", "request"]) {
    const missing = fixture(`crank-missing-${source}`, { crank: source === "state", crankPrompt: false })
    if (source === "request") recordHandoffRequest("predecessor", { command: "handoff", sleep: true, crank: true }, new Date().toISOString(), missing.checkout)
    const operations = []
    const message = await failure({ repoRoot: missing.checkout, sessionId: "predecessor", execute: executeFor(missing.checkout, { commands: operations }) })
    T(`relay-session: crank from ${source} refuses a prompt without its section`, /NEXT.md misses:.*## Crank/.test(message), String(message))
    T(`relay-session: crank from ${source} launches no successor before prompt validation`, operations.length === 0)
    T(`relay-session: crank from ${source} is retained in the relay request`, readHandoffRequest("predecessor", missing.checkout)?.crank === true)
  }
  for (const newerRequest of [false, true]) {
    const staged = fixture(`crank-disable-${newerRequest}`, { crank: true, crankPrompt: newerRequest })
    recordHandoffRequest("predecessor", { command: "handoff", origin: "context-relay", sleep: true, crank: true }, new Date().toISOString(), staged.checkout)
    writeRunState({ ...readRunState(staged.checkout), crank: false }, staged.checkout)
    if (newerRequest) recordHandoffRequest("predecessor", { command: "handoff", origin: "owner", sleep: true, crank: true }, new Date().toISOString(), staged.checkout)
    const operations = []
    const message = await failure({ repoRoot: staged.checkout, sessionId: "predecessor", execute: executeFor(staged.checkout, { commands: operations }), wait: async () => {}, confirmMilliseconds: 10 })
    T(`relay-session: ${newerRequest ? "newer request enables" : "disable supersedes threshold"} through publication and entry`, message === null && readRunState(staged.checkout).crank === newerRequest, String(message))
    T("relay-session: published relay request matches the latest mode", readHandoffRequest("predecessor", staged.checkout)?.crank === newerRequest)
    T("relay-session: successor receives the matching committed prompt", operations.some((args) => args[1] === "send" && args.includes("--text") && args[args.indexOf("--text") + 1].includes("## Crank") === newerRequest))
  }
  const cranked = fixture("crank-success", { crank: true })
  const automatic = fixture("auto-work-success", { autoWork: true })
  const automaticResult = await relaySession({ repoRoot: automatic.checkout, sessionId: "predecessor", execute: executeFor(automatic.checkout), wait: async () => {}, confirmMilliseconds: 10 })
  T("relay-session: published auto-work prompt survives real adoption", readRunState(automatic.checkout).autoWork === true && readRunState(automatic.checkout).intake.gmail.completed[0] === "message-1" && readRunState(automatic.checkout).sessionId === automaticResult.successorSessionId)
  const crankedOperations = []
  const crankedResult = await relaySession({ repoRoot: cranked.checkout, sessionId: "predecessor", execute: executeFor(cranked.checkout, { commands: crankedOperations }), wait: async () => {}, confirmMilliseconds: 10 })
  T("relay-session: crank successor inherits the durable mode and queue", readRunState(cranked.checkout).crank === true && readRunState(cranked.checkout).sessionId === crankedResult.successorSessionId && readRunState(cranked.checkout).remaining[0] === "#1091")
  T("relay-session: successor receives crank instructions after sleep entry", crankedOperations.some((args) => args[1] === "send" && args.includes("--text") && args[args.indexOf("--text") + 1].includes("## Crank\nInvoke /crank immediately after /sleep entry.")))
  const disabled = readRunState(cranked.checkout)
  writeRunState({ ...disabled, crank: false, relay: { ...disabled.relay, pending: true, successorSessionId: "disabled-successor" } }, cranked.checkout)
  adoptRelayRun("disabled-successor", cranked.checkout)
  T("relay-session: disabling remains false through the next adoption", readRunState(cranked.checkout).crank === false && readRunState(cranked.checkout).remaining[0] === "#1091")
  const successful = fixture("success")
  const commands = []
  let reported = false
  let closedAfterReport = false
  const execute = executeFor(successful.checkout, { commands })
  const result = await relaySession({ repoRoot: successful.checkout, sessionId: "predecessor", terminalHandle: "term_predecessor", execute: (binary, args, cwd, environment) => {
    if (args[1] === "close") {
      const entry = readSessionChain(successful.checkout).chains[0].entries[0]
      closedAfterReport = reported && entry.superseded === true && entry.successorSessionId === readRunState(successful.checkout).sessionId && !existsSync(join(successful.checkout, ".git", "orbit-relay-lock", "owner.json")) && entry.terminalClose.report.terminal === "term_successor"
    }
    return execute(binary, args, cwd, environment)
  }, report: async () => { reported = true }, wait: async () => {}, confirmMilliseconds: 10 })
  T("relay-session: closes the finishing handle after successor confirmation", commands.some((args) => args.join(" ") === "terminal close --terminal term_predecessor --json"))
  T("relay-session: all relay reporting and lock release precede predecessor close", closedAfterReport)
  T("relay-session: confirms only the nominated sleep successor", result.terminal === "term_successor" && readRunState(successful.checkout).relay.from === "predecessor")
  const entry = openSessionChain(result.successorSessionId, successful.checkout).entries[0]
  T("relay-session: chain records measured metrics, complete decisions and questions", entry.measuredTokens === relayThreshold && entry.assistantCalls === 20 && entry.decisions === "Decision and reasoning copied in full.\n" && entry.openOwnerQuestions[0].question === "An owner question." && entry.questionFilter.dispositions[0].disposition === "queued" && entry.superseded === true)
  T("relay-session: no terminal operation uses an empty handle", commands.filter((args) => ["send", "wait", "close"].includes(args[1])).every((args) => ["term_successor", "term_predecessor"].includes(args[args.indexOf("--terminal") + 1])))
  const command = commands.find((args) => args[1] === "create").at(-2)
  T("relay-session: successor command contains no evaluated source", !/eval|node -e|Buffer.from/.test(command))
  let launchPayload
  try { launchPayload = JSON.parse(Buffer.from(command.split(" ").at(-1), "base64").toString()) } catch { launchPayload = null }
  T("relay-session: model, permission, session and cwd are passed as data", launchPayload?.model === "claude-opus-5-5" && launchPayload?.permissionMode === "bypassPermissions" && launchPayload?.sessionId === result.successorSessionId && launchPayload?.repoRoot === successful.checkout)
  await closeCases(successful, result)
  await detachedCloseCase()

  for (const loseFence of [false, true]) {
    const staged = fixture(loseFence ? "lost-fence" : "cleanup-failure")
    const operations = []
    const invoke = executeFor(staged.checkout, { commands: operations })
    const outcome = await relaySession({ repoRoot: staged.checkout, sessionId: "predecessor", terminalHandle: "term_predecessor", wait: async () => {}, confirmMilliseconds: 10,
      report: async () => {
        if (loseFence) {
          const unfenced = readSessionChain(staged.checkout)
          unfenced.chains[0].entries[0].superseded = false
          writeSessionChain(unfenced, staged.checkout)
        }
      }, execute: (binary, args, cwd, environment) => {
        if (args[1] === "close" || args[1] === "list") { operations.push(args); throw new Error("cleanup unavailable") }
        return invoke(binary, args, cwd, environment)
      } })
    const entry = readSessionChain(staged.checkout).chains[0].entries[0]
    T(`relay-session: ${loseFence ? "lost fence" : "both close paths failing"} retains successful relay and records cleanup failure`, outcome.successorSessionId === readRunState(staged.checkout).sessionId && entry.terminalClose.status === "failed")
    if (loseFence) T("relay-session: a fence lost after reporting prevents predecessor close", !operations.some((args) => args[1] === "close"))
  }

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
  const late = fixture("late-adoption")
  const lateExecute = executeFor(late.checkout, { confirm: false })
  const callerSession = process.env.CLAUDE_CODE_SESSION_ID
  process.env.CLAUDE_CODE_SESSION_ID = "predecessor"
  let lateOutcome
  try {
    lateOutcome = await relaySession({ repoRoot: late.checkout, sessionId: "predecessor", wait: async () => {}, confirmMilliseconds: 1,
      execute: (binary, args, cwd, environment) => {
        if (args[1] === "send" && !args.includes("--text")) adoptRelayRun(readRunState(late.checkout).relay.successorSessionId, late.checkout)
        return lateExecute(binary, args, cwd, environment)
      } })
  } catch (error) { lateOutcome = error } finally {
    if (callerSession === undefined) delete process.env.CLAUDE_CODE_SESSION_ID
    else process.env.CLAUDE_CODE_SESSION_ID = callerSession
  }
  T("relay-session: the predecessor's rollback keeps a successor that adopted late, under the predecessor's own session id",
    typeof lateOutcome?.successorSessionId === "string" && lateOutcome.successorSessionId === readRunState(late.checkout).sessionId,
    JSON.stringify(lateOutcome?.message ?? lateOutcome))
  const live = fixture("live")
  registerWakeSource({ pid: process.pid, what: "Worker launcher", sessionId: "predecessor" }, live.checkout)
  mkdirSync(join(live.checkout, "tools"), { recursive: true })
  cpSync(toolPath("relay-session.mjs"), join(live.checkout, "tools", "relay-session.mjs"))
  cpSync(toolPath("lib"), join(live.checkout, "tools", "lib"), { recursive: true })
  const cli = spawnSync(process.execPath, [join(live.checkout, "tools", "relay-session.mjs")], { encoding: "utf8", env: { ...process.env, CLAUDE_CODE_SESSION_ID: "predecessor" } })
  T("relay-session: real CLI refuses a live launcher by pid", cli.status === 1 && cli.stderr.includes(String(process.pid)))
  const background = fixture("background-runs")
  const directory = join(background.checkout, ".git", "orbit-background-runs", "predecessor")
  mkdirSync(directory, { recursive: true })
  const identity = processStartIdentity(process.pid)
  for (const type of ["workflow", "subagent"]) writeFileSync(join(directory, `${type}-task.json`), JSON.stringify({
    id: `${type}-task`, type, sessionId: "predecessor", pid: process.pid, processStartIdentity: identity,
  }))
  mkdirSync(join(background.checkout, "tools"), { recursive: true })
  cpSync(toolPath("relay-session.mjs"), join(background.checkout, "tools", "relay-session.mjs"))
  cpSync(toolPath("lib"), join(background.checkout, "tools", "lib"), { recursive: true })
  const refusedLaunch = join(background.checkout, ".git", "refuse-launch.mjs")
  writeFileSync(refusedLaunch, "#!/usr/bin/env node\nprocess.stderr.write('unexpected successor launch'); process.exit(9)\n", { mode: 0o755 })
  const backgroundCli = spawnSync(process.execPath, [join(background.checkout, "tools", "relay-session.mjs")], {
    encoding: "utf8", env: { ...process.env, CLAUDE_CODE_SESSION_ID: "predecessor", ORCA_CLI_COMMAND: refusedLaunch },
  })
  T("relay-session: real CLI refuses and names every background run", backgroundCli.status === 1 && backgroundCli.stderr.includes("workflow-task") && backgroundCli.stderr.includes("subagent-task"), backgroundCli.stderr)
  for (const type of ["workflow", "subagent"]) writeFileSync(join(directory, `${type}-task.json`), JSON.stringify({
    id: `${type}-task`, type, sessionId: "predecessor", pid: process.pid, processStartIdentity: "previous process",
  }))
  T("relay-session: stale background records allow the successor to proceed", await failure({
    repoRoot: background.checkout, sessionId: "predecessor", execute: executeFor(background.checkout), wait: async () => {}, confirmMilliseconds: 10,
  }) === null)
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
