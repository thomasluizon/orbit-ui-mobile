import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, T, root, toolPath } from "./_harness.mjs"
import { evaluateReviewEvidence } from "../check-review-evidence.mjs"

const HEAD = "1111111111111111111111111111111111111111"
const BASE = "2222222222222222222222222222222222222222"
const MOVED = "3333333333333333333333333333333333333333"

/**
 * The JSONL fixture was captured from one real Codex 5.6 Sol/high invocation on 2026-07-31.
 * Only thread_id, item.id, and item.text were stripped because they do not prove usage keys;
 * the complete event key set and observed integer token values remain unchanged.
 */

const writeExecutable = (path, source) => {
  writeFileSync(path, source)
  return path
}

const readJsonLines = (path) => {
  try {
    return readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

const stageReview = (label, {
  verdict = "APPROVE",
  findings = [],
  moved = false,
  dirty = false,
  malformedUsage = false,
  localReviewSkill = false,
  callerBase = "main",
  liveBase = "main",
  liveState = "OPEN",
  liveHead = HEAD,
  malformedPullRequest = false,
  incompletePullRequest = false,
  resultRepository = "thomasluizon/orbit-ui-mobile",
  resultPullRequest = 166,
  resultBase = "main",
} = {}) => {
  const base = join(root, "launch-pr-review", label)
  const repoRoot = join(base, "repo")
  mkdirSync(join(repoRoot, ".git"), { recursive: true })
  const log = join(base, "calls.jsonl")
  const headReads = join(base, "head-reads.txt")
  const configPath = join(base, "orchestrator.json")
  writeFileSync(configPath, JSON.stringify({
    reviewer: {
      engine: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      automationBudgetTier: "routine",
      projectedTokens: 250000,
    },
    workers: {
      codex: {
        automationBudget: {
          accountUsedPercentCeiling: 85,
          tokenBudget: 1000000,
          warningTokens: 800000,
        },
      },
    },
  }))
  const gitStub = writeExecutable(join(base, "git-stub.mjs"), `
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
const args = process.argv.slice(2)
appendFileSync(process.env.ORBIT_TEST_LOG, JSON.stringify({ tool: "git", args }) + "\\n")
if (args[0] === "ls-remote") {
  const ref = args.at(-1)
  if (ref.includes("pull/")) {
    let reads = existsSync(process.env.ORBIT_TEST_HEAD_READS) ? Number(readFileSync(process.env.ORBIT_TEST_HEAD_READS, "utf8")) : 0
    writeFileSync(process.env.ORBIT_TEST_HEAD_READS, String(reads + 1))
    const sha = process.env.ORBIT_TEST_MOVED === "1" && reads > 0 ? "${MOVED}" : "${HEAD}"
    console.log(sha + "\\t" + ref)
  } else console.log("${BASE}\\t" + ref)
} else if (args[0] === "remote" && args[1] === "get-url") {
  console.log("https://github.com/thomasluizon/orbit-ui-mobile.git")
  } else if (args[0] === "show") {
  console.log("trusted-base-policy:" + args.at(-1))
} else if (args[0] === "fetch") {
  process.exit(0)
} else if (args[0] === "worktree" && args[1] === "add") {
  const worktree = args.at(-2)
  mkdirSync(worktree, { recursive: true })
  if (process.env.ORBIT_TEST_LOCAL_REVIEW_SKILL === "1") {
    const reviewSkill = worktree + "/.claude/skills/pr-review"
    mkdirSync(reviewSkill, { recursive: true })
    writeFileSync(reviewSkill + "/SKILL.md", "target-local skill\\n")
    writeFileSync(reviewSkill + "/rubric.md", "target-local rubric\\n")
    writeFileSync(worktree + "/AGENTS.md", "target agents\\n")
    writeFileSync(worktree + "/CLAUDE.md", "target claude\\n")
  }
} else if (args[0] === "worktree" && args[1] === "remove") {
  rmSync(args.at(-1), { recursive: true })
} else if (args.includes("rev-parse") && args.at(-1) === "HEAD") {
  console.log("${HEAD}")
} else if (args.includes("status")) {
  if (process.env.ORBIT_TEST_DIRTY === "1") console.log("?? reviewer-write.txt")
} else if (args[0] === "branch" && args[1] === "--delete") {
  process.exit(0)
}
`)
  const codexStub = writeExecutable(join(base, "codex-stub.mjs"), `
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"
const args = process.argv.slice(2)
let prompt = ""
process.stdin.setEncoding("utf8")
for await (const chunk of process.stdin) prompt += chunk
appendFileSync(process.env.ORBIT_TEST_LOG, JSON.stringify({ tool: "codex", args, cwd: process.cwd(), marker: process.env.ORBIT_LAUNCH_PR_REVIEW ?? null, prompt }) + "\\n")
const output = args[args.indexOf("--output-last-message") + 1]
writeFileSync(output, process.env.ORBIT_TEST_REVIEW_RESULT)
const lines = readFileSync(process.env.ORBIT_TEST_CODEX_ENVELOPE, "utf8").trim().split(/\\r?\\n/)
for (const line of lines) {
  const event = JSON.parse(line)
  if (process.env.ORBIT_TEST_MALFORMED_USAGE === "1" && event.type === "turn.completed") delete event.usage.output_tokens
  console.log(JSON.stringify(event))
}
`)
  const ghStub = writeExecutable(join(base, "gh-stub.mjs"), `
import { appendFileSync, readFileSync } from "node:fs"
const args = process.argv.slice(2)
const bodyIndex = args.indexOf("--body-file")
const body = bodyIndex === -1 ? null : readFileSync(args[bodyIndex + 1], "utf8")
appendFileSync(process.env.ORBIT_TEST_LOG, JSON.stringify({ tool: "gh", args, body }) + "\\n")
if (args[0] === "pr" && args[1] === "view") {
  if (process.env.ORBIT_TEST_MALFORMED_PR === "1") console.log("not-json")
  else if (process.env.ORBIT_TEST_INCOMPLETE_PR === "1") console.log(JSON.stringify({ baseRefName: process.env.ORBIT_TEST_LIVE_BASE }))
  else console.log(JSON.stringify({ baseRefName: process.env.ORBIT_TEST_LIVE_BASE, headRefOid: process.env.ORBIT_TEST_LIVE_HEAD, state: process.env.ORBIT_TEST_LIVE_STATE }))
}
`)
  const quotaStub = writeExecutable(join(base, "quota-stub.mjs"), `
console.log(JSON.stringify({ codex: { status: "OK", usedPercent: 11, resetsAt: Math.floor(Date.now() / 1000) + 86400 } }))
`)
  const budgetStub = writeExecutable(join(base, "budget-stub.mjs"), `
import { appendFileSync } from "node:fs"
const args = process.argv.slice(2)
appendFileSync(process.env.ORBIT_TEST_LOG, JSON.stringify({ tool: "budget", args }) + "\\n")
console.log(JSON.stringify({ status: args[0].toUpperCase() }))
`)
  const resultBody = JSON.stringify({
    schemaVersion: 1,
    repository: resultRepository,
    pullRequest: resultPullRequest,
    base: resultBase,
    reviewedHead: HEAD,
    verdict,
    summary: verdict === "APPROVE" ? "No blocking findings." : "Blocking findings found.",
    findings,
    positives: ["The change is narrowly scoped."],
    recommendation: verdict === "APPROVE" ? "Merge after all other gates pass." : "Fix the listed findings.",
  })
  const result = spawnSync(process.execPath, [toolPath("launch-pr-review.mjs"), "--repo", "thomasluizon/orbit-ui-mobile", "--pr", "166", "--base", callerBase, "--repo-root", repoRoot, "--json"], {
    encoding: "utf8",
    env: {
      ...process.env,
      ORBIT_ORCHESTRATOR_CONFIG: configPath,
      ORBIT_REVIEW_GIT_SCRIPT: gitStub,
      ORBIT_REVIEW_CODEX_SCRIPT: codexStub,
      ORBIT_REVIEW_GH_SCRIPT: ghStub,
      ORBIT_AI_QUOTA_TOOL: quotaStub,
      ORBIT_AUTOMATION_BUDGET_TOOL: budgetStub,
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(base, "ledger.jsonl"),
      ORBIT_LOCAL_REVIEW_PROVENANCE_LEDGER: join(base, "review-provenance.jsonl"),
      ORBIT_TEST_LOG: log,
      ORBIT_TEST_HEAD_READS: headReads,
      ORBIT_TEST_MOVED: moved ? "1" : "0",
      ORBIT_TEST_DIRTY: dirty ? "1" : "0",
      ORBIT_TEST_MALFORMED_USAGE: malformedUsage ? "1" : "0",
      ORBIT_TEST_LOCAL_REVIEW_SKILL: localReviewSkill ? "1" : "0",
      ORBIT_TEST_LIVE_BASE: liveBase,
      ORBIT_TEST_LIVE_HEAD: liveHead,
      ORBIT_TEST_LIVE_STATE: liveState,
      ORBIT_TEST_MALFORMED_PR: malformedPullRequest ? "1" : "0",
      ORBIT_TEST_INCOMPLETE_PR: incompletePullRequest ? "1" : "0",
      ORBIT_TEST_REVIEW_RESULT: resultBody,
      ORBIT_TEST_CODEX_ENVELOPE: join(REPO_ROOT, "tools", "__tests__", "fixtures", "codex-exec-jsonl-observed.jsonl"),
    },
  })
  return { result, calls: readJsonLines(log), ledgerPath: join(base, "review-provenance.jsonl") }
}

export const cases = () => {
  const schema = JSON.parse(readFileSync(join(REPO_ROOT, "tools", "schemas", "pr-review-result.schema.json"), "utf8"))
  const constrainedWithoutType = []
  const visitSchema = (node, path = "$") => {
    if (!node || typeof node !== "object") return
    if (!Array.isArray(node) && (Object.hasOwn(node, "const") || Object.hasOwn(node, "enum")) && !Object.hasOwn(node, "type")) {
      constrainedWithoutType.push(path)
    }
    for (const [key, value] of Object.entries(node)) visitSchema(value, `${path}.${key}`)
  }
  visitSchema(schema)
  T("launch-pr-review.mjs: every provider const or enum schema node declares its type", constrainedWithoutType.length === 0, constrainedWithoutType.join(", "))
  const properties = schema.properties
  T("launch-pr-review.mjs: provider schema pins identity, verdict, finding identity, and severity types", properties.schemaVersion?.type === "integer" && properties.repository?.type === "string" && properties.pullRequest?.type === "integer" && properties.base?.type === "string" && properties.reviewedHead?.type === "string" && properties.verdict?.type === "string" && properties.findings?.items?.properties?.id?.type === "string" && properties.findings?.items?.properties?.severity?.type === "string", JSON.stringify(properties))

  const approve = stageReview("approve")
  const approveCalls = approve.calls
  const budgetCalls = approveCalls.filter((call) => call.tool === "budget")
  const codexCall = approveCalls.find((call) => call.tool === "codex")
  const ghCall = approveCalls.find((call) => call.tool === "gh" && call.args[1] === "review")
  T("launch-pr-review.mjs: APPROVE is a successful structured result", approve.result.status === 0 && JSON.parse(approve.result.stdout).verdict === "APPROVE", approve.result.stderr)
  const liveReadIndex = approveCalls.findIndex((call) => call.tool === "gh" && call.args.slice(0, 2).join(" ") === "pr view")
  const reserveIndex = approveCalls.findIndex((call) => call.tool === "budget" && call.args[0] === "reserve")
  const firstGitMutation = approveCalls.findIndex((call) => call.tool === "git" && ["fetch", "worktree", "update-ref"].includes(call.args[0]))
  T("launch-pr-review.mjs: the live pull request envelope is read before budget reservation or git mutation", liveReadIndex !== -1 && liveReadIndex < reserveIndex && liveReadIndex < firstGitMutation, JSON.stringify(approveCalls))
  T("launch-pr-review.mjs: budget is reserved before fetch or worktree mutation", reserveIndex !== -1 && reserveIndex < firstGitMutation, JSON.stringify(approveCalls))
  const worktreeAdd = approveCalls.find((call) => call.tool === "git" && call.args[0] === "worktree" && call.args[1] === "add")
  T("launch-pr-review.mjs: the disposable worktree is detached at the observed pull request head", worktreeAdd?.args.includes("--detach") && worktreeAdd.args.at(-1) === HEAD, JSON.stringify(worktreeAdd))
  T("launch-pr-review.mjs: the synchronous Codex child is claimed and recorded", budgetCalls.some((call) => call.args[0] === "claim") && budgetCalls.some((call) => call.args[0] === "record" && call.args.includes("17244") && call.args.includes("9984") && call.args.includes("5")), JSON.stringify(budgetCalls))
  T("launch-pr-review.mjs: Codex is fresh Sol high, read-only, ephemeral, schema-bound, and review-only", codexCall?.args.includes("gpt-5.6-sol") && codexCall.args.includes('model_reasoning_effort="high"') && codexCall.args.includes("--sandbox") && codexCall.args.includes("read-only") && codexCall.args.includes("--ephemeral") && codexCall.args.includes("--output-schema") && !codexCall.args.includes("--dangerously-bypass-approvals-and-sandbox") && codexCall.marker === "1" && !codexCall.prompt.includes("Standing worker contract"), JSON.stringify(codexCall))
  T("launch-pr-review.mjs: general exec reads the exact diff review prompt from trusted-base policy files", codexCall?.args[0] === "exec" && codexCall.args.at(-1) === "-" && !codexCall.args.includes("review") && !codexCall.args.includes("--base") && !approveCalls.some((call) => call.tool === "git" && call.args[0] === "update-ref") && codexCall.prompt.includes(`complete ${BASE}...${HEAD} diff`) && /review skill at .*trusted-policy[\\/]\.claude[\\/]skills[\\/]pr-review[\\/]SKILL\.md/.test(codexCall.prompt) && /rubric at .*trusted-policy[\\/]\.claude[\\/]skills[\\/]pr-review[\\/]rubric\.md/.test(codexCall.prompt) && codexCall.prompt.includes("loaded from").valueOf(), JSON.stringify(codexCall))
  T("launch-pr-review.mjs: a target without review assets still uses trusted-base policy paths", codexCall?.prompt.includes("trusted-policy") && !codexCall.prompt.includes(join(codexCall.cwd, "AGENTS.md")) && !codexCall.prompt.includes(join(codexCall.cwd, "CLAUDE.md")), codexCall?.prompt)
  T("launch-pr-review.mjs: the durable COMMENTED review carries an authenticated marker, verdict, and exact head", ghCall?.args.slice(0, 3).join(" ") === "pr review 166" && ghCall.args.includes("--comment") && ghCall.body?.startsWith(`<!-- orbit-local-review: {"version":1,"head":"${HEAD}","recommendation":"APPROVE","provenance":`) && ghCall.body.includes('"verdict": "APPROVE"'), JSON.stringify(ghCall))
  const evidence = evaluateReviewEvidence({
    headRefOid: HEAD,
    files: { pageInfo: { hasNextPage: false }, nodes: [] },
    reviews: {
      pageInfo: { hasNextPage: false },
      nodes: [{
        state: "COMMENTED",
        body: ghCall?.body,
        submittedAt: "2026-07-31T10:00:00Z",
        updatedAt: "2026-07-31T10:00:00Z",
        lastEditedAt: null,
        commit: { oid: HEAD },
      }],
    },
  }, HEAD, { ledgerPath: approve.ledgerPath })
  T("launch-pr-review.mjs: its COMMENTED body passes the merge gate's evidence parser", evidence.ok && evidence.status === "APPROVE", JSON.stringify(evidence))

  const localSkill = stageReview("local-skill", { localReviewSkill: true })
  const localCodex = localSkill.calls.find((call) => call.tool === "codex")
  T("launch-pr-review.mjs: hostile target-local policy copies are ignored in favor of the trusted base", localSkill.result.status === 0 && localCodex?.prompt.includes("trusted-policy") && !localCodex.prompt.includes("target-local skill") && !localCodex.prompt.includes("target agents") && !localCodex.prompt.includes(join(localCodex.cwd, ".claude", "skills", "pr-review", "SKILL.md")), `${localSkill.result.status}\n${localSkill.result.stderr}\n${localCodex?.prompt}`)

  const needsWork = stageReview("needs-work", { verdict: "NEEDS_WORK", findings: [{ id: "finding-0123456789abcdef0123456789abcdef", severity: "High", title: "Unsafe path", path: "tools/x.mjs", line: 7, evidence: "The branch skips validation.", remediation: "Validate before use." }] })
  T("launch-pr-review.mjs: NEEDS_WORK is durable and exits 4", needsWork.result.status === 4 && JSON.parse(needsWork.result.stdout).verdict === "NEEDS_WORK" && needsWork.calls.some((call) => call.tool === "gh" && call.args[1] === "review" && call.body.includes('"verdict": "NEEDS_WORK"')), `${needsWork.result.status}\n${needsWork.result.stderr}`)

  const moved = stageReview("moved", { moved: true })
  T("launch-pr-review.mjs: a head move refuses the result before commenting", moved.result.status === 3 && /head moved/.test(moved.result.stderr) && !moved.calls.some((call) => call.tool === "gh" && call.args[1] === "review"), `${moved.result.status}\n${moved.result.stderr}\n${JSON.stringify(moved.calls)}`)

  const malformedUsage = stageReview("malformed-usage", { malformedUsage: true })
  const malformedBudget = malformedUsage.calls.filter((call) => call.tool === "budget")
  T("launch-pr-review.mjs: incomplete observed usage never records invented zero", malformedUsage.result.status === 3 && /usage/.test(malformedUsage.result.stderr) && !malformedBudget.some((call) => call.args[0] === "record") && !malformedBudget.some((call) => call.args[0] === "cancel"), `${malformedUsage.result.status}\n${malformedUsage.result.stderr}\n${JSON.stringify(malformedBudget)}`)

  const dirty = stageReview("dirty", { dirty: true })
  T("launch-pr-review.mjs: a dirty review worktree is preserved without force removal", dirty.result.status === 3 && /preserved/.test(dirty.result.stderr) && !dirty.calls.some((call) => call.tool === "git" && call.args.includes("remove")), `${dirty.result.status}\n${dirty.result.stderr}\n${JSON.stringify(dirty.calls)}`)

  const wrongBase = stageReview("wrong-base", { callerBase: "release", liveBase: "main", resultBase: "release" })
  T("launch-pr-review.mjs: a caller base that differs from the live pull request blocks before reservation or mutation", wrongBase.result.status === 3 && /base/.test(wrongBase.result.stderr) && !wrongBase.calls.some((call) => call.tool === "budget") && !wrongBase.calls.some((call) => call.tool === "git" && ["fetch", "worktree", "update-ref"].includes(call.args[0])), `${wrongBase.result.status}\n${wrongBase.result.stderr}\n${JSON.stringify(wrongBase.calls)}`)

  const closed = stageReview("closed", { liveState: "CLOSED" })
  T("launch-pr-review.mjs: a non-open pull request blocks before reservation or mutation", closed.result.status === 3 && /OPEN/.test(closed.result.stderr) && !closed.calls.some((call) => call.tool === "budget") && !closed.calls.some((call) => call.tool === "git" && ["fetch", "worktree", "update-ref"].includes(call.args[0])), `${closed.result.status}\n${closed.result.stderr}\n${JSON.stringify(closed.calls)}`)

  const malformedPullRequest = stageReview("malformed-pr", { malformedPullRequest: true })
  T("launch-pr-review.mjs: an unparseable live pull request envelope blocks before reservation or mutation", malformedPullRequest.result.status === 3 && /JSON/.test(malformedPullRequest.result.stderr) && !malformedPullRequest.calls.some((call) => call.tool === "budget") && !malformedPullRequest.calls.some((call) => call.tool === "git" && ["fetch", "worktree", "update-ref"].includes(call.args[0])), `${malformedPullRequest.result.status}\n${malformedPullRequest.result.stderr}\n${JSON.stringify(malformedPullRequest.calls)}`)

  const incompletePullRequest = stageReview("incomplete-pr", { incompletePullRequest: true })
  T("launch-pr-review.mjs: an incomplete live pull request envelope blocks before reservation or mutation", incompletePullRequest.result.status === 3 && /headRefOid|state/.test(incompletePullRequest.result.stderr) && !incompletePullRequest.calls.some((call) => call.tool === "budget") && !incompletePullRequest.calls.some((call) => call.tool === "git" && ["fetch", "worktree", "update-ref"].includes(call.args[0])), `${incompletePullRequest.result.status}\n${incompletePullRequest.result.stderr}\n${JSON.stringify(incompletePullRequest.calls)}`)

  const refMismatch = stageReview("ref-mismatch", { liveHead: MOVED })
  T("launch-pr-review.mjs: a pull request ref that differs from the live head blocks before reservation or mutation", refMismatch.result.status === 3 && /head/.test(refMismatch.result.stderr) && !refMismatch.calls.some((call) => call.tool === "budget") && !refMismatch.calls.some((call) => call.tool === "git" && ["fetch", "worktree", "update-ref"].includes(call.args[0])), `${refMismatch.result.status}\n${refMismatch.result.stderr}\n${JSON.stringify(refMismatch.calls)}`)

  for (const [label, options, pattern] of [
    ["result-repository", { resultRepository: "thomasluizon/orbit-api" }, /repository/],
    ["result-pr", { resultPullRequest: 167 }, /pull request/],
    ["result-base", { resultBase: "release" }, /base/],
  ]) {
    const mismatch = stageReview(label, options)
    T(`launch-pr-review.mjs: a schema-valid ${label} identity mismatch cannot post evidence`, mismatch.result.status === 3 && pattern.test(mismatch.result.stderr) && !mismatch.calls.some((call) => call.tool === "gh" && call.args[1] === "review"), `${mismatch.result.status}\n${mismatch.result.stderr}\n${JSON.stringify(mismatch.calls)}`)
  }

  const invalid = spawnSync(process.execPath, [toolPath("launch-pr-review.mjs"), "--orbit-not-a-flag"], { encoding: "utf8" })
  T("launch-pr-review.mjs: invalid CLI exits 2 before external work", invalid.status === 2 && /usage: launch-pr-review/.test(invalid.stderr), `${invalid.status}\n${invalid.stderr}`)
}
