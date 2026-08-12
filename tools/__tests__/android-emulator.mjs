import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, check, root, run } from "./_harness.mjs"

const WINDOWS = process.platform === "win32"

/**
 * Stages a fake Android SDK whose adb and emulator are shims printing caller-supplied output, so the
 * tool's lifecycle decisions run with no device, no network, and no real SDK. The shims are .bat on
 * Windows and plain shell elsewhere, which also exercises the command-processor path the tool needs
 * for the SDK's own .bat entry points.
 */
const stageSdk = (label, { devices = "List of devices attached\n", avdName = "", avds = "", boot = "1", ping = "" }) => {
  const sdk = join(root, "android-sdk", label)
  mkdirSync(join(sdk, "platform-tools"), { recursive: true })
  mkdirSync(join(sdk, "emulator"), { recursive: true })

  const adbScript = WINDOWS
    ? [
        "@echo off",
        'if "%1"=="devices" (',
        ...devices.split("\n").map((line) => `echo ${line || "."}`),
        "  exit /b 0",
        ")",
        'echo %* | findstr /C:"sys.boot_completed" >nul && (',
        `  echo ${boot}`,
        "  exit /b 0",
        ")",
        'echo %* | findstr /C:"avd name" >nul && (',
        `  echo ${avdName || "."}`,
        "  echo OK",
        "  exit /b 0",
        ")",
        'echo %* | findstr /C:"ping" >nul && (',
        `  echo ${ping || "."}`,
        "  exit /b 0",
        ")",
        "exit /b 0",
      ].join("\r\n")
    : [
        "#!/bin/sh",
        'if [ "$1" = "devices" ]; then',
        `  printf '%s\\n' ${JSON.stringify(devices)}`,
        "  exit 0",
        "fi",
        'case "$*" in',
        `  *sys.boot_completed*) printf '%s\\n' ${JSON.stringify(boot)}; exit 0;;`,
        `  *"avd name"*) printf '%s\\nOK\\n' ${JSON.stringify(avdName)}; exit 0;;`,
        `  *ping*) printf '%s\\n' ${JSON.stringify(ping)}; exit 0;;`,
        "esac",
        "exit 0",
      ].join("\n")

  const emulatorScript = WINDOWS
    ? ["@echo off", ...avds.split("\n").filter(Boolean).map((line) => `echo ${line}`), "exit /b 0"].join("\r\n")
    : ["#!/bin/sh", `printf '%s\\n' ${JSON.stringify(avds)}`, "exit 0"].join("\n")

  const adbPath = join(sdk, "platform-tools", WINDOWS ? "adb.bat" : "adb")
  const emulatorPath = join(sdk, "emulator", WINDOWS ? "emulator.bat" : "emulator")
  writeFileSync(adbPath, adbScript)
  writeFileSync(emulatorPath, emulatorScript)
  if (!WINDOWS) {
    chmodSync(adbPath, 0o755)
    chmodSync(emulatorPath, 0o755)
  }
  return sdk
}

const statusOf = (sdk, argv = []) => {
  const result = run("android-emulator.mjs", ["--status", "--json", ...argv], {
    env: { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk },
  })
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
  check("android-emulator.mjs", "refuses when the SDK is absent", ["--status"], {
    status: 3,
    stderr: /Android SDK not found/,
  }, { env: { ANDROID_HOME: missing, ANDROID_SDK_ROOT: missing, LOCALAPPDATA: missing, HOME: missing, USERPROFILE: missing } })

  const foreign = stageSdk("foreign", {
    devices: "List of devices attached\nemulator-5554\tdevice\n",
    avdName: "Some_Other_AVD",
    avds: "Some_Other_AVD",
  })
  const foreignStatus = statusOf(foreign)
  T(
    "android-emulator.mjs: an unrelated booted AVD is never reported ready",
    foreignStatus.parsed?.state !== "ready" && foreignStatus.parsed?.serial === null,
    `state=${foreignStatus.parsed?.state} serial=${foreignStatus.parsed?.serial}`,
  )

  const matching = stageSdk("matching", {
    devices: "List of devices attached\nemulator-5554\tdevice\n",
    avdName: "Orbit_Pixel_9_API_35",
    avds: "Orbit_Pixel_9_API_35",
  })
  const matchingStatus = statusOf(matching)
  T(
    "android-emulator.mjs: the requested AVD is matched by identity, not by listing order",
    matchingStatus.parsed?.state === "ready" && matchingStatus.parsed?.serial === "emulator-5554",
    `state=${matchingStatus.parsed?.state} serial=${matchingStatus.parsed?.serial}`,
  )

  const stopped = stageSdk("stopped", { devices: "List of devices attached\n", avds: "Orbit_Pixel_9_API_35" })
  const stoppedStatus = statusOf(stopped)
  T(
    "android-emulator.mjs: a created-but-not-running AVD reports stopped",
    stoppedStatus.parsed?.state === "stopped",
    `state=${stoppedStatus.parsed?.state}`,
  )

  const absentAvd = stageSdk("absent-avd", { devices: "List of devices attached\n", avds: "" })
  T(
    "android-emulator.mjs: an uncreated AVD reports absent rather than stopped",
    statusOf(absentAvd).parsed?.state === "absent",
  )

  T(
    "android-emulator.mjs: --status never launches anything",
    statusOf(stopped).parsed?.booted === false && statusOf(stopped).parsed?.created === false,
  )
}
