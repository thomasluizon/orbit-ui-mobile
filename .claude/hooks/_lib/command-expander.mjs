// Inspect executable shell bodies without executing any part of the supplied command.

export const commandWords = (source) =>
  (source.match(/(?:[^\s"'\\]|\\.|"(?:\\.|[^"\\])*"|'[^']*')+/g) ?? [])
    .map((word) => word.replace(/^[()]+|[()]+$/g, ""))

export const shellValue = (word) => String(word ?? "").replace(/^(["'])([\s\S]*)\1$/, "$2").replace(/\\([\\"$`])/g, "$1")

/** Stands for a command substitution in the command that holds it. */
export const SUBSTITUTION = "__substitution__"

const REDIRECT_OPERATOR = /<<<|<<-?|>>|>&|<&|>\||<>|[<>]/y
const REDIRECT_TARGET = /[ \t]*(?:[^\s"'\\<>&|;]|\\.|"(?:\\.|[^"\\])*"|'[^']*')*/y

/**
 * The command without its redirects: each unquoted operator, the file descriptor or the `&` before it, and its target word.
 * The shell cuts a redirect from a word with or without a space. A here-string stays, because its word is text that its command reads.
 */
export function withoutRedirects(command) {
  let kept = ""
  let quote = ""
  for (let index = 0; index < command.length; index++) {
    const character = command[index]
    if (character === "\\" && quote !== "'") { kept += command.slice(index, index + 2); index++; continue }
    if (quote) {
      if (character === quote) quote = ""
      kept += character
      continue
    }
    if (character === "'" || character === '"') { quote = character; kept += character; continue }
    REDIRECT_OPERATOR.lastIndex = index
    const operator = REDIRECT_OPERATOR.exec(command)?.[0]
    if (!operator) { kept += character; continue }
    if (operator === "<<<") { kept += operator; index += operator.length - 1; continue }
    REDIRECT_TARGET.lastIndex = index + operator.length
    kept = `${kept.replace(/(?:(?<!\S)\d+|&)$/, "")} `
    index = REDIRECT_TARGET.lastIndex + REDIRECT_TARGET.exec(command)[0].length - 1
  }
  return kept
}

function substitutionEnd(source, start, backtick) {
  let depth = 1
  let quote = ""
  for (let index = start; index < source.length; index++) {
    const character = source[index]
    if (character === "\\") { index++; continue }
    if (backtick && character === "`") return index
    if (quote) {
      if (character === quote) quote = ""
      continue
    }
    if (character === "'" || character === '"') { quote = character; continue }
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
    const substitution = quote !== "'" && (character === "`" || (character === "$" && source[index + 1] === "("))
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
      if (character === quote) quote = ""
      current += character
      continue
    }
    if (character === "'" || character === '"') { quote = character; current += character; continue }
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
  while (/^[\w]+=/.test(words[0] ?? "")) words.shift()
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
  return state
}

/** Stateless consumers still inspect every executable body in invocation order. */
export function expandCommands(source) {
  const expanded = []
  inspectCommands(source, null, (command) => { expanded.push(command); return null })
  return expanded
}
