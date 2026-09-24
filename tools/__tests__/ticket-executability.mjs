import { spawnSync } from "node:child_process"
import { chmodSync, readFileSync, writeFileSync } from "node:fs"

import { stage, T } from "./_harness.mjs"

const TOOL = "lib/ticket-executability.mjs"
const fixtures = JSON.parse(readFileSync(new URL("../__fixtures__/ticket-classifier-cases.json", import.meta.url), "utf8"))
const responses = JSON.parse(readFileSync(new URL("../__fixtures__/ticket-classifier-responses.json", import.meta.url), "utf8"))
const load = async (name) => import(`../lib/ticket-executability.mjs?test=${name}`)
const replay = (response, count) => async (input, args) => {
  count.calls++
  writeFileSync(args[args.indexOf("-o") + 1], JSON.stringify(response))
  return { code: 0, stdout: "", stderr: "" }
}

export const cases = async () => {
  const originalFetch = globalThis.fetch
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
    writeFileSync(args[args.indexOf("-o") + 1], JSON.stringify(responses.ordinary))
    activeCalls--
    return { code: 0, stdout: "" }
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
  const nonJson = await nonJsonModule.classifyConversationFirst("## Scope\n\n- A small fix", { run: async (input, args) => {
    writeFileSync(args[args.indexOf("-o") + 1], "not json")
    return { code: 0, stdout: "", stderr: "" }
  } })
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
  const nativeProbe = stage("ticket-executability/native-probe.mjs", `
import { classifyConversationFirst } from ${JSON.stringify(new URL("../lib/ticket-executability.mjs", import.meta.url).href)}
const started = performance.now()
const result = await classifyConversationFirst("## Scope\\n\\n- Fix code\\n" + "x".repeat(4_000_000), { timeoutMs: 40, retryDelayMs: 0 })
process.stdout.write(JSON.stringify({ kind: result.signals[0]?.kind, elapsedMs: performance.now() - started }))
`)
  for (const [name, source] of [
    ["early-exit", "#!/usr/bin/env node\nprocess.exit(1)\n"],
    ["stdio-descendant", "#!/usr/bin/env node\nimport { spawn } from 'node:child_process'\nspawn(process.execPath, ['-e', 'setTimeout(() => {}, 1200)'], { stdio: 'inherit' })\n"],
    ["output-overflow", "#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs'\nwriteFileSync(process.argv[process.argv.indexOf('-o') + 1], JSON.stringify({ deferrals: [], signals: [] }))\nprocess.stdout.write('x'.repeat(2_000_000))\n"],
  ]) {
    const binary = stage(`ticket-executability/${name}.mjs`, source)
    chmodSync(binary, 0o755)
    const observed = spawnSync(process.execPath, [nativeProbe], { encoding: "utf8", timeout: 5000, env: { ...process.env, ORBIT_CLASSIFIER_CODEX_BIN: binary } })
    let verdict
    try { verdict = JSON.parse(observed.stdout) } catch { verdict = null }
    T(`${TOOL}: native ${name} fails closed within the deadline`, observed.status === 0 && verdict?.kind === "CLASSIFIER_ERROR" && verdict.elapsedMs < 600, observed.stderr || observed.stdout || String(observed.error))
  }
  const missingBinary = spawnSync(process.execPath, [nativeProbe], { encoding: "utf8", timeout: 5000, env: { ...process.env, ORBIT_CLASSIFIER_CODEX_BIN: "/orbit-test/missing-codex" } })
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
  globalThis.fetch = originalFetch
}
