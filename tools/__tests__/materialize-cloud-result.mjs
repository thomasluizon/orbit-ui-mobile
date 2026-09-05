import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import {
  REPO_ROOT,
  T,
  realOrchestratorConfig,
  run,
  stage,
  stageRepo,
  stageWithConfig,
} from "./_harness.mjs"
import { cloudConfig, fakeCodex, task, taskPage } from "./cloud-worker.mjs"
import { receiptBlocksTicketAdmission } from "../lib/cloud-worker.mjs"

const TOOL = "materialize-cloud-result.mjs"

const fixture = (label, overrides = {}) => {
  const codex = fakeCodex(`materialize-${label}`)
  const config = cloudConfig(codex.command, {
    real: realOrchestratorConfig(),
    cloudCommandMinutes: overrides.cloudCommandMinutes,
    receiptLockSeconds: overrides.receiptLockSeconds,
  })
  const repo = stageRepo(`materialize-cloud-${label}`)
  config.repos = { ...config.repos, [config.cloud.repositoryKey]: repo.path }
  const staged = stageWithConfig(`materialize-cloud-${label}`, TOOL, config)
  writeFileSync(join(repo.path, ".gitignore"), readFileSync(join(REPO_ROOT, ".gitignore"), "utf8"))
  repo.git(["add", ".gitignore"])
  repo.git(["commit", "-q", "-m", "fixture ignore rules"])
  const head = repo.git(["rev-parse", "HEAD"]).stdout.trim()
  const id = overrides.taskId ?? `task_e_${label.replace(/[^a-f0-9]/g, "a")}1`
  const receipt = {
    taskId: id,
    environmentId: config.cloud.environmentId,
    repositoryKey: config.cloud.repositoryKey,
    ticket: "#398",
    branch: "main",
    baseSha: overrides.baseSha ?? head,
    worktree: repo.path,
    namedTargets: overrides.namedTargets ?? [],
    submittedAt: "2026-08-31T17:00:00.000Z",
    deadline: overrides.deadline ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...(overrides.abandoned ? { abandoned: overrides.abandoned } : {}),
    ...(overrides.terminal ? { terminal: overrides.terminal } : {}),
    ...(overrides.materialized ? { materialized: overrides.materialized } : {}),
    ...(overrides.firstReadyObservedAt ? { firstReadyObservedAt: overrides.firstReadyObservedAt } : {}),
  }
  const receiptPath = stage(`materialize-cloud/${label}.json`, `${JSON.stringify(receipt, null, 2)}\n`)
  const log = stage(`materialize-cloud/${label}-codex.jsonl`, "")
  return { ...staged, repo, head, receipt, receiptPath, log, config }
}

const invoke = (entry, tasks, extra = [], env = {}) => run(TOOL, ["--receipt", entry.receiptPath, ...extra], {
  path: entry.path,
  env: { ORBIT_FAKE_CODEX_LOG: entry.log, ORBIT_FAKE_LIST: taskPage(tasks), ...env },
})
const recoveryPathOf = (entry) => join(
  entry.repo.path,
  ".git",
  "orbit-cloud",
  `materialization-recovery-${entry.receipt.taskId}.json`,
)

