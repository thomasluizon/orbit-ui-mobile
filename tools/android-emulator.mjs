#!/usr/bin/env node
/**
 * Brings the Orbit Android emulator to a ready state, creating its AVD when absent.
 *
 * Every setting here is one this repository measured on 2026-08-12, not a default:
 * API 35 (the emulator warns `Guest Angle is still unstable for API > 35`),
 * `hw.keyboard=yes` (avdmanager defaults it to `no`, which ignores the host keyboard),
 * and `-dns-server` (the emulator otherwise inherits the host resolver, which failed
 * to resolve `api.useorbit.org` while every other name resolved).
 */

import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"

const AVD_NAME = "Orbit_Pixel_9_API_35"
const SYSTEM_IMAGE = "system-images;android-35;google_apis_playstore;x86_64"
const DEVICE_PROFILE = "pixel_9"
const DNS_SERVERS = "8.8.8.8,1.1.1.1"
const BOOT_TIMEOUT_SECONDS = 420

/**
 * Hardware values proven to boot on 2026-08-12. A larger set (6 GB RAM, 6 cores,
 * a 12 GB data partition) crashed the emulator silently right after the hypervisor
 * started, so this stays at the measured set.
 */
const AVD_SETTINGS = {
  "PlayStore.enabled": "yes",
  "hw.keyboard": "yes",
  "hw.ramSize": "4096",
  "hw.cpu.ncore": "4",
  "vm.heapSize": "512M",
  "hw.gpu.enabled": "yes",
  "hw.gpu.mode": "host",
}

const EXIT = { OK: 0, FAILED: 1, INVALID_INPUT: 2, NO_SDK: 3, AVD_FAILED: 4, BOOT_TIMEOUT: 5 }

const USAGE = `android-emulator.mjs - bring the Orbit Android emulator to a ready state

Usage:
  node tools/android-emulator.mjs [--status] [--avd <name>] [--dns <servers>] [--timeout <seconds>] [--json]

Creates the AVD "${AVD_NAME}" when it does not exist, boots it with explicit DNS
servers, and waits until the guest reports sys.boot_completed=1. A already-booted
emulator is reused rather than restarted.

Options:
  --status            Report the current state and exit without creating or booting anything.
  --avd <name>        AVD to use. Default: ${AVD_NAME}
  --dns <servers>     Comma-separated DNS servers passed to -dns-server. Default: ${DNS_SERVERS}
  --timeout <seconds> Seconds to wait for boot. Default: ${BOOT_TIMEOUT_SECONDS}
  --json              Emit the result as JSON on stdout.
  --help, -h          Print this usage and exit 0.

Output:
  A human summary, or one JSON object with { avd, serial, state, sdk, created, booted }.

Exit codes:
  ${EXIT.OK}  emulator ready (or, with --status, state reported)
  ${EXIT.FAILED}  an underlying command failed
  ${EXIT.INVALID_INPUT}  unknown flag or missing flag value
  ${EXIT.NO_SDK}  Android SDK not found
  ${EXIT.AVD_FAILED}  the AVD could not be created
  ${EXIT.BOOT_TIMEOUT}  the emulator did not report boot completion in time
`

function fail(code, message) {
  process.stderr.write(`android-emulator: ${message}\n`)
  process.exit(code)
}

function parseArgs(argv) {
  const options = {
    status: false,
    avd: AVD_NAME,
    dns: DNS_SERVERS,
    timeout: BOOT_TIMEOUT_SECONDS,
    json: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(USAGE)
      process.exit(EXIT.OK)
    } else if (arg === "--status") {
      options.status = true
    } else if (arg === "--json") {
      options.json = true
    } else if (arg === "--avd" || arg === "--dns" || arg === "--timeout") {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith("--")) {
        fail(EXIT.INVALID_INPUT, `${arg} requires a value`)
      }
      index += 1
      if (arg === "--avd") options.avd = value
      else if (arg === "--dns") options.dns = value
      else {
        const seconds = Number(value)
        if (!Number.isFinite(seconds) || seconds <= 0) {
          fail(EXIT.INVALID_INPUT, `--timeout requires a positive number of seconds, got ${value}`)
        }
        options.timeout = seconds
      }
    } else {
      fail(EXIT.INVALID_INPUT, `unknown argument: ${arg}`)
    }
  }

  return options
}

function resolveSdkPath() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk") : null,
    path.join(homedir(), "Library", "Android", "sdk"),
    path.join(homedir(), "Android", "Sdk"),
  ].filter(Boolean)

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function executable(sdkPath, ...segments) {
  const base = path.join(sdkPath, ...segments)
  for (const suffix of process.platform === "win32" ? [".exe", ".bat", ""] : [""]) {
    if (existsSync(base + suffix)) return base + suffix
  }
  return base
}

function run(command, args, extraEnv = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    windowsHide: true,
  })
}

function bootedSerials(adb) {
  const listed = run(adb, ["devices"])
  if (listed.status !== 0) return []
  return String(listed.stdout ?? "")
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[0].startsWith("emulator-") && parts[1] === "device")
    .map((parts) => parts[0])
}

function isBootCompleted(adb, serial) {
  const property = run(adb, ["-s", serial, "shell", "getprop", "sys.boot_completed"])
  return String(property.stdout ?? "").trim() === "1"
}

