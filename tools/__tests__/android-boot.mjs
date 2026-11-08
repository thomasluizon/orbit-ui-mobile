import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import yaml from "js-yaml"
import { fatalLogcat, firstScreenRendered, notRespondingProcess, notRespondingWaitControl } from "../android-boot.mjs"
import { BASH, REPO_ROOT, root, stage, T, toolPath } from "./_harness.mjs"

const packageName = "org.useorbit.app"
const labels = ["en", "pt-BR"].map((locale) => JSON.parse(readFileSync(join(REPO_ROOT, "packages/shared/src/i18n", `${locale}.json`), "utf8")).onboarding.flow.what.label)

function hierarchy(text, overrides = {}) {
  const attributes = {
    index: "0", text, "resource-id": "", class: "android.widget.TextView", package: packageName,
    "content-desc": "", checkable: "false", checked: "false", clickable: "false", enabled: "true",
    focusable: "false", focused: "false", scrollable: "false", "long-clickable": "false", password: "false",
    selected: "false", bounds: "[0,100][400,160]", "drawing-order": "1", hint: "", ...overrides,
  }
  return `<?xml version="1.0" encoding="UTF-8"?><hierarchy rotation="0"><node ${Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(" ")}/></hierarchy>`
}

// Accessibility XML from Android Startup run 41954728677, with its update dialog also removed.
// An Application Not Responding dialog stays on top until a tap lands inside its Wait control.
// The dialog opens once anr.after screen captures have shown the replayed screens (default 0).
// The focus line follows AOSP android15-release: DisplayContent.dump prints "  mCurrentFocus=" + WindowState.toString(),
// which is "Window{<hash> u<user> <title>}", and AppNotRespondingDialog titles its window "Application Not Responding: " + processName.
function replayBoot(name, screens, logcat = "I ReactNativeJS: Running application", anr = null) {
  const output = join(root, name)
  const launches = stage(`${name}/launches`, "")
  const taps = stage(`${name}/taps`, "")
  const preload = stage(`${name}/adb-replay.mjs`, `
    import childProcess from 'node:child_process'
    import timers from 'node:timers/promises'
    import { syncBuiltinESMExports } from 'node:module'
    import { appendFileSync } from 'node:fs'
    let elapsed = 0
    let captures = 0
    Date.now = () => elapsed
    timers.setTimeout = async (milliseconds) => { elapsed += milliseconds }
    const screens = ${JSON.stringify(screens)}
    const anr = ${JSON.stringify(anr)}
    const opensAt = anr?.after ?? [0]
    let dialogOpen = false
    let opened = 0
    childProcess.spawnSync = (command, args) => {
      if (command !== 'adb') throw new Error('unexpected command: ' + command)
      const invocation = args.join(' ')
      let stdout = ''
      if (invocation === 'shell getprop sys.boot_completed') stdout = '1'
      if (invocation === 'shell getprop ro.product.cpu.abilist') stdout = 'x86_64,arm64-v8a'
      if (invocation === 'shell cmd package list packages --user 0 -U org.useorbit.app') stdout = 'package:org.useorbit.app uid:10123'
      if (invocation === 'shell pidof -s org.useorbit.app') stdout = '1234'
      if (args[0] === 'logcat' && args[1] === '-d') stdout = ${JSON.stringify(logcat)}
      if (args[0] === 'exec-out') {
        if (anr && !dialogOpen && opened < opensAt.length && captures >= opensAt[opened]) { dialogOpen = true; opened++ }
        stdout = dialogOpen ? anr.dialog : screens[Math.min(captures++, screens.length - 1)]
      }
      if (invocation === 'shell dumpsys window displays') {
        stdout = 'WINDOW MANAGER DISPLAY CONTENTS (dumpsys window displays)\\n  mCurrentFocus=' +
          (dialogOpen ? 'Window{8c3a1f2 u0 Application Not Responding: ' + anr.process + '}' : 'Window{4d2e9b0 u0 org.useorbit.app/org.useorbit.app.MainActivity}') + '\\n'
      }
      if (args[0] === 'shell' && args[1] === 'input') {
        appendFileSync(${JSON.stringify(taps)}, invocation + '\\n')
        const [x, y] = [Number(args[3]), Number(args[4])]
        if (dialogOpen && args[2] === 'tap' && x > 16 && x < 304 && y > 355 && y < 403) dialogOpen = anr.reopens
      }
      if (invocation.startsWith('shell am start ')) appendFileSync(${JSON.stringify(launches)}, 'launch\\n')
      return { status: 0, stdout, stderr: '' }
    }
    syncBuiltinESMExports()
  `)
  const result = spawnSync(process.execPath, ["--import", preload, toolPath("android-boot.mjs"),
    "--apk", join(root, "universal.apk"), "--package", packageName, "--output", output], { encoding: "utf8", timeout: 10000 })
  const dismissals = join(output, "anr-dismissals.txt")
  return {
    ...result, verdict: readFileSync(join(output, "verdict.txt"), "utf8"), launches: readFileSync(launches, "utf8").trim().split("\n").length,
    taps: readFileSync(taps, "utf8").trim().split("\n").filter(Boolean), dismissals: existsSync(dismissals) ? readFileSync(dismissals, "utf8").trim().split("\n") : [],
  }
}

