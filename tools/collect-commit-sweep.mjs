#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const USAGE = `usage: collect-commit-sweep.mjs [--ui-root <path>] [--api-root <path>] [--count <N> | --since <when>] [--scope <both|ui|api>]

  Collect the deterministic git evidence for the report-only commit sweep as JSON.
  --help, -h  print this usage and exit 0`
const argv = process.argv.slice(2)
if (argv.includes("--help") || argv.includes("-h")) { console.log(USAGE); process.exit(0) }
const value = (flag) => { const index = argv.indexOf(flag); return index === -1 ? null : argv[index + 1] }
const known = new Set(["--ui-root", "--api-root", "--count", "--since", "--scope"])
for (let index = 0; index < argv.length; index += 2) if (!known.has(argv[index]) || !argv[index + 1]) { console.error(`collect-commit-sweep: invalid arguments\n\n${USAGE}`); process.exit(2) }
const count = value("--count")
const since = value("--since")
if ((count && since) || (count && !/^[1-9]\d*$/.test(count))) { console.error("collect-commit-sweep: choose a positive --count or --since"); process.exit(2) }
const scope = value("--scope") ?? "both"
if (!["both", "ui", "api"].includes(scope)) { console.error("collect-commit-sweep: --scope must be both, ui, or api"); process.exit(2) }
const git = (root, args) => {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  if (result.error || result.status !== 0) throw new Error(`git -C ${root} ${args.join(" ")} failed: ${(result.stderr || result.error?.message || "unknown error").trim()}`)
  return result.stdout
}
const collect = (name, root) => {
  const logArgs = since ? ["log", `--since=${since}`, "--format=%H%x1f%ad%x1f%s", "--date=short"] : ["log", "-n", count ?? "10", "--format=%H%x1f%ad%x1f%s", "--date=short"]
  const commits = git(root, logArgs).trim().split(/\r?\n/).filter(Boolean).map((line) => { const [sha, date, subject] = line.split("\x1f"); return { sha, date, subject, patch: git(root, ["show", "--format=fuller", sha]) } })
  return { name, root, commits }
}
try {
  const uiRoot = resolve(value("--ui-root") ?? process.cwd())
  const apiRoot = resolve(value("--api-root") ?? `${uiRoot}/orbit-api`)
  const repos = []
  if (scope !== "api") repos.push(collect("orbit-ui-mobile", uiRoot))
  if (scope !== "ui") repos.push(collect("orbit-api", apiRoot))
  console.log(JSON.stringify({ mode: since ? "since" : "count", since: since ?? null, count: count ? Number(count) : 10, scope, repos }))
} catch (error) { console.error(`collect-commit-sweep: ${error.message}`); process.exit(1) }
