import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { REPO_ROOT, T, root, run, toolPath } from "./_harness.mjs"

const CANVAS_DOCUMENTS = [
  "Orbit Assinatura", "Orbit Astra Conversation", "Orbit Avisos", "Orbit Busca", "Orbit Calendario",
  "Orbit Celebracao", "Orbit Entrar", "Orbit Estados", "Orbit Habit Create", "Orbit Habit Detail",
  "Orbit Hoje", "Orbit Offline", "Orbit Onboarding", "Orbit Perfil", "Orbit Pro", "Orbit Progresso",
  "Orbit Sobre", "Orbit Sobreposicoes", "Orbit Verificacao", "Orbit Widget Android", "Orbit Wrapped",
]

function stageCoverage(label, mutate) {
  const fixtureRoot = join(root, "redesign-coverage", label)
  mkdirSync(join(fixtureRoot, "tools"), { recursive: true })
  mkdirSync(join(fixtureRoot, ".claude", "manifests"), { recursive: true })
  cpSync(toolPath("redesign-coverage.mjs"), join(fixtureRoot, "tools", "redesign-coverage.mjs"))
  cpSync(join(REPO_ROOT, ".claude", "manifests", "surfaces.json"), join(fixtureRoot, ".claude", "manifests", "surfaces.json"))
  const mapping = JSON.parse(readFileSync(join(REPO_ROOT, "tools", "redesign-groups.json"), "utf8"))
  mutate?.(mapping)
  writeFileSync(join(fixtureRoot, "tools", "redesign-groups.json"), `${JSON.stringify(mapping, null, 2)}\n`)
  return join(fixtureRoot, "tools", "redesign-coverage.mjs")
}

export async function cases() {
  const clean = run("redesign-coverage.mjs", [])
  T("redesign coverage validates the committed mapping", clean.status === 0, clean.stderr)

  const json = run("redesign-coverage.mjs", ["--json"])
  T("redesign coverage emits JSON on the cited interface", json.status === 0, json.stderr)
  if (json.status === 0) {
    const groups = JSON.parse(json.stdout)
    T("the JSON keys are exactly the canvas document names", JSON.stringify(Object.keys(groups).sort()) === JSON.stringify(CANVAS_DOCUMENTS.sort()))
    T("the Android widget is returned by its canvas document", groups["Orbit Widget Android"]?.includes("m-widget-orbit-widget"))
  }

  let removedSurfaceId = ""
  const missingPath = stageCoverage("missing", (mapping) => {
    const group = Object.keys(mapping.groups).find((key) => mapping.groups[key].length > 0)
    removedSurfaceId = mapping.groups[group].shift()
  })
  const missing = run("redesign-coverage.mjs", [], { path: missingPath })
  T("a missing mapping exits 1 and names the manifest surface", missing.status === 1 && missing.stderr.includes(removedSurfaceId), missing.stderr)

  const fakeSurfaceId = "surface-that-does-not-exist"
  const extraPath = stageCoverage("extra", (mapping) => mapping.groups["Orbit Sobreposicoes"].push(fakeSurfaceId))
  const extra = run("redesign-coverage.mjs", [], { path: extraPath })
  T("an extra mapping exits 1 and names the stale surface", extra.status === 1 && extra.stderr.includes(fakeSurfaceId), extra.stderr)

  const noDecisionPath = stageCoverage("deleted-no-decision", (mapping) => { mapping.deleted[0].decision = "" })
  const noDecision = run("redesign-coverage.mjs", [], { path: noDecisionPath })
  T("a deleted surface without a decision exits 1 and names the surface", noDecision.status === 1 && noDecision.stderr.includes(mappingDeletedId(noDecisionPath)), noDecision.stderr)

  const duplicateSurfaceId = "route-root"
  const duplicatePath = stageCoverage("duplicate", (mapping) => mapping.groups["Orbit Perfil"].push(duplicateSurfaceId))
  const duplicate = run("redesign-coverage.mjs", [], { path: duplicatePath })
  T("a surface mapped to two documents exits 1 and names the surface", duplicate.status === 1 && duplicate.stderr.includes(duplicateSurfaceId), duplicate.stderr)
}

function mappingDeletedId(tool) {
  return JSON.parse(readFileSync(join(tool, "..", "redesign-groups.json"), "utf8")).deleted[0].surfaceId
}
