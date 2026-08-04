#!/usr/bin/env node

import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { isAbsolute, resolve } from "node:path"

import { normalizeTicketBody } from "./lib/ticket-body.mjs"

const USAGE = `usage: make-execution-brief.mjs --issue ORB-N --ticket-file <absolute path> --dag-file <absolute path> --base <ref> --base-sha <40 hex> --summary <text> --scope-file <absolute path> --output <absolute path> [--exclusions-file <absolute path>] [--wave <n>]

Creates the small Sol execution brief that binds Luna to the exact ticket body,
the observed DAG snapshot, and the exact remote base SHA. It reads files only;
it does not read or mutate Linear, GitHub, or an Orca worktree.

exit codes: 0 brief written, 2 usage or input error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const valueOf = (flag) => {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  const value = process.argv[index + 1]
  return value && !value.startsWith("--") ? value : null
}
const issue = valueOf("--issue")?.toUpperCase()
const ticketFile = valueOf("--ticket-file")
const dagFile = valueOf("--dag-file")
const base = valueOf("--base")
const baseSha = valueOf("--base-sha")
const summary = valueOf("--summary")
const scopeFile = valueOf("--scope-file")
const exclusionsFile = valueOf("--exclusions-file")
const output = valueOf("--output")
const waveValue = valueOf("--wave") ?? "1"
const knownFlags = new Set(["--issue", "--ticket-file", "--dag-file", "--base", "--base-sha", "--summary", "--scope-file", "--exclusions-file", "--output", "--wave", "--help", "-h"])
const unknown = process.argv.slice(2).filter((token) => token.startsWith("-") && !knownFlags.has(token))
const absoluteFiles = [ticketFile, dagFile, scopeFile, exclusionsFile, output].filter(Boolean)
if (
  unknown.length > 0
  || !issue
  || !/^ORB-\d+$/.test(issue)
  || !base
  || !/^[A-Za-z0-9._/-]+$/.test(base)
  || !baseSha
  || !/^[0-9a-f]{40}$/.test(baseSha)
  || !summary?.trim()
  || !scopeFile
  || !output
  || absoluteFiles.some((file) => !isAbsolute(file))
  || !/^\d+$/.test(waveValue)
  || Number(waveValue) < 1
) {
  console.error(USAGE)
  process.exit(2)
}

const readRequired = (file, label) => {
  if (!existsSync(resolve(file))) {
    console.error(`make-execution-brief: ${label} does not exist: ${file}`)
    process.exit(2)
  }
  try {
    return readFileSync(resolve(file), "utf8")
  } catch (error) {
    console.error(`make-execution-brief: could not read ${label}: ${error.message}`)
    process.exit(2)
  }
}
const ticket = readRequired(ticketFile, "ticket file")
const dag = readRequired(dagFile, "DAG snapshot")
const scope = readRequired(scopeFile, "scope file").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
const exclusions = exclusionsFile
  ? readRequired(exclusionsFile, "exclusions file").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  : []
if (scope.length === 0) {
  console.error("make-execution-brief: scope file must contain at least one path or bounded work item")
  process.exit(2)
}

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex")
const brief = {
  version: 1,
  issue,
  ticketBodySha256: sha256(normalizeTicketBody(ticket)),
  dagSha256: sha256(dag),
  base,
  baseSha,
  wave: Number(waveValue),
  summary: summary.trim(),
  scope,
  exclusions,
}
try {
  writeFileSync(resolve(output), `${JSON.stringify(brief, null, 2)}\n`, "utf8")
} catch (error) {
  console.error(`make-execution-brief: could not write ${output}: ${error.message}`)
  process.exit(2)
}
console.log(resolve(output))
