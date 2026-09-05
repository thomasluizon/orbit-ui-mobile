import { spawn } from "node:child_process"
import filesystem from "node:fs"
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { syncBuiltinESMExports } from "node:module"
import { join } from "node:path"
import { setTimeout as wait } from "node:timers/promises"

import {
  T,
  REPO_ROOT,
  check,
  realOrchestratorConfig,
  run,
  stage,
  stageRepo,
  stageWithConfig,
  toolPath,
} from "./_harness.mjs"
import { cloudConfig, fakeCodex, task, taskPage } from "./cloud-worker.mjs"
import { acquireSubmissionLock, persistReconciledReceipt } from "../lib/cloud-worker.mjs"

const TOOL = "submit-cloud-worker.mjs"

const fixture = (label) => {
  const codex = fakeCodex(`submit-${label}`)
  const config = cloudConfig(codex.command, { real: realOrchestratorConfig(), cloudCeilingMinutes: 45 })
  config.timeouts.pollSeconds = 0.01
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

const spawnTool = (entry, args, env) => {
  const child = spawn(process.execPath, [entry.path, ...args], {
    cwd: entry.repo.path,
    env: { ...process.env, ...env },
    windowsHide: true,
  })
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk) => { stdout += chunk.toString() })
  child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
  const result = new Promise((resolveResult) => {
    child.once("close", (status) => resolveResult({ status, stdout, stderr }))
  })
  return { child, result }
}

const runConcurrent = (entry, env) => spawnTool(entry, argvOf(entry), env).result

const replacementOwnerSurvives = (interleave, duringRelease = false) => {
  const stateRoot = join(stage(`submit-cloud/replacement-${interleave}-${duringRelease}/fixture`, ""), "..")
  const lockDirectory = join(stateRoot, "submit.lock")
  const releaseFirst = acquireSubmissionLock(stateRoot)
  const firstOwnerPath = join(lockDirectory, readdirSync(lockDirectory)[0])
  if (interleave !== "readFileSync" && !duringRelease) writeFileSync(firstOwnerPath, JSON.stringify({ pid: 2147483647 }))
  const original = filesystem[interleave]
  let injected = false
  let missingRead = false
  let releaseSecond
  let releaseWaiter
  let secondOwnerPath
  let secondOwnerContents
  let failure
  let survived = false
  const publishSecond = () => {
    releaseSecond = acquireSubmissionLock(stateRoot)
    secondOwnerPath = join(lockDirectory, readdirSync(lockDirectory)[0])
    secondOwnerContents = readFileSync(secondOwnerPath, "utf8")
  }
  try {
    filesystem[interleave] = (path, ...args) => {
      if (injected || path !== (interleave === "rmdirSync" ? lockDirectory : firstOwnerPath)) {
        return original(path, ...args)
      }
      injected = true
      releaseFirst()
      if (interleave === "readFileSync") {
        try {
          return original(path, ...args)
        } catch (error) {
          // Preserve the real failed read, but let a third writer publish before the waiter sees it.
          missingRead = error.code === "ENOENT"
          publishSecond()
          throw error
        }
      }
      publishSecond()
      return original(path, ...args)
    }
    syncBuiltinESMExports()
    try {
      if (duringRelease) releaseFirst()
      else releaseWaiter = acquireSubmissionLock(stateRoot)
    } catch (error) {
      failure = error.message
    }
    survived = Boolean(secondOwnerPath && existsSync(secondOwnerPath) &&
      readFileSync(secondOwnerPath, "utf8") === secondOwnerContents)
  } finally {
    filesystem[interleave] = original
    syncBuiltinESMExports()
    releaseWaiter?.()
    releaseSecond?.()
    releaseFirst()
  }
  T(
    `${TOOL}: a replacement owner survives contention at ${interleave}${duringRelease ? " during release" : ""}`,
    injected && (interleave !== "readFileSync" || missingRead) && !releaseWaiter &&
      survived && failure === (duringRelease ? undefined : `cloud submission is already running in process ${process.pid}`),
    JSON.stringify({ injected, missingRead, secondOwnerLockStolen: Boolean(releaseWaiter) || !survived, failure }),
  )
}

