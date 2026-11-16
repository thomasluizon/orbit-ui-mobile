// The handoff prompt gate: a commit or a stop that leaves NEXT.md out of step with the mode the owner
// asked for is refused. The requested mode comes from the owner's prompt or the machine-origin
// context relay request, so the model cannot talk its way past it.

import { HANDOFF_PROMPT_PATH, handoffAutoWork, handoffCrank, validateHandoffPrompt } from "../../../tools/lib/handoff-prompt.mjs"
import { PLAIN_SUBSET_ADVICE } from "./command-expander.mjs"
import { gitCommandParts, gitDirectoryChain, readGitCommands } from "./rules-git.mjs"

/** The text of a `git commit` with its `-C` words. Only an attended session reads a command outside the subset with it. */
const TEXT_GIT_COMMIT = /\bgit\b((?:\s+-C\s+(?:"[^"]+"|'[^']+'|\S+))*)[^;&|\n]*?\scommit\b/

/**
 * The directory chain of each `git commit` that `command` runs, read as the git rule reads it: the shell directory after the `cd` model,
 * then each `-C` word as the shell gives it to git. The readers give each chain to git as `git -C <dir> -C <w1> ...`, because git
 * applies each word with `chdir`, which follows a symlink before it reads `..`. Text that runs no `git commit` gives no chain.
 * A command outside the subset whose text names a `git commit` gives `notModelled` in an unattended run, and the chain of that text attended.
 */
export const gitCommitChains = (command, { cwd, home, unattended = true } = {}) => {
  const text = String(command ?? "")
  const { gitCommands, notModelled } = readGitCommands(text, { cwd, home })
  if (!notModelled) {
    const chains = gitCommands.map(({ tokens, directory }) => ({ directory, ...gitCommandParts(tokens) }))
      .filter(({ subcommand }) => subcommand === "commit").map(({ globals, directory }) => gitDirectoryChain(globals, directory))
    return { chains: [...new Map(chains.map((chain) => [JSON.stringify(chain), chain])).values()], notModelled: "" }
  }
  const match = TEXT_GIT_COMMIT.exec(text)
  if (!match) return { chains: [], notModelled: "" }
  if (unattended) return { chains: [], notModelled }
  return { chains: [[cwd, ...[...match[1].matchAll(/-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/g)].map((item) => item[1] ?? item[2] ?? item[3])]], notModelled: "" }
}

const notModelledRefusal = (command, notModelled) =>
  `BLOCKED commit (the handoff gate cannot read it):\n  ${command.slice(0, 400)}\n\n` +
  `The command holds ${notModelled}. In an unattended run the handoff gate reads a \`git commit\` only in the plain shell subset, ` +
  `because it cannot prove which ${HANDOFF_PROMPT_PATH} another command records.\n${PLAIN_SUBSET_ADVICE}\n`

const describe = (missing, mode) =>
  `BLOCKED: ${HANDOFF_PROMPT_PATH} does not match the ${mode} handoff the owner asked for.\n\n` +
  `Missing:\n${missing.map((item) => `- ${item}`).join("\n")}\n\n` +
  "Fix the prompt, then commit again. The requirements come from .claude/skills/handoff/SKILL.md.\n"

const modeOf = (request, state) => {
  const mode = request?.origin === "context-relay" ? "context-relay --sleep" : request?.sleep ? "--sleep" : request ? "attended" : "unrecorded"
  return `${mode}${handoffAutoWork(request, state) ? " --auto-work" : ""}${handoffCrank(request, state) ? " --crank" : ""}`
}

/**
 * Every NEXT.md version each commit of the command could record must comply with the recorded request.
 * `promptsForCommit` returns those versions for a commit's directory chain, empty when NEXT.md is unchanged;
 * `specsForCommit` returns every version of a named spec the commit could record.
 */
export const checkHandoffCommit = ({ command, cwd, home, unattended = true, request, state, promptsForCommit, specsForCommit, refreshCheckout }) => {
  const { chains, notModelled } = gitCommitChains(command, { cwd, home, unattended })
  if (notModelled) return { block: true, message: notModelledRefusal(String(command), notModelled) }
  for (const chain of chains) {
    for (const text of promptsForCommit(chain)) {
      const missing = validateHandoffPrompt(text, { sleep: request ? request.sleep === true : undefined, crank: handoffCrank(request, state),
        autoWork: handoffAutoWork(request, state), specVersions: specsForCommit && ((path) => specsForCommit(chain, path)) })
      if (missing.length > 0) return { block: true, message: describe(missing, modeOf(request, state)) }
    }
  }
  try {
    for (const chain of chains) refreshCheckout?.(chain)
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
