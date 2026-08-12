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
const VERIFY_HOST = "api.useorbit.org"
const BOOT_TIMEOUT_SECONDS = 420
const SHUTDOWN_TIMEOUT_SECONDS = 60

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
  node tools/android-emulator.mjs [--status] [--avd <name>] [--dns <servers>]
                                  [--verify-host <host>] [--timeout <seconds>] [--json]

Creates the AVD "${AVD_NAME}" when it does not exist, boots it with explicit DNS
servers, and waits until the guest reports sys.boot_completed=1. Every serial is matched
to its own AVD, so an unrelated emulator is never reported or targeted. A running AVD is
reused only when it can still resolve --verify-host; otherwise it is restarted with --dns,
because an emulator started elsewhere inherits the host resolver.

Options:
  --status            Report the current state and exit without creating or booting anything.
  --avd <name>        AVD to use. Default: ${AVD_NAME}
  --dns <servers>     Comma-separated DNS servers passed to -dns-server. Default: ${DNS_SERVERS}
  --verify-host <host> Host the guest must resolve before a running AVD is reused. Default: ${VERIFY_HOST}
  --timeout <seconds> Seconds to wait for boot. Default: ${BOOT_TIMEOUT_SECONDS}
  --shutdown-timeout <seconds> Seconds to wait for a restarted AVD to leave adb devices. Default: ${SHUTDOWN_TIMEOUT_SECONDS}
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
    verifyHost: VERIFY_HOST,
    shutdownTimeout: SHUTDOWN_TIMEOUT_SECONDS,
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
    } else if (arg === "--avd" || arg === "--dns" || arg === "--verify-host" || arg === "--timeout" || arg === "--shutdown-timeout") {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith("--")) {
        fail(EXIT.INVALID_INPUT, `${arg} requires a value`)
      }
      index += 1
      if (arg === "--avd") options.avd = value
      else if (arg === "--dns") options.dns = value
      else if (arg === "--verify-host") options.verifyHost = value
      else if (arg === "--shutdown-timeout") {
        const seconds = Number(value)
        if (!Number.isFinite(seconds) || seconds <= 0) {
          fail(EXIT.INVALID_INPUT, `--shutdown-timeout requires a positive number of seconds, got ${value}`)
        }
        options.shutdownTimeout = seconds
      }
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

/**
 * Node cannot spawn a .bat or .cmd file without a command processor, and the SDK ships
 * `sdkmanager.bat` and `avdmanager.bat` on Windows. Those paths run through a shell, with the
 * command quoted because the SDK lives under a path containing spaces on a default install.
 * https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows
 */
function run(command, args, options = {}) {
  const needsShell = process.platform === "win32" && /\.(bat|cmd)$/i.test(command)
  return spawnSync(needsShell ? `"${command}"` : command, args, {
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    input: options.input,
    shell: needsShell,
    windowsHide: true,
  })
}

/**
 * Every serial `adb devices` lists, whatever its transport state, or null when the command itself
 * failed. Shutdown is judged against this, never against the `device`-only view: a serial sitting in
 * `offline` is still holding its AVD lock, and an empty list from a failed command is not evidence
 * of anything.
 */
function listedSerials(adb) {
  const listed = run(adb, ["devices"])
  if (listed.status !== 0) return null
  return String(listed.stdout ?? "")
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[0].startsWith("emulator-"))
    .map((parts) => parts[0])
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

/**
 * The AVD behind one serial, or null when it cannot be established. Every caller treats null as
 * "not the requested AVD", because a serial this tool cannot identify must never receive an install.
 */
