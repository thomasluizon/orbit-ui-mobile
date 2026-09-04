import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, T } from "./_harness.mjs"

const protectedRouteRedirectCases = () => {
  const protectedFlowPath = join(REPO_ROOT, ".maestro", "protected-route-redirect.yaml")
  T("the protected-route flow exists outside the deleted capture surfaces directory", existsSync(protectedFlowPath))

  const protectedFlow = existsSync(protectedFlowPath) ? readFileSync(protectedFlowPath, "utf8") : ""
  T(
    "the protected-route flow asserts the LOGIN probe, never the protected one",
    protectedFlow.includes('id: "capture-route-login"') &&
      protectedFlow.includes('id: "capture-request-m-route-about"') &&
      /assertNotVisible:[\s\S]*id: "capture-route-about"/.test(protectedFlow) &&
      !/assertVisible:\s*\n\s*id: "capture-route-about"/.test(protectedFlow),
    protectedFlow,
  )
  T(
    "the protected-route flow takes its deep link from the environment, not a hard-coded URL",
    protectedFlow.includes("${CAPTURE_LINK}") && !protectedFlow.includes("orbit://"),
    protectedFlow,
  )

  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, ".claude", "manifests", "surfaces.json"), "utf8"))
  const toolsReadme = readFileSync(join(REPO_ROOT, "tools", "README.md"), "utf8")
  const aboutCell = manifest.cells.find(
    (cell) => cell.platform === "mobile" && cell.surfaceId === "m-route-about",
  )
  const documentedShape =
    "orbit://<path>?captureTheme=<light|dark>&captureLocale=<en|pt-BR>&captureSurface=<surfaceId>"
  const aboutDeepLink = aboutCell
    ? `orbit://${aboutCell.href.replace(/^\/+/, "")}?captureTheme=dark&captureLocale=en&captureSurface=${aboutCell.surfaceId}`
    : ""
  T(
    "the protected route remains in the manifest under the documented deep-link shape",
    Boolean(aboutCell) &&
      toolsReadme.includes(`The deep link is \`${documentedShape}\``) &&
      aboutDeepLink === "orbit://about?captureTheme=dark&captureLocale=en&captureSurface=m-route-about",
    JSON.stringify({ aboutCell, aboutDeepLink, documentedShape }),
  )
}

export { protectedRouteRedirectCases as cases }