function checkRecordedStartup() {
  const screen = (name) => readFileSync(join(REPO_ROOT, "tools/__tests__/fixtures", `android-startup-${name}.xml`), "utf8")
  const onboarding = screen("onboarding")
  const blocked = screen("update-required")
  const ready = replayBoot("ready", [onboarding])
  T("android-boot: recorded onboarding survives despite the keyboard-clipped heading", ready.status === 0 && ready.verdict.trim() === "passed", ready.stderr)
  for (const [name, screens] of [["update", [blocked]], ["deferred-update", [onboarding, blocked]]]) {
    const result = replayBoot(name, screens)
    T(`android-boot: ${name} reports a build below the server minimum`, result.status === 1 && result.verdict.includes("build version is below the server minimum"), result.stderr)
    T(`android-boot: ${name} never retries the launch`, result.launches === 1)
  }
  const fatal = replayBoot("fatal", [onboarding], "E ReactNativeJS: Invariant Violation: Tried to register two views with the same name RNCSafeAreaProvider")
  T("android-boot: duplicate provider still fails before accepting onboarding", fatal.status === 1 && fatal.verdict.includes("fatal startup error") && fatal.launches === 1, fatal.stderr)
  checkApplicationNotResponding(onboarding)
}

// Accessibility XML from Android Release run 42077921045: a launcher ANR dialog covers the drawing app.
function checkApplicationNotResponding(onboarding) {
  const dialog = readFileSync(join(REPO_ROOT, "tools/__tests__/fixtures/android-startup-anr-dialog.xml"), "utf8")
  const wait = notRespondingWaitControl(dialog)
  T("android-boot: finds the recorded dialog's Wait control centre", wait?.x === 160 && wait?.y === 379, JSON.stringify(wait))
  T("android-boot: the first screen has no ANR Wait control", notRespondingWaitControl(onboarding) === null)
  T("android-boot: a disabled Wait control is not tapped", notRespondingWaitControl(dialog.replace(/(resource-id="android:id\/aerr_wait"[^>]*?)enabled="true"/, '$1enabled="false"')) === null)
  T("android-boot: an app node named like the Wait control is not tapped", notRespondingWaitControl(hierarchy("Wait", { "resource-id": "android:id/aerr_wait" })) === null)
  for (const [name, dump, expected] of [
    ["another process", "  mCurrentFocus=Window{8c3a1f2 u0 Application Not Responding: com.google.android.apps.nexuslauncher}", "com.google.android.apps.nexuslauncher"],
    ["an exiting dialog", "  mCurrentFocus=Window{8c3a1f2 u0 Application Not Responding: org.useorbit.app EXITING}", "org.useorbit.app"],
    ["the app activity", "  mCurrentFocus=Window{4d2e9b0 u0 org.useorbit.app/org.useorbit.app.MainActivity}", null],
    ["no focus", "  mCurrentFocus=null", null],
    ["the focused app line", "  mFocusedApp=ActivityRecord{1 u0 Application Not Responding: com.example t1}", null],
  ]) T(`android-boot: focus process for ${name}`, notRespondingProcess(`WINDOW MANAGER DISPLAY CONTENTS (dumpsys window displays)\n${dump}\n`) === expected)
  const launcher = replayBoot("anr-launcher", [onboarding], undefined, { process: "com.google.android.apps.nexuslauncher", dialog, reopens: false })
  T("android-boot: another process's ANR dialog is dismissed and the first screen passes", launcher.status === 0 && launcher.verdict.trim() === "passed", launcher.verdict + launcher.stderr)
  T("android-boot: the dismissal taps the dialog's own Wait control once", launcher.taps.length === 1 && launcher.taps[0] === "shell input tap 160 379", launcher.taps.join("|"))
  T("android-boot: the dismissal is recorded in the evidence", launcher.dismissals.length === 1 && launcher.dismissals[0].includes("Application Not Responding: com.google.android.apps.nexuslauncher"), launcher.dismissals.join("|"))
  T("android-boot: a dismissed ANR dialog never retries the launch", launcher.launches === 1)
  const own = replayBoot("anr-own", [onboarding], undefined, { process: packageName, dialog, reopens: false })
  T("android-boot: the app's own ANR dialog fails with its own verdict", own.status === 1 && own.verdict.trim() === "app is not responding before its first screen", own.verdict + own.stderr)
  T("android-boot: the app's own ANR dialog is never dismissed", own.taps.length === 0 && own.dismissals.length === 0, own.taps.join("|"))
  const secondary = replayBoot("anr-own-process", [onboarding], undefined, { process: `${packageName}:background`, dialog, reopens: false })
  T("android-boot: an ANR dialog for another app process fails as the app", secondary.status === 1 && secondary.verdict.trim() === "app is not responding before its first screen" && secondary.taps.length === 0, secondary.verdict)
  const persistent = replayBoot("anr-persistent", [onboarding], undefined, { process: "com.google.android.apps.nexuslauncher", dialog, reopens: true })
  T("android-boot: a returning ANR dialog keeps the 90 second deadline", persistent.status === 1 && persistent.verdict.trim() === "signed-out first screen did not render within 90 seconds", persistent.verdict)
  T("android-boot: each returning ANR dialog dismissal is recorded", persistent.dismissals.length > 1 && persistent.dismissals.length === persistent.taps.length && persistent.launches === 1, `${persistent.dismissals.length}/${persistent.taps.length}`)
  checkSettledNotResponding(onboarding, dialog)
}

