// Refuses, in an unattended run, each call that waits for a person: a tool such as `AskUserQuestion`, and a
// shell command that Claude Code holds for an approval in every permission mode. The only such hold with a
// command shape is the dangerous removal check on `rm` and `rmdir` of the Bash and Monitor tools. Each rule
// refuses a superset of the `removalRule` values it names: the analyzer behind them is not a stable interface.
// ./README.md lists the checks, their source, and the ones that no command shape can predict.

import { homedir } from "node:os"
import { posix } from "node:path"

import { SUBSTITUTION } from "./command-expander.mjs"
import { BRACE_EXPANSION, invocationsOf, PLAIN_SUBSET_ADVICE, programName, readCommand, walkCommands } from "./shell-subset.mjs"

/** The tools whose permission check runs the Claude Code removal check. Each one takes the shell command as `tool_input.command`. */
export const REMOVAL_CHECK_TOOLS = ["Bash", "Monitor"]

/**
 * The tools that wait for the answer of a person with no limit: Claude Code 2.1.325 marks each one with
 * `requiresUserInteraction() { return true }`. `.claude/settings.json` registers the hook on each name.
 */
export const PERSON_PROMPT_TOOLS = ["AskUserQuestion", "OfferChromeSetup", "PublishPlugin", "SendToProject", "ShowOnboardingRolePicker"]

/** The launcher exports this into every worker it starts (tools/launch-worker.mjs). A worker is headless. */
const LAUNCHER_MARKER = "ORBIT_LAUNCH_WORKER"

const EXPANSION = /^\$(?:\{([^}]*)\}|([A-Za-z_][A-Za-z0-9_]*|[0-9@*#?!$-]))/
const GUARDED = /^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+):\?/
const SIMPLE_NAME = /^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+)$/
const MOUNTED_DRIVE = /^\/(?:system\/)?volumes(?:\/[^/]+){0,2}$|^\/mnt\/(?:[^/]+|[a-z]\/[^/]+)$|^\/(?:run\/)?media(?:\/[^/]+){0,3}$/i
const TRAILING_STARS = /(?:\/\*+)+\/*$/
const ROOTED = /^(?:[\\/]|[A-Za-z]:[\\/])/

/** `rm` or `rmdir` when the parsed word names one. */
const removalProgram = (word) => ["rm", "rmdir"].find((name) => name === programName(word.text)) ?? null

/**
 * One command word as the shell reads it: `value` with the quotes removed and each expansion kept as written,
 * `bare` holding only the unquoted characters, and every `$` expansion outside single quotes.
 */
