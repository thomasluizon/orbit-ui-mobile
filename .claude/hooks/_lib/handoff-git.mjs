// Reads the NEXT.md versions the handoff prompt gate judges. Pathspec parsing cannot know every shape
// that includes the file (a directory, a glob, `-a`, `--include`), so the commit check judges every
// version git could record, and the stop check judges the newest commit of the file on any branch.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { HANDOFF_PROMPT_PATH } from "../../../tools/lib/handoff-prompt.mjs"

const git = (directory, args) =>
  execFileSync("git", ["-C", directory, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })

const listed = (output) => output.split("\n").map((line) => line.trim()).includes(HANDOFF_PROMPT_PATH)

/** The staged NEXT.md when it differs from HEAD, and the working copy when that differs too: each is a version a commit could record. */
export const promptsForCommit = (directory) => {
  const top = git(directory, ["rev-parse", "--show-toplevel"]).trim()
  const prompts = []
  if (listed(git(top, ["diff", "--cached", "--name-only"]))) prompts.push(git(top, ["show", `:${HANDOFF_PROMPT_PATH}`]))
  const unstaged = listed(git(top, ["diff", "--name-only"])) || listed(git(top, ["ls-files", "--others", "--exclude-standard"]))
  if (unstaged) prompts.push(readFileSync(join(top, HANDOFF_PROMPT_PATH), "utf8"))
  return prompts
}

/** The newest committed NEXT.md on any local or remote branch, so a handoff committed in another checkout is still judged. */
export const newestCommittedPrompt = (repoRoot) => {
  try {
    const [sha, committedAt] = git(repoRoot, ["log", "-1", "--format=%H%n%cI", "--branches", "--remotes", "HEAD", "--", HANDOFF_PROMPT_PATH]).trim().split("\n")
    if (!sha) return { text: null, committedAt: "" }
    return { text: git(repoRoot, ["show", `${sha}:${HANDOFF_PROMPT_PATH}`]), committedAt }
  } catch {
    return { text: null, committedAt: "" }
  }
}