// Android Release run 42427948957: the first screen rendered, then the settled capture was this launcher ANR dialog.
function checkSettledNotResponding(onboarding, dialog) {
  const settled = replayBoot("anr-settled-launcher", [onboarding], undefined, { process: "com.google.android.apps.nexuslauncher", dialog, reopens: false, after: [1] })
  T("android-boot: another process's ANR dialog after the first screen is dismissed and the settled screen passes", settled.status === 0 && settled.verdict.trim() === "passed", settled.verdict + settled.stderr)
  T("android-boot: the settled dismissal taps the dialog's own Wait control once", settled.taps.length === 1 && settled.taps[0] === "shell input tap 160 379", settled.taps.join("|"))
  T("android-boot: the settled dismissal is recorded with its dialog", settled.dismissals.length === 1 && settled.dismissals[0].includes("Application Not Responding: com.google.android.apps.nexuslauncher") &&
    readFileSync(join(root, "anr-settled-launcher", "anr-dialog-1.xml"), "utf8") === dialog, settled.dismissals.join("|"))
  T("android-boot: a settled dismissal never retries the launch", settled.launches === 1)
  const both = replayBoot("anr-settled-twice", [onboarding], undefined, { process: "com.google.android.apps.nexuslauncher", dialog, reopens: false, after: [0, 1] })
  T("android-boot: a dialog dismissed before the first screen and again after it passes", both.status === 0 && both.verdict.trim() === "passed", both.verdict + both.stderr)
  T("android-boot: both dismissals tap Wait and keep their own dialog evidence", both.taps.length === 2 && both.dismissals.length === 2 &&
    ["anr-dialog-1.xml", "anr-dialog-2.xml"].every((file) => existsSync(join(root, "anr-settled-twice", file))), `${both.taps.length}/${both.dismissals.length}`)
  const own = replayBoot("anr-settled-own", [onboarding], undefined, { process: packageName, dialog, reopens: false, after: [1] })
  T("android-boot: the app's own ANR dialog after the first screen fails as the app", own.status === 1 && own.verdict.trim() === "app is not responding after its first screen" && own.taps.length === 0 && own.dismissals.length === 0, own.verdict + own.taps.join("|"))
  const persistent = replayBoot("anr-settled-persistent", [onboarding], undefined, { process: "com.google.android.apps.nexuslauncher", dialog, reopens: true, after: [1] })
  T("android-boot: a returning ANR dialog after the first screen keeps a bounded settle deadline", persistent.status === 1 && persistent.verdict.trim() === "signed-out first screen unavailable after settling" &&
    persistent.dismissals.length > 1 && persistent.dismissals.length === persistent.taps.length, `${persistent.verdict.trim()} ${persistent.dismissals.length}/${persistent.taps.length}`)
}