export const cases = () => {
  const wrongRepository = fixture("wrong-repository", { taskId: "task_e_bad2" })
  const apiRepository = stageRepo("materialize-cloud-wrong-repository-api")
  const apiHead = apiRepository.git(["rev-parse", "HEAD"]).stdout.trim()
  writeFileSync(wrongRepository.receiptPath, `${JSON.stringify({
    ...wrongRepository.receipt,
    baseSha: apiHead,
    worktree: apiRepository.path,
  }, null, 2)}\n`)
  const wrongRepositoryResult = invoke(wrongRepository, [task(wrongRepository.receipt.taskId, "ready", 1)])
  T(
    `${TOOL}: revalidates receipt repository identity before any cloud command`,
    wrongRepositoryResult.status === 2 &&
      /does not belong to configured cloud repository ui/.test(wrongRepositoryResult.stderr) &&
      readFileSync(wrongRepository.log, "utf8") === "",
    `exit ${wrongRepositoryResult.status}: ${wrongRepositoryResult.stderr}`,
  )

  const dirty = fixture("dirty", { taskId: "task_e_d1" })
  writeFileSync(join(dirty.repo.path, "dirty.txt"), "local change\n")
  const dirtyResult = invoke(dirty, [task(dirty.receipt.taskId, "ready", 1)])
  T(
    `${TOOL}: refuses a dirty worktree before calling cloud apply or list`,
    dirtyResult.status === 2 && /worktree is dirty/.test(dirtyResult.stderr) && readFileSync(dirty.log, "utf8") === "",
    `exit ${dirtyResult.status}: ${dirtyResult.stderr}`,
  )

  const changedRecovery = fixture("changed-recovery", { taskId: "task_e_d2" })
  const changedRecoveryFile = join(changedRecovery.repo.path, "changed.txt")
  writeFileSync(changedRecoveryFile, "first landing\n")
  changedRecovery.repo.git(["add", "changed.txt"])
  const originalPatch = changedRecovery.repo.git(["diff", "--cached", "--binary", "--full-index"]).stdout
  const changedRecoveryPath = recoveryPathOf(changedRecovery)
  mkdirSync(dirname(changedRecoveryPath), { recursive: true })
  writeFileSync(changedRecoveryPath, JSON.stringify({
    taskId: changedRecovery.receipt.taskId,
    baseSha: changedRecovery.receipt.baseSha,
    worktree: changedRecovery.receipt.worktree,
    attemptedAt: new Date().toISOString(),
  }))
  writeFileSync(changedRecoveryFile, "different landing\n")
  changedRecovery.repo.git(["add", "changed.txt"])
  const changedRecoveryResult = invoke(
    changedRecovery,
    [task(changedRecovery.receipt.taskId, "ready", 1)],
    [],
    { ORBIT_FAKE_DIFF: originalPatch },
  )
  T(
    `${TOOL}: recovery compares the authoritative task diff with the exact staged patch`,
    changedRecoveryResult.status === 7 &&
      /"outcome":"RECOVERY_PATCH_MISMATCH"/.test(changedRecoveryResult.stdout) &&
      readFileSync(changedRecovery.log, "utf8").includes('"diff"'),
    `exit ${changedRecoveryResult.status}: ${changedRecoveryResult.stdout || changedRecoveryResult.stderr}`,
  )

  const unavailableRecovery = fixture("unavailable-recovery", { taskId: "task_e_d3" })
  writeFileSync(join(unavailableRecovery.repo.path, "cloud-landed.txt"), "landed from cloud\n")
  unavailableRecovery.repo.git(["add", "cloud-landed.txt"])
  const unavailableRecoveryPath = recoveryPathOf(unavailableRecovery)
  mkdirSync(dirname(unavailableRecoveryPath), { recursive: true })
  writeFileSync(unavailableRecoveryPath, JSON.stringify({
    taskId: unavailableRecovery.receipt.taskId,
    baseSha: unavailableRecovery.receipt.baseSha,
    worktree: unavailableRecovery.receipt.worktree,
    attemptedAt: new Date().toISOString(),
  }))
  const unavailableRecoveryResult = invoke(
    unavailableRecovery,
    [task(unavailableRecovery.receipt.taskId, "applied", 1)],
    [],
    { ORBIT_FAKE_DIFF_FAILURE: "No diff available\n" },
  )
  const unavailableRecoveryReceipt = JSON.parse(readFileSync(unavailableRecovery.receiptPath, "utf8"))
  T(
    `${TOOL}: recovery fails closed when the authoritative task diff cannot be read`,
    unavailableRecoveryResult.status === 7 &&
      /"outcome":"RECOVERY_DIFF_UNAVAILABLE"/.test(unavailableRecoveryResult.stdout) &&
      unavailableRecoveryReceipt.materialized === undefined &&
      existsSync(unavailableRecoveryPath),
    `exit ${unavailableRecoveryResult.status}: ${unavailableRecoveryResult.stdout || unavailableRecoveryResult.stderr}\n` +
      JSON.stringify(unavailableRecoveryReceipt),
  )

  const instrumented = fixture("instrumented", { taskId: "task_e_a12" })
  const codexCwdLog = stage("materialize-cloud/instrumented-cwd.log", "")
  const codexDiagnosticPath = join(instrumented.repo.path, "error.log")
  const instrumentedResult = invoke(instrumented, [task(instrumented.receipt.taskId, "ready", 1)], [], {
    ORBIT_FAKE_CODEX_CWD_LOG: codexCwdLog,
    ORBIT_FAKE_CODEX_WRITES_ERROR_LOG: "1",
  })
  const codexWorkingDirectories = readFileSync(codexCwdLog, "utf8").trim().split(/\r?\n/)
  T(
    `${TOOL}: removes a Codex diagnostic created by apply after running in the worktree`,
    instrumentedResult.status === 0 &&
      !existsSync(codexDiagnosticPath) &&
      codexWorkingDirectories.length === 2 &&
      codexWorkingDirectories[0] !== instrumented.repo.path &&
      codexWorkingDirectories[1] === instrumented.repo.path,
    `exit ${instrumentedResult.status}: ${instrumentedResult.stdout || instrumentedResult.stderr}\n` +
      `diagnostic exists ${existsSync(codexDiagnosticPath)}, Codex cwd ${JSON.stringify(codexWorkingDirectories)}`,
  )

  const existingDiagnostic = fixture("existing-diagnostic", { taskId: "task_e_a17" })
  const existingDiagnosticPath = join(existingDiagnostic.repo.path, "error.log")
  const existingDiagnosticContents = "diagnostic that predates materialization\n"
  writeFileSync(existingDiagnosticPath, existingDiagnosticContents)
  const existingDiagnosticResult = invoke(existingDiagnostic, [task(existingDiagnostic.receipt.taskId, "ready", 1)])
  T(
    `${TOOL}: preserves a Codex diagnostic that existed before apply`,
    existingDiagnosticResult.status === 0 &&
      existsSync(existingDiagnosticPath) &&
      readFileSync(existingDiagnosticPath, "utf8") === existingDiagnosticContents,
    `exit ${existingDiagnosticResult.status}: ${existingDiagnosticResult.stdout || existingDiagnosticResult.stderr}\n` +
      `diagnostic ${JSON.stringify(readFileSync(existingDiagnosticPath, "utf8"))}`,
  )

  const unexpectedUntracked = fixture("unexpected-untracked", { taskId: "task_e_a18" })
  const unexpectedUntrackedResult = invoke(
    unexpectedUntracked,
    [task(unexpectedUntracked.receipt.taskId, "ready", 1)],
    [],
    { ORBIT_FAKE_APPLY_UNTRACKED_PATH: "unexpected.tmp" },
  )
  T(
    `${TOOL}: still rejects an unrelated untracked file left by apply`,
    unexpectedUntrackedResult.status === 7 &&
      /"outcome":"APPLY_INVALID_SHAPE"/.test(unexpectedUntrackedResult.stdout) &&
      /\?\? unexpected\.tmp/.test(unexpectedUntrackedResult.stdout),
    `exit ${unexpectedUntrackedResult.status}: ${unexpectedUntrackedResult.stdout || unexpectedUntrackedResult.stderr}`,
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
    deadline: "2026-08-31T17:59:00.000Z",
    abandoned: { at: "2026-08-31T18:00:00.000Z", lastObservedStatus: "pending" },
  })
  const abandonedResult = invoke(abandoned, [task(abandoned.receipt.taskId, "ready", 2)])
  const abandonedReceipt = JSON.parse(readFileSync(abandoned.receiptPath, "utf8"))
  T(
    `${TOOL}: refuses an abandoned task and records a late terminal result`,
    abandonedResult.status === 5 && /"outcome":"ABANDONED"/.test(abandonedResult.stdout) && abandonedReceipt.lateTerminal?.status === "ready",
    `exit ${abandonedResult.status}: ${abandonedResult.stdout || abandonedResult.stderr}\n${JSON.stringify(abandonedReceipt)}`,
  )

  const staleMirror = fixture("stale-mirror", {
    taskId: "task_e_ab2",
    deadline: "2026-08-31T18:00:00.000Z",
    abandoned: { at: "2026-08-31T18:00:00.000Z", lastObservedStatus: "pending" },
    terminal: { at: "2026-08-31T18:01:00.000Z", observedAt: "2026-08-31T18:01:00.000Z", status: "ready" },
    firstReadyObservedAt: "2026-08-31T18:01:00.000Z",
  })
  const staleMirrorDirectory = join(staleMirror.repo.path, ".git", "orbit-cloud", "receipts")
  const staleMirrorPath = join(staleMirrorDirectory, `${staleMirror.receipt.taskId}.json`)
  mkdirSync(staleMirrorDirectory, { recursive: true })
  writeFileSync(staleMirrorPath, `${JSON.stringify({
    ...staleMirror.receipt,
    abandoned: undefined,
    terminal: undefined,
  }, null, 2)}\n`)
  const staleMirrorResult = invoke(staleMirror, [task(staleMirror.receipt.taskId, "ready", 2)])
  const healedScratch = JSON.parse(readFileSync(staleMirror.receiptPath, "utf8"))
  const healedMirror = JSON.parse(readFileSync(staleMirrorPath, "utf8"))
  T(
    `${TOOL}: a stale mirror cannot replace newer abandoned and terminal scratch state`,
    staleMirrorResult.status === 5 &&
      healedScratch.abandoned?.at === staleMirror.receipt.abandoned.at &&
      healedMirror.abandoned?.at === staleMirror.receipt.abandoned.at &&
      healedScratch.terminal?.at === staleMirror.receipt.terminal.at &&
      healedMirror.terminal?.at === staleMirror.receipt.terminal.at,
    `exit ${staleMirrorResult.status}: ${staleMirrorResult.stdout || staleMirrorResult.stderr}\n` +
      `scratch ${JSON.stringify(healedScratch)}\nmirror ${JSON.stringify(healedMirror)}`,
  )

  const alreadyMaterialized = fixture("already-materialized", {
    taskId: "task_e_ab3",
    materialized: { at: "2026-08-31T18:02:00.000Z", status: "M  landed.txt\n", stagedStat: "1 file changed\n" },
  })
  const materializedMirrorDirectory = join(alreadyMaterialized.repo.path, ".git", "orbit-cloud", "receipts")
  const materializedMirrorPath = join(materializedMirrorDirectory, `${alreadyMaterialized.receipt.taskId}.json`)
  const alreadyMaterializedRecoveryPath = recoveryPathOf(alreadyMaterialized)
  mkdirSync(materializedMirrorDirectory, { recursive: true })
  writeFileSync(materializedMirrorPath, `${JSON.stringify({
    ...alreadyMaterialized.receipt,
    materialized: undefined,
  }, null, 2)}\n`)
  writeFileSync(alreadyMaterializedRecoveryPath, `${JSON.stringify({
    taskId: alreadyMaterialized.receipt.taskId,
    baseSha: alreadyMaterialized.receipt.baseSha,
    worktree: alreadyMaterialized.receipt.worktree,
    attemptedAt: "2026-08-31T18:01:00.000Z",
  })}\n`)
  const alreadyMaterializedResult = invoke(alreadyMaterialized, [task(alreadyMaterialized.receipt.taskId, "ready", 1)])
  const healedMaterializedMirror = JSON.parse(readFileSync(materializedMirrorPath, "utf8"))
  T(
    `${TOOL}: recovered materialized state is idempotent success and prevents a second apply`,
    alreadyMaterializedResult.status === 0 &&
      /"outcome":"MATERIALIZED"/.test(alreadyMaterializedResult.stdout) &&
      /"alreadyMaterialized":true/.test(alreadyMaterializedResult.stdout) &&
      healedMaterializedMirror.materialized?.at === alreadyMaterialized.receipt.materialized.at &&
      !existsSync(alreadyMaterializedRecoveryPath) &&
      readFileSync(alreadyMaterialized.log, "utf8") === "",
    `exit ${alreadyMaterializedResult.status}: ${alreadyMaterializedResult.stdout || alreadyMaterializedResult.stderr}\n` +
      `mirror ${JSON.stringify(healedMaterializedMirror)}`,
  )

  const empty = fixture("empty", { taskId: "task_e_e1" })
  const emptyResult = invoke(empty, [task(empty.receipt.taskId, "ready", 0)])
  T(
    `${TOOL}: ready with zero list statistics still attempts authoritative cloud apply`,
    emptyResult.status === 0 &&
      /"outcome":"MATERIALIZED"/.test(emptyResult.stdout) &&
      readFileSync(empty.log, "utf8").includes('"apply"'),
    `exit ${emptyResult.status}: ${emptyResult.stdout || emptyResult.stderr}`,
  )

  for (const [status, outcome, message] of [
    ["error", "CLOUD_TASK_ERROR", "failed; no diff will exist"],
    ["applied", "CLOUD_TASK_APPLIED", "already applied elsewhere; it will not be applied again"],
  ]) {
    const terminal = fixture(`terminal-${status}`, { taskId: status === "error" ? "task_e_e2" : "task_e_a22" })
    const terminalResult = invoke(terminal, [task(terminal.receipt.taskId, status, status === "applied" ? 1 : 0)])
    const terminalInvocations = readFileSync(terminal.log, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
    const terminalReceipt = JSON.parse(readFileSync(terminal.receiptPath, "utf8"))
    T(
      `${TOOL}: ${status} is a distinct terminal outcome and never runs cloud apply`,
      terminalResult.status === 3 &&
        terminalResult.stdout.includes(`"outcome":"${outcome}"`) &&
        terminalResult.stdout.includes(message) &&
        terminalReceipt.terminal?.status === status &&
        terminalReceipt.unusable?.status === status &&
        terminalReceipt.materialized === undefined &&
        !receiptBlocksTicketAdmission(terminalReceipt) &&
        !terminalInvocations.some((args) => args[0] === "cloud" && args[1] === "apply"),
      `exit ${terminalResult.status}: ${terminalResult.stdout || terminalResult.stderr}\n` +
        `${JSON.stringify(terminalInvocations)}\n${JSON.stringify(terminalReceipt)}`,
    )
  }

  const expired = fixture("expired", {
    taskId: "task_e_f1",
    deadline: "2026-08-31T17:01:00.000Z",
  })
  const expiredResult = invoke(expired, [task(expired.receipt.taskId, "pending", 0)])
  const expiredReceipt = JSON.parse(readFileSync(expired.receiptPath, "utf8"))
  T(
    `${TOOL}: a past-deadline pending task is quarantined locally but retains remote ownership`,
    expiredResult.status === 5 &&
      expiredReceipt.abandoned?.lastObservedStatus === "pending" &&
      receiptBlocksTicketAdmission(expiredReceipt),
    `exit ${expiredResult.status}: ${expiredResult.stdout || expiredResult.stderr}\n${JSON.stringify(expiredReceipt)}`,
  )

  const firstSeenOnTime = fixture("first-seen-on-time", {
    taskId: "task_e_f2",
    deadline: "2026-08-31T17:01:00.000Z",
    firstReadyObservedAt: "2026-08-31T17:00:00.000Z",
  })
  const firstSeenOnTimeResult = invoke(
    firstSeenOnTime,
    [task(firstSeenOnTime.receipt.taskId, "ready", 1, "2026-08-31T19:00:00.000Z")],
  )
  const firstSeenOnTimeReceipt = JSON.parse(readFileSync(firstSeenOnTime.receiptPath, "utf8"))
  T(
    `${TOOL}: a recorded on-time ready observation remains eligible when refreshed later`,
    firstSeenOnTimeResult.status === 0 &&
      /"outcome":"MATERIALIZED"/.test(firstSeenOnTimeResult.stdout) &&
      firstSeenOnTimeReceipt.abandoned === undefined &&
      firstSeenOnTimeReceipt.terminal?.at === "2026-08-31T17:00:00.000Z",
    `exit ${firstSeenOnTimeResult.status}: ${firstSeenOnTimeResult.stdout || firstSeenOnTimeResult.stderr}\n${JSON.stringify(firstSeenOnTimeReceipt)}`,
  )

  const firstSeenLate = fixture("first-seen-late", {
    taskId: "task_e_f3",
    deadline: "2020-08-31T17:01:00.000Z",
  })
  const firstSeenLateResult = invoke(
    firstSeenLate,
    [task(firstSeenLate.receipt.taskId, "ready", 1, "2020-08-31T17:00:00.000Z")],
  )
  const firstSeenLateReceipt = JSON.parse(readFileSync(firstSeenLate.receiptPath, "utf8"))
  T(
    `${TOOL}: a first ready observation after the deadline is quarantined without apply`,
    firstSeenLateResult.status === 5 &&
      firstSeenLateReceipt.abandoned?.lastObservedStatus === "ready" &&
      Date.parse(firstSeenLateReceipt.lateTerminal?.at) > Date.parse(firstSeenLate.receipt.deadline) &&
      !readFileSync(firstSeenLate.log, "utf8").includes('"apply"'),
    `exit ${firstSeenLateResult.status}: ${firstSeenLateResult.stdout || firstSeenLateResult.stderr}\n${JSON.stringify(firstSeenLateReceipt)}`,
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

  const largeLanding = fixture("large-landing", { taskId: "task_e_a12f" })
  const largeLandingResult = invoke(
    largeLanding,
    [task(largeLanding.receipt.taskId, "ready", 1)],
    [],
    { ORBIT_FAKE_APPLY_MODE: "large" },
  )
  const largeLandingReceipt = JSON.parse(readFileSync(largeLanding.receiptPath, "utf8"))
  T(
    `${TOOL}: a staged landing larger than the default spawn buffer verifies and materializes`,
    largeLandingResult.status === 0 &&
      /"outcome":"MATERIALIZED"/.test(largeLandingResult.stdout) &&
      largeLandingReceipt.materialized?.status.includes("cloud-landed.txt") &&
      largeLanding.repo.git(["diff", "--cached", "--numstat"]).stdout.startsWith("1\t0\tcloud-landed.txt"),
    `exit ${largeLandingResult.status}: ${largeLandingResult.stdout || largeLandingResult.stderr}\n` +
      JSON.stringify(largeLandingReceipt),
  )

  const noOp = fixture("no-op", { taskId: "task_e_a13", namedTargets: ["DESIGN.md"] })
  const noOpResult = invoke(noOp, [task(noOp.receipt.taskId, "ready", 1)], [], { ORBIT_FAKE_APPLY_MODE: "noop" })
  const noOpReceipt = JSON.parse(readFileSync(noOp.receiptPath, "utf8"))
  const noOpRetry = invoke(noOp, [task(noOp.receipt.taskId, "ready", 1)])
  const noOpInvocations = readFileSync(noOp.log, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
  T(
    `${TOOL}: an empty diff retains a named failure and ticket ownership across repeated calls`,
    noOpResult.status === 3 &&
      /"outcome":"CLOUD_TASK_EMPTY"/.test(noOpResult.stdout) &&
      noOpReceipt.materialized === undefined &&
      noOpReceipt.unusable === undefined &&
      noOpReceipt.emptyFailure?.classification === "lost-work suspect" &&
      noOpReceipt.emptyFailure?.title === "measured task" &&
      noOpReceipt.emptyFailure?.summary.files_changed === 1 &&
      noOpReceipt.emptyFailure?.namedTargets[0] === "DESIGN.md" &&
      receiptBlocksTicketAdmission(noOpReceipt) &&
      noOpRetry.status === 3 &&
      /"outcome":"CLOUD_TASK_EMPTY"/.test(noOpRetry.stdout) &&
      /"retry":"required"/.test(noOpRetry.stdout) &&
      noOpInvocations.filter((args) => args[1] === "apply").length === 1,
    `exit ${noOpResult.status}: ${noOpResult.stdout || noOpResult.stderr}\n` +
      `retry ${noOpRetry.status}: ${noOpRetry.stdout || noOpRetry.stderr}\n` +
      `${JSON.stringify(noOpInvocations)}\n${JSON.stringify(noOpReceipt)}`,
  )

  const failedEmpty = fixture("failed-empty", { taskId: "task_e_a13e" })
  const failedEmptyResult = invoke(
    failedEmpty,
    [task(failedEmpty.receipt.taskId, "ready", 0)],
    [],
    { ORBIT_FAKE_APPLY_MODE: "fail-noop" },
  )
  const failedEmptyReceipt = JSON.parse(readFileSync(failedEmpty.receiptPath, "utf8"))
  const failedEmptyInvocations = readFileSync(failedEmpty.log, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
  T(
    `${TOOL}: a failed empty apply with no named targets remains unfinished with unknown cause`,
    failedEmptyResult.status === 3 &&
      /"outcome":"CLOUD_TASK_EMPTY"/.test(failedEmptyResult.stdout) &&
      failedEmptyReceipt.emptyFailure?.classification === "cause unknown" &&
      receiptBlocksTicketAdmission(failedEmptyReceipt) &&
      failedEmptyInvocations.filter((args) => args[1] === "apply").length === 1 &&
      failedEmptyInvocations.filter((args) => args[1] === "diff").length === 1,
    `exit ${failedEmptyResult.status}: ${failedEmptyResult.stdout || failedEmptyResult.stderr}\n` +
      `${JSON.stringify(failedEmptyInvocations)}\n${JSON.stringify(failedEmptyReceipt)}`,
  )

  const partialFailure = fixture("partial-failure", { taskId: "task_e_a13f" })
  const partialFailureResult = invoke(
    partialFailure,
    [task(partialFailure.receipt.taskId, "ready", 1)],
    [],
    { ORBIT_FAKE_APPLY_MODE: "partial-fail" },
  )
  const partialRecoveryPath = recoveryPathOf(partialFailure)
  const partialRetryResult = invoke(partialFailure, [task(partialFailure.receipt.taskId, "ready", 1)])
  const partialInvocations = readFileSync(partialFailure.log, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
  T(
    `${TOOL}: a failed apply clears its marker and a staged partial diff is never recovered`,
    partialFailureResult.status === 1 &&
      /"outcome":"APPLY_FAILED"/.test(partialFailureResult.stdout) &&
      !existsSync(partialRecoveryPath) &&
      partialRetryResult.status === 2 &&
      /worktree is dirty/.test(partialRetryResult.stderr) &&
      partialInvocations.filter((args) => args[0] === "cloud" && args[1] === "apply").length === 1,
    `failed ${partialFailureResult.status}: ${partialFailureResult.stdout || partialFailureResult.stderr}\n` +
      `retry ${partialRetryResult.status}: ${partialRetryResult.stdout || partialRetryResult.stderr}\n` +
      JSON.stringify(partialInvocations),
  )

  const movedHead = fixture("moved-head", { taskId: "task_e_a14" })
  const movedHeadResult = invoke(
    movedHead,
    [task(movedHead.receipt.taskId, "ready", 1)],
    [],
    { ORBIT_FAKE_APPLY_MODE: "move-head" },
  )
  const movedHeadReceipt = JSON.parse(readFileSync(movedHead.receiptPath, "utf8"))
  const movedHeadValue = movedHead.repo.git(["rev-parse", "HEAD"]).stdout.trim()
  T(
    `${TOOL}: an apply that moves HEAD cannot record materialization`,
    movedHeadResult.status === 7 &&
      /"outcome":"APPLY_MOVED_HEAD"/.test(movedHeadResult.stdout) &&
      movedHeadValue !== movedHead.head &&
      movedHeadReceipt.materialized === undefined,
    `exit ${movedHeadResult.status}: ${movedHeadResult.stdout || movedHeadResult.stderr}\n${JSON.stringify(movedHeadReceipt)}`,
  )

  // Windows process startup can exceed 300ms under load before the deliberate hang is reached.
  const listTimeout = fixture("list-timeout", { taskId: "task_e_a15", cloudCommandMinutes: 0.05 })
  const listTimeoutResult = invoke(
    listTimeout,
    [task(listTimeout.receipt.taskId, "ready", 1)],
    [],
    { ORBIT_FAKE_HANG: "list" },
  )
  T(
    `${TOOL}: a polling timeout is a distinct recoverable failure`,
    listTimeoutResult.status === 6 && /codex cloud list timed out/.test(listTimeoutResult.stderr),
    `exit ${listTimeoutResult.status}: ${listTimeoutResult.stdout || listTimeoutResult.stderr}`,
  )

  const applyTimeout = fixture("apply-timeout", { taskId: "task_e_a16", cloudCommandMinutes: 0.05 })
  const applyTimeoutResult = invoke(
    applyTimeout,
    [task(applyTimeout.receipt.taskId, "ready", 1)],
    [],
    { ORBIT_FAKE_HANG_AFTER_APPLY: "apply" },
  )
  const applyTimeoutReceipt = JSON.parse(readFileSync(applyTimeout.receiptPath, "utf8"))
  const applyTimeoutRecoveryPath = recoveryPathOf(applyTimeout)
  const applyTimeoutRecovery = JSON.parse(readFileSync(applyTimeoutRecoveryPath, "utf8"))
  const stagedAfterApplyTimeout = applyTimeout.repo.git(["diff", "--cached", "--name-only"]).stdout.trim()
  T(
    `${TOOL}: a timed out apply that staged its diff leaves durable attempted recovery evidence`,
    applyTimeoutResult.status === 6 &&
      /"outcome":"APPLY_TIMEOUT"/.test(applyTimeoutResult.stdout) &&
      applyTimeoutReceipt.materialized === undefined &&
      applyTimeoutRecovery.attemptedAt &&
      applyTimeoutRecovery.stagedDiffSha256 === undefined &&
      stagedAfterApplyTimeout === "cloud-landed.txt",
    `exit ${applyTimeoutResult.status}: ${applyTimeoutResult.stdout || applyTimeoutResult.stderr}\n` +
      `recovery ${JSON.stringify(applyTimeoutRecovery)}; staged ${stagedAfterApplyTimeout}`,
  )
  const recoveredApplyTimeoutResult = invoke(
    applyTimeout,
    [task(applyTimeout.receipt.taskId, "applied", 1)],
    [],
    { ORBIT_FAKE_DIFF: applyTimeout.repo.git(["diff", "--cached", "--binary", "--full-index"]).stdout },
  )
  const recoveredApplyTimeoutReceipt = JSON.parse(readFileSync(applyTimeout.receiptPath, "utf8"))
  const applyTimeoutInvocations = readFileSync(applyTimeout.log, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
  T(
    `${TOOL}: a staged timeout landing is authenticated from the task diff and recovered`,
    recoveredApplyTimeoutResult.status === 0 &&
      /"outcome":"MATERIALIZED"/.test(recoveredApplyTimeoutResult.stdout) &&
      /"recovered":true/.test(recoveredApplyTimeoutResult.stdout) &&
      recoveredApplyTimeoutReceipt.materialized?.status.includes("cloud-landed.txt") &&
      !existsSync(applyTimeoutRecoveryPath) &&
      applyTimeoutInvocations.filter((args) => args[0] === "cloud" && args[1] === "apply").length === 1,
    `exit ${recoveredApplyTimeoutResult.status}: ${recoveredApplyTimeoutResult.stdout || recoveredApplyTimeoutResult.stderr}\n` +
      `${JSON.stringify(applyTimeoutInvocations)}\n${JSON.stringify(recoveredApplyTimeoutReceipt)}`,
  )

  const receiptTimeout = fixture("receipt-timeout", {
    taskId: "task_e_a19",
    receiptLockSeconds: 0.01,
  })
  const receiptLockDirectory = join(
    receiptTimeout.repo.path,
    ".git",
    "orbit-cloud",
    `receipt-${receiptTimeout.receipt.taskId}.json.lock`,
  )
  const receiptTimeoutResult = invoke(
    receiptTimeout,
    [task(receiptTimeout.receipt.taskId, "ready", 1)],
    [],
    {
      ORBIT_FAKE_APPLY_RECEIPT_LOCK_PATH: receiptLockDirectory,
      ORBIT_FAKE_RECEIPT_LOCK_OWNER_PID: String(process.pid),
    },
  )
  const receiptAfterTimeout = JSON.parse(readFileSync(receiptTimeout.receiptPath, "utf8"))
  const receiptTimeoutOutput = JSON.parse(receiptTimeoutResult.stdout)
  const stagedAfterTimeout = receiptTimeout.repo.git(["diff", "--cached", "--name-only"]).stdout.trim()
  T(
    `${TOOL}: a receipt lock timeout after apply reports the staged diff and exact recovery command`,
    receiptTimeoutResult.status === 9 &&
      receiptTimeoutOutput.outcome === "APPLIED_RECEIPT_WRITE_FAILED" &&
      /cloud diff is applied and staged/.test(receiptTimeoutOutput.message) &&
      /only the receipt write failed/.test(receiptTimeoutOutput.message) &&
      receiptTimeoutOutput.message.includes(`--receipt ${JSON.stringify(receiptTimeout.receiptPath)}`) &&
      stagedAfterTimeout === "cloud-landed.txt" &&
      receiptAfterTimeout.materialized === undefined,
    `exit ${receiptTimeoutResult.status}: ${receiptTimeoutResult.stdout || receiptTimeoutResult.stderr}\n` +
      `staged ${stagedAfterTimeout}; receipt ${JSON.stringify(receiptAfterTimeout)}`,
  )
  rmSync(receiptLockDirectory, { recursive: true })
  const recoveredResult = invoke(
    receiptTimeout,
    [task(receiptTimeout.receipt.taskId, "applied", 1)],
    [],
    { ORBIT_FAKE_DIFF: receiptTimeout.repo.git(["diff", "--cached", "--binary", "--full-index"]).stdout },
  )
  const recoveredReceipt = JSON.parse(readFileSync(receiptTimeout.receiptPath, "utf8"))
  const receiptTimeoutInvocations = readFileSync(receiptTimeout.log, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
  T(
    `${TOOL}: retry records the verified staged landing even after the remote status becomes applied`,
    recoveredResult.status === 0 &&
      /"outcome":"MATERIALIZED"/.test(recoveredResult.stdout) &&
      /"recovered":true/.test(recoveredResult.stdout) &&
      recoveredReceipt.materialized?.status.includes("cloud-landed.txt") &&
      receiptTimeoutInvocations.filter((args) => args[0] === "cloud" && args[1] === "apply").length === 1,
    `exit ${recoveredResult.status}: ${recoveredResult.stdout || recoveredResult.stderr}\n` +
      `${JSON.stringify(receiptTimeoutInvocations)}\n${JSON.stringify(recoveredReceipt)}`,
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
