import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { T, root, stage, toolPath } from "./_harness.mjs"

const task = (id, status, filesChanged) => ({
  id,
  url: `https://chatgpt.com/codex/tasks/${id}`,
  title: "measured task",
  status,
  updated_at: "2026-08-31T17:09:28.437758900Z",
  environment_id: null,
  environment_label: "thomasluizon/orbit-ui-mobile",
  summary: { files_changed: filesChanged, lines_added: filesChanged, lines_removed: 0 },
  is_review: false,
  attempt_total: 1,
})

export const fakeCodex = (label) => {
  const directory = join(root, "cloud-codex", label)
  mkdirSync(directory, { recursive: true })
  const script = join(directory, "fake-codex.js")
  writeFileSync(
    script,
    `#!/usr/bin/env node
import { appendFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
const args = process.argv.slice(2)
if (process.env.ORBIT_FAKE_CODEX_LOG) appendFileSync(process.env.ORBIT_FAKE_CODEX_LOG, JSON.stringify(args) + "\\n")
if (args[0] === "cloud" && args[1] === "exec") process.stdout.write(process.env.ORBIT_FAKE_EXEC_URL || "")
else if (args[0] === "cloud" && args[1] === "list") process.stdout.write(process.env.ORBIT_FAKE_LIST || '{"tasks":[],"cursor":null}')
else if (args[0] === "cloud" && args[1] === "apply") {
  const path = process.env.ORBIT_FAKE_APPLY_PATH || "cloud-landed.txt"
  writeFileSync(path, "landed from cloud\\n")
  const added = spawnSync("git", ["add", "--", path], { encoding: "utf8" })
  process.exit(added.status || 0)
} else process.exit(7)
`,
  )
  if (process.platform === "win32") {
    const shim = join(directory, "codex.cmd")
    writeFileSync(shim, `@echo off\r\n"%_prog%"  "%dp0%\\fake-codex.js" %*\r\n`)
    return { command: shim, script }
  }
  chmodSync(script, 0o755)
  return { command: script, script }
}

export const cloudConfig = (command, overrides = {}) => {
  const real = structuredClone(overrides.real)
  real.workers.codex.command = command
  real.cloud = { environmentId: "env-measured" }
  real.caps.cloudParallelTasks = overrides.cloudParallelTasks ?? 4
  real.timeouts.cloudCeilingMinutes = overrides.cloudCeilingMinutes ?? 45
  return real
}

export const taskPage = (tasks) => JSON.stringify({ tasks, cursor: null }, null, 2)
export { task }

export const cases = async () => {
  const cloud = await import(pathToFileURL(toolPath("lib/cloud-worker.mjs")).href)
  const order = "Implement the ticket.\n"
  const completed = cloud.cloudOrder(order)
  T(
    "cloud-worker.mjs: every submitted order ends with the cloud commit and delivery contract",
    completed.endsWith(`${cloud.CLOUD_FINISHING_CONTRACT}\n`) && completed.includes("Without a commit there is no diff"),
    completed,
  )
  T(
    "cloud-worker.mjs: an existing finishing contract is not duplicated",
    cloud.cloudOrder(completed).split("## Cloud finishing contract").length === 2,
    cloud.cloudOrder(completed),
  )

  const parsed = cloud.parseTaskList(taskPage([task("task_e_a1", "pending", 0)]))
  T(
    "cloud-worker.mjs: pretty-printed list JSON is parsed as one document",
    parsed.tasks.length === 1 && parsed.tasks[0].environment_id === null && parsed.cursor === null,
    JSON.stringify(parsed),
  )

  const receipt = {
    taskId: "task_e_a1",
    deadline: "2026-08-31T18:00:00.000Z",
  }
  const abandoned = cloud.refreshReceipt(receipt, task("task_e_a1", "pending", 0), new Date("2026-08-31T18:00:01.000Z"))
  T(
    "cloud-worker.mjs: a pending task past its one wall clock deadline becomes locally abandoned",
    abandoned.abandoned?.lastObservedStatus === "pending" && abandoned.terminal === undefined,
    JSON.stringify(abandoned),
  )
  const late = cloud.refreshReceipt(abandoned, task("task_e_a1", "ready", 2), new Date("2026-08-31T18:05:00.000Z"))
  T(
    "cloud-worker.mjs: a late ready result remains abandoned and is recorded for quarantine",
    late.abandoned !== undefined && late.lateTerminal?.status === "ready" && late.lateTerminal.summary.files_changed === 2,
    JSON.stringify(late),
  )
  const fleet = cloud.refreshReceipts(
    [receipt, { ...receipt, taskId: "task_e_b2", deadline: "2026-08-31T17:00:00.000Z" }],
    [task("task_e_a1", "pending", 0), task("task_e_b2", "pending", 0)],
    new Date("2026-08-31T17:30:00.000Z"),
  )
  T(
    "cloud-worker.mjs: in-flight is derived from non-terminal, non-abandoned receipts",
    fleet.inFlight.map((entry) => entry.taskId).join(",") === "task_e_a1",
    JSON.stringify(fleet),
  )

  const badShim = stage("cloud-worker/bad-codex.cmd", "@echo off\r\nexit /b 0\r\n")
  let message = ""
  try {
    cloud.resolveCodexCommand(badShim)
  } catch (error) {
    message = error.message
  }
  T(
    "cloud-worker.mjs: an unrecognised Windows shim shape fails closed",
    /no "%dp0%\.\.\.js" script line was found/.test(message),
    message,
  )
}
