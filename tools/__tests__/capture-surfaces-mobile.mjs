import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  buildCaptureDeepLink,
  mobileUnreachableReason,
  planMobileCaptures,
} from "../capture-surfaces-mobile.mjs"
import { REPO_ROOT, T, check, root } from "./_harness.mjs"

const captureSurfacesMobileCases = () => {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, ".claude", "manifests", "surfaces.json"), "utf8"))
  const options = {
    surfaces: ["m-route-login", "m-route-privacy", "m-route-terms"],
    theme: "all",
    locale: "all",
    driver: "maestro",
  }
  const plan = planMobileCaptures(manifest, options)
  T("three route surfaces expand to the 12-cell theme and locale matrix", plan.selectedCount === 12 && plan.captures.length === 12, JSON.stringify(plan))

  const login = plan.captures.find((cell) => cell.surfaceId === "m-route-login" && cell.theme === "dark" && cell.locale === "pt-BR")
  T(
    "deep links carry explicit app-level theme and locale parameters",
    buildCaptureDeepLink(login, login.theme, login.locale) === "orbit://login?captureTheme=dark&captureLocale=pt-BR",
  )

  const overlay = manifest.cells.find((cell) => cell.platform === "mobile" && cell.kind === "overlay")
  const blocked = mobileUnreachableReason(overlay)
  T("surfaces without deterministic entry points are reported as unreachable", blocked?.reason === "needs-surface-flow", JSON.stringify(blocked))

  const output = join(root, "mobile-capture-dry-run")
  check(
    "capture-surfaces-mobile.mjs",
    "dry-run produces the deterministic 12-cell public-route plan",
    [
      "--surface", "m-route-login",
      "--surface", "m-route-privacy",
      "--surface", "m-route-terms",
      "--output", output,
      "--dry-run",
    ],
    { status: 0, stdout: /planned 12\/12 cells/ },
  )

  check(
    "capture-surfaces-mobile.mjs",
    "an unsupported surface is listed and exits unreachable",
    ["--surface", overlay.surfaceId, "--output", join(root, "mobile-capture-unreachable"), "--dry-run"],
    { status: 3, stdout: /UNREACHABLE \(4\):[\s\S]*needs-surface-flow/ },
  )
}

export { captureSurfacesMobileCases as cases }
