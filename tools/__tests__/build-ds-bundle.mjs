import { cpSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, T, root, run, stage } from "./_harness.mjs"

const TOOL = "design/canvas/tools/build-ds-bundle.mjs"
const TRACKED_DESIGN_SYSTEM = "design/canvas/_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507"

const refreshTokens = (folder) => run("build-ds-bundle.mjs", [folder, folder, "--tokens-only"], { path: join(REPO_ROOT, TOOL) })

/** A design system folder with token CSS and a manifest, and no components folder, as the repository tracks it. */
const stageTokensOnlyFolder = () => {
  const manifest = {
    namespace: "OrbitDesignSystem_918bd5",
    components: [{ name: "Button", sourcePath: "components/actions/Button.jsx" }],
    tokens: [
      { name: "--bg", value: "#000", kind: "color", definedIn: "tokens/colors.css", annotation: "canvas" },
      { name: "--gone", value: "#333", kind: "color", definedIn: "tokens/colors.css" },
      { name: "--space-1", value: "4px", kind: "spacing", definedIn: "tokens/spacing.css" },
      { name: "--space-old", value: "2px", kind: "spacing", definedIn: "tokens/spacing.css" },
    ],
  }
  const folder = join(root, "build-ds-bundle", "tokens-only")
  stage("build-ds-bundle/tokens-only/_ds_manifest.json", `${JSON.stringify(manifest)}\n`)
  stage("build-ds-bundle/tokens-only/tokens/colors.css", ':root { --bg: #111; --new: #222; }\n[data-mode="light"] { --bg: #fff; }\n')
  stage("build-ds-bundle/tokens-only/tokens/spacing.css", ":root { --space-1: 4px; }\n")
  return folder
}

export const cases = () => {
  const folder = stageTokensOnlyFolder()
  T(`${TOOL}: the fixture has no components folder`, !existsSync(join(folder, "components")))
  const refreshed = refreshTokens(folder)
  T(`${TOOL}: --tokens-only exits 0 and prints the token count without a components folder`,
    refreshed.status === 0 && refreshed.stdout.trim() === "tokens 4", `${refreshed.status} ${refreshed.stdout}${refreshed.stderr}`)
  const manifest = JSON.parse(readFileSync(join(folder, "_ds_manifest.json"), "utf8"))
  const tokens = manifest.tokens.map((token) => `${token.scope ?? ":root"} ${token.name} ${token.value}${token.annotation ? ` (${token.annotation})` : ""}`)
  T(`${TOOL}: --tokens-only reads each color token from the CSS, keeps its annotation and drops a token the CSS no longer defines`,
    JSON.stringify(tokens) === JSON.stringify([":root --bg #111 (canvas)", ":root --new #222", '[data-mode="light"] --bg #fff', ":root --space-1 4px"]), JSON.stringify(tokens))
  T(`${TOOL}: --tokens-only carries the components of the old manifest unchanged`,
    JSON.stringify(manifest.components) === JSON.stringify([{ name: "Button", sourcePath: "components/actions/Button.jsx" }]), JSON.stringify(manifest.components))
  T(`${TOOL}: --tokens-only writes no bundle`, !existsSync(join(folder, "_ds_bundle.js")))

  const tracked = join(root, "build-ds-bundle", "tracked")
  cpSync(join(REPO_ROOT, TRACKED_DESIGN_SYSTEM), tracked, { recursive: true })
  const trackedRefresh = refreshTokens(tracked)
  T(`${TOOL}: the documented --tokens-only refresh of a copy of the tracked design system folder exits 0`,
    trackedRefresh.status === 0 && /^tokens \d+$/.test(trackedRefresh.stdout.trim()), `${trackedRefresh.status} ${trackedRefresh.stdout}${trackedRefresh.stderr}`)
}
