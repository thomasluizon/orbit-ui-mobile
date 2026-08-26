import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  buildCaptureDeepLink,
  maestroEnvironmentArguments,
  mobileUnreachableReason,
  planMobileCaptures,
  processInvocation,
  summarizeCommandOutput,
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

  T(
    "Maestro flow variables are injected through its CLI environment map",
    JSON.stringify(maestroEnvironmentArguments({
      CAPTURE_LINK: "orbit://login?captureTheme=dark&captureLocale=pt-BR",
      CAPTURE_PATH: "m-route-login--default--dark--pt-BR",
    })) === JSON.stringify([
      "-e", "CAPTURE_LINK=orbit://login?captureTheme=dark&captureLocale=pt-BR",
      "-e", "CAPTURE_PATH=m-route-login--default--dark--pt-BR",
    ]),
  )

  const windowsDeepLink = "orbit://login?captureTheme=dark&captureLocale=pt-BR"
  const windowsFlowPath = "C:\\captures\\100%!ready\\flow.yaml"
  const windowsInvocation = processInvocation(
    "C:\\Program Files\\Maestro\\maestro.cmd",
    ["test", "-e", `CAPTURE_LINK=${windowsDeepLink}`, windowsFlowPath],
    { platform: "win32", powerShell: "powershell.exe" },
  )
  T(
    "Windows batch launch carries the complete deep link outside cmd.exe parsing",
    windowsInvocation.command === "powershell.exe" &&
      windowsInvocation.args.includes("-EncodedCommand") &&
      JSON.parse(windowsInvocation.env.ORBIT_MOBILE_CAPTURE_ARGUMENTS)[2] ===
        `"CAPTURE_LINK=${windowsDeepLink}"` &&
      JSON.parse(windowsInvocation.env.ORBIT_MOBILE_CAPTURE_ARGUMENTS)[3] === `"${windowsFlowPath}"`,
    JSON.stringify(windowsInvocation),
  )

  if (process.platform === "win32") {
    const batchProbe = join(root, "mobile-capture-argv-probe.cmd")
    // Keep the expansion quoted inside the probe too. An unquoted `%~3` would let cmd.exe parse the
    // successfully delivered ampersand a second time while executing the diagnostic echo itself.
    writeFileSync(batchProbe, "@echo off\r\necho [\"%~3\"]\r\necho [\"%~4\"]\r\n")
    const probeInvocation = processInvocation(
      batchProbe,
      ["test", "-e", `CAPTURE_LINK=${windowsDeepLink}`, windowsFlowPath],
    )
    const probe = spawnSync(probeInvocation.command, probeInvocation.args, {
      encoding: "utf8",
      env: { ...process.env, ...probeInvocation.env },
      shell: false,
    })
    T(
      "the real Windows command processor preserves ampersands, percent signs, and exclamation marks",
      probe.status === 0 &&
        probe.stdout.trim() === `["CAPTURE_LINK=${windowsDeepLink}"]\r\n["${windowsFlowPath}"]`,
      JSON.stringify({ status: probe.status, stdout: probe.stdout, stderr: probe.stderr }),
    )
  }

  const diagnostic = `root cause\n${"x".repeat(100)}\nstack tail`
  const summarizedDiagnostic = summarizeCommandOutput(diagnostic, 40)
  T(
    "failed driver diagnostics preserve both the root cause and stack tail",
    summarizedDiagnostic.startsWith("root cause") &&
      summarizedDiagnostic.endsWith("stack tail") &&
      summarizedDiagnostic.includes("characters omitted"),
    summarizedDiagnostic,
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
