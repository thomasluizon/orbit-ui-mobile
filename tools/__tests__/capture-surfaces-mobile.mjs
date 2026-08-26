import { existsSync, readFileSync } from "node:fs"
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

  // The protected-route signal mobile-capture.yml runs. It is a POSITIVE assertion by design: the
  // exit code cannot carry this claim, because a runtime Maestro failure is undifferentiated. These
  // pin the two halves that make the signal meaningful, so weakening either one goes red here.
  const protectedFlowPath = join(REPO_ROOT, ".maestro", "protected-route-redirect.yaml")
  T("the protected-route flow exists outside the capture surfaces directory", existsSync(protectedFlowPath))

  const protectedFlow = existsSync(protectedFlowPath) ? readFileSync(protectedFlowPath, "utf8") : ""
  T(
    "the protected-route flow asserts the LOGIN probe, never the protected one",
    protectedFlow.includes('id: "capture-route-login"') &&
      /assertNotVisible:[\s\S]*id: "capture-route-about"/.test(protectedFlow) &&
      !/assertVisible:\s*\n\s*id: "capture-route-about"/.test(protectedFlow),
    protectedFlow,
  )
  T(
    "the protected-route flow takes its deep link from the environment, not a hard-coded URL",
    protectedFlow.includes("${CAPTURE_LINK}") && !protectedFlow.includes("orbit://"),
    protectedFlow,
  )

  const aboutCell = manifest.cells.find(
    (cell) => cell.platform === "mobile" && cell.surfaceId === "m-route-about",
  )
  T(
    "the protected route is still in the manifest, so the workflow can build its deep link",
    Boolean(aboutCell) && buildCaptureDeepLink(aboutCell, "dark", "en").startsWith("orbit://"),
    JSON.stringify(aboutCell),
  )
}

export { captureSurfacesMobileCases as cases }
