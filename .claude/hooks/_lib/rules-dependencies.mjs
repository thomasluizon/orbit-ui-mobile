// NOTHING writes inside node_modules, for any caller, in any worktree, for any reason.
//
// Measured 2026-09-18. A worker that could not make a test pass reached for the dependency instead
// of its own code: it flipped `enableImperativeFocus` and `enableKeyEvents` to `true` and added
// `KEYCODE_MOVE_HOME` and `KEYCODE_MOVE_END` to both key maps inside node_modules/react-native.
// Exactly two files carried an mtime three hours later than the package's own extraction, and they
// were precisely the two files three sessions then argued over. `npm install` did NOT repair them,
// because npm leaves a complete package alone; `rm -rf node_modules/react-native` plus an install
// did. Four contradictory citations were published and every one was accurate about the tree its
// author read.
//
// Code standard 8 did not fail there, its premise did: it says to confirm an external interface
// against the installed source, and it assumes the installed source is what the lockfile says. One
// edit breaks that assumption for every later reader, silently, in every checkout.
//
// The caller is NOT the discrimination here, unlike the browser ban in rules-worker.mjs. A hand
// edit inside a dependency is wrong from a worker, from an orchestrator and from Thomas alike,
// because the damage is to what every later reader sees rather than to one session's budget.
//
// Pure: takes a path or a command string plus an injected cwd, returns { block, message } or null.
//
// KNOWN BYPASSES, disclosed rather than implied, because a list that reads as exhaustive and is not
// is worse than none: a shell or interpreter wrapper (`sh -c '...'`, `node -e "..."`, `perl -i`)
// whose inner text is never inspected; a script file that runs any of this; `dd of=...`; a writer
// whose path argument is quoted and contains a space; and an npm script that fronts a writer. This
// is cost-raising defence in depth for the command path. The FILE path is the one it really closes,
// because Write, Edit and MultiEdit are how an agent edits. Detection for whatever still arrives is
// tools/check-dependency-edits.mjs.

import { existsSync, realpathSync } from "node:fs"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"

import { stripHeredocBodies } from "./rules-git.mjs"

