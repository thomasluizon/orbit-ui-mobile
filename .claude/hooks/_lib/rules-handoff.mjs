// The handoff prompt gate: a commit or a stop that leaves NEXT.md out of step with the mode the owner
// asked for is refused. The requested mode comes from the owner's prompt or the machine-origin
// context relay request, so the model cannot talk its way past it.

import { resolve } from "node:path"
import { HANDOFF_PROMPT_PATH, handoffCrank, validateHandoffPrompt } from "../../../tools/lib/handoff-prompt.mjs"

const GIT_COMMIT = /\bgit\b((?:\s+-C\s+(?:"[^"]+"|'[^']+'|\S+))*)[^;&|\n]*?\scommit\b/

/** The directory a `git commit` runs in, or null when the command commits nothing. */
export const gitCommitDirectory = (command, cwd) => {
  const match = GIT_COMMIT.exec(String(command ?? ""))
  if (!match) return null
  const directories = [...match[1].matchAll(/-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/g)]
  return directories.reduce((directory, item) => resolve(directory, item[1] ?? item[2] ?? item[3]), cwd)
}

const describe = (missing, mode) =>
  `BLOCKED: ${HANDOFF_PROMPT_PATH} does not match the ${mode} handoff the owner asked for.\n\n` +
  `Missing:\n${missing.map((item) => `- ${item}`).join("\n")}\n\n` +
  "Fix the prompt, then commit again. The requirements come from .claude/skills/handoff/SKILL.md.\n"

const modeOf = (request, state) => {
  const mode = request?.origin === "context-relay" ? "context-relay --sleep" : request?.sleep ? "--sleep" : request ? "attended" : "unrecorded"
  return handoffCrank(request, state) ? `${mode} --crank` : mode
}

/**
 * Every NEXT.md version a commit could record must comply with the recorded request.
 * `promptsForCommit` returns those versions for the commit's directory, empty when NEXT.md is unchanged.
 */
export const checkHandoffCommit = ({ command, cwd, request, state, promptsForCommit, refreshCheckout }) => {
  const directory = gitCommitDirectory(command, cwd)
  if (!directory) return null
  for (const text of promptsForCommit(directory)) {
    const missing = validateHandoffPrompt(text, { sleep: request ? request.sleep === true : undefined, crank: handoffCrank(request, state) })
    if (missing.length > 0) return { block: true, message: describe(missing, modeOf(request, state)) }
  }
  try {
    refreshCheckout?.(directory)
  } catch (error) {
    return { block: true, message: `Handoff checkout refresh failed: ${error.message}\n` }
  }
  return null
}

/** After a recorded request, a NEXT.md committed since that request must comply before the session may stop. */
export const checkHandoffStop = ({ request, state, headPrompt, headPromptCommittedAt }) => {
  if (!request || headPrompt === null) return null
  if (!(Date.parse(headPromptCommittedAt) >= Date.parse(request.recordedAt))) return null
  const missing = validateHandoffPrompt(headPrompt, { sleep: request.sleep === true, crank: handoffCrank(request, state) })
  return missing.length === 0 ? null : { block: true, message: describe(missing, modeOf(request, state)) }
}