function readWord(raw) {
  const word = { raw, value: "", bare: "", expansions: [], substitution: raw.includes(SUBSTITUTION) }
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

/** Every `rm` or `rmdir` that the parsed words of a command run: behind assignments and wrappers, and after `find -exec`. Each argument is the word as written. */
const removalInvocations = (words) => invocationsOf(words).filter(({ program }) => removalProgram(program))
  .map(({ program, args }) => ({ program: removalProgram(program), args: args.map((word) => word.raw) }))

/** The operands of one removal: flags and the `find -exec` terminator are not targets. The parsed words hold no redirect. */
function removalTargets({ args }) {
  const flags = []
  const targets = []
  let operandsOnly = false
  for (let index = 0; index < args.length; index++) {
    const word = args[index]
    if ([";", "\;", "+", "{}"].includes(word)) continue
    if (!operandsOnly && word === "--") { operandsOnly = true; continue }
    if (!operandsOnly && word.startsWith("-")) flags.push(word)
    else targets.push(readWord(word))
  }
  return { flags, targets }
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
 * and `judgeUnread` for a command outside the modelled subset, which no other rule can read. `covers` names the `removalRule` values of the Claude Code check that the
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
    // Fail safe: the rules above read only the parsed words of the modelled subset, so a command outside it has no reading.
    name: "not-modelled",
    judgeUnread: ({ notModelled }) => notModelled
      ? refuse("inline_shell_unchecked, eval_trap_string, unparsed_line", `the command holds ${notModelled}, which is outside the plain shell subset that the hook reads exactly`, PLAIN_SUBSET_ADVICE)
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

/** The first refusal of a rule for one removal, or null. `placed` holds the directory in which the removal runs. */
function judgeInvocation(invocation, segment, placed, rules) {
  const { flags, targets } = removalTargets(invocation)
  for (const target of targets) {
    const judged = { ...placed, target, flags, program: invocation.program, path: placeTarget(target, placed) }
    for (const rule of rules) {
      const refusal = rule.judge?.(judged)
      if (refusal) return { ...refusal, rule: rule.name, program: invocation.program, segment: segment.trim() }
    }
  }
  return null
}

/** The first refusal in the parsed `list`, and the construct that the walk cannot read, or "". */
function inspectRemovals(list, context, rules) {
  let found = null
  // The reader keeps a `cd` only as a whole command `cd PATH` at the top level, with a literal path or a variable that the line sets.
  const unread = walkCommands(list, { directory: context.directory, moved: false }, ({ words }, state) => {
    for (const invocation of removalInvocations(words)) {
      found ??= judgeInvocation(invocation, words.map((word) => word.raw).join(" "), { ...context, ...state }, rules)
    }
    if (words[0]?.text !== "cd") return state
    const destination = words[1].text
    return { moved: true, directory: canonical(ROOTED.test(destination) ? destination : `${state.directory}/${destination}`) }
  })
  return { found, unread }
}

/** The parsed commands as text, for a rule that reads the whole command: each assignment and each word as written, and no heredoc body. */
function parsedText(list) {
  const commands = []
  walkCommands(list, null, ({ assignments, words }) => { commands.push([...assignments, ...words].map((word) => word.source).join(" ")); return null })
  return commands.join(" ; ")
}

/** A run that no person watches: a launched worker, or the session that owns a `sleep: true` run record, with its subagents. */
export const isUnattendedRun = ({ env = {}, state = null, sessionId = "" } = {}) =>
  Boolean(env[LAUNCHER_MARKER]) ||
  // A record from an earlier run must not bind another session; checkSleepStop (rules-sleep.mjs) applies the same rule.
  (state?.sleep === true && (typeof state.sessionId !== "string" || state.sessionId === "" || sessionId === "" || state.sessionId === sessionId))

/**
 * @param toolName the `tool_name` of a PreToolUse payload
 * @returns `{ block, message, rule }` when the tool waits for a person to answer, else null
 */
export function checkPersonPrompt(toolName) {
  if (!PERSON_PROMPT_TOOLS.includes(toolName)) return null
  return {
    block: true,
    rule: "person-prompt",
    message:
      `Refused in an unattended run: ${toolName} waits for a person to answer, and no person is present. The run would stop until one answers.\n\n` +
      "Decide yourself. Take the best option, not the easiest one, and write the decision and its reason to the decision log " +
      "(`decisionLogPath` in the run state; a launched worker writes it to the assumptions section that its order names).\n" +
      "Only for a real owner question, which no tool, file or account can answer: add a `{ question, blocks }` row to " +
      "`openOwnerQuestions` through `updateRunState` in tools/lib/run-state.mjs, then ask it in plain reply text. " +
      "Plain reply text never blocks the run. Then continue with the work that the question does not block.\n",
  }
}

/**
 * @param command the shell command about to run, from a tool in `REMOVAL_CHECK_TOOLS`
 * @param options `{ cwd, home, workingDirectories, rules, windows }`; `rules` defaults to every removal rule
 * @returns `{ block, message, rule }` when Claude Code would hold the command for an approval, else null
 */
export function checkApprovalPrompt(command, { cwd = "", home = homedir(), workingDirectories = [], rules = REMOVAL_RULES, windows = process.platform === "win32" } = {}) {
  if (typeof command !== "string") return null
  const directory = canonical(cwd || "/")
  const read = readCommand(command, { home })
  const context = { command: parsedText(read.list), notModelled: read.notModelled, directory, windows: windows || /^[A-Za-z]:[\\/]/.test(cwd), home: canonical(home), workingDirectories: [directory, ...workingDirectories.map(canonical)] }
  const { found, unread } = inspectRemovals(read.list, context, rules)
  context.notModelled ||= unread
  const unreadRefusal = rules.flatMap((rule) => {
    const judged = rule.judgeUnread?.(context)
    return judged ? [{ ...judged, rule: rule.name, segment: command.trim() }] : []
  })[0]
  const refusal = unreadRefusal ?? found
  if (!refusal) return null
  const held = refusal.program
    ? `Refused in an unattended run: Claude Code holds this ${refusal.program} for an approval, and no person is present to give it.`
    : "Refused in an unattended run: the hook cannot read this command exactly, so it cannot prove that Claude Code holds no part of it for an approval. No person is present to give one."
  return {
    block: true,
    rule: refusal.rule,
    message:
      `${held}\n` +
      `  ${refusal.segment.slice(0, 240)}\n\n` +
      `Reason: ${refusal.why}.\n` +
      `Claude Code check: dangerous removal (${refusal.covers}). No permission rule allows it without a person.\n\n` +
      `${refusal.rewrite}\n` +
      (refusal.program ? "Then run the command again. Do not put the removal in a script file to pass this check.\n" : "Then run the command again.\n"),
  }
}
