import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

import { T, check, stage } from "./_harness.mjs"

export const cases = () => {
  const ticketFile = stage("brief/ticket.md", "# ORB-300\nDo exactly this.\n")
  const dagFile = stage("brief/dag.json", '{"waves":[{"issues":["ORB-300"]}]}\n')
  const scopeFile = stage("brief/scope.txt", "tools/launch-worker.mjs\ntools/worker-status.mjs\n")
  const output = stage("brief/execution.json", "")
  const baseSha = "a".repeat(40)
  const result = check(
    "make-execution-brief.mjs",
    "binds ticket, DAG, base, and scope into a brief",
    ["--issue", "ORB-300", "--ticket-file", ticketFile, "--dag-file", dagFile, "--base", "main", "--base-sha", baseSha, "--summary", "Implement the bounded handoff", "--scope-file", scopeFile, "--output", output],
    { status: 0, stdout: /execution\.json/ },
  )
  const brief = JSON.parse(readFileSync(output, "utf8"))
  T(
    "make-execution-brief.mjs: writes the exact ticket and DAG hashes",
    result.status === 0
      && brief.ticketBodySha256 === createHash("sha256").update(readFileSync(ticketFile, "utf8")).digest("hex")
      && brief.dagSha256 === createHash("sha256").update(readFileSync(dagFile, "utf8")).digest("hex")
      && brief.baseSha === baseSha
      && brief.scope.length === 2,
    JSON.stringify(brief),
  )
  check(
    "make-execution-brief.mjs",
    "refuses an invalid base SHA",
    ["--issue", "ORB-300", "--ticket-file", ticketFile, "--dag-file", dagFile, "--base", "main", "--base-sha", "bad", "--summary", "x", "--scope-file", scopeFile, "--output", output],
    { status: 2 },
  )
}
