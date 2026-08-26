import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  buildCaptureDeepLink,
  maestroExecutable,
  maestroEnvironmentArguments,
  mobileUnreachableReason,
  planMobileCaptures,
  processInvocation,
  resolveWindowsPathCommand,
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
  const windowsFlowPath = "C:\\captures\\%TEMP%!pronto\\João\\flow.yaml"
  const windowsInvocation = processInvocation(
    "C:\\Program Files\\Maestro\\maestro.cmd",
    ["test", "-e", `CAPTURE_LINK=${windowsDeepLink}`, windowsFlowPath],
    {
      platform: "win32",
      commandProcessor: "cmd.exe",
      wrapperPath: "C:\\Temp\\orbit mobile capture\\invoke.cmd",
    },
  )
  T(
    "Windows batch launch keeps values in the Unicode process environment and emits ASCII-only source",
    windowsInvocation.command === "cmd.exe" &&
      windowsInvocation.spawnOptions.windowsVerbatimArguments === true &&
      windowsInvocation.env.ORBIT_MOBILE_CAPTURE_ARGUMENT_2 === `CAPTURE_LINK=${windowsDeepLink}` &&
      windowsInvocation.env.ORBIT_MOBILE_CAPTURE_ARGUMENT_3 === windowsFlowPath &&
      windowsInvocation.wrapperSource.includes('"%ORBIT_MOBILE_CAPTURE_ARGUMENT_3%"') &&
      Buffer.from(windowsInvocation.wrapperSource, "ascii").toString("ascii") === windowsInvocation.wrapperSource,
    JSON.stringify(windowsInvocation),
  )

  if (process.platform === "win32") {
    const probeDirectory = join(root, "João-%TEMP%!probe")
    mkdirSync(probeDirectory, { recursive: true })
    const batchProbe = join(probeDirectory, "mobile-capture-argv-probe.cmd")
    const nodeProbe = join(probeDirectory, "mobile-capture-argv-probe.mjs")
    const probeOutput = join(probeDirectory, "mobile-capture-argv-probe.json")
    const wrapperPath = join(root, "mobile capture wrapper.cmd")
    // Keep the expansion quoted inside the probe too. An unquoted `%~3` would let cmd.exe parse the
    // successfully delivered ampersand a second time. The Node probe writes explicitly as UTF-8 so
    // the assertion does not depend on cmd.exe's active OEM output code page.
    writeFileSync(batchProbe, '@echo off\r\nnode "%~dp0mobile-capture-argv-probe.mjs" "%~3" "%~4"\r\n')
    writeFileSync(
      nodeProbe,
      'import { writeFileSync } from "node:fs"\nwriteFileSync(process.env.ORBIT_CAPTURE_PROBE_OUTPUT, JSON.stringify(process.argv.slice(2)), "utf8")\n',
    )
    const probeInvocation = processInvocation(
      batchProbe,
      ["test", "-e", `CAPTURE_LINK=${windowsDeepLink}`, windowsFlowPath],
      { wrapperPath },
    )
    writeFileSync(wrapperPath, probeInvocation.wrapperSource)
    const probe = spawnSync(probeInvocation.command, probeInvocation.args, {
      encoding: "utf8",
      env: { ...process.env, ...probeInvocation.env, ORBIT_CAPTURE_PROBE_OUTPUT: probeOutput },
      shell: false,
      ...probeInvocation.spawnOptions,
    })
    const probeArguments = probe.status === 0 ? JSON.parse(readFileSync(probeOutput, "utf8")) : null
    T(
      "the real Windows command processor preserves Unicode, ampersands, percent signs, and exclamation marks",
      probe.status === 0 &&
        JSON.stringify(probeArguments) === JSON.stringify([`CAPTURE_LINK=${windowsDeepLink}`, windowsFlowPath]),
      JSON.stringify({ status: probe.status, arguments: probeArguments, stdout: probe.stdout, stderr: probe.stderr }),
    )

    const failingBatch = join(root, "mobile-capture-exit-probe.cmd")
    const failingWrapper = join(root, "mobile capture exit wrapper.cmd")
    writeFileSync(failingBatch, "@echo off\r\nexit /b 7\r\n")
    const failingInvocation = processInvocation(failingBatch, [], { wrapperPath: failingWrapper })
    writeFileSync(failingWrapper, failingInvocation.wrapperSource)
    const failingProbe = spawnSync(failingInvocation.command, failingInvocation.args, {
      encoding: "utf8",
      env: { ...process.env, ...failingInvocation.env },
      shell: false,
      ...failingInvocation.spawnOptions,
    })
    T(
      "the real Windows command processor preserves the wrapped batch exit code",
      failingProbe.status === 7,
      JSON.stringify({ status: failingProbe.status, stdout: failingProbe.stdout, stderr: failingProbe.stderr }),
    )
  }

  const pathDirectory = join(root, "maestro-path-bin")
  const pathMaestro = join(pathDirectory, "maestro.CMD")
  mkdirSync(pathDirectory, { recursive: true })
  writeFileSync(pathMaestro, "@echo off\r\n")
  T(
    "Windows PATH resolution finds a command extension before shell-free spawning",
    resolveWindowsPathCommand("maestro", {
      pathValue: `C:\\missing;"${pathDirectory}"`,
      pathExtensions: ".EXE;.CMD",
    }) === pathMaestro &&
      maestroExecutable({
        env: { PATH: pathDirectory, PATHEXT: ".EXE;.CMD" },
        platform: "win32",
        homeDirectory: join(root, "missing-home"),
      }) === pathMaestro,
  )

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
