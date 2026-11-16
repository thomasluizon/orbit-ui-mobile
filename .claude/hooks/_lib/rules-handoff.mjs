// The handoff prompt gate: a commit or a stop that leaves NEXT.md out of step with the mode the owner
// asked for is refused. The requested mode comes from the owner's prompt or the machine-origin
// context relay request, so the model cannot talk its way past it.

import { HANDOFF_PROMPT_PATH, handoffAutoWork, handoffCrank, validateHandoffPrompt } from "../../../tools/lib/handoff-prompt.mjs"

const GIT_COMMIT = /\bgit\b((?:\s+-C\s+(?:"[^"]+"|'[^']+'|\S+))*)[^;&|\n]*?\scommit\b/

/**
 * The directories that a `git commit` changes to, in order: the session directory, then each raw `-C` word. The readers give the
 * chain to git as `git -C <dir> -C <w1> ...`, because git applies each word with `chdir`, which follows a symlink before it reads `..`.
 * Null when the command commits nothing.
 */
export const gitCommitDirectory = (command, cwd) => {
  const match = GIT_COMMIT.exec(String(command ?? ""))
  if (!match) return null
  return [cwd, ...[...match[1].matchAll(/-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/g)].map((item) => item[1] ?? item[2] ?? item[3])]
}

const describe = (missing, mode) =>
  `BLOCKED: ${HANDOFF_PROMPT_PATH} does not match the ${mode} handoff the owner asked for.\n\n` +
  `Missing:\n${missing.map((item) => `- ${item}`).join("\n")}\n\n` +
  "Fix the prompt, then commit again. The requirements come from .claude/skills/handoff/SKILL.md.\n"

const modeOf = (request, state) => {
  const mode = request?.origin === "context-relay" ? "context-relay --sleep" : request?.sleep ? "--sleep" : request ? "attended" : "unrecorded"
  return `${mode}${handoffAutoWork(request, state) ? " --auto-work" : ""}${handoffCrank(request, state) ? " --crank" : ""}`
}

/**
 * Every NEXT.md version a commit could record must comply with the recorded request.
 * `promptsForCommit` returns those versions for the commit's directory chain, empty when NEXT.md is unchanged;
 * `specsForCommit` returns every version of a named spec the commit could record.
 */
export const checkHandoffCommit = ({ command, cwd, request, state, promptsForCommit, specsForCommit, refreshCheckout }) => {
  const directory = gitCommitDirectory(command, cwd)
  if (!directory) return null
  for (const text of promptsForCommit(directory)) {
    const missing = validateHandoffPrompt(text, { sleep: request ? request.sleep === true : undefined, crank: handoffCrank(request, state),
      autoWork: handoffAutoWork(request, state), specVersions: specsForCommit && ((path) => specsForCommit(directory, path)) })
    if (missing.length > 0) return { block: true, message: describe(missing, modeOf(request, state)) }
  }
  try {
    refreshCheckout?.(directory)
  } catch (error) {
    return { block: true, message: `Handoff checkout refresh failed: ${error.message}\n` }
  }
  return null
}

/** After a recorded request, a NEXT.md committed since that request, and the spec it names in that commit, must comply before the session may stop. */
export const checkHandoffStop = ({ request, state, headPrompt, headPromptCommittedAt, headSpecVersions }) => {
  if (!request || headPrompt === null) return null
  if (!(Date.parse(headPromptCommittedAt) >= Date.parse(request.recordedAt))) return null
  const missing = validateHandoffPrompt(headPrompt, { sleep: request.sleep === true, crank: handoffCrank(request, state),
    autoWork: handoffAutoWork(request, state), specVersions: headSpecVersions })
  return missing.length === 0 ? null : { block: true, message: describe(missing, modeOf(request, state)) }
}
