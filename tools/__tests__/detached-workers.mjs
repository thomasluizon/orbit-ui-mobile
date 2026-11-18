import { spawn } from "node:child_process"
import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { setTimeout as pause } from "node:timers/promises"

import { endedWorkersOwed, liveDetachedWorkers, workerWaitCommand, workersWithoutWaiter } from "../lib/detached-workers.mjs"
import { processStartIdentity, registerWakeSource, workerCompletionFile } from "../lib/run-state.mjs"
import { stage, T, toolPath } from "./_harness.mjs"

/** Run wait-file.mjs from a staged checkout and resolve with its exit status and printed result. */
const runWaiter = (repoRoot, args) => {
  const child = spawn(process.execPath, [join(repoRoot, "tools", "wait-file.mjs"), ...args, "--poll-seconds", "0.05"], { cwd: repoRoot, env: { ...process.env, CLAUDE_CODE_SESSION_ID: "successor" }, stdio: ["ignore", "pipe", "pipe"] })
  let output = ""
  child.stdout.on("data", (chunk) => { output += chunk })
  const closed = new Promise((resolve) => child.once("close", (status) => resolve({ status, output })))
  return { child, closed: Promise.race([closed, pause(15000).then(() => { child.kill("SIGKILL"); return { status: "timeout", output } })]) }
}

const sleeper = () => spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" })

export const cases = async () => {
  const repoRoot = dirname(stage("detached-workers/.keep", ""))
  const processes = []
  const start = () => { const child = sleeper(); processes.push(child); return child }
  try {
    T("detached-workers: a path with a space is quoted in the wait command", workerWaitCommand({ completionFile: "/a b/1.json", startedAt: "2026-11-18T10:00:00.000Z", issue: "ORB-1" }) === "node tools/wait-file.mjs --file '/a b/1.json' --started-at 2026-11-18T10:00:00.000Z --what 'worker ORB-1'")
    T("detached-workers: a plain path is not quoted", workerWaitCommand({ completionFile: "/a/1.json", startedAt: "2026-11-18T10:00:00.000Z", issue: "#9" }) === "node tools/wait-file.mjs --file /a/1.json --started-at 2026-11-18T10:00:00.000Z --what 'worker #9'")

    T("detached-workers: the wait command names the supervisor, so a dead supervisor ends the wait",
      workerWaitCommand({ completionFile: "/a/1.json", startedAt: "2026-11-18T10:00:00.000Z", issue: "ORB-1", pid: 77, processStartIdentity: "linux:abc-def:12" }) ===
        "node tools/wait-file.mjs --file /a/1.json --started-at 2026-11-18T10:00:00.000Z --what 'worker ORB-1' --producer-pid 77 --producer-start-identity linux:abc-def:12")

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
    T("detached-workers: the carried wait command carries the supervisor identity of its launch record", listed[0].waitCommand.includes(`--producer-pid ${supervisor.pid} --producer-start-identity `), listed[0].waitCommand)

    const results = join(repoRoot, ".git", "orbit-worker-launches", "results")
    mkdirSync(results, { recursive: true })
    const resultOf = (launcherPid, sessionId) => ({ launcherPid, sessionId, repositoryKey: "ui", issue: `ORB-${launcherPid}`, runDirectory: "/work", branch: `fix/${launcherPid}`, outcome: "EXITED", exitCode: 0 })
    writeFileSync(join(results, "9001.json"), JSON.stringify(resultOf(9001, "first")))
    writeFileSync(join(results, "9002.json"), JSON.stringify(resultOf(9002, "other")))
    writeFileSync(join(results, "9003.json"), JSON.stringify(resultOf(9003, "older")))
    writeFileSync(join(results, "9004.json"), "{ not json")
    const owed = endedWorkersOwed(repoRoot, "first", [{ launcherPid: 9003 }, { issue: "no pid" }])
    T("detached-workers: an ended worker is owed when its result names the session or an earlier relay carried it", owed.map((worker) => worker.launcherPid).sort().join() === "9001,9003" && owed.every((worker) => worker.ended === true && worker.completionFile === workerCompletionFile(worker.launcherPid, repoRoot)), JSON.stringify(owed))
    T("detached-workers: a result of another session and a corrupt result are not owed", !owed.some((worker) => [9002, 9004].includes(worker.launcherPid)))

    mkdirSync(join(repoRoot, "tools"), { recursive: true })
    cpSync(toolPath("lib"), join(repoRoot, "tools", "lib"), { recursive: true })
    cpSync(toolPath("wait-file.mjs"), join(repoRoot, "tools", "wait-file.mjs"))
    const producer = start()
    const producerArgs = (file) => ["--file", file, "--producer-pid", String(producer.pid), "--producer-start-identity", processStartIdentity(producer.pid)]
    const gone = runWaiter(repoRoot, producerArgs(join(repoRoot, "never-written.json")))
    await pause(400)
    producer.kill("SIGKILL")
    const goneResult = await gone.closed
    T("detached-workers: a waiter ends with PRODUCER_GONE and exit 4 when its supervisor dies without the file", goneResult.status === 4 && JSON.parse(goneResult.output).reason === "PRODUCER_GONE" && JSON.parse(goneResult.output).found === false, JSON.stringify(goneResult))
    const finished = join(repoRoot, "written-by-the-dead.json")
    writeFileSync(finished, JSON.stringify({ exitCode: 0 }))
    const foundResult = await runWaiter(repoRoot, [...producerArgs(finished), "--started-at", new Date(Date.now() - 60000).toISOString()]).closed
    T("detached-workers: a supervisor that wrote the file and ended still reports the file", foundResult.status === 0 && JSON.parse(foundResult.output).reason === "FOUND", JSON.stringify(foundResult))
    const bad = await runWaiter(repoRoot, ["--file", finished, "--producer-pid", "12"]).closed
    T("detached-workers: a producer pid without its start identity is refused as invalid arguments", bad.status === 2, JSON.stringify(bad))
  } finally {
    for (const child of processes) child.kill("SIGKILL")
  }
}
