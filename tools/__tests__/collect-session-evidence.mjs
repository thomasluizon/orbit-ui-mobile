import { mkdirSync, utimesSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { root, run, T } from "./_harness.mjs"

const NOW = "2026-09-12T12:00:00.000Z"
const INSIDE = "2026-09-11T12:00:00.000Z"
const OUTSIDE = "2026-09-04T11:59:59.000Z"

const record = (type, timestamp, content, extra = {}) => JSON.stringify({
  type,
  timestamp,
  message: { role: type, content },
  ...extra,
})

const writeTranscript = (directory, sessionId, lines, mtime = new Date(INSIDE)) => {
  const path = join(directory, `${sessionId}.jsonl`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, lines.join("\r\n"))
  utimesSync(path, mtime, mtime)
  return path
}

const collect = (directory) => run("collect-session-evidence.mjs", [
  "--transcripts-dir", directory,
  "--now", NOW,
])

const parse = (result) => JSON.parse(result.stdout)
const expectEqual = (name, got, want) => T(name, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)

export async function cases() {
  const missing = collect(join(root, "session-evidence-missing"))
  T("collect-session-evidence: an unreadable directory exits 1 with empty stdout", missing.status === 1 && missing.stdout === "", missing.stderr)

  const shapeDirectory = join(root, "session-evidence-shape")
  mkdirSync(shapeDirectory, { recursive: true })
  writeTranscript(shapeDirectory, "old-mtime", [record("user", INSIDE, "old file")], new Date(OUTSIDE))
  writeTranscript(shapeDirectory, "human-session", [
    record("assistant", INSIDE, [{ type: "thinking", thinking: "ignore" }, { type: "text", text: "assistant context" }]),
    record("user", OUTSIDE, "outside record"),
    record("user", INSIDE, [{ type: "tool_result", content: "sk-tool-output-must-never-appear-123456789" }]),
    record("user", INSIDE, "meta turn", { isMeta: true }),
    record("user", INSIDE, [{ type: "text", text: "<system-reminder>injected</system-reminder>" }]),
    record("user", INSIDE, "[Request interrupted by user]"),
    record("user", INSIDE, "[Request interrupted by user for tool use]"),
    record("user", INSIDE, "A".repeat(2_100)),
    "{truncated",
  ])
  writeFileSync(join(shapeDirectory, "empty.jsonl"), "")
  utimesSync(join(shapeDirectory, "empty.jsonl"), new Date(INSIDE), new Date(INSIDE))
  writeTranscript(join(shapeDirectory, "nested", "subagents"), "agent-secret", [record("user", INSIDE, "nested turn")])
  const shapeResult = collect(shapeDirectory)
  const shapeDigest = parse(shapeResult)
  expectEqual("collect-session-evidence: window and top-level traversal retain only the human turn", {
    status: shapeResult.status,
    files: shapeDigest.metrics.filesInWindow,
    humanTurns: shapeDigest.metrics.humanTurns,
    clusters: shapeDigest.metrics.clustersFound,
    malformed: shapeDigest.metrics.malformedRecords,
  }, { status: 0, files: 2, humanTurns: 1, clusters: 1, malformed: 1 })
  expectEqual("collect-session-evidence: the human and preceding assistant turns are bounded", {
    userLength: shapeDigest.clusters[0].userText.length,
    assistant: shapeDigest.clusters[0].assistantText,
    truncated: shapeDigest.metrics.truncatedTurns,
  }, { userLength: 2_000, assistant: "assistant context", truncated: 1 })
  T("collect-session-evidence: excluded content never reaches the digest", [
    "outside record", "old file", "tool-output", "meta turn", "system-reminder", "Request interrupted", "nested turn", "ignore",
  ].every((value) => !shapeResult.stdout.includes(value)), shapeResult.stdout)

  const secretDirectory = join(root, "session-evidence-secrets")
  mkdirSync(secretDirectory, { recursive: true })
  const secrets = [
    "sk-proj-abcdefghijklmnopqrstuvwxyz123456",
    "ghp_abcdefghijklmnopqrstuvwxyz123456",
    "github_pat_abcdefghijklmnopqrstuvwxyz123456",
    "AKIAABCDEFGHIJKLMNOP",
    "eyJabcde.abcdefgh.ijklmnop",
    "Bearer opaque-token-value-123456",
    "-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----",
    "https://username:password@example.test/path",
    "person@example.test",
  ]
  writeTranscript(secretDirectory, "secret-session", [record("user", INSIDE, secrets.join("\n"))])
  const secretResult = collect(secretDirectory)
  const secretDigest = parse(secretResult)
  const rawSecretFragments = [...secrets, "private-material", "username:password"]
  expectEqual("collect-session-evidence: every secret family is redacted", {
    rawValuesSurvive: rawSecretFragments.filter((secret) => secretResult.stdout.includes(secret)),
    markers: (secretResult.stdout.match(/\[REDACTED:/g) ?? []).length,
    metric: secretDigest.metrics.redactionsApplied,
  }, { rawValuesSurvive: [], markers: 9, metric: 9 })

  const boundaryDirectory = join(root, "session-evidence-secret-boundary")
  mkdirSync(boundaryDirectory, { recursive: true })
  writeTranscript(boundaryDirectory, "boundary-session", [record("user", INSIDE, `${"x".repeat(1_990)} sk-proj-abcdefghijklmnopqrstuvwxyz123456`)])
  const boundaryResult = collect(boundaryDirectory)
  T("collect-session-evidence: truncation cannot expose a partial secret", !boundaryResult.stdout.includes("sk-proj-"), boundaryResult.stdout)

  const thresholdDirectory = join(root, "session-evidence-threshold")
  mkdirSync(thresholdDirectory, { recursive: true })
  const repeated = "Use the repository adapter for ticket updates."
  writeTranscript(thresholdDirectory, "session-a", [record("user", INSIDE, repeated), record("user", INSIDE, repeated)])
  writeTranscript(thresholdDirectory, "session-b", [record("user", INSIDE, `  ${repeated.toUpperCase()}  `)])
  const belowDigest = parse(collect(thresholdDirectory))
  expectEqual("collect-session-evidence: two distinct sessions stay below threshold", {
    count: belowDigest.clusters[0].distinctSessionCount,
    sessions: belowDigest.clusters[0].sessionIds,
    atThreshold: belowDigest.clusters[0].atThreshold,
  }, { count: 2, sessions: ["session-a", "session-b"], atThreshold: false })
  writeTranscript(thresholdDirectory, "session-c", [record("user", INSIDE, repeated)])
  const thresholdDigest = parse(collect(thresholdDirectory))
  expectEqual("collect-session-evidence: three distinct sessions reach threshold with de-duplicated ids", {
    count: thresholdDigest.clusters[0].distinctSessionCount,
    sessions: thresholdDigest.clusters[0].sessionIds,
    occurrences: thresholdDigest.clusters[0].occurrences,
    atThreshold: thresholdDigest.clusters[0].atThreshold,
  }, { count: 3, sessions: ["session-a", "session-b", "session-c"], occurrences: 4, atThreshold: true })

  const boundedDirectory = join(root, "session-evidence-bounded")
  mkdirSync(boundedDirectory, { recursive: true })
  const uniqueTurns = Array.from({ length: 150 }, (_, index) => record("user", INSIDE, `${String(index).padStart(3, "0")}:${"x".repeat(2_050)}`))
  writeTranscript(boundedDirectory, "bounded-session", uniqueTurns)
  const boundedResult = collect(boundedDirectory)
  const boundedDigest = parse(boundedResult)
  T("collect-session-evidence: a large corpus produces JSON below its hard byte limit", Buffer.byteLength(boundedResult.stdout) < 200_000, `digest was ${Buffer.byteLength(boundedResult.stdout)} bytes`)
  T("collect-session-evidence: the byte bound reports omitted clusters", boundedDigest.metrics.digestTruncated && boundedDigest.metrics.clustersEmitted < boundedDigest.metrics.clustersFound, JSON.stringify(boundedDigest.metrics))
}
