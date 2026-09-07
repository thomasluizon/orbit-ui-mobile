import { spawn, spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { setTimeout } from "node:timers/promises"

import { T, check, root, stage, toolPath } from "./_harness.mjs"

const TOOL = "create-worktree.mjs"

const git = (cwd, args) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" })

export const cases = async () => {
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
  await killedHolder(fixtureRoot, repository)
  await killedHolder(fixtureRoot, repository, true)
  await concurrentCreation(fixtureRoot, source, repository)
}

const waitFor = async (paths) => {
  const deadline = Date.now() + 20000
  while (!paths.every((path) => existsSync(path))) {
    if (Date.now() > deadline) throw new Error(`markers not reached: ${paths.join(", ")}`)
    await setTimeout(20)
  }
}

const launch = (repository, name, shim, timeout = 30000) => {
  const child = spawn(process.execPath, [toolPath(TOOL), "--repo", `path:${repository}`, "--name", name, "--base-branch", "main", "--no-parent", "--json"], {
    env: { ...process.env, ORCA_BIN: process.execPath, NODE_OPTIONS: `--require "${shim.replaceAll("\\", "/")}"` },
    timeout,
  })
  const result = new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (status) => resolve({ status, stdout, stderr }))
  })
  return { child, result }
}

const killedHolder = async (fixtureRoot, repository, recycled = false) => {
  const held = join(fixtureRoot, `holder-entered-fetch-${recycled}`)
  const shim = stage("create-worktree/bin/killed.cjs", `
const { basename } = require("node:path")
const { writeFileSync } = require("node:fs")
const childProcess = require("node:child_process")
if (basename(process.argv[1]) === "worktree") process.exit(0)
const realSpawnSync = childProcess.spawnSync
childProcess.spawnSync = (command, args, options) => {
  if (command === "git" && args[2] === "fetch" && process.argv.includes("killed-holder")) {
    writeFileSync(${JSON.stringify(held)}, "held")
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
  }
  return realSpawnSync(command, args, options)
}
require("node:module").syncBuiltinESMExports()
`)
  const holder = launch(repository, "killed-holder", shim)
  try {
    await waitFor([held])
  } finally {
    holder.child.kill("SIGKILL")
    await holder.result
  }
  if (recycled) {
    const lockPath = join(repository, ".git", "create-worktree.lock")
    const ownerPath = join(lockPath, readdirSync(lockPath)[0])
    const owner = JSON.parse(readFileSync(ownerPath, "utf8"))
    // Keep the identity emitted by the actual holder but point its recycled pid at a live process.
    writeFileSync(ownerPath, JSON.stringify({ ...owner, pid: process.pid }))
  }
  const startedAt = Date.now()
  const result = await launch(repository, "after-kill", shim, recycled ? 10000 : 135000).result
  const elapsed = Date.now() - startedAt
  T(`${TOOL}: ${recycled ? "reclaims a recycled pid with a different process start identity" : "reclaims a killed holder without waiting for the lock timeout"}`,
    result.status === 0 && elapsed < 10000, JSON.stringify({ ...result, elapsed }))
}

const concurrentCreation = async (fixtureRoot, source, repository) => {
  git(source, ["commit", "-q", "--allow-empty", "-m", "parallel remote advance"])
  git(source, ["push", "-q", "origin", "main"])
  const remoteCommit = git(source, ["rev-parse", "HEAD"]).stdout.trim()
  const fetchLog = stage("create-worktree/fetches.txt", "")
  const shim = stage("create-worktree/bin/concurrent.cjs", `
const { basename, join } = require("node:path")
const { appendFileSync, existsSync, writeFileSync } = require("node:fs")
const childProcess = require("node:child_process")
const realSpawnSync = childProcess.spawnSync
let entered = false
if (basename(process.argv[1]) === "worktree" && process.argv[2] === "create") {
  const args = process.argv.slice(3)
  const repository = args[args.indexOf("--repo") + 1].slice("path:".length)
  const name = args[args.indexOf("--name") + 1]
  const result = realSpawnSync("git", ["-C", repository, "worktree", "add", "-q", "--detach", join(${JSON.stringify(fixtureRoot)}, name), "main"], { stdio: "inherit" })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}
childProcess.spawnSync = (command, args, options) => {
  if (command === "git" && !entered) {
    entered = true
    const name = process.argv[process.argv.indexOf("--name") + 1]
    writeFileSync(join(${JSON.stringify(fixtureRoot)}, name + ".entered"), "entered")
    const deadline = Date.now() + 20000
    while (!existsSync(join(${JSON.stringify(fixtureRoot)}, "release"))) {
      if (Date.now() > deadline) throw new Error("entry barrier was not released")
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
  }
  if (command === "git" && args[2] === "fetch") {
    appendFileSync(${JSON.stringify(fetchLog)}, "fetch\\n")
  }
  return realSpawnSync(command, args, options)
}
require("node:module").syncBuiltinESMExports()
`)
  const names = ["parallel-first", "parallel-second"]
  const children = names.map((name) => launch(repository, name, shim))
  let results
  try {
    await waitFor(names.map((name) => join(fixtureRoot, name + ".entered")))
    writeFileSync(join(fixtureRoot, "release"), "release")
    results = await Promise.all(children.map(({ result }) => result))
  } finally {
    for (const { child } of children) child.kill("SIGKILL")
    await Promise.all(children.map(({ result }) => result))
  }
  const commits = names.map((name) => git(join(fixtureRoot, name), ["rev-parse", "HEAD"]).stdout.trim())
  const fetches = readFileSync(fetchLog, "utf8").trim().split("\n").length
  T(`${TOOL}: concurrent creations share one refresh and both start at the remote commit`,
    fetches === 1 && results.every((result) => result.status === 0 && result.stdout.includes(`WORKTREE_BASE main ${remoteCommit}`)) && commits.every((commit) => commit === remoteCommit),
    JSON.stringify({ fetches, results, commits, remoteCommit }))
}