function listAvds(emulator) {
  const listed = run(emulator, ["-list-avds"])
  if (listed.status !== 0) return []
  return String(listed.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function avdConfigPath(avd) {
  return path.join(homedir(), ".android", "avd", `${avd}.avd`, "config.ini")
}

/** Applies AVD_SETTINGS in place, replacing existing keys and appending absent ones. */
function applyAvdSettings(configPath) {
  const lines = readFileSync(configPath, "utf8").split(/\r?\n/)
  for (const [key, value] of Object.entries(AVD_SETTINGS)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}=`))
    if (index >= 0) lines[index] = `${key}=${value}`
    else lines.push(`${key}=${value}`)
  }
  writeFileSync(configPath, lines.filter((line, index) => line !== "" || index < lines.length - 1).join("\n"))
}

function createAvd(sdkPath, avd) {
  const avdmanager = executable(sdkPath, "cmdline-tools", "latest", "bin", "avdmanager")
  if (!existsSync(avdmanager)) {
    fail(EXIT.AVD_FAILED, `avdmanager not found at ${avdmanager}. Install the Android SDK command-line tools.`)
  }

  const sdkmanager = executable(sdkPath, "cmdline-tools", "latest", "bin", "sdkmanager")
  const imageDir = path.join(sdkPath, "system-images", "android-35", "google_apis_playstore", "x86_64")
  if (!existsSync(path.join(imageDir, "system.img"))) {
    process.stderr.write(`android-emulator: installing ${SYSTEM_IMAGE} (large download)\n`)
    const installed = spawnSync(sdkmanager, [SYSTEM_IMAGE], {
      encoding: "utf8",
      input: "y\n",
      env: { ...process.env, ANDROID_HOME: sdkPath, ANDROID_SDK_ROOT: sdkPath },
      windowsHide: true,
    })
    if (installed.status !== 0) {
      fail(EXIT.AVD_FAILED, `could not install ${SYSTEM_IMAGE}: ${installed.stderr ?? ""}`)
    }
  }

  const created = spawnSync(avdmanager, ["create", "avd", "-n", avd, "-k", SYSTEM_IMAGE, "-d", DEVICE_PROFILE], {
    encoding: "utf8",
    input: "no\n",
    env: { ...process.env, ANDROID_HOME: sdkPath, ANDROID_SDK_ROOT: sdkPath },
    windowsHide: true,
  })
  if (created.status !== 0) {
    fail(EXIT.AVD_FAILED, `avdmanager create failed: ${created.stderr ?? ""}`)
  }

  const configPath = avdConfigPath(avd)
  if (!existsSync(configPath)) {
    fail(EXIT.AVD_FAILED, `AVD created but ${configPath} is missing`)
  }
  applyAvdSettings(configPath)
}

function launchEmulator(sdkPath, avd, dns) {
  const emulator = executable(sdkPath, "emulator", "emulator")
  const logDir = path.join(tmpdir(), "orbit-emulator")
  mkdirSync(logDir, { recursive: true })
  const outLog = openSync(path.join(logDir, `${avd}.out.log`), "a")
  const errLog = openSync(path.join(logDir, `${avd}.err.log`), "a")

  const child = spawn(emulator, ["-avd", avd, "-dns-server", dns], {
    cwd: path.join(sdkPath, "emulator"),
    detached: true,
    stdio: ["ignore", outLog, errLog],
    env: { ...process.env, ANDROID_HOME: sdkPath, ANDROID_SDK_ROOT: sdkPath },
    windowsHide: false,
  })
  child.unref()
  return path.join(logDir, `${avd}.out.log`)
}

async function waitForBoot(adb, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000
  while (Date.now() < deadline) {
    for (const serial of bootedSerials(adb)) {
      if (isBootCompleted(adb, serial)) return serial
    }
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  return null
}

function report(options, result) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  const lines = [
    `avd:     ${result.avd}`,
    `state:   ${result.state}`,
    `serial:  ${result.serial ?? "-"}`,
    `sdk:     ${result.sdk}`,
    `created: ${result.created}`,
  ]
  process.stdout.write(`${lines.join("\n")}\n`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  const sdkPath = resolveSdkPath()
  if (!sdkPath) {
    fail(EXIT.NO_SDK, "Android SDK not found. Install Android Studio and set ANDROID_HOME.")
  }

  const adb = executable(sdkPath, "platform-tools", "adb")
  const emulator = executable(sdkPath, "emulator", "emulator")
  if (!existsSync(adb) || !existsSync(emulator)) {
    fail(EXIT.NO_SDK, `adb or emulator missing under ${sdkPath}. Install platform-tools and the emulator package.`)
  }

  const running = bootedSerials(adb).find((serial) => isBootCompleted(adb, serial)) ?? null
  const exists = listAvds(emulator).includes(options.avd)

  if (options.status) {
    report(options, {
      avd: options.avd,
      serial: running,
      state: running ? "ready" : exists ? "stopped" : "absent",
      sdk: sdkPath,
      created: false,
      booted: Boolean(running),
    })
    process.exit(EXIT.OK)
  }

  if (running) {
    report(options, {
      avd: options.avd,
      serial: running,
      state: "ready",
      sdk: sdkPath,
      created: false,
      booted: true,
    })
    process.exit(EXIT.OK)
  }

  let created = false
  if (!exists) {
    createAvd(sdkPath, options.avd)
    created = true
  }

  const logPath = launchEmulator(sdkPath, options.avd, options.dns)
  process.stderr.write(`android-emulator: booting ${options.avd}, log at ${logPath}\n`)

  const serial = await waitForBoot(adb, options.timeout)
  if (!serial) {
    fail(EXIT.BOOT_TIMEOUT, `${options.avd} did not report sys.boot_completed within ${options.timeout}s. See ${logPath}.`)
  }

  report(options, {
    avd: options.avd,
    serial,
    state: "ready",
    sdk: sdkPath,
    created,
    booted: true,
  })
}

await main()
