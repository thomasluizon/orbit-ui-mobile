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
export const runBounded = (file, args, { cwd, env, timeoutMs, maxBuffer = 32 * 1024 * 1024 } = {}) =>
  new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd,
      env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    let overflowed = false
    const append = (stream, chunk) => {
      const next = stream + chunk.toString()
      if (Buffer.byteLength(next) <= maxBuffer) return next
      overflowed = true
      killTree(child.pid)
      return stream
    }
    child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk) })
    child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk) })
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child.pid)
    }, timeoutMs)
    child.once("error", (error) => {
      clearTimeout(timer)
      resolve({ status: null, signal: null, stdout, stderr, timedOut, overflowed, error })
    })
    child.once("close", (status, signal) => {
      clearTimeout(timer)
      resolve({ status, signal, stdout, stderr, timedOut, overflowed, error: null })
    })
  })
