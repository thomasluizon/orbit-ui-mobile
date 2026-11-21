import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, check, root, run } from "./_harness.mjs"

/**
 * Stages a fake Android SDK whose adb and emulator are Node shims, so the tool's lifecycle decisions
 * run with no device, no network and no real SDK.
 */
const stageSdk = (label, behaviour) => {
  const sdk = join(root, "android-sdk", label)
  mkdirSync(join(sdk, "platform-tools"), { recursive: true })
  mkdirSync(join(sdk, "emulator"), { recursive: true })

  const shim = join(sdk, "adb-shim.mjs")
  writeFileSync(
    shim,
    `const argv = process.argv.slice(2)
const joined = argv.join(" ")
const behaviour = ${JSON.stringify(behaviour)}
if (argv[0] === "devices") {
  process.stdout.write("List of devices attached\\n" + (behaviour.devices ?? []).map((row) => row + "\\n").join("") + "\\n")
  process.exit(0)
}
if (joined.includes("sys.boot_completed")) {
  process.stdout.write((behaviour.boot ?? "1") + "\\n")
  process.exit(0)
}
if (joined.includes("avd name")) process.stdout.write((behaviour.avdName ?? "") + "\\nOK\\n")
process.exit(0)
`,
  )

  const emulatorShim = join(sdk, "emulator-shim.mjs")
  writeFileSync(
    emulatorShim,
    `import { appendFileSync } from "node:fs"
const avds = ${JSON.stringify(behaviour.avds ?? [])}
if (process.argv.includes("-list-avds")) process.stdout.write(avds.map((a) => a + "\\n").join(""))
else appendFileSync(${JSON.stringify(join(sdk, "emulator-args.log"))}, process.argv.slice(2).join(" ") + "\\n")
process.exit(0)
`,
  )

  const write = (target, script) => {
    const path = join(sdk, ...target)
    writeFileSync(path, `#!/bin/sh\nexec node "${script}" "$@"\n`)
    chmodSync(path, 0o755)
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
  // A device proof pins its throwaway emulator to the console port the caller chose.
  for (const [label, value] of [["an odd port", "5595"], ["a port below the emulator range", "5552"], ["a port above it", "5684"], ["a word", "next"]]) {
    check("android-emulator.mjs", `rejects ${label} for --port`, ["--port", value], { status: 2, stderr: /--port needs an even console port from 5554 to 5682/ })
  }
  const pinned = stageSdk("pinned-port", { devices: [], avds: ["orbit-proof-2145"] })
  const booted = run("android-emulator.mjs", ["--avd", "orbit-proof-2145", "--port", "5594", "--timeout", "1"], { env: sdkEnv(pinned) })
  const launchedWith = existsSync(join(pinned, "emulator-args.log")) ? readFileSync(join(pinned, "emulator-args.log"), "utf8") : ""
  T("android-emulator.mjs: --port boots the emulator on that console port", booted.status === 5 && /-avd orbit-proof-2145 .*-port 5594/.test(launchedWith), `status=${booted.status} ${booted.stderr} args=${launchedWith}`)
  check("android-emulator.mjs", "rejects a value-less --avd", ["--avd"], { status: 2, stderr: /requires a value/ })
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
  })
  const reused = run("android-emulator.mjs", ["--json"], { env: sdkEnv(reusable) })
  T(
    "android-emulator.mjs: a running AVD that matches by identity is reused without a launch",
    reused.status === 0 && JSON.parse(reused.stdout).serial === "emulator-5554" && !existsSync(join(reusable, "emulator-args.log")),
    `status=${reused.status} ${reused.stderr}`,
  )
}
