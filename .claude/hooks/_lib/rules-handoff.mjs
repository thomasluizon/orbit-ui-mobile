// The handoff prompt gate: a commit or a stop that leaves NEXT.md out of step with the mode the owner
// asked for is refused. The requested mode comes from the owner's prompt or the machine-origin
// context relay request, so the model cannot talk its way past it.

import { HANDOFF_PROMPT_PATH, validateHandoffPrompt } from "../../../tools/lib/handoff-prompt.mjs"
import { PLAIN_SUBSET_ADVICE } from "./shell-subset.mjs"
import { gitCommandParts, gitDirectoryChain, readGitCommands } from "./rules-git.mjs"

/**
 * The git subcommands that can record the index in a commit: `commit`; `merge`, `cherry-pick`, `revert`, `rebase`, `am` and `pull`,
 * which record it when they end a stopped operation with `--continue` or make a merge commit; and `stash`, which records it in a stash
 * commit that `git merge --ff-only refs/stash` can put on the branch.
 */
const RECORDING_SUBCOMMANDS = ["commit", "merge", "cherry-pick", "revert", "rebase", "am", "pull", "stash"]
/** The forms of `git stash` that record nothing. Each other form records the index: no word, an option, `push`, `save` and `create`. */
const STASH_FORMS_THAT_RECORD_NOTHING = new Set(["list", "show", "drop", "pop", "apply", "clear", "branch", "store"])
const recordsIndex = ({ subcommand, rest }) => RECORDING_SUBCOMMANDS.includes(subcommand) && !(subcommand === "stash" && STASH_FORMS_THAT_RECORD_NOTHING.has(rest[0]))

/** The text of a git command in `RECORDING_SUBCOMMANDS` with its `-C` words. Only an attended session reads a command outside the subset with it. */
const TEXT_GIT_RECORD = new RegExp(`\\bgit\\b((?:\\s+-C\\s+(?:"[^"]+"|'[^']+'|\\S+))*)[^;&|\\n]*?\\s(${RECORDING_SUBCOMMANDS.join("|")})(?![\\w-])`)

/**
 * Each git command that can record the index that `command` runs, as `{ chain, subcommand }`. The chain is read as the git rule reads it:
 * the shell directory after the `cd` model, then each `-C` word as the shell gives it to git. The readers give each chain to git as
 * `git -C <dir> -C <w1> ...`, because git applies each word with `chdir`, which follows a symlink before it reads `..`. Text that runs no
 * such command gives no chain. A command outside the subset whose text names one gives `notModelled` in an unattended run. Attended, each such git command of that text gives its own chain.
 */
export const gitCommitChains = (command, { cwd, home, unattended = true } = {}) => {
  const text = String(command ?? "")
  const { gitCommands, notModelled } = readGitCommands(text, { cwd, home })
  if (!notModelled) {
    const chains = gitCommands.map(({ tokens, directory }) => ({ directory, ...gitCommandParts(tokens) })).filter(recordsIndex)
      .map(({ globals, directory, subcommand }) => ({ chain: gitDirectoryChain(globals, directory), subcommand }))
    return { chains: [...new Map(chains.map((item) => [JSON.stringify(item), item])).values()], notModelled: "" }
  }
  const matches = [...text.matchAll(new RegExp(TEXT_GIT_RECORD.source, "g"))]
    .filter((match) => recordsIndex({ subcommand: match[2], rest: [text.slice(match.index + match[0].length).match(/^\s+([^\s;&|]+)/)?.[1]] }))
  if (matches.length === 0) return { chains: [], notModelled: "" }
  if (unattended) return { chains: [], notModelled }
  const chains = matches.map((match) => ({ chain: [cwd, ...[...match[1].matchAll(/-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/g)].map((item) => item[1] ?? item[2] ?? item[3])], subcommand: match[2] }))
  return { chains: [...new Map(chains.map((item) => [JSON.stringify(item), item])).values()], notModelled: "" }
}

const notModelledRefusal = (command, notModelled) =>
  `BLOCKED commit (the handoff gate cannot read it):\n  ${command.slice(0, 400)}\n\n` +
  `The command holds ${notModelled}. In an unattended run the handoff gate reads a git command that can record the index (${RECORDING_SUBCOMMANDS.join(", ")}) only in the plain shell subset, ` +
  `because it cannot prove which ${HANDOFF_PROMPT_PATH} another command records.\n${PLAIN_SUBSET_ADVICE}\n`

const describe = (missing, mode) =>
  `BLOCKED: ${HANDOFF_PROMPT_PATH} does not match the ${mode} handoff the owner asked for.\n\n` +
  `Missing:\n${missing.map((item) => `- ${item}`).join("\n")}\n\n` +
  "Fix the prompt, then commit again. The requirements come from .claude/skills/handoff/SKILL.md.\n"

const modeOf = (request) => (request?.origin === "context-relay" ? "context-relay --sleep" : request?.sleep ? "--sleep" : request ? "attended" : "unrecorded")

/**
 * Every NEXT.md version each recording git command of the command could record must comply with the recorded request.
 * `promptsForCommit` returns those versions for a directory chain, empty when NEXT.md is unchanged;
 * `specsForCommit` returns every version of a named spec the command could record. `refreshCheckout` runs only for the chain of a
 * `git commit`: it merges `origin/main`, which must never come before a merge, a pull, a rebase or a stash that the agent asked for.
 */
export const checkHandoffCommit = ({ command, cwd, home, unattended = true, request, promptsForCommit, specsForCommit, refreshCheckout }) => {
  const { chains: recorded, notModelled } = gitCommitChains(command, { cwd, home, unattended })
  if (notModelled) return { block: true, message: notModelledRefusal(String(command), notModelled) }
  const chains = [...new Map(recorded.map(({ chain }) => [JSON.stringify(chain), chain])).values()]
  for (const chain of chains) {
    for (const text of promptsForCommit(chain)) {
      const missing = validateHandoffPrompt(text, { sleep: request ? request.sleep === true : undefined, specVersions: specsForCommit && ((path) => specsForCommit(chain, path)) })
      if (missing.length > 0) return { block: true, message: describe(missing, modeOf(request)) }
    }
  }
  try {
    for (const { chain } of recorded.filter(({ subcommand }) => subcommand === "commit")) refreshCheckout?.(chain)
  } catch (error) {
    return { block: true, message: `Handoff checkout refresh failed: ${error.message}\n` }
  }
  return null
}

/** After a recorded request, a NEXT.md committed since that request, and the spec it names in that commit, must comply before the session may stop. */
export const checkHandoffStop = ({ request, headPrompt, headPromptCommittedAt, headSpecVersions }) => {
  if (!request || headPrompt === null) return null
  if (!(Date.parse(headPromptCommittedAt) >= Date.parse(request.recordedAt))) return null
  const missing = validateHandoffPrompt(headPrompt, { sleep: request.sleep === true, specVersions: headSpecVersions })
  return missing.length === 0 ? null : { block: true, message: describe(missing, modeOf(request)) }
}
