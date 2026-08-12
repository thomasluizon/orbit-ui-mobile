import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, check, root, run } from "./_harness.mjs"

const WINDOWS = process.platform === "win32"

/**
 * Stages a fake Android SDK whose adb and emulator are Node shims, so the tool's lifecycle decisions
 * run with no device, no network and no real SDK. The shims are reached through a .bat on Windows,
 * which also exercises the command-processor path the SDK's own .bat entry points need.
 */
const stageSdk = (label, behaviour) => {
  const sdk = join(root, "android-sdk", label)
  mkdirSync(join(sdk, "platform-tools"), { recursive: true })
  mkdirSync(join(sdk, "emulator"), { recursive: true })

  const marker = join(sdk, "killed.marker")
  const shim = join(sdk, "adb-shim.mjs")
  writeFileSync(
    shim,
    `import { existsSync, writeFileSync } from "node:fs"
const argv = process.argv.slice(2)
const joined = argv.join(" ")
const behaviour = ${JSON.stringify(behaviour)}
const killed = () => existsSync(${JSON.stringify(marker)})
if (joined.includes("emu kill")) {
  writeFileSync(${JSON.stringify(marker)}, "killed")
  process.stdout.write("OK: killing emulator, bye bye\\n")
  process.exit(behaviour.killFails ? 1 : 0)
}
if (argv[0] === "devices") {
  if (killed() && behaviour.listFailsAfterKill) process.exit(1)
  const rows = killed() ? (behaviour.devicesAfterKill ?? []) : (behaviour.devices ?? [])
  process.stdout.write("List of devices attached\\n" + rows.map((row) => row + "\\n").join("") + "\\n")
  process.exit(0)
}
if (joined.includes("sys.boot_completed")) {
  process.stdout.write((behaviour.boot ?? "1") + "\\n")
  process.exit(0)
}
if (joined.includes("avd name")) {
  process.stdout.write((behaviour.avdName ?? "") + "\\nOK\\n")
  process.exit(0)
}
if (joined.includes("ping")) {
  process.stdout.write((behaviour.ping ?? "") + "\\n")
  process.exit(0)
}
process.exit(0)
`,
  )

  const emulatorShim = join(sdk, "emulator-shim.mjs")
  writeFileSync(
    emulatorShim,
    `const avds = ${JSON.stringify(behaviour.avds ?? [])}
if (process.argv.includes("-list-avds")) process.stdout.write(avds.map((a) => a + "\\n").join(""))
process.exit(0)
`,
  )

  const write = (target, script) => {
    const path = join(sdk, ...target)
    if (WINDOWS) {
      writeFileSync(`${path}.bat`, `@echo off\r\nnode "${script}" %*\r\n`)
    } else {
      writeFileSync(path, `#!/bin/sh\nexec node "${script}" "$@"\n`)
      chmodSync(path, 0o755)
    }
  }
  write(["platform-tools", "adb"], shim)
  write(["emulator", "emulator"], emulatorShim)
  return sdk
}

const sdkEnv = (sdk) => ({ ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk })

const statusOf = (sdk) => {
  const result = run("android-emulator.mjs", ["--status", "--json"], { env: sdkEnv(sdk) })
  let parsed = null
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    /* a non-JSON body is itself the failure the caller asserts on */
  }
  return { ...result, parsed }
}

