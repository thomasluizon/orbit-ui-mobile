import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

const STATE_VERSION = 2
const STATE_DIRECTORY_NAME = "orbit-worker-hooks"
const STATE_FILE_NAME = "registry.json"
const RUNTIME_FILE_NAME = "dispatch-worker-report.mjs"
const LOCK_DIRECTORY_NAME = "registry.lock"
const LOCK_WAIT_MS = 25
const LOCK_TIMEOUT_MS = 5000
const STALE_LOCK_MS = 30000
const PRIMARY_EXCLUDES_FILE_NAME = "orbit-worker-primary-exclude"
const PRIMARY_HOOK_RELATIVE_PATH = ".codex/hooks.json"

const wait = (milliseconds) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

const normalizedWorktree = (path) => {
  const normalized = resolve(path).replaceAll("\\", "/").replace(/\/+$/, "")
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

const dispatcherPaths = (commonGitDirectory) => {
  const directory = join(resolve(commonGitDirectory), STATE_DIRECTORY_NAME)
  return {
    directory,
    lock: join(directory, LOCK_DIRECTORY_NAME),
    runtime: join(directory, RUNTIME_FILE_NAME),
    state: join(directory, STATE_FILE_NAME),
  }
}

const removeIfPresent = (path) => {
  try {
    unlinkSync(path)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
}

const atomicWrite = (path, bytes) => {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temporaryPath, bytes, { flag: "wx" })
  try {
    renameSync(temporaryPath, path)
  } catch (error) {
    removeIfPresent(temporaryPath)
    throw error
  }
}

const releaseLock = (lockPath) => {
  try {
    rmdirSync(lockPath)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
}

const withRegistryLock = (commonGitDirectory, operation) => {
  const paths = dispatcherPaths(commonGitDirectory)
  mkdirSync(paths.directory, { recursive: true })
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  while (true) {
    try {
      mkdirSync(paths.lock)
      break
    } catch (error) {
      if (error.code !== "EEXIST") throw error
      try {
        if (Date.now() - statSync(paths.lock).mtimeMs > STALE_LOCK_MS) {
          releaseLock(paths.lock)
          continue
        }
      } catch (statError) {
        if (statError.code === "ENOENT") continue
        throw statError
      }
      if (Date.now() >= deadline) {
        throw new Error(`timed out waiting for Codex worker registry lock ${paths.lock}`)
      }
      wait(LOCK_WAIT_MS)
    }
  }

  try {
    return operation(paths)
  } finally {
    releaseLock(paths.lock)
  }
}

const readState = (statePath) => {
  if (!existsSync(statePath)) return null
  let state
  try {
    state = JSON.parse(readFileSync(statePath, "utf8"))
  } catch (error) {
    throw new Error(`could not read Codex worker registry ${statePath}: ${error.message}`)
  }
  if (
    state?.version !== STATE_VERSION ||
    typeof state.hooksPath !== "string" ||
    typeof state.primaryRoot !== "string" ||
    typeof state.originalHooks?.existed !== "boolean" ||
    typeof state.originalHooks?.contentBase64 !== "string" ||
    typeof state.primaryExcludes?.path !== "string" ||
    typeof state.primaryExcludes?.originalFile?.existed !== "boolean" ||
    typeof state.primaryExcludes?.originalFile?.contentBase64 !== "string" ||
    !Array.isArray(state.primaryExcludes?.priorWorktreeValues) ||
    !state.primaryExcludes.priorWorktreeValues.every((value) => typeof value === "string") ||
    state.registrations === null ||
    typeof state.registrations !== "object" ||
    Array.isArray(state.registrations)
  ) {
    throw new Error(`Codex worker registry ${statePath} has an unsupported shape`)
  }
  return state
}

const readHooks = (hooksPath) => {
  if (!existsSync(hooksPath)) return { existed: false, bytes: Buffer.from("{}\n", "utf8") }
  return { existed: true, bytes: readFileSync(hooksPath) }
}

const dispatcherHook = (runtimePath) => ({
  hooks: [{ type: "command", command: `node "${runtimePath}"` }],
})

const mergeDispatcherHook = (hooksBytes, runtimePath) => {
  let root
  try {
    root = JSON.parse(hooksBytes.toString("utf8"))
  } catch (error) {
    throw new Error(`primary Codex hooks are not valid JSON: ${error.message}`)
  }
  if (root === null || typeof root !== "object" || Array.isArray(root)) {
    throw new Error("primary Codex hooks must contain a JSON object")
  }
  const events = root.hooks ?? {}
  if (events === null || typeof events !== "object" || Array.isArray(events)) {
    throw new Error("primary Codex hooks.hooks must contain a JSON object")
  }
  if (events.Stop !== undefined && !Array.isArray(events.Stop)) {
    throw new Error("primary Codex hooks.hooks.Stop must contain an array")
  }
  const command = dispatcherHook(runtimePath).hooks[0].command
  const stopHooks = events.Stop ?? []
  const alreadyInstalled = stopHooks.some((entry) =>
    Array.isArray(entry?.hooks) &&
    entry.hooks.some((hook) => hook?.type === "command" && hook.command === command),
  )
  const mergedStopHooks = alreadyInstalled ? stopHooks : [...stopHooks, dispatcherHook(runtimePath)]
  return Buffer.from(
    `${JSON.stringify({ ...root, hooks: { ...events, Stop: mergedStopHooks } }, null, 2)}\n`,
    "utf8",
  )
}

const restoreFile = (path, snapshot) => {
  if (snapshot.existed) {
    mkdirSync(dirname(path), { recursive: true })
    atomicWrite(path, snapshot.bytes)
  } else {
    removeIfPresent(path)
  }
}

const gitResult = (
  primaryRoot,
  args,
  { allowStatusFive = false, allowStatusOne = false } = {},
) => {
  const result = spawnSync(
    "git",
    ["-C", primaryRoot, ...args],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  )
  if (result.error) throw result.error
  if (result.status === 0) return result.stdout.trim()
  if (allowStatusOne && result.status === 1) return null
  if (allowStatusFive && result.status === 5) return null
  throw new Error(
    `git ${args.join(" ")} failed: ${(result.stderr || result.stdout || `exit ${result.status}`).trim()}`,
  )
}

const worktreeConfigValues = (primaryRoot) => {
  const output = gitResult(
    primaryRoot,
    ["config", "--worktree", "--get-all", "core.excludesFile"],
    { allowStatusOne: true },
  )
  return output === null ? [] : output.split(/\r?\n/)
}

const setWorktreeConfigValues = (primaryRoot, values) => {
  gitResult(
    primaryRoot,
    ["config", "--worktree", "--unset-all", "core.excludesFile"],
    { allowStatusFive: true, allowStatusOne: true },
  )
  for (const value of values) {
    gitResult(primaryRoot, ["config", "--worktree", "--add", "core.excludesFile", value])
  }
}

const fileSnapshot = (path) => existsSync(path)
  ? { existed: true, bytes: readFileSync(path) }
  : { existed: false, bytes: Buffer.alloc(0) }

const snapshotPrimaryExcludes = (commonGitDirectory, primaryRoot) => {
  const path = join(resolve(commonGitDirectory), "info", PRIMARY_EXCLUDES_FILE_NAME)
  const effectivePath = gitResult(
    primaryRoot,
    ["config", "--path", "--get", "core.excludesFile"],
    { allowStatusOne: true },
  )
  const effectiveBytes = effectivePath && existsSync(effectivePath)
    ? readFileSync(effectivePath)
    : Buffer.alloc(0)
  return {
    effectiveBytes,
    path,
    originalFile: fileSnapshot(path),
    priorWorktreeValues: worktreeConfigValues(primaryRoot),
  }
}

const generatedExcludes = (priorBytes) => {
  const current = priorBytes.toString("utf8")
  const lines = new Set(current.split(/\r?\n/))
  if (lines.has(`/${PRIMARY_HOOK_RELATIVE_PATH}`)) return priorBytes
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : ""
  return Buffer.from(`${current}${separator}/${PRIMARY_HOOK_RELATIVE_PATH}\n`, "utf8")
}

const restorePrimaryExcludes = (primaryRoot, snapshot) => {
  setWorktreeConfigValues(primaryRoot, snapshot.priorWorktreeValues)
  restoreFile(snapshot.path, {
    existed: snapshot.originalFile.existed,
    bytes: Buffer.from(snapshot.originalFile.contentBase64, "base64"),
  })
}

export const registerCodexWorker = ({
  commonGitDirectory,
  hookPath,
  primaryRoot,
  reportsFile,
  runtimeSource,
  ticket,
  worktreePath,
}) => withRegistryLock(commonGitDirectory, (paths) => {
  const existingState = readState(paths.state)
  const resolvedPrimaryRoot = resolve(primaryRoot)
  const hooksPath = existingState?.hooksPath ?? join(resolvedPrimaryRoot, PRIMARY_HOOK_RELATIVE_PATH)
  if (!existingState) {
    const tracked = gitResult(
      resolvedPrimaryRoot,
      ["ls-files", "--error-unmatch", "--", relative(resolvedPrimaryRoot, hooksPath)],
      { allowStatusOne: true },
    )
    if (tracked !== null) {
      throw new Error(`primary Codex hooks are tracked at ${hooksPath}; refusing to dirty the primary checkout`)
    }
  }
  const hooksSnapshot = readHooks(hooksPath)
  const stateSnapshot = existsSync(paths.state)
    ? { existed: true, bytes: readFileSync(paths.state) }
    : { existed: false, bytes: Buffer.alloc(0) }
  const runtimeSnapshot = existsSync(paths.runtime)
    ? { existed: true, bytes: readFileSync(paths.runtime) }
    : { existed: false, bytes: Buffer.alloc(0) }
  const originalHooks = existingState?.originalHooks ?? {
    existed: hooksSnapshot.existed,
    contentBase64: hooksSnapshot.bytes.toString("base64"),
  }
  const primaryExcludesSnapshot = existingState
    ? null
    : snapshotPrimaryExcludes(commonGitDirectory, resolvedPrimaryRoot)
  const primaryExcludes = existingState?.primaryExcludes ?? {
    path: primaryExcludesSnapshot.path,
    originalFile: {
      existed: primaryExcludesSnapshot.originalFile.existed,
      contentBase64: primaryExcludesSnapshot.originalFile.bytes.toString("base64"),
    },
    priorWorktreeValues: primaryExcludesSnapshot.priorWorktreeValues,
  }
  const key = normalizedWorktree(worktreePath)
  const nextState = {
    version: STATE_VERSION,
    hooksPath,
    originalHooks,
    primaryExcludes,
    primaryRoot: resolvedPrimaryRoot,
    registrations: {
      ...(existingState?.registrations ?? {}),
      [key]: {
        hookPath: resolve(hookPath),
        reportsFile: resolve(reportsFile),
        ticket,
        worktreePath: resolve(worktreePath),
      },
    },
  }

  try {
    mkdirSync(dirname(hooksPath), { recursive: true })
    atomicWrite(paths.runtime, readFileSync(runtimeSource))
    atomicWrite(paths.state, Buffer.from(`${JSON.stringify(nextState, null, 2)}\n`, "utf8"))
    if (primaryExcludesSnapshot) {
      mkdirSync(dirname(primaryExcludes.path), { recursive: true })
      atomicWrite(primaryExcludes.path, generatedExcludes(primaryExcludesSnapshot.effectiveBytes))
      setWorktreeConfigValues(resolvedPrimaryRoot, [primaryExcludes.path])
    }
    atomicWrite(hooksPath, mergeDispatcherHook(hooksSnapshot.bytes, paths.runtime))
  } catch (error) {
    const rollbackErrors = []
    for (const [path, snapshot] of [
      [hooksPath, hooksSnapshot],
      [paths.state, stateSnapshot],
      [paths.runtime, runtimeSnapshot],
    ]) {
      try {
        restoreFile(path, snapshot)
      } catch (rollbackError) {
        rollbackErrors.push(`${path}: ${rollbackError.message}`)
      }
    }
    if (primaryExcludesSnapshot) {
      try {
        restorePrimaryExcludes(resolvedPrimaryRoot, primaryExcludes)
      } catch (rollbackError) {
        rollbackErrors.push(`primary excludes: ${rollbackError.message}`)
      }
    }
    const suffix = rollbackErrors.length > 0
      ? `; rollback also failed: ${rollbackErrors.join("; ")}`
      : ""
    throw new Error(`${error.message}${suffix}`)
  }

  return { key, hooksPath, ...paths }
})

export const deregisterCodexWorker = ({ commonGitDirectory, worktreePath }) =>
  withRegistryLock(commonGitDirectory, (paths) => {
    const state = readState(paths.state)
    if (!state) return { removed: false, remaining: 0 }
    const key = normalizedWorktree(worktreePath)
    if (!Object.hasOwn(state.registrations, key)) {
      return { removed: false, remaining: Object.keys(state.registrations).length }
    }
    const registrations = { ...state.registrations }
    delete registrations[key]
    const remaining = Object.keys(registrations).length
    if (remaining > 0) {
      atomicWrite(
        paths.state,
        Buffer.from(`${JSON.stringify({ ...state, registrations }, null, 2)}\n`, "utf8"),
      )
      return { removed: true, remaining }
    }

    const originalHooks = {
      existed: state.originalHooks.existed,
      bytes: Buffer.from(state.originalHooks.contentBase64, "base64"),
    }
    restoreFile(state.hooksPath, originalHooks)
    restorePrimaryExcludes(state.primaryRoot, state.primaryExcludes)
    removeIfPresent(paths.state)
    removeIfPresent(paths.runtime)
    return { removed: true, remaining: 0 }
  })

export { dispatcherPaths, normalizedWorktree }
