// The handoff prompt gate: a commit or a stop that leaves NEXT.md out of step with the mode the owner
// asked for is refused. The requested mode comes from the owner's own prompt, recorded by
// record-handoff-request.mjs, so the model cannot talk its way past it.

import { HANDOFF_PROMPT_PATH, validateHandoffPrompt } from "../../../tools/lib/handoff-prompt.mjs"

const GIT_COMMIT = /\bgit\b((?:\s+-C\s+(?:"[^"]+"|'[^']+'|\S+))*)[^;&|\n]*?\scommit\b/

/** The directory a `git commit` runs in, or null when the command commits nothing. */
export const gitCommitDirectory = (command, cwd) => {
  const match = GIT_COMMIT.exec(String(command ?? ""))
  if (!match) return null
  const dashC = [...match[1].matchAll(/-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/g)].at(-1)
  return dashC ? (dashC[1] ?? dashC[2] ?? dashC[3]) : cwd
}

const describe = (missing, mode) =>
  `BLOCKED: ${HANDOFF_PROMPT_PATH} does not match the ${mode} handoff the owner asked for.\n\n` +
  `Missing:\n${missing.map((item) => `- ${item}`).join("\n")}\n\n` +
  "Fix the prompt, then commit again. The requirements come from .claude/skills/handoff/SKILL.md.\n"

const modeOf = (request) => (request?.sleep ? "--sleep" : request ? "attended" : "unrecorded")

/**
 * A commit that includes NEXT.md must carry a prompt that complies with the recorded request.
 * `promptForCommit` returns the text the commit would record, or null when the commit leaves NEXT.md alone.
 */
export const checkHandoffCommit = ({ command, cwd, request, promptForCommit }) => {
  const directory = gitCommitDirectory(command, cwd)
  if (!directory) return null
  const text = promptForCommit(directory, command)
  if (text === null) return null
  const missing = validateHandoffPrompt(text, { sleep: request ? request.sleep === true : undefined })
  return missing.length === 0 ? null : { block: true, message: describe(missing, modeOf(request)) }
}

/** After a recorded request, a NEXT.md committed since that request must comply before the session may stop. */
export const checkHandoffStop = ({ request, headPrompt, headPromptCommittedAt }) => {
  if (!request || headPrompt === null) return null
  if (!(Date.parse(headPromptCommittedAt) >= Date.parse(request.recordedAt))) return null
  const missing = validateHandoffPrompt(headPrompt, { sleep: request.sleep === true })
  return missing.length === 0 ? null : { block: true, message: describe(missing, modeOf(request)) }
}
