#!/usr/bin/env node
/**
 * Launch one independent Codex review at an exact pull request head. This process is
 * synchronous so the caller receives one durable, commit-anchored verdict before it
 * proceeds. It never receives the implementation worker contract and never edits the
 * pull request branch.
 */

import { spawn, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { homedir, tmpdir } from "node:os"
import { basename, delimiter, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  cancelBudgetReservation,
  claimBudgetReservation,
  recordAutomationBudget,
  reserveAutomationBudget,
} from "./lib/automation-launch-budget.mjs"

const USAGE = `usage: launch-pr-review.mjs --repo <owner/name> --pr <number> --base <branch> [options]

  --repo <owner/name>  GitHub repository carrying the pull request
  --pr <number>        pull request number
  --base <branch>      target branch to review against
  --repo-root <path>   local repository checkout (default: current directory)
  --json               emit the durable result as JSON
  --help, -h           show this help

Exit 0 for APPROVE, 4 for NEEDS_WORK, 2 for invalid input, and 3 when no durable verdict can be produced.`

const KNOWN_FLAGS = new Set(["--repo", "--pr", "--base", "--repo-root", "--json", "--help", "-h"])
const VALUE_FLAGS = new Set(["--repo", "--pr", "--base", "--repo-root"])
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const BRANCH = /^[A-Za-z0-9._/-]+$/

const exitWith = (code, message) => {
  console.error(message)
  process.exit(code)
}

const parseArguments = () => {
  const values = new Map()
  let json = false
  for (let index = 2; index < process.argv.length; index++) {
    const flag = process.argv[index]
    if (!KNOWN_FLAGS.has(flag)) exitWith(2, `unknown argument ${flag}\n\n${USAGE}`)
    if (flag === "--help" || flag === "-h") {
      console.log(USAGE)
      process.exit(0)
    }
    if (flag === "--json") {
      json = true
      continue
    }
    if (values.has(flag)) exitWith(2, `${flag} may be provided only once\n\n${USAGE}`)
    const value = process.argv[++index]
    if (!value || value.startsWith("--")) exitWith(2, `${flag} requires a value\n\n${USAGE}`)
    values.set(flag, value)
  }
  for (const flag of ["--repo", "--pr", "--base"]) {
    if (!values.has(flag)) exitWith(2, `${flag} is required\n\n${USAGE}`)
  }
  for (const flag of values.keys()) {
    if (!VALUE_FLAGS.has(flag)) exitWith(2, `unexpected value flag ${flag}\n\n${USAGE}`)
  }
  const repository = values.get("--repo")
  const pullRequest = Number(values.get("--pr"))
  const base = values.get("--base")
  if (!REPOSITORY.test(repository)) exitWith(2, "--repo must be owner/name")
  if (!Number.isSafeInteger(pullRequest) || pullRequest <= 0) exitWith(2, "--pr must be a positive integer")
  if (!BRANCH.test(base) || base.startsWith("/") || base.includes("..")) exitWith(2, "--base is not a safe branch name")
  return { repository, pullRequest, base, repoRoot: resolve(values.get("--repo-root") ?? process.cwd()), json }
}

const readJson = (path, label) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    throw new Error(`${label} is not readable JSON: ${error.message}`)
  }
}

const argumentsParsed = parseArguments()
const configPath = resolve(process.env.ORBIT_ORCHESTRATOR_CONFIG ?? fileURLToPath(new URL("../.claude/orchestrator.json", import.meta.url)))
let config
try {
  config = readJson(configPath, configPath)
} catch (error) {
  exitWith(3, error.message)
}
const reviewer = config.reviewer
const codexBudget = config.workers?.codex?.automationBudget
if (!reviewer || typeof reviewer !== "object") exitWith(2, `${configPath} declares no reviewer`)
if (reviewer.engine !== "codex") exitWith(2, `${configPath} reviewer.engine must be codex`)
if (reviewer.model !== "gpt-5.6-sol" || reviewer.reasoningEffort !== "high") {
  exitWith(2, `${configPath} reviewer must pin gpt-5.6-sol with high reasoning effort`)
}
if (reviewer.automationBudgetTier !== "routine") exitWith(2, `${configPath} reviewer.automationBudgetTier must be routine`)
if (!Number.isSafeInteger(reviewer.projectedTokens) || reviewer.projectedTokens <= 0) {
  exitWith(2, `${configPath} reviewer.projectedTokens must be a positive integer`)
}
for (const key of ["accountUsedPercentCeiling", "tokenBudget", "warningTokens"]) {
  if (!Number.isFinite(codexBudget?.[key])) exitWith(2, `${configPath} workers.codex.automationBudget.${key} must be numeric`)
}

