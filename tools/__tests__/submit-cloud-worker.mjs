import { spawn } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  T,
  check,
  realOrchestratorConfig,
  run,
  stage,
  stageRepo,
  stageWithConfig,
  toolPath,
} from "./_harness.mjs"
import { cloudConfig, fakeCodex, task, taskPage } from "./cloud-worker.mjs"

const TOOL = "submit-cloud-worker.mjs"

const fixture = (label) => {
  const codex = fakeCodex(`submit-${label}`)
  const config = cloudConfig(codex.command, { real: realOrchestratorConfig(), cloudCeilingMinutes: 45 })
  const staged = stageWithConfig(`submit-cloud-${label}`, TOOL, config)
  cpSync(toolPath("check-dashes.mjs"), join(staged.base, "tools", "check-dashes.mjs"))
  const repo = stageRepo(`submit-cloud-${label}`)
  const order = stage(`submit-cloud/${label}-order.md`, "Implement the measured cloud path.\n")
  const log = stage(`submit-cloud/${label}-codex.jsonl`, "")
  return { ...staged, repo, order, log, codex, config }
}

const argvOf = (entry) => [
  "--issue", "#398",
  "--env", entry.config.cloud.environmentId,
  "--branch", "main",
  "--order", entry.order,
  "--worktree", entry.repo.path,
]

const runConcurrent = (entry, env) => new Promise((resolveResult) => {
  const child = spawn(process.execPath, [entry.path, ...argvOf(entry)], {
    cwd: entry.repo.path,
    env: { ...process.env, ...env },
    windowsHide: true,
  })
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk) => { stdout += chunk.toString() })
  child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
  child.once("close", (status) => resolveResult({ status, stdout, stderr }))
})