const SEGMENT_SPLIT = /[&|;\n]+/
const LEADING_ASSIGNMENT = /^\s*[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)(?:\s+|$)/
const QUOTED_SPAN = /"[^"]*"|'[^']*'/g
const QUOTED_REDIRECT = />>?\s*("[^"]*"|'[^']*')/g
/** `2>&1` names a stream rather than a file, so a redirection into `&` is never resolved. */
const BARE_REDIRECT = />>?\s*(?!&)([^\s;|&<>"']+)/g

/** Package runners that front another program. The real invocation is whatever follows them. */
const RUNNER_PREFIXES = new Set(["npx", "bunx", "sudo", "command", "time"])
const RUNNER_SUBCOMMANDS = new Map([
  ["pnpm", "dlx"],
  ["yarn", "dlx"],
  ["npm", "exec"],
  ["bun", "x"],
])
/** Writers whose every non-flag argument is a file they overwrite. */
const WRITES_EVERY_ARGUMENT = new Set(["tee", "touch", "patch", "truncate"])
/** Writers whose LAST non-flag argument is the destination; the earlier ones are sources. */
const WRITES_LAST_ARGUMENT = new Set(["cp", "mv", "rsync", "ln", "install"])
/** PowerShell cmdlets that write the path they are given. */
const POWERSHELL_PATH_WRITERS = new Set(["set-content", "add-content", "out-file", "new-item", "set-item", "clear-content"])
/** PowerShell cmdlets whose SOURCE may legitimately be a dependency; only the destination writes. */
const POWERSHELL_DESTINATION_WRITERS = new Set(["copy-item", "move-item"])
const POWERSHELL_PATH_PARAMETERS = new Set(["-path", "-literalpath", "-filepath"])
const SED_IN_PLACE = /^(?:--in-place|-[a-z]*i)/
/** Writing a patch INTO a dependency is the same edit with a file around it. */
const PATCH_TOOLS = new Set(["patch-package", "patch_package"])

const unquote = (token) => String(token ?? "").replace(/^["']|["']$/g, "")

const normalize = (token) =>
  unquote(token)
    .split(/[/\\]/)
    .pop()
    .replace(/\.(?:exe|cmd|bat|ps1)$/i, "")
    .toLowerCase()

/**
 * The real path of `target`, resolved through relative segments AND through symlinks.
 *
 * A guard that pattern-matches the literal string is not a guard: `apps/mobile/../../node_modules`
 * and a symlink pointing at the package both reach the same bytes while spelling neither. The file
 * usually does not exist yet on a Write, so the longest EXISTING ancestor is the one resolved and
 * the remaining segments are re-appended to it.
 */
function resolveRealPath(target, cwd) {
  const base = typeof cwd === "string" && cwd !== "" ? cwd : process.cwd()
  let current = isAbsolute(target) ? resolve(target) : resolve(base, target)
  const tail = []
  for (let guard = 0; guard < 64; guard += 1) {
    if (existsSync(current)) {
      try {
        return join(realpathSync(current), ...tail)
      } catch {
        return join(current, ...tail)
      }
    }
    const parent = dirname(current)
    if (parent === current) return join(current, ...tail)
    tail.unshift(basename(current))
    current = parent
  }
  return join(current, ...tail)
}

/** A `node_modules` SEGMENT, never a substring: `node_modules_backup/` is an ordinary directory. */
const hasNodeModulesSegment = (path) => path.split(/[/\\]/).some((segment) => segment === "node_modules")

export function resolvesInsideNodeModules(target, cwd) {
  const candidate = unquote(String(target ?? "")).trim()
  if (candidate === "") return false
  return hasNodeModulesSegment(resolveRealPath(candidate, cwd))
}

/** The tokens a segment actually invokes: leading grouping and NAME=value assignments removed. */
function tokensOf(segment) {
  let rest = segment.replace(/^[\s(){]*/, "")
  for (let match = LEADING_ASSIGNMENT.exec(rest); match; match = LEADING_ASSIGNMENT.exec(rest)) rest = rest.slice(match[0].length)
  return rest.trim().split(/\s+/).filter(Boolean)
}

/** Strips package-runner prefixes so `npx patch-package` is judged as `patch-package`. */
function withoutRunners(tokens) {
  let rest = tokens
  for (let guard = 0; guard < 4 && rest.length > 1; guard += 1) {
    const binary = normalize(rest[0])
    if (RUNNER_PREFIXES.has(binary)) {
      rest = rest.slice(1)
      continue
    }
    if (RUNNER_SUBCOMMANDS.get(binary) === normalize(rest[1])) {
      rest = rest.slice(2)
      continue
    }
    return rest
  }
  return rest
}

const isFlag = (token) => token.startsWith("-")

/**
 * A shell redirection writes its target. Quoted spans are blanked before the bare scan, so a
 * commit message that merely CONTAINS `> node_modules/...` is prose rather than a redirection,
 * the same distinction rules-git.mjs and rules-worker.mjs already draw.
 */
function redirectTargets(segment) {
  const targets = [...segment.matchAll(QUOTED_REDIRECT)].map((match) => match[1])
  const withoutQuotes = segment.replace(QUOTED_SPAN, (span) => " ".repeat(span.length))
  targets.push(...[...withoutQuotes.matchAll(BARE_REDIRECT)].map((match) => match[1]))
  return targets
}

function powershellWriteTargets(binary, rest) {
  const targets = []
  const positional = []
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (!isFlag(token)) {
      positional.push(token)
      continue
    }
    const parameter = token.toLowerCase()
    const value = rest[index + 1]
    const namesAPath = parameter === "-destination" || POWERSHELL_PATH_PARAMETERS.has(parameter)
    if (!namesAPath || value === undefined || isFlag(value)) continue
    targets.push(value)
    index += 1
  }
  if (POWERSHELL_PATH_WRITERS.has(binary)) targets.push(...positional)
  if (POWERSHELL_DESTINATION_WRITERS.has(binary) && positional.length > 1) targets.push(positional[positional.length - 1])
  return targets
}

/**
 * Every file a segment would write, plus whether it invokes a patch tool at all.
 *
 * `rm`, `rmdir` and `Remove-Item` are deliberately absent: `rm -rf node_modules/<package>` followed
 * by an install is the documented repair, and a guard that refused it would leave a poisoned tree
 * with no sanctioned way out. `npm` and `npm ci` are absent for the same reason: an install is how
 * a correct tree arrives.
 */
function segmentWrites(segment) {
  const targets = redirectTargets(segment)
  const tokens = withoutRunners(tokensOf(segment))
  if (tokens.length === 0) return { patchTool: false, targets }

  const binary = normalize(tokens[0])
  const rest = tokens.slice(1).map(unquote)
  const args = rest.filter((token) => !isFlag(token))
  if (PATCH_TOOLS.has(binary)) return { patchTool: true, targets }
  if (binary === "sed" && rest.some((token) => SED_IN_PLACE.test(token))) targets.push(...args.slice(1))
  if (WRITES_EVERY_ARGUMENT.has(binary)) targets.push(...args)
  if (WRITES_LAST_ARGUMENT.has(binary) && args.length > 1) targets.push(args[args.length - 1])
  if (POWERSHELL_PATH_WRITERS.has(binary) || POWERSHELL_DESTINATION_WRITERS.has(binary)) {
    targets.push(...powershellWriteTargets(binary, rest))
  }
  return { patchTool: false, targets }
}

const refusal = (what, detail) => ({
  block: true,
  message:
    `${what} inside node_modules is refused. ${detail}\n\n` +
    "A dependency is READ-ONLY evidence: confirm an external interface by READING the installed\n" +
    "source, then change your OWN code to match it. Where the behaviour genuinely has to change,\n" +
    "use the supported mechanism (an Expo config plugin, a fork, an upstream issue) or stop and\n" +
    "report the need. Never run patch-package, and never stage a path under node_modules.\n" +
    "Measured 2026-09-18: two edited files inside node_modules/react-native survived a reinstall\n" +
    "and corrupted three sessions of evidence, because every reader afterwards was accurate about\n" +
    "a tree nobody had changed on purpose. The repair is rm -rf node_modules/<package> plus an\n" +
    "install; a plain npm install leaves a complete package alone. Detection is\n" +
    "node tools/check-dependency-edits.mjs.",
})

/**
 * @param filePath the Write, Edit or MultiEdit target about to be written
 * @param options `{ cwd }`
 * @returns `{ block, message }` when the resolved path lands inside a dependency, else null
 */
export function checkDependencyFileWrite(filePath, { cwd = "" } = {}) {
  if (typeof filePath !== "string" || filePath.trim() === "") return null
  if (!resolvesInsideNodeModules(filePath, cwd)) return null
  return refusal("Editing a file", `Refused: ${filePath.trim().slice(0, 160)}`)
}

/**
 * @param command the Bash or PowerShell command about to run
 * @param options `{ cwd }`
 * @returns `{ block, message }` when the command writes into a dependency, else null
 */
export function checkDependencyCommand(command, { cwd = "" } = {}) {
  if (typeof command !== "string") return null

  for (const segment of stripHeredocBodies(command).split(SEGMENT_SPLIT)) {
    const { patchTool, targets } = segmentWrites(segment)
    if (patchTool) return refusal("Running patch-package", `Refused: ${segment.trim().slice(0, 160)}`)
    if (targets.some((target) => resolvesInsideNodeModules(target, cwd))) {
      return refusal("Writing a file", `Refused: ${segment.trim().slice(0, 160)}`)
    }
  }
  return null
}
