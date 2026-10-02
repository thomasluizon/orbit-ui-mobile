#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { isAbsolute } from "node:path"

const USAGE = `usage: start-relay-successor.mjs --launch <base64-json>

  Starts the relay nominee with model, permissionMode, sessionId and repoRoot
  from a JSON payload encoded as base64. Every value is passed as process data.
  Removes CLAUDE_CONFIG_DIR, GH_TOKEN and ORBIT_LAUNCH_WORKER from the child.
  --help, -h  print usage and exit 0

exit codes: the Claude process exit code, 1 launch failure, 2 usage error`

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`${USAGE}\n`)
} else {
  let launch
  try {
    if (args.length !== 2 || args[0] !== "--launch") throw new Error("expected --launch payload")
    launch = JSON.parse(Buffer.from(args[1], "base64").toString("utf8"))
    if (typeof launch?.model !== "string" || !launch.model || typeof launch.sessionId !== "string" || !launch.sessionId ||
      typeof launch.repoRoot !== "string" || !isAbsolute(launch.repoRoot) ||
      !["default", "plan", "acceptEdits", "auto", "dontAsk", "bypassPermissions"].includes(launch.permissionMode)) throw new Error("invalid relay launch payload")
  } catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}\n`)
    process.exitCode = 2
  }
  if (launch && !process.exitCode) {
    const environment = { ...process.env }
    for (const key of ["CLAUDE_CONFIG_DIR", "GH_TOKEN", "ORBIT_LAUNCH_WORKER"]) delete environment[key]
    const result = spawnSync("claude", ["--model", launch.model, "--permission-mode", launch.permissionMode === "default" ? "manual" : launch.permissionMode,
      "--session-id", launch.sessionId], { cwd: launch.repoRoot, env: environment, stdio: "inherit" })
    if (result.error) process.stderr.write(`relay successor launch failed: ${result.error.message}\n`)
    process.exitCode = result.status ?? 1
  }
}
