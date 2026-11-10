import { spawnSync } from "node:child_process"
import { redactSecrets } from "./github-auth.mjs"

const HARNESS_PATHS = ["tools/", ".claude/skills/", ".claude/hooks/", ".claude/rules/"]
const DOCS_PATHS = [":(top).claude/specs/", ":(top).claude/handoffs/"]

const runGit = (repoRoot, args) => spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", timeout: 60_000,
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_MERGE_AUTOEDIT: "no" }, maxBuffer: 16 * 1024 * 1024 })

const gitFailure = (args, result) => new Error(redactSecrets(`relay checkout: git ${args.join(" ")} failed (${result.status ?? result.error?.code}):\n${result.stdout || ""}${result.stderr || ""}${result.error?.message || ""}`))

const git = (repoRoot, args) => {
  const result = runGit(repoRoot, args)
  if (result.error || result.status !== 0) throw gitFailure(args, result)
  return result.stdout
}

const fetchMain = (repoRoot) => git(repoRoot, ["fetch", "--no-tags", "origin", "refs/heads/main:refs/remotes/origin/main"])

/** Refresh only the checked-out relay branch; a conflict never enters the working tree. */
export const syncRelayCheckout = (repoRoot) => {
  const branch = git(repoRoot, ["symbolic-ref", "--short", "HEAD"]).trim()
  if (branch === "main") throw new Error("relay checkout: main is not a relay branch")
  fetchMain(repoRoot)
  git(repoRoot, ["merge-tree", "--write-tree", "--name-only", "HEAD", "origin/main"])
  git(repoRoot, ["merge", "--no-edit", "origin/main"])
}

/** Include additions, deletions and both names of renames, without Git's path quoting. */
export const relayHarnessDifferences = (repoRoot) => {
  fetchMain(repoRoot)
  return git(repoRoot, ["diff", "--no-renames", "--name-only", "-z", "HEAD", "origin/main", "--", ...HARNESS_PATHS])
    .split("\0").filter(Boolean)
}

export const handoffDocsChanged = (repoRoot) => [[], ["--cached"]].some((flags) =>
  git(repoRoot, ["diff", ...flags, "--name-only", "-z", "--", ...DOCS_PATHS]).length > 0)

/** Markers of a merge, cherry-pick or revert that waits for its commit, each per worktree. */
const OPEN_OPERATION_MARKERS = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"]

/**
 * Resolves each marker through the ref store, because the reftable backend keeps CHERRY_PICK_HEAD and REVERT_HEAD
 * there rather than as files. `rev-parse -q --verify` exits 1 with no output when the ref does not exist.
 */
export const operationInProgress = (repoRoot) => OPEN_OPERATION_MARKERS.some((marker) => {
  const args = ["rev-parse", "-q", "--verify", marker]
  const result = runGit(repoRoot, args)
  if (!result.error && result.status === 0) return true
  if (!result.error && result.status === 1) return false
  throw gitFailure(args, result)
})
