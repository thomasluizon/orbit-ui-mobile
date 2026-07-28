#!/usr/bin/env node
/**
 * Compares the six load-bearing harness twins in orbit-ui-mobile and orbit-api.
 * Intentional Markdown differences must match a justified fingerprint in the
 * adjacent declaration manifest. The second-opinion script is byte-exact.
 */

import { createHash } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url))
const UI_ROOT = resolve(TOOLS_DIR, "..")
const DEFAULT_MANIFEST = resolve(TOOLS_DIR, "lockstep-declarations.json")
const REQUIRED_PATHS = [
  ".claude/skills/pr-review/SKILL.md",
  ".claude/skills/pr-review/rubric.md",
  ".claude/skills/_shared/verification-protocol.md",
  ".claude/agents/contract-aligner.md",
  ".claude/agents/security-reviewer.md",
  ".claude/skills/second-opinion/second-opinion.mjs",
]
const BYTE_EXACT_PATH = ".claude/skills/second-opinion/second-opinion.mjs"

const USAGE = `usage: check-lockstep.mjs [--ui-root <dir>] [--api-root <dir>] [--manifest <file>]

  Compares the six harness twins shared by orbit-ui-mobile and orbit-api.
  Markdown is compared line by line after LF normalization. An intentional
  difference passes only when its diff-hunk fingerprint has a nonempty
  justification in the manifest. second-opinion.mjs is compared byte for byte.

  --ui-root <dir>   orbit-ui-mobile root; defaults to this script's repository
  --api-root <dir>  orbit-api root; defaults to .claude/orchestrator.json repos.api,
                    then the sibling orbit-api directory
  --manifest <file> declaration manifest; defaults beside this script
  --help, -h        print this contract and exit 0

exit codes: 0 all six pairs pass, 1 drift/unreadable input/invalid declaration, 2 usage error`

const failUsage = (message) => {
  console.error(`check-lockstep: ${message}\n`)
  console.error(USAGE)
  process.exit(2)
}

const parseArgs = () => {
  const options = { uiRoot: UI_ROOT, apiRoot: null, manifest: DEFAULT_MANIFEST }
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === "--help" || argument === "-h") {
      console.log(USAGE)
      process.exit(0)
    }
    const key = { "--ui-root": "uiRoot", "--api-root": "apiRoot", "--manifest": "manifest" }[argument]
    if (!key) failUsage(`unknown argument: ${argument}`)
    const value = args[++index]
    if (!value || value.startsWith("--")) failUsage(`${argument} requires a value`)
    options[key] = resolve(value)
  }
  return options
}

const defaultApiRoot = (uiRoot) => {
  const configPath = resolve(uiRoot, ".claude", "orchestrator.json")
  if (existsSync(configPath)) {
    try {
      const configured = JSON.parse(readFileSync(configPath, "utf8"))?.repos?.api
      if (typeof configured === "string" && configured.trim()) return resolve(configured)
    } catch {
      return resolve(uiRoot, "..", "orbit-api")
    }
  }
  return resolve(uiRoot, "..", "orbit-api")
}

const lineDiff = (uiText, apiText) => {
  const ui = uiText.replaceAll("\r\n", "\n").split("\n")
  const api = apiText.replaceAll("\r\n", "\n").split("\n")
  const lengths = Array.from({ length: ui.length + 1 }, () => new Uint16Array(api.length + 1))
  for (let uiIndex = ui.length - 1; uiIndex >= 0; uiIndex--) {
    for (let apiIndex = api.length - 1; apiIndex >= 0; apiIndex--) {
      lengths[uiIndex][apiIndex] =
        ui[uiIndex] === api[apiIndex]
          ? lengths[uiIndex + 1][apiIndex + 1] + 1
          : Math.max(lengths[uiIndex + 1][apiIndex], lengths[uiIndex][apiIndex + 1])
    }
  }

  const hunks = []
  let uiIndex = 0
  let apiIndex = 0
  let current = null
  const append = (side, line, lineNumber) => {
    if (!current) current = { ui: [], api: [], uiLine: uiIndex + 1, apiLine: apiIndex + 1 }
    current[side].push(line)
    current[`${side}Line`] = Math.min(current[`${side}Line`], lineNumber)
  }
  const flush = () => {
    if (current) hunks.push(current)
    current = null
  }

  while (uiIndex < ui.length || apiIndex < api.length) {
    if (uiIndex < ui.length && apiIndex < api.length && ui[uiIndex] === api[apiIndex]) {
      flush()
      uiIndex++
      apiIndex++
    } else if (apiIndex >= api.length || (uiIndex < ui.length && lengths[uiIndex + 1][apiIndex] >= lengths[uiIndex][apiIndex + 1])) {
      append("ui", ui[uiIndex], uiIndex + 1)
      uiIndex++
    } else {
      append("api", api[apiIndex], apiIndex + 1)
      apiIndex++
    }
  }
  flush()
  return hunks
}