export const cases = async () => {
  const entry = fixture("success")
  const env = {
    ORBIT_FAKE_CODEX_LOG: entry.log,
    ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_a398",
  }
  const submitted = check(TOOL, "submits one task and prints one receipt object", argvOf(entry), { status: 0, stdout: /"taskId":"task_e_a398"/ }, { path: entry.path, env })
  const receipt = JSON.parse(submitted.stdout)
  const invocations = readFileSync(entry.log, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
  const exec = invocations.find((args) => args[0] === "cloud" && args[1] === "exec")
  T(
    `${TOOL}: the order is one argv element, keeps its text, and ends with the finishing contract`,
    exec?.at(-1).startsWith("Implement the measured cloud path.") && exec.at(-1).endsWith("Delivery happens outside the container.\n"),
    JSON.stringify(exec),
  )
  T(
    `${TOOL}: receipt captures the pushed base, two order hashes, deadline, worktree, and stable mirror`,
    /^[0-9a-f]{40}$/.test(receipt.baseSha) &&
      /^[0-9a-f]{64}$/.test(receipt.orderSha256) &&
      /^[0-9a-f]{64}$/.test(receipt.submittedOrderSha256) &&
      Date.parse(receipt.deadline) - Date.parse(receipt.submittedAt) === 45 * 60 * 1000 &&
      receipt.worktree === entry.repo.path &&
      existsSync(receipt.receiptPath) &&
      existsSync(receipt.mirrorPath),
    JSON.stringify(receipt),
  )

  for (const [label, dash] of [["en", String.fromCharCode(0x2013)], ["em", String.fromCharCode(0x2014)]]) {
    const refused = fixture(`dash-${label}`)
    writeFileSync(refused.order, `range 1${dash}10\n`)
    const result = run(TOOL, argvOf(refused), {
      path: refused.path,
      env: { ORBIT_FAKE_CODEX_LOG: refused.log, ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_dead" },
    })
    T(
      `${TOOL}: refuses an ${label} dash before any cloud command`,
      result.status === 2 && /order file contains a banned/.test(result.stderr) && readFileSync(refused.log, "utf8") === "",
      `exit ${result.status}: ${result.stderr}\nlog: ${readFileSync(refused.log, "utf8")}`,
    )
  }

  const capped = fixture("capacity")
  const receipts = join(capped.repo.path, ".git", "orbit-cloud", "receipts")
  mkdirSync(receipts, { recursive: true })
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const fleetTasks = []
  for (const suffix of ["a1", "b2", "c3", "d4"]) {
    const id = `task_e_${suffix}`
    const body = {
      taskId: id,
      environmentId: capped.config.cloud.environmentId,
      deadline: future,
      worktree: capped.repo.path,
      baseSha: "0".repeat(40),
    }
    writeFileSync(stage(`submit-cloud/receipt-${suffix}.json`, JSON.stringify(body)), JSON.stringify(body))
    const target = join(receipts, `${id}.json`)
    cpSync(stage(`submit-cloud/receipt-${suffix}.json`, JSON.stringify(body)), target)
    fleetTasks.push(task(id, "pending", 0))
  }
  const capacity = run(TOOL, argvOf(capped), {
    path: capped.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: capped.log,
      ORBIT_FAKE_LIST: taskPage(fleetTasks),
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_extra",
    },
  })
  const capacityInvocations = readFileSync(capped.log, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
  T(
    `${TOOL}: derives the fleet from receipts and refuses a fifth live task without exec`,
    capacity.status === 3 && /4\/4 tasks are in flight/.test(capacity.stderr) && !capacityInvocations.some((args) => args[1] === "exec"),
    `exit ${capacity.status}: ${capacity.stderr}\n${JSON.stringify(capacityInvocations)}`,
  )

  const execTimeout = fixture("exec-timeout")
  execTimeout.config.timeouts.cloudCommandMinutes = 0.005
  writeFileSync(execTimeout.configPath, `${JSON.stringify(execTimeout.config, null, 2)}\n`)
  const execTimeoutResult = run(TOOL, argvOf(execTimeout), {
    path: execTimeout.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: execTimeout.log,
      ORBIT_FAKE_HANG: "exec",
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_a399",
    },
  })
  T(
    `${TOOL}: a submission timeout is a distinct recoverable failure`,
    execTimeoutResult.status === 4 && /codex cloud exec timed out/.test(execTimeoutResult.stderr),
    `exit ${execTimeoutResult.status}: ${execTimeoutResult.stdout || execTimeoutResult.stderr}`,
  )

  const listTimeout = fixture("list-timeout")
  listTimeout.config.timeouts.cloudCommandMinutes = 0.005
  writeFileSync(listTimeout.configPath, `${JSON.stringify(listTimeout.config, null, 2)}\n`)
  const listTimeoutReceipts = join(listTimeout.repo.path, ".git", "orbit-cloud", "receipts")
  mkdirSync(listTimeoutReceipts, { recursive: true })
  writeFileSync(join(listTimeoutReceipts, "task_e_a1.json"), JSON.stringify({
    taskId: "task_e_a1",
    environmentId: listTimeout.config.cloud.environmentId,
    deadline: future,
    worktree: listTimeout.repo.path,
    baseSha: "0".repeat(40),
  }))
  const listTimeoutResult = run(TOOL, argvOf(listTimeout), {
    path: listTimeout.path,
    env: { ORBIT_FAKE_CODEX_LOG: listTimeout.log, ORBIT_FAKE_HANG: "list" },
  })
  T(
    `${TOOL}: a capacity refresh timeout is a distinct recoverable failure`,
    listTimeoutResult.status === 4 && /codex cloud list timed out/.test(listTimeoutResult.stderr),
    `exit ${listTimeoutResult.status}: ${listTimeoutResult.stdout || listTimeoutResult.stderr}`,
  )

  const concurrent = fixture("concurrent")
  const concurrentReceipts = join(concurrent.repo.path, ".git", "orbit-cloud", "receipts")
  mkdirSync(concurrentReceipts, { recursive: true })
  const concurrentTasks = []
  for (const suffix of ["a1", "b2", "c3"]) {
    const id = `task_e_${suffix}`
    writeFileSync(join(concurrentReceipts, `${id}.json`), JSON.stringify({
      taskId: id,
      environmentId: concurrent.config.cloud.environmentId,
      deadline: future,
      worktree: concurrent.repo.path,
      baseSha: "0".repeat(40),
    }))
    concurrentTasks.push(task(id, "pending", 0))
  }
  const concurrentEnv = {
    ORBIT_FAKE_CODEX_LOG: concurrent.log,
    ORBIT_FAKE_LIST: taskPage(concurrentTasks),
    ORBIT_FAKE_EXEC_DELAY_MS: "1000",
    ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_d4",
  }
  const concurrentResults = await Promise.all([
    runConcurrent(concurrent, concurrentEnv),
    runConcurrent(concurrent, concurrentEnv),
  ])
  const concurrentInvocations = readFileSync(concurrent.log, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
  const concurrentExecs = concurrentInvocations.filter((args) => args[0] === "cloud" && args[1] === "exec")
  T(
    `${TOOL}: concurrent submitters cannot collectively exceed the fleet cap`,
    concurrentResults.some((result) => result.status === 0) &&
      concurrentResults.every((result) => [0, 2, 3].includes(result.status)) &&
      concurrentExecs.length === 1,
    `${JSON.stringify(concurrentResults)}\n${JSON.stringify(concurrentInvocations)}`,
  )

  const staleOwner = fixture("stale-owner")
  const staleLock = join(staleOwner.repo.path, ".git", "orbit-cloud", "submit.lock")
  mkdirSync(staleLock, { recursive: true })
  writeFileSync(join(staleLock, "owner.json"), JSON.stringify({ pid: 2147483647 }))
  const staleOwnerResult = run(TOOL, argvOf(staleOwner), {
    path: staleOwner.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: staleOwner.log,
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_a400",
    },
  })
  T(
    `${TOOL}: a crashed submitter cannot leave a permanent fleet reservation`,
    staleOwnerResult.status === 0 && !existsSync(staleLock),
    `exit ${staleOwnerResult.status}: ${staleOwnerResult.stdout || staleOwnerResult.stderr}`,
  )
}