function checkProofVersion(startup) {
  const steps = startup.jobs.boot.steps
  const index = steps.findIndex((step) => step.name === "Select the last successful production app version")
  T("android-startup: selects an accepted version before prebuild", index >= 0 && index < steps.findIndex((step) => step.name === "Prepare a build without Play credentials"))
  if (index < 0) return
  // Complete gh --json displayTitle response shape, observed from successful main release runs.
  const runs = [
    { displayTitle: "Android Release 1.3.139 (199) to internal on main" },
    { displayTitle: "Android Release 1.3.138 (198) to open on main" },
    { displayTitle: "Android Release 1.3.137 (197) to open on main" },
  ]
  for (const [name, response, status, expected] of [
    ["released", runs, 0, "1.3.138"], ["production", [{ displayTitle: "Android Release 1.3.137 (197) to production on main" }], 0, "1.3.137"],
    ["missing", [], 0, null], ["internal-only", runs.slice(0, 1), 0, null],
    ["unrecognized", [{ displayTitle: "Unrecognized release title" }], 0, null], ["unavailable", [], 1, null],
  ]) {
    const environment = stage(`proof-version/${name}`, "")
    const result = spawnSync(BASH, ["-c", `gh() { printf '%s' "$RELEASE_RUNS"; return "$GH_STATUS"; }\n${steps[index].run}`], {
      encoding: "utf8", env: { ...process.env, RELEASE_RUNS: JSON.stringify(response), GH_STATUS: String(status), GH_REPO: "fixture/repository", GITHUB_ENV: environment },
    })
    const exported = readFileSync(environment, "utf8")
    T(`android-startup: proof version ${name}`, expected ? result.status === 0 && exported.trim() === `ORBIT_APP_VERSION=${expected}` : result.status !== 0 && exported === "", result.stdout + result.stderr)
    if (expected) {
      const config = spawnSync(process.execPath, ["-e", `process.stdout.write(require('./apps/mobile/app.config.js')().version)`], {
        cwd: REPO_ROOT, encoding: "utf8", env: { ...process.env, ORBIT_APP_VERSION: exported.trim().split("=")[1] },
      })
      T("android-startup: the selected version reaches the actual Expo configuration", config.status === 0 && config.stdout === expected, config.stderr)
    }
  }
}