export const cases = async () => {
  const renameRaceMirror = stage("submit-cloud/rename-race/receipts/task_e_a419.json", '{"taskId":"task_e_a419"}')
  const renameRaceLock = join(renameRaceMirror, "..", "..", "receipt-task_e_a419.json.lock")
  mkdirSync(renameRaceLock)
  writeFileSync(join(renameRaceLock, "owner.json"), JSON.stringify({ pid: process.pid }))
  const originalRename = filesystem.renameSync
  let contentionObserved = false
  let renameRaceError = null
  try {
    filesystem.renameSync = (source, destination) => {
      try {
        return originalRename(source, destination)
      } catch (error) {
        if (destination === renameRaceLock && !contentionObserved) {
          contentionObserved = true
          filesystem.rmSync(renameRaceLock, { recursive: true })
        }
        throw error
      }
    }
    syncBuiltinESMExports()
    persistReconciledReceipt({ taskId: "task_e_a419", firstReadyObservedAt: "2026-09-05T00:00:00.000Z" }, renameRaceMirror, [], { lockTimeoutMs: 1000 })
  } catch (error) {
    renameRaceError = error
  } finally {
    filesystem.renameSync = originalRename
    syncBuiltinESMExports()
  }
  T(
    `${TOOL}: a receipt claim survives its owner releasing after a native rename failure`,
    contentionObserved && renameRaceError === null && !existsSync(renameRaceLock) &&
      JSON.parse(readFileSync(renameRaceMirror, "utf8")).firstReadyObservedAt === "2026-09-05T00:00:00.000Z",
    String(renameRaceError),
  )
  for (const interleave of ["readFileSync", "unlinkSync", "rmdirSync"]) replacementOwnerSurvives(interleave)
  replacementOwnerSurvives("rmdirSync", true)
  for (const staleKind of ["unique owner", "empty directory"]) {
    const stateRoot = join(stage(`submit-cloud/reclaim-${staleKind}/fixture`, ""), "..")
    const lockDirectory = join(stateRoot, "submit.lock")
    if (staleKind === "unique owner") {
      acquireSubmissionLock(stateRoot)
      writeFileSync(join(lockDirectory, readdirSync(lockDirectory)[0]), JSON.stringify({ pid: 2147483647 }))
    } else {
      mkdirSync(lockDirectory)
    }
    const release = acquireSubmissionLock(stateRoot)
    T(`${TOOL}: stale reclamation recovers ${staleKind}`, existsSync(lockDirectory))
    release()
    T(`${TOOL}: release removes a reclaimed ${staleKind}`, !existsSync(lockDirectory))
  }
  const schedulerContract = readFileSync(join(REPO_ROOT, ".claude", "skills", "orchestrate", "SKILL.md"), "utf8")
  const normalizedSchedulerContract = schedulerContract.replace(/\s+/g, " ")
  T(
    `${TOOL}: the scheduler contract resolves every terminal task status`,
    schedulerContract.includes("When a task receipt reaches any terminal status") &&
      schedulerContract.includes("For `error` and `applied`, it records the distinct unusable result") &&
      schedulerContract.includes("List summary statistics are advisory"),
    "the scheduler contract does not route all terminal task receipts through resolution",
  )
  T(
    `${TOOL}: the scheduler contract gives visible tasks a non-adopting abandon path`,
    normalizedSchedulerContract.includes("--abandon-known <reservation> --task-id <task_e_id>") &&
      normalizedSchedulerContract.includes("reservation keeps consuming capacity and blocking its ticket") &&
      normalizedSchedulerContract.includes("Never assert absence while the UI shows a task"),
    "the visible task abandon action is missing or releases before terminal observation",
  )
  T(
    `${TOOL}: the combined sleep and cloud contract launches one registered receipt watcher`,
    normalizedSchedulerContract.includes("Under combined `--sleep --cloud`") &&
      normalizedSchedulerContract.includes("--watch <receiptPath>") &&
      normalizedSchedulerContract.includes("Submission alone is not a wake source"),
    "the cloud path has no durable unattended wake contract",
  )
  const entry = fixture("success")
  const stdinLog = stage("submit-cloud/success-stdin.txt", "")
  const env = {
    ORBIT_FAKE_CODEX_LOG: entry.log,
    ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_a398",
    ORBIT_FAKE_STDIN_LOG: stdinLog,
  }
  const submitted = check(TOOL, "submits one task and prints one receipt object", argvOf(entry), { status: 0, stdout: /"taskId":"task_e_a398"/ }, { path: entry.path, env })
  const receipt = JSON.parse(submitted.stdout)
  const invocations = readFileSync(entry.log, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
  const exec = invocations.find((args) => args[0] === "cloud" && args[1] === "exec")
  T(
    `${TOOL}: the order goes through stdin and ends with the finishing contract`,
    exec?.at(-1) === receipt.baseSha &&
      readFileSync(stdinLog, "utf8").startsWith("Implement the measured cloud path.") &&
      readFileSync(stdinLog, "utf8").endsWith("Delivery happens outside the container.\n"),
    `${JSON.stringify(exec)}\n${readFileSync(stdinLog, "utf8")}`,
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

  const watcher = spawnTool(entry, ["--watch", receipt.receiptPath], {
    ORBIT_FAKE_CODEX_LOG: entry.log,
    ORBIT_FAKE_LIST: taskPage([task(receipt.taskId, "ready", 1)]),
    ORBIT_FAKE_LIST_DELAY_MS: "200",
  })
  const wakeSource = join(entry.base, ".git", "orbit-wake-sources", `${watcher.child.pid}.json`)
  const wakeDeadline = Date.now() + 2000
  while (!existsSync(wakeSource) && Date.now() < wakeDeadline) await wait(10)
  const watcherWasLive = existsSync(wakeSource)
  const watcherResult = await watcher.result
  const watchedReceipt = JSON.parse(readFileSync(receipt.receiptPath, "utf8"))
  T(
    `${TOOL}: a cloud watcher is a live registered wake source until it records a terminal receipt`,
    watcherWasLive &&
      watcherResult.status === 0 &&
      /"outcome":"TERMINAL_READY"/.test(watcherResult.stdout) &&
      watchedReceipt.terminal?.status === "ready" &&
      !existsSync(wakeSource),
    `exit ${watcherResult.status}: ${watcherResult.stdout || watcherResult.stderr}\n` +
      `live ${watcherWasLive}; receipt ${JSON.stringify(watchedReceipt)}`,
  )

  const abandonedWatcher = fixture("abandoned-watcher")
  const abandonedSubmission = run(TOOL, argvOf(abandonedWatcher), {
    path: abandonedWatcher.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: abandonedWatcher.log,
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_ab398",
    },
  })
  const abandonedWatcherReceipt = JSON.parse(abandonedSubmission.stdout)
  abandonedWatcherReceipt.deadline = new Date(Date.now() - 1000).toISOString()
  writeFileSync(abandonedWatcherReceipt.receiptPath, JSON.stringify(abandonedWatcherReceipt))
  writeFileSync(abandonedWatcherReceipt.mirrorPath, JSON.stringify(abandonedWatcherReceipt))
  const abandonedWatcherIndex = stage("submit-cloud/abandoned-watcher-index.txt", "0")
  const abandonedWatcherResult = run(TOOL, ["--watch", abandonedWatcherReceipt.receiptPath], {
    path: abandonedWatcher.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: abandonedWatcher.log,
      ORBIT_FAKE_LIST_SEQUENCE: JSON.stringify([
        taskPage([task(abandonedWatcherReceipt.taskId, "pending", 0)]),
        taskPage([task(abandonedWatcherReceipt.taskId, "ready", 1)]),
      ]),
      ORBIT_FAKE_LIST_INDEX_PATH: abandonedWatcherIndex,
    },
  })
  const persistedAbandonment = JSON.parse(readFileSync(abandonedWatcherReceipt.receiptPath, "utf8"))
  T(
    `${TOOL}: a cloud watcher keeps remote ownership after local abandonment until terminal observation`,
    abandonedWatcherResult.status === 0 &&
      /"outcome":"ABANDONED_TERMINAL_READY"/.test(abandonedWatcherResult.stdout) &&
      persistedAbandonment.abandoned?.lastObservedStatus === "pending" &&
      persistedAbandonment.lateTerminal?.status === "ready" &&
      Number(readFileSync(abandonedWatcherIndex, "utf8")) >= 2,
    `exit ${abandonedWatcherResult.status}: ${abandonedWatcherResult.stdout || abandonedWatcherResult.stderr}\n` +
      JSON.stringify(persistedAbandonment),
  )

  const largeOrder = fixture("large-order")
  writeFileSync(largeOrder.order, `${"x".repeat(40_000)}\n`)
  const largeOrderStdin = stage("submit-cloud/large-order-stdin.txt", "")
  const largeOrderResult = run(TOOL, argvOf(largeOrder), {
    path: largeOrder.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: largeOrder.log,
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_aa398",
      ORBIT_FAKE_STDIN_LOG: largeOrderStdin,
    },
  })
  const largeOrderInvocations = readFileSync(largeOrder.log, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
  const largeOrderExec = largeOrderInvocations.find((args) => args[0] === "cloud" && args[1] === "exec")
  T(
    `${TOOL}: an order larger than the Windows argv limit is submitted intact through stdin`,
    largeOrderResult.status === 0 &&
      readFileSync(largeOrderStdin, "utf8").startsWith("x".repeat(40_000)) &&
      readFileSync(largeOrderStdin, "utf8").endsWith("Delivery happens outside the container.\n") &&
      largeOrderExec.every((argument) => argument.length < 1000),
    `exit ${largeOrderResult.status}: ${largeOrderResult.stdout || largeOrderResult.stderr}\n${JSON.stringify(largeOrderExec)}`,
  )

  const interruptedTransition = fixture("interrupted-transition")
  const transitionDirectory = join(interruptedTransition.repo.path, ".git", "orbit-cloud", "receipts")
  mkdirSync(transitionDirectory, { recursive: true })
  const transitionReservationId = "00000000-0000-0000-0000-000000000398"
  const transitionTaskId = "task_e_cc398"
  const transitionReservationPath = join(transitionDirectory, `reservation-${transitionReservationId}.json`)
  const transitionMirrorPath = join(transitionDirectory, `${transitionTaskId}.json`)
  const transitionScratchPath = stage("submit-cloud/interrupted-transition-receipt.json", "")
  const transitionBaseSha = interruptedTransition.repo.git(["rev-parse", "HEAD"]).stdout.trim()
  writeFileSync(transitionReservationPath, JSON.stringify({
    kind: "submission-reservation",
    reservationId: transitionReservationId,
    submissionState: "confirmed",
    taskId: transitionTaskId,
    taskUrl: `https://chatgpt.com/codex/tasks/${transitionTaskId}`,
    environmentId: interruptedTransition.config.cloud.environmentId,
    repositoryKey: interruptedTransition.config.cloud.repositoryKey,
    ticket: "#398",
    branch: "main",
    baseSha: transitionBaseSha,
    orderFile: interruptedTransition.order,
    worktree: interruptedTransition.repo.path,
    submittedAt: new Date().toISOString(),
    deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    receiptPath: transitionScratchPath,
    mirrorPath: transitionMirrorPath,
  }))
  const transitionResult = run(TOOL, argvOf(interruptedTransition), {
    path: interruptedTransition.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: interruptedTransition.log,
      ORBIT_FAKE_LIST: taskPage([task(transitionTaskId, "pending", 0)]),
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_dead",
    },
  })
  const transitionedMirror = JSON.parse(readFileSync(transitionMirrorPath, "utf8"))
  const transitionedScratch = JSON.parse(readFileSync(transitionScratchPath, "utf8"))
  T(
    `${TOOL}: an interrupted reservation to receipt transition reconciles to one governing task receipt`,
    transitionResult.status === 3 &&
      !existsSync(transitionReservationPath) &&
      readdirSync(transitionDirectory).filter((entry) => entry.endsWith(".json")).length === 1 &&
      transitionedMirror.kind === "task-receipt" &&
      transitionedMirror.transitionReservationId === transitionReservationId &&
      transitionedScratch.taskId === transitionTaskId,
    `exit ${transitionResult.status}: ${transitionResult.stdout || transitionResult.stderr}\n` +
      `mirror ${JSON.stringify(transitionedMirror)}\nscratch ${JSON.stringify(transitionedScratch)}`,
  )

  const firstRun = fixture("first-run")
  const firstRunBranch = "feature/ticket-398-first-run"
  const firstRunCreated = firstRun.repo.git(["switch", "-q", "-c", firstRunBranch])
  const unpublished = firstRun.repo.git(["ls-remote", "--exit-code", "origin", `refs/heads/${firstRunBranch}`])
  const firstRunPublished = firstRun.repo.git(["push", "-q", "-u", "origin", firstRunBranch])
  const firstRunArguments = argvOf(firstRun)
  firstRunArguments[firstRunArguments.indexOf("--branch") + 1] = firstRunBranch
  const firstRunResult = run(TOOL, firstRunArguments, {
    path: firstRun.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: firstRun.log,
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_f1",
    },
  })
  const firstRunReceipt = firstRunResult.status === 0 ? JSON.parse(firstRunResult.stdout) : null
  T(
    `${TOOL}: a newly created contract branch succeeds after the documented publication step`,
    firstRunCreated.status === 0 &&
      unpublished.status !== 0 &&
      firstRunPublished.status === 0 &&
      firstRunResult.status === 0 &&
      firstRunReceipt?.branch === firstRunBranch &&
      firstRunReceipt?.baseSha === firstRun.repo.git(["rev-parse", "HEAD"]).stdout.trim(),
    `create ${firstRunCreated.status}: ${firstRunCreated.stderr}\n` +
      `unpublished ${unpublished.status}: ${unpublished.stderr}\n` +
      `publish ${firstRunPublished.status}: ${firstRunPublished.stderr}\n` +
      `submit ${firstRunResult.status}: ${firstRunResult.stderr}`,
  )

  const mismatchedTip = fixture("mismatched-tip")
  const mismatchedBranch = "feature/ticket-398-mismatched-tip"
  const mismatchedCreated = mismatchedTip.repo.git(["switch", "-q", "-c", mismatchedBranch])
  const mismatchedPublished = mismatchedTip.repo.git(["push", "-q", "-u", "origin", mismatchedBranch])
  const advancedLocally = mismatchedTip.repo.git(["commit", "-q", "--allow-empty", "-m", "advance local head"])
  const mismatchedArguments = argvOf(mismatchedTip)
  mismatchedArguments[mismatchedArguments.indexOf("--branch") + 1] = mismatchedBranch
  const mismatchedResult = run(TOOL, mismatchedArguments, {
    path: mismatchedTip.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: mismatchedTip.log,
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_badtip",
    },
  })
  T(
    `${TOOL}: refuses when the remote branch tip differs from the worktree HEAD`,
    mismatchedCreated.status === 0 &&
      mismatchedPublished.status === 0 &&
      advancedLocally.status === 0 &&
      mismatchedResult.status === 1 &&
      /origin\/feature\/ticket-398-mismatched-tip is at [0-9a-f]{40}, but the worktree HEAD is [0-9a-f]{40}; publish the worktree HEAD before submission/.test(mismatchedResult.stderr) &&
      readFileSync(mismatchedTip.log, "utf8") === "" &&
      !existsSync(join(mismatchedTip.repo.path, ".git", "orbit-cloud")),
    `create ${mismatchedCreated.status}: ${mismatchedCreated.stderr}\n` +
      `publish ${mismatchedPublished.status}: ${mismatchedPublished.stderr}\n` +
      `advance ${advancedLocally.status}: ${advancedLocally.stderr}\n` +
      `submit ${mismatchedResult.status}: ${mismatchedResult.stderr}`,
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

  const stalledRemote = fixture("stalled-remote")
  stalledRemote.config.timeouts.gitRemoteSeconds = 0.25
  writeFileSync(stalledRemote.configPath, `${JSON.stringify(stalledRemote.config, null, 2)}\n`)
  stalledRemote.repo.git(["remote", "set-url", "origin", "ssh://example.invalid/orbit.git"])
  const hangingSsh = stage(
    "submit-cloud/stalled-remote-ssh.mjs",
    "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)\n",
  )
  const stalledRemoteResult = run(TOOL, argvOf(stalledRemote), {
    path: stalledRemote.path,
    env: {
      GIT_SSH_COMMAND: `\"${process.execPath.replaceAll("\\", "/")}\" \"${hangingSsh.replaceAll("\\", "/")}\"`,
      ORBIT_FAKE_CODEX_LOG: stalledRemote.log,
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_bad3",
    },
  })
  T(
    `${TOOL}: a stalled git ls-remote fails within its configured wall clock`,
    stalledRemoteResult.status === 4 &&
      /git ls-remote timed out after 250ms resolving origin\/main/.test(stalledRemoteResult.stderr) &&
      readFileSync(stalledRemote.log, "utf8") === "",
    `exit ${stalledRemoteResult.status}: ${stalledRemoteResult.stdout || stalledRemoteResult.stderr}`,
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

  {
    const status = "pending"
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
      `${TOOL}: a confirmed pending receipt blocks a competing task for the same ticket`,
      retryResult.status === 3 &&
        retryResult.stderr.includes(`task ${taskId} is pending`) &&
        !cloudInvocations.some((args) => args[0] === "cloud" && args[1] === "exec"),
      `exit ${retryResult.status}: ${retryResult.stderr}\n${JSON.stringify(cloudInvocations)}`,
    )
  }

  for (const status of ["ready", "applied", "error"]) {
    const retry = fixture(`retry-${status}`)
    const retryReceipts = join(retry.repo.path, ".git", "orbit-cloud", "receipts")
    mkdirSync(retryReceipts, { recursive: true })
    const taskId = status === "ready" ? "task_e_398b" : status === "applied" ? "task_e_398c" : "task_e_398d"
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
        ORBIT_FAKE_LIST: taskPage([task(taskId, status, status === "error" ? 0 : 1)]),
        ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_cafe",
      },
    })
    const cloudInvocations = readFileSync(retry.log, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
    T(
      `${TOOL}: an unresolved terminal ${status} receipt still blocks its ticket`,
      retryResult.status === 3 &&
        retryResult.stderr.includes(`task ${taskId} is ${status}`) &&
        !cloudInvocations.some((args) => args[0] === "cloud" && args[1] === "exec"),
      `exit ${retryResult.status}: ${retryResult.stdout || retryResult.stderr}\n${JSON.stringify(cloudInvocations)}`,
    )
  }

  const readyCapacity = fixture("ready-capacity")
  const readyCapacityReceipts = join(readyCapacity.repo.path, ".git", "orbit-cloud", "receipts")
  mkdirSync(readyCapacityReceipts, { recursive: true })
  const readyCapacityTaskId = "task_e_398e"
  const readyCapacityTasks = [task(readyCapacityTaskId, "ready", 1)]
  for (const [taskId, ticket] of [["task_e_a4", "#400"], ["task_e_b5", "#401"], ["task_e_c6", "#402"]]) {
    readyCapacityTasks.push(task(taskId, "pending", 0))
    writeFileSync(join(readyCapacityReceipts, `${taskId}.json`), JSON.stringify({
      kind: "task-receipt",
      submissionState: "confirmed",
      taskId,
      environmentId: readyCapacity.config.cloud.environmentId,
      repositoryKey: readyCapacity.config.cloud.repositoryKey,
      ticket,
      deadline: future,
      worktree: readyCapacity.repo.path,
      baseSha: "0".repeat(40),
    }))
  }
  writeFileSync(join(readyCapacityReceipts, `${readyCapacityTaskId}.json`), JSON.stringify({
    kind: "task-receipt",
    submissionState: "confirmed",
    taskId: readyCapacityTaskId,
    environmentId: readyCapacity.config.cloud.environmentId,
    repositoryKey: readyCapacity.config.cloud.repositoryKey,
    ticket: "#399",
    deadline: future,
    worktree: readyCapacity.repo.path,
    baseSha: "0".repeat(40),
  }))
  const readyCapacityResult = run(TOOL, argvOf(readyCapacity), {
    path: readyCapacity.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: readyCapacity.log,
      ORBIT_FAKE_LIST: taskPage(readyCapacityTasks),
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_398f",
    },
  })
  const readyCapacityInvocations = readFileSync(readyCapacity.log, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
  T(
    `${TOOL}: a ready unmaterialized receipt leaves the fourth fleet slot available`,
    readyCapacityResult.status === 0 &&
      readyCapacityInvocations.filter((args) => args[0] === "cloud" && args[1] === "exec").length === 1,
    `exit ${readyCapacityResult.status}: ${readyCapacityResult.stdout || readyCapacityResult.stderr}\n` +
      JSON.stringify(readyCapacityInvocations),
  )

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
      /release it only after confirming in the Codex UI that no task exists before resubmitting/.test(blockedRetry.stderr) &&
      retryInvocations.filter((args) => args[1] === "exec").length === 1,
    `exit ${blockedRetry.status}: ${blockedRetry.stderr}\n${JSON.stringify(retryInvocations)}`,
  )

  const liveOrphan = fixture("live-orphan")
  liveOrphan.config.timeouts.cloudCommandMinutes = 0.005
  writeFileSync(liveOrphan.configPath, `${JSON.stringify(liveOrphan.config, null, 2)}\n`)
  const liveOrphanTaskId = "task_e_a401"
  const liveOrphanDirectory = join(liveOrphan.repo.path, ".git", "orbit-cloud", "receipts")
  mkdirSync(liveOrphanDirectory, { recursive: true })
  for (const suffix of ["a1", "b2", "c3"]) {
    writeFileSync(join(liveOrphanDirectory, `task_e_${suffix}.json`), JSON.stringify({
      kind: "task-receipt",
      submissionState: "confirmed",
      taskId: `task_e_${suffix}`,
      environmentId: liveOrphan.config.cloud.environmentId,
      repositoryKey: liveOrphan.config.cloud.repositoryKey,
      ticket: "#400",
      deadline: future,
      worktree: liveOrphan.repo.path,
      baseSha: "0".repeat(40),
    }))
  }
  const liveOrphanTimeout = run(TOOL, argvOf(liveOrphan), {
    path: liveOrphan.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: liveOrphan.log,
      ORBIT_FAKE_HANG_AFTER_ACCEPTANCE: "exec",
      ORBIT_FAKE_EXEC_URL: `https://chatgpt.com/codex/tasks/${liveOrphanTaskId}`,
    },
  })
  const liveOrphanPath = readdirSync(liveOrphanDirectory)
    .map((entry) => join(liveOrphanDirectory, entry))
    .find((path) => JSON.parse(readFileSync(path, "utf8")).kind === "submission-reservation")
  const refusedClear = run(TOOL, ["--clear-unknown", liveOrphanPath], {
    path: liveOrphan.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: liveOrphan.log,
    },
  })
  const blockedSameTicket = run(TOOL, argvOf(liveOrphan), {
    path: liveOrphan.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: liveOrphan.log,
      ORBIT_FAKE_LIST: taskPage([task(liveOrphanTaskId, "pending", 0)]),
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_competing",
    },
  })
  const otherTicketArguments = argvOf(liveOrphan)
  otherTicketArguments[otherTicketArguments.indexOf("--issue") + 1] = "#399"
  const blockedCapacity = run(TOOL, otherTicketArguments, {
    path: liveOrphan.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: liveOrphan.log,
      ORBIT_FAKE_LIST: taskPage([task(liveOrphanTaskId, "pending", 0)]),
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_competing",
    },
  })
  T(
    `${TOOL}: clear without the human assertion refuses and keeps capacity and ticket protections`,
    liveOrphanTimeout.status === 4 &&
      refusedClear.status === 3 &&
      /task absence cannot be proven from codex cloud list/.test(refusedClear.stderr) &&
      /Open the task list in the Codex UI/.test(refusedClear.stderr) &&
      /--assert-no-task-exists/.test(refusedClear.stderr) &&
      existsSync(liveOrphanPath) &&
      blockedSameTicket.status === 3 &&
      /unknown submission reservation/.test(blockedSameTicket.stderr) &&
      blockedCapacity.status === 3 &&
      /4\/4 tasks are in flight/.test(blockedCapacity.stderr),
    `timeout ${liveOrphanTimeout.status}; clear ${refusedClear.status}: ${refusedClear.stderr}\n` +
      `same ticket ${blockedSameTicket.status}: ${blockedSameTicket.stderr}\n` +
      `capacity ${blockedCapacity.status}: ${blockedCapacity.stderr}`,
  )

  const invocationsBeforeAssertion = readFileSync(liveOrphan.log, "utf8").trim().split(/\r?\n/).filter(Boolean).length
  const assertedClear = run(TOOL, ["--clear-unknown", liveOrphanPath, "--assert-no-task-exists"], {
    path: liveOrphan.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: liveOrphan.log,
    },
  })
  const releasedReservation = JSON.parse(readFileSync(liveOrphanPath, "utf8"))
  const invocationsAfterAssertion = readFileSync(liveOrphan.log, "utf8").trim().split(/\r?\n/).filter(Boolean).length
  T(
    `${TOOL}: the explicit human assertion releases and records the unknown reservation without listing`,
    assertedClear.status === 0 &&
      /UNKNOWN_SUBMISSION_CLEARED/.test(assertedClear.stdout) &&
      releasedReservation.submissionState === "released" &&
      releasedReservation.released?.by === "human" &&
      releasedReservation.released?.assertion === "no task exists for this reservation in the Codex UI" &&
      Number.isFinite(Date.parse(releasedReservation.released?.at)) &&
      invocationsAfterAssertion === invocationsBeforeAssertion,
    `exit ${assertedClear.status}: ${assertedClear.stdout || assertedClear.stderr}\n` +
      JSON.stringify(releasedReservation),
  )

  const staleAbandonAfterClear = run(TOOL, ["--abandon-known", liveOrphanPath, "--task-id", liveOrphanTaskId], {
    path: liveOrphan.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: liveOrphan.log,
      ORBIT_FAKE_LIST: taskPage([task(liveOrphanTaskId, "pending", 0)]),
    },
  })
  T(
    `${TOOL}: abandon revalidates the locked reservation and cannot overwrite a completed clear`,
    staleAbandonAfterClear.status === 2 &&
      /not an unresolved cloud submission reservation/.test(staleAbandonAfterClear.stderr) &&
      JSON.parse(readFileSync(liveOrphanPath, "utf8")).submissionState === "released",
    `exit ${staleAbandonAfterClear.status}: ${staleAbandonAfterClear.stdout || staleAbandonAfterClear.stderr}\n` +
      readFileSync(liveOrphanPath, "utf8"),
  )

  const knownOrphan = fixture("known-orphan")
  const knownOrphanDirectory = join(knownOrphan.repo.path, ".git", "orbit-cloud", "receipts")
  mkdirSync(knownOrphanDirectory, { recursive: true })
  const knownReservationId = "00000000-0000-0000-0000-000000000401"
  const knownTaskId = "task_e_ab401"
  const knownReservationPath = join(knownOrphanDirectory, `reservation-${knownReservationId}.json`)
  writeFileSync(knownReservationPath, JSON.stringify({
    kind: "submission-reservation",
    reservationId: knownReservationId,
    submissionState: "unknown",
    environmentId: knownOrphan.config.cloud.environmentId,
    repositoryKey: knownOrphan.config.cloud.repositoryKey,
    ticket: "#398",
    branch: "main",
    baseSha: knownOrphan.repo.git(["rev-parse", "HEAD"]).stdout.trim(),
    orderFile: knownOrphan.order,
    worktree: knownOrphan.repo.path,
    submittedAt: new Date().toISOString(),
    deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    mirrorPath: knownReservationPath,
  }))
  const contradictoryClearResult = run(TOOL, [
    "--clear-unknown",
    knownReservationPath,
    "--assert-no-task-exists",
    "--task-id",
    knownTaskId,
  ], { path: knownOrphan.path })
  const knownAbandonResult = run(TOOL, ["--abandon-known", knownReservationPath, "--task-id", knownTaskId], {
    path: knownOrphan.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: knownOrphan.log,
      ORBIT_FAKE_LIST: taskPage([task(knownTaskId, "pending", 0)]),
    },
  })
  const pendingKnownReservation = JSON.parse(readFileSync(knownReservationPath, "utf8"))
  const idempotentKnownAbandon = run(TOOL, ["--abandon-known", knownReservationPath, "--task-id", knownTaskId], {
    path: knownOrphan.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: knownOrphan.log,
      ORBIT_FAKE_LIST: taskPage([task(knownTaskId, "pending", 0)]),
    },
  })
  const competingKnownAbandon = run(TOOL, ["--abandon-known", knownReservationPath, "--task-id", "task_e_ab402"], {
    path: knownOrphan.path,
  })
  const staleClearAfterAbandon = run(TOOL, ["--clear-unknown", knownReservationPath, "--assert-no-task-exists"], {
    path: knownOrphan.path,
  })
  const blockedKnownResult = run(TOOL, argvOf(knownOrphan), {
    path: knownOrphan.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: knownOrphan.log,
      ORBIT_FAKE_LIST: taskPage([task(knownTaskId, "pending", 0)]),
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_ac401",
    },
  })
  const releasedKnownResult = run(TOOL, argvOf(knownOrphan), {
    path: knownOrphan.path,
    env: {
      ORBIT_FAKE_CODEX_LOG: knownOrphan.log,
      ORBIT_FAKE_LIST: taskPage([task(knownTaskId, "error", 0)]),
      ORBIT_FAKE_EXEC_URL: "https://chatgpt.com/codex/tasks/task_e_ac401",
    },
  })
  const releasedKnownReservation = JSON.parse(readFileSync(knownReservationPath, "utf8"))
  T(
    `${TOOL}: a visible orphan is tracked without adoption and releases only after terminal observation`,
    contradictoryClearResult.status === 2 &&
      /cannot be combined.*--task-id/.test(contradictoryClearResult.stderr) &&
      knownAbandonResult.status === 0 &&
      /KNOWN_TASK_ABANDONED/.test(knownAbandonResult.stdout) &&
      idempotentKnownAbandon.status === 0 &&
      competingKnownAbandon.status === 2 &&
      /already bound to task/.test(competingKnownAbandon.stderr) &&
      staleClearAfterAbandon.status === 2 &&
      /not an unknown cloud submission reservation/.test(staleClearAfterAbandon.stderr) &&
      pendingKnownReservation.submissionState === "known-task-abandoned" &&
      pendingKnownReservation.released === undefined &&
      blockedKnownResult.status === 3 &&
      /wait for its terminal status/.test(blockedKnownResult.stderr) &&
      releasedKnownResult.status === 0 &&
      releasedKnownReservation.submissionState === "released" &&
      releasedKnownReservation.terminal?.status === "error" &&
      releasedKnownReservation.released?.by === "scheduler",
    `contradictory clear ${contradictoryClearResult.status}: ${contradictoryClearResult.stderr}\n` +
      `abandon ${knownAbandonResult.status}: ${knownAbandonResult.stdout || knownAbandonResult.stderr}\n` +
      `idempotent abandon ${idempotentKnownAbandon.status}: ${idempotentKnownAbandon.stdout || idempotentKnownAbandon.stderr}\n` +
      `competing abandon ${competingKnownAbandon.status}: ${competingKnownAbandon.stdout || competingKnownAbandon.stderr}\n` +
      `stale clear ${staleClearAfterAbandon.status}: ${staleClearAfterAbandon.stdout || staleClearAfterAbandon.stderr}\n` +
      `blocked ${blockedKnownResult.status}: ${blockedKnownResult.stdout || blockedKnownResult.stderr}\n` +
      `released ${releasedKnownResult.status}: ${releasedKnownResult.stdout || releasedKnownResult.stderr}\n` +
      JSON.stringify(releasedKnownReservation),
  )

  const recoveryRace = fixture("recovery-race")
  const releaseRacingList = stage("submit-cloud/release-racing-list", "waiting")
  writeFileSync(recoveryRace.codex.script, readFileSync(recoveryRace.codex.script, "utf8").replace(
    'const args = process.argv.slice(2)',
    `const args = process.argv.slice(2)
if (args[1] === "list") {
  writeFileSync(${JSON.stringify(releaseRacingList)}, "entered")
  while (readFileSync(${JSON.stringify(releaseRacingList)}, "utf8") !== "released") {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  }
}`,
  ))
  const recoveryRaceDirectory = join(recoveryRace.repo.path, ".git", "orbit-cloud", "receipts")
  mkdirSync(recoveryRaceDirectory, { recursive: true })
  const recoveryRaceReservationId = "00000000-0000-0000-0000-000000000402"
  const recoveryRaceTaskId = "task_e_ab403"
  const recoveryRacePath = join(recoveryRaceDirectory, `reservation-${recoveryRaceReservationId}.json`)
  writeFileSync(recoveryRacePath, JSON.stringify({
    kind: "submission-reservation",
    reservationId: recoveryRaceReservationId,
    submissionState: "unknown",
    environmentId: recoveryRace.config.cloud.environmentId,
    repositoryKey: recoveryRace.config.cloud.repositoryKey,
    ticket: "#398",
    worktree: recoveryRace.repo.path,
    deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    mirrorPath: recoveryRacePath,
  }))
  const racingAbandon = spawnTool(
    recoveryRace,
    ["--abandon-known", recoveryRacePath, "--task-id", recoveryRaceTaskId],
    {
      ORBIT_FAKE_CODEX_LOG: recoveryRace.log,
      ORBIT_FAKE_LIST: taskPage([task(recoveryRaceTaskId, "pending", 0)]),
    },
  )
  let racingClear
  try {
    const racingListDeadline = Date.now() + 30_000
    while (readFileSync(releaseRacingList, "utf8") !== "entered") {
      if (Date.now() >= racingListDeadline) throw new Error("abandon did not enter the coordinated list call")
      await wait(10)
    }
    racingClear = run(TOOL, ["--clear-unknown", recoveryRacePath, "--assert-no-task-exists"], {
      path: recoveryRace.path,
    })
  } finally {
    writeFileSync(releaseRacingList, "released")
  }
  const racingAbandonResult = await racingAbandon.result
  const racingReservation = JSON.parse(readFileSync(recoveryRacePath, "utf8"))
  T(
    `${TOOL}: a coordinated clear cannot erase a task binding while abandon owns the mutation lock`,
    racingAbandonResult.status === 0 &&
      racingClear.status === 2 &&
      /cloud submission is already running/.test(racingClear.stderr) &&
      racingReservation.submissionState === "known-task-abandoned" &&
      racingReservation.taskId === recoveryRaceTaskId &&
      racingReservation.released === undefined,
    `abandon ${racingAbandonResult.status}: ${racingAbandonResult.stdout || racingAbandonResult.stderr}\n` +
      `clear ${racingClear.status}: ${racingClear.stdout || racingClear.stderr}\n` +
      JSON.stringify(racingReservation),
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