const fingerprint = (hunk) =>
  createHash("sha256").update(JSON.stringify({ ui: hunk.ui, api: hunk.api })).digest("hex")

const readManifest = (path) => {
  const parsed = JSON.parse(readFileSync(path, "utf8"))
  const paths = Object.keys(parsed.files ?? {})
  if (parsed.version !== 1 || paths.length !== REQUIRED_PATHS.length || REQUIRED_PATHS.some((path) => !paths.includes(path))) {
    throw new Error("manifest must declare exactly the six lockstep paths")
  }
  for (const [path, entry] of Object.entries(parsed.files)) {
    if (!Array.isArray(entry.declarations)) throw new Error(`${path}: declarations must be an array`)
    if (path === BYTE_EXACT_PATH && entry.declarations.length) throw new Error(`${path}: byte-exact file cannot declare differences`)
    const ids = new Set()
    for (const declaration of entry.declarations) {
      if (!declaration.id?.trim() || !declaration.justification?.trim() || !Array.isArray(declaration.fingerprints) || !declaration.fingerprints.length) {
        throw new Error(`${path}: every declaration needs an id, justification, and fingerprints`)
      }
      if (ids.has(declaration.id)) throw new Error(`${path}: duplicate declaration id ${declaration.id}`)
      ids.add(declaration.id)
      if (declaration.fingerprints.some((value) => !/^[a-f0-9]{64}$/.test(value))) {
        throw new Error(`${path}: declaration ${declaration.id} has an invalid fingerprint`)
      }
    }
  }
  return parsed
}

const preview = (lines) => {
  const line = lines.find((value) => value.trim()) ?? "(empty side)"
  return line.length > 120 ? `${line.slice(0, 117)}...` : line
}

const options = parseArgs()
options.apiRoot ??= defaultApiRoot(options.uiRoot)

let manifest
try {
  for (const [label, root] of [["ui", options.uiRoot], ["api", options.apiRoot]]) {
    if (!statSync(root).isDirectory()) throw new Error(`${label} root is not a directory: ${root}`)
  }
  manifest = readManifest(options.manifest)
} catch (error) {
  console.error(`check-lockstep: unreadable comparison input: ${error.message}`)
  process.exit(1)
}

const failures = []
for (const path of REQUIRED_PATHS) {
  const uiPath = resolve(options.uiRoot, path)
  const apiPath = resolve(options.apiRoot, path)
  let ui
  let api
  try {
    ui = readFileSync(uiPath)
    api = readFileSync(apiPath)
  } catch (error) {
    failures.push(`${path}: unreadable twin: ${error.message}`)
    continue
  }

  if (path === BYTE_EXACT_PATH) {
    if (!ui.equals(api)) failures.push(`${path}: whole file differs; align both twins byte for byte`)
    continue
  }

  const declared = new Map()
  for (const declaration of manifest.files[path].declarations) {
    for (const value of declaration.fingerprints) declared.set(value, declaration)
  }
  const used = new Set()
  for (const hunk of lineDiff(ui.toString("utf8"), api.toString("utf8"))) {
    const value = fingerprint(hunk)
    const declaration = declared.get(value)
    if (declaration) {
      used.add(value)
      continue
    }
    failures.push(
      `${path}: undeclared region at ui:${hunk.uiLine} api:${hunk.apiLine}\n` +
        `  ui: ${preview(hunk.ui)}\n  api: ${preview(hunk.api)}\n` +
        `  declaration fingerprint: ${value}\n` +
        `  align both twins or add this fingerprint with a narrow justification to ${options.manifest}`,
    )
  }
  for (const [value, declaration] of declared) {
    if (!used.has(value)) failures.push(`${path}: stale declaration ${declaration.id} (${value}); remove it or update the justified region`)
  }
}

if (failures.length) {
  console.error(`HARNESS LOCKSTEP FAILED (${failures.length})\n${failures.join("\n")}`)
  process.exit(1)
}

console.log(`HARNESS LOCKSTEP OK: ${REQUIRED_PATHS.length} pairs checked`)
