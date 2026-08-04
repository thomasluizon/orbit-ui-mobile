import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

export const WORKTREE_LIFECYCLE_LOCK_NAME = "orbit-launch-worker.lock"

const pause = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)

const processIsAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code !== "ESRCH"
  }
}

const unlinkIfPresent = (path) => {
  try {
    unlinkSync(path)
    return true
  } catch (error) {
    if (error.code === "ENOENT") return false
    throw error
  }
}

export const worktreeLifecycleLockPath = (gitCommonDirectory) => join(resolve(gitCommonDirectory), WORKTREE_LIFECYCLE_LOCK_NAME)

export const acquireWorktreeLifecycleLock = (gitCommonDirectory, { timeoutMs = 5 * 60 * 1000 } = {}) => {
  const path = worktreeLifecycleLockPath(gitCommonDirectory)
  const token = JSON.stringify({ pid: process.pid, startedAt: Date.now() })
  const deadline = Date.now() + timeoutMs

  while (true) {
    let descriptor
    try {
      descriptor = openSync(path, "wx")
      writeFileSync(descriptor, token, "utf8")
      closeSync(descriptor)
      let released = false
      return {
        path,
        release: () => {
          if (released) return
          released = true
          try {
            if (readFileSync(path, "utf8") === token) unlinkSync(path)
          } catch (error) {
            if (error.code !== "ENOENT") throw error
          }
        },
      }
    } catch (error) {
      if (descriptor !== undefined) {
        try {
          closeSync(descriptor)
        } catch {
        }
        try {
          unlinkIfPresent(path)
        } catch {
        }
      }
      if (error.code !== "EEXIST") throw new Error(`could not acquire worktree lifecycle lock ${path}: ${error.message}`)
    }

    try {
      const owner = JSON.parse(readFileSync(path, "utf8"))
      if (Number.isInteger(owner.pid) && !processIsAlive(owner.pid)) {
        unlinkIfPresent(path)
        continue
      }
    } catch (error) {
      if (error.code === "ENOENT") continue
      let stale = false
      try {
        stale = Date.now() - statSync(path).mtimeMs > 5000
      } catch (statError) {
        if (statError.code === "ENOENT") continue
        throw new Error(`could not inspect worktree lifecycle lock ${path}: ${statError.message}`)
      }
      if (stale) {
        unlinkIfPresent(path)
        continue
      }
    }

    if (Date.now() >= deadline) throw new Error(`timed out waiting for worktree lifecycle lock ${path}`)
    pause(100)
  }
}
