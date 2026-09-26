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
