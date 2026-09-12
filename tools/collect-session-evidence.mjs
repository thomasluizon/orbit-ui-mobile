#!/usr/bin/env node

import { createHash } from "node:crypto"
import { createReadStream, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createInterface } from "node:readline"

const EXIT = { OK: 0, UNREADABLE: 1, INVALID_INPUT: 2 }
const WINDOW_DAYS = 7
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000
const TURN_LIMIT = 2_000
const DIGEST_LIMIT = 200_000
const THRESHOLD = 3
const INJECTED_USER_TURNS = new Set([
  "[Request interrupted by user]",
  "[Request interrupted by user for tool use]",
])

const USAGE = `usage: collect-session-evidence.mjs [options]

  Streams this project's top-level Claude session transcripts from the last 7 days.
  Subagent and other nested transcripts are never read. The bounded, redacted JSON digest
  is written to stdout. Tool inputs and tool results are excluded structurally.

  --transcripts-dir <path>  override this project's Claude transcript directory
  --now <ISO-8601>          set the window end for a deterministic run
  --help, -h                print this usage and exit 0

stdout: one JSON digest, under 200000 bytes, with metrics and exact-text clusters
exit codes: 0 digest emitted, 1 transcript directory unreadable, 2 usage error`

const REDACTIONS = [
  ["pem-private-key", /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----|$)/g],
  ["url-credentials", /([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, "$1[REDACTED:url-credentials]@"],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
  ["openai-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ["aws-access-key", /\bAKIA[A-Z0-9]{16}\b/g],
  ["jwt", /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g],
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
]

function fail(code, message) {
  process.stderr.write(`collect-session-evidence: ${message}\n`)
  process.exit(code)
}

function defaultTranscriptDirectory() {
  const projectDirectory = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const projectKey = projectDirectory.replace(/[:\\/]/g, "-")
  return join(homedir(), ".claude", "projects", projectKey)
}

function parseArguments(argv) {
  let transcriptsDirectory = defaultTranscriptDirectory()
  let now = new Date()
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(`${USAGE}\n`)
      process.exit(EXIT.OK)
    }
    if (argument !== "--transcripts-dir" && argument !== "--now") {
      fail(EXIT.INVALID_INPUT, `unknown argument: ${argument}\n\n${USAGE}`)
    }
    const value = argv[++index]
    if (!value) fail(EXIT.INVALID_INPUT, `${argument} requires a value\n\n${USAGE}`)
    if (argument === "--transcripts-dir") transcriptsDirectory = value
    if (argument === "--now") {
      now = new Date(value)
      if (Number.isNaN(now.getTime())) fail(EXIT.INVALID_INPUT, `--now requires an ISO-8601 timestamp, got ${value}`)
    }
  }
  return { now, transcriptsDirectory }
}

function redact(text, metrics) {
  let redacted = text
  for (const [kind, pattern, replacement] of REDACTIONS) {
    redacted = redacted.replace(pattern, (...match) => {
      metrics.redactionsApplied++
      return replacement ? replacement.replace("$1", match[1] ?? "") : `[REDACTED:${kind}]`
    })
  }
  return redacted
}

function boundedText(text, metrics) {
  if (text.length > TURN_LIMIT) metrics.truncatedTurns++
  return redact(text, metrics).slice(0, TURN_LIMIT)
}

function textBlocks(content, acceptedType, rejectSystemReminder = false) {
  if (typeof content === "string") {
    return rejectSystemReminder && /<system-reminder>/i.test(content) ? [] : [content]
  }
  if (!Array.isArray(content)) return []
  return content.flatMap((block) => {
    if (!block || block.type !== acceptedType || typeof block.text !== "string") return []
    if (rejectSystemReminder && /<system-reminder>/i.test(block.text)) return []
    return [block.text]
  })
}

function normalizedClusterText(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ")
}

function clusterId(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16)
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

