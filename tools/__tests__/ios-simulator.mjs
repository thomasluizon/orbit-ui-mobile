import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, root, toolPath, check } from "./_harness.mjs"

const phoneIdentifier = "00000000-0000-0000-0000-000000000001"
const secondIdentifier = "00000000-0000-0000-0000-000000000002"
const phone = (udid, state) => ({
  dataPath: "<simulator data path>", dataPathSize: 18337792, logPath: "<simulator log path>",
  udid, isAvailable: true, deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-Duo",
  state, name: "iPhone Duo",
})

function exercise(label, scenario = {}, argumentsList = []) {
  const checkout = join(root, "ios-simulator", label)
  mkdirSync(join(checkout, "tools"), { recursive: true })
  mkdirSync(join(checkout, "apps", "mobile"), { recursive: true })
  mkdirSync(join(checkout, "node_modules", "expo", "bin"), { recursive: true })
  mkdirSync(join(checkout, "Xcode", "Developer", "usr", "bin"), { recursive: true })
  mkdirSync(join(checkout, "Xcode", "Applications", "DeviceHub.app"), { recursive: true })
  writeFileSync(join(checkout, "node_modules", "expo", "bin", "cli"), "")
  writeFileSync(join(checkout, "Xcode", "Developer", "usr", "bin", "xcodebuild"), "")
  cpSync(toolPath("ios-simulator.mjs"), join(checkout, "tools", "ios-simulator.mjs"))
  const callsPath = join(checkout, "calls.jsonl")
  const preload = join(checkout, "preload.cjs")
  writeFileSync(preload, `
const { appendFileSync } = require("node:fs")
const { syncBuiltinESMExports } = require("node:module")
const scenario = ${JSON.stringify(scenario)}
const phones = ${JSON.stringify([phone(phoneIdentifier, "Shutdown"), phone(secondIdentifier, "Booted")])}
Object.defineProperty(process, "platform", { value: "darwin" })
process.kill = () => { if (scenario.dead) throw new Error("No such process"); return true }
require("node:timers/promises").setTimeout = async () => {}
require("node:child_process").spawnSync = (command, args, options) => {
  appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({ command, args, cwd: options.cwd,
    environment: Object.fromEntries(["DEVELOPER_DIR", "ORBIT_APP_VARIANT", "EXPO_PUBLIC_API_BASE", "SENTRY_DISABLE_AUTO_UPLOAD", "CI"].map(key => [key, options.env[key]])) }) + "\\n")
  const joined = args.join(" ")
  if (args.includes("-arch") && args.includes("-destination")) return { status: 70, stdout: "", stderr: "xcodebuild: error: destination implies architecture, architecture must not also be specified." }
  if (scenario.fail && joined.includes(scenario.fail)) return { status: 1, stdout: "", stderr: "operation failed" }
  let stdout = ""
  if (joined === "simctl list devices -j") stdout = JSON.stringify({ devices: { "com.apple.CoreSimulator.SimRuntime.iOS-27-1": scenario.noPhones ? [] : phones } })
  if (joined.includes("get_app_container")) stdout = ${JSON.stringify(join(checkout, "installed.app"))}
  if (command.endsWith("PlistBuddy")) stdout = joined.includes("CFBundleIdentifier")
    ? (scenario.wrongBundle ? "org.useorbit.app" : "org.useorbit.app.staging")
    : joined.includes("CFBundleShortVersionString") ? "1.1.4" : "1"
  if (joined.includes("simctl launch")) stdout = scenario.badLaunch ? "unrecognized reply" : "org.useorbit.app.staging: 81018"
  return { status: 0, stdout, stderr: "" }
}
syncBuiltinESMExports()
`)
  const result = spawnSync(process.execPath, ["--require", preload, join(checkout, "tools", "ios-simulator.mjs"), ...argumentsList], {
    cwd: root, encoding: "utf8", timeout: 20000,
    env: { ...process.env, DEVELOPER_DIR: join(checkout, "Xcode", "Developer"), ORBIT_APP_VARIANT: "production", EXPO_PUBLIC_API_BASE: "https://invalid.example" },
  })
  const calls = readFileSync(callsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line))
  return { ...result, calls, checkout }
}