function avdNameForSerial(adb, serial) {
  const named = run(adb, ["-s", serial, "emu", "avd", "name"])
  if (named.status !== 0) return null
  const line = String(named.stdout ?? "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry && entry !== "OK" && !entry.startsWith("error"))
  return line ?? null
}

/** The booted serial running `avd`, or null. Identity is proven per serial, never assumed from order. */
function readySerialFor(adb, avd) {
  return (
    bootedSerials(adb).find((serial) => isBootCompleted(adb, serial) && avdNameForSerial(adb, serial) === avd) ?? null
  )
}

/**
 * Any serial running `avd`, booted or still starting. A starting AVD holds its lock exactly like a
 * ready one, so the launch decision must consult this rather than readiness.
 */
function presentSerialFor(adb, avd) {
  return (listedSerials(adb) ?? []).find((serial) => avdNameForSerial(adb, serial) === avd) ?? null
}

/**
 * Waits for one specific serial to finish booting, re-proving its identity on every poll. A serial is
 * a reused TCP port, not a stable name: the adopted process can exit and another emulator can take
 * the same port, so one identity check at adoption time is not enough. Returns the serial, or null
 * when it times out or stops being the requested AVD.
 */
async function waitForBootOf(adb, serial, avd, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000
  while (Date.now() < deadline) {
    if (avdNameForSerial(adb, serial) !== avd) return null
    if (isBootCompleted(adb, serial)) return serial
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  return null
}

/**
 * Serials that `adb devices` lists but that cannot state which AVD they are, typically because they
 * are still `offline`. One of them may be the requested AVD, so launching alongside them risks the
 * duplicate-launch race this tool exists to avoid. The caller must refuse rather than guess.
 */
function unidentifiedSerials(adb) {
  return (listedSerials(adb) ?? []).filter((serial) => avdNameForSerial(adb, serial) === null)
}

/**
 * Whether the guest can resolve `host`. A running emulator started without `-dns-server` inherits the
 * host resolver, which is exactly the failure this tool exists to prevent, so reuse is gated on this
 * rather than on the process merely being up. Observed failure text on 2026-08-12:
 * `ping: unknown host api.useorbit.org`, against a success line beginning `PING `.
 */
function resolvesHost(adb, serial, host) {
  const probe = run(adb, ["-s", serial, "shell", "ping", "-c", "1", "-W", "4", "-I", "wlan0", host])
  return /^PING /m.test(String(probe.stdout ?? ""))
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

  const sdkEnv = { ANDROID_HOME: sdkPath, ANDROID_SDK_ROOT: sdkPath }
  const sdkmanager = executable(sdkPath, "cmdline-tools", "latest", "bin", "sdkmanager")
  const imageDir = path.join(sdkPath, "system-images", "android-35", "google_apis_playstore", "x86_64")
  if (!existsSync(path.join(imageDir, "system.img"))) {
    process.stderr.write(`android-emulator: installing ${SYSTEM_IMAGE} (large download)\n`)
    const installed = run(sdkmanager, [SYSTEM_IMAGE], { input: "y\n", env: sdkEnv })
    if (installed.status !== 0) {
      fail(EXIT.AVD_FAILED, `could not install ${SYSTEM_IMAGE}: ${installed.stderr ?? ""}`)
    }
  }

  const created = run(avdmanager, ["create", "avd", "-n", avd, "-k", SYSTEM_IMAGE, "-d", DEVICE_PROFILE], {
    input: "no\n",
    env: sdkEnv,
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

/**
 * True once `serial` has left `adb devices` entirely. The caller must not launch before this holds.
 * A failed listing keeps waiting rather than counting as departure, so a transient `adb` error can
 * never license a relaunch into the running process.
 */
async function waitForShutdown(adb, serial, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000
  while (Date.now() < deadline) {
    const serials = listedSerials(adb)
    if (serials !== null && !serials.includes(serial)) return true
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  return false
}

async function waitForBoot(adb, avd, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000
  while (Date.now() < deadline) {
    const serial = readySerialFor(adb, avd)
    if (serial) return serial
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

  const exists = listAvds(emulator).includes(options.avd)

  if (options.status) {
    const ready = readySerialFor(adb, options.avd)
    const booting = ready ? null : presentSerialFor(adb, options.avd)
    report(options, {
      avd: options.avd,
      serial: ready ?? booting,
      state: ready ? "ready" : booting ? "booting" : exists ? "stopped" : "absent",
      sdk: sdkPath,
      created: false,
      booted: Boolean(ready),
    })
    process.exit(EXIT.OK)
  }

  /**
   * Adopt an instance of this AVD that is merely BOOTING, never launch alongside it. Matching on
   * boot completion alone hid a starting AVD, so a second launch raced the first for the same AVD
   * lock. Adoption waits for that serial specifically, then falls through to the same DNS gate,
   * because an instance this tool did not start carries no DNS guarantee.
   */
  let running = readySerialFor(adb, options.avd)
  if (!running) {
    const booting = presentSerialFor(adb, options.avd)
    if (booting) {
      process.stderr.write(`android-emulator: ${options.avd} is already starting as ${booting}; waiting for it\n`)
      running = await waitForBootOf(adb, booting, options.avd, options.timeout)
      if (!running) {
        fail(
          EXIT.BOOT_TIMEOUT,
          `${booting} was already starting but never completed boot as ${options.avd} within ${options.timeout}s.`,
        )
      }
    } else {
      // An offline serial cannot answer `emu avd name`, so it could be this very AVD. Refusing is the
      // only safe reading: launching alongside it recreates the duplicate-launch race.
      const unknown = unidentifiedSerials(adb)
      if (unknown.length > 0) {
        fail(
          EXIT.FAILED,
          `cannot identify ${unknown.join(", ")}; one of them may be ${options.avd}. Wait for it, or stop it, then retry.`,
        )
      }
    }
  }

  if (running) {
    // Reuse only survives the DNS check. An emulator someone else started (Android Studio, a bare
    // `emulator -avd`) inherits the host resolver, and this tool must not report that as ready.
    if (resolvesHost(adb, running, options.verifyHost)) {
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
    process.stderr.write(
      `android-emulator: ${running} cannot resolve ${options.verifyHost}; restarting it with -dns-server ${options.dns}\n`,
    )
    const killed = run(adb, ["-s", running, "emu", "kill"])
    if (killed.status !== 0) {
      fail(EXIT.FAILED, `could not stop ${running}: ${(killed.stderr || killed.stdout || "").trim()}`)
    }
    // Confirmed shutdown, never a fixed delay: a surviving process keeps the AVD lock, and
    // waitForBoot would then rediscover this same DNS-broken serial and call it ready.
    if (!(await waitForShutdown(adb, running, options.shutdownTimeout))) {
      fail(EXIT.FAILED, `${running} was still present ${options.shutdownTimeout}s after emu kill; stop it and retry.`)
    }
  }

  let created = false
  if (!exists) {
    createAvd(sdkPath, options.avd)
    created = true
  }

  const logPath = launchEmulator(sdkPath, options.avd, options.dns)
  process.stderr.write(`android-emulator: booting ${options.avd}, log at ${logPath}\n`)

  const serial = await waitForBoot(adb, options.avd, options.timeout)
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
