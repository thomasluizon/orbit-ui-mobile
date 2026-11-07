import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, root, toolPath, check } from "./_harness.mjs"

const phoneIdentifier = "00000000-0000-0000-0000-000000000001"
const secondIdentifier = "00000000-0000-0000-0000-000000000002"
const deployments = JSON.parse(readFileSync(toolPath("__fixtures__/ios-staging-deployment.json"), "utf8"))
const releaseVersion = deployments[0].payload.app_version
const buildVariableNames = [
  "EXPO_PUBLIC_TURNSTILE_SITE_KEY", "EXPO_PUBLIC_APP_STORE_MONTHLY_PRODUCT_ID", "EXPO_PUBLIC_APP_STORE_YEARLY_PRODUCT_ID",
  "EXPO_PUBLIC_APPLE_CLIENT_ID", "EXPO_PUBLIC_GOOGLE_CLIENT_ID", "EXPO_PUBLIC_SENTRY_DSN", "EXPO_PUBLIC_POSTHOG_KEY",
  "ORBIT_IOS_APP_STORE_ID",
]
const stagingVariables = [
  { name: "EXPO_PUBLIC_TURNSTILE_SITE_KEY", value: "sentinel-turnstile-environment" },
  { name: "EXPO_PUBLIC_APP_STORE_MONTHLY_PRODUCT_ID", value: "sentinel-monthly-environment" },
  { name: "EXPO_PUBLIC_APP_STORE_YEARLY_PRODUCT_ID", value: "sentinel-yearly-environment" },
  { name: "ORBIT_IOS_APP_STORE_ID", value: "900000001" },
  { name: "ORBIT_APPLE_TEAM_ID", value: "sentinel-team-environment" },
]
const repositoryVariables = [
  { name: "EXPO_PUBLIC_TURNSTILE_SITE_KEY", value: "sentinel-turnstile-repository" },
  { name: "EXPO_PUBLIC_GOOGLE_CLIENT_ID", value: "sentinel-google-repository" },
  { name: "EXPO_PUBLIC_SENTRY_DSN", value: "sentinel-sentry-repository" },
  { name: "STAGING_EXPO_PUBLIC_POSTHOG_KEY", value: "sentinel-posthog-staging" },
  { name: "PRODUCTION_EXPO_PUBLIC_POSTHOG_KEY", value: "sentinel-posthog-production" },
]
const phone = (udid, state) => ({
  dataPath: "<simulator data path>", dataPathSize: 18337792, logPath: "<simulator log path>",
  udid, isAvailable: true, deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-Duo",
  state, name: "iPhone Duo",
})