export const cases = () => {
  check("android-emulator.mjs", "rejects a value-less --avd", ["--avd"], { status: 2, stderr: /requires a value/ })
  check("android-emulator.mjs", "rejects a value-less --dns", ["--dns"], { status: 2, stderr: /requires a value/ })
  check("android-emulator.mjs", "rejects a non-numeric --timeout", ["--timeout", "soon"], {
    status: 2,
    stderr: /positive number/,
  })
  check("android-emulator.mjs", "rejects a negative --timeout", ["--timeout", "-5"], { status: 2 })

  const missing = join(root, "android-sdk", "absent")
  check(
    "android-emulator.mjs",
    "refuses when the SDK is absent",
    ["--status"],
    { status: 3, stderr: /Android SDK not found/ },
    { env: { ANDROID_HOME: missing, ANDROID_SDK_ROOT: missing, LOCALAPPDATA: missing, HOME: missing, USERPROFILE: missing } },
  )

  const foreign = stageSdk("foreign", {
    devices: ["emulator-5554\tdevice"],
    avdName: "Some_Other_AVD",
    avds: ["Some_Other_AVD"],
  })
  const foreignStatus = statusOf(foreign)
  T(
    "android-emulator.mjs: an unrelated booted AVD is never reported ready",
    foreignStatus.parsed?.state !== "ready" && foreignStatus.parsed?.serial === null,
    `state=${foreignStatus.parsed?.state} serial=${foreignStatus.parsed?.serial}`,
  )

  const matching = stageSdk("matching", {
    devices: ["emulator-5554\tdevice"],
    avdName: "Orbit_Pixel_9_API_35",
    avds: ["Orbit_Pixel_9_API_35"],
  })
  const matchingStatus = statusOf(matching)
  T(
    "android-emulator.mjs: the requested AVD is matched by identity, not by listing order",
    matchingStatus.parsed?.state === "ready" && matchingStatus.parsed?.serial === "emulator-5554",
    `state=${matchingStatus.parsed?.state} serial=${matchingStatus.parsed?.serial}`,
  )

  const stopped = stageSdk("stopped", { devices: [], avds: ["Orbit_Pixel_9_API_35"] })
  T("android-emulator.mjs: a created-but-not-running AVD reports stopped", statusOf(stopped).parsed?.state === "stopped")

  const absentAvd = stageSdk("absent-avd", { devices: [], avds: [] })
  T("android-emulator.mjs: an uncreated AVD reports absent rather than stopped", statusOf(absentAvd).parsed?.state === "absent")

  T(
    "android-emulator.mjs: --status never launches anything",
    statusOf(stopped).parsed?.booted === false && statusOf(stopped).parsed?.created === false,
  )

  const reusable = stageSdk("reusable", {
    devices: ["emulator-5554\tdevice"],
    avdName: "Orbit_Pixel_9_API_35",
    avds: ["Orbit_Pixel_9_API_35"],
    ping: "PING api.useorbit.org (216.24.57.7) from 10.0.2.16 wlan0: 56(84) bytes of data.",
  })
  const reused = run("android-emulator.mjs", ["--json", "--shutdown-timeout", "3"], { env: sdkEnv(reusable) })
  T(
    "android-emulator.mjs: a running AVD that still resolves the verify host is reused",
    reused.status === 0 && !existsSync(join(reusable, "killed.marker")),
    `status=${reused.status} killed=${existsSync(join(reusable, "killed.marker"))}`,
  )

  // The restart path: an emulator someone else started cannot resolve the API host, so it must be
  // stopped. `offline` is not departure, and neither is a failed listing.
  const lingering = stageSdk("lingering-offline", {
    devices: ["emulator-5554\tdevice"],
    devicesAfterKill: ["emulator-5554\toffline"],
    avdName: "Orbit_Pixel_9_API_35",
    avds: ["Orbit_Pixel_9_API_35"],
    ping: "ping: unknown host api.useorbit.org",
  })
  check("android-emulator.mjs", "an offline serial is not treated as shut down", ["--shutdown-timeout", "3"], {
    status: 1,
    stderr: /still present/,
  }, { env: sdkEnv(lingering) })
  T(
    "android-emulator.mjs: the DNS failure is what triggered the restart",
    existsSync(join(lingering, "killed.marker")),
  )

  const listingBreaks = stageSdk("listing-fails", {
    devices: ["emulator-5554\tdevice"],
    listFailsAfterKill: true,
    avdName: "Orbit_Pixel_9_API_35",
    avds: ["Orbit_Pixel_9_API_35"],
    ping: "ping: unknown host api.useorbit.org",
  })
  check("android-emulator.mjs", "a failed device listing never counts as shutdown", ["--shutdown-timeout", "3"], {
    status: 1,
    stderr: /still present/,
  }, { env: sdkEnv(listingBreaks) })

  const killBreaks = stageSdk("kill-fails", {
    devices: ["emulator-5554\tdevice"],
    killFails: true,
    avdName: "Orbit_Pixel_9_API_35",
    avds: ["Orbit_Pixel_9_API_35"],
    ping: "ping: unknown host api.useorbit.org",
  })
  check("android-emulator.mjs", "a failed emu kill stops the run", ["--shutdown-timeout", "3"], {
    status: 1,
    stderr: /could not stop/,
  }, { env: sdkEnv(killBreaks) })
}
