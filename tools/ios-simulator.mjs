#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { closeSync, existsSync, mkdirSync, openSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout } from "node:timers/promises"

const USAGE = `usage: node tools/ios-simulator.mjs [--device <udid>]

  Prebuild, compile, install and open Orbit Staging on an installed iPhone simulator.
  Uses a Release build with bundled JavaScript and no signing or development server.
  Prefers a booted iPhone, otherwise the first available iPhone from simctl.

  --device <udid>  select an available iPhone by its simulator identifier
  --help, -h       print usage and exit 0

  Requires macOS, Xcode with first-launch setup complete, an iOS runtime with an
  iPhone simulator, CocoaPods on PATH, and npm ci dependencies in this checkout.
  DEVELOPER_DIR selects Xcode; defaults to the standard Xcode application.
  Logs and DerivedData stay in apps/mobile/.artifacts/ios-simulator (ignored).
  Prints the device, installed bundle identifier, version, PID and liveness as JSON.
  Replaces generated apps/mobile/ios; preserves installed app storage on repeat runs.
  stdin: unused
  exit codes: 0 launched and alive after five seconds, 1 operation failed,
              2 invalid arguments, 3 missing prerequisites or requested device`

let requestedDevice
for (let index = 2; index < process.argv.length; index++) {
  const argument = process.argv[index]
  if (argument === "--help" || argument === "-h") {
    process.stdout.write(`${USAGE}\n`)
    process.exit(0)
  }
  if (argument !== "--device" || requestedDevice) {
    process.stderr.write(`ios-simulator: unknown or repeated option: ${argument}\n`)
    process.exit(2)
  }
  requestedDevice = process.argv[++index]
  if (!requestedDevice || !/^[A-Fa-f0-9-]{36}$/.test(requestedDevice)) {
    process.stderr.write("ios-simulator: --device requires a simulator UUID\n")
    process.exit(2)
  }
}

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const mobile = join(repository, "apps", "mobile")
const artifacts = join(mobile, ".artifacts", "ios-simulator")
const developerDirectory = process.env.DEVELOPER_DIR || join("/Applications", "Xcode.app", "Contents", "Developer")
const simulatorApplication = join(developerDirectory, "..", "Applications", "DeviceHub.app")
const expo = join(repository, "node_modules", "expo", "bin", "cli")
const bundleIdentifier = "org.useorbit.app.staging"
const environment = {
  ...process.env,
  DEVELOPER_DIR: developerDirectory,
  ORBIT_APP_VARIANT: "staging",
  EXPO_PUBLIC_API_BASE: "https://api-staging.useorbit.org",
  EXPO_NO_TELEMETRY: "1",
  EXPO_NO_METRO_WORKSPACE_ROOT: "1",
  SENTRY_DISABLE_AUTO_UPLOAD: "true",
  CI: "1",
}

function fail(message, code = 1) {
  throw Object.assign(new Error(message), { exitCode: code })
}

let logDescriptor
function run(command, argumentsList, timeout = 60000) {
  const result = spawnSync(command, argumentsList, {
    cwd: mobile,
    env: environment,
    encoding: "utf8",
    timeout,
    maxBuffer: 32 * 1024 * 1024,
    stdio: logDescriptor === undefined ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", logDescriptor],
  })
  if (result.error || result.status !== 0) {
    fail(`${command} ${argumentsList.join(" ")} failed (${result.status ?? result.error?.message}). See ${artifacts}. ${result.stderr ?? ""}`)
  }
  return result.stdout.trim()
}

function build() {
  for (const [name, command, argumentsList] of [
    ["prebuild", process.execPath, [expo, "prebuild", "--platform", "ios"]],
    ["build", "xcodebuild", [
      "-workspace", "ios/OrbitStaging.xcworkspace", "-scheme", "OrbitStaging",
      "-configuration", "Release", "-sdk", "iphonesimulator",
      "-arch", process.arch === "arm64" ? "arm64" : "x86_64", "-jobs", "2",
      "-destination", "generic/platform=iOS Simulator", "-derivedDataPath", join(artifacts, "DerivedData"),
      "CODE_SIGNING_ALLOWED=NO", "CODE_SIGNING_REQUIRED=NO", "build",
    ]],
  ]) {
    const logPath = join(artifacts, `${name}.log`)
    process.stderr.write(`ios-simulator: ${name}; log: ${logPath}\n`)
    const descriptor = openSync(logPath, "w")
    try {
      const result = spawnSync(command, argumentsList, {
        cwd: mobile, env: environment, stdio: ["ignore", descriptor, descriptor], timeout: 45 * 60 * 1000,
      })
      if (result.error || result.status !== 0) fail(`${name} failed (${result.status ?? result.error?.message}); see ${logPath}`)
    } finally {
      closeSync(descriptor)
    }
  }
}