function exercise(label, scenario = {}, argumentsList = [], callerEnvironment = {}) {
  const checkout = join(root, "ios-simulator", label)
  mkdirSync(join(checkout, "tools"), { recursive: true })
  mkdirSync(join(checkout, "apps", "mobile"), { recursive: true })
  for (const file of ["app.json", "app.config.js"]) {
    cpSync(toolPath(`../apps/mobile/${file}`), join(checkout, "apps", "mobile", file))
  }
  mkdirSync(join(checkout, "node_modules", "expo", "bin"), { recursive: true })
  mkdirSync(join(checkout, "Xcode", "Developer", "usr", "bin"), { recursive: true })
  mkdirSync(join(checkout, "Xcode", "Applications", "DeviceHub.app"), { recursive: true })
  writeFileSync(join(checkout, "node_modules", "expo", "bin", "cli"), "")
  writeFileSync(join(checkout, "Xcode", "Developer", "usr", "bin", "xcodebuild"), "")
  cpSync(toolPath("ios-simulator.mjs"), join(checkout, "tools", "ios-simulator.mjs"))
  const callsPath = join(checkout, "calls.jsonl")
  const preload = join(checkout, "preload.cjs")
  writeFileSync(preload, `
const { appendFileSync, readFileSync } = require("node:fs")
const { syncBuiltinESMExports } = require("node:module")
const originalSpawnSync = require("node:child_process").spawnSync
const scenario = ${JSON.stringify(scenario)}
const deployments = ${JSON.stringify(deployments)}
const phones = ${JSON.stringify([phone(phoneIdentifier, "Shutdown"), phone(secondIdentifier, "Booted")])}
let nativeVersion
Object.defineProperty(process, "platform", { value: "darwin" })
process.kill = () => { if (scenario.dead) throw new Error("No such process"); return true }
require("node:timers/promises").setTimeout = async () => {}
require("node:child_process").spawnSync = (command, args, options) => {
  appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({ command, args, cwd: options.cwd,
    environment: Object.fromEntries(["DEVELOPER_DIR", "ORBIT_APP_VARIANT", "EXPO_PUBLIC_SENTRY_ENVIRONMENT", "EXPO_PUBLIC_API_BASE", "SENTRY_DISABLE_AUTO_UPLOAD", "CI", "ORBIT_APPLE_TEAM_ID", ...${JSON.stringify(buildVariableNames)}].map(key => [key, options.env[key]])) }) + "\\n")
  const joined = args.join(" ")
  if (command === "gh" && args[0] === "variable") {
    if (scenario.variablesFail) return { status: 1, stdout: "", stderr: "HTTP 404: Not Found" }
    if (scenario.variablesBadJson) return { status: 0, stdout: "not json sentinel-unparsed-value", stderr: "" }
    const scoped = args.includes("--env")
    return { status: 0, stdout: JSON.stringify(scoped ? scenario.stagingVariables ?? ${JSON.stringify(stagingVariables)} : scenario.repositoryVariables ?? ${JSON.stringify(repositoryVariables)}), stderr: "" }
  }
  if (command === "gh") {
    if (scenario.noGh) return { status: null, error: new Error("spawnSync gh ENOENT"), stdout: "", stderr: "" }
    if (scenario.noAuth) return { status: 4, stdout: "", stderr: "not signed in" }
    return { status: 0, stdout: scenario.badJson ? "invalid JSON" : JSON.stringify(scenario.deployments ?? deployments), stderr: "" }
  }
  if (joined.includes("prebuild") || args.includes("-workspace")) {
    const configured = originalSpawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(require('./app.config.js')()))"], {
      ...options, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    })
    if (configured.status !== 0) return configured
    const config = JSON.parse(configured.stdout)
    nativeVersion = config.version
    const phase = joined.includes("prebuild") ? "prebuild" : "native-build"
    appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({ phase, version: config.version }) + "\\n")
    if (scenario.cancelPhase === phase) {
      return originalSpawnSync(process.execPath, ["-e", "process.kill(process.ppid, process.argv[1])", scenario.signal], options)
    }
  }
  if (args.includes("-arch") && args.includes("-destination")) return { status: 70, stdout: "", stderr: "xcodebuild: error: destination implies architecture, architecture must not also be specified." }
  if (scenario.fail && joined.includes(scenario.fail)) return { status: 1, stdout: "", stderr: "operation failed" }
  let stdout = ""
  if (joined === "simctl list devices -j") stdout = JSON.stringify({ devices: { "com.apple.CoreSimulator.SimRuntime.iOS-27-1": scenario.noPhones ? [] : phones } })
  if (joined.includes("get_app_container")) stdout = ${JSON.stringify(join(checkout, "installed.app"))}
  if (command.endsWith("PlistBuddy")) stdout = joined.includes("CFBundleIdentifier")
    ? (scenario.wrongBundle ? "org.useorbit.app" : "org.useorbit.app.staging")
    : joined.includes("CFBundleShortVersionString") ? (scenario.staleVersion ? "1.1.4" : nativeVersion) : "1"
  if (joined.includes("simctl launch")) stdout = scenario.badLaunch ? "unrecognized reply" : "org.useorbit.app.staging: 81018"
  return { status: 0, stdout, stderr: "" }
}
syncBuiltinESMExports()
`)
  const result = spawnSync(process.execPath, ["--require", preload, join(checkout, "tools", "ios-simulator.mjs"), ...argumentsList], {
    cwd: root, encoding: "utf8", timeout: 20000,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !buildVariableNames.includes(key) && key !== "ORBIT_APPLE_TEAM_ID")),
      DEVELOPER_DIR: join(checkout, "Xcode", "Developer"), ORBIT_APP_VARIANT: "production", EXPO_PUBLIC_API_BASE: "https://invalid.example",
      ...callerEnvironment,
    },
  })
  const entries = existsSync(callsPath) ? readFileSync(callsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : []
  return { ...result, calls: entries.filter((entry) => entry.command), phases: entries.filter((entry) => entry.phase), checkout }
}

