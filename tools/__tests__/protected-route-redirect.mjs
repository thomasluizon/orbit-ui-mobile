import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import yaml from "js-yaml"

import { REPO_ROOT, T } from "./_harness.mjs"

const protectedRouteRedirectCases = () => {
  const protectedFlowPath = join(REPO_ROOT, ".maestro", "protected-route-redirect.yaml")
  T("the protected-route flow exists outside the deleted capture surfaces directory", existsSync(protectedFlowPath))

  const documents = yaml.loadAll(existsSync(protectedFlowPath) ? readFileSync(protectedFlowPath, "utf8") : "")
  const commands = documents[1]
  T("the protected-route flow has an active command list", Array.isArray(commands), JSON.stringify(documents))
  if (!Array.isArray(commands)) return
  const detail = JSON.stringify(commands)
  T(
    "the protected-route flow runs without taking a screenshot",
    !commands.some((command) => command && Object.hasOwn(command, "takeScreenshot")),
    detail,
  )
  T(
    "the protected-route flow opens the app through its cold-start deep link",
    typeof commands[0]?.openLink === "string",
    detail,
  )
  T(
    "the protected-route flow actively asserts the LOGIN probe visible",
    commands.some((command) => command?.assertVisible?.id === "capture-route-login"),
    detail,
  )
  T(
    "the protected-route flow actively asserts the request probe visible",
    commands.some((command) => command?.assertVisible?.id === "capture-request-m-route-about"),
    detail,
  )
  T(
    "the protected-route flow actively asserts the protected probe not visible",
    commands.some((command) => command?.assertNotVisible?.id === "capture-route-about") &&
      !commands.some((command) => command?.assertVisible?.id === "capture-route-about"),
    detail,
  )
  T(
    "the protected-route flow takes its deep link from the environment, not a hard-coded URL",
    commands[0]?.openLink === "${CAPTURE_LINK}" &&
      commands.every((command) => !command?.openLink || command.openLink === "${CAPTURE_LINK}"),
    detail,
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
