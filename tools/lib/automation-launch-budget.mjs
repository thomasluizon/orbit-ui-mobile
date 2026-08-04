import { spawnSyncHidden as spawnSync } from "./subprocess-options.mjs"
import { randomUUID } from "node:crypto"
import { unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { scrubReviewAuthorityEnvironment } from "./child-environment.mjs"

export class AutomationLaunchBudgetError extends Error {
  constructor(message, exitCode = 3) {
    super(message)
    this.name = "AutomationLaunchBudgetError"
    this.exitCode = exitCode
  }
}

const failure = (message, exitCode = 3) => {
  throw new AutomationLaunchBudgetError(message, exitCode)
}

const parseClaudeResetAt = (resetsIn) => {
  if (typeof resetsIn !== "string") {
    failure("ai-quota returned no Claude weekly reset duration; refusing to launch unattended automation")
  }
  const match = resetsIn.match(/^(?:(\d+)d(?: (\d+)h)?(?: (\d+)m)?|(\d+)h(?: (\d+)m)?|(\d+)m)$/)
  if (!match) {
    failure(`ai-quota returned unsupported Claude reset duration "${resetsIn}"; expected compact d/h/m units such as "6d 4h"`)
  }
  const days = Number(match[1] ?? 0)
  const hours = Number(match[2] ?? match[4] ?? 0)
  const minutes = Number(match[3] ?? match[5] ?? match[6] ?? 0)
  const durationMilliseconds = ((days * 24 + hours) * 60 + minutes) * 60 * 1000
  if (!Number.isSafeInteger(durationMilliseconds) || durationMilliseconds <= 0) {
    failure(`ai-quota returned invalid Claude reset duration "${resetsIn}"; refusing to launch unattended automation`)
  }
  return new Date(Date.now() + durationMilliseconds).toISOString()
}

const parseCodexResetAt = (resetsAt) => {
  const milliseconds = typeof resetsAt === "number" ? resetsAt * 1000 : Date.parse(resetsAt)
  if (!Number.isFinite(milliseconds) || milliseconds <= Date.now()) {
    failure(`ai-quota returned invalid Codex reset timestamp "${resetsAt}"; refusing to launch unattended automation`)
  }
  return new Date(milliseconds).toISOString()
}

const runNodeTool = (toolPath, argumentsList) => spawnSync(process.execPath, [toolPath, ...argumentsList], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
  env: scrubReviewAuthorityEnvironment(),
})

const commandFailure = (label, result) => {
  if (result.error) return `${label} could not start: ${result.error.message}`
  return (result.stderr || result.stdout || `${label} failed`).trim()
}