export function cases() {
  check("ios-simulator.mjs", "rejects missing device", ["--device"], { status: 2 })
  check("ios-simulator.mjs", "rejects invalid device", ["--device", "booted"], { status: 2 })
  check("ios-simulator.mjs", "rejects duplicate device", ["--device", phoneIdentifier, "--device", secondIdentifier], { status: 2 })

  const successful = exercise("success")
  T("ios-simulator: completes a build from another cwd", successful.status === 0, successful.stderr)
  const report = successful.status === 0 ? JSON.parse(successful.stdout) : {}
  T("ios-simulator: prefers the booted iPhone and reports installed version and liveness",
    report.udid === secondIdentifier && report.bundleIdentifier === "org.useorbit.app.staging" && report.version === releaseVersion && report.buildNumber === "1" && report.alive === true && report.pid === 81018)
  T("ios-simulator: resolves the newest staging Android deployment",
    successful.calls.some((call) => call.command === "gh" && call.args.join(" ") ===
      "api repos/thomasluizon/orbit-ui-mobile/deployments?task=android-release&environment=staging&per_page=1"))
  T("ios-simulator: stamps the release version through the real Expo config for prebuild and bundling",
    successful.phases.length === 2 && successful.phases.every((phase) => phase.version === releaseVersion))
  const originalConfig = readFileSync(toolPath("../apps/mobile/app.json"), "utf8")
  const restored = (result) => readFileSync(join(result.checkout, "apps", "mobile", "app.json"), "utf8") === originalConfig
  T("ios-simulator: preserves the checkout app config after a successful build", restored(successful))
  for (const signal of ["SIGINT", "SIGTERM"]) {
    for (const cancelPhase of ["prebuild", "native-build"]) {
      const cancelled = exercise(`cancelled-${cancelPhase}-${signal}`, { cancelPhase, signal }, ["--app-version", "2.4.6"])
      T(`ios-simulator: ${signal} terminates during ${cancelPhase} with the selected version`,
        cancelled.status === null && cancelled.signal === signal &&
        cancelled.phases.at(-1)?.phase === cancelPhase && cancelled.phases.at(-1)?.version === "2.4.6" &&
        !cancelled.calls.some((call) => call.args.includes("install")), cancelled.stderr)
      T(`ios-simulator: ${signal} during ${cancelPhase} preserves checkout app config bytes`, restored(cancelled))
    }
  }
  T("ios-simulator: pins staging and Xcode for every command", successful.calls.every((call) =>
    call.cwd === join(successful.checkout, "apps", "mobile") && call.environment.ORBIT_APP_VARIANT === "staging" &&
    call.environment.EXPO_PUBLIC_API_BASE === "https://api-staging.useorbit.org" &&
    call.environment.DEVELOPER_DIR === join(successful.checkout, "Xcode", "Developer") &&
    call.environment.SENTRY_DISABLE_AUTO_UPLOAD === "true" && call.environment.CI === "1"))
  const prebuild = successful.calls.find((call) => call.args.includes("prebuild"))
  const build = successful.calls.find((call) => call.args.includes("-workspace"))
  T("ios-simulator: regenerates iOS and builds Release with checkout-local DerivedData",
    prebuild?.args.slice(-3).join(" ") === "prebuild --platform ios" && build?.args.includes("Release") &&
    build.args.includes("iphonesimulator") &&
    build.args.includes(join(successful.checkout, "apps", "mobile", ".artifacts", "ios-simulator", "DerivedData")))
  T("ios-simulator: retains Keychain entitlements through local ad hoc signing without an Apple account",
    build?.args.includes("CODE_SIGNING_ALLOWED=YES") && build.args.includes("CODE_SIGN_IDENTITY=-") &&
    !build.args.includes("CODE_SIGNING_REQUIRED=NO"))
  T("ios-simulator: uses the selected destination's architecture without a conflicting arch flag",
    build?.args.includes(`platform=iOS Simulator,id=${secondIdentifier}`) && build.args.includes("ONLY_ACTIVE_ARCH=YES") && !build.args.includes("-arch"))
  const phases = successful.calls.map((call) => call.args.join(" ")).join("\n")
  T("ios-simulator: boots, builds, installs and launches in order", /bootstatus[\s\S]*prebuild[\s\S]*-workspace[\s\S]*simctl install[\s\S]*get_app_container[\s\S]*simctl launch --terminate-running-process/.test(phases))

  const selected = exercise("selected", {}, ["--device", phoneIdentifier])
  T("ios-simulator: honors a requested shutdown iPhone", selected.status === 0 && JSON.parse(selected.stdout).udid === phoneIdentifier)
  const callerSupplied = Object.fromEntries(buildVariableNames.map((name) => [name, name === "ORBIT_IOS_APP_STORE_ID" ? "900000002" : `sentinel-caller-${name}`]))
  const overridden = exercise("override", { noGh: true }, ["--app-version", "2.4.6"], callerSupplied)
  T("ios-simulator: explicit version and caller build variables skip every gh lookup",
    overridden.status === 0 && JSON.parse(overridden.stdout).version === "2.4.6" &&
    !overridden.calls.some((call) => call.command === "gh") && overridden.phases.every((phase) => phase.version === "2.4.6"))
  for (const [label, argumentsList] of [
    ["missing", ["--app-version"]], ["malformed", ["--app-version", "1.2"]],
    ["prerelease", ["--app-version", "1.2.3-beta"]], ["trailing-newline", ["--app-version", "1.2.3\n"]],
    ["repeated", ["--app-version", "1.2.3", "--app-version", "2.3.4"]],
  ]) {
    check("ios-simulator.mjs", `rejects ${label} app version`, argumentsList, { status: 2, stderr: /--app-version/ })
  }
  const altered = (payload) => [{ ...deployments[0], payload }]
  for (const [label, scenario] of [
    ["missing-gh", { noGh: true }], ["signed-out", { noAuth: true }],
    ["empty-records", { deployments: [] }], ["bad-json", { badJson: true }],
    ["non-array", { deployments: {} }], ["missing-payload", { deployments: [{ ...deployments[0], payload: null }] }],
    ["missing-version", { deployments: altered({ track: "internal", api_base: "https://api-staging.useorbit.org" }) }],
    ...[null, 134, "1.3", "1.3.101-beta", "1.3.101\n"].map((app_version, index) =>
      [`malformed-version-${index}`, { deployments: altered({ ...deployments[0].payload, app_version }) }]),
    ["wrong-api", { deployments: altered({ ...deployments[0].payload, api_base: "https://api.useorbit.org" }) }],
    ["wrong-track", { deployments: altered({ ...deployments[0].payload, track: "open" }) }],
  ]) {
    const failed = exercise(label, scenario)
    T(`ios-simulator: ${label} fails with an explicit override before boot or build`,
      failed.status === 1 && /--app-version <x.y.z>/.test(failed.stderr) &&
      !failed.calls.some((call) => call.args.includes("bootstatus") || call.args.includes("prebuild")) && restored(failed), failed.stderr)
  }
  const noPhones = exercise("absent", { noPhones: true })
  T("ios-simulator: refuses missing iPhone before prebuild", noPhones.status === 3 && !noPhones.calls.some((call) => call.args.includes("prebuild")))
  const missingDevice = exercise("missing-device", {}, ["--device", "00000000-0000-0000-0000-000000000003"])
  T("ios-simulator: refuses a missing requested device", missingDevice.status === 3)
  for (const failure of ["bootstatus", "prebuild", "-workspace", "simctl install", "get_app_container", "simctl launch"]) {
    const failed = exercise(`failed-${failure.replaceAll(" ", "-")}`, { fail: failure })
    T(`ios-simulator: stops on ${failure} failure`, failed.status === 1 && failed.calls.at(-1).args.join(" ").includes(failure))
    T(`ios-simulator: preserves checkout version after ${failure} failure`, restored(failed))
  }
  const staleVersion = exercise("stale-native-version", { staleVersion: true })
  T("ios-simulator: refuses a native build that retained the checkout version",
    staleVersion.status === 1 && /version/.test(staleVersion.stderr) && !staleVersion.calls.some((call) => call.args.includes("install")))
  const wrongBundle = exercise("wrong-bundle", { wrongBundle: true })
  T("ios-simulator: refuses production bundle before install", wrongBundle.status === 1 && !wrongBundle.calls.some((call) => call.args.includes("install")))
  const badLaunch = exercise("bad-launch", { badLaunch: true })
  T("ios-simulator: refuses an unverifiable PID", badLaunch.status === 1 && /Cannot verify launch PID/.test(badLaunch.stderr))
  const dead = exercise("dead", { dead: true })
  T("ios-simulator: installation alone never counts as success", dead.status === 1 && /exited within five seconds/.test(dead.stderr) && dead.stdout === "")
  buildVariableCases(successful, overridden, callerSupplied)

  const repeated = exercise("success")
  T("ios-simulator: releases the lock and rebuilds on repeat", repeated.status === 0 && repeated.calls.some((call) => call.args.includes("prebuild")))
}

