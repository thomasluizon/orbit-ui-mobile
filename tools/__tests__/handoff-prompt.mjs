import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { parseHandoffRequest, readHandoffRequest, recordHandoffRequest, validateHandoffPrompt } from "../lib/handoff-prompt.mjs"
import * as handoff from "../lib/handoff-prompt.mjs"
import { readRunState, writeRunState } from "../lib/run-state.mjs"
import { appendChainEntry, closeSessionChain, confirmChainSuccessor, supersededSession } from "../lib/session-chain.mjs"

import { T, realOrchestratorConfig, root, run, stageWithConfig } from "./_harness.mjs"

const UNIT = "lib/handoff-prompt.mjs"

const sleepPrompt = [
  "/sleep", "", "Read `.claude/specs/example.md` before anything else.", "",
  "## Sleep", "", "Unattended.", "", "## Goal", "", "Finish it: `gh issue list --repo x --state open`.", "",
  "## In flight", "", "none", "", "## Previous prompt, disposition", "", "- carried", "",
  "Every identifier in this prompt came from a previous session: treat each as a lead to verify.",
].join("\n")

export const cases = () => {
  T(`${UNIT}: a question mentioning handoff is not an invocation`, parseHandoffRequest("we are working always using /handoff, wrap-up, etc etc\n\nwhat happens when the spec is finished?") === null)
  T(`${UNIT}: /wrap-up --sleep records a sleep request`, JSON.stringify(parseHandoffRequest("/wrap-up --sleep")) === JSON.stringify({ command: "wrap-up", sleep: true, crank: false }))
  T(`${UNIT}: /handoff with other arguments stays attended`, parseHandoffRequest("/handoff finish the calendar")?.sleep === false)
  T(`${UNIT}: a non-handoff command records nothing`, parseHandoffRequest("/sleep") === null)
  for (const [label, prompt, expected] of [
    ["a leading word is a mention", "RUN /wrap-up --sleep", null],
    ["a polite prefix is a mention", "please /handoff", null],
    ["a command on the second line is read", "Finish this task.\n/wrap-up --sleep", { command: "wrap-up", sleep: true, crank: false }],
    ["an inline code mention is ignored", "Read `/handoff --relay --sleep` in NEXT.md.", null],
    ["a longer inline delimiter is ignored", "Read ``/wrap-up --sleep `example` ``.", null],
    ["a fenced code mention is ignored", "Example:\n```text\n/wrap-up --sleep\n```", null],
    ["a tilde fenced mention is ignored", "Example:\n~~~text\n/handoff --sleep\n~~~", null],
    ["an unfinished fence stays quoted", "```text\n/handoff --sleep", null],
    ["a shorter fence cannot end a longer fence", "````text\n```\n/handoff --sleep\n````", null],
    ["a real command after a fence is read", "```text\n/wrap-up --sleep\n```\n/handoff", { command: "handoff", sleep: false, crank: false }],
    ["a pasted content mention is ignored", '<pasted_content source="NEXT.md">\n/handoff --relay --sleep\n</pasted_content>', null],
    ["an unfinished pasted block stays quoted", "<pasted_content>\n/wrap-up --sleep", null],
    ["a real command after a pasted block is read", "<pasted_content>\n/wrap-up --sleep\n</pasted_content>\n/handoff", { command: "handoff", sleep: false, crank: false }],
    ["a nested pasted block keeps the outer block quoted", "<pasted_content>\n<pasted_content>\nquoted\n</pasted_content>\n/handoff --sleep\n</pasted_content>", null],
    ["an unfinished outer pasted block stays quoted past a nested close", "<pasted_content>\n<pasted_content>\nquoted\n</pasted_content>\n/handoff --sleep", null],
    ["a real command after a nested pasted block is read", "<pasted_content>\n<pasted_content>\n/wrap-up\n</pasted_content>\n/wrap-up --sleep\n</pasted_content>\n/handoff", { command: "handoff", sleep: false, crank: false }],
    ["a pasted close with another id does not end the block", '<pasted_content id="a1">\n</pasted_content id="b2">\n/handoff --sleep\n</pasted_content id="a1">', null],
    ["a real command after an id-tagged pasted block is read", '<pasted_content id="a1">\n/handoff\n</pasted_content id="a1">\n/wrap-up --sleep', { command: "wrap-up", sleep: true, crank: false }],
    ["a skill path is ignored", ".claude/skills/handoff/SKILL.md", null],
    ["a command-shaped path is ignored", "Read /handoff/SKILL.md and /wrap-up.md", null],
    ["a command suffix is ignored", "/handoff-extra --sleep", null],
    ["a parenthesized mention is ignored", "please (/handoff)", null],
    ["a parenthesized sleep mention is ignored", "please (/handoff --sleep)", null],
    ["a parenthesized wrap-up mention is ignored", "please (/wrap-up /sleep)", null],
    ["a sleep option suffix stays attended", "/handoff --sleep-later", { command: "handoff", sleep: false, crank: false }],
    ["the first command keeps its own arguments", "/handoff then /wrap-up --sleep", { command: "handoff", sleep: false, crank: false }],
    ["the first sleep command wins", "/wrap-up --sleep then /handoff", { command: "wrap-up", sleep: true, crank: false }],
    ["a mention before a real command is ignored", "`/handoff --sleep`\n/wrap-up", { command: "wrap-up", sleep: false, crank: false }],
    ["sleep inside code is ignored", "/handoff `--sleep`", { command: "handoff", sleep: false, crank: false }],
    ["the slash sleep argument stays supported", "/handoff /sleep", { command: "handoff", sleep: true, crank: false }],
    ["another command keeps an inline handoff a mention", "/progress then /handoff", null],
    ["expanded command tags stay supported", "<command-name>/wrap-up</command-name>\n<command-args>--sleep</command-args>", { command: "wrap-up", sleep: true, crank: false }],
    ["pasted expanded tags are ignored", "<pasted_content><command-name>/wrap-up</command-name><command-args>--sleep</command-args></pasted_content>", null],
    ["a typed command before expanded tags wins", "/handoff\n<command-name>/wrap-up</command-name><command-args>--sleep</command-args>", { command: "handoff", sleep: false, crank: false }],
    ["expanded tags before a typed command win", "<command-name>/handoff</command-name><command-args></command-args>\n/wrap-up --sleep", { command: "handoff", sleep: false, crank: false }],
  ]) {
    const actual = parseHandoffRequest(prompt)
    T(`${UNIT}: ${label}`, JSON.stringify(actual) === JSON.stringify(expected), `got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
  }
  T(`${UNIT}: a complete sleep prompt has no missing requirement`, validateHandoffPrompt(sleepPrompt, { sleep: true }).length === 0, JSON.stringify(validateHandoffPrompt(sleepPrompt, { sleep: true })))
  T(`${UNIT}: auto-work refuses a sleep-only relay`, validateHandoffPrompt(sleepPrompt, { sleep: true, autoWork: true }).length > 0)
  T(`${UNIT}: auto-work accepts its entry point`, validateHandoffPrompt(sleepPrompt.replace("/sleep\n", "/auto-work\n"), { sleep: true, autoWork: true }).length === 0)
  const parenthesizedSleep = validateHandoffPrompt(sleepPrompt, { sleep: parseHandoffRequest("please (/handoff --sleep)")?.sleep })
  T(`${UNIT}: a parenthesized sleep handoff accepts an unattended prompt`, parenthesizedSleep.length === 0, JSON.stringify(parenthesizedSleep))
  const withoutSleepLine = validateHandoffPrompt(sleepPrompt.replace("/sleep\n", "# NEXT\n"), { sleep: true })
  T(`${UNIT}: a sleep prompt without the leading /sleep is refused`, withoutSleepLine.some((item) => item.includes("`/sleep`")), JSON.stringify(withoutSleepLine))
  const withoutSpec = validateHandoffPrompt(sleepPrompt.replace("`.claude/specs/example.md`", "the spec"), { sleep: true })
  T(`${UNIT}: the spec path must open the prompt`, withoutSpec.some((item) => item.includes(".claude/specs")), JSON.stringify(withoutSpec))

  const padded = (text, bytes) => `${text}\n${"x".repeat(bytes - Buffer.byteLength(text) - 1)}`
  const specOf = (bytes) => () => ["x".repeat(bytes)]
  const sizeIssues = (missing) => missing.filter((item) => / within \d+ B \(it is \d+ B\)/.test(item))
  T(`${UNIT}: the ceilings are 8192 B for the prompt and 40960 B for a spec`, handoff.HANDOFF_PROMPT_MAX_BYTES === 8192 && handoff.SPEC_MAX_BYTES === 40960)
  const promptAtCeiling = validateHandoffPrompt(padded(sleepPrompt, 8192), { sleep: true })
  T(`${UNIT}: a prompt of 8192 B passes`, promptAtCeiling.length === 0, JSON.stringify(promptAtCeiling))
  const promptOver = validateHandoffPrompt(padded(sleepPrompt, 8300), { sleep: true })
  T(`${UNIT}: a prompt of 8300 B is refused with its name and size`, JSON.stringify(sizeIssues(promptOver)) === JSON.stringify(["`.claude/handoffs/NEXT.md` within 8192 B (it is 8300 B): keep only the in-flight rows and the next steps, and point at the spec for the rest"]), JSON.stringify(promptOver))
  const specAtCeiling = validateHandoffPrompt(sleepPrompt, { sleep: true, specVersions: specOf(40960) })
  T(`${UNIT}: a spec of 40960 B passes`, specAtCeiling.length === 0, JSON.stringify(specAtCeiling))
  const specOver = validateHandoffPrompt(sleepPrompt, { sleep: true, specVersions: specOf(41984) })
  T(`${UNIT}: a spec of 41984 B is refused with its name and size`, JSON.stringify(sizeIssues(specOver)) === JSON.stringify(["`.claude/specs/example.md` within 40960 B (it is 41984 B): replace the Current state paragraph and leave history to git, never append"]), JSON.stringify(specOver))
  const readPaths = []
  validateHandoffPrompt(`${sleepPrompt}\nA later \`.claude/specs/other.md\` mention is not the opening.`, { sleep: true, specVersions: (path) => { readPaths.push(path); return [] } })
  T(`${UNIT}: only the spec its opening names is measured`, JSON.stringify(readPaths) === JSON.stringify([".claude/specs/example.md"]), JSON.stringify(readPaths))
  T(`${UNIT}: any oversized version of the spec is refused`, sizeIssues(validateHandoffPrompt(sleepPrompt, { sleep: true, specVersions: () => ["small", "x".repeat(40961)] })).length === 1)
  T(`${UNIT}: the ceiling counts bytes, not characters`, handoff.relayDocumentOversize(handoff.HANDOFF_PROMPT_PATH, "\u00e9".repeat(4097))?.includes("(it is 8194 B)") === true)
  T(`${UNIT}: a document outside the relay paths has no ceiling`, handoff.relayDocumentLimit("docs/notes.md") === null && handoff.relayDocumentLimit(".claude/specs/nested/a.md") === null)
  const specRoot = join(root, "handoff-prompt", "spec-checkout")
  mkdirSync(join(specRoot, ".claude", "specs"), { recursive: true })
  writeFileSync(join(specRoot, ".claude", "specs", "example.md"), "x".repeat(41984))
  T(`${UNIT}: a checkout publishes its working copy of the spec`, handoff.checkoutSpecVersions(specRoot)(".claude/specs/example.md")[0]?.length === 41984)
  T(`${UNIT}: a spec the checkout lacks has no version`, handoff.checkoutSpecVersions(specRoot)(".claude/specs/missing.md").length === 0)

  for (const invocation of ["/handoff --crank", "/wrap-up --crank", "/handoff /crank", "<command-name>/handoff</command-name><command-args>--crank</command-args>"]) {
    const request = parseHandoffRequest(invocation)
    T(`${UNIT}: ${invocation} enables crank and sleep`, request?.crank === true && request.sleep === true)
  }
  for (const invocation of ["/handoff", "/handoff --crank-later", "/handoff /crank/SKILL.md", "/handoff `--crank`", "/handoff then /wrap-up --crank"]) {
    T(`${UNIT}: ${invocation} leaves crank disabled`, parseHandoffRequest(invocation)?.crank === false)
  }
  const crankPrompt = `${sleepPrompt}\n## Crank\nInvoke /crank immediately after /sleep entry.\n`
  T(`${UNIT}: crank requires its section`, validateHandoffPrompt(sleepPrompt, { crank: true }).some((item) => item.includes("## Crank")))
  T(`${UNIT}: a crank section must invoke the skill`, validateHandoffPrompt(`${sleepPrompt}\n## Crank\nContinue quickly.`, { crank: true }).some((item) => item.includes("/crank")))
  T(`${UNIT}: a command outside the crank section does not satisfy it`, validateHandoffPrompt(`${sleepPrompt}\nInvoke /crank.\n## Crank\nContinue.`, { crank: true }).length > 0)
  T(`${UNIT}: a different heading cannot stand in for Crank`, validateHandoffPrompt(crankPrompt.replace("## Crank", "## Crankiness"), { crank: true }).some((item) => item.includes("## Crank")))
  T(`${UNIT}: a skill path is not a crank invocation`, validateHandoffPrompt(crankPrompt.replace("Invoke /crank immediately", "Read /crank/SKILL.md immediately"), { crank: true }).some((item) => item.includes("/crank")))
  T(`${UNIT}: a complete crank prompt passes`, validateHandoffPrompt(crankPrompt, { crank: true }).length === 0)
  T(`${UNIT}: crank implies the literal sleep first line`, validateHandoffPrompt(crankPrompt.replace("/sleep\n", "# Next\n"), { sleep: false, crank: true }).some((item) => item.includes("first line")))
  T(`${UNIT}: crank implies the sleep section`, validateHandoffPrompt(crankPrompt.replace("## Sleep", "## Attended"), { crank: true }).some((item) => item.includes("## Sleep")))
  T(`${UNIT}: disabled crank permits an ordinary sleep prompt`, validateHandoffPrompt(sleepPrompt, { sleep: true, crank: false }).length === 0)

  const repoRoot = join(root, "handoff-prompt", "checkout")
  mkdirSync(join(repoRoot, ".git"), { recursive: true })
  T(`${UNIT}: an unrecorded session reads as no request`, readHandoffRequest("s1", repoRoot) === null)
  recordHandoffRequest("s1", { command: "handoff", sleep: true }, "2026-01-01T00:00:00Z", repoRoot)
  T(`${UNIT}: a recorded request is read back for its own session`, readHandoffRequest("s1", repoRoot)?.sleep === true && readHandoffRequest("s2", repoRoot) === null)
  recordHandoffRequest("s1", { command: "wrap-up", sleep: true, crank: true }, "2026-01-01T00:01:00Z", repoRoot)
  T(`${UNIT}: crank intent without a run never initializes the sleep lifecycle`, readRunState(repoRoot) === null)
  writeRunState({ sessionId: "s1", crank: false, sleep: false, remaining: ["#1"], relay: { pending: false } }, repoRoot)
  recordHandoffRequest("s2", { command: "handoff", sleep: true, crank: true }, "2026-01-01T00:02:00Z", repoRoot)
  T(`${UNIT}: another session cannot enable the run`, readRunState(repoRoot).crank === false)
  recordHandoffRequest("s1", { command: "wrap-up", sleep: true, crank: true }, "2026-01-01T00:03:00Z", repoRoot)
  const enabled = readRunState(repoRoot)
  T(`${UNIT}: a newer explicit request enables the matching run and preserves its lifecycle`, enabled.crank === true && enabled.sleep === false && enabled.remaining[0] === "#1" && enabled.relay.pending === false)
  recordHandoffRequest("s1", { command: "handoff", sleep: true, crank: false }, "2026-01-01T00:04:00Z", repoRoot)
  T(`${UNIT}: an ordinary handoff request never disables an active crank mode`, readRunState(repoRoot).crank === true)

  for (const variant of ["successor", "unrelated prompt", "changed prompt", "unrelated run", "disabled"]) {
    const installation = stageWithConfig(`owner-intake-${variant}`, "relay-session.mjs", realOrchestratorConfig())
    const prompt = sleepPrompt.replace("/sleep\n", "/auto-work\n")
    const promptPath = join(installation.base, ".claude/handoffs/NEXT.md")
    mkdirSync(join(installation.base, ".claude/handoffs"), { recursive: true })
    writeFileSync(promptPath, prompt)
    const intake = { gmail: { completed: { old: { classification: "praise" } }, pending: { new: { draftId: "draft", sendAttempted: true } } },
      play: { workflowCycle: "collection-cycle", workflowRun: 42 }, reviewReplies: { workflowCycle: "reply-cycle" } }
    writeRunState({ sessionId: "owner-parent", sleep: false, autoWork: true, crank: false, intake }, installation.base)
    recordHandoffRequest("owner-parent", { ...parseHandoffRequest("/handoff --sleep"), origin: "owner" }, "2026-01-01T00:00:00Z", installation.base)
    const closed = run("relay-session.mjs", ["--close-chain"], { path: installation.path, env: { CLAUDE_CODE_SESSION_ID: "owner-parent" } })
    T(`${UNIT}: owner handoff ${variant} prepares without an open relay chain`, closed.status === 0, closed.stderr)
    if (variant === "changed prompt") writeFileSync(promptPath, `${prompt}\nChanged scope.\n`)
    if (variant === "unrelated run") writeRunState({ sessionId: "another-run", sleep: true, autoWork: true }, installation.base)
    if (variant === "disabled") writeRunState({ ...readRunState(installation.base), autoWork: false }, installation.base)
    const adopted = handoff.adoptOwnerHandoffRun?.("owner-child", variant === "unrelated prompt" ? "/auto-work" : prompt, installation.base) ?? false
    if (!adopted) writeRunState({ sessionId: "owner-child", sleep: true }, installation.base)
    const successor = readRunState(installation.base)
    if (variant === "successor") {
      T(`${UNIT}: owner-started successor retains every intake record`, adopted && successor.sleep === true && successor.autoWork === true &&
        successor.crank === false && JSON.stringify(successor.intake) === JSON.stringify(intake), JSON.stringify(successor))
      writeRunState({ sessionId: "owner-child", sleep: true }, installation.base)
      T(`${UNIT}: ordinary successor writes preserve the restored intake`, JSON.stringify(readRunState(installation.base).intake) === JSON.stringify(intake))
      T(`${UNIT}: owner handoff cannot be adopted twice`, handoff.adoptOwnerHandoffRun?.("third-session", prompt, installation.base) === false)
    } else T(`${UNIT}: ${variant} cannot inherit stale intake`, !adopted && successor.intake === undefined)
  }

  for (const priorChain of [false, true]) {
    const installation = stageWithConfig(`owner-fence-${priorChain}`, "relay-session.mjs", realOrchestratorConfig())
    const checkout = installation.base
    const prompt = sleepPrompt.replace("/sleep\n", "/auto-work\n")
    mkdirSync(join(checkout, ".claude/handoffs"), { recursive: true })
    writeFileSync(join(checkout, ".claude/handoffs/NEXT.md"), prompt)
    if (priorChain) {
      appendChainEntry({ sessionId: "earlier-session" }, checkout)
      confirmChainSuccessor("earlier-session", "owner-parent", "term_parent", 1, checkout)
      closeSessionChain("owner-parent", checkout)
    }
    const predecessor = { sessionId: "owner-parent", sleep: false, autoWork: true,
      intake: { gmail: { pending: { message: { sendAttempted: true } } } } }
    writeRunState(predecessor, checkout)
    recordHandoffRequest("owner-parent", { command: "handoff", sleep: true, origin: "owner" }, "2026-01-01T00:00:00Z", checkout)
    T(`${UNIT}: owner fence ${priorChain} prepares`, handoff.prepareOwnerHandoffRun("owner-parent", checkout))
    T(`${UNIT}: owner fence ${priorChain} adopts`, handoff.adoptOwnerHandoffRun("owner-child", prompt, checkout))
    const assertFenced = (stage, successorId) => {
      T(`${UNIT}: owner fence ${priorChain} ${stage} supersedes predecessor`, supersededSession("owner-parent", checkout)?.sessionId === successorId)
      const successor = JSON.stringify(readRunState(checkout))
      let failure
      try { writeRunState({ ...predecessor, intake: {} }, checkout) } catch (error) { failure = error.message }
      T(`${UNIT}: owner fence ${priorChain} ${stage} refuses stale write`, /superseded/.test(failure ?? ""), failure ?? "write accepted")
      T(`${UNIT}: owner fence ${priorChain} ${stage} preserves successor and send attempt`, JSON.stringify(readRunState(checkout)) === successor)
      if (failure === undefined) writeRunState(JSON.parse(successor), checkout)
    }
    assertFenced("on adoption", "owner-child")
    writeRunState({ sessionId: "owner-child", sleep: true }, checkout)
    assertFenced("after ordinary update", "owner-child")
    writeRunState({ ...readRunState(checkout), sessionId: "relay-child", relay: { from: "owner-child", pending: false, successorTerminal: "term_next" } }, checkout)
    assertFenced("after another transfer", "relay-child")
    T(`${UNIT}: owner fence ${priorChain} keeps successor writable`, readRunState(checkout).intake.gmail.pending.message.sendAttempted === true)
  }

  const oversized = stageWithConfig("owner-oversized-spec", "relay-session.mjs", realOrchestratorConfig()).base
  mkdirSync(join(oversized, ".claude/handoffs"), { recursive: true })
  mkdirSync(join(oversized, ".claude/specs"), { recursive: true })
  writeFileSync(join(oversized, ".claude/handoffs/NEXT.md"), sleepPrompt.replace("/sleep\n", "/auto-work\n"))
  writeFileSync(join(oversized, ".claude/specs/example.md"), "x".repeat(41984))
  writeRunState({ sessionId: "oversized-parent", sleep: false, autoWork: true }, oversized)
  recordHandoffRequest("oversized-parent", { command: "handoff", sleep: true, origin: "owner" }, "2026-01-01T00:00:00Z", oversized)
  let refusal = ""
  try { handoff.prepareOwnerHandoffRun("oversized-parent", oversized) } catch (error) { refusal = error.message }
  T(`${UNIT}: an owner handoff refuses a spec over its ceiling`, refusal.includes("`.claude/specs/example.md` within 40960 B (it is 41984 B)"), refusal || "prepared")
  T(`${UNIT}: a refused owner handoff records no handoff`, readRunState(oversized).ownerHandoff === undefined)
}
