import { readFileSync } from "node:fs"

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

const sameArgs = (first, second) =>
  first.length === second.length && first.every((argument, index) => argument === second[index])

const modelEntry = (engineName, models, tier) => {
  const entry = models[tier]
  if (
    !isRecord(entry) ||
    typeof entry.model !== "string" ||
    entry.model.trim().length === 0 ||
    (entry.args !== undefined && (!Array.isArray(entry.args) || entry.args.some((argument) => typeof argument !== "string")))
  ) {
    throw new Error(
      `worker engine "${engineName}" has an invalid models.${tier} mapping; expected { model: string, args?: string[] }`,
    )
  }
  return entry
}

const invocationFor = (baseArgs, entry) => [...baseArgs, ...(entry.args ?? []), "--model", entry.model]

export const readOrchestratorConfig = (
  configUrl = new URL("../../.claude/orchestrator.json", import.meta.url),
) => {
  try {
    return JSON.parse(readFileSync(configUrl, "utf8"))
  } catch (error) {
    throw new Error(`.claude/orchestrator.json could not be read as JSON: ${error.message}`)
  }
}

export const resolveWorkerInvocation = (engineName, engine, labels) => {
  if (labels.includes("worker:sonnet")) {
    throw new Error('worker:sonnet is no longer supported; replace it with "tier:cheap"')
  }
  if (!isRecord(engine)) {
    throw new Error(`worker engine "${engineName}" is missing from .claude/orchestrator.json`)
  }
  if (
    !Array.isArray(engine.args) ||
    engine.args.some((argument) => typeof argument !== "string") ||
    engine.args.some((argument) => argument === "--model" || argument === "-m" || argument.startsWith("--model="))
  ) {
    throw new Error(`worker engine "${engineName}" must declare args as an array of non-model strings`)
  }
  if (!isRecord(engine.models) || !Object.hasOwn(engine.models, "default")) {
    throw new Error(
      `worker engine "${engineName}" has an invalid models.default mapping; expected { model: string, args?: string[] }`,
    )
  }
  for (const requiredTier of ["cheap", "deep"]) {
    if (!Object.hasOwn(engine.models, requiredTier)) {
      throw new Error(`worker engine "${engineName}" is missing its models.${requiredTier} mapping`)
    }
  }

  const declaredTiers = Object.keys(engine.models).filter((tier) => tier !== "default")
  const entries = new Map(
    ["default", ...declaredTiers].map((tier) => [tier, modelEntry(engineName, engine.models, tier)]),
  )
  const tierLabels = [...new Set(labels.filter((label) => label.startsWith("tier:")))]
  if (tierLabels.length > 1) {
    throw new Error(`conflicting worker tier labels: ${tierLabels.join(", ")}`)
  }

  const tier = tierLabels[0]?.slice("tier:".length) ?? "default"
  if (!entries.has(tier)) {
    const available = declaredTiers.map((declaredTier) => `tier:${declaredTier}`).join(", ") || "none"
    throw new Error(
      `worker engine "${engineName}" does not declare tier:${tier}; declared tiers: ${available}`,
    )
  }

  const cheapArgs = entries.has("cheap") ? invocationFor(engine.args, entries.get("cheap")) : null
  const deepArgs = entries.has("deep") ? invocationFor(engine.args, entries.get("deep")) : null
  if (cheapArgs && deepArgs && sameArgs(cheapArgs, deepArgs)) {
    throw new Error(`worker engine "${engineName}" resolves tier:cheap and tier:deep to identical invocations`)
  }

  const args = invocationFor(engine.args, entries.get(tier))
  const defaultArgs = invocationFor(engine.args, entries.get("default"))
  if (tier !== "default" && sameArgs(args, defaultArgs)) {
    throw new Error(
      `worker engine "${engineName}" resolves tier:${tier} to the same invocation as its default model`,
    )
  }
  return { tier, args }
}
