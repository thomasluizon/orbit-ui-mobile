#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MANIFEST_PATH = join(REPO_ROOT, ".claude", "manifests", "surfaces.json")
const MAPPING_PATH = join(REPO_ROOT, "tools", "redesign-groups.json")

const USAGE = `redesign-coverage - validate and print the authoritative redesign surface groups.

Usage:
  node tools/redesign-coverage.mjs [--json] [--help]

Modes:
  default  validate that every manifest surfaceId is assigned exactly once
  --json   validate, then print { "<group>": ["<surfaceId>", ...], ... }

Exit codes:
  0  coverage is complete and valid
  1  manifest or mapping data is invalid, incomplete, or stale
  2  usage error
`

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    throw new Error(`${label} could not be read: ${error.message}`)
  }
}

function validate(manifest, mapping) {
  const errors = []
  if (!Array.isArray(manifest?.cells)) errors.push("manifest cells must be an array")
  if (!mapping?.groups || Array.isArray(mapping.groups) || typeof mapping.groups !== "object") {
    errors.push("mapping groups must be an object")
  }
  if (!Array.isArray(mapping?.excluded)) errors.push("mapping excluded must be an array")
  if (errors.length > 0) return { errors, groups: {} }

  const manifestIds = new Set()
  for (const [index, cell] of manifest.cells.entries()) {
    if (typeof cell?.surfaceId !== "string" || cell.surfaceId.length === 0) {
      errors.push(`manifest cells[${index}] has no surfaceId`)
      continue
    }
    manifestIds.add(cell.surfaceId)
  }

  const assignments = new Map()
  const groups = {}
  for (const [group, surfaceIds] of Object.entries(mapping.groups)) {
    if (!/^R(?:[1-9]|1\d|2[01])-[a-z0-9-]+$/.test(group)) errors.push(`invalid group key: ${group}`)
    if (!Array.isArray(surfaceIds)) {
      errors.push(`group ${group} must be an array`)
      continue
    }
    groups[group] = []
    for (const [index, surfaceId] of surfaceIds.entries()) {
      if (typeof surfaceId !== "string" || surfaceId.length === 0) {
        errors.push(`${group}[${index}] must be a non-empty surfaceId`)
        continue
      }
      const previous = assignments.get(surfaceId)
      if (previous) errors.push(`${surfaceId} is mapped more than once: ${previous} and ${group}`)
      else assignments.set(surfaceId, group)
      groups[group].push(surfaceId)
    }
  }

  for (const [index, entry] of mapping.excluded.entries()) {
    const surfaceId = entry?.surfaceId
    const reason = entry?.reason
    if (typeof surfaceId !== "string" || surfaceId.length === 0) {
      errors.push(`excluded[${index}] has no surfaceId`)
      continue
    }
    if (typeof reason !== "string" || reason.trim().length === 0) errors.push(`excluded ${surfaceId} has no reason`)
    const previous = assignments.get(surfaceId)
    if (previous) errors.push(`${surfaceId} is mapped more than once: ${previous} and excluded`)
    else assignments.set(surfaceId, "excluded")
  }

  for (const surfaceId of [...manifestIds].sort()) {
    if (!assignments.has(surfaceId)) errors.push(`manifest surfaceId is not mapped: ${surfaceId}`)
  }
  for (const surfaceId of [...assignments.keys()].sort()) {
    if (!manifestIds.has(surfaceId)) errors.push(`mapping surfaceId is absent from manifest: ${surfaceId}`)
  }

  if (mapping.notes !== undefined) {
    if (!mapping.notes || Array.isArray(mapping.notes) || typeof mapping.notes !== "object") errors.push("mapping notes must be an object")
    else
      for (const [surfaceId, note] of Object.entries(mapping.notes)) {
        if (!assignments.has(surfaceId)) errors.push(`note names an unmapped surfaceId: ${surfaceId}`)
        if (typeof note !== "string" || note.trim().length === 0) errors.push(`note for ${surfaceId} is empty`)
      }
  }

  return { errors, groups, surfaceCount: manifestIds.size, excludedCount: mapping.excluded.length }
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(USAGE)
    return 0
  }
  const unknown = args.find((argument) => argument !== "--json")
  if (unknown) {
    process.stderr.write(`redesign-coverage: unknown argument: ${unknown}\n\n${USAGE}`)
    return 2
  }
  if (args.filter((argument) => argument === "--json").length > 1) {
    process.stderr.write(`redesign-coverage: --json may be passed only once\n\n${USAGE}`)
    return 2
  }

  let result
  try {
    result = validate(readJson(MANIFEST_PATH, "surface manifest"), readJson(MAPPING_PATH, "redesign mapping"))
  } catch (error) {
    process.stderr.write(`redesign-coverage: ${error.message}\n`)
    return 1
  }
  if (result.errors.length > 0) {
    process.stderr.write(`redesign-coverage: validation failed\n${result.errors.map((error) => `  - ${error}`).join("\n")}\n`)
    return 1
  }

  if (args.includes("--json")) process.stdout.write(`${JSON.stringify(result.groups, null, 2)}\n`)
  else {
    process.stdout.write(`redesign coverage valid: ${result.surfaceCount} surfaces mapped, ${result.excludedCount} excluded\n`)
    for (const [group, surfaceIds] of Object.entries(result.groups)) {
      process.stdout.write(`  ${group}: ${surfaceIds.length}\n`)
    }
  }
  return 0
}

process.exitCode = main()
