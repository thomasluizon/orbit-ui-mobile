/**
 * The size hooks of a code worker. `pre` is the PreToolUse hook: it denies a new file at the soft cap and every change at the
 * hard cap. `post` is the PostToolUse hook: it records the count and blocks a call that added a new file at the soft cap.
 * Both measure the worktree against `origin/main` with the one count of `diff-size.mjs`.
 */

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { MAX_CHANGED_FILES, MAX_CHANGED_LINES, SOFT_CHANGED_LINES, changedFiles, changedLines, gitFiles, provedPaths } from "./diff-size.mjs"
import { shellCommands } from "./worker-gh-hook.mjs"

const BASE = "origin/main"
const FILE_TOOLS = new Set(["Edit", "Write"])
const SHELL_TOOLS = new Set(["Bash", "Monitor"])
const ASSIGNMENT = /^[A-Za-z_]\w*\+?=/
const CHECK_SCRIPT = /^(?:\.\/)?tools\/check-[^/\s]+\.mjs$/
const GATE_SCRIPTS = new Set(["type-check", "lint"])
const GATE_PROGRAMS = new Set(["tsc", "eslint", "vitest"])
/** The `git` options that take the next word as their value. */
const GIT_VALUE_OPTIONS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"])

const git = (cwd, args) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr || result.error?.message || "").trim()}`)
  return result.stdout.trim()
}

/** The count of the worktree that holds `cwd`: its lines, its counted files, every path of the diff, the top directory and the git directory. */
export const measure = (cwd) => {
  const top = realpathSync(git(cwd, ["rev-parse", "--show-toplevel"]))
  const files = gitFiles({ cwd: top, base: BASE })
  const options = { proved: provedPaths({ cwd: top, base: BASE }) }
  const counted = changedFiles(files, options)
  return {
    top,
    gitDir: git(top, ["rev-parse", "--absolute-git-dir"]),
    lines: changedLines(files, options),
    files: counted.length,
    paths: [...new Set(files.map(({ path }) => path))],
  }
}

/** The path of a file tool call relative to the top directory, or null for a path outside the worktree. Links in the part that exists resolve first. */
const worktreePath = (top, cwd, filePath) => {
  let existing = resolve(cwd, filePath)
  const rest = []
  while (!existsSync(existing) && dirname(existing) !== existing) {
    rest.unshift(existing.slice(dirname(existing).length + 1))
    existing = dirname(existing)
  }
  const path = relative(top, join(realpathSync(existing), ...rest))
  return path === "" || path.startsWith("..") || isAbsolute(path) ? null : path.split("\\").join("/")
}

const capText = ({ lines, files }) =>
  `The diff is at ${lines} lines and ${files} files. The cap is ${MAX_CHANGED_LINES} lines and ${MAX_CHANGED_FILES} files. Commit the finished work and end the run. Name the rest in the pull request text with the line "Part remaining: <what is left>" for a part, or in the Remaining line for a ticket with no parts.`

/** The words of a command with its leading variable assignments removed. */
const programWords = (words) => {
  const start = words.findIndex((word) => !ASSIGNMENT.test(word))
  return start === -1 ? [] : words.slice(start)
}

/** The `git` subcommand of a list of words that starts with `git`. */
const gitSubcommand = (words) => {
  for (let index = 1; index < words.length; index++) {
    if (GIT_VALUE_OPTIONS.has(words[index])) index++
    else if (!words[index].startsWith("-")) return words[index]
  }
  return null
}

/** True for `git` with a subcommand other than `push`, and for each gate command. */
const isAllowedAtCap = (words) => {
  const [program, first, second] = words
  if (program === "git") return gitSubcommand(words) !== "push"
  if (program === "npx") {
    const name = words.slice(1).find((word) => !word.startsWith("-"))
    return GATE_PROGRAMS.has(name)
  }
  if (program === "npm") return first === "run" && GATE_SCRIPTS.has(second)
  return program === "node" && CHECK_SCRIPT.test(first ?? "")
}

/** True when the text has an output redirect outside quotes. `2>&1` and a redirect to `/dev/null` do not count. */
const writesAFile = (text) => {
  const bare = text.replace(/\d*>&\d+/g, "").replace(/&?\d*>>?\s*\/dev\/null\b/g, "")
  let quote = null
  for (let index = 0; index < bare.length; index++) {
    const character = bare[index]
    if (quote !== null) {
      if (character === "\\" && quote === '"') index++
      else if (character === quote) quote = null
    } else if (character === "\\") index++
    else if (character === "'" || character === '"') quote = character
    else if (character === ">") return true
  }
  return false
}

/** True when each command of the shell text is allowed at the hard cap and no redirect writes a file. */
const shellAllowedAtCap = (command) => {
  const commands = shellCommands(command).map(programWords)
  return !writesAFile(command) && commands.length > 0 && commands.every(isAllowedAtCap)
}

/**
 * Why the call may not run, or null. `input` is the PreToolUse input and `counted` is the measure of its worktree. A new path
 * is a path that the diff does not hold. At the soft cap or at the file cap no new path is allowed. At the hard cap only
 * `git` (but not `git push`) and a gate command run.
 */
export const preDenial = (input, counted) => {
  const tool = input.tool_name
  const atHardCap = counted.lines >= MAX_CHANGED_LINES
  const atSoftCap = counted.lines >= SOFT_CHANGED_LINES || counted.files >= MAX_CHANGED_FILES
  if (FILE_TOOLS.has(tool)) {
    if (atHardCap) return capText(counted)
    if (!atSoftCap) return null
    const path = worktreePath(counted.top, input.cwd, String(input.tool_input.file_path))
    return path !== null && !counted.paths.includes(path) ? capText(counted) : null
  }
  if (SHELL_TOOLS.has(tool) && atHardCap && !shellAllowedAtCap(String(input.tool_input.command))) return capText(counted)
  return null
}

const recordFile = (counted) => join(counted.gitDir, "orbit-size.json")

const readRecord = (counted) => {
  try {
    return JSON.parse(readFileSync(recordFile(counted), "utf8"))
  } catch {
    return null
  }
}

/**
 * The block reason of a PostToolUse call, or null. `before` is the paths that the last record held. A call that added a path
 * at the soft cap or at the file cap gets the reason that names each added path.
 */
export const postReason = (counted, before) => {
  if (before === null) return null
  const added = counted.paths.filter((path) => !before.includes(path))
  const atCap = counted.lines >= SOFT_CHANGED_LINES || counted.files >= MAX_CHANGED_FILES
  return added.length > 0 && atCap ? `The diff is at ${counted.lines} lines and ${counted.files} files. Undo the change to ${added.join(", ")}. Change only files that are already in the diff.` : null
}

/**
 * Writes the count to `<git dir>/orbit-size.json` (`{ lines, files, head, at, paths }`) and returns the block reason, or null.
 * After a block the record keeps the paths of the earlier record, so each later call blocks until the worker undoes the new path.
 * The rename is atomic, so a hook that runs at the same time never reads half a file.
 */
export const recordCount = (counted, now = new Date()) => {
  const previous = readRecord(counted)
  const reason = postReason(counted, previous?.paths ?? null)
  const head = git(counted.top, ["rev-parse", "HEAD"])
  const record = { lines: counted.lines, files: counted.files, head, at: now.toISOString(), paths: reason === null ? counted.paths : previous.paths }
  writeFileSync(`${recordFile(counted)}.${process.pid}`, JSON.stringify(record))
  renameSync(`${recordFile(counted)}.${process.pid}`, recordFile(counted))
  return reason
}

/** The PreToolUse output that denies a call. Exit 0 with this JSON is the deny form of claude 2.1.332. */
export const denyOutput = (reason) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } })

/** The PostToolUse output that blocks. `decision: "block"` and `reason` are the top-level fields of claude 2.1.332. */
export const blockOutput = (reason) => ({ decision: "block", reason })

/** Reads the hook input on stdin. Exit 0 lets the call run. Exit 2 blocks it when the hook cannot measure. */
const main = () => {
  try {
    const [event] = process.argv.slice(2)
    if (event !== "pre" && event !== "post") throw new Error(`the first argument is pre or post, not ${event}`)
    const input = JSON.parse(readFileSync(0, "utf8"))
    const counted = measure(input.cwd)
    const reason = event === "pre" ? preDenial(input, counted) : recordCount(counted)
    if (reason !== null) process.stdout.write(`${JSON.stringify(event === "pre" ? denyOutput(reason) : blockOutput(reason))}\n`)
    return
  } catch (error) {
    console.error(`Blocked: the size hook could not measure this call. ${error.message}`)
  }
  process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main()
