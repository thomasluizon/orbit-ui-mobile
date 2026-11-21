import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { parseHandoffRequest, readHandoffRequest, recordHandoffRequest, validateHandoffPrompt } from "../lib/handoff-prompt.mjs"
import * as handoff from "../lib/handoff-prompt.mjs"
import { readRunState } from "../lib/run-state.mjs"

import { T, root, same } from "./_harness.mjs"

const UNIT = "lib/handoff-prompt.mjs"

const sleepPrompt = [
  "/sleep", "", "Read `.claude/specs/example.md` before anything else.", "",
  "## Sleep", "", "Unattended.", "", "## Goal", "", "Finish it: `gh issue list --repo x --state open`.", "",
  "## In flight", "", "none", "", "## Previous prompt, disposition", "", "- carried", "",
  "Every identifier in this prompt came from a previous session: treat each as a lead to verify.",
].join("\n")

export const cases = () => {
  T(`${UNIT}: a question mentioning handoff is not an invocation`, parseHandoffRequest("we are working always using /handoff, wrap-up, etc etc\n\nwhat happens when the spec is finished?") === null)
  T(`${UNIT}: /wrap-up --sleep records a sleep request`, JSON.stringify(parseHandoffRequest("/wrap-up --sleep")) === JSON.stringify({ command: "wrap-up", sleep: true }))
  T(`${UNIT}: /handoff with other arguments stays attended`, parseHandoffRequest("/handoff finish the calendar")?.sleep === false)
  T(`${UNIT}: a non-handoff command records nothing`, parseHandoffRequest("/sleep") === null)
  for (const [label, prompt, expected] of [
    ["a leading word is a mention", "RUN /wrap-up --sleep", null],
    ["a polite prefix is a mention", "please /handoff", null],
    ["a command on the second line is read", "Finish this task.\n/wrap-up --sleep", { command: "wrap-up", sleep: true }],
    ["an inline code mention is ignored", "Read `/handoff --relay --sleep` in NEXT.md.", null],
    ["a longer inline delimiter is ignored", "Read ``/wrap-up --sleep `example` ``.", null],
    ["a fenced code mention is ignored", "Example:\n```text\n/wrap-up --sleep\n```", null],
    ["a tilde fenced mention is ignored", "Example:\n~~~text\n/handoff --sleep\n~~~", null],
    ["an unfinished fence stays quoted", "```text\n/handoff --sleep", null],
    ["a shorter fence cannot end a longer fence", "````text\n```\n/handoff --sleep\n````", null],
    ["a real command after a fence is read", "```text\n/wrap-up --sleep\n```\n/handoff", { command: "handoff", sleep: false }],
    ["a pasted content mention is ignored", '<pasted_content source="NEXT.md">\n/handoff --relay --sleep\n</pasted_content>', null],
    ["an unfinished pasted block stays quoted", "<pasted_content>\n/wrap-up --sleep", null],
    ["a real command after a pasted block is read", "<pasted_content>\n/wrap-up --sleep\n</pasted_content>\n/handoff", { command: "handoff", sleep: false }],
    ["a nested pasted block keeps the outer block quoted", "<pasted_content>\n<pasted_content>\nquoted\n</pasted_content>\n/handoff --sleep\n</pasted_content>", null],
    ["an unfinished outer pasted block stays quoted past a nested close", "<pasted_content>\n<pasted_content>\nquoted\n</pasted_content>\n/handoff --sleep", null],
    ["a real command after a nested pasted block is read", "<pasted_content>\n<pasted_content>\n/wrap-up\n</pasted_content>\n/wrap-up --sleep\n</pasted_content>\n/handoff", { command: "handoff", sleep: false }],
    ["a pasted close with another id does not end the block", '<pasted_content id="a1">\n</pasted_content id="b2">\n/handoff --sleep\n</pasted_content id="a1">', null],
    ["a real command after an id-tagged pasted block is read", '<pasted_content id="a1">\n/handoff\n</pasted_content id="a1">\n/wrap-up --sleep', { command: "wrap-up", sleep: true }],
    ["a skill path is ignored", ".claude/skills/handoff/SKILL.md", null],
    ["a command-shaped path is ignored", "Read /handoff/SKILL.md and /wrap-up.md", null],
    ["a command suffix is ignored", "/handoff-extra --sleep", null],
    ["a parenthesized mention is ignored", "please (/handoff)", null],
    ["a parenthesized sleep mention is ignored", "please (/handoff --sleep)", null],
    ["a parenthesized wrap-up mention is ignored", "please (/wrap-up /sleep)", null],
    ["a sleep option suffix stays attended", "/handoff --sleep-later", { command: "handoff", sleep: false }],
    ["the first command keeps its own arguments", "/handoff then /wrap-up --sleep", { command: "handoff", sleep: false }],
    ["the first sleep command wins", "/wrap-up --sleep then /handoff", { command: "wrap-up", sleep: true }],
    ["a mention before a real command is ignored", "`/handoff --sleep`\n/wrap-up", { command: "wrap-up", sleep: false }],
    ["sleep inside code is ignored", "/handoff `--sleep`", { command: "handoff", sleep: false }],
    ["the slash sleep argument stays supported", "/handoff /sleep", { command: "handoff", sleep: true }],
    ["another command keeps an inline handoff a mention", "/progress then /handoff", null],
    ["expanded command tags stay supported", "<command-name>/wrap-up</command-name>\n<command-args>--sleep</command-args>", { command: "wrap-up", sleep: true }],
    ["pasted expanded tags are ignored", "<pasted_content><command-name>/wrap-up</command-name><command-args>--sleep</command-args></pasted_content>", null],
    ["a typed command before expanded tags wins", "/handoff\n<command-name>/wrap-up</command-name><command-args>--sleep</command-args>", { command: "handoff", sleep: false }],
    ["expanded tags before a typed command win", "<command-name>/handoff</command-name><command-args></command-args>\n/wrap-up --sleep", { command: "handoff", sleep: false }],
  ]) {
    same(`${UNIT}: ${label}`, parseHandoffRequest(prompt), expected)
  }
  T(`${UNIT}: a complete sleep prompt has no missing requirement`, validateHandoffPrompt(sleepPrompt, { sleep: true }).length === 0, JSON.stringify(validateHandoffPrompt(sleepPrompt, { sleep: true })))
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
  const localIssues = (missing) => missing.filter((item) => item.includes("` without "))
  const carryDirectory = [".orbit-", "run-carry"].join("")
  for (const [label, reference] of [
    ["a scratchpad file", "Read `scratchpad/note-2469-r20.md` first."],
    ["a scratchpad paragraph", "Scratchpad: copy the predecessor files."],
    ["an `S` file reference", "| `ui#2469` | `S note-2469-r20.md` |"],
    ["an `S` tool reference", "Run `S usage-guard.mjs` at each wake."],
    ["a system temporary directory path", `Logs are in ${["/private", "/tmp/orbit-workers"].join("")}.`],
    ["the old run carry", `Run \`$HOME/${carryDirectory}/carry-from-predecessor.sh\`.`],
    ["a home directory path", "Read `~/notes/run.md`."],
    ["a home variable path", "Read `${HOME}/notes/run.md`."],
    ["a macOS home path", `Read ${["/", "Users/alex/run.md"].join("")}.`],
  ]) {
    const prompt = validateHandoffPrompt(`${sleepPrompt}\n${reference}\n`, { sleep: true })
    T(`${UNIT}: a prompt that names ${label} is refused`, localIssues(prompt).length >= 1 && localIssues(prompt)[0].startsWith("`.claude/handoffs/NEXT.md` without "), JSON.stringify(prompt))
    const spec = validateHandoffPrompt(sleepPrompt, { sleep: true, specVersions: () => [`# Spec\n\n${reference}\n`] })
    T(`${UNIT}: a spec that names ${label} is refused`, localIssues(spec).length >= 1 && localIssues(spec)[0].startsWith("`.claude/specs/example.md` without "), JSON.stringify(spec))
  }
  for (const [label, text] of [
    ["a repository path", "Read `tools/lib/run-state.mjs` and `.claude/skills/handoff/SKILL.md`."],
    ["a ticket comment link", "The round note is https://github.com/thomasluizon/orbit-tickets/issues/2152#issuecomment-1."],
    ["a capital S word", "S is not a file, and Sentry has no extension."],
  ]) {
    T(`${UNIT}: a prompt that names ${label} passes the local reference check`, localIssues(validateHandoffPrompt(`${sleepPrompt}\n${text}\n`, { sleep: true })).length === 0)
  }
  T(`${UNIT}: a document outside the relay paths has no local reference check`, handoff.relayDocumentLocalReferences("docs/notes.md", "Read `S note.md`.").length === 0)
  const specRoot = join(root, "handoff-prompt", "spec-checkout")
  mkdirSync(join(specRoot, ".claude", "specs"), { recursive: true })
  writeFileSync(join(specRoot, ".claude", "specs", "example.md"), "x".repeat(41984))
  T(`${UNIT}: a checkout publishes its working copy of the spec`, handoff.checkoutSpecVersions(specRoot)(".claude/specs/example.md")[0]?.length === 41984)
  T(`${UNIT}: a spec the checkout lacks has no version`, handoff.checkoutSpecVersions(specRoot)(".claude/specs/missing.md").length === 0)

  const repoRoot = join(root, "handoff-prompt", "checkout")
  mkdirSync(join(repoRoot, ".git"), { recursive: true })
  T(`${UNIT}: an unrecorded session reads as no request`, readHandoffRequest("s1", repoRoot) === null)
  recordHandoffRequest("s1", { command: "handoff", sleep: true }, "2026-01-01T00:00:00Z", repoRoot)
  T(`${UNIT}: a recorded request is read back for its own session`, readHandoffRequest("s1", repoRoot)?.sleep === true && readHandoffRequest("s2", repoRoot) === null)
  recordHandoffRequest("s1", { command: "wrap-up", sleep: false }, "2026-01-01T00:01:00Z", repoRoot)
  T(`${UNIT}: a newer request replaces the earlier one of the same session`, readHandoffRequest("s1", repoRoot)?.command === "wrap-up" && readHandoffRequest("s1", repoRoot)?.sleep === false)
  T(`${UNIT}: recording a request never writes a run record`, readRunState(repoRoot) === null)
}
