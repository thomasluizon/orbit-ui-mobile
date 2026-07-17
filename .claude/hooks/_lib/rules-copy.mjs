// i18n copy-register invariants — scan only the text an edit INTRODUCED, and
// within that, only the JSON *values* (never the keys). Pure. Both the Claude
// Code PostToolUse hooks and the opencode tool.execute.before plugin call these.
//
// Values-only is the whole soundness argument. A key like `seamless.title` or a
// component prop named `elevate` is not copy; flagging it would be the false
// positive that makes a gate worse than no gate. When a fragment is structured
// but no `"key": "value"` pair is extractable, these fail OPEN and scan nothing:
// a missed edit is cheap, a false block is not.

const isLocaleJson = (filePath) => /\/i18n\/[^/]*\.json$/.test(String(filePath).replace(/\\/g, "/"))

const JSON_PAIR = /"(?:[^"\\]|\\.)*"\s*:\s*"((?:[^"\\]|\\.)*)"/g
const JSON_STRING = /"((?:[^"\\]|\\.)*)"/g

const decode = (raw) => {
  try {
    return JSON.parse(`"${raw}"`)
  } catch {
    return raw
  }
}

// An unquoted fragment is prose unless it is a lone key token. `Edit` does not
// require quotes around `new_string`, so polishing an existing value edits the
// TEXT, not the JSON: added is then `Seamlessly elevate your habits`, with no `"`
// anywhere. That is the modal edit shape and the exact moment a cliche slips in,
// so it must be scanned. The one unquoted thing that is not prose is a key
// fragment, which is a single whitespace-free dotted/camel token.
const isLoneKeyToken = (text) => /^[\w.$-]+$/.test(text)

/**
 * The i18n string values an added-text fragment introduces.
 * Whole-file writes and `"key": "value"` fragments both yield their values; a
 * bare string literal, or a bare unquoted `Edit` value, is treated as a value.
 * Anything else yields nothing rather than guessing key-vs-value.
 */
export function i18nValuesFrom(added) {
  if (typeof added !== "string" || !added) return []
  const pairs = [...added.matchAll(JSON_PAIR)].map((m) => decode(m[1]))
  if (pairs.length) return pairs
  if (!added.includes('"')) {
    const bare = added.trim()
    return bare && !isLoneKeyToken(bare) ? [bare] : []
  }
  if (added.includes(":")) return []
  return [...added.matchAll(JSON_STRING)].map((m) => decode(m[1]))
}

// Interpolation placeholders and inline markup are structure, not prose.
const proseOf = (value) => value.replace(/\{[^}]*\}/g, " ").replace(/<[^>]*>/g, " ")

const CLICHES = [
  /\belevat(?:e|es|ed|ing)\b/i,
  /\bseamless(?:ly)?\b/i,
  /\bunleash(?:es|ed|ing)?\b/i,
  /\bnext-gen(?:eration)?\b/i,
  /\bgame-?chang(?:er|ers|ing)\b/i,
  /\bdelv(?:e|es|ed|ing)\b/i,
  /\btapestry\b/i,
  /\brevolutioni[sz](?:e|es|ed|ing)\b/i,
  /\bsupercharg(?:e|es|ed|ing)\b/i,
  /\bstreamlin(?:e|es|ed|ing)\b/i,
  /\bin the world of\b/i,
]

const report = (filePath, findings, why) => ({
  block: true,
  message: `${why.headline} (${filePath}):\n` + findings.map((f) => `  - ${f}`).join("\n") + `\n\n${why.body}\n`,
})

export function checkAiClicheCopy(added, filePath) {
  if (!filePath || !isLocaleJson(filePath)) return null
  const findings = []
  for (const value of i18nValuesFrom(added)) {
    for (const pattern of CLICHES) {
      const hit = pattern.exec(proseOf(value))
      if (hit) findings.push(`"${hit[0]}" in ${JSON.stringify(value)}`)
    }
  }
  if (!findings.length) return null
  return report(filePath, findings, {
    headline: "Banned AI-cliché word newly written into Orbit copy",
    body:
      "DESIGN.md bans this register: it is a stock LLM tell, not Orbit's voice. Say the plain thing the\n" +
      "string actually does (\"Sync your habits\", not \"Seamlessly elevate your workflow\").",
  })
}

const PLACEHOLDERS = [/\bjohn doe\b/i, /\bjane doe\b/i, /\bacme\b/i, /\blorem ipsum\b/i]

export function checkPlaceholderContent(added, filePath) {
  // i18n values ONLY. The spec proposed covering committed fixtures too, but a
  // unit test legitimately needs *a* name: orbit-api's own suite uses "John Doe"
  // and "ACME" correctly today. Placeholder content is a defect when it reaches
  // the product, not when it seeds a test. See PR for #539 bundle 4b.
  if (!filePath || !isLocaleJson(filePath)) return null
  const findings = []
  for (const value of i18nValuesFrom(added)) {
    for (const pattern of PLACEHOLDERS) {
      const hit = pattern.exec(proseOf(value))
      if (hit) findings.push(`"${hit[0]}" in ${JSON.stringify(value)}`)
    }
  }
  if (!findings.length) return null
  return report(filePath, findings, {
    headline: "Placeholder content newly written into Orbit copy",
    body: "Ship the real string. Placeholder names and lorem ipsum in a locale file reach users verbatim.",
  })
}

const hasLetters = (text) => /\p{L}/u.test(text)
const isAllUppercase = (text) => hasLetters(text) && text === text.toUpperCase() && text !== text.toLowerCase()
const longestUppercaseRun = (text) => Math.max(0, ...[...text.matchAll(/\p{Lu}+/gu)].map((m) => m[0].length))

export function checkTypedUppercase(added, filePath) {
  if (!filePath || !isLocaleJson(filePath)) return null
  const findings = []
  for (const value of i18nValuesFrom(added)) {
    const prose = proseOf(value)
    if (!isAllUppercase(prose)) continue
    // A single token is an acronym, a unit, or a literal the user must type back
    // (AM/PM, HH:MM, XP, PRO, and the "ORBIT" fresh-start confirmation) — never a
    // sentence someone shouted. Requiring a >=3 letter run alongside a second
    // token is what separates "ASK ASTRA" from "AM/PM"; verified against the real
    // en.json + pt-BR.json, where it flags the two eyebrow strings and nothing else.
    if (prose.split(/\s+/).filter(Boolean).length < 2) continue
    if (longestUppercaseRun(prose) < 3) continue
    findings.push(JSON.stringify(value))
  }
  if (!findings.length) return null
  return report(filePath, findings, {
    headline: "UPPERCASE typed into an Orbit string",
    body:
      "DESIGN.md (Copy): store copy in natural case and control presentation with `text-transform`.\n" +
      "Baked-in caps double the cost of any restyle and fork the locales. The only uppercase surfaces\n" +
      "are the locked roles (eyebrow, NavHeader title, Badge), and those uppercase in CSS, not in the string.",
  })
}
