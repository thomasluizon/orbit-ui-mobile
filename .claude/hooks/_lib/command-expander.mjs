// Inspect executable shell bodies without executing any part of the supplied command.

export const commandWords = (source) =>
  (source.match(/(?:[^\s"'\\]|\\.|"(?:\\.|[^"\\])*"|'[^']*')+/g) ?? [])
    .map((word) => word.replace(/^[()]+|[()]+$/g, ""))

export const shellValue = (word) => String(word ?? "").replace(/^(["'])([\s\S]*)\1$/, "$2").replace(/\\([\\"$`])/g, "$1")

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

function splitCommands(source) {
  const segments = []
  const substitutions = []
  let current = ""
  let quote = ""
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (character === "\\" && quote !== "'") { current += source.slice(index, index + 2); index++; continue }
    const substitution = quote !== "'" && (character === "`" || (character === "$" && source[index + 1] === "("))
    if (substitution) {
      const start = index + (character === "`" ? 1 : 2)
      const end = substitutionEnd(source, start, character === "`")
      const body = source.slice(start, end)
      substitutions.push(character === "`" ? body.replace(/\\([\\$`])/g, "$1") : body)
      current += " __substitution__ "
      index = end
      continue
    }
    if (quote) {
      if (character === quote) quote = ""
      current += character
      continue
    }
    if (character === "'" || character === '"') { quote = character; current += character; continue }
    const redirect = (character === "|" && current.endsWith(">")) || (character === "&" && /[<>]$/.test(current))
    if (!redirect && /[&|;\n]/.test(character)) { segments.push(current); current = ""; continue }
    current += character
  }
  segments.push(current)
  return { segments, substitutions, unbalanced: quote !== "" }
}

function wrapperBody(segment) {
  const words = commandWords(segment)
  while (/^[\w]+=/.test(words[0] ?? "")) words.shift()
  const binary = shellValue(words[0]).split(/[\\/]/).pop()
  if (binary === "eval") return words.slice(1).map(shellValue).join(" ")
  if (!["sh", "bash", "zsh"].includes(binary)) return null
  const flag = words.findIndex((word, index) => index > 0 && /^-[a-z]*c[a-z]*$/i.test(word))
  return flag < 0 ? null : shellValue(words[flag + 1])
}

/** Substitutions precede the enclosing command so a sanctioned wrapper cannot hide a write. */
export function expandCommands(source, depth = 0) {
  if (depth > 32) throw new Error("shell expansion nesting exceeds inspection limit")
  const { segments, substitutions, unbalanced } = splitCommands(source)
  const expanded = substitutions.flatMap((body) => expandCommands(body, depth + 1))
  for (const segment of segments) {
    const body = wrapperBody(segment)
    if (body) expanded.push(...expandCommands(body, depth + 1))
    expanded.push(segment.replace(/^[\s(]+/, "").replace(/[)\s]+$/, ""))
  }
  if (unbalanced) expanded.push(...expandCommands(source.replace(/["']/g, ""), depth + 1))
  return expanded
}
