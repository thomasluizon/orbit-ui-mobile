import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { followDetached, startOrphaned, writeExitFile } from "../lib/detached-launch.mjs"
import { processIsRunning, stage, T } from "./_harness.mjs"

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
}