const schemaPath = fileURLToPath(new URL("./schemas/pr-review-result.schema.json", import.meta.url))
const canonicalReviewSkillPath = fileURLToPath(new URL("../.claude/skills/pr-review/SKILL.md", import.meta.url))
const canonicalReviewRubricPath = fileURLToPath(new URL("../.claude/skills/pr-review/rubric.md", import.meta.url))
const quotaToolPath = resolve(process.env.ORBIT_AI_QUOTA_TOOL ?? fileURLToPath(new URL("./ai-quota.mjs", import.meta.url)))
const budgetToolPath = resolve(process.env.ORBIT_AUTOMATION_BUDGET_TOOL ?? fileURLToPath(new URL("./automation-budget.mjs", import.meta.url)))
const ledgerOverride = process.env.ORBIT_AUTOMATION_BUDGET_LEDGER
if (ledgerOverride !== undefined && ledgerOverride.trim().length === 0) exitWith(2, "ORBIT_AUTOMATION_BUDGET_LEDGER must not be empty")
const ledgerPath = resolve(ledgerOverride ?? join(homedir(), ".orbit", "automation-budget.jsonl"))

const commandSpec = (scriptEnvironmentName, fallback) => process.env[scriptEnvironmentName]
  ? { executable: process.execPath, prefix: [resolve(process.env[scriptEnvironmentName])] }
  : { executable: fallback, prefix: [] }

const gitCommand = commandSpec("ORBIT_REVIEW_GIT_SCRIPT", "git")
const ghCommand = commandSpec("ORBIT_REVIEW_GH_SCRIPT", "gh")

const runSync = (command, argumentsList, options = {}) => {
  const result = spawnSync(command.executable, [...command.prefix, ...argumentsList], {
    cwd: options.cwd,
    encoding: "utf8",
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    env: options.env ?? process.env,
  })
  if (result.error || result.status !== 0) {
    const reason = (result.stderr || result.stdout || result.error?.message || "unknown error").trim()
    throw new Error(`${basename(command.executable)} ${argumentsList.join(" ")} failed: ${reason}`)
  }
  return result.stdout
}

const remoteSha = (ref) => {
  const output = runSync(gitCommand, ["ls-remote", "origin", ref], { cwd: argumentsParsed.repoRoot }).trim()
  const lines = output.split(/\r?\n/).filter(Boolean)
  if (lines.length !== 1) throw new Error(`git ls-remote returned ${lines.length} rows for ${ref}`)
  const match = /^([0-9a-f]{40})\s+(.+)$/.exec(lines[0])
  if (!match || match[2] !== ref) throw new Error(`git ls-remote returned an invalid envelope for ${ref}`)
  return match[1]
}