export const cases = () => {
  for (const label of labels) T("android-boot: accepts the actual first route input label in each locale", firstScreenRendered(hierarchy(label), packageName, labels))
  T("android-boot: accepts an accessibility description", firstScreenRendered(hierarchy("", { "content-desc": labels[0] }), packageName, labels))
  T("android-boot: rejects the splash logo", !firstScreenRendered(hierarchy("Orbit"), packageName, labels))
  T("android-boot: rejects another package's matching title", !firstScreenRendered(hierarchy(labels[0], { package: "com.android.launcher3" }), packageName, labels))
  T("android-boot: rejects zero-area nodes", !firstScreenRendered(hierarchy(labels[0], { bounds: "[0,0][0,0]" }), packageName, labels))
  T("android-boot: rejects disabled nodes", !firstScreenRendered(hierarchy(labels[0], { enabled: "false" }), packageName, labels))
  let malformedRejected = false
  try { firstScreenRendered("<hierarchy><node>", packageName, labels) } catch { malformedRejected = true }
  T("android-boot: rejects incomplete XML", malformedRejected)
  for (const failure of [
    "E AndroidRuntime: FATAL EXCEPTION: mqt_native_modules",
    "E ReactNativeJS: Invariant Violation: Tried to register two views with the same name RNCSafeAreaProvider",
    'W unknown:BridgelessReact: ReactHost{0}.handleHostException(message = "Error: top-level module failed")',
    "F ReactNativeJS: fatal JavaScript runtime error",
    "F libc: Fatal signal 11 (SIGSEGV)",
  ]) T(`android-boot: rejects ${failure}`, fatalLogcat(failure))
  T("android-boot: accepts normal startup logs", !fatalLogcat("I ReactNativeJS: Running application\nI ReactNative: Application context initialized"))
  T("android-boot: accepts the recorded handled console error after a surviving first screen", !fatalLogcat(readFileSync(join(REPO_ROOT, "tools/__tests__/fixtures/android-startup-console-error.txt"), "utf8")))

  const workflow = yaml.load(readFileSync(join(REPO_ROOT, ".github/workflows/android-release.yml"), "utf8"))
  const steps = workflow.jobs["release-android"].steps
  const bootIndex = steps.findIndex((step) => step.uses === "./.github/actions/android-boot")
  const uploadIndex = steps.findIndex((step) => step.name === "Submit build to Google Play")
  T("android-release: boot gate must run before Play upload", bootIndex >= 0 && bootIndex < uploadIndex)
  if (bootIndex >= 0) {
    T("android-release: the checked and uploaded AAB are identical", steps[bootIndex].with.aab === steps[uploadIndex].with.releaseFiles)
    T("android-release: boot assertions cannot be skipped or ignored", !steps[bootIndex].if && !steps[bootIndex]["continue-on-error"])
  }
  const startup = yaml.load(readFileSync(join(REPO_ROOT, ".github/workflows/android-startup.yml"), "utf8"))
  checkRecordedStartup()
  checkProofVersion(startup)
  const architectureFlag = "-PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86_64"
  for (const buildSteps of [steps, startup.jobs.boot.steps]) {
    const build = buildSteps.find((step) => /\.\/gradlew\b.*\bbundleRelease\b/.test(step.run ?? ""))
    T("android-startup: shipping and proof AABs include the native emulator slice", build?.run.includes(architectureFlag))
  }
  const apiSource = readFileSync(join(REPO_ROOT, "apps/mobile/lib/api-base.ts"), "utf8")
  const apiModule = `data:text/javascript,${encodeURIComponent(apiSource)}`
  for (const job of ["bundle", "boot"]) {
    const environment = startup.jobs[job].env ?? {}
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `const module = await import(${JSON.stringify(apiModule)}); process.stdout.write(module.API_BASE)`], {
      encoding: "utf8", env: { ...process.env, NODE_ENV: "production", EXPO_PUBLIC_API_BASE: environment.EXPO_PUBLIC_API_BASE ?? "" },
    })
    T(`android-startup: ${job} supplies production startup configuration`, result.status === 0 && result.stdout === "https://api.useorbit.org", result.stderr)
  }
  const configurationDirectory = join(root, "android-boot-firebase")
  mkdirSync(configurationDirectory, { recursive: true })
  const configurationStep = startup.jobs.boot.steps.find((step) => step.name === "Prepare a build without Play credentials")
  const generated = spawnSync(BASH, ["-c", configurationStep.run.split("\n")[0]], { cwd: configurationDirectory, encoding: "utf8" })
  T("android-startup: generates the actual proof Firebase configuration", generated.status === 0, generated.stderr)
  const configuration = JSON.parse(readFileSync(join(configurationDirectory, "google-services.json"), "utf8"))
  T("android-startup: the disposable key satisfies Firebase runtime validation", /^A[\w-]{38}$/.test(configuration.client[0].api_key[0].current_key))
}