function selectDevice() {
  const listing = JSON.parse(run("xcrun", ["simctl", "list", "devices", "-j"]))
  const phones = Object.values(listing.devices).flat().filter((device) =>
    device.isAvailable === true && device.deviceTypeIdentifier.startsWith("com.apple.CoreSimulator.SimDeviceType.iPhone-"))
  const selected = requestedDevice
    ? phones.find((device) => device.udid.toLowerCase() === requestedDevice.toLowerCase())
    : phones.find((device) => device.state === "Booted") ?? phones[0]
  if (!selected) fail("No matching available iPhone simulator. Install an iOS runtime and create an iPhone in Xcode Devices and Simulators.", 3)
  return selected
}

const started = Date.now()
let lockHeld = false
const lock = join(artifacts, "running")
try {
  if (process.platform !== "darwin" || !existsSync(join(developerDirectory, "usr", "bin", "xcodebuild")) || !existsSync(simulatorApplication) || !existsSync(expo)) {
    fail("Requires macOS, full Xcode with Device Hub and npm ci dependencies. See --help.", 3)
  }
  run("xcodebuild", ["-checkFirstLaunchStatus"])
  run("pod", ["--version"])
  mkdirSync(artifacts, { recursive: true })
  try { mkdirSync(lock) } catch (error) {
    if (error.code === "EEXIST") fail(`Another build owns ${lock}. Remove this directory only after confirming that build has stopped.`)
    throw error
  }
  lockHeld = true
  logDescriptor = openSync(join(artifacts, "simulator.log"), "w")
  const device = selectDevice()
  process.stderr.write(`ios-simulator: booting ${device.name} (${device.udid})\n`)
  run("xcrun", ["simctl", "bootstatus", device.udid, "-b"], 5 * 60 * 1000)
  build()
  const app = join(artifacts, "DerivedData", "Build", "Products", "Release-iphonesimulator", "OrbitStaging.app")
  const readProperty = (path, key) => run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, join(path, "Info.plist")])
  if (readProperty(app, "CFBundleIdentifier") !== bundleIdentifier) fail("Build has an unexpected bundle identifier")
  run("xcrun", ["simctl", "install", device.udid, app])
  const installed = run("xcrun", ["simctl", "get_app_container", device.udid, bundleIdentifier, "app"])
  const installedIdentifier = readProperty(installed, "CFBundleIdentifier")
  const version = readProperty(installed, "CFBundleShortVersionString")
  const buildNumber = readProperty(installed, "CFBundleVersion")
  if (installedIdentifier !== bundleIdentifier) fail("Installed app has an unexpected bundle identifier")
  run("open", ["-a", simulatorApplication])
  const launch = run("xcrun", ["simctl", "launch", "--terminate-running-process", device.udid, bundleIdentifier])
  const matched = launch.match(/^org\.useorbit\.app\.staging: ([1-9]\d*)$/)
  if (!matched) fail(`Cannot verify launch PID: ${launch}`)
  const pid = Number(matched[1])
  await setTimeout(5000)
  try { process.kill(pid, 0) } catch { fail(`Orbit Staging exited within five seconds of launch (PID ${pid})`) }
  process.stdout.write(`${JSON.stringify({ simulator: device.name, udid: device.udid, bundleIdentifier: installedIdentifier, version, buildNumber, pid, alive: true, elapsedSeconds: (Date.now() - started) / 1000, app, logs: artifacts }, null, 2)}\n`)
} catch (error) {
  process.stderr.write(`ios-simulator: ${error.message}\n`)
  process.exitCode = error.exitCode ?? 1
} finally {
  if (logDescriptor !== undefined) closeSync(logDescriptor)
  if (lockHeld) rmSync(lock, { recursive: true })
}
