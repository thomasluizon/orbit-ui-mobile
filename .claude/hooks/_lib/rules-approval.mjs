// Refuses, in an unattended run, each shell command that Claude Code holds for an approval in every
// permission mode: no person answers there, so the prompt stops the run. The only such check with a
// command shape is the dangerous removal check on `rm` and `rmdir`. Each rule refuses a superset of
// the `removalRule` values it names, because the analyzer behind them is not a stable interface.
// ./README.md lists the checks, their source, and the ones that no command shape can predict.

import { homedir } from "node:os"
import { posix } from "node:path"

import { commandWords, inspectCommands } from "./command-expander.mjs"
import { stripHeredocBodies } from "./rules-git.mjs"

/** The launcher exports this into every worker it starts (tools/launch-worker.mjs). A worker is headless. */
const LAUNCHER_MARKER = "ORBIT_LAUNCH_WORKER"

/** Words the shell reads before a command, and programs that run the command that follows them. */
const CONTROL_WORDS = new Set(["do", "then", "else", "elif", "if", "while", "until", "!", "{", "coproc"])
const WRAPPERS = new Set(["sudo", "doas", "exec", "command", "builtin", "noglob", "env", "nice", "nohup", "busybox", "time", "timeout", "stdbuf", "setsid", "ionice", "pkexec", "runuser", "xargs"])
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "mksh", "ash", "hush", "rbash"])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/
const REDIRECT = /^[\d&]*[<>]/
const BARE_REDIRECT = /^(?:\d+|&)?(?:>>?[|&]?|<<?<?|<>)$/
const FIND_EXEC = /^-(?:exec|execdir|ok|okdir)$/
const EXPANSION = /^\$(?:\{([^}]*)\}|([A-Za-z_][A-Za-z0-9_]*|[0-9@*#?!$-]))/
const GUARDED = /^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+):\?/
const SIMPLE_NAME = /^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+)$/
const BRACE_EXPANSION = /\{[^{}]*(?:,|\.\.)[^{}]*\}/
const INLINE_SCRIPT = /(?:^|[\s;&|(])(?:(?:[^\s=]*\/)?(?:ba|z|da|k|mk|a|hu|rba)?sh\s+(?:\S+\s+)*?-[A-Za-z]*c|eval|trap)(?=\s)/
const UNREADABLE_SCRIPT = /\balias\b|\bIFS\b|\bfunction\b|\w\s*\(\s*\)|\$'/
const INLINE_SCRIPT_MAX_LENGTH = 2000
const MOUNTED_DRIVE = /^\/(?:system\/)?volumes(?:\/[^/]+){0,2}$|^\/mnt\/(?:[^/]+|[a-z]\/[^/]+)$|^\/(?:run\/)?media(?:\/[^/]+){0,3}$/i
const TRAILING_STARS = /(?:\/\*+)+\/*$/
const ROOTED = /^(?:[\\/]|[A-Za-z]:[\\/])/

const programName = (word) => word.replace(/^\\/, "").split(/[\\/]/).pop().replace(/\.exe$/i, "").toLowerCase()
const removalProgram = (word) => (["rm", "rmdir"].includes(programName(word)) ? programName(word) : null)

/**
 * One command word as the shell reads it: `value` with the quotes removed and each expansion kept as written,
 * `bare` holding only the unquoted characters, and every `$` expansion outside single quotes.
 */
function readWord(raw) {
  const word = { raw, value: "", bare: "", expansions: [], substitution: /__substitution__|__subshell__/.test(raw) }
  let quote = ""
  for (let index = 0; index < raw.length; index++) {
    const character = raw[index]
    if (quote === "'") {
      if (character === "'") quote = ""
      else word.value += character
      continue
    }
    if (character === "\\" && (!quote || /["\\$`]/.test(raw[index + 1] ?? ""))) {
      word.value += raw[index + 1] ?? ""
      index++
      continue
    }
    if (character === '"' || character === "'") { quote = quote ? "" : character; continue }
    if (character === "`") word.substitution = true
    const expansion = character === "$" ? EXPANSION.exec(raw.slice(index)) : null
    if (expansion) {
      const name = expansion[1] ?? expansion[2]
      word.expansions.push({ written: expansion[0], name, guarded: expansion[1] !== undefined && GUARDED.test(name) })
      word.value += expansion[0]
      index += expansion[0].length - 1
      continue
    }
    word.value += character
    if (!quote) word.bare += character
  }
  return word
}

/** Every `rm` or `rmdir` a word list runs: behind control words, assignments and wrappers, and after `find -exec`. */
function removalInvocations(words) {
  const invocations = []
  const collect = (start) => {
    let index = start
    while (index < words.length && (CONTROL_WORDS.has(words[index]) || ASSIGNMENT.test(words[index]))) index++
    while (index < words.length && WRAPPERS.has(programName(words[index]))) {
      index++
      while (index < words.length && !removalProgram(words[index]) && !WRAPPERS.has(programName(words[index]))) {
        const word = words[index]
        if (word.startsWith("-")) {
          const value = words[index + 1]
          index += value !== undefined && !value.startsWith("-") && !value.includes("=") && !removalProgram(value) && !WRAPPERS.has(programName(value)) ? 2 : 1
        } else if (ASSIGNMENT.test(word) || /^\d/.test(word)) index++
        else break
      }
    }
    const program = index < words.length ? removalProgram(words[index]) : null
    if (program) invocations.push({ program, args: words.slice(index + 1) })
  }
  collect(0)
  words.forEach((word, index) => { if (FIND_EXEC.test(word)) collect(index + 1) })
  return invocations
}

/** The operands of one removal: flags, redirects and the `find -exec` terminator are not targets. */
function removalTargets({ args }) {
  const flags = []
  const targets = []
  let operandsOnly = false
  for (let index = 0; index < args.length; index++) {
    const word = args[index]
    if ([";", "\;", "+", "{}"].includes(word)) continue
    if (REDIRECT.test(word)) { if (BARE_REDIRECT.test(word)) index++; continue }
    if (!operandsOnly && word === "--") { operandsOnly = true; continue }
    if (!operandsOnly && word.startsWith("-")) flags.push(word)
    else targets.push(readWord(word))
  }
  return { flags, targets }
}

/** A string that a shell reads again as a script: a `trap` body, and a `-c` body behind another program. */
function nestedScripts(words) {
  const scripts = []
  const values = words.map((word) => readWord(word).value)
  words.forEach((word, index) => {
    if (index === 0 || !SHELLS.has(programName(word))) return
    const flag = words.findIndex((candidate, position) => position > index && /^-[A-Za-z]*c[A-Za-z]*$/.test(candidate))
    if (flag > 0 && values[flag + 1] !== undefined) scripts.push(values[flag + 1])
  })
  if (programName(words[0] ?? "") === "trap") {
    const body = values.slice(1).find((value) => !value.startsWith("-"))
    if (body !== undefined) scripts.push(body)
  }
  return scripts
}

/** One spelling for a path: forward slashes, `C:/x` as the `/c/x` of Git Bash, and the macOS `/private` aliases removed. */
const canonical = (path) => posix.normalize(path.replace(/\\/g, "/").replace(/^([A-Za-z]):(?=\/|$)/, (_match, drive) => `/${drive.toLowerCase()}`))
  .replace(/^\/private\/(etc|var|tmp|home)(?=\/|$)/i, "/$1").replace(/(.)\/+$/, "$1")
const withinOrEqual = (ancestor, path) => path === ancestor || path.startsWith(ancestor === "/" ? "/" : `${ancestor}/`)
const hasGlob = (path) => /[*?[]/.test(path)

const refuse = (covers, why, rewrite) => ({ covers, why, rewrite })
const LITERAL = "Write the literal path of the directory you mean."

/**
 * The removal rules, in the order that gives the most useful rewrite. `judge` returns a refusal or null for one target,
 * and `judgeCommand` for the whole command. `covers` names the `removalRule` values of the Claude Code check that the
 * rule is a superset of.
 */
export const REMOVAL_RULES = [
  {
    name: "command-substitution",
    judge: ({ target }) => target.substitution
      ? refuse("wholeSubstitution, emptyExpansion", `the target ${target.raw} is the output of a command substitution, which no check can read before the command runs`,
        "Run the substitution as its own command first. Then remove the literal paths that it prints.")
      : null,
  },
  {
    name: "variable-path",
    judge: ({ target }) => {
      const unguarded = target.expansions.filter((expansion) => !expansion.guarded)
      if (unguarded.length === 0) return null
      const names = [...new Set(unguarded.map((expansion) => expansion.written))].join(", ")
      const guardable = unguarded.every((expansion) => SIMPLE_NAME.test(expansion.name))
      const guarded = unguarded.reduce((text, expansion) => text.replace(expansion.written, `\${${expansion.name}:?}`), target.raw)
      return refuse("variable_path, variable_path_set_in_command, var_root_child, placeholder_root_child",
        `the target ${target.raw} expands ${names} with no \${VAR:?} guard, so an empty value can turn it into a top-level path`,
        guardable ? `Write the literal path, or guard each variable: ${guarded}` : LITERAL)
    },
  },
  {
    name: "brace-expansion",
    judge: ({ target }) => BRACE_EXPANSION.test(target.bare.replace(/\$\{[^}]*\}/g, ""))
      ? refuse("inline_shell_unchecked", `the target ${target.raw} uses brace expansion, which this check cannot read`, "Write each path as its own literal target.")
      : null,
  },
  {
    name: "windows-path",
    judge: ({ target }) => /^\\+$/.test(target.raw) || /^[A-Za-z]:(?![\\/])/.test(target.value)
      ? refuse("backslash_only, windows_unplaceable_path", `the target ${target.raw} is a Windows path that Git Bash can read as a drive root`,
        "Write the directory as a plain path, for example /c/work/build or C:/work/build.")
      : null,
  },
  {
    name: "derived-variable",
    judge: ({ target, command }) => {
      const name = /^\$\{([A-Za-z_][A-Za-z0-9_]*):\?[^}]*\}[/*]*$/.exec(target.value)?.[1]
      const derived = name && new RegExp(`(?:^|[\\s;&|(])${name}=["']?(?:(?:\\$\\(|\`)\\s*(?:cd|pwd|dirname|git\\s+rev-parse)\\b|\\$\\{?(?:PWD|HOME)\\b|~)`).test(command)
      return derived
        ? refuse("derived_var", `the target ${target.raw} is a variable that this command sets from a directory lookup, so the guard does not stop a removal of that directory`, LITERAL)
        : null
    },
  },
  {
    name: "glob-target",
    judge: ({ target, path, flags, program, moved }) => {
      if (path === null || !TRAILING_STARS.test(path.full)) return null
      const relative = !ROOTED.test(target.value) && !target.value.startsWith("~")
      const levels = (TRAILING_STARS.exec(path.full)[0].match(/\*+/g) ?? []).length
      const inner = path.base.split("/").filter(hasGlob).length
      const unresolvable = (relative && moved) || target.value.startsWith("~") || (relative && /(?:^|\/)\.\.(?:\/|$)/.test(target.value)) ||
        (relative && /\*\/+$/.test(target.value)) || (program === "rmdir" && flags.some((flag) => /^--p|^-[a-z]*p/.test(flag))) || levels + inner > 1
      return unresolvable
        ? refuse("unresolvable_target, relative_glob_after_cd, multi_level_glob", `the glob target ${target.raw} cannot be resolved to one directory before the command runs`,
          "Write the literal absolute path of each directory to remove, with no glob.")
        : null
    },
  },
  {
    name: "critical-path",
    judge: ({ target, path, home, windows }) => {
      if (path === null || hasGlob(path.base)) return null
      const onDrive = path.base.replace(/^\/[a-z](?=\/|$)/, "") || "/"
      const critical = path.base === "/" || /^\/[^/]+$/.test(path.base) || path.base === home || /^\/\.(?:vol|file)(?:\/|$)/i.test(path.base) ||
        (windows && /^\/[^/]*$/.test(onDrive))
      return critical
        ? refuse("root, home, tmp, other_critical_path", `the target ${target.raw} is the file system root, the home directory, or a top-level directory`,
          "Remove a deeper path, and write it as a literal absolute path.")
        : null
    },
  },
  {
    name: "working-directory",
    judge: ({ target, path, workingDirectories }) => path !== null && !hasGlob(path.base) && workingDirectories.some((directory) => withinOrEqual(path.base, directory))
      ? refuse("working_directory", `the target ${target.raw} is a working directory of this session, or a parent of one`,
        "Remove the named entries inside it, each as a literal path.")
      : null,
  },
  {
    name: "mounted-drive",
    judge: ({ target, path }) => path !== null && MOUNTED_DRIVE.test(path.base)
      ? refuse("mounted_drive_path", `the target ${target.raw} is a mounted drive, the directory that holds mounted drives, or an entry at the top level of a drive`,
        "Name the deeper entry by its full literal path.")
      : null,
  },
  {
    name: "unreadable-script",
    judgeCommand: ({ command }) => !quotesAreBalanced(stripHeredocBodies(command)) ||
      (INLINE_SCRIPT.test(command) && (UNREADABLE_SCRIPT.test(command) || command.length > INLINE_SCRIPT_MAX_LENGTH))
      ? refuse("inline_shell_unchecked, eval_trap_string, unparsed_line", "the command runs a removal inside a script or a quoted string that no check can read with certainty",
        "Run each removal as its own direct command, with a literal path.")
      : null,
  },
]

/** Where a literal target lands, or null while a guarded variable that this check cannot read remains in it. */
function placeTarget(target, { directory, home }) {
  const literal = target.value.replace(/\$\{HOME:\?[^}]*\}/g, home).replace(/\$\{PWD:\?[^}]*\}/g, directory).replace(/^~(?=\/|$)/, home)
  if (literal.includes("$")) return null
  const full = canonical(ROOTED.test(literal) ? literal : `${directory}/${literal}`)
  return { full, base: full.replace(TRAILING_STARS, "") || "/" }
}

function quotesAreBalanced(source) {
  let quote = ""
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (character === "\\" && quote !== "'") { index++; continue }
    if (quote) { if (character === quote) quote = "" } else if (character === '"' || character === "'") quote = character
  }
  return quote === ""
}

/** The first refusal in `source`, with the count of removals it runs; a nested script is read in the directory that reaches it. */
function inspectRemovals(source, context, rules) {
  let found = null
  let removals = 0
  inspectCommands(stripHeredocBodies(source), { directory: context.directory, moved: false }, (segment, state) => {
    const words = commandWords(segment)
    for (const script of nestedScripts(words)) {
      const nested = inspectRemovals(script, { ...context, directory: state.directory }, rules)
      removals += nested.removals
      found ??= nested.found
    }
    for (const invocation of removalInvocations(words)) {
      removals++
      const { flags, targets } = removalTargets(invocation)
      for (const target of targets) {
        const judged = { ...context, ...state, target, flags, program: invocation.program, path: placeTarget(target, { ...context, ...state }) }
        for (const rule of rules) {
          const refusal = rule.judge?.(judged)
          if (refusal) found ??= { ...refusal, rule: rule.name, program: invocation.program, segment: segment.trim() }
        }
      }
    }
    const program = programName(readWord(words[0] ?? "").value)
    if (!["cd", "pushd", "popd"].includes(program)) return state
    const destination = readWord(words[1] ?? "")
    const known = program === "cd" && words[1] !== undefined && destination.expansions.length === 0 && !destination.substitution
    return { moved: true, directory: known ? canonical(ROOTED.test(destination.value) ? destination.value : `${state.directory}/${destination.value}`) : state.directory }
  })
  return { found, removals }
}

/** A run that no person watches: a launched worker, or the session that owns a `sleep: true` run record, with its subagents. */
export const isUnattendedRun = ({ env = {}, state = null, sessionId = "" } = {}) =>
  Boolean(env[LAUNCHER_MARKER]) ||
  // A record from an earlier run must not bind another session; checkSleepStop (rules-sleep.mjs) applies the same rule.
  (state?.sleep === true && (typeof state.sessionId !== "string" || state.sessionId === "" || sessionId === "" || state.sessionId === sessionId))

/**
 * @param command the Bash command about to run
 * @param options `{ cwd, home, workingDirectories, rules, windows }`; `rules` defaults to every removal rule
 * @returns `{ block, message, rule }` when Claude Code would hold the command for an approval, else null
 */
export function checkApprovalPrompt(command, { cwd = "", home = homedir(), workingDirectories = [], rules = REMOVAL_RULES, windows = process.platform === "win32" } = {}) {
  if (typeof command !== "string" || !/rm/i.test(command)) return null
  const directory = canonical(cwd || "/")
  const context = { command, directory, windows: windows || /^[A-Za-z]:[\\/]/.test(cwd), home: canonical(home), workingDirectories: [directory, ...workingDirectories.map(canonical)] }
  const { found, removals } = inspectRemovals(command, context, rules)
  const whole = removals === 0 ? [] : rules.flatMap((rule) => {
    const refusal = rule.judgeCommand?.(context)
    return refusal ? [{ ...refusal, rule: rule.name, program: "rm", segment: command.trim() }] : []
  })
  const refusal = found ?? whole[0]
  if (!refusal) return null
  return {
    block: true,
    rule: refusal.rule,
    message:
      `Refused in an unattended run: Claude Code holds this ${refusal.program} for an approval, and no person is present to give it.\n` +
      `  ${refusal.segment.slice(0, 240)}\n\n` +
      `Reason: ${refusal.why}.\n` +
      `Claude Code check: dangerous removal (${refusal.covers}). No permission rule allows it without a person.\n\n` +
      `${refusal.rewrite}\n` +
      "Then run the command again. Do not put the removal in a script file to pass this check.\n",
  }
}
