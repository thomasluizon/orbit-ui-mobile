#!/usr/bin/env node
// Adapter for the unattended-run wake-source invariant. The reusable core is checkSleepStop in
// _lib/rules-sleep.mjs. Wired to Stop, the only event that can see a turn ending.
// Exits 0 (allow the stop) or 2 + stderr (block it, and the message reaches the session).
// Any error exits 0, so a hook fault can never trap a session that wants to stop.
//
// The run record and the wake sources are read through tools/lib/run-state.mjs rather than
// re-derived here: launch-worker.mjs writes them with that same module, and two definitions of
// where the files live is how one of them silently stops finding the other.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { githubEnvironment, repositorySlug } from "../../tools/lib/github-auth.mjs"
import { runBounded } from "../../tools/lib/bounded-process.mjs"
import { readOrchestratorConfig } from "../../tools/lib/orchestrator-config.mjs"
import { readinessCiIsGreen, readinessReceiptMatchesLive, readinessReport } from "../../tools/lib/readiness-receipt.mjs"
import { readRunState, readWakeSources } from "../../tools/lib/run-state.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { checkSleepStop } from "./_lib/rules-sleep.mjs"

const LIST_BOT_THREADS = fileURLToPath(new URL("../../tools/list-bot-threads.mjs", import.meta.url))

/** Signal 0 tests for existence without delivering anything. EPERM means it exists and is not ours. */
const isAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === "EPERM"
  }
}

const liveReceiptVerdict = async (entry, config) => {
  try {
    const receipt = JSON.parse(readFileSync(entry.receiptPath, "utf8"))
    if (readinessReport(receipt).verdict !== "READY") return null
    const repoRoot = config.repos?.[entry.repositoryKey]
    if (typeof repoRoot !== "string" || typeof receipt?.issue !== "string") return null
    const repository = repositorySlug(repoRoot)
    const githubAuth = await githubEnvironment(repoRoot, { timeoutMs: 45000 })
    const viewed = await runBounded(
      process.env.GH_BIN || "gh",
      ["pr", "view", String(entry.prNumber), "--repo", repository, "--json", "number,baseRefName,baseRefOid,headRefOid,isDraft,statusCheckRollup"],
      { cwd: repoRoot, env: githubAuth.environment, timeoutMs: 45000 },
    )
    if (viewed.timedOut || viewed.error || viewed.status !== 0) return null
    const pr = JSON.parse(viewed.stdout)
    if (pr?.number !== entry.prNumber || typeof pr?.baseRefName !== "string" || typeof pr?.baseRefOid !== "string" || typeof pr?.headRefOid !== "string" || typeof pr?.isDraft !== "boolean" || !Array.isArray(pr?.statusCheckRollup)) return null

    const requiredRead = await runBounded(
      process.env.GH_BIN || "gh",
      ["api", `repos/${repository}/branches/${encodeURIComponent(pr.baseRefName)}/protection/required_status_checks`],
      { cwd: repoRoot, env: githubAuth.environment, timeoutMs: 45000 },
    )
    if (requiredRead.timedOut || requiredRead.error || requiredRead.status !== 0) return null
    const requiredContexts = JSON.parse(requiredRead.stdout)?.contexts

    const botRead = await runBounded(
      process.execPath,
      [LIST_BOT_THREADS, "--pr", String(entry.prNumber), "--repo", entry.repositoryKey, "--wait-seconds", "0", "--poll-seconds", "1", "--command-timeout-seconds", "45", "--no-request"],
      { cwd: repoRoot, env: githubAuth.environment, timeoutMs: 60000 },
    )
    if (botRead.timedOut || botRead.error || botRead.status !== 0) return null
    const bot = JSON.parse(botRead.stdout)

    const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
    const linearRead = await runBounded(ORCA, ["linear", "issue", receipt.issue, "--full", "--json"], { timeoutMs: 45000, maxBuffer: 16 * 1024 * 1024 })
    if (linearRead.timedOut || linearRead.error || linearRead.status !== 0) return null
    const linear = JSON.parse(linearRead.stdout)?.result?.issue
    if (typeof linear?.state?.name !== "string" || !Array.isArray(linear?.labels) || linear.labels.some((label) => typeof label?.name !== "string")) return null

    const live = {
      repositoryKey: entry.repositoryKey,
      prNumber: pr.number,
      baseSha: pr.baseRefOid,
      headSha: pr.headRefOid,
      draft: pr.isDraft,
      linearIssue: receipt.issue,
      linearStatus: linear.state.name,
      ciGreen: readinessCiIsGreen(pr.statusCheckRollup, requiredContexts),
      connectorPassed: bot?.verdict === "REVIEWED" && bot?.reviewedCommit === pr.headRefOid && bot?.baseRefOid === pr.baseRefOid,
      threadsComplete: bot?.threadsComplete === true,
      unresolvedThreads: bot?.counts?.unresolved,
    }
    return readinessReceiptMatchesLive(receipt, entry, live) ? "READY" : null
  } catch {
    return null
  }
}

try {
  const input = readStdinJson()
  const state = readRunState()
  const identities = [
    ...(Array.isArray(state?.pullRequests) ? state.pullRequests : []),
    ...(Array.isArray(state?.readinessLedger) ? state.readinessLedger : []),
  ]
  const unique = [...new Map(identities.filter((entry) => typeof entry?.repositoryKey === "string" && Number.isInteger(entry?.prNumber) && typeof entry?.receiptPath === "string").map((entry) => [`${entry.repositoryKey}#${entry.prNumber}`, entry])).values()]
  const liveVerdicts = new Map()
  if (unique.length > 0) {
    let config = null
    try {
      config = readOrchestratorConfig()
    } catch {
      config = null
    }
    if (config) {
      await Promise.all(unique.map(async (entry) => {
        liveVerdicts.set(`${entry.repositoryKey}#${entry.prNumber}`, await liveReceiptVerdict(entry, config))
      }))
    }
  }
  const verdict = checkSleepStop({
    state,
    wakeSources: readWakeSources(),
    sessionId: input?.session_id ?? "",
    stopHookActive: input?.stop_hook_active === true,
    isAlive,
    receiptVerdict: (entry) => liveVerdicts.get(`${entry.repositoryKey}#${entry.prNumber}`) ?? null,
  })
  if (verdict?.block) {
    process.stderr.write(verdict.message)
    process.exit(2)
  }
  /**
   * A run that ends BLOCKED is allowed to end, and it must not look like one that finished. The
   * banner goes to stderr and the hook still exits 0, because exit 2 is this hook's only confirmed
   * channel back into the session and using it here would BLOCK the very ending it is describing.
   * So this marks the transcript, and the orchestrate skill's report step carries the same
   * distinction where the model certainly reads it. Stated rather than implied: this line is a
   * record, not a guaranteed prompt.
   */
  if (verdict?.terminal === "BLOCKED") {
    process.stderr.write(verdict.message)
  }
  process.exit(0)
} catch {
  process.exit(0)
}
