import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { REPO_ROOT, T, root, run, toolPath } from "./_harness.mjs"

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
    T("the cited R-group keys are present", Array.isArray(groups["R1-primitive-overlay"]) && Array.isArray(groups["R18-screen-static"]))
    T("the Android widget is returned by R21", groups["R21-widget"]?.includes("m-widget-orbit-widget"))
  }

  let removedSurfaceId = ""
  const missingPath = stageCoverage("missing", (mapping) => {
    const group = Object.keys(mapping.groups).find((key) => mapping.groups[key].length > 0)
    removedSurfaceId = mapping.groups[group].shift()
  })
  const missing = run("redesign-coverage.mjs", [], { path: missingPath })
  T("a missing mapping exits 1 and names the manifest surface", missing.status === 1 && missing.stderr.includes(removedSurfaceId), missing.stderr)

  const fakeSurfaceId = "surface-that-does-not-exist"
  const extraPath = stageCoverage("extra", (mapping) => mapping.groups["R1-primitive-overlay"].push(fakeSurfaceId))
  const extra = run("redesign-coverage.mjs", [], { path: extraPath })
  T("an extra mapping exits 1 and names the stale surface", extra.status === 1 && extra.stderr.includes(fakeSurfaceId), extra.stderr)
}
