import { readFileSync } from "node:fs"
import { homedir } from "node:os"

// Inspect executable shell bodies without executing any part of the supplied command.

export const commandWords = (source) =>
  (source.match(/(?:[^\s"'\\]|\\.|"(?:\\.|[^"\\])*"|'[^']*')+/g) ?? [])
    .map((word) => word.replace(/^[()]+|[()]+$/g, ""))

export const shellValue = (word) => String(word ?? "").replace(/^(["'])([\s\S]*)\1$/, "$2").replace(/\\([\\"$`])/g, "$1")

/** Stands for a command substitution in the command that holds it. */
export const SUBSTITUTION = "__substitution__"

const REDIRECT_OPERATOR = /<<<|<<-?|>>|>&|<&|>\||<>|[<>]/y
const REDIRECT_TARGET = /[ \t]*(?:\$'(?:\\.|[^'\\])*'|[^\s"'\\<>&|;]|\\.|"(?:\\.|[^"\\])*"|'[^']*')*/y

/** True when the `$` at `index` ends a run of `$` with an odd count. bash reads each pair `$$` as the process id, and a backslash escapes the first `$`. */
const endsOddDollarRun = (source, index) => {
  let start = index
  while (source[start - 1] === "$") start--
  let backslashes = 0
  while (source[start - 1 - backslashes] === "\\") backslashes++
  return (index - start + 1 - (backslashes % 2)) % 2 === 1
}

/**
 * The quote that opens at `index` outside a quote: `'`, `"`, or the ANSI-C quote `$'`, in which a backslash escapes the next character.
 * This is the bash reading: after a pair `$$` the quote is a plain one. `inspectCommands` adds the zsh reading.
 */
const quoteOpenedAt = (source, index) => {
  if (source[index] === "$" && source[index + 1] === "'" && endsOddDollarRun(source, index)) return "$'"
  return source[index] === "'" || source[index] === '"' ? source[index] : ""
}

/** An unescaped run of `$` with an even count before a `'`. zsh reads an ANSI-C quote there, and bash reads a plain quote. */
const EVEN_DOLLAR_RUN = /(?<!\$)(?<!(?<!\\)(?:\\\\)*\\)(?:\$\$)+(?=')/g

/**
 * The command without its redirects: each unquoted operator, the file descriptor or the `&` before it, and its target word.
 * The shell cuts a redirect from a word with or without a space. A here-string is a redirect of standard input, so it goes too.
 */
export function withoutRedirects(command) {
  let kept = ""
  let quote = ""
  for (let index = 0; index < command.length; index++) {
    const character = command[index]
    if (character === "\\" && quote !== "'") { kept += command.slice(index, index + 2); index++; continue }
    if (quote) {
      if (character === quote.at(-1)) quote = ""
      kept += character
      continue
    }
    quote = quoteOpenedAt(command, index)
    if (quote) { kept += quote; index += quote.length - 1; continue }
    REDIRECT_OPERATOR.lastIndex = index
    const operator = REDIRECT_OPERATOR.exec(command)?.[0]
    if (!operator) { kept += character; continue }
    REDIRECT_TARGET.lastIndex = index + operator.length
    const target = REDIRECT_TARGET.exec(command)[0]
    kept = `${kept.replace(/(?:(?<!\S)\d+|&)$/, "")} `
    index += operator.length + target.length - 1
  }
  return kept
}

const ANSI_C_ESCAPES = { n: "\n", t: "\t" }

/** The text of a word after the shell removes its quotes and its escapes. A `$` expansion stays as written. */
function unquotedWord(word) {
  let text = ""
  let quote = ""
  for (let index = 0; index < word.length; index++) {
    const character = word[index]
    const next = word[index + 1] ?? ""
    if (character === "\\" && quote === "$'") { text += ANSI_C_ESCAPES[next] ?? next; index++; continue }
    if (character === "\\" && (quote === "" || (quote === '"' && /["\\$`]/.test(next)))) { text += next; index++; continue }
    if (quote) {
      if (character === quote.at(-1)) quote = ""
      else text += character
      continue
    }
    quote = quoteOpenedAt(word, index)
    if (quote) index += quote.length - 1
    else text += character
  }
  return text
}

/** The text after the delimiter runs to the end of the operator line. A backslash before a line end continues the line. */
const HEREDOC_OPENER = /<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1((?:\\[\s\S]|[^\n\\])*)\n/y

/** The heredoc whose operator is at `index`, or null. The terminator is a line that is the delimiter and nothing more; `<<-` also removes its leading tabs. */
function heredocAt(command, index) {
  HEREDOC_OPENER.lastIndex = index
  const opener = HEREDOC_OPENER.exec(command)
  if (!opener) return null
  const bodyStart = index + opener[0].length
  const terminator = new RegExp(`^${command[index + 2] === "-" ? "\\t*" : ""}${opener[2]}$`, "gm")
  terminator.lastIndex = bodyStart
  const closed = terminator.exec(command)
  if (!closed) return null
  return { start: index, end: closed.index + closed[0].length, bodyStart, quote: opener[1], restOfLine: opener[3], body: command.slice(bodyStart, closed.index) }
}

/**
 * Each heredoc of the command, in order. The shell reads the operator only outside a quote, an escape and a comment.
 * A heredoc runs from `start`, at its operator, to `end`, after its terminator. `lineStart` is the start of the outermost
 * command line that holds the operator, so a substitution that opens on an earlier line is part of that line.
 */
export function heredocsOf(command) {
  const heredocs = []
  const substitutions = []
  let quote = ""
  let lineStart = 0
  let open = null
  for (let index = 0; index < command.length; index++) {
    if (open && index >= open.bodyStart - 1) { index = open.end - 1; open = null; continue }
    const character = command[index]
    if (character === "\\" && quote !== "'") { index++; continue }
    if (quote.endsWith("'")) { if (character === "'") quote = ""; continue }
    if (character === "`") {
      if (substitutions.at(-1)?.backtick && quote === "") quote = substitutions.pop().quote
      else { substitutions.push({ quote, backtick: true, depth: 0 }); quote = "" }
      continue
    }
    if (character === "$" && command[index + 1] === "(") { substitutions.push({ quote, backtick: false, depth: 0 }); quote = ""; index++; continue }
    if (quote) { if (character === '"') quote = ""; continue }
    quote = quoteOpenedAt(command, index)
    if (quote) { index += quote.length - 1; continue }
    const substitution = substitutions.at(-1)
    if (character === "(" && substitution && !substitution.backtick) { substitution.depth++; continue }
    if (character === ")" && substitution && !substitution.backtick) { if (substitution.depth-- === 0) quote = substitutions.pop().quote; continue }
    if (character === "\n" && substitutions.length === 0) { lineStart = index + 1; continue }
    if (character === "#" && (index === 0 || /[\s;|&()]/.test(command[index - 1]))) {
      const lineEnd = command.indexOf("\n", index)
      if (lineEnd < 0) break
      index = lineEnd - 1
      continue
    }
    if (character !== "<" || command[index + 1] !== "<" || open) continue
    if (command[index + 2] === "<") { index += 2; continue }
    const found = heredocAt(command, index)
    if (!found) { index++; continue }
    open = found
    heredocs.push({ ...open, lineStart })
    index = open.bodyStart - 1 - open.restOfLine.length - 1
  }
  return heredocs
}

function substitutionEnd(source, start, backtick) {
  let depth = 1
  let quote = ""
  for (let index = start; index < source.length; index++) {
    const character = source[index]
    if (character === "\\" && (backtick || quote !== "'")) { index++; continue }
    if (backtick && character === "`") return index
    if (quote) {
      if (character === quote.at(-1)) quote = ""
      continue
    }
    quote = quoteOpenedAt(source, index)
    if (quote) { index += quote.length - 1; continue }
    if (!backtick && character === "(") depth++
    if (!backtick && character === ")" && --depth === 0) return index
  }
  return source.length
}

/** Heredoc data expands substitutions regardless of surrounding literal quote characters. */
export function expandHeredocSubstitutions(source) {
  const commands = []
  for (let index = 0; index < source.length; index++) {
    if (source[index] === "\\") { index++; continue }
    const backtick = source[index] === "`"
    if (!backtick && !(source[index] === "$" && source[index + 1] === "(" && source[index + 2] !== "(")) continue
    const start = index + (backtick ? 1 : 2)
    const end = substitutionEnd(source, start, backtick)
    const body = source.slice(start, end)
    commands.push(...expandCommands(backtick ? body.replace(/\\([\\$`])/g, "$1") : body))
    index = end
  }
  return commands
}

function splitCommands(source) {
  const segments = []
  let nested = []
  let current = ""
  let quote = ""
  let pipeline = false
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (!quote && character === "#" && (index === 0 || /[\s;|&()]/.test(source[index - 1]))) {
      const newline = source.indexOf("\n", index)
      if (newline < 0) break
      index = newline - 1
      continue
    }
    if (character === "\\" && quote !== "'") { current += source.slice(index, index + 2); index++; continue }
    const substitution = !quote.endsWith("'") && (character === "`" || (character === "$" && source[index + 1] === "("))
    if (substitution) {
      const start = index + (character === "`" ? 1 : 2)
      const end = substitutionEnd(source, start, character === "`")
      const body = source.slice(start, end)
      nested.push(character === "`" ? body.replace(/\\([\\$`])/g, "$1") : body)
      current += ` ${SUBSTITUTION} `
      index = end
      continue
    }
    if (quote) {
      if (character === quote.at(-1)) quote = ""
      current += character
      continue
    }
    quote = quoteOpenedAt(source, index)
    if (quote) { current += quote; index += quote.length - 1; continue }
    if (character === "(") {
      const end = substitutionEnd(source, index + 1, false)
      nested.push(source.slice(index + 1, end))
      current += " __subshell__ "
      index = end
      continue
    }
    const redirect = (character === "|" && current.endsWith(">")) || (character === "&" && (/[<>]$/.test(current) || source[index + 1] === ">"))
    if (!redirect && /[&|;\n]/.test(character)) {
      const doubled = /[&|]/.test(character) && source[index + 1] === character
      const isolated = !doubled && /[&|]/.test(character)
      segments.push({ command: current, nested, isolated: pipeline || isolated, pipesOut: character === "|" && !doubled })
      pipeline = character === "|" && !doubled
      if (doubled || (pipeline && source[index + 1] === "&")) index++
      current = ""
      nested = []
      continue
    }
    current += character
  }
  segments.push({ command: current, nested, isolated: pipeline, pipesOut: false })
  return { segments, unbalanced: quote !== "" }
}

/**
 * The simple commands that get the input that `marker` stands for, such as a heredoc operator.
 * `readers` can read it as standard input: the command that holds `marker`, each later command of its pipeline, and the commands
 * of a subshell among them. `holders` get it as text in their words: each command with a nested body that holds `marker`.
 */
export function commandsFedBy(source, marker, depth = 0) {
  if (depth > 32) throw new Error("shell expansion nesting exceeds inspection limit")
  const { segments } = splitCommands(source)
  const start = segments.findIndex(({ command, nested }) => command.includes(marker) || nested.some((body) => body.includes(marker)))
  if (start < 0) return { readers: [], holders: [] }
  let end = start
  while (segments[end].pipesOut && end + 1 < segments.length) end++
  const holder = segments[start]
  const direct = holder.command.includes(marker)
  const inner = direct ? { readers: [], holders: [] } : commandsFedBy(holder.nested.find((body) => body.includes(marker)), marker, depth + 1)
  const stages = segments.slice(direct ? start : start + 1, end + 1)
  return {
    readers: [...inner.readers, ...stages.flatMap(({ command, nested }) =>
      [command.replace(marker, " "), ...(command.includes("__subshell__") ? nested.flatMap((body) => expandCommands(body)) : [])])],
    holders: direct ? [] : [...inner.holders, holder.command],
  }
}

function wrapperBody(segment) {
  const words = commandWords(segment)
  while (/^\w+\+?=/.test(words[0] ?? "")) words.shift()
  // The shell removes each quote of the word. A backslash stays a path separator for a Windows path.
  const names = [shellValue(words[0]), unquotedWord(words[0] ?? "")].map((value) => value.split(/[\\/]/).pop())
  if (names.includes("eval")) {
    const redirect = words.findIndex((word, index) => index > 0 && /^\d*[<>]/.test(word))
    const end = redirect < 0 ? words.length : redirect
    return {
      source: words.slice(1, end).map(unquotedWord).join(" "),
      command: ["eval", "__shell_body__", ...words.slice(end)].join(" "),
      isolated: false,
    }
  }
  if (!names.some((name) => ["sh", "bash", "zsh"].includes(name))) return null
  const flag = words.findIndex((word, index) => index > 0 && /^-[a-z]*c[a-z]*$/i.test(word))
  if (flag < 0) return null
  const source = unquotedWord(words[flag + 1] ?? "")
  words[flag + 1] = "__shell_body__"
  return { source, command: words.join(" "), isolated: true }
}

/** Each nested environment inherits the state at its invocation; only eval updates its caller. */
export function inspectCommands(source, state, inspect, depth = 0) {
  if (depth > 32) throw new Error("shell expansion nesting exceeds inspection limit")
  const { segments, unbalanced } = splitCommands(source)
  for (const { command, nested, isolated } of segments) {
    for (const body of nested) inspectCommands(body, state, inspect, depth + 1)
    const wrapper = wrapperBody(command)
    if (wrapper) {
      inspect(wrapper.command, state)
      const updated = inspectCommands(wrapper.source, state, inspect, depth + 1)
      if (!wrapper.isolated && !isolated) state = updated
    } else {
      const updated = inspect(command.trim(), state)
      if (!isolated) state = updated
    }
  }
  if (unbalanced) inspectCommands(source.replace(/["']/g, ""), state, inspect, depth + 1)
  const zshReading = source.replace(EVEN_DOLLAR_RUN, "$")
  if (zshReading !== source) inspectCommands(zshReading, state, inspect, depth + 1)
  return state
}

/** Stateless consumers still inspect every executable body in invocation order. */
export function expandCommands(source) {
  const expanded = []
  inspectCommands(source, null, (command) => { expanded.push(command); return null })
  return expanded
}

// ---------------------------------------------------------------------------
// The modelled subset. `readCommand` reads one small grammar, with an allow list of command words, builtins and shells, and names
// each other construct as not modelled. The git rule and the approval rule read only its parsed words. ./README.md lists the grammar.
// ---------------------------------------------------------------------------

/** The POSIX shells. The reader allows one only with a script file, and never with `-c` or a script from standard input. */
const SCRIPT_SHELLS = ["bash", "sh", "zsh", "dash", "ksh", "ksh93", "mksh", "oksh", "loksh", "ash", "hush", "rbash", "yash", "posh"]
/** The basenames of the shells that `/etc/shells` lists on this machine. A missing file adds none. */
const listedShells = () => {
  try {
    return readFileSync("/etc/shells", "utf8").split("\n").map((line) => line.trim()).filter((line) => line.startsWith("/")).map((line) => line.split("/").pop())
  } catch {
    return []
  }
}
/** Each shell name that the reader knows: the POSIX shells, the other known shells, and each shell of `/etc/shells`. The reader refuses each shell that is not a POSIX shell. */
export const SHELLS = [...new Set([...SCRIPT_SHELLS, "csh", "tcsh", "fish", "pwsh", "powershell", "nu", "elvish", "xonsh", "ion", "rc", "es", "scsh", "sash", "busybox", ...listedShells()])]
/** Programs that run the command that follows them. */
const WRAPPERS = new Set(["sudo", "doas", "exec", "command", "builtin", "noglob", "env", "nice", "nohup", "time", "timeout", "stdbuf", "setsid", "ionice", "pkexec", "xargs"])
/**
 * The programs that run another program, or read an action that runs one, from their words: each wrapper, `find`, `git` and each shell.
 * `xargs` adds words from standard input, which no rule reads, so the reader refuses an `xargs` that runs one of them.
 */
const runsProgram = (name) => WRAPPERS.has(name) || name === "find" || name === "git" || SHELLS.includes(name)
/**
 * The wrappers that run their command as another user. `sudo` runs it in the directory that `-D` or the `runcwd` of its policy names,
 * `pkexec` runs it in the home directory of that user, and each one gives git the home and the config of that user. The reader refuses each one.
 */
const USER_WRAPPERS = new Set(["sudo", "doas", "pkexec"])
/**
 * The allow list of the options of each wrapper, each with the number of words that it takes as its value. A short option with a
 * value can also hold the value in its own word, such as `-n5` or `-oL`. A wrapper that is not named here takes no option. Each other
 * word that starts with `-` before the command word is not modelled, so no spelling of an option that gives a wrapper a shell, a
 * script, a program directory, another directory or another environment passes. `env` also takes `NAME=value` words.
 */
const WRAPPER_OPTIONS = {
  env: { "--": 0 },
  nice: { "-n": 1 },
  timeout: { "-s": 1, "-k": 1, "--preserve-status": 0, "--foreground": 0 },
  time: { "-p": 0 },
  stdbuf: { "-i": 1, "-o": 1, "-e": 1 },
  command: { "-v": 0, "-V": 0 },
  ionice: { "-c": 1, "-n": 1 },
  xargs: { "-0": 0, "-r": 0, "-t": 0, "-n": 1, "-L": 1, "-P": 1, "-I": 1, "-d": 1 },
}
/** The duration word that `timeout` takes after its options. */
const TIMEOUT_DURATION = /^\d+(?:\.\d+)?[smhd]?$/
/** The words that end a list of the grammar: `then`, `else` and `fi` of `if`, and `do` and `done` of `for`. */
const TERMINATORS = new Set(["then", "else", "fi", "do", "done"])
/** Reserved words of a compound command outside the grammar. */
const REFUSED_KEYWORDS = new Set(["while", "until", "case", "esac", "select", "function", "coproc", "elif", "!", "in"])
/** Unquoted words that bash or zsh read as a group, a condition or the end of one. */
const REFUSED_WORDS = new Set(["{", "}", "[[", "]]"])
/** Each one reads a word again as code, changes how the shell reads a command, or changes the flow or the directory in a way that the grammar does not model. */
const CODE_BUILTINS = new Set(["eval", "source", ".", "alias", "unalias", "trap", "setopt", "unsetopt", "emulate", "shopt", "enable", "disable", "let", "sched", "zmodload",
  "zpty", "autoload", "hash", "fc", "r", "functions", "unfunction", "break", "continue", "pushd", "popd", "chdir", "read", "getopts", "mapfile", "readarray", "zformat",
  "zparseopts", "zstyle", "vared", "strftime", "zstat", "sysread", "getln", "print", "integer", "float", "private"])
/**
 * The builtins that the reader allows, each with its rule in `checkCommand`: `cd` is followed, `set` takes only -e, -u and -x, `printf` takes no -v,
 * and `export`, `local`, `readonly`, `declare`, `typeset` and `unset` take only names and `NAME=value` words. No other builtin assigns a name.
 */
const ALLOWED_BUILTINS = ["cd", "echo", "printf", "test", "[", "true", "false", ":", "pwd", "export", "local", "readonly", "declare", "typeset", "unset", "set", "exit",
  "type", "kill"]
/** The programs that the reader allows as a command word. A program that runs code from its arguments or from a file, such as `node`, is a limit that ./README.md names. */
const ALLOWED_PROGRAMS = ["git", "gh", "node", "npm", "npx", "pnpm", "yarn", "turbo", "tsc", "vitest", "eslint", "prettier", "dotnet", "cargo", "rustc", "cat", "head", "tail",
  "grep", "egrep", "fgrep", "rg", "cut", "sed", "awk", "wc", "sort", "uniq", "tr", "jq", "ls", "mkdir", "cp", "mv", "touch", "ln", "chmod", "date", "basename", "dirname",
  "sleep", "rm", "rmdir", "find", "diff", "cmp", "comm", "paste", "column", "fold", "nl", "rev", "seq", "expr", "realpath", "readlink", "tee", "stat", "file", "du", "df",
  "shasum", "sha256sum", "md5", "md5sum", "base64", "xxd", "od", "hexdump", "strings", "iconv", "mktemp", "printenv", "uname", "whoami", "id", "hostname", "ps", "lsof",
  "curl", "which", "man", "sw_vers"]
/** Each command word that the reader allows: the wrappers that do not change the user, the allowed builtins, the allowed programs and the POSIX shells. Each other command word is refused. */
export const KNOWN_COMMAND_WORDS = [...new Set([...WRAPPERS, ...ALLOWED_BUILTINS, ...ALLOWED_PROGRAMS, ...SCRIPT_SHELLS])].filter((word) => !USER_WRAPPERS.has(word))
/** zsh runs the words after each one as a command, or reads it as a part of a compound command. bash reads the name of a program. */
const ZSH_COMMAND_WORDS = new Set(["nocorrect", "repeat", "-", "always", "foreach"])
/** Builtins whose words are names or assignments. The reader allows only a name and `NAME=value` there, with no option. */
const DECLARATION_BUILTINS = new Set(["export", "declare", "typeset", "local", "readonly", "unset"])
/**
 * Assignments that change how the shell reads or traces a command, where `cd` or `~` goes, or which repository, config file or program git uses.
 * `HOME` gives `~` and the global git config, each `XDG_*` name gives the git config, attributes and ignore files, `PWD` and `OLDPWD` give
 * `~+`, `~-` and `cd -`, and `USERPROFILE`, `HOMEDRIVE` and `HOMEPATH` give the home of git on Windows.
 */
const REFUSED_ASSIGNMENT = /^(?:PS[1-4]|PROMPT[2-4]?|RPROMPT2?|RPS[12]|SPROMPT|PROMPT_COMMAND|IFS|BASH_ENV|ENV|CDPATH|cdpath|SHELLOPTS|BASHOPTS|ZDOTDIR|PATH|path|FPATH|fpath|NULLCMD|READNULLCMD|EDITOR|VISUAL|PAGER|SSH_ASKPASS|LD_\w+|DYLD_\w+|GIT_\w*|HOME|XDG_\w+|PWD|OLDPWD|USERPROFILE|HOMEDRIVE|HOMEPATH)$/
/** zsh parameters with a lower case name that the shell sets or ties to another parameter. The reader tracks no value for them. */
const SPECIAL_LOWER_CASE = new Set(["argv", "cdpath", "fpath", "path", "manpath", "mailpath", "module_path", "psvar", "watch", "fignore", "match", "mbegin", "mend", "reply",
  "status", "pipestatus", "signals", "options", "commands", "functions", "aliases", "builtins", "parameters", "history", "historywords", "dirstack", "funcstack", "_"])
const TRACKED_NAME = /^[a-z_][a-z0-9_]*$/
const ASSIGNMENT_WORD = /^([A-Za-z_][A-Za-z0-9_]*)(\+?)=/
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
/** The `find` actions that run their command in the shell directory. */
const FIND_EXEC = /^-(?:exec|ok)$/
/** The `find` actions that run their command in the directory of each found file. */
const FIND_EXEC_IN_FOUND_DIRECTORY = /^-(?:execdir|okdir)$/
/** Each `find` action that runs a program. */
const FIND_RUNNER_ACTION = /^-(?:exec|execdir|ok|okdir)$/
/** An unquoted first character that the shell keeps as the first character of each word that it makes: no option, glob, brace, `~` or `=` start. */
const LITERAL_FIRST_CHARACTER = /^[A-Za-z0-9_./]/
const PARAMETER = /[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?!$-]/y
/** `${NAME}` and the guard `${NAME:?message}`. Each other `${...}` form has an operator. */
const BRACED_PARAMETER = /\{[A-Za-z_][A-Za-z0-9_]*(?::\?[^}$`"'\\\n]*)?\}/y
const HEREDOC_DELIMITER = /[ \t]*(?:'([A-Za-z_][A-Za-z0-9_]*)'|"([A-Za-z_][A-Za-z0-9_]*)")/y
const DUPLICATE_TARGET = /(?:\d+|-)(?=[\s;&|)]|$)/y
const BRACE_EXPANSION = /\{[^{}]*(?:,|\.\.)[^{}]*\}/
/** zsh reads `<N-M>`, `<N->`, `<-M>` and `<->` in a word as a glob that matches a number. */
const ZSH_NUMERIC_GLOB = /^<\d*-\d*>/
const WORD_END = /[ \t\n;&|<>()]/
/** After these, bash and zsh both read a `$` as the character. */
const PLAIN_AFTER_DOLLAR = /[\s"|)/.,%\\>\];&}<]/
/** A variable value that bash and zsh both give unquoted as one word with no change: no split, no glob, no tilde. */
const PLAIN_VALUE = /^[A-Za-z0-9_./:@%+,-]+$/
const MAX_LENGTH = 100_000
const MAX_DEPTH = 16
const MAX_STATES = 64
const MAX_VISITS = 20_000

/** The program that a word names: its last path part, with no `.exe`, in lower case. */
export const programName = (text) => String(text ?? "").split(/[\\/]/).pop().replace(/\.exe$/i, "").toLowerCase()

class NotModelled extends Error {}
const notModelled = (construct) => { throw new NotModelled(construct) }

/** Only printable ASCII, a space, a tab and a line end are read outside a quote. Each other character can end a word in one shell and not in the other. */
const requirePlain = (character) => {
  if (character === "\t" || character === "\n" || (character >= " " && character <= "~")) return
  notModelled(`the character U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")} outside a quote: only printable ASCII, a space, a tab and a line end are read there`)
}

const addText = (word, text, quoted) => {
  const last = word.parts.at(-1)
  if (last?.type === "text" && last.quoted === quoted) last.text += text
  else word.parts.push({ type: "text", text, quoted })
}

/** One `$` expansion at `reader.index`, added to `word`. A substitution makes the word dynamic. A variable makes it dynamic unless the walk knows its value. */
function readExpansion(reader, word, inDoubleQuote, depth) {
  const { source } = reader
  const next = source[reader.index + 1] ?? ""
  if (next === "(") {
    if (source[reader.index + 2] === "(") notModelled("an arithmetic expansion `$((`")
    reader.index += 2
    const list = parseNested(reader, depth + 1)
    word.parts.push({ type: "substitution", list, quoted: inDoubleQuote })
    word.nested.push(list)
    word.raw += SUBSTITUTION
    word.text += SUBSTITUTION
    word.fixed ||= "a command substitution"
    return
  }
  if (next === "[") notModelled("an arithmetic expansion `$[`")
  if (next === "'" && !inDoubleQuote) notModelled("an ANSI-C quote `$'...'`")
  if (next === '"' && !inDoubleQuote) notModelled('a `$"..."` quote')
  const pattern = next === "{" ? BRACED_PARAMETER : PARAMETER
  pattern.lastIndex = reader.index + 1
  const parameter = pattern.exec(source)?.[0]
  if (next === "{" && !parameter) notModelled("a `${...}` expansion with an operator")
  if (!parameter) {
    if (next !== "" && !PLAIN_AFTER_DOLLAR.test(next) && !(inDoubleQuote && next === "'")) notModelled("a `$` before a character that zsh can read as an expansion flag")
    word.raw += "$"
    word.text += "$"
    addText(word, "$", inDoubleQuote)
    reader.index++
    return
  }
  reader.index += 1 + parameter.length
  // bash reads `$$'x'` as the process id and a plain quote, and zsh reads `$` and an ANSI-C quote.
  if (parameter === "$" && !inDoubleQuote && /['"]/.test(source[reader.index] ?? "")) notModelled("a run of `$` before a quote")
  const braced = next === "{"
  const name = braced ? parameter.slice(1, -1).split(":")[0] : parameter
  // zsh reads `$name[1]` as a subscript and `$name:h` as a modifier, and bash reads the characters.
  if (!braced && NAME.test(name) && /[[:]/.test(source[reader.index] ?? "")) notModelled("a `[` or a `:` directly after `$NAME`, which zsh reads as a subscript or a modifier")
  const written = `$${parameter}`
  word.parts.push({ type: "variable", name, quoted: inDoubleQuote, written })
  if (!NAME.test(name)) word.fixed ||= "a variable"
  word.variables = true
  word.raw += written
  word.text += written
  word.dynamic ||= "a variable"
}

/**
 * The word at `reader.index`: `source` as written, `raw` with `SUBSTITUTION` for each command substitution, `text` with no quote and
 * no escape, and `dynamic` naming why the shell computes the value ("" for a literal word). `fixed` names a reason that no variable
 * value removes. `parts` holds the text runs and the expansions, and `nested` the list of each substitution.
 */
function readWord(reader, depth) {
  const { source } = reader
  const word = { raw: "", source: "", text: "", dynamic: "", fixed: "", parts: [], nested: [], quoted: false, variables: false, tilde: false }
  let bare = ""
  const start = reader.index
  const quotedLineEnd = (text) => { if (text.includes("\n") && reader.pending.length > 0) notModelled("a quote that spans lines after a here document operator") }
  while (reader.index < source.length) {
    const character = source[reader.index]
    if (WORD_END.test(character)) break
    if (character === "'") {
      const end = source.indexOf("'", reader.index + 1)
      if (end < 0) notModelled("a quote with no end")
      const text = source.slice(reader.index + 1, end)
      quotedLineEnd(text)
      word.raw += source.slice(reader.index, end + 1)
      word.text += text
      addText(word, text, true)
      word.quoted = true
      reader.index = end + 1
    } else if (character === '"') {
      word.raw += '"'
      word.quoted = true
      reader.index++
      for (;;) {
        const inner = source[reader.index]
        if (inner === undefined) notModelled("a quote with no end")
        if (inner === '"') break
        if (inner === "`") notModelled("a backtick substitution")
        if (inner === "$") { readExpansion(reader, word, true, depth); continue }
        if (inner === "\\") {
          const escaped = source[reader.index + 1] ?? ""
          if (escaped === "\n" || escaped === "") notModelled("a line continuation")
          const text = /["\\$`]/.test(escaped) ? escaped : inner + escaped
          word.raw += inner + escaped
          word.text += text
          addText(word, text, true)
          reader.index += 2
          continue
        }
        quotedLineEnd(inner)
        word.raw += inner
        word.text += inner
        addText(word, inner, true)
        reader.index++
      }
      word.raw += '"'
      reader.index++
    } else if (character === "\\") {
      const escaped = source[reader.index + 1] ?? ""
      if (escaped === "\n" || escaped === "") notModelled("a line continuation")
      requirePlain(escaped)
      word.raw += character + escaped
      word.text += escaped
      addText(word, escaped, true)
      word.quoted = true
      reader.index += 2
    } else if (character === "$") {
      readExpansion(reader, word, false, depth)
    } else if (character === "`") {
      notModelled("a backtick substitution")
    } else {
      requirePlain(character)
      // A `~` that starts the word and ends it or comes before `/` is the home directory in both shells.
      if (character === "~" && reader.index === start) {
        if (WORD_END.test(source[reader.index + 1] ?? " ") || source[reader.index + 1] === "/") word.tilde = true
        else word.fixed ||= "a `~NAME` expansion"
      }
      word.raw += character
      word.text += character
      bare += character
      if (word.tilde && reader.index === start) word.parts.push({ type: "tilde" })
      else addText(word, character, false)
      reader.index++
    }
  }
  word.source = source.slice(start, reader.index)
  // zsh reads `=name` as the path of the program `name`, and bash reads the characters.
  if (source[start] === "=" && bare.length > 1) word.fixed ||= "a word that starts with `=`"
  if (bare !== "[" && bare !== "[[" && /[*?[]/.test(bare)) word.fixed ||= "a glob"
  if (BRACE_EXPANSION.test(bare)) word.fixed ||= "a brace expansion"
  // bash expands a `~` after `=` or `:` in a word that looks like an assignment, and zsh does not.
  if (/[=:]~/.test(bare)) word.fixed ||= "a `~` after `=` or `:`"
  if (word.tilde) word.dynamic ||= "a `~` expansion"
  word.dynamic = word.fixed || word.dynamic
  return word
}

/** The redirect at `reader.index`: a here document, a file, or a copy of a file descriptor. */
function readRedirect(reader, depth) {
  const { source } = reader
  if (ZSH_NUMERIC_GLOB.test(source.slice(reader.index, reader.index + 64))) notModelled("a zsh numeric glob `<N-M>` or `<->`, which bash reads as two redirects")
  const operator = /^(?:&>>|&>|<<<|<<-|<<|>>|>&|<&|>\||<>|<\(|>\(|[<>])/.exec(source.slice(reader.index, reader.index + 3))[0]
  if (operator === "<<<") notModelled("a here-string (`<<<`)")
  if (operator === "<(" || operator === ">(") notModelled("a process substitution")
  if (operator === ">|" || operator === "<>" || operator === "<<-" || operator === "&>>") notModelled(`the redirect \`${operator}\``)
  reader.index += operator.length
  if (operator === "<<") {
    if (depth > 0) notModelled("a here document inside a substitution")
    HEREDOC_DELIMITER.lastIndex = reader.index
    const delimiter = HEREDOC_DELIMITER.exec(source)
    if (!delimiter || !/[\s;&|<>]|^$/.test(source[reader.index + delimiter[0].length] ?? "")) notModelled("a here document with a delimiter that is not one quoted literal word, such as `<<'EOF'`")
    reader.index += delimiter[0].length
    const heredoc = { delimiter: delimiter[1] ?? delimiter[2], body: null }
    reader.pending.push(heredoc)
    return { type: "redirect", heredoc }
  }
  if (operator === ">&" || operator === "<&") {
    DUPLICATE_TARGET.lastIndex = reader.index
    const target = DUPLICATE_TARGET.exec(source)
    if (!target) notModelled(`the redirect \`${operator}\` to a target that is no file descriptor`)
    reader.index += target[0].length
    return { type: "redirect" }
  }
  while (source[reader.index] === " " || source[reader.index] === "\t") reader.index++
  const target = readWord(reader, depth)
  if (target.raw === "" || target.dynamic || target.raw.startsWith("!")) notModelled(`the redirect \`${operator}\` to a target that is not a literal path`)
  return { type: "redirect", file: { operator, target: target.text } }
}

/** The bodies of the here documents whose operators are on the line that just ended. */
function readBodies(reader) {
  const { source } = reader
  for (const heredoc of reader.pending.splice(0)) {
    const lines = []
    for (;;) {
      if (reader.index >= source.length) notModelled("a here document with no end marker line")
      const lineEnd = source.indexOf("\n", reader.index)
      const line = source.slice(reader.index, lineEnd < 0 ? source.length : lineEnd)
      reader.index = lineEnd < 0 ? source.length : lineEnd + 1
      if (line === heredoc.delimiter) break
      if (line.trim() === heredoc.delimiter) notModelled("a here document with a line that looks like its end marker")
      lines.push(line)
    }
    heredoc.body = lines.join("\n")
  }
}

/** The next token: a word, a redirect, one of the operators `;` `&&` `||` `|` `)` and a line end, or the end of the input. */
function nextToken(reader, depth) {
  const { source } = reader
  for (;;) {
    const start = reader.index
    if (start >= source.length) return { type: "end" }
    const character = source[start]
    const next = source[start + 1] ?? ""
    if (character === " " || character === "\t") { reader.index++; continue }
    if (character === "\n") {
      reader.index++
      if (reader.pending.length > 0 && depth > 0) notModelled("a line end inside a substitution after a here document operator")
      readBodies(reader)
      return { type: "operator", operator: "\n" }
    }
    if (character === "#") {
      if (depth > 0) notModelled("a comment inside a substitution")
      const lineEnd = source.indexOf("\n", start)
      const comment = source.slice(start, lineEnd < 0 ? source.length : lineEnd)
      for (const commentCharacter of comment) requirePlain(commentCharacter)
      reader.index += comment.length
      continue
    }
    if (character === ";") {
      if (next === ";" || next === "&") notModelled("the operator `;;`")
      reader.index++
      return { type: "operator", operator: ";" }
    }
    if (character === "&" && next === "&") { reader.index += 2; return { type: "operator", operator: "&&" } }
    if (character === "&" && next !== ">") notModelled("a background `&`")
    if (character === "|" && next === "|") { reader.index += 2; return { type: "operator", operator: "||" } }
    if (character === "|") {
      if (next === "&") notModelled("the operator `|&`")
      reader.index++
      return { type: "operator", operator: "|" }
    }
    if (character === "(") notModelled("a subshell, a function, an array or an arithmetic command `(`")
    if (character === ")") { reader.index++; return { type: "operator", operator: ")" } }
    if (character === "<" || character === ">" || character === "&") return readRedirect(reader, depth)
    requirePlain(character)
    const word = readWord(reader, depth)
    if (reader.index === start) notModelled("a character that the reader cannot read")
    const redirectFollows = /[<>]/.test(source[reader.index] ?? "")
    if (redirectFollows && /^\{\w+\}$/.test(word.raw)) notModelled("a `{name}>` redirect")
    // A file descriptor directly before a redirect operator belongs to the redirect.
    if (redirectFollows && /^\d+$/.test(word.raw)) return readRedirect(reader, depth)
    return { type: "word", word }
  }
}

/** A parser of one list: the top level, or the list of one substitution. */
const parserOf = (reader, depth) => {
  if (depth > MAX_DEPTH) notModelled("substitutions nested deeper than the hook reads")
  const parser = { reader, depth, peeked: null }
  parser.peek = () => (parser.peeked ??= nextToken(reader, depth))
  parser.take = () => { const token = parser.peek(); parser.peeked = null; return token }
  return parser
}
const isOperator = (token, ...operators) => token.type === "operator" && operators.includes(token.operator)
const isWord = (token, ...raws) => token.type === "word" && raws.includes(token.word.raw)
const describe = (token) => token.type === "word" ? `the word \`${token.word.raw}\` in this place` : token.type === "end" ? "an end of the command in this place" :
  token.type === "redirect" ? "a redirect in this place" : `the operator \`${token.operator === "\n" ? "line end" : token.operator}\` in this place`

/** The list of a substitution, after its `$(`, up to and with its `)`. */
function parseNested(reader, depth) {
  const parser = parserOf(reader, depth)
  const list = parseSequence(parser, new Set(), { compound: false })
  if (!isOperator(parser.take(), ")")) notModelled("a `$(` with no `)`")
  return list
}

/** And-or lists, separated by `;` or a line end, up to a word of `ends`, a `)` or the end of the input. */
function parseSequence(parser, ends, placement) {
  const sequence = []
  for (;;) {
    let token = parser.peek()
    while (isOperator(token, "\n")) { parser.take(); token = parser.peek() }
    if (token.type === "end" || isOperator(token, ")") || (token.type === "word" && ends.has(token.word.raw))) return sequence
    sequence.push(parseAndOr(parser, placement))
    token = parser.peek()
    if (isOperator(token, ";", "\n")) { parser.take(); continue }
    if (token.type === "end" || isOperator(token, ")")) return sequence
    notModelled(describe(token))
  }
}

/** Pipelines and compound commands joined by `&&` and `||`. Each item carries `joiner`, the operator before it or "". */
function parseAndOr(parser, placement) {
  const andOr = [{ joiner: "", node: parseNode(parser, placement) }]
  while (isOperator(parser.peek(), "&&", "||")) {
    const joiner = parser.take().operator
    while (isOperator(parser.peek(), "\n")) parser.take()
    andOr.push({ joiner, node: parseNode(parser, placement) })
  }
  return andOr
}

function parseNode(parser, placement) {
  const token = parser.peek()
  if (isWord(token, "for", "if")) {
    const node = token.word.raw === "for" ? parseFor(parser) : parseIf(parser)
    const after = parser.peek()
    if (after.type !== "end" && !isOperator(after, ";", "\n", "&&", "||", ")")) notModelled(`${describe(after)} after \`${token.word.raw === "for" ? "done" : "fi"}\``)
    return node
  }
  const commands = [parseSimple(parser)]
  while (isOperator(parser.peek(), "|")) {
    parser.take()
    while (isOperator(parser.peek(), "\n")) parser.take()
    commands.push(parseSimple(parser))
  }
  const topLevel = !placement.compound && parser.depth === 0
  commands.forEach((command, position) => checkCommand(command, { topLevel, position, length: commands.length }))
  return { type: "pipeline", commands }
}

/** The assignment that a word makes, or null: `name`, `append`, the parts of its value, and `unknown` when no walk knows the value. */
function assignmentOf(word) {
  const match = ASSIGNMENT_WORD.exec(word.raw)
  if (!match) return null
  const [first, ...rest] = word.parts
  const parts = [...(first.text.length > match[0].length ? [{ ...first, text: first.text.slice(match[0].length) }] : []), ...rest]
  const leading = parts[0]?.type === "text" && !parts[0].quoted ? parts[0].text : ""
  const tilde = leading === "~" || leading.startsWith("~/")
  if (tilde) parts.splice(0, 1, { type: "tilde" }, ...(leading.length > 1 ? [{ type: "text", text: leading.slice(1), quoted: false }] : []))
  const unknown = parts.some((part) => part.type === "substitution" || (part.type === "variable" && !NAME.test(part.name)) ||
    (part.type === "text" && !part.quoted && part.text.includes("~"))) || leading.startsWith("=")
  return { name: match[1], append: match[2] === "+", parts, unknown, word }
}

function parseSimple(parser) {
  const command = { words: [], assignments: [], redirects: [], heredocs: [] }
  for (;;) {
    const token = parser.peek()
    if (token.type === "redirect") {
      parser.take()
      if (token.heredoc) command.heredocs.push(token.heredoc)
      if (token.file) command.redirects.push(token.file)
      continue
    }
    if (token.type !== "word") break
    const { word } = token
    if (REFUSED_WORDS.has(word.raw)) notModelled(`the word \`${word.raw}\`, which bash or zsh reads as a group or a condition`)
    if (command.words.length === 0) {
      const assignment = assignmentOf(word)
      if (assignment) { parser.take(); command.assignments.push(assignment); continue }
      if (REFUSED_KEYWORDS.has(word.raw)) notModelled(`the shell keyword \`${word.raw}\``)
      if (TERMINATORS.has(word.raw) || word.raw === "for" || word.raw === "if") notModelled(`the shell keyword \`${word.raw}\` in this place`)
    }
    parser.take()
    command.words.push(word)
  }
  if (command.words.length + command.assignments.length + command.redirects.length + command.heredocs.length === 0) notModelled(`an empty command: ${describe(parser.peek())}`)
  return command
}

const FOR_FORM = "a `for` loop that is not `for NAME in WORDS; do LIST; done` with literal words"
function parseFor(parser) {
  parser.take()
  const name = parser.take()
  if (name.type !== "word" || name.word.raw !== name.word.text || !NAME.test(name.word.text)) notModelled(FOR_FORM)
  if (REFUSED_ASSIGNMENT.test(name.word.text)) notModelled(`an assignment to \`${name.word.text}\``)
  if (!isWord(parser.take(), "in")) notModelled(FOR_FORM)
  const values = []
  while (parser.peek().type === "word") {
    const { word } = parser.take()
    if (word.dynamic || REFUSED_WORDS.has(word.raw) || TERMINATORS.has(word.raw) || REFUSED_KEYWORDS.has(word.raw) || word.raw === "for" || word.raw === "if") notModelled(FOR_FORM)
    values.push(word.text)
  }
  if (values.length === 0 || !isOperator(parser.take(), ";", "\n")) notModelled(FOR_FORM)
  while (isOperator(parser.peek(), "\n")) parser.take()
  if (!isWord(parser.take(), "do")) notModelled(FOR_FORM)
  const body = parseSequence(parser, new Set(["done"]), { compound: true })
  if (body.length === 0 || !isWord(parser.take(), "done")) notModelled(FOR_FORM)
  return { type: "for", name: name.word.text, values, body }
}

const IF_FORM = "an `if` that is not `if LIST; then LIST; [else LIST;] fi`"
function parseIf(parser) {
  parser.take()
  const test = parseSequence(parser, new Set(["then"]), { compound: true })
  if (test.length === 0 || !isWord(parser.take(), "then")) notModelled(IF_FORM)
  const then = parseSequence(parser, new Set(["else", "fi"]), { compound: true })
  if (then.length === 0) notModelled(IF_FORM)
  let otherwise = null
  if (isWord(parser.peek(), "else")) {
    parser.take()
    otherwise = parseSequence(parser, new Set(["fi"]), { compound: true })
    if (otherwise.length === 0) notModelled(IF_FORM)
  }
  if (!isWord(parser.take(), "fi")) notModelled(IF_FORM)
  return { type: "if", test, then, otherwise }
}

/** The number of words that the option word `text` takes from the allow list `options`, with its value, or 0 when the list does not name it. */
const optionWords = (options, text) => {
  if (Object.hasOwn(options, text)) return 1 + options[text]
  return /^-[A-Za-z0-9]./.test(text) && options[text.slice(0, 2)] === 1 ? 1 : 0
}

/**
 * The wrappers from `start` of a word list, read with the allow list of the options of each wrapper. `end` is the index of the
 * word after them. `refused` names the first word that the allow list does not name, or is "". `assignments` are the words of `env`.
 */
function readWrappers(words, start) {
  const wrappers = []
  const assignments = []
  let index = start
  while (index < words.length && WRAPPERS.has(programName(words[index].text))) {
    const wrapper = programName(words[index].text)
    wrappers.push(wrapper)
    index++
    while (index < words.length && words[index].text.startsWith("-")) {
      const { text } = words[index]
      const taken = optionWords(WRAPPER_OPTIONS[wrapper] ?? {}, text)
      if (taken === 0 || index + taken > words.length) return { wrappers, assignments, end: index, refused: `the option \`${text}\` of \`${wrapper}\`` }
      index += taken
      if (text === "--") break
    }
    if (wrapper === "env") while (index < words.length && ASSIGNMENT_WORD.test(words[index].text)) assignments.push(words[index++])
    if (wrapper === "timeout") {
      if (!TIMEOUT_DURATION.test(words[index]?.text ?? "")) return { wrappers, assignments, end: index, refused: "a `timeout` with no literal duration" }
      index++
    }
  }
  return { wrappers, assignments, end: index, refused: "" }
}

/** The index of each word where a command can start: the first word, and the word after each `find -exec` and `-ok`. */
const invocationStarts = (words) => [0, ...words.flatMap((word, index) => (FIND_EXEC.test(word.text) ? [index + 1] : []))]

/** The index of the word that ends the command of a `find -exec` from `start`: a `;`, or a `+` directly after `{}`. With no end, the length. */
const findCommandEnd = (words, start) => {
  const end = words.findIndex((word, index) => index >= start && (word.text === ";" || (word.text === "+" && words[index - 1]?.text === "{}")))
  return end < 0 ? words.length : end
}

/**
 * Each program that a word list runs: its command word after the wrappers, and the command after each `find -exec` and `-ok`, up to its
 * `;` or `{} +`. Each one runs in the shell directory. `fromFind` is true for a command after `find -exec` or `-ok`.
 */
export function invocationsOf(words) {
  const invocations = []
  for (const start of invocationStarts(words)) {
    const { wrappers, end } = readWrappers(words, start)
    const last = start > 0 ? findCommandEnd(words, end + 1) : words.length
    if (end < words.length) invocations.push({ program: words[end], args: words.slice(end + 1, last), wrappers, before: words.slice(start, end), fromFind: start > 0 })
  }
  return invocations
}

/**
 * Option letters that take the next word in a shell of `SHELLS`: `o` (POSIX `sh`), `O` (bash), `R` (ksh) and `T` (mksh).
 * A letter that takes no word in the shell at hand makes the rules refuse more, never less.
 */
const LETTERS_WITH_ARGUMENT = new Set(["o", "O", "R", "T"])
/** Long options that take the next word: `--rcfile` and `--init-file` in bash, `--emulate` in zsh. */
const LONG_OPTIONS_WITH_ARGUMENT = new Set(["--rcfile", "--init-file", "--emulate"])
/**
 * True when the words after a shell word leave it no script file, so it reads its script from standard input.
 * Each option letter in `LETTERS_WITH_ARGUMENT` takes one word. After `-s`, each word that is not an option is a positional argument.
 */
export function readsStandardInput(words) {
  let positionalArguments = false
  for (let index = 0; index < words.length; index++) {
    const word = words[index]
    if (/^[-+]-?$/.test(word)) return positionalArguments || index === words.length - 1
    if (/^[-+]-/.test(word)) {
      if (LONG_OPTIONS_WITH_ARGUMENT.has(word)) index++
      continue
    }
    if (!/^[-+]./.test(word)) return positionalArguments
    for (const letter of word.slice(1)) {
      if (letter === "s") positionalArguments = true
      if (LETTERS_WITH_ARGUMENT.has(letter)) index++
    }
  }
  return true
}

const literalText = (word) => word.parts.filter((part) => part.type === "text").map((part) => part.text).join("")
/** bash evaluates a subscript of a name as arithmetic, and runs a `$(...)` in it, in `declare`, `read`, `printf -v`, `test -v` and an integer value. */
const holdsSubscriptCode = (word) => { const text = literalText(word); return text.includes("[") && (text.includes("$(") || text.includes("`")) }
const refusedAssignment = (name) => REFUSED_ASSIGNMENT.test(name) && notModelled(`an assignment to \`${name}\`, which changes how the shell reads a command, where \`cd\` or \`~\` goes, or which repository, config file or program git uses`)

/** A shell runs a script file that the hook does not read. It is in the grammar only when no script can come from a word or from standard input. */
function checkShell(command, { args }, place) {
  const computed = command.words.find((word) => word.dynamic)
  if (computed) notModelled(`${computed.dynamic} in the words of a shell command`)
  if (args.some((word) => /^-[A-Za-z]*c[A-Za-z]*$/.test(word.text))) notModelled("a shell `-c`, which runs its next word as a script")
  const texts = args.map((word) => word.text)
  if (readsStandardInput(texts)) notModelled("a shell that reads its script from standard input")
  if (texts.some((text) => text === "-" || text.split("/").some((part) => part === "dev" || part === "proc"))) notModelled("a shell with a script under `/dev` or `/proc`")
  if (command.heredocs.length > 0 || command.redirects.some(({ operator }) => operator === "<")) notModelled("a shell with a here document or a `<` file of its own")
  if (place.position > 0) notModelled("a shell that gets its standard input from a pipe")
}

/** Refuses each simple command whose words the rules cannot read exactly. Only a variable value can still make a word dynamic: the walk checks those. */
function checkCommand(command, place) {
  for (const assignment of command.assignments) {
    refusedAssignment(assignment.name)
    if (holdsSubscriptCode(assignment.word)) notModelled("text with a `[` and a `$(` or a backtick, which bash can run as a subscript")
  }
  if (command.words.length === 0) {
    if (place.length > 1) notModelled("an assignment in a pipeline, which zsh keeps and bash does not")
    return
  }
  if (command.words.some(holdsSubscriptCode)) notModelled("text with a `[` and a `$(` or a backtick, which bash can run as a subscript")
  // The options and assignments of each wrapper, also when no command follows them, such as `env -S 'git push'`.
  for (const start of invocationStarts(command.words)) {
    const { refused, assignments, wrappers, end } = readWrappers(command.words, start)
    const user = wrappers.find((wrapper) => USER_WRAPPERS.has(wrapper))
    if (user) notModelled(`the wrapper \`${user}\`, which runs its command as another user, in a directory, a home and a git config that the hook does not read`)
    if (refused) notModelled(`${refused}, which the allow list of the wrapper options does not name. A wrapper takes only the options of \`WRAPPER_OPTIONS\` in \`command-expander.mjs\``)
    for (const word of assignments) refusedAssignment(ASSIGNMENT_WORD.exec(word.text)[1])
    // A wrapper word and the command word decide which program runs, so each one is literal, also when no command word follows.
    const computed = command.words.slice(start, end + 1).find((word) => word.dynamic)
    if (computed) notModelled(`${computed.dynamic} in a command word`)
    if (wrappers.includes("xargs")) {
      const runs = wrappers[wrappers.indexOf("xargs") + 1] ?? (end < command.words.length ? programName(command.words[end].text) : "")
      if (!runs) notModelled("an `xargs` with no command word, which runs a program that the reader does not name. Give `xargs` a command word, such as `grep` or `rm`")
      if (runsProgram(runs)) {
        notModelled(`an \`xargs\` that runs \`${runs}\`, which can run a program or an action that the words from standard input name. ` +
          "Give `xargs` a program that runs no other program, such as `grep` or `rm`, or write the loop in a `.mjs` file")
      }
    }
  }
  for (const invocation of invocationsOf(command.words)) {
    const { program, args } = invocation
    const name = programName(program.text)
    if (ZSH_COMMAND_WORDS.has(program.text)) notModelled(`the zsh command word \`${program.text}\`, which runs the words after it as a command`)
    if (CODE_BUILTINS.has(name)) notModelled(`the builtin \`${name}\`, which reads its words again as code, assigns a name, changes how the shell reads a command, or changes the flow or the directory`)
    if (SHELLS.includes(name) && !SCRIPT_SHELLS.includes(name)) notModelled(`the shell \`${name}\`, which is not a POSIX shell that the hook reads`)
    if (!KNOWN_COMMAND_WORDS.includes(name)) notModelled(`the command word \`${name}\`, which is not a program or a builtin that the hook knows. The hook knows only: ${KNOWN_COMMAND_WORDS.join(" ")}`)
    if (name === "find" && args.some((word) => FIND_EXEC_IN_FOUND_DIRECTORY.test(word.text))) {
      notModelled("`find -execdir` or `-okdir`, which runs its command in the directory of each found file, which the `cd` model cannot know. Use `-exec` with an absolute path")
    }
    if (name === "git" && invocation.fromFind && args.some((word) => word.text.includes("{}"))) notModelled("a `{}` in a `git` argument after `find -exec`, which `find` replaces with each path that it finds")
    if (name === "cd") {
      const whole = program === command.words[0] && command.words.length === 2 && command.assignments.length === 0 && place.topLevel && place.length === 1
      if (!whole || args[0].text.startsWith("-") || args[0].fixed) notModelled("a `cd` that is not one whole simple command `cd PATH` at the top level of the line, with a literal path")
    }
    if (name === "set" && args.some((word) => !/^[-+][eux]+$/.test(word.text))) notModelled("`set` with a word other than the options -e, -u and -x")
    if (name === "printf" && args.some((word) => /^-[A-Za-z]*v/.test(word.text))) notModelled("`printf -v`, which assigns to a name that bash can read as a subscript")
    if (DECLARATION_BUILTINS.has(name)) {
      for (const word of args) {
        const assigned = ASSIGNMENT_WORD.exec(word.text)
        if (!assigned && !NAME.test(word.text)) notModelled(`the word \`${word.text}\` of \`${name}\`, which takes only a name and \`NAME=value\`, with no option and no subscript`)
        refusedAssignment(assigned ? assigned[1] : word.text)
      }
    }
    if (SHELLS.includes(name)) checkShell(command, invocation, place)
  }
  // A program such as `docker exec` or `ssh` can run a shell word and its `-c` script, so a `-c` after a shell word anywhere in the command is refused.
  const shellWord = command.words.findIndex((word) => SHELLS.includes(programName(word.text)))
  if (shellWord >= 0 && command.words.slice(shellWord + 1).some((word) => /^-[A-Za-z]*c[A-Za-z]*$/.test(word.text))) notModelled("a shell `-c`, which runs its next word as a script")
}

/**
 * The command as the modelled subset reads it: `{ list, notModelled }`. `notModelled` names the first construct outside the
 * subset, or is "". A rule reads `list` only when `notModelled` is "", and only through `walkCommands`.
 */
export function readCommand(source, { home = process.env.HOME || homedir() } = {}) {
  try {
    if (source.length > MAX_LENGTH) notModelled("a command longer than the hook reads")
    const reader = { source, index: 0, pending: [] }
    const parser = parserOf(reader, 0)
    const sequence = parseSequence(parser, new Set(), { compound: false })
    if (isOperator(parser.peek(), ")")) notModelled("a `)` with no `$(`")
    if (reader.pending.length > 0) notModelled("a here document with no end marker line")
    const list = Object.assign(sequence, { home })
    walk(list, null, () => null, checkResolved)
    return { list, notModelled: "" }
  } catch (error) {
    if (!(error instanceof NotModelled)) throw error
    return { list: Object.assign([], { home }), notModelled: error.message }
  }
}

/**
 * True when the shell can make no word from `word` that is a `find` action that runs a program. A word with a value that the walk knows
 * is read by its value. Otherwise each expansion must be quoted, so the shell does not split it, and either the first character is literal
 * and is not `-`, or the word has no glob and no brace and holds a literal character that no such action holds.
 */
function cannotBeFindRunner(word) {
  if (!word.variables && !word.tilde && !word.fixed) return true
  if (!word.dynamic) return !FIND_RUNNER_ACTION.test(word.text)
  if (word.parts.some((part) => (part.type === "variable" || part.type === "substitution") && !part.quoted)) return false
  const [first] = word.parts
  const literalStart = first?.type === "text" && first.text.length > 0 && first.text[0] !== "-" && (first.quoted || LITERAL_FIRST_CHARACTER.test(first.text))
  if (literalStart) return true
  const bare = word.parts.filter((part) => part.type === "text" && !part.quoted).map((part) => part.text).join("")
  return !/[*?[]/.test(bare) && !BRACE_EXPANSION.test(bare) && word.parts.some((part) => part.type === "text" && /[^A-Za-z-]/.test(part.text))
}

/** The checks that need the value of a variable: a `git` argument, the path of a `cd`, and each word of `find`, which can be an action that runs a program. */
function checkResolved({ words }) {
  for (const { program, args } of invocationsOf(words)) {
    const name = programName(program.text)
    const computed = args.find((word) => word.dynamic)
    if (name === "git" && computed) notModelled(`${computed.dynamic} in a \`git\` argument`)
    if (name === "cd" && computed) notModelled(`${computed.dynamic} in the path of a \`cd\``)
    const hidden = name === "find" ? args.find((word) => !cannotBeFindRunner(word)) : null
    if (hidden) {
      notModelled(`${hidden.dynamic || `a variable with the value \`${hidden.text}\``} in the words of \`find\`, which can be an action that runs a program ` +
        "(`-exec`, `-execdir`, `-ok`, `-okdir`). Write each action as a literal word, quote a pattern such as `-name '*.mjs'`, and give a path as a literal path, " +
        "as a path with a literal character such as `\"$DIR/\"`, or as a lower case variable that the line sets to a literal value")
    }
  }
}

/** The word with each variable that the walk knows replaced by its value. */
function resolveWord(word, variables, home) {
  if (!word.variables && !word.tilde) return word
  if (word.fixed) return word
  let text = ""
  let dynamic = ""
  for (const part of word.parts) {
    if (part.type === "text") text += part.text
    else if (part.type === "tilde") text += home
    else if (valueOf(variables, part.name) === null) { dynamic ||= "a variable"; text += part.written }
    else {
      const value = valueOf(variables, part.name)
      if (!part.quoted && !PLAIN_VALUE.test(value)) dynamic ||= "a variable whose value bash and zsh split or expand in different ways"
      text += value
    }
  }
  return { ...word, text, dynamic }
}

/** The value of an assignment, or null when the walk does not know it. */
function assignedValue({ name, append, parts, unknown }, variables, home) {
  if (unknown || (append && valueOf(variables, name) === null)) return null
  let value = append ? valueOf(variables, name) : ""
  for (const part of parts) {
    if (part.type === "text") value += part.text
    else if (part.type === "tilde") value += home
    else if (valueOf(variables, part.name) !== null) value += valueOf(variables, part.name)
    else return null
  }
  return value
}

/**
 * The variable values that the walk knows, as a chain of changes that each state shares. A change adds one link, so an assignment costs
 * no copy of the map. After about the square root of the map size in links, a link holds a full copy, so a lookup reads few links.
 * Each link also holds the count of its entries and a hash of its content, which does not depend on the order of the changes, so
 * `distinct` compares two maps by their content and walks them only when the count and the hash are equal.
 */
const NO_VARIABLES = { table: new Map(), parent: null, links: 0, size: 0, hash: 0 }
/** FNV-1a of one entry. The hash of a map is the sum of the hashes of its entries, modulo 2^32. */
const entryHash = (name, value) => {
  let hash = 0x811c9dc5
  const text = `${name}=${value}`
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193)
  return hash >>> 0
}
const valueOf = (variables, name) => {
  for (let link = variables; link; link = link.parent) {
    if (link.table) return link.table.get(name) ?? null
    if (link.name === name) return link.value
  }
  return null
}
const withVariable = (variables, name, value) => {
  const tracked = value !== null && TRACKED_NAME.test(name) && !SPECIAL_LOWER_CASE.has(name) ? value : null
  const previous = valueOf(variables, name)
  if (tracked === previous) return variables
  const hash = (variables.hash - (previous === null ? 0 : entryHash(name, previous)) + (tracked === null ? 0 : entryHash(name, tracked))) >>> 0
  const size = variables.size + (previous === null ? 1 : 0) - (tracked === null ? 1 : 0)
  const link = { table: null, parent: variables, links: variables.links + 1, size, hash, name, value: tracked }
  let base = variables
  while (!base.table) base = base.parent
  if (link.links * link.links < base.table.size) return link
  const changes = []
  for (let cursor = link; cursor !== base; cursor = cursor.parent) changes.push(cursor)
  const table = new Map(base.table)
  for (const change of changes.reverse()) {
    if (change.value === null) table.delete(change.name)
    else table.set(change.name, change.value)
  }
  return { table, parent: null, links: 0, size, hash }
}
/** The links of a map from its newest change to its full copy, the copy included. */
const linksOf = (variables) => {
  const links = []
  for (let link = variables; link; link = link.parent) links.push(link)
  return links
}
/**
 * True when two maps hold the same entries. Two maps that share a link differ only in the names that changed after it, so only those
 * names are read. Two maps with no shared link are compared entry by entry.
 */
function sameVariables(first, second) {
  if (first === second) return true
  if (first.size !== second.size || first.hash !== second.hash) return false
  const firstLinks = linksOf(first)
  const shared = new Set(firstLinks)
  const secondLinks = []
  for (let link = second; link && !shared.has(link); link = link.parent) secondLinks.push(link)
  const common = secondLinks.length > 0 ? secondLinks.at(-1).parent : second
  if (common) {
    const changed = [...firstLinks.slice(0, firstLinks.indexOf(common)), ...secondLinks].map((link) => link.name)
    return changed.every((name) => valueOf(first, name) === valueOf(second, name))
  }
  const entries = (variables) => {
    const links = linksOf(variables)
    const table = new Map(links.at(-1).table)
    for (const change of links.slice(0, -1).reverse()) {
      if (change.value === null) table.delete(change.name)
      else table.set(change.name, change.value)
    }
    return table
  }
  const firstEntries = entries(first)
  const secondEntries = entries(second)
  return firstEntries.size === secondEntries.size && [...firstEntries].every(([name, value]) => secondEntries.get(name) === value)
}
/** Only a declaration builtin of the allow list sets a variable of the shell. After one, the walk forgets each value. */
const isPure = (command) => command.words.length > 0 && invocationsOf(command.words).every(({ program }) => !DECLARATION_BUILTINS.has(programName(program.text)))

/** The states with no repeat: two states are one when their variable maps hold the same entries and their other state is equal. */
function distinct(...groups) {
  const buckets = new Map()
  const states = []
  for (const state of groups.flat()) {
    const key = `${state.variables.size} ${state.variables.hash} ${JSON.stringify(state.state)}`
    const bucket = buckets.get(key) ?? []
    if (bucket.some((other) => sameVariables(other.variables, state.variables))) continue
    bucket.push(state)
    buckets.set(key, bucket)
    states.push(state)
  }
  if (states.length > MAX_STATES) notModelled("more possible states than the hook reads")
  return states
}

function walk(list, state, visit, check = null) {
  const context = { visit, check, home: list.home, visits: 0 }
  walkSequence(list, [{ variables: NO_VARIABLES, state }], context)
}

function walkSequence(sequence, states, context) {
  for (const andOr of sequence) states = walkAndOr(andOr, states, context)
  return states
}

/**
 * The states of an and-or list. `succeeded` holds the states in which the last item that ran can have succeeded, and `failed` those in
 * which it can have failed. An item that fails can fail before it changes anything, such as a `cd` to a missing directory, so its
 * failed states also hold the states before it. An item after `&&` runs from `succeeded`, and an item after `||` from `failed`.
 */
function walkAndOr(andOr, states, context) {
  let succeeded = walkNode(andOr[0].node, states, context)
  // A list of one item is read as an item that succeeds: a `cd` that fails is a limit that ./README.md names.
  if (andOr.length === 1) return succeeded
  let failed = distinct(succeeded, states)
  for (const { joiner, node } of andOr.slice(1)) {
    const before = joiner === "&&" ? succeeded : failed
    const after = walkNode(node, before, context)
    if (joiner === "&&") { failed = distinct(failed, before, after); succeeded = after }
    else { succeeded = distinct(succeeded, after); failed = distinct(before, after) }
  }
  return distinct(succeeded, failed)
}

function walkNode(node, states, context) {
  if (node.type === "for") {
    for (const value of node.values) {
      const entered = distinct(states.map((current) => ({ ...current, variables: withVariable(current.variables, node.name, value) })))
      states = walkSequence(node.body, entered, context)
    }
    return states
  }
  if (node.type === "if") {
    const tested = walkSequence(node.test, states, context)
    return distinct(walkSequence(node.then, tested, context), node.otherwise ? walkSequence(node.otherwise, tested, context) : tested)
  }
  if (node.commands.length === 1) return distinct(states.map((current) => walkSimple(node.commands[0], current, context)))
  // A command of a longer pipeline changes no directory: the grammar refuses a `cd` and an assignment there. zsh runs the last one in the shell itself.
  for (const command of node.commands) for (const current of states) walkSimple(command, current, context)
  return node.commands.every(isPure) ? states : distinct(states.map((current) => ({ ...current, variables: NO_VARIABLES })))
}

function walkSimple(command, current, context) {
  if (++context.visits > MAX_VISITS) notModelled("more commands than the hook reads, after the loops are unrolled")
  const { variables, state } = current
  for (const word of [...command.assignments.map((assignment) => assignment.word), ...command.words]) for (const nested of word.nested) walkSequence(nested, [current], context)
  const resolved = { words: command.words.map((word) => resolveWord(word, variables, context.home)), assignments: command.assignments.map((assignment) => assignment.word), redirects: command.redirects, heredocs: command.heredocs }
  context.check?.(resolved)
  const next = context.visit(resolved, state)
  if (command.words.length > 0) return { variables: isPure(command) ? variables : NO_VARIABLES, state: next }
  return { variables: command.assignments.reduce((known, assignment) => withVariable(known, assignment.name, assignedValue(assignment, known, context.home)), variables), state: next }
}

/**
 * Calls `visit(command, state)` for each command in the order in which the shell runs them, once for each state that is possible
 * there, with each variable that the walk knows replaced by its value. `visit` returns the next state. A substitution and a command
 * of a longer pipeline inherit the state and do not change it. The shell can skip a command after `&&` or `||` and a branch of `if`,
 * so each state before such a command stays possible after it. Returns "" or the construct that is outside what the walk reads.
 */
export function walkCommands(list, state, visit) {
  try {
    walk(list, state, visit)
    return ""
  } catch (error) {
    if (!(error instanceof NotModelled)) throw error
    return error.message
  }
}

/** What a refusal tells the agent to write in place of a command that is not modelled. */
export const PLAIN_SUBSET_ADVICE =
  "Rewrite the command in the plain subset that the hook reads: plain words, '...' and \"...\" quotes, the operators `;` `&&` `||` `|` and a line end, " +
  "the redirects `>` `>>` `<` `2>&1` to a literal path, a here document at the top level with a quoted delimiter (`<<'EOF'`), `VAR=value`, " +
  "`for NAME in WORDS; do ...; done` with literal words, `if ...; then ...; else ...; fi`, and `cd PATH` as a whole command at the top level. " +
  "A `$VAR`, a `${VAR:?}`, a glob or a `$(command)` is allowed in an argument, but not in a command word, in a shell command, or in a `git` argument or a `cd` path. " +
  "In a `find` word, it is allowed only after a literal character that is not `-`, such as `\"$DIR/\"` or `-name \"*$ext\"`. `xargs` can run only a program that runs no other program, such as `grep` or `rm`. " +
  "The one exception: a `git` argument or a `cd` path can use a variable with a lower case name, such as `wt=/abs/path; git -C \"$wt\" status`, that the line sets to a literal value. " +
  "An upper case name such as `$WT` is never read there. Each command word must be a program or a builtin that the hook knows; " +
  "`read`, `chdir`, `pushd`, `popd`, `eval`, `source`, `print` and a shell other than a POSIX shell are refused. " +
  "For a search, a filter or a text check, write it to a `.mjs` file and run it with `node /abs/path.mjs`. " +
  "For other commands, write them to a script file and run the file by its literal path, such as `bash /abs/path.sh`."