const repositoryFromOrigin = () => {
  const origin = runSync(gitCommand, ["remote", "get-url", "origin"], { cwd: argumentsParsed.repoRoot }).trim()
  const match = /(?:github\.com[/:])([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(origin)
  if (!match) throw new Error(`origin is not a recognized GitHub repository URL: ${origin}`)
  return `${match[1]}/${match[2]}`
}

const livePullRequest = () => {
  const output = runSync(ghCommand, [
    "pr", "view", String(argumentsParsed.pullRequest),
    "--repo", argumentsParsed.repository,
    "--json", "baseRefName,headRefOid,state",
  ])
  let payload
  try {
    payload = JSON.parse(output)
  } catch (error) {
    throw new Error(`live GitHub pull request envelope is not readable JSON: ${error.message}`)
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("live GitHub pull request envelope is not an object")
  }
  if (typeof payload.baseRefName !== "string" || !payload.baseRefName) {
    throw new Error("live GitHub pull request envelope lacks string baseRefName")
  }
  if (typeof payload.headRefOid !== "string" || !/^[0-9a-f]{40}$/.test(payload.headRefOid)) {
    throw new Error("live GitHub pull request envelope lacks a valid headRefOid")
  }
  if (typeof payload.state !== "string") {
    throw new Error("live GitHub pull request envelope lacks string state")
  }
  if (payload.state !== "OPEN") {
    throw new Error(`pull request state is ${payload.state}, expected OPEN`)
  }
  if (payload.baseRefName !== argumentsParsed.base) {
    throw new Error(`--base names ${argumentsParsed.base}, but the live pull request base is ${payload.baseRefName}`)
  }
  return payload
}

const resolveOnPath = (command) => {
  if (command.includes("/") || command.includes("\\")) return existsSync(command) ? resolve(command) : null
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""]
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`)
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
    }
  }
  return null
}

const codexCommand = () => {
  if (process.env.ORBIT_REVIEW_CODEX_SCRIPT) {
    return { executable: process.execPath, prefix: [resolve(process.env.ORBIT_REVIEW_CODEX_SCRIPT)] }
  }
  const resolved = resolveOnPath("codex")
  if (!resolved) throw new Error("could not resolve codex on PATH")
  if (!/\.(?:cmd|bat)$/i.test(resolved)) return { executable: resolved, prefix: [] }
  const shim = readFileSync(resolved, "utf8")
  const match = shim.match(/"%dp0%\\+([^"]+\.js)"/i)
  if (!match) throw new Error(`${resolved} is not a supported npm shim`)
  const script = resolve(dirname(resolved), match[1])
  if (!existsSync(script)) throw new Error(`${resolved} names missing script ${script}`)
  return { executable: process.execPath, prefix: [script] }
}

const runCodex = (command, argumentsList, options) => new Promise((resolveResult, reject) => {
  const child = spawn(command.executable, [...command.prefix, ...argumentsList], {
    cwd: options.cwd,
    env: options.env,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  })
  child.on("error", reject)
  if (!child.pid) {
    reject(new Error("Codex review process started without a PID"))
    return
  }
  options.onStart(child.pid)
  let stdout = ""
  let stderr = ""
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")
  child.stdout.on("data", (chunk) => { stdout += chunk })
  child.stderr.on("data", (chunk) => { stderr += chunk })
  child.stdin.on("error", (error) => reject(new Error(`could not deliver the Codex review prompt: ${error.message}`)))
  child.on("close", (status) => {
    if (status !== 0) {
      reject(new Error(`Codex review exited ${status}: ${(stderr || stdout).trim().slice(0, 800)}`))
      return
    }
    resolveResult({ stdout, stderr })
  })
  child.stdin.end(options.prompt)
})

const parseUsage = (jsonLines) => {
  const completed = []
  for (const line of jsonLines.split(/\r?\n/).filter(Boolean)) {
    let event
    try {
      event = JSON.parse(line)
    } catch {
      throw new Error("Codex JSONL usage stream contains invalid JSON")
    }
    if (event.type === "turn.completed") completed.push(event)
  }
  if (completed.length !== 1) throw new Error(`Codex JSONL usage requires exactly one turn.completed event, observed ${completed.length}`)
  const usage = completed[0].usage
  for (const key of ["input_tokens", "cached_input_tokens", "output_tokens"]) {
    if (!Number.isSafeInteger(usage?.[key]) || usage[key] < 0) throw new Error(`Codex JSONL usage lacks non-negative integer ${key}`)
  }
  if (usage.cached_input_tokens > usage.input_tokens) throw new Error("Codex JSONL usage cached_input_tokens exceeds input_tokens")
  return {
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.cached_input_tokens,
    outputTokens: usage.output_tokens,
  }
}

const validateReview = (review, expected) => {
  if (!review || typeof review !== "object" || Array.isArray(review)) throw new Error("Codex final review is not an object")
  if (review.schemaVersion !== 1) throw new Error("Codex final review has an unsupported schemaVersion")
  if (review.repository !== expected.repository) throw new Error(`Codex final review names repository ${review.repository ?? "none"}, expected ${expected.repository}`)
  if (review.pullRequest !== expected.pullRequest) throw new Error(`Codex final review names pull request ${review.pullRequest ?? "none"}, expected ${expected.pullRequest}`)
  if (review.base !== expected.base) throw new Error(`Codex final review names base ${review.base ?? "none"}, expected ${expected.base}`)
  if (review.reviewedHead !== expected.head) throw new Error(`Codex final review names ${review.reviewedHead ?? "no head"}, expected ${expected.head}`)
  if (!['APPROVE', 'NEEDS_WORK'].includes(review.verdict)) throw new Error("Codex final review has an invalid verdict")
  if (typeof review.summary !== "string" || !review.summary.trim()) throw new Error("Codex final review has no summary")
  if (!Array.isArray(review.findings) || !Array.isArray(review.positives) || typeof review.recommendation !== "string") {
    throw new Error("Codex final review does not match the required result shape")
  }
  if (review.verdict === "APPROVE" && review.findings.length !== 0) throw new Error("APPROVE cannot carry blocking findings")
  if (review.verdict === "NEEDS_WORK" && review.findings.length === 0) throw new Error("NEEDS_WORK must carry a blocking finding")
  for (const finding of review.findings) {
    if (!["Critical", "High"].includes(finding?.severity)) throw new Error("Review findings may contain only Critical or High severity")
    for (const key of ["title", "path", "evidence", "remediation"]) {
      if (typeof finding[key] !== "string" || !finding[key].trim()) throw new Error(`Review finding has no ${key}`)
    }
    if (finding.line !== null && (!Number.isSafeInteger(finding.line) || finding.line < 1)) throw new Error("Review finding line must be null or a positive integer")
  }
  return review
}

const reviewAssets = (reviewWorktreePath) => {
  const repositoryInstructions = ["AGENTS.md", "CLAUDE.md"]
    .map((name) => join(reviewWorktreePath, name))
    .filter(existsSync)
  const localSkill = join(reviewWorktreePath, ".claude", "skills", "pr-review", "SKILL.md")
  const localRubric = join(reviewWorktreePath, ".claude", "skills", "pr-review", "rubric.md")
  if (existsSync(localSkill) && existsSync(localRubric)) {
    return { repositoryInstructions, skill: localSkill, rubric: localRubric }
  }
  if (!existsSync(canonicalReviewSkillPath) || !existsSync(canonicalReviewRubricPath)) {
    throw new Error("the target has no complete pr-review skill pair and the canonical UI fallback is unavailable")
  }
  return { repositoryInstructions, skill: canonicalReviewSkillPath, rubric: canonicalReviewRubricPath }
}

const reviewPrompt = ({ repository, pullRequest, base, baseSha, headSha, assets }) => `You are the independent Codex reviewer for ${repository} pull request #${pullRequest}.

This is a review-only run. Do not edit files, create commits, push, post to GitHub, or invoke another model. ${assets.repositoryInstructions.length > 0 ? `Read the target repository instructions at ${assets.repositoryInstructions.join(" and ")}.` : "The target checkout has no AGENTS.md or CLAUDE.md to read."} Read the review skill at ${assets.skill} and its rubric at ${assets.rubric}. Review every changed file in the complete ${baseSha}...${headSha} diff. The target branch is ${base}. Report only Critical and High findings under the repository rubric. Return APPROVE only when there are no such findings. Set repository to ${repository}, pullRequest to ${pullRequest}, base to ${base}, and reviewedHead to ${headSha}. Your final response must match the supplied JSON schema exactly.`

const commentBody = (result) => `<!-- orbit-local-review: ${JSON.stringify({ version: 1, head: result.headSha, recommendation: result.verdict })} -->

\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\`
`

let reservation = null
let reviewStarted = false
let worktreePath = null
let worktreePreserved = false
let recorded = false

const cleanWorktree = () => {
  if (!worktreePath || worktreePreserved) return
  const status = runSync(gitCommand, ["status", "--porcelain"], { cwd: worktreePath }).trim()
  if (status) {
    worktreePreserved = true
    throw new Error(`review worktree ${worktreePath} is dirty and was preserved for inspection`)
  }
  runSync(gitCommand, ["worktree", "remove", worktreePath], { cwd: argumentsParsed.repoRoot })
  worktreePath = null
}

const failReview = (error, code = 3) => {
  try {
    cleanWorktree()
  } catch (cleanupError) {
    error = new Error(`${error.message}; ${cleanupError.message}`)
  }
  if (reservation && !reviewStarted && !recorded) cancelBudgetReservation(reservation)
  exitWith(error.exitCode ?? code, error.message)
}

const main = async () => {
  if (!existsSync(join(argumentsParsed.repoRoot, ".git"))) throw new Error(`${argumentsParsed.repoRoot} is not a repository checkout`)
  runSync(gitCommand, ["check-ref-format", "--branch", argumentsParsed.base], { cwd: argumentsParsed.repoRoot })
  const originRepository = repositoryFromOrigin()
  if (originRepository.toLowerCase() !== argumentsParsed.repository.toLowerCase()) {
    throw new Error(`--repo names ${argumentsParsed.repository}, but origin is ${originRepository}`)
  }
  const pullRequest = livePullRequest()
  const headRef = `refs/pull/${argumentsParsed.pullRequest}/head`
  const baseRef = `refs/heads/${argumentsParsed.base}`
  const headSha = remoteSha(headRef)
  if (headSha !== pullRequest.headRefOid) {
    throw new Error(`pull request ref head is ${headSha}, but the live GitHub head is ${pullRequest.headRefOid}`)
  }
  const baseSha = remoteSha(baseRef)
  const startedAt = new Date().toISOString()
  const identity = `pr-review:${argumentsParsed.repository}#${argumentsParsed.pullRequest}@${headSha}:${startedAt}:${randomUUID()}`
  reservation = reserveAutomationBudget({
    engineName: "codex",
    identity,
    tier: reviewer.automationBudgetTier,
    startedAt,
    warningTokens: codexBudget.warningTokens,
    tokenBudget: codexBudget.tokenBudget,
    accountCeilingPercent: codexBudget.accountUsedPercentCeiling,
    projectedTokens: reviewer.projectedTokens,
    ledgerPath,
    quotaToolPath,
    budgetToolPath,
  })

  runSync(gitCommand, ["fetch", "--no-tags", "origin", baseRef, headRef], { cwd: argumentsParsed.repoRoot })
  const worktreeRoot = mkdtempSync(join(tmpdir(), "orbit-pr-review-"))
  worktreePath = join(worktreeRoot, "checkout")
  runSync(gitCommand, ["worktree", "add", "--detach", worktreePath, headSha], { cwd: argumentsParsed.repoRoot })
  const checkedOutHead = runSync(gitCommand, ["rev-parse", "HEAD"], { cwd: worktreePath }).trim()
  if (checkedOutHead !== headSha) throw new Error(`detached review worktree is at ${checkedOutHead}, expected ${headSha}`)

  const outputPath = join(worktreeRoot, "final-review.json")
  const assets = reviewAssets(worktreePath)
  const codexArguments = [
    "exec",
    "-C", worktreePath,
    "--model", reviewer.model,
    "-c", `model_reasoning_effort=\"${reviewer.reasoningEffort}\"`,
    "--sandbox", "read-only",
    "--ephemeral",
    "--output-schema", schemaPath,
    "--output-last-message", outputPath,
    "--json",
    "-",
  ]
  const codexResult = await runCodex(codexCommand(), codexArguments, {
    cwd: worktreePath,
    env: { ...process.env, ORBIT_LAUNCH_PR_REVIEW: "1" },
    prompt: reviewPrompt({ ...argumentsParsed, baseSha, headSha, assets }),
    onStart: (pid) => {
      reviewStarted = true
      claimBudgetReservation(reservation, reviewer.projectedTokens, pid)
    },
  })
  const usage = parseUsage(codexResult.stdout)
  if (!recordAutomationBudget(reservation, usage)) throw new Error("automation-budget could not record the Codex review usage")
  recorded = true

  const review = validateReview(readJson(outputPath, "Codex final review"), {
    repository: argumentsParsed.repository,
    pullRequest: argumentsParsed.pullRequest,
    base: argumentsParsed.base,
    head: headSha,
  })
  const currentHead = remoteSha(headRef)
  if (currentHead !== headSha) throw new Error(`pull request head moved from ${headSha} to ${currentHead}; refusing the stale review result`)

  cleanWorktree()
  try {
    rmSync(dirname(outputPath), { recursive: true })
  } catch {
    /* git removed the checkout; an already absent temporary parent needs no recovery */
  }

  const durableResult = {
    marker: "orbit-local-review:v1",
    delivery: "COMMENTED",
    repository: argumentsParsed.repository,
    pullRequest: argumentsParsed.pullRequest,
    base: argumentsParsed.base,
    baseSha,
    headSha,
    reviewer: { engine: "codex", model: reviewer.model, reasoningEffort: reviewer.reasoningEffort },
    verdict: review.verdict,
    summary: review.summary,
    findings: review.findings,
    positives: review.positives,
    recommendation: review.recommendation,
  }
  const bodyPath = join(tmpdir(), `orbit-pr-review-comment-${process.pid}-${randomUUID()}.md`)
  try {
    writeFileSync(bodyPath, commentBody(durableResult), "utf8")
    runSync(ghCommand, ["pr", "review", String(argumentsParsed.pullRequest), "--repo", argumentsParsed.repository, "--comment", "--body-file", bodyPath])
  } finally {
    try {
      rmSync(bodyPath)
    } catch {
      /* the comment command may remove nothing; cleanup must not replace its verdict */
    }
  }
  console.log(JSON.stringify(durableResult, null, argumentsParsed.json ? 2 : 0))
  process.exit(review.verdict === "APPROVE" ? 0 : 4)
}

try {
  await main()
} catch (error) {
  failReview(error)
}
