/**
 * Runs a process that no coordinator session can reach. Claude Code ends a background task with
 * SIGTERM, then SIGKILL, to the shell's process group and to every descendant that a `ps` walk finds
 * through ppid. A detached child still has the task as its ancestor, so that walk finds it. A child
 * whose parent already exited has ppid 1, so the walk does not.
 */

import { spawn } from "node:child_process"
import { existsSync, readFileSync, renameSync, rmSync, statSync, openSync, readSync, closeSync, writeFileSync } from "node:fs"
import { setTimeout as pause } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { processIsAlive, processStartIdentity } from "./run-state.mjs"

const EXIT_SUFFIX = ".exit.json"

const STARTER = fileURLToPath(new URL("./detached-starter.cjs", import.meta.url))

/** Resolves with the pid of a child that is its own session leader and whose parent is gone. */
export const startOrphaned = ({ command, args, cwd, environment, stdoutPath, stderrPath }) => new Promise((resolve, reject) => {
  const starter = spawn(process.execPath, [STARTER, JSON.stringify({ command, args, cwd, stdoutPath, stderrPath })], {
    env: environment, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  })
  let pid = ""
  let failure = ""
  starter.stdout.on("data", (chunk) => { pid += chunk })
  starter.stderr.on("data", (chunk) => { failure += chunk })
  starter.once("error", reject)
  starter.once("close", (status) => {
    const child = Number(pid)
    if (status === 0 && Number.isInteger(child) && child > 0) resolve(child)
    else reject(new Error(`could not start the detached process: ${failure.trim() || `starter exit ${status}`}`))
  })
})

/** The three files that link an entry process to its supervisor, named from one stem. */
export const supervisionPaths = (stem) => ({ stdoutPath: `${stem}.stdout`, stderrPath: `${stem}.stderr`, exitPath: `${stem}${EXIT_SUFFIX}` })

/** Atomic publication of the exit marker that the supervisor leaves for its entry process. */
export const writeExitFile = (path, exitCode) => {
  const unpublished = `${path}.${process.pid}.unpublished`
  writeFileSync(unpublished, `${JSON.stringify({ exitCode })}\n`)
  renameSync(unpublished, path)
}

const readFrom = (path, offset) => {
  let descriptor
  try { descriptor = openSync(path, "r") } catch { return { text: "", offset } }
  try {
    const size = statSync(path).size
    if (size <= offset) return { text: "", offset }
    const buffer = Buffer.alloc(size - offset)
    readSync(descriptor, buffer, 0, buffer.length, offset)
    return { text: buffer.toString("utf8"), offset: size }
  } finally { closeSync(descriptor) }
}

/**
 * Copies the supervisor's stderr as it grows, then returns what it left: its stdout text and its exit
 * code. Null exitCode means the supervisor vanished without writing an exit marker.
 */
export const followDetached = async ({ pid, stdoutPath, stderrPath, exitPath, forward, pollMilliseconds = 200 }) => {
  const identity = processStartIdentity(pid)
  let offset = 0
  const flush = () => {
    const chunk = readFrom(stderrPath, offset)
    offset = chunk.offset
    if (chunk.text) forward(chunk.text)
  }
  for (;;) {
    flush()
    if (existsSync(exitPath)) break
    // A pid that another process now holds, or none, means the supervisor is gone.
    if (!processIsAlive(pid) || (identity !== null && processStartIdentity(pid) !== identity)) {
      await pause(pollMilliseconds)
      break
    }
    await pause(pollMilliseconds)
  }
  flush()
  let exitCode = null
  try { exitCode = JSON.parse(readFileSync(exitPath, "utf8")).exitCode } catch { /* no marker: the supervisor was killed outright */ }
  const stdout = existsSync(stdoutPath) ? readFileSync(stdoutPath, "utf8") : ""
  for (const path of [stdoutPath, stderrPath, exitPath]) rmSync(path, { force: true })
  return { stdout, exitCode: Number.isInteger(exitCode) ? exitCode : null }
}

/**
 * Runs when the supervisor ends. It publishes the exit marker for a live entry process, which
 * `followDetached` then reads and removes. A relay ends the entry process first, so nothing reads
 * the three files: the supervisor removes them itself.
 */
export const settleSupervised = ({ exitPath, entryPid, entryProcessStartIdentity, exitCode }) => {
  writeExitFile(exitPath, exitCode)
  const entryLives = processIsAlive(entryPid) && (entryProcessStartIdentity === null || processStartIdentity(entryPid) === entryProcessStartIdentity)
  if (entryLives) return
  const { stdoutPath, stderrPath } = supervisionPaths(exitPath.slice(0, -EXIT_SUFFIX.length))
  for (const path of [stdoutPath, stderrPath, exitPath]) rmSync(path, { force: true })
}
