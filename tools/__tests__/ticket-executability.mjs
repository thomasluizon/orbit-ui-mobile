import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { processIsRunning, realOrchestratorConfig, root, stage, stageWithConfig, T } from "./_harness.mjs"

const TOOL = "lib/ticket-executability.mjs"
const fixtures = JSON.parse(readFileSync(new URL("../__fixtures__/ticket-classifier-cases.json", import.meta.url), "utf8"))
const responses = JSON.parse(readFileSync(new URL("../__fixtures__/ticket-classifier-responses.json", import.meta.url), "utf8"))
const envelope = JSON.parse(readFileSync(new URL("../__fixtures__/ticket-classifier-envelope.json", import.meta.url), "utf8"))
const CACHE_VARIABLE = "ORBIT_CLASSIFIER_CACHE_FILE"
const cacheDirectory = join(root, "ticket-executability", "cache")
const cachePath = (name) => join(cacheDirectory, `${name}.json`)
// Every module instance reads its own cache file, so no case sees another case's stored answer.
const load = async (name, cacheFile = cachePath(name)) => {
  process.env[CACHE_VARIABLE] = cacheFile
  return import(`../lib/ticket-executability.mjs?test=${name}`)
}
const storedCache = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch {
    return null
  }
}
const storedKeys = (file) => Object.keys(storedCache(file)?.entries ?? {})
const replay = (response, count) => async (input, args) => {
  count.calls++
  T(`${TOOL}: invocation disables tools and customizations`, args.includes("--strict-mcp-config") && args[args.indexOf("--tools") + 1] === "" && args.includes("--safe-mode") && args.includes("--disable-slash-commands"))
  T(`${TOOL}: invocation supplies a structured-output schema`, args[args.indexOf("--output-format") + 1] === "json" && JSON.parse(args[args.indexOf("--json-schema") + 1]).required.join(",") === "deferrals,signals")
  return { code: 0, stdout: JSON.stringify({ ...envelope, structured_output: response }), stderr: "" }
}

