#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { createRequire } from "node:module"

import { parseWorktreeList } from "./lib/git-worktrees.mjs"

const DEFAULT_PORT = 3000
const PORT_START = 3100
const PORT_COUNT = 1000
const MARKER_RELATIVE_PATH = join(".orca", "web-port")
const USAGE = `usage: orca-web-port.mjs [--setup | --next-dev]

  Reports the assigned web port for this checkout.
  --setup                    assign and persist this linked worktree's port
  --next-dev                 start Next dev on this checkout's assigned port
  --help, -h                 print this usage and exit 0

exit codes: 0 success, 1 no assignment or collision, 2 invalid usage, 3 setup error`

const fail = (message, code = 1) => {
  console.error(`orca-web-port: ${message}`)
  process.exit(code)
}

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const options = { setup: false, nextDev: false }
for (let index = 0; index < args.length; index++) {
  const arg = args[index]
  if (arg === "--setup") options.setup = true
  else if (arg === "--next-dev") options.nextDev = true
  else fail(`unknown argument ${arg}\n\n${USAGE}`, 2)
}

if (options.setup && options.nextDev) fail("--setup and --next-dev are alternatives", 2)

const git = (argumentsList, cwd) => {
  const result = spawnSync("git", argumentsList, { cwd, encoding: "utf8" })
  if (result.status !== 0) return null
  return result.stdout.trim()
}

const findRepository = (cwd) => {
  const root = git(["rev-parse", "--show-toplevel"], cwd)
  if (!root) fail("must run inside a git checkout", 3)
  const gitDir = git(["rev-parse", "--absolute-git-dir"], cwd)
  if (!gitDir) fail("could not resolve this checkout's git directory", 3)
  return { root: resolve(root), linkedWorktree: basename(gitDir) !== ".git" }
}

const derivePort = (name) => {
  let hash = 0x811c9dc5
  for (const character of name) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return PORT_START + ((hash >>> 0) % PORT_COUNT)
}

const markerPath = (root) => join(root, MARKER_RELATIVE_PATH)

const readAssignedPort = (root) => {
  try {
    const value = readFileSync(markerPath(root), "utf8").trim()
    const port = Number(value)
    if (!Number.isInteger(port) || port < PORT_START || port >= PORT_START + PORT_COUNT) return null
    return port
  } catch {
    return null
  }
}

const linkedWorktrees = (root) => {
  const output = git(["worktree", "list", "--porcelain"], root)
  if (!output) fail("could not list linked worktrees", 3)
  return parseWorktreeList(output).map((worktree) => resolve(worktree.path))
}

const setup = (repository) => {
  if (!repository.linkedWorktree) fail("the repository root keeps the default web port and needs no assignment")
  const name = basename(repository.root)
  const port = derivePort(name)
  for (const peer of linkedWorktrees(repository.root)) {
    if (peer === repository.root) continue
    if (basename(peer) === basename(repository.root) || derivePort(basename(peer)) === port) {
      fail(`port ${port} collides with linked worktree ${basename(peer)}; rename one worktree and run setup again`)
    }
  }
  mkdirSync(dirname(markerPath(repository.root)), { recursive: true })
  writeFileSync(markerPath(repository.root), `${port}\n`)
  console.log(port)
}

const report = (repository) => {
  if (!repository.linkedWorktree) {
    console.log(DEFAULT_PORT)
    return DEFAULT_PORT
  }
  const port = readAssignedPort(repository.root)
  if (!port) fail("this linked worktree has no assigned port; run node tools/orca-web-port.mjs --setup")
  console.log(port)
  return port
}

const nextDev = (repository) => {
  const port = report(repository)
  const webDirectory = join(repository.root, "apps", "web")
  const next = createRequire(join(webDirectory, "package.json")).resolve("next/dist/bin/next")
  const child = spawn(process.execPath, [next, "dev", "--turbopack", "--port", String(port)], {
    cwd: webDirectory,
    stdio: "inherit",
  })
  child.on("error", (error) => fail(`could not start Next: ${error.message}`, 3))
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
}

const repository = findRepository(process.cwd())
if (options.setup) setup(repository)
else if (options.nextDev) nextDev(repository)
else report(repository)
