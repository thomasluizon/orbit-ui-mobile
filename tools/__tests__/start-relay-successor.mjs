import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { T, root, stage, toolPath } from "./_harness.mjs"

export const cases = async () => {
  const preload = stage("relay-spawn-probe.mjs", `import childProcess from "node:child_process"
import { syncBuiltinESMExports } from "node:module"
childProcess.spawnSync = (binary, args, options) => {
  process.stdout.write(JSON.stringify({ binary, args, cwd: options.cwd, stdio: options.stdio,
    forbidden: ["CLAUDE_CONFIG_DIR", "GH_TOKEN", "ORBIT_LAUNCH_WORKER"].filter((key) => Object.hasOwn(options.env, key)), kept: options.env.RELAY_TEST_KEPT }))
  return { status: 7 }
}
syncBuiltinESMExports()
`)
  const launch = { model: "literal ' $() ` ; model", permissionMode: "default", sessionId: "literal ' session", repoRoot: join(root, "literal ' $() ` checkout") }
  const payload = Buffer.from(JSON.stringify(launch)).toString("base64")
  const result = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, toolPath("start-relay-successor.mjs"), "--launch", payload], {
    encoding: "utf8", env: { ...process.env, CLAUDE_CONFIG_DIR: "test-config", GH_TOKEN: "test-token", ORBIT_LAUNCH_WORKER: "test-worker", RELAY_TEST_KEPT: "kept" } })
  const observed = JSON.parse(result.stdout)
  T("start-relay-successor: values containing shell syntax remain literal argv and cwd", observed.binary === "claude" && JSON.stringify(observed.args) === JSON.stringify(["--model", launch.model, "--permission-mode", "manual", "--session-id", launch.sessionId]) && observed.cwd === launch.repoRoot)
  T("start-relay-successor: actual spawn scrubs forbidden environment and inherits terminal", observed.forbidden.length === 0 && observed.kept === "kept" && observed.stdio === "inherit")
  T("start-relay-successor: child exit code is propagated", result.status === 7)
  for (const invalid of [null, {}, { ...launch, permissionMode: "unknown" }, { ...launch, repoRoot: "relative" }]) {
    const refused = spawnSync(process.execPath, [toolPath("start-relay-successor.mjs"), "--launch", Buffer.from(JSON.stringify(invalid)).toString("base64")], { encoding: "utf8" })
    T("start-relay-successor: invalid payload is rejected before launch", refused.status === 2 && refused.stderr.includes("invalid relay launch payload"))
  }
}