export function cases() {
  check("ios-simulator.mjs", "rejects missing device", ["--device"], { status: 2 })
  check("ios-simulator.mjs", "rejects invalid device", ["--device", "booted"], { status: 2 })
  check("ios-simulator.mjs", "rejects duplicate device", ["--device", phoneIdentifier, "--device", secondIdentifier], { status: 2 })

  const successful = exercise("success")
  T("ios-simulator: completes a build from another cwd", successful.status === 0, successful.stderr)
  const report = successful.status === 0 ? JSON.parse(successful.stdout) : {}
  T("ios-simulator: prefers the booted iPhone and reports installed version and liveness",
    report.udid === secondIdentifier && report.bundleIdentifier === "org.useorbit.app.staging" && report.version === "1.1.4" && report.buildNumber === "1" && report.alive === true && report.pid === 81018)
  T("ios-simulator: pins staging and Xcode for every command", successful.calls.every((call) =>
    call.cwd === join(successful.checkout, "apps", "mobile") && call.environment.ORBIT_APP_VARIANT === "staging" &&
    call.environment.EXPO_PUBLIC_API_BASE === "https://api-staging.useorbit.org" &&
    call.environment.DEVELOPER_DIR === join(successful.checkout, "Xcode", "Developer") &&
    call.environment.SENTRY_DISABLE_AUTO_UPLOAD === "true" && call.environment.CI === "1"))
  const prebuild = successful.calls.find((call) => call.args.includes("prebuild"))
  const build = successful.calls.find((call) => call.args.includes("-workspace"))
  T("ios-simulator: regenerates iOS and builds unsigned Release with checkout-local DerivedData",
    prebuild?.args.slice(-3).join(" ") === "prebuild --platform ios" && build?.args.includes("Release") &&
    build.args.includes("iphonesimulator") && build.args.includes("CODE_SIGNING_ALLOWED=NO") &&
    build.args.includes(join(successful.checkout, "apps", "mobile", ".artifacts", "ios-simulator", "DerivedData")))
  T("ios-simulator: uses the selected destination's architecture without a conflicting arch flag",
    build?.args.includes(`platform=iOS Simulator,id=${secondIdentifier}`) && build.args.includes("ONLY_ACTIVE_ARCH=YES") && !build.args.includes("-arch"))
  const phases = successful.calls.map((call) => call.args.join(" ")).join("\n")
  T("ios-simulator: boots, builds, installs and launches in order", /bootstatus[\s\S]*prebuild[\s\S]*-workspace[\s\S]*simctl install[\s\S]*get_app_container[\s\S]*simctl launch --terminate-running-process/.test(phases))

  const selected = exercise("selected", {}, ["--device", phoneIdentifier])
  T("ios-simulator: honors a requested shutdown iPhone", selected.status === 0 && JSON.parse(selected.stdout).udid === phoneIdentifier)
  const noPhones = exercise("absent", { noPhones: true })
  T("ios-simulator: refuses missing iPhone before prebuild", noPhones.status === 3 && !noPhones.calls.some((call) => call.args.includes("prebuild")))
  const missingDevice = exercise("missing-device", {}, ["--device", "00000000-0000-0000-0000-000000000003"])
  T("ios-simulator: refuses a missing requested device", missingDevice.status === 3)
  for (const failure of ["bootstatus", "prebuild", "-workspace", "simctl install", "get_app_container", "simctl launch"]) {
    const failed = exercise(`failed-${failure.replaceAll(" ", "-")}`, { fail: failure })
    T(`ios-simulator: stops on ${failure} failure`, failed.status === 1 && failed.calls.at(-1).args.join(" ").includes(failure))
  }
  const wrongBundle = exercise("wrong-bundle", { wrongBundle: true })
  T("ios-simulator: refuses production bundle before install", wrongBundle.status === 1 && !wrongBundle.calls.some((call) => call.args.includes("install")))
  const badLaunch = exercise("bad-launch", { badLaunch: true })
  T("ios-simulator: refuses an unverifiable PID", badLaunch.status === 1 && /Cannot verify launch PID/.test(badLaunch.stderr))
  const dead = exercise("dead", { dead: true })
  T("ios-simulator: installation alone never counts as success", dead.status === 1 && /exited within five seconds/.test(dead.stderr) && dead.stdout === "")
  const repeated = exercise("success")
  T("ios-simulator: releases the lock and rebuilds on repeat", repeated.status === 0 && repeated.calls.some((call) => call.args.includes("prebuild")))
}
