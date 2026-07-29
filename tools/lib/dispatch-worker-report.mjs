#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const fail = (message) => {
  process.stderr.write(`Codex worker report dispatcher: ${message}\n`)
  process.exit(1)
}

const normalizedWorktree = (path) => {
  const normalized = resolve(path).replaceAll("\\", "/").replace(/\/+$/, "")
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

const rawInput = readFileSync(0, "utf8")
let hookInput
try {
  hookInput = JSON.parse(rawInput)
} catch {
  fail("Stop payload was not valid JSON")
}
if (typeof hookInput.cwd !== "string" || hookInput.cwd.length === 0) {
  fail("Stop payload carried no cwd")
}

const statePath = resolve(dirname(fileURLToPath(import.meta.url)), "registry.json")
let state
try {
  state = JSON.parse(readFileSync(statePath, "utf8"))
} catch (error) {
  fail(`could not read ${statePath}: ${error.message}`)
}
const registration = state?.registrations?.[normalizedWorktree(hookInput.cwd)]
if (!registration) {
  process.exit(0)
}

const result = spawnSync(
  process.execPath,
  [
    registration.hookPath,
    "--reports-file",
    registration.reportsFile,
    "--ticket",
    registration.ticket,
  ],
  {
    encoding: "utf8",
    input: rawInput,
    stdio: ["pipe", "inherit", "inherit"],
  },
)
if (result.error) fail(`report hook could not start: ${result.error.message}`)
process.exit(result.status ?? 1)
