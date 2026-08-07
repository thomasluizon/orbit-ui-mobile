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

import { githubEnvironment, repositorySlug } from "../../tools/lib/github-auth.mjs"
import { runBounded } from "../../tools/lib/bounded-process.mjs"
import { readOrchestratorConfig } from "../../tools/lib/orchestrator-config.mjs"
import { readinessReceiptMatchesLive, readinessReport } from "../../tools/lib/readiness-receipt.mjs"
import { readRunState, readWakeSources } from "../../tools/lib/run-state.mjs"
import { readStdinJson } from "./_lib/io.mjs"
import { checkSleepStop } from "./_lib/rules-sleep.mjs"

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
      ["pr", "view", String(entry.prNumber), "--repo", repository, "--json", "number,baseRefOid,headRefOid,isDraft"],
      { cwd: repoRoot, env: githubAuth.environment, timeoutMs: 45000 },
    )
    if (viewed.timedOut || viewed.error || viewed.status !== 0) return null
    const pr = JSON.parse(viewed.stdout)
    if (pr?.number !== entry.prNumber || typeof pr?.baseRefOid !== "string" || typeof pr?.headRefOid !== "string" || typeof pr?.isDraft !== "boolean") return null

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
      linearVisibleEffect: linear.labels.some((label) => label.name === "visible-effect"),
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
  process.exit(0)
} catch {
  process.exit(0)
}
