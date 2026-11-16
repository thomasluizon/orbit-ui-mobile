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
// The modelled subset. `readCommand` reads one shell subset exactly, the same way in bash and in zsh, and names each
// other construct as not modelled. The git rule and the approval rule read only its parsed words. ./README.md lists the subset.
// ---------------------------------------------------------------------------

/** The shells that read standard input or a `-c` word as a script. */
export const SHELLS = ["bash", "sh", "zsh", "dash", "ksh", "mksh", "ash", "hush", "rbash"]
/** Programs that run the command that follows them. */
const WRAPPERS = new Set(["sudo", "doas", "exec", "command", "builtin", "noglob", "env", "nice", "nohup", "busybox", "time", "timeout", "stdbuf", "setsid", "ionice", "pkexec", "runuser", "xargs"])

/** At the start of a command, each one comes before a command, or ends a compound command. The commands between them are the commands that the shell runs. */
const STRUCTURE_WORDS = new Set(["if", "then", "elif", "else", "fi", "while", "until", "do", "done", "!", "{", "}"])
/** Compound commands that the reader does not model. `for NAME in WORDS` and `[[ ... ]]` read as plain commands: they run only the substitutions in their words. */
const KEYWORDS = new Set(["case", "esac", "function", "select", "coproc"])
/** Each one reads a word again as code, or changes how the shell reads the next command. */
const CODE_BUILTINS = new Set(["eval", "alias", "trap", "setopt", "unsetopt", "emulate", "shopt", "enable"])
/** zsh runs the words after each one as a command, or reads it as a part of a compound command. bash reads the name of a program. */
const ZSH_COMMAND_WORDS = new Set(["nocorrect", "repeat", "-", "always", "foreach"])
const READ_PROGRAMS = new Set(["rm", "rmdir", "git", ...SHELLS, ...CODE_BUILTINS])
const ASSIGNMENT_WORD = /^([A-Za-z_][A-Za-z0-9_]*)\+?=/
const FIND_EXEC = /^-(?:exec|execdir|ok|okdir)$/
const PARAMETER = /[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?!$-]/y
/** `${NAME}` and the guard `${NAME:?message}`. Each other `${...}` form has an operator. */
const BRACED_PARAMETER = /\{[A-Za-z_][A-Za-z0-9_]*(?::\?[^}$`"'\\\n]*)?\}/y
const HEREDOC_DELIMITER = /[ \t]*(?:'([A-Za-z_][A-Za-z0-9_]*)'|"([A-Za-z_][A-Za-z0-9_]*)")/y
const DUPLICATE_TARGET = /(?:\d+|-)(?=[\s;&|)]|$)/y
const BRACE_EXPANSION = /\{[^{}]*(?:,|\.\.)[^{}]*\}/
const WORD_END = /[\s;&|<>()]/
/** After these, bash and zsh both read a `$` as the character. */
const PLAIN_AFTER_DOLLAR = /[\s"|)/.,%\\>\];&}<]/
const MAX_SCRIPT_DEPTH = 8
const STANDARD_INPUT_FILE = /^\/dev\/(?:stdin|fd\/\d+)$|^\/proc\/[^/]+\/fd\//

/** The program that a word names: its last path part, with no `.exe`, in lower case. */
export const programName = (text) => String(text ?? "").split(/[\\/]/).pop().replace(/\.exe$/i, "").toLowerCase()

class NotModelled extends Error {}
const notModelled = (construct) => { throw new NotModelled(construct) }

/** One `$` expansion at `reader.index`, added to `word`. A variable and a substitution make the word dynamic: the reader does not know its value. */
function readExpansion(reader, word, inDoubleQuote, depth) {
  const { source } = reader
  const next = source[reader.index + 1] ?? ""
  if (next === "(") {
    if (source[reader.index + 2] === "(") notModelled("an arithmetic expansion `$((`")
    reader.index += 2
    word.nested.push(readList(reader, depth + 1, true))
    word.raw += SUBSTITUTION
    word.text += SUBSTITUTION
    word.dynamic ||= "a command substitution"
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
    reader.index++
    return
  }
  reader.index += 1 + parameter.length
  // bash reads `$$'x'` as the process id and a plain quote, and zsh reads `$` and an ANSI-C quote.
  if (parameter === "$" && !inDoubleQuote && /['"]/.test(source[reader.index] ?? "")) notModelled("a run of `$` before a quote")
  word.raw += `$${parameter}`
  word.text += `$${parameter}`
  word.dynamic ||= "a variable"
}

/**
 * The word at `reader.index`: `source` as written, `raw` with `SUBSTITUTION` for each command substitution, `text` with no quote and
 * no escape, and `dynamic` naming why the shell computes the value ("" for a literal word). `nested` holds the list of each substitution.
 */
function readWord(reader, depth) {
  const { source } = reader
  const word = { raw: "", source: "", text: "", dynamic: "", nested: [], quoted: false }
  let bare = ""
  const start = reader.index
  while (reader.index < source.length) {
    const character = source[reader.index]
    if (WORD_END.test(character)) break
    if (character === "'") {
      const end = source.indexOf("'", reader.index + 1)
      if (end < 0) notModelled("a quote with no end")
      word.raw += source.slice(reader.index, end + 1)
      word.text += source.slice(reader.index + 1, end)
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
          word.raw += inner + escaped
          word.text += /["\\$`]/.test(escaped) ? escaped : inner + escaped
          reader.index += 2
          continue
        }
        word.raw += inner
        word.text += inner
        reader.index++
      }
      word.raw += '"'
      reader.index++
    } else if (character === "\\") {
      const escaped = source[reader.index + 1] ?? ""
      if (escaped === "\n" || escaped === "\r" || escaped === "") notModelled("a line continuation")
      word.raw += character + escaped
      word.text += escaped
      word.quoted = true
      reader.index += 2
    } else if (character === "$") {
      readExpansion(reader, word, false, depth)
    } else if (character === "`") {
      notModelled("a backtick substitution")
    } else {
      word.raw += character
      word.text += character
      bare += character
      reader.index++
    }
  }
  word.source = source.slice(start, reader.index)
  // zsh reads `=name` as the path of the program `name`, and bash reads the characters.
  if (source[start] === "=" && bare.length > 1) word.dynamic ||= "a word that starts with `=`"
  if (bare !== "[" && bare !== "[[" && /[*?[]/.test(bare)) word.dynamic ||= "a glob"
  if (BRACE_EXPANSION.test(bare)) word.dynamic ||= "a brace expansion"
  return word
}

