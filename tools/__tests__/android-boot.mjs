import { mkdirSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import yaml from "js-yaml"
import { fatalLogcat, firstScreenRendered } from "../android-boot.mjs"
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
function replayBoot(name, screens, logcat = "I ReactNativeJS: Running application") {
  const output = join(root, name)
  const launches = stage(`${name}/launches`, "")
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
    childProcess.spawnSync = (command, args) => {
      if (command !== 'adb') throw new Error('unexpected command: ' + command)
      const invocation = args.join(' ')
      let stdout = ''
      if (invocation === 'shell getprop sys.boot_completed') stdout = '1'
      if (invocation === 'shell getprop ro.product.cpu.abilist') stdout = 'x86_64,arm64-v8a'
      if (invocation === 'shell cmd package list packages --user 0 -U org.useorbit.app') stdout = 'package:org.useorbit.app uid:10123'
      if (invocation === 'shell pidof -s org.useorbit.app') stdout = '1234'
      if (args[0] === 'logcat' && args[1] === '-d') stdout = ${JSON.stringify(logcat)}
      if (args[0] === 'exec-out') stdout = screens[Math.min(captures++, screens.length - 1)]
      if (invocation.startsWith('shell am start ')) appendFileSync(${JSON.stringify(launches)}, 'launch\\n')
      return { status: 0, stdout, stderr: '' }
    }
    syncBuiltinESMExports()
  `)
  const result = spawnSync(process.execPath, ["--import", preload, toolPath("android-boot.mjs"),
    "--apk", join(root, "universal.apk"), "--package", packageName, "--output", output], { encoding: "utf8", timeout: 10000 })
  return { ...result, verdict: readFileSync(join(output, "verdict.txt"), "utf8"), launches: readFileSync(launches, "utf8").trim().split("\n").length }
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