const sentinel = /sentinel-|90000000\d/

function buildVariableCases(successful, overridden, callerSupplied) {
  const variableCalls = successful.calls.filter((call) => call.command === "gh" && call.args[0] === "variable")
  T("ios-simulator: reads the ios-staging environment and repository variables by name and value only",
    variableCalls.map((call) => call.args.join(" ")).join("\n") === [
      "variable list --repo thomasluizon/orbit-ui-mobile --env ios-staging --json name,value",
      "variable list --repo thomasluizon/orbit-ui-mobile --json name,value",
    ].join("\n"), JSON.stringify(variableCalls.map((call) => call.args)))
  const built = (result) => result.calls.find((call) => call.args.includes("-workspace"))?.environment ?? {}
  const prebuilt = (result) => result.calls.find((call) => call.args.includes("prebuild"))?.environment ?? {}
  const expected = {
    EXPO_PUBLIC_TURNSTILE_SITE_KEY: "sentinel-turnstile-environment",
    EXPO_PUBLIC_APP_STORE_MONTHLY_PRODUCT_ID: "sentinel-monthly-environment",
    EXPO_PUBLIC_APP_STORE_YEARLY_PRODUCT_ID: "sentinel-yearly-environment",
    EXPO_PUBLIC_GOOGLE_CLIENT_ID: "sentinel-google-repository",
    EXPO_PUBLIC_SENTRY_DSN: "sentinel-sentry-repository",
    EXPO_PUBLIC_POSTHOG_KEY: "sentinel-posthog-staging",
    ORBIT_IOS_APP_STORE_ID: "900000001",
  }
  for (const [label, environment] of [["prebuild", prebuilt(successful)], ["native build", built(successful)]]) {
    T(`ios-simulator: ${label} receives the ios-staging value before the repository value`,
      Object.entries(expected).every(([name, value]) => environment[name] === value), JSON.stringify(environment))
  }
  T("ios-simulator: reports Sentry events from prebuild and the native build as staging",
    prebuilt(successful).EXPO_PUBLIC_SENTRY_ENVIRONMENT === "staging" && built(successful).EXPO_PUBLIC_SENTRY_ENVIRONMENT === "staging",
    JSON.stringify([prebuilt(successful), built(successful)]))
  T("ios-simulator: never passes the signing team to the ad hoc simulator build", built(successful).ORBIT_APPLE_TEAM_ID === undefined)
  T("ios-simulator: reports a variable missing everywhere by name and still builds",
    /EXPO_PUBLIC_APPLE_CLIENT_ID: missing/.test(successful.stderr) && built(successful).EXPO_PUBLIC_APPLE_CLIENT_ID === undefined)
  T("ios-simulator: reports the source of each resolved variable",
    /EXPO_PUBLIC_TURNSTILE_SITE_KEY: ios-staging environment/.test(successful.stderr) &&
    /EXPO_PUBLIC_POSTHOG_KEY: repository STAGING_EXPO_PUBLIC_POSTHOG_KEY/.test(successful.stderr), successful.stderr)
  T("ios-simulator: caller build variables win over every GitHub value",
    overridden.status === 0 && buildVariableNames.every((name) => built(overridden)[name] === callerSupplied[name]) &&
    /EXPO_PUBLIC_TURNSTILE_SITE_KEY: caller environment/.test(overridden.stderr), overridden.stderr)

  const partialCaller = exercise("caller-turnstile", {}, [], { EXPO_PUBLIC_TURNSTILE_SITE_KEY: "sentinel-turnstile-caller" })
  T("ios-simulator: one caller value wins while the others still resolve from GitHub",
    partialCaller.status === 0 && built(partialCaller).EXPO_PUBLIC_TURNSTILE_SITE_KEY === "sentinel-turnstile-caller" &&
    built(partialCaller).EXPO_PUBLIC_GOOGLE_CLIENT_ID === "sentinel-google-repository", partialCaller.stderr)
  const repositoryOnly = exercise("repository-turnstile", { stagingVariables: [] })
  T("ios-simulator: falls back to the repository value when the environment has none",
    repositoryOnly.status === 0 && built(repositoryOnly).EXPO_PUBLIC_TURNSTILE_SITE_KEY === "sentinel-turnstile-repository", repositoryOnly.stderr)

  const missingTurnstile = exercise("missing-turnstile", {
    stagingVariables: stagingVariables.filter((entry) => entry.name !== "EXPO_PUBLIC_TURNSTILE_SITE_KEY"),
    repositoryVariables: [...repositoryVariables.filter((entry) => entry.name !== "EXPO_PUBLIC_TURNSTILE_SITE_KEY"),
      { name: "EXPO_PUBLIC_TURNSTILE_SITE_KEY", value: "  " }],
  })
  T("ios-simulator: refuses a build without the Turnstile site key before boot or build",
    missingTurnstile.status === 3 && /EXPO_PUBLIC_TURNSTILE_SITE_KEY/.test(missingTurnstile.stderr) && /Turnstile/.test(missingTurnstile.stderr) &&
    !missingTurnstile.calls.some((call) => call.args.includes("bootstatus") || call.args.includes("prebuild")), missingTurnstile.stderr)
  const unreadable = exercise("variables-unreadable", { variablesFail: true })
  T("ios-simulator: an unreadable variable list names the Turnstile key and stops",
    unreadable.status === 3 && /cannot read the ios-staging environment variables/.test(unreadable.stderr) &&
    /EXPO_PUBLIC_TURNSTILE_SITE_KEY: missing/.test(unreadable.stderr), unreadable.stderr)
  const offline = exercise("variables-offline", { variablesFail: true }, [], { EXPO_PUBLIC_TURNSTILE_SITE_KEY: "sentinel-turnstile-caller" })
  T("ios-simulator: an offline build continues with the caller Turnstile key",
    offline.status === 0 && built(offline).EXPO_PUBLIC_TURNSTILE_SITE_KEY === "sentinel-turnstile-caller", offline.stderr)
  const malformed = exercise("variables-bad-json", { variablesBadJson: true })
  T("ios-simulator: a malformed variable list fails without echoing the response", malformed.status === 3, malformed.stderr)

  for (const [label, result] of [
    ["success", successful], ["caller", overridden], ["partial caller", partialCaller], ["repository", repositoryOnly],
    ["missing Turnstile", missingTurnstile], ["unreadable", unreadable], ["offline", offline], ["malformed", malformed],
  ]) {
    T(`ios-simulator: no build variable value reaches stdout or stderr (${label})`,
      !sentinel.test(result.stdout) && !sentinel.test(result.stderr), `${result.stdout}\n${result.stderr}`)
  }
}
