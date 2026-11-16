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

/** `kept` is the command without its redirects, and `hereStrings` holds the word of each here-string, which `kept` also holds when `keepHereStrings` is true. */
function cutRedirects(command, keepHereStrings) {
  const hereStrings = []
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
    if (operator === "<<<") hereStrings.push(target.trim())
    if (operator === "<<<" && keepHereStrings) { kept += " <<< "; index += operator.length - 1; continue }
    kept = `${kept.replace(/(?:(?<!\S)\d+|&)$/, "")} `
    index += operator.length + target.length - 1
  }
  return { kept, hereStrings }
}

/**
 * The command without its redirects: each unquoted operator, the file descriptor or the `&` before it, and its target word.
 * The shell cuts a redirect from a word with or without a space. A here-string stays as a word of its own, because its word is
 * text that its command reads. With `keepHereStrings: false` it goes too, for a reader that wants the arguments only.
 */
export const withoutRedirects = (command, { keepHereStrings = true } = {}) => cutRedirects(command, keepHereStrings).kept

/** The word of each here-string of the command, as written: text that the command reads on standard input, and no argument. */
export const hereStringWords = (command) => cutRedirects(command, false).hereStrings

const HEREDOC_OPENER = /<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1([^\n]*)\n/y

/** The heredoc whose operator is at `index`, or null when no later line is its terminator. */
function heredocAt(command, index) {
  HEREDOC_OPENER.lastIndex = index
  const opener = HEREDOC_OPENER.exec(command)
  if (!opener) return null
  const bodyStart = index + opener[0].length
  const terminator = new RegExp(`^${opener[2]}[ \\t]*$`, "gm")
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
    if (open || character !== "<" || command[index + 1] !== "<") continue
    if (command[index + 2] === "<") { index += 2; continue }
    open = heredocAt(command, index)
    if (!open) { index++; continue }
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
  const binary = shellValue(words[0]).split(/[\\/]/).pop()
  if (binary === "eval") {
    const redirect = words.findIndex((word, index) => index > 0 && /^\d*[<>]/.test(word))
    const end = redirect < 0 ? words.length : redirect
    return {
      source: words.slice(1, end).map(shellValue).join(" "),
      command: ["eval", "__shell_body__", ...words.slice(end)].join(" "),
      isolated: false,
    }
  }
  if (!["sh", "bash", "zsh"].includes(binary)) return null
  const flag = words.findIndex((word, index) => index > 0 && /^-[a-z]*c[a-z]*$/i.test(word))
  if (flag < 0) return null
  const source = shellValue(words[flag + 1])
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
