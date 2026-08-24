#!/usr/bin/env node
// The copy-register gate (D6): AI-cliche words, placeholder
// content, and typed-in UPPERCASE in locale string VALUES, plus hardcoded
// brand-accent colors in source. Replaces the added-text-only PostToolUse
// hooks (forbid-ai-cliche-copy, forbid-placeholder-content,
// forbid-typed-uppercase, forbid-hardcoded-brand-color), whose confirmed
// defect was scanning only the text an edit introduced - a file arriving via
// checkout, merge, or codegen was never scanned. This scans the FILES.
//
// Values-only is the soundness argument for the copy checks: a key like
// `seamless.title` is not copy; flagging it would be the false positive that
// makes a gate worse than no gate.
//
// Usage:
//   node tools/check-copy.mjs --check             full scan vs tools/copy-baseline.json (exit 1 on growth)
//   node tools/check-copy.mjs --write-baseline    regenerate tools/copy-baseline.json

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const BASELINE_PATH = join(REPO_ROOT, "tools", "copy-baseline.json")

/** Per-repo surface config; the vendored copies in orbit-api / orbit-landing-page adjust this block only. */
const LOCALE_FILES = ["packages/shared/src/i18n/en.json", "packages/shared/src/i18n/pt-BR.json"]
const TOKEN_FILE = "apps/web/app/globals.css"
const BRAND_COLOR_GLOBS = [/^apps\/(web|mobile)\/.*\.(ts|tsx|css)$/]
const BRAND_COLOR_EXEMPT = [
  /^apps\/web\/app\/globals\.css$/,
  /^apps\/mobile\/lib\/theme\.ts$/,
  /\/__tests__\//,
  /\.(test|spec)\.(ts|tsx)$/,
]

// DESIGN.md "Voice" enumerates 25 banned entries, each with a scope column:
//   microcopy = i18n string values (what this scanner reads)
//   long-form = the landing page, ADRs and store copy (a different corpus, not scanned here)
//   both      = everywhere
// Only the microcopy-visible entries live here. Entry 17 (em/en dash) ships in
// tools/check-dashes.mjs. Entries 2-6, 12-14 and 16 are long-form structural tells with no
// microcopy surface. Entries 11, 15 and 24 need cross-string or layout context a per-string
// scanner cannot see, and stay with the design-reviewer agent.
// https://github.com/thomasluizon/orbit-tickets/issues/36
const BANNED_COPY = [
  { entry: 7, kind: "puffery", pattern: /\b(?:crucial|pivotal|vital|essential|game-?chang(?:er|ers|ing))(?!\p{L})/iu },
  { entry: 8, kind: "ai-cliche", pattern: /\b(?:delv(?:e|es|ed|ing)|harness(?:es|ed|ing)?|unlock(?:s|ed|ing)?|elevat(?:e|es|ed|ing)|empower(?:s|ed|ing)?|supercharg(?:e|es|ed|ing)|seamless(?:ly)?|robust|cutting-edge|revolutionar(?:y|ily)|revolutioni[sz](?:e|es|ed|ing))\b/i },
  { entry: 8, kind: "ai-cliche", pattern: /\bleverag(?:e|es|ed|ing)\b/i },
  { entry: 9, kind: "weasel-attribution", pattern: /\b(?:experts agree|studies show|science says)\b/i },
  { entry: 10, kind: "fake-strong-verb", pattern: /\b(?:utiliz(?:e|es|ed|ing)|commenc(?:e|es|ed|ing))\b/i },
  { entry: 18, kind: "cutesy-error", pattern: /\b(?:oops|uh[ -]oh|whoops)\b/i },
  { entry: 20, kind: "dead-link-label", pattern: /\b(?:click here|read more)\b/i },
  { entry: 21, kind: "the-user", pattern: /\bthe user\b/i },
  // "maximizar" is dropped from entry 22: it is also the panel-control verb ("Maximizar"),
  // and the puffery sense cannot be told apart from the control sense in a single string.
  { entry: 22, kind: "pt-br-puffery", pattern: /\b(?:otimiz|potencializ)(?:e|es|ar|ando|ado|ada)?(?!\p{L})/iu },
  { entry: 23, kind: "journey-framing", pattern: /\b(?:comece sua jornada|sua jornada|your journey)\b/i },
  { entry: 25, kind: "medical-claim", pattern: /\b(?:treats ADHD|cure[sd]?\b|fixes your brain)\b/i },
  // Legacy entries kept: they predate the enumeration and are still banned by entry 8 in spirit.
  { entry: 8, kind: "ai-cliche", pattern: /\b(?:unleash(?:es|ed|ing)?|next-gen(?:eration)?|tapestry|streamlin(?:e|es|ed|ing)|in the world of)\b/i },
]

// Entry 1, read as DESIGN.md "Voice" states it: "Zero exclamation marks. Confidence, not
// euphoria." No key-name heuristic: it is every locale string, because any heuristic leaves
// the register unenforced on the keys it did not think of.

// Entry 19: "Are you sure?" as a confirmation body. microcopy scope.
const ARE_YOU_SURE = /\bare you sure\b/i
const TEM_CERTEZA = /\btem certeza\b/i

const PLACEHOLDERS = [/\bjohn doe\b/i, /\bjane doe\b/i, /\bacme\b/i, /\blorem ipsum\b/i]

