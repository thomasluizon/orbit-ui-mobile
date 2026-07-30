#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"
import { readOrchestratorConfig, resolveWorkerModel } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: run-commit-sweep.mjs [--ui-root <path>] [--api-root <path>] [--count <N> | --since <when>] [--scope <both|ui|api>]

  Collect commit evidence, ask Codex to apply the established sweep rubric, validate its
  structured response, and write .claude/audits/commit-sweep.md plus its status sidecar.
  --help, -h  print this usage and exit 0`
const argv = process.argv.slice(2)
if (argv.includes("--help") || argv.includes("-h")) { console.log(USAGE); process.exit(0) }
const allowed = new Set(["--ui-root", "--api-root", "--count", "--since", "--scope"])
for (let index = 0; index < argv.length; index += 2) if (!allowed.has(argv[index]) || !argv[index + 1]) { console.error(`run-commit-sweep: invalid arguments\n\n${USAGE}`); process.exit(2) }
const uiRoot = resolve(argv.includes("--ui-root") ? argv[argv.indexOf("--ui-root") + 1] : process.cwd())
const collector = spawnSync(process.execPath, [join(resolve(fileURLToPath(new URL(".", import.meta.url))), "collect-commit-sweep.mjs"), ...argv], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
if (collector.error || collector.status !== 0) { console.error(`run-commit-sweep: collector failed: ${(collector.stderr || collector.error?.message || "unknown error").trim()}`); process.exit(1) }
let facts
try { facts = JSON.parse(collector.stdout) } catch { console.error("run-commit-sweep: collector returned invalid JSON"); process.exit(1) }
let config
try { config = readOrchestratorConfig() } catch (error) { console.error(`run-commit-sweep: ${error.message}`); process.exit(2) }
let model
try { model = resolveWorkerModel("codex", config.workers?.codex, ["tier:cheap"]) } catch (error) { console.error(`run-commit-sweep: ${error.message}`); process.exit(2) }
const budget = config.workers?.codex?.automationBudget
if (!budget || !Number.isSafeInteger(budget.tokenBudget) || !Number.isSafeInteger(budget.warningTokens) || !Number.isSafeInteger(budget.invocationTokens?.[model.tier])) { console.error("run-commit-sweep: Codex automation budget is invalid"); process.exit(2) }
const toolDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)))
const quota = spawnSync(process.execPath, [join(toolDirectory, "ai-quota.mjs"), "--json"], { encoding: "utf8" })
let codexQuota
try { codexQuota = JSON.parse(quota.stdout).codex } catch { console.error("run-commit-sweep: could not read Codex quota; refusing unattended automation"); process.exit(3) }
const resetAt = new Date(Number(codexQuota?.resetsAt) * 1000)
if (quota.status !== 0 || codexQuota?.status !== "OK" || !Number.isFinite(resetAt.valueOf())) { console.error("run-commit-sweep: could not read Codex quota; refusing unattended automation"); process.exit(3) }
const startedAt = new Date().toISOString()
const identity = `commit-sweep:${startedAt}:${randomUUID()}`
const ledger = process.env.ORBIT_AUTOMATION_BUDGET_LEDGER || join(homedir(), ".orbit", "automation-budget.jsonl")
const budgetTool = join(toolDirectory, "automation-budget.mjs")
const reserve = spawnSync(process.execPath, [budgetTool, "reserve", "--engine", "codex", "--identity", identity, "--tier", "routine", "--started-at", startedAt, "--ended-at", startedAt, "--reset-at", resetAt.toISOString(), "--warning-tokens", String(budget.warningTokens), "--budget-tokens", String(budget.tokenBudget), "--invocation-tokens", String(budget.invocationTokens[model.tier]), "--ledger", ledger, "--json"], { encoding: "utf8" })
if (reserve.status !== 0) { console.error(`run-commit-sweep: ${(reserve.stderr || reserve.stdout).trim()}`); process.exit(reserve.status === 4 ? 4 : 3) }
const scratch = mkdtempSync(join(tmpdir(), "orbit-commit-sweep-"))
const schemaPath = join(scratch, "schema.json")
const outputPath = join(scratch, "result.json")
writeFileSync(schemaPath, JSON.stringify({ type: "object", additionalProperties: false, required: ["status", "report"], properties: { status: { enum: ["empty", "clean", "findings"] }, report: { type: "string", minLength: 1 } } }))
const prompt = `You are the report-only Orbit commit sweep. Apply exactly the established six-check rubric from .claude/skills/commit-sweep/SKILL.md to the collected git evidence below. Do not use tools, do not edit files, and do not post to GitHub. Return only the schema JSON. status is empty only when every in-scope window is empty; clean when reviewed with no findings; findings otherwise. report must use the skill's report structure and must cite evidence for every finding.\n\n${JSON.stringify(facts)}`
const codex = spawnSync(process.env.CODEX_BIN || "codex", ["exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--sandbox", "read-only", ...model.args, "--model", model.model, "--output-schema", schemaPath, "--output-last-message", outputPath, "-"], { cwd: uiRoot, input: prompt, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 20 * 60 * 1000 })
if (codex.error || codex.status !== 0) { spawnSync(process.execPath, [budgetTool, "cancel", "--identity", identity, "--engine", "codex", "--tier", "routine", "--started-at", startedAt, "--ended-at", new Date().toISOString(), "--ledger", ledger, "--json"], { encoding: "utf8" }); rmSync(scratch, { recursive: true, force: true }); console.error(`run-commit-sweep: Codex failed: ${(codex.stderr || codex.error?.message || `exit ${codex.status}`).trim()}`); process.exit(1) }
let result
try { result = JSON.parse(readFileSync(outputPath, "utf8")) } catch { rmSync(scratch, { recursive: true, force: true }); console.error("run-commit-sweep: malformed Codex result"); process.exit(1) }
if (!result || !["empty", "clean", "findings"].includes(result.status) || typeof result.report !== "string" || !result.report.trim()) { rmSync(scratch, { recursive: true, force: true }); console.error("run-commit-sweep: Codex result failed schema validation"); process.exit(1) }
const auditDir = join(uiRoot, ".claude", "audits")
mkdirSync(auditDir, { recursive: true })
writeFileSync(join(auditDir, "commit-sweep.md"), result.report.trim() + "\n")
writeFileSync(join(auditDir, "commit-sweep.status"), result.status + "\n")
const recorded = spawnSync(process.execPath, [budgetTool, "record", "--identity", identity, "--engine", "codex", "--tier", "routine", "--started-at", startedAt, "--ended-at", new Date().toISOString(), "--ledger", ledger, "--json"], { encoding: "utf8" })
if (recorded.status !== 0) { rmSync(scratch, { recursive: true, force: true }); console.error(`run-commit-sweep: ${(recorded.stderr || recorded.stdout).trim()}`); process.exit(3) }
rmSync(scratch, { recursive: true, force: true })
console.log(JSON.stringify({ status: result.status, tier: model.tier }))
