import { spawn, spawnSync } from "node:child_process"

const killTree = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { encoding: "utf8", windowsHide: true })
    return
  }
  try {
    process.kill(-pid, "SIGKILL")
  } catch {
    try {
      process.kill(pid, "SIGKILL")
    } catch {
      // The process may have exited between the timeout and the kill.
    }
  }
}

/**
 * Run one child with a hard wall-clock bound. POSIX children lead a process group and Windows
 * children are terminated with taskkill /T, so a timeout cannot leave grandchildren running.
 */
export const runBounded = (file, args, { cwd, env, timeoutMs, maxBuffer = 32 * 1024 * 1024, input, encoding = "utf8" } = {}) =>
  new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd,
      env,
      detached: process.platform !== "win32",
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      windowsHide: true,
    })
    const stdoutChunks = []
    const stderrChunks = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let timedOut = false
    let overflowed = false
    const append = (chunks, byteLength, chunk) => {
      if (byteLength + chunk.length <= maxBuffer) {
        chunks.push(chunk)
        return byteLength + chunk.length
      }
      overflowed = true
      killTree(child.pid)
      return byteLength
    }
    child.stdout?.on("data", (chunk) => { stdoutBytes = append(stdoutChunks, stdoutBytes, chunk) })
    child.stderr?.on("data", (chunk) => { stderrBytes = append(stderrChunks, stderrBytes, chunk) })
    if (input !== undefined) {
      child.stdin?.on("error", () => { /* a child that exits before reading input still reports its own status */ })
      child.stdin?.end(input)
    }
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child.pid)
    }, timeoutMs)
    const output = (chunks) => {
      const buffer = Buffer.concat(chunks)
      return encoding === null ? buffer : buffer.toString(encoding)
    }
    child.once("error", (error) => {
      clearTimeout(timer)
      resolve({ status: null, signal: null, stdout: output(stdoutChunks), stderr: output(stderrChunks), timedOut, overflowed, error })
    })
    child.once("close", (status, signal) => {
      clearTimeout(timer)
      resolve({ status, signal, stdout: output(stdoutChunks), stderr: output(stderrChunks), timedOut, overflowed, error: null })
    })
  })
