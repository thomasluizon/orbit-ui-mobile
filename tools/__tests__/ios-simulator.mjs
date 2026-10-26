import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, root, toolPath, check } from "./_harness.mjs"

const phoneIdentifier = "00000000-0000-0000-0000-000000000001"
const secondIdentifier = "00000000-0000-0000-0000-000000000002"
const deployments = JSON.parse(readFileSync(toolPath("__fixtures__/ios-staging-deployment.json"), "utf8"))
const releaseVersion = deployments[0].payload.app_version
const phone = (udid, state) => ({
  dataPath: "<simulator data path>", dataPathSize: 18337792, logPath: "<simulator log path>",
  udid, isAvailable: true, deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-Duo",
  state, name: "iPhone Duo",
})

function exercise(label, scenario = {}, argumentsList = []) {
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
    environment: Object.fromEntries(["DEVELOPER_DIR", "ORBIT_APP_VARIANT", "EXPO_PUBLIC_API_BASE", "SENTRY_DISABLE_AUTO_UPLOAD", "CI"].map(key => [key, options.env[key]])) }) + "\\n")
  const joined = args.join(" ")
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
    env: { ...process.env, DEVELOPER_DIR: join(checkout, "Xcode", "Developer"), ORBIT_APP_VARIANT: "production", EXPO_PUBLIC_API_BASE: "https://invalid.example" },
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
  const overridden = exercise("override", { noGh: true }, ["--app-version", "2.4.6"])
  T("ios-simulator: explicit version overrides the lookup without requiring gh",
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
  const repeated = exercise("success")
  T("ios-simulator: releases the lock and rebuilds on repeat", repeated.status === 0 && repeated.calls.some((call) => call.args.includes("prebuild")))
}
