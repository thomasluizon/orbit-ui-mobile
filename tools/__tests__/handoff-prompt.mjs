import { mkdirSync } from "node:fs"
import { join } from "node:path"

import { parseHandoffRequest, readHandoffRequest, recordHandoffRequest, validateHandoffPrompt } from "../lib/handoff-prompt.mjs"

import { T, root } from "./_harness.mjs"

const UNIT = "lib/handoff-prompt.mjs"

const sleepPrompt = [
  "/sleep", "", "Read `.claude/specs/example.md` before anything else.", "",
  "## Sleep", "", "Unattended.", "", "## Goal", "", "Finish it: `gh issue list --repo x --state open`.", "",
  "## In flight", "", "none", "", "## Previous prompt, disposition", "", "- carried", "",
  "Every identifier in this prompt came from a previous session: treat each as a lead to verify.",
].join("\n")

export const cases = () => {
  T(`${UNIT}: /wrap-up --sleep records a sleep request`, JSON.stringify(parseHandoffRequest("/wrap-up --sleep")) === JSON.stringify({ command: "wrap-up", sleep: true }))
  T(`${UNIT}: /handoff with other arguments stays attended`, parseHandoffRequest("/handoff finish the calendar")?.sleep === false)
  T(`${UNIT}: a non-handoff command records nothing`, parseHandoffRequest("/sleep") === null)
  for (const [label, prompt, expected] of [
    ["a leading word keeps the sleep argument", "RUN /wrap-up --sleep", { command: "wrap-up", sleep: true }],
    ["a polite prefix is read", "please /handoff", { command: "handoff", sleep: false }],
    ["a command on the second line is read", "Finish this task.\n/wrap-up --sleep", { command: "wrap-up", sleep: true }],
    ["an inline code mention is ignored", "Read `/handoff --relay --sleep` in NEXT.md.", null],
    ["a longer inline delimiter is ignored", "Read ``/wrap-up --sleep `example` ``.", null],
    ["a fenced code mention is ignored", "Example:\n```text\n/wrap-up --sleep\n```", null],
    ["a tilde fenced mention is ignored", "Example:\n~~~text\n/handoff --sleep\n~~~", null],
    ["an unfinished fence stays quoted", "```text\n/handoff --sleep", null],
    ["a shorter fence cannot end a longer fence", "````text\n```\n/handoff --sleep\n````", null],
    ["a real command after a fence is read", "```text\n/wrap-up --sleep\n```\nplease /handoff", { command: "handoff", sleep: false }],
    ["a pasted content mention is ignored", '<pasted_content source="NEXT.md">\n/handoff --relay --sleep\n</pasted_content>', null],
    ["an unfinished pasted block stays quoted", "<pasted_content>\n/wrap-up --sleep", null],
    ["a real command after a pasted block is read", "<pasted_content>\n/wrap-up --sleep\n</pasted_content>\nplease /handoff", { command: "handoff", sleep: false }],
    ["a skill path is ignored", ".claude/skills/handoff/SKILL.md", null],
    ["a command-shaped path is ignored", "Read /handoff/SKILL.md and /wrap-up.md", null],
    ["a command suffix is ignored", "/handoff-extra --sleep", null],
    ["a parenthesized command is read", "please (/handoff)", { command: "handoff", sleep: false }],
    ["the first command keeps its own arguments", "/handoff then /wrap-up --sleep", { command: "handoff", sleep: false }],
    ["the first sleep command wins", "please /wrap-up --sleep then /handoff", { command: "wrap-up", sleep: true }],
    ["a mention before a real command is ignored", "`/handoff --sleep`\nplease /wrap-up", { command: "wrap-up", sleep: false }],
    ["sleep inside code is ignored", "/handoff `--sleep`", { command: "handoff", sleep: false }],
    ["the slash sleep argument stays supported", "please /handoff /sleep", { command: "handoff", sleep: true }],
    ["another command does not hide a handoff", "/progress then /handoff", { command: "handoff", sleep: false }],
    ["expanded command tags stay supported", "<command-name>/wrap-up</command-name>\n<command-args>--sleep</command-args>", { command: "wrap-up", sleep: true }],
    ["pasted expanded tags are ignored", "<pasted_content><command-name>/wrap-up</command-name><command-args>--sleep</command-args></pasted_content>", null],
    ["a typed command before expanded tags wins", "/handoff\n<command-name>/wrap-up</command-name><command-args>--sleep</command-args>", { command: "handoff", sleep: false }],
    ["expanded tags before a typed command win", "<command-name>/handoff</command-name><command-args></command-args>\n/wrap-up --sleep", { command: "handoff", sleep: false }],
  ]) {
    const actual = parseHandoffRequest(prompt)
    T(`${UNIT}: ${label}`, JSON.stringify(actual) === JSON.stringify(expected), `got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
  }
  T(`${UNIT}: a complete sleep prompt has no missing requirement`, validateHandoffPrompt(sleepPrompt, { sleep: true }).length === 0, JSON.stringify(validateHandoffPrompt(sleepPrompt, { sleep: true })))
  const withoutSleepLine = validateHandoffPrompt(sleepPrompt.replace("/sleep\n", "# NEXT\n"), { sleep: true })
  T(`${UNIT}: a sleep prompt without the leading /sleep is refused`, withoutSleepLine.some((item) => item.includes("`/sleep`")), JSON.stringify(withoutSleepLine))
  const withoutSpec = validateHandoffPrompt(sleepPrompt.replace("`.claude/specs/example.md`", "the spec"), { sleep: true })
  T(`${UNIT}: the spec path must open the prompt`, withoutSpec.some((item) => item.includes(".claude/specs")), JSON.stringify(withoutSpec))

  const repoRoot = join(root, "handoff-prompt", "checkout")
  mkdirSync(join(repoRoot, ".git"), { recursive: true })
  T(`${UNIT}: an unrecorded session reads as no request`, readHandoffRequest("s1", repoRoot) === null)
  recordHandoffRequest("s1", { command: "handoff", sleep: true }, "2026-01-01T00:00:00Z", repoRoot)
  T(`${UNIT}: a recorded request is read back for its own session`, readHandoffRequest("s1", repoRoot)?.sleep === true && readHandoffRequest("s2", repoRoot) === null)
}
