import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  T,
  realOrchestratorConfig,
  run,
  stage,
  stageRepo,
  stageWithConfig,
} from "./_harness.mjs"
import { cloudConfig, fakeCodex, task, taskPage } from "./cloud-worker.mjs"

const TOOL = "materialize-cloud-result.mjs"

const fixture = (label, overrides = {}) => {
  const codex = fakeCodex(`materialize-${label}`)
  const config = cloudConfig(codex.command, { real: realOrchestratorConfig() })
  const staged = stageWithConfig(`materialize-cloud-${label}`, TOOL, config)
  const repo = stageRepo(`materialize-cloud-${label}`)
  const head = repo.git(["rev-parse", "HEAD"]).stdout.trim()
  const id = overrides.taskId ?? `task_e_${label.replace(/[^a-f0-9]/g, "a")}1`
  const receipt = {
    taskId: id,
    environmentId: config.cloud.environmentId,
    ticket: "#398",
    branch: "main",
    baseSha: overrides.baseSha ?? head,
    worktree: repo.path,
    submittedAt: "2026-08-31T17:00:00.000Z",
    deadline: overrides.deadline ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...(overrides.abandoned ? { abandoned: overrides.abandoned } : {}),
  }
  const receiptPath = stage(`materialize-cloud/${label}.json`, `${JSON.stringify(receipt, null, 2)}\n`)
  const log = stage(`materialize-cloud/${label}-codex.jsonl`, "")
  return { ...staged, repo, head, receipt, receiptPath, log, config }
}

const invoke = (entry, tasks, extra = []) => run(TOOL, ["--receipt", entry.receiptPath, ...extra], {
  path: entry.path,
  env: { ORBIT_FAKE_CODEX_LOG: entry.log, ORBIT_FAKE_LIST: taskPage(tasks) },
})

export const cases = () => {
  const dirty = fixture("dirty", { taskId: "task_e_d1" })
  writeFileSync(join(dirty.repo.path, "dirty.txt"), "local change\n")
  const dirtyResult = invoke(dirty, [task(dirty.receipt.taskId, "ready", 1)])
  T(
    `${TOOL}: refuses a dirty worktree before calling cloud apply or list`,
    dirtyResult.status === 2 && /worktree is dirty/.test(dirtyResult.stderr) && readFileSync(dirty.log, "utf8") === "",
    `exit ${dirtyResult.status}: ${dirtyResult.stderr}`,
  )

  const wrongBase = fixture("wrong-base", { taskId: "task_e_b1", baseSha: "0".repeat(40) })
  const baseResult = invoke(wrongBase, [task(wrongBase.receipt.taskId, "ready", 1)])
  T(
    `${TOOL}: refuses a clean worktree at the wrong base SHA before cloud apply`,
    baseResult.status === 2 && /does not equal receipt base SHA/.test(baseResult.stderr) && readFileSync(wrongBase.log, "utf8") === "",
    `exit ${baseResult.status}: ${baseResult.stderr}`,
  )

  const abandoned = fixture("abandoned", {
    taskId: "task_e_ab1",
    abandoned: { at: "2026-08-31T18:00:00.000Z", lastObservedStatus: "pending" },
  })
  const abandonedResult = invoke(abandoned, [task(abandoned.receipt.taskId, "ready", 2)])
  const abandonedReceipt = JSON.parse(readFileSync(abandoned.receiptPath, "utf8"))
  T(
    `${TOOL}: refuses an abandoned task and records a late terminal result`,
    abandonedResult.status === 5 && /"outcome":"ABANDONED"/.test(abandonedResult.stdout) && abandonedReceipt.lateTerminal?.status === "ready",
    `exit ${abandonedResult.status}: ${abandonedResult.stdout || abandonedResult.stderr}\n${JSON.stringify(abandonedReceipt)}`,
  )

  const empty = fixture("empty", { taskId: "task_e_e1" })
  const emptyResult = invoke(empty, [task(empty.receipt.taskId, "ready", 0)])
  T(
    `${TOOL}: ready with zero changed files is a distinct blocked-commit failure`,
    emptyResult.status === 4 && /"outcome":"READY_WITHOUT_COMMIT"/.test(emptyResult.stdout) && /blocked container commit/.test(emptyResult.stdout),
    `exit ${emptyResult.status}: ${emptyResult.stdout || emptyResult.stderr}`,
  )

  const expired = fixture("expired", {
    taskId: "task_e_f1",
    deadline: "2026-08-31T17:01:00.000Z",
  })
  const expiredResult = invoke(expired, [task(expired.receipt.taskId, "pending", 0)])
  const expiredReceipt = JSON.parse(readFileSync(expired.receiptPath, "utf8"))
  T(
    `${TOOL}: a past-deadline pending task is abandoned locally and frees its derived slot`,
    expiredResult.status === 5 && expiredReceipt.abandoned?.lastObservedStatus === "pending",
    `exit ${expiredResult.status}: ${expiredResult.stdout || expiredResult.stderr}\n${JSON.stringify(expiredReceipt)}`,
  )

  const landed = fixture("landed", { taskId: "task_e_a11" })
  const landedResult = invoke(landed, [task(landed.receipt.taskId, "ready", 1)])
  const landedHead = landed.repo.git(["rev-parse", "HEAD"]).stdout.trim()
  const staged = landed.repo.git(["diff", "--cached", "--name-only"]).stdout.trim()
  T(
    `${TOOL}: applies a ready task as staged changes, reports Git artifacts, and never moves HEAD`,
    landedResult.status === 0 &&
      /"outcome":"MATERIALIZED"/.test(landedResult.stdout) &&
      /cloud-landed\.txt/.test(landedResult.stdout) &&
      landedHead === landed.head &&
      staged === "cloud-landed.txt",
    `exit ${landedResult.status}: ${landedResult.stdout || landedResult.stderr}\nhead ${landedHead}, staged ${staged}`,
  )

  const locked = fixture("locked", { taskId: "task_e_c1" })
  const lockDirectory = join(locked.repo.path, ".git", "orbit-cloud", "materialize.lock")
  mkdirSync(lockDirectory, { recursive: true })
  writeFileSync(join(lockDirectory, "owner.json"), JSON.stringify({ pid: process.pid }))
  const lockedResult = invoke(locked, [task(locked.receipt.taskId, "ready", 1)])
  T(
    `${TOOL}: fleet-wide materialization lock refuses a concurrent apply`,
    lockedResult.status === 2 && /already running in process/.test(lockedResult.stderr),
    `exit ${lockedResult.status}: ${lockedResult.stderr}`,
  )

  const overridden = fixture("override", {
    taskId: "task_e_d22",
    abandoned: { at: "2026-08-31T18:00:00.000Z", lastObservedStatus: "pending" },
  })
  const overrideResult = invoke(overridden, [task(overridden.receipt.taskId, "ready", 1)], ["--allow-abandoned"])
  T(
    `${TOOL}: explicit abandoned override still applies only at the captured base`,
    overrideResult.status === 0 && /"outcome":"MATERIALIZED"/.test(overrideResult.stdout),
    `exit ${overrideResult.status}: ${overrideResult.stdout || overrideResult.stderr}`,
  )
}
