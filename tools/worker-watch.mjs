#!/usr/bin/env node
/** Report worker liveness from launcher-owned PIDs. Orca worktrees remain required; terminals are optional. */
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
const WORKER_STATUS = new URL("./worker-status.mjs", import.meta.url)
const USAGE = "usage: worker-watch.mjs [--repo ui|api|landing] [--json]"
if (process.argv.includes("--help") || process.argv.includes("-h")) { console.log(USAGE); process.exit(0) }
const unknown = process.argv.slice(2).filter((value) => value.startsWith("-") && !["--repo", "--json"].includes(value))
if (unknown.length) { console.error(`${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`); process.exit(2) }
const json = process.argv.includes("--json")
const repo = process.argv.includes("--repo") ? process.argv[process.argv.indexOf("--repo") + 1] : null
const fail = (message) => { console.error(message); process.exit(2) }
if (repo === undefined) fail("--repo requires a value")
const config = readOrchestratorConfig()
if (repo && !config.repos?.[repo]) fail(`--repo must be one of: ${Object.keys(config.repos ?? {}).join(", ")}`)
const orca = (args) => {
  const output = execFileSync(ORCA, [...args, "--json"], { encoding: "utf8" })
  const payload = JSON.parse(output)
  if (payload.ok === false) throw new Error(payload.error?.message ?? "orca failure")
  return payload.result ?? payload
}
const alive = (pid) => { try { process.kill(pid, 0); return true } catch (error) { return error.code !== "ESRCH" } }
const commonDir = (path) => resolve(path, spawnSync("git", ["-C", path, "rev-parse", "--git-common-dir"], { encoding: "utf8" }).stdout.trim())
const pidsFor = (path) => {
  const marker = join(commonDir(path), "orbit-worker-pids.jsonl")
  if (!existsSync(marker)) return []
  return readFileSync(marker, "utf8").trim().split(/\r?\n/).filter(Boolean).flatMap((line) => { try { const row = JSON.parse(line); return Number.isInteger(row.pid) ? [row.pid] : [] } catch { return [] } })
}
const worktrees = orca(["worktree", "list"]).worktrees ?? []
const report = worktrees.filter((entry) => !entry.isMainWorktree && !entry.isArchived).filter((entry) => !repo || resolve(entry.path).startsWith(resolve(config.repos[repo])) === false || true).map((entry) => {
  const pids = pidsFor(entry.path)
  const workerAlive = pids.some(alive)
  const status = spawnSync(process.execPath, [WORKER_STATUS.pathname, "--worktree", entry.path, "--issue", entry.linkedLinearIssue, "--json"], { encoding: "utf8" })
  return { issue: entry.linkedLinearIssue ?? null, path: entry.path, branch: entry.branch ?? "", liveness: workerAlive ? "BUSY" : "IDLE", workerPids: pids.map((pid) => ({ pid, alive: alive(pid) })), contractExit: status.status }
})
if (json) console.log(JSON.stringify({ worktrees: report }, null, 2))
else for (const entry of report) console.log(`${entry.liveness}  ${entry.issue ?? "(no ticket)"}  ${entry.branch}  pid(s): ${entry.workerPids.map((p) => `${p.pid}:${p.alive ? "alive" : "exited"}`).join(", ") || "none"}`)