const proseOf = (value) => value.replace(/\{[^}]*\}/g, " ").replace(/<[^>]*>/g, " ")
const hasLetters = (text) => /\p{L}/u.test(text)
const isAllUppercase = (text) => hasLetters(text) && text === text.toUpperCase() && text !== text.toLowerCase()
const longestUppercaseRun = (text) => Math.max(0, ...[...text.matchAll(/\p{Lu}+/gu)].map((m) => m[0].length))

const flattenValues = (node, path = []) => {
  if (typeof node === "string") return [[path.join("."), node]]
  if (Array.isArray(node)) return node.flatMap((item, index) => flattenValues(item, [...path, String(index)]))
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) => flattenValues(value, [...path, key]))
  }
  return []
}

const localeFindings = () => {
  const findings = []
  for (const file of LOCALE_FILES) {
    const absolute = join(REPO_ROOT, file)
    if (!existsSync(absolute)) continue
    const entries = flattenValues(JSON.parse(readFileSync(absolute, "utf8")))
    for (const [key, value] of entries) {
      const prose = proseOf(value)
      for (const { entry, kind, pattern } of BANNED_COPY) {
        const hit = pattern.exec(prose)
        if (hit) findings.push({ file, key, kind, detail: `entry ${entry}: "${hit[0]}" in ${JSON.stringify(value)}` })
      }
      if (prose.includes("!")) {
        findings.push({ file, key, kind: "exclamation", detail: `entry 1: ${JSON.stringify(value)}` })
      }
      if (ARE_YOU_SURE.test(prose) || TEM_CERTEZA.test(prose)) {
        findings.push({ file, key, kind: "are-you-sure", detail: `entry 19: ${JSON.stringify(value)}` })
      }
      for (const pattern of PLACEHOLDERS) {
        const hit = pattern.exec(prose)
        if (hit) findings.push({ file, key, kind: "placeholder", detail: `"${hit[0]}" in ${JSON.stringify(value)}` })
      }
      if (
        isAllUppercase(prose) &&
        prose.split(/\s+/).filter(Boolean).length >= 2 &&
        longestUppercaseRun(prose) >= 3
      ) {
        findings.push({ file, key, kind: "typed-uppercase", detail: JSON.stringify(value) })
      }
    }
  }
  return findings
}

const brandColorFindings = () => {
  const tokenAbsolute = join(REPO_ROOT, TOKEN_FILE)
  if (!existsSync(tokenAbsolute)) return []
  const tokens = readFileSync(tokenAbsolute, "utf8")
  const bannedHex = new Set(
    [...tokens.matchAll(/--(?:color-)?primary(?:-pressed)?:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1].toLowerCase()),
  )
  const bannedRgb = new Set(
    [...tokens.matchAll(/--primary-rgb:\s*(\d+,\s*\d+,\s*\d+)/g)].map((m) => m[1].replace(/\s+/g, "")),
  )
  if (bannedHex.size === 0 && bannedRgb.size === 0) return []

  const files = execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, "/"))
    .filter((file) => BRAND_COLOR_GLOBS.some((g) => g.test(file)) && !BRAND_COLOR_EXEMPT.some((g) => g.test(file)))

  const findings = []
  for (const file of files) {
    const text = readFileSync(join(REPO_ROOT, file), "utf8")
    const lower = text.toLowerCase()
    const compact = text.replace(/\s+/g, "")
    for (const hex of bannedHex) {
      if (lower.includes(hex)) findings.push({ file, key: hex, kind: "brand-color", detail: `${hex} -> use the --primary token` })
    }
    for (const rgb of bannedRgb) {
      if (compact.includes(rgb)) findings.push({ file, key: rgb, kind: "brand-color", detail: `rgb(${rgb}) -> use rgba(var(--primary-rgb), a)` })
    }
  }
  return findings
}

const allFindings = () => [...localeFindings(), ...brandColorFindings()]

const keyOf = (finding) => `${finding.kind} :: ${finding.file} :: ${finding.key}`

const USAGE = `usage: check-copy.mjs --check | --write-baseline

  --check           fail on any locale-copy or brand-color finding not in tools/copy-baseline.json
  --write-baseline  regenerate tools/copy-baseline.json
  --help, -h        print this usage and exit 0

exit codes: 0 clean, 1 a finding outside the baseline, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const mode = process.argv[2]
const findings = allFindings()
const current = findings.map(keyOf).sort()

if (mode === "--write-baseline") {
  writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n")
  console.log(`copy-baseline.json written: ${current.length} entries`)
  process.exit(0)
}

if (mode === "--check") {
  const baseline = new Set(existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : [])
  const fresh = findings.filter((finding) => !baseline.has(keyOf(finding)))
  if (fresh.length) {
    console.error("Copy-register violations not in the committed baseline:")
    for (const finding of fresh) console.error(`  [${finding.kind}] ${finding.file} :: ${finding.key} :: ${finding.detail}`)
    console.error(
      "\nSay the plain thing the string does; store copy in natural case (text-transform owns presentation);\n" +
        "ship real strings, never placeholders; accents come from tokens, never raw literals.\n" +
        "The baseline (tools/copy-baseline.json) may only shrink; the whole-app copy pass (R19) clears it.",
    )
    process.exit(1)
  }
  const stale = [...baseline].filter((entry) => !current.includes(entry))
  if (stale.length) {
    console.error(`Baseline is stale (${stale.length} fixed entries still listed). Run --write-baseline to shrink it.`)
  }
  process.exit(0)
}

console.error(USAGE)
process.exit(2)
