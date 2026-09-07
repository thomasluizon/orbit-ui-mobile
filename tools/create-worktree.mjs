#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const USAGE = `usage: create-worktree.mjs --repo path:<path> --name <name> --base-branch <branch> --issue <ticket> --no-parent --comment <text> --json

Fetches the requested remote base, refuses creation unless the local base is exactly that commit,
prints the selected commit, then delegates the unchanged arguments to orca worktree create.

exit codes: 0 created, 1 local and remote base differ, 2 usage error, 3 git or orca failed`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const args = process.argv.slice(2)
const valueOf = (flag) => {
  const index = args.indexOf(flag)
  if (index === -1) return null
  const value = args[index + 1]
  return value === undefined || value.startsWith("-") ? undefined : value
}
const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}
const knownFlags = new Set(["--repo", "--name", "--base-branch", "--issue", "--no-parent", "--comment", "--json"])
const unknown = args.filter((value) => value.startsWith("-") && !knownFlags.has(value))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const repoArgument = valueOf("--repo")
const baseBranch = valueOf("--base-branch")
if (repoArgument === undefined || baseBranch === undefined) fail(2, `${USAGE}\n\nflags require values`)
if (!repoArgument?.startsWith("path:") || !baseBranch) fail(2, `${USAGE}\n\n--repo path:<path> and --base-branch are required`)

const repository = resolve(repoArgument.slice("path:".length))
const git = (gitArgs) => {
  const result = spawnSync(process.env.GIT_BIN || "git", ["-C", repository, ...gitArgs], { encoding: "utf8" })
  if (result.status !== 0) fail(3, `git ${gitArgs.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`)
  return result.stdout.trim()
}

git(["fetch", "origin", baseBranch])
let localCommit = git(["rev-parse", `refs/heads/${baseBranch}`])
const remoteCommit = git(["rev-parse", `refs/remotes/origin/${baseBranch}`])
if (localCommit !== remoteCommit) {
  const ancestor = spawnSync(process.env.GIT_BIN || "git", ["-C", repository, "merge-base", "--is-ancestor", localCommit, remoteCommit])
  if (ancestor.status !== 0) fail(1, `refusing non-fast-forward base ${baseBranch}: local ${localCommit}, origin ${remoteCommit}`)
  const currentBranch = git(["branch", "--show-current"])
  if (currentBranch === baseBranch) git(["merge", "--ff-only", `origin/${baseBranch}`])
  else git(["branch", "-f", baseBranch, `origin/${baseBranch}`])
  localCommit = git(["rev-parse", `refs/heads/${baseBranch}`])
}
if (localCommit !== remoteCommit) fail(1, `refusing stale base ${baseBranch}: local ${localCommit}, origin ${remoteCommit}`)
console.log(`WORKTREE_BASE ${baseBranch} ${remoteCommit}`)

const result = spawnSync(process.env.ORCA_BIN || "orca", ["worktree", "create", ...args], { encoding: "utf8" })
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
if (result.status !== 0) fail(3, `orca worktree create failed with exit ${result.status ?? "unknown"}`)
