import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { followDetached, settleSupervised, startOrphaned, supervisionPaths, writeExitFile } from "../lib/detached-launch.mjs"
import * as runState from "../lib/run-state.mjs"
import { countPsSpawns, processIsRunning, stage, T } from "./_harness.mjs"

const { processStartIdentity } = runState

const field = (name, pid) => spawnSync("ps", ["-o", `${name}=`, "-p", String(pid)], { encoding: "utf8" }).stdout.trim()

export const cases = async () => {
  if (process.platform === "win32") return
  const directory = dirname(stage("detached-launch/.keep", ""))
  const paths = (label) => ({ stdoutPath: join(directory, `${label}.out`), stderrPath: join(directory, `${label}.err`), exitPath: join(directory, `${label}.exit.json`) })

  const sleeper = paths("sleeper")
  const pid = await startOrphaned({ command: process.execPath, args: ["-e", "setTimeout(() => {}, 30000)"], cwd: directory, environment: process.env, ...sleeper })
  try {
    T("detached-launch: the started process runs", processIsRunning(pid))
    T("detached-launch: its parent is gone, so no ps walk below this process reaches it", field("ppid", pid) === "1")
    T("detached-launch: it leads its own process group", field("pgid", pid) === String(pid))
  } finally { process.kill(pid, "SIGKILL") }

  const speaking = paths("speaking")
  const speakingScript = `process.stderr.write("progress line\\n"); process.stdout.write("final result\\n"); require("node:fs").writeFileSync(${JSON.stringify(speaking.exitPath)}, JSON.stringify({ exitCode: 7 }))`
  const speakingPid = await startOrphaned({ command: process.execPath, args: ["-e", speakingScript], cwd: directory, environment: process.env, ...speaking })
  const forwarded = []
  const followed = await followDetached({ pid: speakingPid, ...speaking, forward: (text) => forwarded.push(text), pollMilliseconds: 20 })
  T("detached-launch: followDetached copies stderr, returns stdout and the recorded exit code", forwarded.join() === "progress line\n" && followed.stdout === "final result\n" && followed.exitCode === 7, JSON.stringify({ forwarded, followed }))
  T("detached-launch: followDetached removes its three files", ![speaking.stdoutPath, speaking.stderrPath, speaking.exitPath].some(existsSync))

  const vanishing = paths("vanishing")
  const vanishingPid = await startOrphaned({ command: process.execPath, args: ["-e", "process.exit(0)"], cwd: directory, environment: process.env, ...vanishing })
  const vanished = await followDetached({ pid: vanishingPid, ...vanishing, forward: () => {}, pollMilliseconds: 20 })
  T("detached-launch: a process that ends without an exit marker reports a null exit code", vanished.exitCode === null && vanished.stdout === "")

  let refusal = null
  try { await startOrphaned({ command: join(directory, "missing-command"), args: [], cwd: directory, environment: process.env, ...paths("missing") }) } catch (error) { refusal = error.message }
  T("detached-launch: a command that cannot start rejects with the reason", /could not start the detached process: .*ENOENT/.test(String(refusal)), String(refusal))

  const marker = join(directory, "marker.json")
  writeExitFile(marker, 0)
  T("detached-launch: writeExitFile publishes the marker whole", JSON.parse(readFileSync(marker, "utf8")).exitCode === 0 && !existsSync(`${marker}.${process.pid}.unpublished`))
  writeFileSync(marker, "stale")
  writeExitFile(marker, 143)
  T("detached-launch: writeExitFile replaces an older marker", JSON.parse(readFileSync(marker, "utf8")).exitCode === 143)

  const settleFiles = (label) => {
    const files = supervisionPaths(join(directory, label))
    for (const path of [files.stdoutPath, files.stderrPath]) writeFileSync(path, "output")
    return files
  }
  const present = (files) => [files.stdoutPath, files.stderrPath, files.exitPath].filter(existsSync).length
  const liveEntry = settleFiles("settle-live")
  settleSupervised({ exitPath: liveEntry.exitPath, entryPid: process.pid, entryProcessStartIdentity: processStartIdentity(process.pid), exitCode: 3 })
  T("detached-launch: settleSupervised publishes the marker and keeps the files for a live entry", JSON.parse(readFileSync(liveEntry.exitPath, "utf8")).exitCode === 3 && present(liveEntry) === 3)
  // The entry carries its start identity in production. A killed orphan stays a zombie where pid 1 does not reap it, and a zombie has no identity.
  const goneEntry = settleFiles("settle-gone")
  const gonePid = await startOrphaned({ command: process.execPath, args: ["-e", "setTimeout(() => {}, 30000)"], cwd: directory, environment: process.env, ...paths("settle-gone-process") })
  const goneIdentity = processStartIdentity(gonePid)
  process.kill(gonePid, "SIGKILL")
  for (let attempt = 0; attempt < 100 && processIsRunning(gonePid); attempt++) await new Promise((resolve) => setTimeout(resolve, 20))
  settleSupervised({ exitPath: goneEntry.exitPath, entryPid: gonePid, entryProcessStartIdentity: goneIdentity, exitCode: 0 })
  T("detached-launch: settleSupervised removes the stdout, stderr and exit files when the entry is gone", typeof goneIdentity === "string" && present(goneEntry) === 0)
  const reusedEntry = settleFiles("settle-reused")
  settleSupervised({ exitPath: reusedEntry.exitPath, entryPid: process.pid, entryProcessStartIdentity: "another-process-start", exitCode: 0 })
  T("detached-launch: settleSupervised treats a pid that another process now holds as a gone entry", present(reusedEntry) === 0)

  const { watchProcess } = runState
  const clock = (start = 0) => { let time = start; return { now: () => time, advance: (milliseconds) => { time += milliseconds } } }
  const missingPid = 2 ** 22 + 5
  const missingProbe = { identityOf: () => { throw new Error("a missing pid needs no identity read") } }
  T("detached-launch: watchProcess reports a missing pid at once and reads no identity", typeof watchProcess === "function" && watchProcess({ pid: missingPid, startIdentity: "any", ...missingProbe })() === false)
  let identityReads = 0
  const steady = clock()
  const steadyWatch = typeof watchProcess === "function" ? watchProcess({ pid: process.pid, startIdentity: "same", now: steady.now, identityOf: () => { identityReads++; return "same" } }) : () => false
  let steadyAnswers = []
  for (let poll = 0; poll < 100; poll++) { steadyAnswers.push(steadyWatch()); steady.advance(100) }
  T("detached-launch: watchProcess reads the identity once in each interval across 100 polls of 10 seconds", steadyAnswers.every(Boolean) && identityReads === 2, String(identityReads))
  let identity = "same"
  const reused = clock()
  const reusedWatch = typeof watchProcess === "function" ? watchProcess({ pid: process.pid, startIdentity: "same", now: reused.now, identityOf: () => identity }) : () => true
  const beforeReuse = reusedWatch()
  identity = "another-process"
  reused.advance(4999)
  const insideInterval = reusedWatch()
  reused.advance(1)
  T("detached-launch: watchProcess finds a pid that another process holds once the interval ends", beforeReuse === true && insideInterval === true && reusedWatch() === false)
  T("detached-launch: watchProcess with no start identity checks the pid only", typeof watchProcess === "function" && watchProcess({ pid: process.pid, startIdentity: null, identityOf: () => { throw new Error("no identity to compare") } })() === true)

  if (process.platform === "darwin") {
    const following = paths("following")
    const followedPid = await startOrphaned({ command: process.execPath, args: ["-e", "setTimeout(() => {}, 30000)"], cwd: directory, environment: process.env, ...following })
    let result = null
    const spawns = await countPsSpawns("following", async () => {
      const running = followDetached({ pid: followedPid, ...following, forward: () => {}, pollMilliseconds: 20 })
      await new Promise((resolve) => setTimeout(resolve, 1500))
      process.kill(followedPid, "SIGKILL")
      result = await running
    })
    T("detached-launch: followDetached starts ps a few times, not on each of its 20 millisecond polls, and still ends when the supervisor dies", spawns <= 4 && result?.exitCode === null, `ps spawns: ${spawns}`)
  }
}
