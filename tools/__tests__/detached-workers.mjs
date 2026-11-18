import { spawn } from "node:child_process"
import { dirname } from "node:path"

import { liveDetachedWorkers, workerWaitCommand, workersWithoutWaiter } from "../lib/detached-workers.mjs"
import { processStartIdentity, registerWakeSource, workerCompletionFile } from "../lib/run-state.mjs"
import { stage, T } from "./_harness.mjs"

const sleeper = () => spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" })

export const cases = async () => {
  const repoRoot = dirname(stage("detached-workers/.keep", ""))
  const processes = []
  const start = () => { const child = sleeper(); processes.push(child); return child }
  try {
    T("detached-workers: a path with a space is quoted in the wait command", workerWaitCommand({ completionFile: "/a b/1.json", startedAt: "2026-11-18T10:00:00.000Z", issue: "ORB-1" }) === "node tools/wait-file.mjs --file '/a b/1.json' --started-at 2026-11-18T10:00:00.000Z --what 'worker ORB-1'")
    T("detached-workers: a plain path is not quoted", workerWaitCommand({ completionFile: "/a/1.json", startedAt: "2026-11-18T10:00:00.000Z", issue: "#9" }) === "node tools/wait-file.mjs --file /a/1.json --started-at 2026-11-18T10:00:00.000Z --what 'worker #9'")

    const supervisor = start()
    const worker = start()
    const entry = start()
    const base = { pid: supervisor.pid, workerPid: worker.pid, what: "worker ORB-7", detached: true, issue: "ORB-7", runDirectory: "/work/ORB-7", branch: "fix/orb-7", logFile: "/log", startedAt: new Date().toISOString(), completionFile: workerCompletionFile(supervisor.pid, repoRoot), ownerSessionId: "first" }
    registerWakeSource({ ...base, entryPid: entry.pid, entryProcessStartIdentity: processStartIdentity(entry.pid) }, repoRoot)
    const plain = start()
    registerWakeSource({ pid: plain.pid, what: "research", research: true }, repoRoot)
    const other = start()
    registerWakeSource({ pid: other.pid, what: "worker ORB-8", detached: true, issue: "ORB-8" }, repoRoot)

    const listed = liveDetachedWorkers(repoRoot)
    T("detached-workers: only a detached source with an issue and a completion file is a carried worker", listed.length === 1 && listed[0].issue === "ORB-7" && listed[0].launcherPid === supervisor.pid && listed[0].workerPid === worker.pid && listed[0].worktree === "/work/ORB-7")
    T("detached-workers: the first session needs no waiter while its entry runs", workersWithoutWaiter(repoRoot, "first").length === 0)
    T("detached-workers: another session needs a waiter even while the first entry runs", workersWithoutWaiter(repoRoot, "second").map((entryRow) => entryRow.issue).join() === "ORB-7")
    entry.kill("SIGKILL")
    await new Promise((resolve) => entry.once("exit", resolve))
    T("detached-workers: the first session needs a waiter once its entry is gone", workersWithoutWaiter(repoRoot, "first").length === 1)
    const waiter = start()
    registerWakeSource({ pid: waiter.pid, kind: "file-waiter", file: base.completionFile, what: "worker ORB-7", sessionId: "second" }, repoRoot)
    T("detached-workers: a file waiter on the completion file satisfies the need", workersWithoutWaiter(repoRoot, "second").length === 0 && workersWithoutWaiter(repoRoot, "first").length === 0)
  } finally {
    for (const child of processes) child.kill("SIGKILL")
  }
}