export const reserveAutomationBudget = ({
  engineName,
  identity,
  tier,
  startedAt,
  warningTokens,
  tokenBudget,
  accountCeilingPercent,
  projectedTokens,
  ledgerPath,
  quotaToolPath,
  budgetToolPath,
}) => {
  const quotaResult = runNodeTool(quotaToolPath, ["--json"])
  if (quotaResult.error) failure(`ai-quota could not start: ${quotaResult.error.message}`)
  let quota
  try {
    quota = JSON.parse(quotaResult.stdout)
  } catch {
    failure(`ai-quota returned unparseable output: ${(quotaResult.stdout || quotaResult.stderr || "").slice(0, 400)}`)
  }

  const quotaSnapshotPath = join(tmpdir(), `orbit-launch-quota-${process.pid}-${randomUUID()}.json`)
  try {
    writeFileSync(quotaSnapshotPath, quotaResult.stdout, "utf8")
  } catch (error) {
    failure(`could not write the quota snapshot ${quotaSnapshotPath}: ${error.message}`)
  }

  const selectedQuota = quota?.[engineName]
  const accountObservedAt = new Date().toISOString()
  const readingAvailable = selectedQuota?.status === "OK"
  const accountUsedPercent = readingAvailable
    ? (engineName === "claude" ? selectedQuota.weeklyPercent : selectedQuota.usedPercent)
    : null
  const resetAt = readingAvailable
    ? (engineName === "claude" ? parseClaudeResetAt(selectedQuota.resetsIn) : parseCodexResetAt(selectedQuota.resetsAt))
    : accountObservedAt
  if (!readingAvailable) {
    console.error(`ai-quota reports ${engineName} UNAVAILABLE, so automation-budget gates this launch on the token budget over the trailing seven days instead of the provider reading`)
  }

  const argumentsList = [
    "reserve",
    "--engine", engineName,
    "--identity", identity,
    "--tier", tier,
    "--started-at", startedAt,
    "--ended-at", accountObservedAt,
    "--reset-at", resetAt,
    "--account-ceiling-percent", String(accountCeilingPercent),
    "--warning-tokens", String(warningTokens),
    "--budget-tokens", String(tokenBudget),
    "--invocation-tokens", String(projectedTokens),
    "--quota", quotaSnapshotPath,
    "--ledger", ledgerPath,
  ]
  if (Number.isFinite(accountUsedPercent)) {
    argumentsList.push("--account-used-percent", String(accountUsedPercent), "--account-observed-at", accountObservedAt)
  }
  argumentsList.push("--json")

  try {
    const budgetResult = runNodeTool(budgetToolPath, argumentsList)
    if (budgetResult.status !== 0) {
      failure(commandFailure("automation-budget", budgetResult), budgetResult.status === 4 ? 4 : 3)
    }
    if (budgetResult.stderr) process.stderr.write(budgetResult.stderr)
  } finally {
    try {
      unlinkSync(quotaSnapshotPath)
    } catch (error) {
      if (error.code !== "ENOENT") console.error(`could not remove quota snapshot ${quotaSnapshotPath}: ${error.message}`)
    }
  }
  return { identity, engineName, tier, startedAt, ledgerPath, budgetToolPath }
}

export const claimBudgetReservation = (reservation, projectedTokens, workerPid) => {
  const result = runNodeTool(reservation.budgetToolPath, [
    "claim",
    "--identity", reservation.identity,
    "--engine", reservation.engineName,
    "--tier", reservation.tier,
    "--started-at", reservation.startedAt,
    "--ended-at", new Date().toISOString(),
    "--invocation-tokens", String(projectedTokens),
    "--worker-pid", String(workerPid),
    "--ledger", reservation.ledgerPath,
  ])
  if (!result.error && result.status === 0) return true
  console.error(`automation-budget claim failed, the reservation keeps its timestamp lease: ${commandFailure("automation-budget claim", result)}`)
  return false
}

export const cancelBudgetReservation = (reservation) => {
  const result = runNodeTool(reservation.budgetToolPath, [
    "cancel",
    "--identity", reservation.identity,
    "--engine", reservation.engineName,
    "--tier", reservation.tier,
    "--started-at", reservation.startedAt,
    "--ended-at", new Date().toISOString(),
    "--ledger", reservation.ledgerPath,
    "--json",
  ])
  if (!result.error && result.status === 0) return true
  console.error(`automation-budget cancellation failed: ${commandFailure("automation-budget cancellation", result)}`)
  return false
}

export const recordAutomationBudget = (reservation, usage) => {
  const result = runNodeTool(reservation.budgetToolPath, [
    "record",
    "--identity", reservation.identity,
    "--engine", reservation.engineName,
    "--tier", reservation.tier,
    "--started-at", reservation.startedAt,
    "--ended-at", new Date().toISOString(),
    "--input-tokens", String(usage.inputTokens),
    "--cached-input-tokens", String(usage.cachedInputTokens),
    "--output-tokens", String(usage.outputTokens),
    "--ledger", reservation.ledgerPath,
    "--json",
  ])
  if (!result.error && result.status === 0) return true
  console.error(`automation-budget record failed: ${commandFailure("automation-budget record", result)}`)
  return false
}
