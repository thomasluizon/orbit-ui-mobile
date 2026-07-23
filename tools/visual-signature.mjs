#!/usr/bin/env node
// The render-affecting fingerprint of a source file, used to answer "was
// deliberate VISUAL work done here?" without rendering anything.
//
// Why not a plain content hash of the file: it answers a different question.
// A whole-file (or whole-import-closure) hash reports CHANGED for a `prettier
// --write` sweep, an import reorder, or a variable rename - so one formatting
// codemod flips every surface to "worked on" and the metric is worthless. That
// attack was raised by the adversarial council pass on 2026-07-19 and is the
// specific reason this file exists.
//
// The signature keeps only what can change pixels: JSX element and attribute
// names, every string and numeric literal (which is where className strings,
// style values, design tokens and user-facing copy live), and dotted property
// chains (`theme.spacing.md`, `colors.primary`). It drops comments,
// whitespace, import declarations, type annotations, and identifier
// declarations. Parsing is done with the TypeScript compiler API rather than a
// regex so that JSX inside conditionals, `.map()` bodies, `cva`/`clsx` variant
// maps and spread props are all walked structurally instead of pattern-matched.
//
// Fail-closed contract: a file that cannot be parsed returns null, and every
// caller MUST treat null as "unknown", never as "unchanged". An extractor bug
// must not silently grant a surface.

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const ts = require("typescript")

const SCRIPT_KIND_BY_EXTENSION = new Map([
  [".tsx", ts.ScriptKind.TSX],
  [".jsx", ts.ScriptKind.JSX],
  [".ts", ts.ScriptKind.TS],
  [".js", ts.ScriptKind.JS],
])

/** Dotted text of a property-access chain (`theme.spacing.md`), or null when it is computed. */
function propertyChain(node) {
  const parts = []
  let current = node
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text)
    current = current.expression
  }
  if (!ts.isIdentifier(current)) return null
  parts.unshift(current.text)
  return parts.join(".")
}

// Parent pointers are deliberately off (createSourceFile setParentNodes=false)
// because they cost memory across ~1000 files, so node.getText() is unusable
// here - every name is read off the AST node directly instead.
function nameTextOf(name) {
  if (!name) return "<computed>"
  if (ts.isIdentifier(name)) return name.text
  if (ts.isPropertyAccessExpression(name)) return propertyChain(name) ?? "<computed>"
  if (ts.isJsxNamespacedName?.(name)) return `${nameTextOf(name.namespace)}:${nameTextOf(name.name)}`
  return typeof name.escapedText === "string" ? name.escapedText : "<computed>"
}

/**
 * The ordered render-affecting tokens of one source file.
 * @param {string} source file contents
 * @param {string} fileName used only to pick the TypeScript script kind
 * @returns {string[] | null} tokens in source order, or null when the file cannot be parsed
 */
export function extractTokens(source, fileName) {
  const extension = fileName.slice(fileName.lastIndexOf("."))
  const scriptKind = SCRIPT_KIND_BY_EXTENSION.get(extension)
  if (!scriptKind) return extractCssTokens(source)

  let tree
  try {
    tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, scriptKind)
  } catch {
    return null
  }

  const tokens = []
  const visit = (node) => {
    // Imports carry no render-affecting content of their own; the modules they
    // pull in are fingerprinted separately as files in their own right, so
    // walking them here would make an import reorder look like a visual change.
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) tokens.push(`<${nameTextOf(node.tagName)}`)
    else if (ts.isJsxAttribute(node)) tokens.push(`@${nameTextOf(node.name)}`)
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) tokens.push(`"${node.text}`)
    else if (ts.isJsxText(node)) {
      const trimmed = node.text.trim()
      if (trimmed) tokens.push(`t${trimmed}`)
    } else if (ts.isNumericLiteral(node)) tokens.push(`#${node.text}`)
    else if (ts.isPropertyAccessExpression(node)) {
      const chain = propertyChain(node)
      if (chain) {
        // The ROOT identifier is dropped: it is a local binding name, so
        // renaming `items.map((i) => i.id)` to `(entry) => entry.id` must not
        // read as a visual change. The property PATH is kept, because
        // `theme.spacing.md` -> `theme.spacing.lg` genuinely is one.
        tokens.push(`.${chain.slice(chain.indexOf(".") + 1)}`)
        return
      }
    }

    ts.forEachChild(node, visit)
  }

  try {
    ts.forEachChild(tree, visit)
  } catch {
    return null
  }
  return tokens
}

/** CSS carries no JSX, so its signature is its declarations with comments and whitespace removed. */
function extractCssTokens(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, " ")
  return withoutComments
    .split(/[\n;{}]/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => line.length > 0)
}

/**
 * Stable hash of a file's render-affecting content.
 * @param {string} absolutePath file to fingerprint
 * @returns {string | null} sha256 hex, or null when the file is unreadable or unparseable
 */
export function signatureOfFile(absolutePath) {
  let source
  try {
    source = readFileSync(absolutePath, "utf8")
  } catch {
    return null
  }
  return signatureOfSource(source, absolutePath)
}

/**
 * Stable hash of already-loaded source.
 * @param {string} source file contents
 * @param {string} fileName used only to pick the parser
 * @returns {string | null} sha256 hex, or null when the source cannot be parsed
 */
export function signatureOfSource(source, fileName) {
  const tokens = extractTokens(source, fileName)
  if (tokens === null) return null
  const hash = createHash("sha256")
  for (const token of tokens) hash.update(token).update("")
  return hash.digest("hex")
}

/**
 * How much of a render-affecting token stream changed, 0 (identical) to 1 (nothing in common).
 *
 * A hash answers "did anything change" and nothing more, which let a surface with
 * FOUR changed lines report exactly the same as one that was rebuilt. Measured
 * 2026-07-19 against the pre-#539 baseline: route-calendar came back 9.6% changed
 * across 12 files while reporting `touched`, and Thomas kept opening it and finding
 * it unchanged. He was right; the instrument was reporting existence, not depth.
 *
 * Multiset Jaccard over token COUNTS, not a set: moving one row from a repeated
 * component must register, and a set would swallow it.
 *
 * @param {string[]} baselineTokens tokens as the surface stood at the baseline
 * @param {string[]} headTokens tokens as it stands now
 * @returns {number} 0..1
 */
export function tokenDistance(baselineTokens, headTokens) {
  const count = (tokens) => {
    const counts = new Map()
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
    return counts
  }
  const baseline = count(baselineTokens)
  const head = count(headTokens)
  let shared = 0
  let total = 0
  for (const token of new Set([...baseline.keys(), ...head.keys()])) {
    const inBaseline = baseline.get(token) ?? 0
    const inHead = head.get(token) ?? 0
    shared += Math.min(inBaseline, inHead)
    total += Math.max(inBaseline, inHead)
  }
  return total === 0 ? 0 : 1 - shared / total
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  for (const file of process.argv.slice(2)) {
    process.stdout.write(`${signatureOfFile(file) ?? "UNPARSEABLE"}  ${file}\n`)
  }
}