export const cases = async () => {
  const originalFetch = globalThis.fetch
  const originalCacheFile = process.env[CACHE_VARIABLE]
  mkdirSync(cacheDirectory, { recursive: true })
  globalThis.fetch = () => { throw new Error("classifier tests must not use fetch") }
  const ticketContract = readFileSync(new URL("../../.claude/skills/ticket/SKILL.md", import.meta.url), "utf8")
  const rootContract = readFileSync(new URL("../../CLAUDE.md", import.meta.url), "utf8")
  const plannerContract = readFileSync(new URL("../../.claude/agents/product-manager.md", import.meta.url), "utf8")
  const auditTicketContract = readFileSync(new URL("../../.claude/skills/_shared/audit-to-tickets.md", import.meta.url), "utf8")
  const orchestrateContract = readFileSync(new URL("../../.claude/skills/orchestrate/SKILL.md", import.meta.url), "utf8")
  T(
    `${TOOL}: ticket policy recommends coherent smaller tickets at separable behavior boundaries`,
    /split separable behavior or deployment\s+boundaries/.test(ticketContract),
    "the canonical ticket contract lost its coherent-splitting guidance",
  )
  T(
    `${TOOL}: ticket policy keeps atomic behavior and mandatory generated output together without a numeric gate`,
    /Do not split one atomic behavior merely to satisfy a numeric threshold/.test(ticketContract) &&
      /Never split those artifacts\s+away from the change that requires them/.test(ticketContract) &&
      !/CAPS-OVERRIDE/.test(ticketContract),
    "the canonical ticket contract permits a numeric or generated-artifact split",
  )
  T(
    `${TOOL}: every always-loaded ticket planner treats counts as advisory`,
    [rootContract, plannerContract, auditTicketContract].every((contract) => !/(?:under|target under)\s+~?400\s+lines/i.test(contract)) &&
      [rootContract, plannerContract, auditTicketContract].every((contract) => /(?:advisory|planning signals)/i.test(contract)),
    "an always-loaded planner still imposes a numeric PR-size policy",
  )
  T(
    `${TOOL}: a failed worker remains owned by the bounded readiness loop`,
    /failed worker attempt is recorded, but its ticket is not silently skipped/.test(orchestrateContract) &&
      /keep the PR in\s+the bounded readiness loop/.test(orchestrateContract) &&
      !/A failed ticket is recorded and skipped/.test(orchestrateContract),
    "the queue contract can still abandon final-head readiness debt",
  )
  T(
    `${TOOL}: Cloud UI delivery runs the owed sweep locally before opening the pull request`,
    /after materialization and\s+before opening or updating the pull request/.test(orchestrateContract) &&
      /\.claude\/playbooks\/redesign-screen\.md/.test(orchestrateContract) &&
      /## Review harness/.test(orchestrateContract) &&
      /- interface-review: <what it found, or "no findings">/.test(orchestrateContract) &&
      /- better-interface \(full mode\): <what it found, or "no findings">/.test(orchestrateContract),
    "the Cloud handoff can still reach pull request delivery without the locally produced review evidence",
  )

  for (const entry of fixtures) {
    const module = await load(entry.id)
    const count = { calls: 0 }
    const run = replay(responses[entry.id], count)
    const executable = await module.classifyExecutability(entry.body, { run, retryDelayMs: 0 })
    const conversation = await module.classifyConversationFirst(entry.body, { labels: entry.labels, run, retryDelayMs: 0 })
    const deferrals = executable.deferrals.map((item) => item.reason)
    const signals = conversation.signals.map((item) => item.kind)
    T(`${TOOL}: ${entry.id} replay verdict`, JSON.stringify({ deferrals, signals }) === JSON.stringify(entry.expected), JSON.stringify({ deferrals, signals, expected: entry.expected }))
    T(`${TOOL}: ${entry.id} shares one model call`, count.calls === 1, `calls: ${count.calls}`)
    T(`${TOOL}: ${entry.id} emits no warnings`, executable.warnings.length === 0)
    T(`${TOOL}: ${entry.id} pairs questions with signals`, conversation.questions.length === conversation.signals.length)
    if (entry.id === "first_scope_repro") T(`${TOOL}: first Scope repro keeps its detail template`, executable.deferrals[0]?.detail.startsWith("the first Scope item is"))
  }

  const injection = JSON.parse(readFileSync(new URL("../__fixtures__/ticket-classifier-injection.json", import.meta.url), "utf8"))
  const injectionModule = await load("prompt-injection")
  const injectionCount = { calls: 0 }
  const injectionRun = replay(injection.response, injectionCount)
  const injectionExecutable = await injectionModule.classifyExecutability(injection.body, { run: injectionRun })
  const injectionConversation = await injectionModule.classifyConversationFirst(injection.body, { run: injectionRun })
  T(`${TOOL}: injected instructions preserve the recorded deferral`, JSON.stringify({ deferrals: injectionExecutable.deferrals.map((item) => item.reason), signals: injectionConversation.signals.map((item) => item.kind) }) === JSON.stringify(injection.expected) && injectionCount.calls === 1)

  const { sectionsOf, inScopeSections } = await load("parser")
  T(`${TOOL}: parser exports remain available`, typeof sectionsOf === "function" && typeof inScopeSections === "function")
  T(`${TOOL}: nested Out of scope is excluded`, inScopeSections(sectionsOf("## Out of scope\n\n### Work\n\nNot code\n\n## Scope\n\nCode")).map((item) => item.heading).join(",") === ",Scope")

  const serialModule = await load("serial-calls")
  let activeCalls = 0
  let maximumCalls = 0
  const serialRun = async (input, args) => {
    activeCalls++
    maximumCalls = Math.max(maximumCalls, activeCalls)
    await new Promise((resolve) => setTimeout(resolve, 10))
    activeCalls--
    return { code: 0, stdout: JSON.stringify({ ...envelope, structured_output: responses.ordinary }) }
  }
  await Promise.all([
    serialModule.classifyExecutability("## Scope\n\n- First ordinary task", { run: serialRun }),
    serialModule.classifyExecutability("## Scope\n\n- Second ordinary task", { run: serialRun }),
  ])
  T(`${TOOL}: distinct ticket calls stay sequential`, maximumCalls === 1)

  const pencil = fixtures.find((item) => item.id === "pencil")
  const pencilModule = await load("pencil-question")
  const pencilConversation = await pencilModule.classifyConversationFirst(pencil.body, { run: replay(responses.pencil, { calls: 0 }) })
  T(`${TOOL}: tool question carries both quotes and the name`, pencilConversation.questions[0]?.includes("Pencil") && pencilConversation.questions[0]?.includes(responses.pencil.signals[0].counterQuote))
  T(`${TOOL}: tool internals stay inside the classifier`, Object.keys(pencilConversation.signals[0]).sort().join(",") === "heading,kind,quote")

  const orderedModule = await load("ordered-signals")
  const orderedBody = `${pencil.body}\n${fixtures.find((item) => item.id === "product_call").body}`
  const ordered = { deferrals: [], signals: [responses.pencil.signals[0], responses.product_call.signals[0], responses.pencil.signals[0]] }
  const orderedResult = await orderedModule.classifyConversationFirst(orderedBody, { run: replay(ordered, { calls: 0 }) })
  T(`${TOOL}: duplicate signals collapse into fixed order`, orderedResult.signals.map((item) => item.kind).join(",") === "PRODUCT_CALL,TOOL_CONTRADICTION")
  const orderedDeferralsModule = await load("ordered-deferrals")
  const orderedDeferralsBody = `${fixtures.find((item) => item.id === "not_reproduced").body}\n${fixtures.find((item) => item.id === "no_code").body}`
  const orderedDeferrals = { deferrals: [responses.no_code.deferrals[0], responses.not_reproduced.deferrals[0], responses.no_code.deferrals[0]], signals: [] }
  const orderedExecutable = await orderedDeferralsModule.classifyExecutability(orderedDeferralsBody, { run: replay(orderedDeferrals, { calls: 0 }) })
  T(`${TOOL}: duplicate deferrals collapse into fixed order`, orderedExecutable.deferrals.map((item) => item.reason).join(",") === "NOT_REPRODUCED,NOT_CODE_WORK")

  const invalidModule = await load("missing-field")
  const invalid = { ...responses.not_reproduced }
  delete invalid.deferrals
  const invalidResult = await invalidModule.classifyConversationFirst(fixtures.find((item) => item.id === "not_reproduced").body, { run: replay(invalid, { calls: 0 }), retryDelayMs: 0 })
  T(`${TOOL}: missing schema field fails closed`, invalidResult.signals[0]?.kind === "CLASSIFIER_ERROR")

  const missingOutputModule = await load("missing-structured-output")
  const missingOutputEnvelope = { ...envelope }
  delete missingOutputEnvelope.structured_output
  const missingOutputResult = await missingOutputModule.classifyConversationFirst("## Scope\n\n- Fix a missing structured answer", { run: async () => ({ code: 0, stdout: JSON.stringify(missingOutputEnvelope) }) })
  T(`${TOOL}: an envelope without structured output fails closed`, missingOutputResult.signals[0]?.kind === "CLASSIFIER_ERROR")

  const outsideModule = await load("outside-quote")
  const outsideBody = fixtures.find((item) => item.id === "orb223").body
  const outside = { deferrals: [{ reason: "NOT_CODE_WORK", heading: "Out of scope", quote: "HUMAN-ONLY" }], signals: [] }
  const outsideResult = await outsideModule.classifyConversationFirst(outsideBody, { run: replay(outside, { calls: 0 }), retryDelayMs: 0 })
  T(`${TOOL}: Out of scope evidence fails closed`, outsideResult.signals[0]?.kind === "CLASSIFIER_ERROR")

  const changedQuoteModule = await load("changed-quote")
  const quoteBody = fixtures.find((item) => item.id === "not_reproduced").body
  const changedQuote = structuredClone(responses.not_reproduced)
  changedQuote.deferrals[0].quote += "x"
  const changedQuoteResult = await changedQuoteModule.classifyConversationFirst(quoteBody, { run: replay(changedQuote, { calls: 0 }), retryDelayMs: 0 })
  T(`${TOOL}: altered evidence fails closed`, changedQuoteResult.signals[0]?.kind === "CLASSIFIER_ERROR")

  const failureModule = await load("process-failure")
  const failed = await failureModule.classifyConversationFirst("## Scope\n\n- Fix code", { run: async () => ({ code: 1, stdout: "", stderr: "secret" }), retryDelayMs: 0 })
  T(`${TOOL}: CLI failure needs conversation`, failed.source === "classifier" && failed.signals[0]?.kind === "CLASSIFIER_ERROR" && !failed.questions[0]?.includes("secret"))
  const failureExecutable = await failureModule.classifyExecutability("## Scope\n\n- Fix code")
  T(`${TOOL}: CLI failure does not invent a deferral`, failureExecutable.deferrals.length === 0)
  const retriedModule = await load("process-retry")
  let retryCount = 0
  const retried = await retriedModule.classifyExecutability(quoteBody, { run: async (input, args) => {
    retryCount++
    if (retryCount === 1) return { code: 1, stdout: "", stderr: "" }
    return replay(responses.not_reproduced, { calls: 0 })(input, args)
  }, retryDelayMs: 0 })
  T(`${TOOL}: one CLI failure retries once`, retryCount === 2 && retried.deferrals[0]?.reason === "NOT_REPRODUCED")
  const rejectedModule = await load("process-reject")
  let rejectedCount = 0
  const rejected = await rejectedModule.classifyConversationFirst("## Scope\n\n- Another ordinary fix", { run: async () => { rejectedCount++; throw new Error("private detail") }, retryDelayMs: 0 })
  T(`${TOOL}: launch rejection fails closed after two attempts`, rejectedCount === 2 && rejected.signals[0]?.kind === "CLASSIFIER_ERROR" && !rejected.questions[0].includes("private detail"))
  const nonJsonModule = await load("invalid-json")
  const nonJson = await nonJsonModule.classifyConversationFirst("## Scope\n\n- A small fix", { run: async () => ({ code: 0, stdout: "not json", stderr: "" }) })
  T(`${TOOL}: non-JSON output fails closed`, nonJson.signals[0]?.kind === "CLASSIFIER_ERROR")
  const timeoutModule = await load("process-timeout")
  const timeoutResult = await timeoutModule.classifyConversationFirst("## Scope\n\n- Another fix", { run: () => new Promise(() => {}), timeoutMs: 10, retryDelayMs: 0 })
  T(`${TOOL}: a stalled CLI call fails closed after one retry`, timeoutResult.signals[0]?.kind === "CLASSIFIER_ERROR")

  const emptyModule = await load("empty")
  let called = false
  const emptyRun = async () => { called = true; throw new Error("unexpected call") }
  const emptyExec = await emptyModule.classifyExecutability(null, { run: emptyRun })
  const emptyChat = await emptyModule.classifyConversationFirst("", { run: emptyRun })
  T(`${TOOL}: empty bodies skip the CLI`, !called && emptyExec.deferrals.length === 0 && emptyChat.conversationFirst === false)

  const labelsModule = await load("labels")
  const labelsRun = async () => { throw new Error("labels must skip the CLI") }
  const on = await labelsModule.classifyConversationFirst("## Scope\n\n- Work", { labels: ["needs:conversation"], run: labelsRun })
  const off = await labelsModule.classifyConversationFirst("## Scope\n\n- Work", { labels: [{ name: "needs:no-conversation" }], run: labelsRun })
  T(`${TOOL}: labels skip the CLI in both directions`, on.source === "label" && off.source === "label" && on.conversationFirst && !off.conversationFirst)
  const labeledFailureModule = await load("labeled-failure")
  const labeledFailureBody = "## Scope\n\n- Fix labeled code"
  const labeledFailureRun = async () => ({ code: 1, stdout: "", stderr: "" })
  await labeledFailureModule.classifyExecutability(labeledFailureBody, { run: labeledFailureRun, retryDelayMs: 0 })
  const labeledFailure = await labeledFailureModule.classifyConversationFirst(labeledFailureBody, { labels: ["needs:no-conversation"] })
  T(`${TOOL}: off label preserves a cached classifier failure`, labeledFailure.source === "classifier" && labeledFailure.signals[0]?.kind === "CLASSIFIER_ERROR")
  const labeledOnFailure = await labeledFailureModule.classifyConversationFirst(labeledFailureBody, { labels: ["needs:conversation"] })
  T(`${TOOL}: on label preserves a cached classifier failure`, labeledOnFailure.source === "classifier" && labeledOnFailure.signals[0]?.kind === "CLASSIFIER_ERROR")
  const claudeEnvelope = readFileSync(new URL("../__fixtures__/ticket-classifier-envelope.json", import.meta.url), "utf8")
  // Delay the first real config Git read so cold setup contention is deterministic in the probe.
  const nativeProbe = stage("ticket-executability/native-probe.mjs", `
import childProcess from "node:child_process"
import { appendFileSync } from "node:fs"
import { syncBuiltinESMExports } from "node:module"
const setupDelayMs = Number(process.env.ORBIT_NATIVE_PROBE_SETUP_DELAY) || 0
if (setupDelayMs) {
  const spawnSync = childProcess.spawnSync
  childProcess.spawnSync = (...args) => {
    if (args[0] === "git") {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, setupDelayMs)
      childProcess.spawnSync = spawnSync
      syncBuiltinESMExports()
    }
    return spawnSync(...args)
  }
  syncBuiltinESMExports()
}
const { classifyConversationFirst } = await import(process.env.ORBIT_NATIVE_PROBE_MODULE || ${JSON.stringify(new URL("../lib/ticket-executability.mjs", import.meta.url).href)})
const setupStarted = performance.now()
const setup = await classifyConversationFirst("## Scope\\n\\n- Prepare the classifier probe", { run: async () => ({ code: 0, stdout: ${JSON.stringify(claudeEnvelope)} }) })
if (setup.conversationFirst) throw new Error("classifier probe setup failed")
const setupElapsedMs = performance.now() - setupStarted
if (process.env.ORBIT_NATIVE_PROBE_EXITS) {
  const spawn = childProcess.spawn
  childProcess.spawn = (...args) => {
    const launchedAt = performance.now()
    const child = spawn(...args)
    child.once("exit", (status, signal) => appendFileSync(process.env.ORBIT_NATIVE_PROBE_EXITS, JSON.stringify({
      pid: child.pid, status, signal, elapsedMs: performance.now() - launchedAt,
      stdoutEnded: child.stdout.readableEnded, stderrEnded: child.stderr.readableEnded,
    }) + "\\n"))
    return child
  }
  syncBuiltinESMExports()
}
const body = "## Scope\\n\\n- Fix code\\n" + "x".repeat(process.env.ORBIT_NATIVE_PROBE_LARGE ? 4_000_000 : 0)
const started = performance.now()
const result = await classifyConversationFirst(body, { timeoutMs: Number(process.env.ORBIT_NATIVE_PROBE_TIMEOUT) || 1000, retryDelayMs: 0 })
process.stdout.write(JSON.stringify({ conversationFirst: result.conversationFirst, kind: result.signals[0]?.kind, setupElapsedMs, elapsedMs: performance.now() - started }))
`)
  const claudeBinary = stage("ticket-executability/claude-envelope.mjs", `#!/usr/bin/env node
process.stdout.write(${JSON.stringify(claudeEnvelope)})
`)
  chmodSync(claudeBinary, 0o755)
  const claudeObserved = spawnSync(process.execPath, [nativeProbe], { encoding: "utf8", timeout: 5000, env: { ...process.env, [CACHE_VARIABLE]: cachePath("native-claude-envelope"), ORBIT_CLASSIFIER_CLAUDE_BIN: claudeBinary } })
  let claudeVerdict
  try { claudeVerdict = JSON.parse(claudeObserved.stdout) } catch { claudeVerdict = null }
  T(`${TOOL}: native Claude structured envelope admits ordinary code work`, claudeObserved.status === 0 && claudeVerdict?.conversationFirst === false && !claudeVerdict.kind, claudeObserved.stderr || claudeObserved.stdout)
  const attachmentGuardBinary = stage("ticket-executability/claude-attachment-guard.mjs", `#!/usr/bin/env node
if (process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS !== "1") process.exit(3)
process.stdout.write(${JSON.stringify(claudeEnvelope)})
`)
  chmodSync(attachmentGuardBinary, 0o755)
  const attachmentObserved = spawnSync(process.execPath, [nativeProbe], { encoding: "utf8", timeout: 5000, env: { ...process.env, [CACHE_VARIABLE]: cachePath("native-attachment-guard"), CLAUDE_CODE_DISABLE_ATTACHMENTS: "", ORBIT_CLASSIFIER_CLAUDE_BIN: attachmentGuardBinary } })
  let attachmentVerdict
  try { attachmentVerdict = JSON.parse(attachmentObserved.stdout) } catch { attachmentVerdict = null }
  T(`${TOOL}: ticket body @file mentions stay plain text (attachment expansion disabled)`, attachmentObserved.status === 0 && attachmentVerdict?.conversationFirst === false && !attachmentVerdict.kind, attachmentObserved.stderr || attachmentObserved.stdout)
  // Cold config and prompt loading precede the process deadline. The setup call warms only those
  // shared inputs; its distinct body cannot supply the timed classification from the result cache.
  const descendantPids = stage("ticket-executability/descendants.jsonl", "")
  const launcherExits = stage("ticket-executability/launcher-exits.jsonl", "")
  const descendantTimeoutMs = 1000
  // Allow the launcher to create the inherited pipes, then keep the original 700 ms cleanup margin
  // above two attempts. Natural descendant exit must remain beyond the outer 5000 ms watchdog.
  const descendantDeadlineMs = 2 * descendantTimeoutMs + 700
  for (const [name, source, timeoutMs, large] of [
    ["early-exit", "#!/usr/bin/env node\nprocess.exit(1)\n", 500, true],
    ["stdio-descendant", `#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { stdio: 'inherit' })
appendFileSync(${JSON.stringify(descendantPids)}, JSON.stringify({ parent: process.pid, descendant: child.pid }) + '\\n')
child.unref()
`, descendantTimeoutMs, false],
    ["output-overflow", "#!/usr/bin/env node\nprocess.stdout.write('x'.repeat(2_000_000))\n", 1000, false],
  ]) {
    const binary = stage(`ticket-executability/${name}.mjs`, source)
    chmodSync(binary, 0o755)
    const observed = spawnSync(process.execPath, [nativeProbe], { encoding: "utf8", timeout: 5000, env: { ...process.env, [CACHE_VARIABLE]: cachePath(`native-${name}`), ORBIT_CLASSIFIER_CLAUDE_BIN: binary, ORBIT_NATIVE_PROBE_TIMEOUT: String(timeoutMs), ORBIT_NATIVE_PROBE_LARGE: large ? "1" : "", ORBIT_NATIVE_PROBE_SETUP_DELAY: name === "stdio-descendant" ? "1000" : "", ORBIT_NATIVE_PROBE_EXITS: name === "stdio-descendant" ? launcherExits : "" } })
    let verdict
    try { verdict = JSON.parse(observed.stdout) } catch { verdict = null }
    const deadlineMs = name === "stdio-descendant" ? descendantDeadlineMs : 900
    T(`${TOOL}: native ${name} fails closed within the deadline`, observed.status === 0 && verdict?.conversationFirst === true && verdict.kind === "CLASSIFIER_ERROR" && verdict.elapsedMs < deadlineMs, observed.stderr || observed.stdout || String(observed.error))
    if (name === "stdio-descendant") {
      const descendants = readFileSync(descendantPids, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
      const exits = readFileSync(launcherExits, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
      process.stdout.write(`Native stdio probe: ${JSON.stringify({ ...verdict, deadlineMs, descendants, exits })}\n`)
      T(`${TOOL}: native stdio probe exercises slow cold setup`, verdict?.setupElapsedMs >= 1000, JSON.stringify(verdict))
      T(`${TOOL}: both native attempts create the stdio descendant`, descendants.length === 2, JSON.stringify({ descendants, verdict }))
      T(`${TOOL}: both native launchers exit before the deadline with stdout and stderr still open`, exits.length === 2 && exits.every((exit, index) => exit.pid === descendants[index]?.parent && exit.status === 0 && exit.signal === null && exit.elapsedMs < timeoutMs && !exit.stdoutEnded && !exit.stderrEnded), JSON.stringify({ exits, descendants }))
      T(`${TOOL}: native timeout terminates the parents and stdio descendants`, descendants.length === 2 && descendants.every(({ parent, descendant }) => !processIsRunning(parent) && !processIsRunning(descendant)), JSON.stringify({ descendants, verdict }))
      // A failed deadline assertion must not leave its recorded processes running.
      for (const pid of descendants.flatMap(({ parent, descendant }) => [parent, descendant])) {
        if (processIsRunning(pid)) {
          try { process.kill(pid, "SIGKILL") } catch { /* the process can exit before cleanup */ }
        }
      }
    }
  }
  const missingBinary = spawnSync(process.execPath, [nativeProbe], { encoding: "utf8", timeout: 5000, env: { ...process.env, [CACHE_VARIABLE]: cachePath("native-missing-binary"), ORBIT_CLASSIFIER_CLAUDE_BIN: "/orbit-test/missing-claude" } })
  let missingVerdict
  try { missingVerdict = JSON.parse(missingBinary.stdout) } catch { missingVerdict = null }
  T(`${TOOL}: native launch failure fails closed`, missingBinary.status === 0 && missingVerdict?.kind === "CLASSIFIER_ERROR", missingBinary.stderr || missingBinary.stdout || String(missingBinary.error))
  /** The queue contract has to name the reason, or the deferral arrives at 03:00 with no meaning. */
  T(
    `${TOOL}: the orchestrate contract documents NEEDS_CONVERSATION as a sleep-only deferral`,
    /NEEDS_CONVERSATION/.test(orchestrateContract) && /--sleep.{0,20}only/i.test(orchestrateContract),
    "the queue contract lost the conversation-first deferral row",
  )
  T(
    `${TOOL}: the orchestrate contract writes the conversation decisions back to the ticket`,
    /comment-ticket\.mjs/.test(orchestrateContract) && /one topic at a time/i.test(orchestrateContract),
    "the conversation-first protocol lost its durable output or its one-topic rule",
  )
  await diskCacheCases()
  globalThis.fetch = originalFetch
  if (originalCacheFile === undefined) delete process.env[CACHE_VARIABLE]
  else process.env[CACHE_VARIABLE] = originalCacheFile
}

/** The disk cache serves a fresh process from an earlier process's validated answer. */
const diskCacheCases = async () => {
  const counted = (response) => {
    const count = { calls: 0 }
    return { count, run: replay(response, count) }
  }
  const quoteEntry = fixtures.find((item) => item.id === "not_reproduced")

  const repeatFile = cachePath("disk-repeat")
  const first = counted(responses.not_reproduced)
  const firstResult = await (await load("disk-repeat-first", repeatFile)).classifyExecutability(quoteEntry.body, { run: first.run, retryDelayMs: 0 })
  T(`${TOOL}: an empty disk cache makes one model call`, first.count.calls === 1 && firstResult.deferrals[0]?.reason === "NOT_REPRODUCED", `calls: ${first.count.calls}`)
  T(`${TOOL}: a validated answer is written to the disk cache`, storedKeys(repeatFile).length === 1)
  const second = counted(responses.not_reproduced)
  const secondModule = await load("disk-repeat-second", repeatFile)
  const secondResult = await secondModule.classifyExecutability(quoteEntry.body, { run: second.run, retryDelayMs: 0 })
  const secondConversation = await secondModule.classifyConversationFirst(quoteEntry.body, { run: second.run, retryDelayMs: 0 })
  T(`${TOOL}: a second process over the same body makes no model call`, second.count.calls === 0 && secondResult.deferrals[0]?.reason === "NOT_REPRODUCED" && secondConversation.conversationFirst === false, `calls: ${second.count.calls}`)
  const changedBody = counted(responses.ordinary)
  await (await load("disk-repeat-changed-body", repeatFile)).classifyExecutability("## Scope\n\n- A changed ticket body", { run: changedBody.run, retryDelayMs: 0 })
  T(`${TOOL}: a changed body makes one model call`, changedBody.count.calls === 1 && storedKeys(repeatFile).length === 2, `calls: ${changedBody.count.calls}`)

  // A staged copy owns its prompt file and configuration, so the case can change both.
  const staged = stageWithConfig("ticket-executability-prompt", "lib/ticket-executability.mjs", realOrchestratorConfig())
  const promptFile = join(staged.base, "tools", "lib", "ticket-classifier-prompt.md")
  const inputsFile = cachePath("disk-inputs")
  let stagedImports = 0
  const stagedPass = async () => {
    process.env[CACHE_VARIABLE] = inputsFile
    const module = await import(`${pathToFileURL(staged.path).href}?test=${++stagedImports}`)
    const pass = counted(responses.ordinary)
    await module.classifyExecutability("## Scope\n\n- Ordinary staged work", { run: pass.run, retryDelayMs: 0 })
    return pass.count.calls
  }
  const stagedFirst = await stagedPass()
  const stagedRepeat = await stagedPass()
  T(`${TOOL}: unchanged prompt and model reuse the stored answer`, stagedFirst === 1 && stagedRepeat === 0, JSON.stringify({ stagedFirst, stagedRepeat }))
  writeFileSync(promptFile, `${readFileSync(promptFile, "utf8")}\nOne more instruction.\n`)
  const promptChanged = await stagedPass()
  const promptRepeat = await stagedPass()
  T(`${TOOL}: a prompt file change forces exactly one new model call`, promptChanged === 1 && promptRepeat === 0, JSON.stringify({ promptChanged, promptRepeat }))
  const config = realOrchestratorConfig()
  writeFileSync(staged.configPath, `${JSON.stringify({ ...config, classifier: { ...config.classifier, model: `${config.classifier.model}-changed` } }, null, 2)}\n`)
  const modelChanged = await stagedPass()
  T(`${TOOL}: a model change forces exactly one new model call`, modelChanged === 1 && storedKeys(inputsFile).length === 3, JSON.stringify({ modelChanged, keys: storedKeys(inputsFile).length }))

  const corruptFile = cachePath("disk-corrupt")
  writeFileSync(corruptFile, "{ torn")
  const logged = []
  const originalError = console.error
  console.error = (...parts) => logged.push(parts.join(" "))
  const corrupt = counted(responses.ordinary)
  let corruptOutcome
  try {
    const corruptModule = await load("disk-corrupt", corruptFile)
    await corruptModule.classifyExecutability("## Scope\n\n- First task after a torn cache", { run: corrupt.run, retryDelayMs: 0 })
    await corruptModule.classifyExecutability("## Scope\n\n- Second task after a torn cache", { run: corrupt.run, retryDelayMs: 0 })
    corruptOutcome = "completed"
  } catch (error) {
    corruptOutcome = error.message
  } finally {
    console.error = originalError
  }
  T(`${TOOL}: a corrupt cache file logs one line and classifies again`, corruptOutcome === "completed" && corrupt.count.calls === 2 && logged.length === 1 && logged[0].includes(corruptFile), JSON.stringify({ corruptOutcome, calls: corrupt.count.calls, logged }))
  T(`${TOOL}: the next write replaces a corrupt cache file`, storedKeys(corruptFile).length === 2)

  const failureFile = cachePath("disk-failure")
  const failureBody = "## Scope\n\n- Fix code after a failed classifier call"
  const failed = await (await load("disk-failure-first", failureFile)).classifyConversationFirst(failureBody, { run: async () => ({ code: 1, stdout: "", stderr: "" }), retryDelayMs: 0 })
  const invalidAnswer = { deferrals: [{ reason: "NOT_CODE_WORK", heading: "Scope", quote: "a quote the body never says" }], signals: [] }
  const invalid = await (await load("disk-failure-invalid", failureFile)).classifyConversationFirst(failureBody, { run: replay(invalidAnswer, { calls: 0 }), retryDelayMs: 0 })
  T(`${TOOL}: failed and invalid answers are never written to the disk cache`, failed.signals[0]?.kind === "CLASSIFIER_ERROR" && invalid.signals[0]?.kind === "CLASSIFIER_ERROR" && storedKeys(failureFile).length === 0)
  const afterFailure = counted(responses.ordinary)
  const recovered = await (await load("disk-failure-recovered", failureFile)).classifyConversationFirst(failureBody, { run: afterFailure.run, retryDelayMs: 0 })
  T(`${TOOL}: a later process classifies a previously failed body again`, afterFailure.count.calls === 1 && recovered.conversationFirst === false, `calls: ${afterFailure.count.calls}`)

  const raceFile = cachePath("disk-race")
  const writers = await Promise.all(["one", "two", "three", "four"].map((name) => load(`disk-race-${name}`, raceFile)))
  await Promise.all(writers.map((module, index) => module.classifyExecutability(`## Scope\n\n- Concurrent task ${index}`, { run: replay(responses.ordinary, { calls: 0 }), retryDelayMs: 0 })))
  const raceStore = storedCache(raceFile)
  T(`${TOOL}: concurrent writers leave a whole cache file`, raceStore?.version === 1 && Object.keys(raceStore.entries).length >= 1, existsSync(raceFile) ? readFileSync(raceFile, "utf8").slice(0, 200) : "no cache file")
}