/** The redirect at `reader.index`. `fd` is the word directly before the operator when it is a file descriptor. */
function readRedirect(reader, command, depth, pending) {
  const { source } = reader
  const operator = /^(?:&>>|&>|<<<|<<-|<<|>>|>&|<&|>\||<>|<\(|>\(|[<>])/.exec(source.slice(reader.index, reader.index + 3))[0]
  if (operator === "<<<") notModelled("a here-string (`<<<`)")
  if (operator === "<(" || operator === ">(") notModelled("a process substitution")
  if (operator === ">|" || operator === "<>" || operator === "<<-") notModelled(`the redirect \`${operator}\``)
  reader.index += operator.length
  if (operator === "<<") {
    if (depth > 0) notModelled("a here document inside a substitution or a subshell")
    HEREDOC_DELIMITER.lastIndex = reader.index
    const delimiter = HEREDOC_DELIMITER.exec(source)
    if (!delimiter || !/[\s;&|<>]|^$/.test(source[reader.index + delimiter[0].length] ?? "")) notModelled("a here document with a delimiter that is not one quoted literal word, such as `<<'EOF'`")
    reader.index += delimiter[0].length
    pending.push({ delimiter: delimiter[1] ?? delimiter[2], command })
    return
  }
  if (operator === ">&" || operator === "<&") {
    DUPLICATE_TARGET.lastIndex = reader.index
    const target = DUPLICATE_TARGET.exec(source)
    if (!target) notModelled(`the redirect \`${operator}\` to a target that is no file descriptor`)
    reader.index += target[0].length
    return
  }
  while (source[reader.index] === " " || source[reader.index] === "\t") reader.index++
  const target = readWord(reader, depth)
  if (target.raw === "" || target.dynamic) notModelled(`the redirect \`${operator}\` to a target that is not a literal path`)
  command.redirects.push({ operator, target: target.text })
}

/** Each program that a word list runs: its command word after the wrappers, and the command after each `find -exec`. */
export function invocationsOf(words) {
  const invocations = []
  const isWrapper = (word) => WRAPPERS.has(programName(word.text))
  const isRead = (word) => READ_PROGRAMS.has(programName(word.text))
  const collect = (start) => {
    let index = start
    const wrappers = []
    while (index < words.length && isWrapper(words[index])) {
      wrappers.push(programName(words[index].text))
      index++
      while (index < words.length && !isRead(words[index]) && !isWrapper(words[index])) {
        const { text } = words[index]
        if (text.startsWith("-")) {
          const value = words[index + 1]
          index += value !== undefined && !value.text.startsWith("-") && !value.text.includes("=") && !isRead(value) && !isWrapper(value) ? 2 : 1
        } else if (ASSIGNMENT_WORD.test(text) || /^\d/.test(text)) index++
        else break
      }
    }
    if (index < words.length) invocations.push({ program: words[index], args: words.slice(index + 1), wrappers, before: words.slice(start, index) })
  }
  collect(0)
  words.forEach((word, index) => { if (FIND_EXEC.test(word.text)) collect(index + 1) })
  return invocations
}

/**
 * Option letters that take the next word in a shell of `SHELLS`: `o` (POSIX `sh`), `O` (bash), `R` (ksh) and `T` (mksh).
 * A letter that takes no word in the shell at hand keeps a body that is data, so the rules refuse more, never less.
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

const isShellWord = (word) => SHELLS.includes(programName(word.text))

/** Refuses each command whose words the rules cannot read exactly, and reads each script that a shell in the command runs. */
function finishCommand(command, scriptDepth) {
  const { words } = command
  while (words.length > 0 && ASSIGNMENT_WORD.test(words[0].raw)) command.assignments.push(words.shift())
  if (words.length === 0) return
  for (const { program, args, wrappers, before } of invocationsOf(words)) {
    const computed = [...before, program].find((word) => word.dynamic)
    if (computed) notModelled(`${computed.dynamic} in a command word`)
    const name = programName(program.text)
    if (ZSH_COMMAND_WORDS.has(program.text)) notModelled(`the zsh command word \`${program.text}\`, which runs the words after it as a command`)
    if (CODE_BUILTINS.has(name)) notModelled(`the builtin \`${name}\`, which reads its words again as code or changes how the shell reads a command`)
    if ((name === "source" || name === "." || SHELLS.includes(name)) && args.some((word) => STANDARD_INPUT_FILE.test(word.text))) notModelled("a script from `/dev/stdin`")
    if (name !== "git") continue
    const argument = args.find((word) => word.dynamic)
    if (argument) notModelled(`${argument.dynamic} in a \`git\` argument`)
    if (wrappers.includes("xargs")) notModelled("a `git` command that gets its arguments from `xargs`")
  }
  const shell = words.findIndex(isShellWord)
  if (shell < 0) return
  const computed = words.find((word) => word.dynamic)
  if (computed) notModelled(`${computed.dynamic} in the words of a shell command`)
  if (words.some((word) => programName(word.text) === "xargs")) notModelled("a shell command that gets its words from `xargs`")
  const flag = words.findIndex((word, index) => index > shell && /^-[A-Za-z]*c[A-Za-z]*$/.test(word.text))
  if (flag >= 0 && !words[flag + 1]) notModelled("a shell `-c` with no script word")
  // With `-c` the script is the next word, and standard input is data. With no `-c` and no script file, the shell reads standard input as its script.
  const readsInput = flag < 0 && readsStandardInput(words.slice(shell + 1).map((word) => word.text))
  // A pipe, a loop or a group can give the shell its standard input, so only a here document or a `<` file of its own is a script that the reader knows.
  if (readsInput && command.heredocs.length === 0 && !command.redirects.some(({ operator }) => operator === "<")) notModelled("a shell that reads its script from standard input, with no here document and no `<` file of its own")
  for (const script of flag >= 0 ? [words[flag + 1].text] : readsInput ? command.heredocs : []) command.scripts.push(readScript(script, scriptDepth + 1))
}

/**
 * The list at `reader.index`: pipelines of commands. A list in a substitution or in a subshell ends at its `)`.
 * Each command is `{ words, assignments, redirects, heredocs, scripts }`. A subshell is a command with no word, and its list is a script.
 */
function readList(reader, depth, closes = false, scriptDepth = 0) {
  const { source } = reader
  const list = []
  const pending = []
  let pipeline = []
  let command = { words: [], assignments: [], redirects: [], heredocs: [], scripts: [] }
  const finished = []
  const isEmpty = () => command.words.length === 0 && command.redirects.length === 0 && command.scripts.length === 0
  const endCommand = () => {
    if (!isEmpty()) { finished.push(command); pipeline.push(command) }
    command = { words: [], assignments: [], redirects: [], heredocs: [], scripts: [] }
  }
  const endPipeline = (background = false) => {
    endCommand()
    if (pipeline.length > 0) list.push(Object.assign(pipeline, { background }))
    pipeline = []
  }
  const readBodies = () => {
    for (const { delimiter, command: owner } of pending.splice(0)) {
      const lines = []
      for (;;) {
        if (reader.index >= source.length) notModelled("a here document with no end marker line")
        const lineEnd = source.indexOf("\n", reader.index)
        const line = source.slice(reader.index, lineEnd < 0 ? source.length : lineEnd)
        reader.index = lineEnd < 0 ? source.length : lineEnd + 1
        if (line === delimiter) break
        if (line.trim() === delimiter) notModelled("a here document with a line that looks like its end marker")
        lines.push(line)
      }
      owner.heredocs.push(lines.join("\n"))
    }
  }
  const close = () => {
    if (pending.length > 0) notModelled("a here document with no end marker line")
    endPipeline()
    for (const read of finished) finishCommand(read, scriptDepth)
    return list
  }
  while (reader.index < source.length) {
    const character = source[reader.index]
    const next = source[reader.index + 1] ?? ""
    if (character === " " || character === "\t") { reader.index++; continue }
    if (character === "\n") {
      reader.index++
      readBodies()
      if (!isEmpty() || pipeline.length === 0) endPipeline()
      continue
    }
    if (character === "#") {
      if (depth > 0) notModelled("a comment inside a substitution or a subshell")
      const lineEnd = source.indexOf("\n", reader.index)
      reader.index = lineEnd < 0 ? source.length : lineEnd
      continue
    }
    if (character === ";") {
      if (next === ";" || next === "&") notModelled("the operator `;;`")
      reader.index++
      endPipeline()
      continue
    }
    if (character === "&" && next === "&") { reader.index += 2; endPipeline(); continue }
    if (character === "&" && next !== ">") { reader.index++; endPipeline(true); continue }
    if (character === "|" && next === "|") { reader.index += 2; endPipeline(); continue }
    if (character === "|") {
      if (next === "&") notModelled("the operator `|&`")
      reader.index++
      endCommand()
      continue
    }
    if (character === "(") {
      if (!isEmpty() || next === "(") notModelled("a function, an array or an arithmetic command `(`")
      reader.index++
      command.scripts.push(readList(reader, depth + 1, true, scriptDepth))
      command.subshell = true
      continue
    }
    if (character === ")") {
      if (!closes) notModelled("a `)` with no `$(`")
      reader.index++
      return close()
    }
    if (character === "<" || character === ">" || character === "&") { readRedirect(reader, command, depth, pending); continue }
    const word = readWord(reader, depth)
    const redirectFollows = /[<>]/.test(source[reader.index] ?? "") && source[reader.index - 1] !== undefined && !/\s/.test(source[reader.index - 1])
    if (redirectFollows && /^\{\w+\}$/.test(word.raw)) notModelled("a `{name}>` redirect")
    if (redirectFollows && /^\d+$/.test(word.raw)) continue
    if (isEmpty() && STRUCTURE_WORDS.has(word.raw)) continue
    if (isEmpty() && KEYWORDS.has(word.raw)) notModelled(`the shell keyword \`${word.raw}\``)
    command.words.push(word)
  }
  if (closes) notModelled("a `$(` with no `)`")
  return close()
}

function readScript(source, scriptDepth) {
  if (scriptDepth > MAX_SCRIPT_DEPTH) notModelled("a script inside a script, deeper than the hook reads")
  return readList({ source, index: 0 }, 0, false, scriptDepth)
}

/**
 * The command as the modelled subset reads it: `{ list, notModelled }`. `notModelled` names the first construct outside the
 * subset, or is "". A rule reads `list` only when `notModelled` is "".
 */
export function readCommand(source) {
  try {
    return { list: readScript(source, 0), notModelled: "" }
  } catch (error) {
    if (!(error instanceof NotModelled)) throw error
    return { list: [], notModelled: error.message }
  }
}

/**
 * Calls `visit(command, state)` for each command of the list, in the order in which the shell runs them. `visit` returns the
 * state for the next command. A substitution, a script, a subshell, a background command and a command of a pipeline inherit the state and do not change it.
 */
export function walkCommands(list, state, visit) {
  for (const pipeline of list) {
    for (const command of pipeline) {
      for (const word of command.words) for (const nested of word.nested) walkCommands(nested, state, visit)
      const updated = visit(command, state)
      for (const script of command.scripts) walkCommands(script, state, visit)
      if (pipeline.length === 1 && !pipeline.background && !command.subshell) state = updated
    }
  }
  return state
}

/** What a refusal tells the agent to write in place of a command that is not modelled. */
export const PLAIN_SUBSET_ADVICE =
  "Rewrite the command in the plain subset that the hook reads: plain words, '...' and \"...\" quotes, the operators `;` `&&` `||` `|` and a line end, " +
  "the redirects `>` `>>` `<` `2>&1` to a literal path, a here document at the top level with a quoted delimiter (`<<'EOF'`), and `VAR=value`. " +
  "The hook also reads `if`, `while`, `until` and `for NAME in WORDS` with `then`, `do`, `done` and `fi`, a `( ... )` subshell, a `{ ...; }` group and a background `&`. " +
  "A `$VAR`, a `${VAR:?}`, a glob or a `$(command)` is allowed in an argument and in the value of an assignment, but not in a command word, in a `git` argument or in a shell command. " +
  "For more than that, write the commands to a script file and run the file by its literal path, such as `bash /abs/path.sh`."