async function readTranscript(path, sessionId, cutoff, now, clusters, metrics) {
  let precedingAssistantText = null
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    metrics.recordsScanned++
    let record
    try {
      record = JSON.parse(line)
    } catch {
      metrics.malformedRecords++
      continue
    }
    const timestamp = Date.parse(record.timestamp)
    if (!Number.isFinite(timestamp) || timestamp < cutoff || timestamp > now) continue
    if (record.type === "assistant") {
      const assistantBlocks = textBlocks(record.message?.content, "text")
      if (assistantBlocks.length > 0) precedingAssistantText = assistantBlocks.at(-1)
      continue
    }
    if (record.type !== "user" || record.isMeta === true) continue
    const userBlocks = textBlocks(record.message?.content, "text", true)
    const userText = userBlocks.join("\n").trim()
    if (!userText || INJECTED_USER_TURNS.has(userText)) continue
    const safeUserText = boundedText(userText, metrics)
    const safeAssistantText = precedingAssistantText === null ? null : boundedText(precedingAssistantText, metrics)
    precedingAssistantText = null
    const normalized = normalizedClusterText(safeUserText)
    if (!normalized) continue
    metrics.humanTurns++
    const id = clusterId(normalized)
    const cluster = clusters.get(id) ?? {
      id,
      userText: safeUserText,
      assistantText: safeAssistantText,
      sessionIds: new Set(),
      occurrences: 0,
    }
    cluster.sessionIds.add(sessionId)
    cluster.occurrences++
    clusters.set(id, cluster)
  }
}

function renderDigest(base, clusters) {
  const sorted = [...clusters.values()]
    .map((cluster) => ({
      id: cluster.id,
      userText: cluster.userText,
      assistantText: cluster.assistantText,
      occurrences: cluster.occurrences,
      distinctSessionCount: cluster.sessionIds.size,
      sessionIds: [...cluster.sessionIds].sort(),
      atThreshold: cluster.sessionIds.size >= THRESHOLD,
    }))
    .sort((left, right) => right.distinctSessionCount - left.distinctSessionCount || compareText(left.id, right.id))

  const digest = { ...base, clusters: [] }
  for (const cluster of sorted) {
    digest.clusters.push(cluster)
    digest.metrics.clustersEmitted = digest.clusters.length
    const candidate = `${JSON.stringify(digest)}\n`
    if (Buffer.byteLength(candidate) >= DIGEST_LIMIT) {
      digest.clusters.pop()
      digest.metrics.clustersEmitted = digest.clusters.length
      digest.metrics.digestTruncated = true
      break
    }
  }
  const output = `${JSON.stringify(digest)}\n`
  if (Buffer.byteLength(output) >= DIGEST_LIMIT) fail(EXIT.UNREADABLE, "digest metadata exceeded the output bound")
  return output
}

async function main() {
  const { now, transcriptsDirectory } = parseArguments(process.argv.slice(2))
  const nowMilliseconds = now.getTime()
  const cutoff = nowMilliseconds - WINDOW_MS
  let files
  try {
    files = readdirSync(transcriptsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => ({ entry, stats: statSync(join(transcriptsDirectory, entry.name)) }))
      .filter(({ stats }) => stats.mtimeMs >= cutoff)
      .sort((left, right) => compareText(left.entry.name, right.entry.name))
  } catch (error) {
    fail(EXIT.UNREADABLE, `cannot read transcript directory ${transcriptsDirectory}: ${error.message}`)
  }

  const metrics = {
    filesInWindow: files.length,
    recordsScanned: 0,
    humanTurns: 0,
    clustersFound: 0,
    clustersAtThreshold: 0,
    clustersEmitted: 0,
    redactionsApplied: 0,
    truncatedTurns: 0,
    malformedRecords: 0,
    digestTruncated: false,
  }
  const clusters = new Map()
  try {
    for (const { entry } of files) {
      await readTranscript(join(transcriptsDirectory, entry.name), entry.name.slice(0, -6), cutoff, nowMilliseconds, clusters, metrics)
    }
  } catch (error) {
    fail(EXIT.UNREADABLE, `cannot stream transcript directory ${transcriptsDirectory}: ${error.message}`)
  }
  metrics.clustersFound = clusters.size
  metrics.clustersAtThreshold = [...clusters.values()].filter((cluster) => cluster.sessionIds.size >= THRESHOLD).length
  const digest = {
    schemaVersion: 1,
    window: { days: WINDOW_DAYS, from: new Date(cutoff).toISOString(), through: now.toISOString() },
    limits: { turnCharacters: TURN_LIMIT, digestBytes: DIGEST_LIMIT, distinctSessionThreshold: THRESHOLD },
    metrics,
  }
  process.stdout.write(renderDigest(digest, clusters))
}

await main()
