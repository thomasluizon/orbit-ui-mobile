import { spawn } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
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
  const repo = stageRepo(`submit-cloud-${label}`)
  config.repos = { ...config.repos, [config.cloud.repositoryKey]: repo.path }
  const staged = stageWithConfig(`submit-cloud-${label}`, TOOL, config)
  cpSync(toolPath("check-dashes.mjs"), join(staged.base, "tools", "check-dashes.mjs"))
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
  const branchIndex = exec?.indexOf("--branch") ?? -1
  T(
    `${TOOL}: cloud execution is pinned to the resolved remote commit while the receipt keeps branch context`,
    branchIndex !== -1 &&
      exec[branchIndex + 1] === receipt.baseSha &&
      receipt.branch === "main" &&
      receipt.baseSha === entry.repo.git(["rev-parse", "refs/remotes/origin/main"]).stdout.trim(),
    `${JSON.stringify(exec)}\n${JSON.stringify(receipt)}`,
  )
  T(
    `${TOOL}: receipt captures the pushed base, two order hashes, deadline, worktree, and stable mirror`,
    /^[0-9a-f]{40}$/.test(receipt.baseSha) &&
      /^[0-9a-f]{64}$/.test(receipt.orderSha256) &&
      /^[0-9a-f]{64}$/.test(receipt.submittedOrderSha256) &&
      Date.parse(receipt.deadline) - Date.parse(receipt.submittedAt) === 45 * 60 * 1000 &&
      receipt.worktree === entry.repo.path &&
      existsSync(receipt.receiptPath) &&
      existsSync(receipt.mirrorPath) &&
      receipt.kind === "task-receipt" &&
      receipt.submissionState === "confirmed" &&
      receipt.repositoryKey === "ui" &&
      readdirSync(join(entry.repo.path, ".git", "orbit-cloud", "receipts")).length === 1,
    JSON.stringify(receipt),
  )

  const wrongRepository = fixture("wrong-repository")
  const apiRepository = stageRepo("submit-cloud-wrong-repository-api")
  const wrongRepositoryResult = run(TOOL, [
    ...argvOf(wrongRepository).slice(0, -1),
    apiRepository.path,
  ], {
    path: wrongRepository.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: wrongRepository.log,
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_bad1",
    },
  })
  T(
    `${TOOL}: refuses another Orbit repository on the same branch before any cloud command`,
    wrongRepositoryResult.status === 2 &&
      /does not belong to configured cloud repository ui/.test(wrongRepositoryResult.stderr) &&
      readFileSync(wrongRepository.log, "utf8") === "",
    `exit ${wrongRepositoryResult.status}: ${wrongRepositoryResult.stderr}`,
  )

  const linkedWorktree = fixture("linked-worktree")
  const linkedWorktreePath = join(linkedWorktree.repo.path, "..", "submit-cloud-linked-worktree-checkout")
  const linkedWorktreeAdded = linkedWorktree.repo.git(["worktree", "add", "-q", "--detach", linkedWorktreePath])
  const linkedWorktreeResult = run(TOOL, [
    ...argvOf(linkedWorktree).slice(0, -1),
    linkedWorktreePath,
  ], {
    path: linkedWorktree.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: linkedWorktree.log,
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_a399",
    },
  })
  const linkedWorktreeReceipt = linkedWorktreeResult.status === 0
    ? JSON.parse(linkedWorktreeResult.stdout)
    : null
  T(
    `${TOOL}: accepts a linked worktree belonging to the configured main checkout`,
    linkedWorktreeAdded.status === 0 &&
      linkedWorktreeResult.status === 0 &&
      linkedWorktreeReceipt?.worktree === linkedWorktreePath &&
      linkedWorktreeReceipt?.mirrorPath.startsWith(join(linkedWorktree.repo.path, ".git", "orbit-cloud")),
    `worktree add ${linkedWorktreeAdded.status}: ${linkedWorktreeAdded.stderr}\n` +
      `submit ${linkedWorktreeResult.status}: ${linkedWorktreeResult.stderr}`,
  )

  const missingBranch = fixture("missing-branch")
  const missingBranchArguments = argvOf(missingBranch)
  missingBranchArguments[missingBranchArguments.indexOf("--branch") + 1] = "missing-remote-branch"
  const missingBranchResult = run(TOOL, missingBranchArguments, {
    path: missingBranch.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: missingBranch.log,
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_bad2",
    },
  })
  T(
    `${TOOL}: refuses submission when the named remote branch cannot be resolved to a commit`,
    missingBranchResult.status === 1 &&
      /git ls-remote could not resolve origin\/missing-remote-branch/.test(missingBranchResult.stderr) &&
      readFileSync(missingBranch.log, "utf8") === "" &&
      !existsSync(join(missingBranch.repo.path, ".git", "orbit-cloud")),
    `exit ${missingBranchResult.status}: ${missingBranchResult.stderr}`,
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

  for (const [state, status] of [["pending", "pending"], ["ready but not materialized", "ready"]]) {
    const retry = fixture(`retry-${status}`)
    const retryReceipts = join(retry.repo.path, ".git", "orbit-cloud", "receipts")
    mkdirSync(retryReceipts, { recursive: true })
    const taskId = status === "pending" ? "task_e_398a" : "task_e_398b"
    writeFileSync(join(retryReceipts, `${taskId}.json`), JSON.stringify({
      kind: "task-receipt",
      submissionState: "confirmed",
      taskId,
      environmentId: retry.config.cloud.environmentId,
      repositoryKey: retry.config.cloud.repositoryKey,
      ticket: "#398",
      deadline: future,
      worktree: retry.repo.path,
      baseSha: "0".repeat(40),
    }))
    const retryResult = run(TOOL, argvOf(retry), {
      path: retry.path,
      env: {
        ORBIT_FAKE_CODEX_LOG: retry.log,
        ORBIT_FAKE_LIST: taskPage([task(taskId, status, status === "ready" ? 1 : 0)]),
        ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_competing",
      },
    })
    const cloudInvocations = readFileSync(retry.log, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
    T(
      `${TOOL}: a confirmed ${state} receipt blocks a competing task for the same ticket`,
      retryResult.status === 3 &&
        retryResult.stderr.includes(`task ${taskId} is ${state}`) &&
        !cloudInvocations.some((args) => args[0] === "cloud" && args[1] === "exec"),
      `exit ${retryResult.status}: ${retryResult.stderr}\n${JSON.stringify(cloudInvocations)}`,
    )
  }

  const interleaved = fixture("interleaved-materialization")
  const interleavedReceipts = join(interleaved.repo.path, ".git", "orbit-cloud", "receipts")
  mkdirSync(interleavedReceipts, { recursive: true })
  const interleavedTaskId = "task_e_a399"
  const interleavedMirror = join(interleavedReceipts, `${interleavedTaskId}.json`)
  const staleRefreshSnapshot = {
    kind: "task-receipt",
    submissionState: "confirmed",
    taskId: interleavedTaskId,
    environmentId: interleaved.config.cloud.environmentId,
    repositoryKey: interleaved.config.cloud.repositoryKey,
    ticket: "#399",
    deadline: future,
    worktree: interleaved.repo.path,
    baseSha: "0".repeat(40),
  }
  const materializationPublication = {
    ...staleRefreshSnapshot,
    firstReadyObservedAt: "2020-08-31T18:01:00.000Z",
    materialized: { at: "2026-08-31T18:02:00.000Z", status: "M  landed.txt\n", stagedStat: "1 file changed\n" },
  }
  writeFileSync(interleavedMirror, JSON.stringify(staleRefreshSnapshot))
  const interleavedResult = run(TOOL, argvOf(interleaved), {
    path: interleaved.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: interleaved.log,
      ORBIT_FAKE_LIST: taskPage([task(interleavedTaskId, "ready", 1)]),
      ORBIT_FAKE_LIST_PUBLICATION_PATH: interleavedMirror,
      ORBIT_FAKE_LIST_PUBLICATION_JSON: JSON.stringify(materializationPublication),
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_a400",
    },
  })
  const reconciledInterleavedReceipt = JSON.parse(readFileSync(interleavedMirror, "utf8"))
  T(
    `${TOOL}: a stale refresh cannot erase materialization state published while cloud list runs`,
    interleavedResult.status === 0 &&
      reconciledInterleavedReceipt.firstReadyObservedAt === materializationPublication.firstReadyObservedAt &&
      reconciledInterleavedReceipt.materialized?.at === materializationPublication.materialized.at,
    `exit ${interleavedResult.status}: ${interleavedResult.stdout || interleavedResult.stderr}\n` +
      JSON.stringify(reconciledInterleavedReceipt),
  )

  const execTimeout = fixture("exec-timeout")
  execTimeout.config.timeouts.cloudCommandMinutes = 0.005
  writeFileSync(execTimeout.configPath, `${JSON.stringify(execTimeout.config, null, 2)}\n`)
  const acceptanceLog = stage("submit-cloud/exec-timeout-acceptance.txt", "")
  const execTimeoutResult = run(TOOL, argvOf(execTimeout), {
    path: execTimeout.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: execTimeout.log,
      ORBIT_FAKE_ACCEPTANCE_LOG: acceptanceLog,
      ORBIT_FAKE_HANG_AFTER_ACCEPTANCE: "exec",
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_a399",
    },
  })
  const unknownDirectory = join(execTimeout.repo.path, ".git", "orbit-cloud", "receipts")
  const unknownFiles = readdirSync(unknownDirectory)
  const unknownPath = join(unknownDirectory, unknownFiles[0])
  const unknownReceipt = JSON.parse(readFileSync(unknownPath, "utf8"))
  T(
    `${TOOL}: a remotely accepted submission that times out remains durable unknown capacity`,
    execTimeoutResult.status === 4 &&
      /unknown submission still consumes capacity/.test(execTimeoutResult.stderr) &&
      readFileSync(acceptanceLog, "utf8") === "https://chatgpt.com/codex/tasks/task_e_a399" &&
      unknownFiles.length === 1 &&
      unknownReceipt.kind === "submission-reservation" &&
      unknownReceipt.submissionState === "unknown" &&
      unknownReceipt.ticket === "#398",
    `exit ${execTimeoutResult.status}: ${execTimeoutResult.stdout || execTimeoutResult.stderr}`,
  )
  const blockedRetry = run(TOOL, argvOf(execTimeout), {
    path: execTimeout.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: execTimeout.log,
      ORBIT_FAKE_LIST: taskPage([]),
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_a400",
    },
  })
  const retryInvocations = readFileSync(execTimeout.log, "utf8").trim().split(/\r?\n/).map(JSON.parse)
  T(
    `${TOOL}: an unknown attempt blocks resubmission of the same ticket before a second remote write`,
    blockedRetry.status === 3 &&
      /clear it after inspecting cloud tasks before resubmitting/.test(blockedRetry.stderr) &&
      retryInvocations.filter((args) => args[1] === "exec").length === 1,
    `exit ${blockedRetry.status}: ${blockedRetry.stderr}\n${JSON.stringify(retryInvocations)}`,
  )

  const clearUnknown = fixture("clear-unknown")
  clearUnknown.config.timeouts.cloudCommandMinutes = 0.005
  writeFileSync(clearUnknown.configPath, `${JSON.stringify(clearUnknown.config, null, 2)}\n`)
  const clearTimeout = run(TOOL, argvOf(clearUnknown), {
    path: clearUnknown.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: clearUnknown.log,
      ORBIT_FAKE_HANG_AFTER_ACCEPTANCE: "exec",
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_a401",
    },
  })
  const clearDirectory = join(clearUnknown.repo.path, ".git", "orbit-cloud", "receipts")
  const clearPath = join(clearDirectory, readdirSync(clearDirectory)[0])
  const cleared = run(TOOL, ["--clear-unknown", clearPath], { path: clearUnknown.path })
  T(
    `${TOOL}: an operator can explicitly clear an unknown reservation after inspection`,
    clearTimeout.status === 4 &&
      cleared.status === 0 &&
      /UNKNOWN_SUBMISSION_CLEARED/.test(cleared.stdout) &&
      !existsSync(clearPath),
    `timeout ${clearTimeout.status}; clear ${cleared.status}: ${cleared.stdout || cleared.stderr}`,
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
