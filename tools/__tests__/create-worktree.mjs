import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync } from "node:fs"
import { join } from "node:path"

import { T, check, root, stage } from "./_harness.mjs"

const TOOL = "create-worktree.mjs"

const git = (cwd, args) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" })

export const cases = () => {
  const fixtureRoot = join(root, "create-worktree")
  const remote = join(fixtureRoot, "remote.git")
  const source = join(fixtureRoot, "source")
  const repository = join(fixtureRoot, "repository")
  const created = join(fixtureRoot, "created")
  mkdirSync(source, { recursive: true })
  spawnSync("git", ["init", "-q", "--bare", "--initial-branch=main", remote], { encoding: "utf8" })
  git(source, ["init", "-q", "--initial-branch=main"])
  git(source, ["config", "user.email", "gate@orbit.test"])
  git(source, ["config", "user.name", "Orbit Gate"])
  git(source, ["commit", "-q", "--allow-empty", "-m", "initial"])
  git(source, ["remote", "add", "origin", remote])
  git(source, ["push", "-q", "-u", "origin", "main"])
  git(fixtureRoot, ["clone", "-q", remote, repository])
  git(source, ["commit", "-q", "--allow-empty", "-m", "remote advance"])
  git(source, ["push", "-q", "origin", "main"])
  const remoteCommit = git(source, ["rev-parse", "HEAD"]).stdout.trim()

  let env
  if (process.platform === "win32") {
    const shim = stage("create-worktree/bin/orca.cjs", `
const { basename } = require("node:path")
if (basename(process.argv[1]) === "worktree" && process.argv[2] === "create") {
  const { spawnSync } = require("node:child_process")
  const args = process.argv.slice(3)
  const repository = args[args.indexOf("--repo") + 1].slice("path:".length)
  const result = spawnSync("git", ["-C", repository, "worktree", "add", "-q", "--detach", ${JSON.stringify(created)}, "main"], { stdio: "inherit" })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}
`)
    env = { ORCA_BIN: process.execPath, NODE_OPTIONS: `--require "${shim.replaceAll("\\", "/")}"` }
  } else {
    const orca = stage("create-worktree/bin/orca", `#!/bin/sh\nrepo=\"\"\nwhile [ \"$#\" -gt 0 ]; do\n  if [ \"$1\" = \"--repo\" ]; then repo=\${2#path:}; shift 2; continue; fi\n  shift\ndone\ngit -C \"$repo\" worktree add -q --detach \"${created}\" main\n`)
    chmodSync(orca, 0o755)
    env = { ORCA_BIN: orca }
  }
  const result = check(
    TOOL,
    `${TOOL}: fetches a stale base before creation and prints the chosen remote commit`,
    ["--repo", `path:${repository}`, "--name", "ticket-447", "--base-branch", "main", "--issue", "447", "--no-parent", "--comment", "test", "--json"],
    { status: 0, stdout: new RegExp(`WORKTREE_BASE main ${remoteCommit}`) },
    { env },
  )
  const createdCommit = git(created, ["rev-parse", "HEAD"]).stdout.trim()
  T(`${TOOL}: the created worktree starts at origin/main`, createdCommit === remoteCommit, `created ${createdCommit}, remote ${remoteCommit}\n${result.stderr}`)
}
