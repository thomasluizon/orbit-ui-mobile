import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { REPO_ROOT, T, root, run, toolPath } from "./_harness.mjs"

function canvasDocumentNames(canvasDirectory) {
  return readdirSync(canvasDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".dc.html"))
    .map((entry) => entry.name.slice(0, -".dc.html".length))
    .sort()
}

function stageCoverage(label, mutate) {
  const fixtureRoot = join(root, "redesign-coverage", label)
  mkdirSync(join(fixtureRoot, "tools"), { recursive: true })
  mkdirSync(join(fixtureRoot, ".claude", "manifests"), { recursive: true })
  const canvasDirectory = join(fixtureRoot, "design", "canvas")
  mkdirSync(canvasDirectory, { recursive: true })
  cpSync(toolPath("redesign-coverage.mjs"), join(fixtureRoot, "tools", "redesign-coverage.mjs"))
  cpSync(join(REPO_ROOT, ".claude", "manifests", "surfaces.json"), join(fixtureRoot, ".claude", "manifests", "surfaces.json"))
  for (const document of readdirSync(join(REPO_ROOT, "design", "canvas"), { withFileTypes: true })) {
    if (document.isFile() && document.name.endsWith(".dc.html")) {
      cpSync(join(REPO_ROOT, "design", "canvas", document.name), join(canvasDirectory, document.name))
    }
  }
  const mapping = JSON.parse(readFileSync(join(REPO_ROOT, "tools", "redesign-groups.json"), "utf8"))
  mutate?.(mapping, canvasDirectory)
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
    const canvasDocuments = canvasDocumentNames(join(REPO_ROOT, "design", "canvas"))
    T("the JSON keys are exactly the current canvas document names", JSON.stringify(Object.keys(groups).sort()) === JSON.stringify(canvasDocuments))
    T("the Android widget is returned by its canvas document", groups["Orbit Widget Android"]?.includes("m-widget-orbit-widget"))
  }

  const addedDocument = "Orbit Added"
  const addedDocumentPath = stageCoverage("canvas-added", (_mapping, canvasDirectory) => {
    writeFileSync(join(canvasDirectory, `${addedDocument}.dc.html`), "")
  })
  const addedDocumentResult = run("redesign-coverage.mjs", [], { path: addedDocumentPath })
  T("an added canvas document exits 1 and names the missing mapping key", addedDocumentResult.status === 1 && addedDocumentResult.stderr.includes(addedDocument), addedDocumentResult.stderr)

  let removedDocument = ""
  const removedDocumentPath = stageCoverage("canvas-removed", (_mapping, canvasDirectory) => {
    removedDocument = canvasDocumentNames(canvasDirectory)[0]
    rmSync(join(canvasDirectory, `${removedDocument}.dc.html`))
  })
  const removedDocumentResult = run("redesign-coverage.mjs", [], { path: removedDocumentPath })
  T("a removed canvas document exits 1 and names the stale mapping key", removedDocumentResult.status === 1 && removedDocumentResult.stderr.includes(removedDocument), removedDocumentResult.stderr)

  const inventedDocument = "Orbit Invented"
  const inventedDocumentPath = stageCoverage("canvas-invented", (mapping) => { mapping.groups[inventedDocument] = [] })
  const inventedDocumentResult = run("redesign-coverage.mjs", [], { path: inventedDocumentPath })
  T("an invented canvas document exits 1 and names the stale mapping key", inventedDocumentResult.status === 1 && inventedDocumentResult.stderr.includes(inventedDocument), inventedDocumentResult.stderr)

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

  const liveDeletedSurfaceId = "route-root"
  const liveDeletedPath = stageCoverage("live-deleted", (mapping) => {
    const owner = Object.values(mapping.groups).find((surfaceIds) => surfaceIds.includes(liveDeletedSurfaceId))
    owner.splice(owner.indexOf(liveDeletedSurfaceId), 1)
    mapping.deleted.push({ surfaceId: liveDeletedSurfaceId, decision: "Test decision" })
  })
  const liveDeleted = run("redesign-coverage.mjs", [], { path: liveDeletedPath })
  T("a live manifest surface recorded as deleted exits 1 and names the surface", liveDeleted.status === 1 && liveDeleted.stderr.includes(liveDeletedSurfaceId), liveDeleted.stderr)

  const duplicateSurfaceId = "route-root"
  const duplicatePath = stageCoverage("duplicate", (mapping) => mapping.groups["Orbit Perfil"].push(duplicateSurfaceId))
  const duplicate = run("redesign-coverage.mjs", [], { path: duplicatePath })
  T("a surface mapped to two documents exits 1 and names the surface", duplicate.status === 1 && duplicate.stderr.includes(duplicateSurfaceId), duplicate.stderr)
}

function mappingDeletedId(tool) {
  return JSON.parse(readFileSync(join(tool, "..", "redesign-groups.json"), "utf8")).deleted[0].surfaceId
}
