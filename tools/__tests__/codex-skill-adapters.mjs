#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { T, failureCount } from "./_harness.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

const check = (name, condition, detail) => T(name, condition, detail)

const codexSkillAdapterCases = () => {
  for (const name of ["feature", "ticket", "orchestrate"]) {
    const adapterPath = resolve(ROOT, `.agents/skills/${name}/SKILL.md`)
    const canonicalPath = `.claude/skills/${name}/SKILL.md`
    const body = existsSync(adapterPath) ? readFileSync(adapterPath, "utf8") : ""
    check(`${name} Codex adapter exists`, body.length > 0, `${adapterPath} is missing`)
    check(`${name} Codex adapter defers to its canonical Claude skill`, body.includes(canonicalPath), `${adapterPath} does not name ${canonicalPath}`)
    check(`${name} canonical Claude skill exists`, existsSync(resolve(ROOT, canonicalPath)), `${canonicalPath} is missing`)
    check(`${name} Codex adapter stays thin`, body.length > 0 && body.length < 700 && /source is authoritative/i.test(body), `${adapterPath} copies workflow logic`)
  }

  const orchestrate = readFileSync(resolve(ROOT, ".claude/skills/orchestrate/SKILL.md"), "utf8")
  check("orchestrate binds Luna to the unchanged ticket and exact base", /ticketBodySha256/i.test(orchestrate) && /baseSha/i.test(orchestrate) && /make-execution-brief\.mjs/i.test(orchestrate), "the Sol brief boundary is incomplete")
  check("orchestrate uses Luna max effort with fast service", /GPT-5\.6 Luna at max effort with\s*the priority fast service tier/i.test(orchestrate) && /service_tier="fast"/i.test(orchestrate), "the implementation route is not pinned to Luna max fast")
  check("orchestrate keeps Luna out of delivery mutations", /Luna does not open a PR/i.test(orchestrate) && /never plans the DAG/i.test(orchestrate) && /never calls a merge command/i.test(orchestrate), "the Luna ownership boundary is incomplete")
  check("orchestrate gates delivery on authoritative implementation status", /IMPLEMENTATION_READY/i.test(orchestrate) && /worker-status\.mjs[\s\S]*--implementation/i.test(orchestrate), "the local handoff gate is missing")
  check("orchestrate launches fresh exact-head Sol review", /launch-pr-review\.mjs/i.test(orchestrate) && /current-head `APPROVE`/i.test(orchestrate) && /new review/i.test(orchestrate), "the exact-head review loop is incomplete")
  check("orchestrate returns findings to Luna only after a head change", /stable finding identity/i.test(orchestrate) && /changed head/i.test(orchestrate) && /same worktree/i.test(orchestrate), "the repair boundary is incomplete")
  check("orchestrate requires human squash merge", /Human squash merge is mandatory/i.test(orchestrate) && /--sleep.*not supported/i.test(orchestrate) && /never calls a merge command/i.test(orchestrate), "the workflow still exposes an automated merge path")
  check("orchestrate preserves only safe cleanup", /clean, inactive, verified stale/i.test(orchestrate) && /ordinary non-forced teardown/i.test(orchestrate) && /dirty, active, unknown, or ambiguous trees/i.test(orchestrate), "the cleanup lifecycle is incomplete")
  check("orchestrate has the PR #674 migration exception", /PR #674/i.test(orchestrate) && /do not create another PR/i.test(orchestrate) && /do not close PR #672/i.test(orchestrate), "the migration PR boundary is missing")
  check("orchestrate has no sleep merge implementation", !/sleep merge|--sleep[^\n]*(squash merge|gh pr merge)/i.test(orchestrate), "obsolete unattended merge language remains")

  const codexConfig = readFileSync(resolve(ROOT, ".codex/config.toml"), "utf8")
  check("Codex project config selects Sol at high effort", /model\s*=\s*"gpt-5\.6-sol"/.test(codexConfig) && /model_reasoning_effort\s*=\s*"high"/.test(codexConfig), "the native Codex default is not Sol at high effort")
  let hookManifest = null
  try {
    hookManifest = JSON.parse(readFileSync(resolve(ROOT, ".codex/hooks.json"), "utf8"))
  } catch {
    hookManifest = null
  }
  const installedHookEvents = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "SubagentStart", "SubagentStop", "Stop", "SessionEnd"]
  check("Codex lifecycle manifest matches the installed hook event set", Object.keys(hookManifest?.hooks ?? {}).sort().join(",") === installedHookEvents.slice().sort().join(",") && Object.values(hookManifest?.hooks ?? {}).every((entries) => entries?.[0]?.hooks?.[0]?.command === "node .codex/hooks/lifecycle-adapter.mjs"), "the native hook inventory is incomplete or points at another adapter")
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (direct) {
  const before = failureCount()
  codexSkillAdapterCases()
  const failures = failureCount() - before
  console.log(`\n${failures === 0 ? "CODEX SKILL ADAPTER CONTRACT OK" : `CODEX SKILL ADAPTER CONTRACT FAILED (${failures})`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

export { codexSkillAdapterCases as cases }
