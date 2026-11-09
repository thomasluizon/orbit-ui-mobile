#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout } from "node:timers/promises"
import { SaxesParser } from "saxes"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const UPDATE_REQUIRED_FAILURE = "build version is below the server minimum (update-required dialog rendered)"
const NOT_RESPONDING_FAILURE = "app is not responding before its first screen"
const SETTLED_NOT_RESPONDING_FAILURE = "app is not responding after its first screen"
const USAGE = `usage: android-boot.mjs --apk <universal.apk> --package <application id> --output <directory>

  Install an AAB-derived APK on the connected, already booted CI emulator.
  Clear app storage and cold start once. Require the signed-out first screen,
  a surviving process after a settle period and no app-UID fatal logcat entries.
  The first screen counts as rendered when its title or its input label is
  visible, because the keyboard can clip either one.
  Dismiss another process's Application Not Responding dialog with its Wait
  control inside the startup deadline and a 30 second settle deadline; the
  app's own dialog fails the boot. A screen capture without a hierarchy root
  counts as not rendered and retries inside the same deadlines.
  Retry adb infrastructure before launch only; never restart a failing app.

  --apk <path>       universal APK produced from the shipping AAB
  --package <id>     Android application id from Expo config
  --output <path>    retained XML, failed capture text, app logcat, process and dismissal evidence
  --help, -h         print usage and exit 0

exit codes: 0 first screen survived, 1 app assertion failed, 2 usage or infrastructure error`

function optionsFor(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    if (!["--apk", "--package", "--output"].includes(flag) || !argv[index + 1] || argv[index + 1].startsWith("-")) throw new Error(USAGE)
    options[flag.slice(2)] = argv[++index]
  }
  if (!options.apk || !options.output || !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(options.package ?? "")) throw new Error(USAGE)
  return { ...options, apk: resolve(options.apk), output: resolve(options.output) }
}

function visibleNodes(xml, packageName, accept) {
  const parser = new SaxesParser()
  parser.on("opentag", ({ name, attributes }) => {
    if (name !== "node" || attributes.package !== packageName || attributes.enabled !== "true") return
    const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attributes.bounds ?? "")?.slice(1).map(Number)
    if (bounds && bounds[2] > bounds[0] && bounds[3] > bounds[1]) accept(attributes, bounds)
  })
  parser.write(xml).close()
}

export function firstScreenRendered(xml, packageName, labels) {
  let found = false
  visibleNodes(xml, packageName, (attributes) => {
    if (labels.includes(attributes.text) || labels.includes(attributes["content-desc"])) found = true
  })
  return found
}

// AOSP android15-release core/res/res/layout/app_anr_dialog.xml names the dialog's Wait button aerr_wait.
export function notRespondingWaitControl(xml) {
  let center = null
  visibleNodes(xml, "android", (attributes, [left, top, right, bottom]) => {
    if (attributes["resource-id"] === "android:id/aerr_wait") center = { x: Math.floor((left + right) / 2), y: Math.floor((top + bottom) / 2) }
  })
  return center
}

// AOSP android15-release: DisplayContent.dump prints "  mCurrentFocus=" + WindowState.toString(), which is
// "Window{<hash> u<user> <title>}" plus " EXITING" while it animates out, and AppNotRespondingDialog titles its
// window "Application Not Responding: " + the process name of the application that stopped responding.
export function notRespondingProcess(windowDump) {
  return /^\s*mCurrentFocus=Window\{[0-9a-f]+ u\d+ Application Not Responding: ([^\s}]+)(?: EXITING)?\}\s*$/m.exec(windowDump)?.[1] ?? null
}

export function fatalLogcat(logcat) {
  return /FATAL EXCEPTION|Fatal signal \d+|Invariant Violation|\bF\s+ReactNativeJS\s*:|\bBridgelessReact\s*:\s*ReactHost\{-?\d+\}\.handleHostException\(/i.test(logcat)
}

function adb(args) {
  return spawnSync("adb", args, { encoding: "utf8", timeout: 30000, maxBuffer: 16 * 1024 * 1024 })
}

function requireAdb(args) {
  const result = adb(args)
  if (result.error || result.status !== 0) throw new Error(`adb ${args.join(" ")} failed: ${result.error?.message ?? result.stderr}`)
  return result.stdout
}

async function infrastructure(args) {
  for (let attempt = 1; ; attempt++) {
    try { return requireAdb(args) }
    catch (error) {
      if (attempt === 3) throw error
      await setTimeout(2000)
    }
  }
}

function startupLabels() {
  const translations = ["en", "pt-BR"].map((locale) => JSON.parse(readFileSync(join(ROOT, "packages/shared/src/i18n", `${locale}.json`), "utf8")))
  return {
    // The autofocused input opens the keyboard, which can clip either the title or the input label on the CI emulator.
    firstScreen: translations.flatMap((locale) => [locale.onboarding.flow.what.title, locale.onboarding.flow.what.label]),
    updateRequired: translations.map((locale) => locale.forceUpdate.title),
  }
}

function processId(packageName) {
  const result = adb(["shell", "pidof", "-s", packageName])
  if (result.error) throw new Error(`adb could not read the app process: ${result.error.message}`)
  return result.status === 0 ? result.stdout.trim() : ""
}

function capture(output, uid) {
  const logcat = requireAdb(["logcat", "-d", "-v", "threadtime", `--uid=${uid}`])
  writeFileSync(join(output, "app-logcat.txt"), logcat)
  return logcat
}

// AOSP frameworks/testing uiautomator DumpCommand prints its error and still exits 0 without writing the file, and
// adb exec-out exits 0 whatever the remote command returns, so only text that opens the dumper's hierarchy root is a screen.
// A failed capture returns null and keeps its text as evidence; a real dump that is malformed still throws from the parser.
function captureScreen(output) {
  requireAdb(["shell", "rm", "-f", "/sdcard/orbit-boot.xml"])
  requireAdb(["shell", "uiautomator", "dump", "/sdcard/orbit-boot.xml"])
  const dumped = requireAdb(["exec-out", "cat", "/sdcard/orbit-boot.xml"])
  if (!/^\s*(?:<\?xml[^>]*\?>\s*)?<hierarchy[\s>]/.test(dumped)) {
    writeFileSync(join(output, "screen-capture-failure.txt"), dumped)
    return null
  }
  writeFileSync(join(output, "first-screen.xml"), dumped)
  return dumped
}

function dismissNotResponding(output, process, wait, xml, count) {
  writeFileSync(join(output, `anr-dialog-${count}.xml`), xml)
  requireAdb(["shell", "input", "tap", String(wait.x), String(wait.y)])
  appendFileSync(join(output, "anr-dismissals.txt"), `${new Date(Date.now()).toISOString()} Application Not Responding: ${process} tapped Wait at ${wait.x},${wait.y}\n`)
}

// Another process's dialog is dismissed with its Wait control; the app's own dialog, or one for a process of the app, fails the boot.
function answerNotResponding(dialogs, xml) {
  const wait = notRespondingWaitControl(xml)
  const process = wait && notRespondingProcess(requireAdb(["shell", "dumpsys", "window", "displays"]))
  if (!process) return null
  if (process === dialogs.packageName || process.startsWith(`${dialogs.packageName}:`)) return "app"
  dismissNotResponding(dialogs.output, process, wait, xml, ++dialogs.dismissals)
  return "dismissed"
}

// The settled capture must show the first screen; only a failed capture or a dismissed foreign dialog allows another capture before the deadline.
async function settledScreenFailure(dialogs, labels) {
  const deadline = Date.now() + 30000
  for (;;) {
    const xml = captureScreen(dialogs.output)
    if (!xml) {
      if (Date.now() >= deadline) return "signed-out first screen unavailable after settling"
      await setTimeout(2000)
      continue
    }
    if (firstScreenRendered(xml, dialogs.packageName, labels.updateRequired)) return UPDATE_REQUIRED_FAILURE
    if (firstScreenRendered(xml, dialogs.packageName, labels.firstScreen)) return null
    const answer = answerNotResponding(dialogs, xml)
    if (answer === "app") return SETTLED_NOT_RESPONDING_FAILURE
    if (answer !== "dismissed" || Date.now() >= deadline) return "signed-out first screen unavailable after settling"
    await setTimeout(2000)
  }
}

async function assertApp({ package: packageName, output }, uid) {
  const labels = startupLabels()
  const deadline = Date.now() + 90000
  let firstProcess = ""
  let rendered = false
  const dialogs = { packageName, output, dismissals: 0 }
  while (Date.now() < deadline) {
    if (fatalLogcat(capture(output, uid))) return "app logcat contains a fatal startup error"
    const currentProcess = processId(packageName)
    if (!currentProcess) return "app process unavailable before its first screen"
    if (firstProcess && firstProcess !== currentProcess) return "app process restarted during startup"
    firstProcess = currentProcess
    const xml = captureScreen(output)
    if (xml) {
      if (firstScreenRendered(xml, packageName, labels.updateRequired)) return UPDATE_REQUIRED_FAILURE
      if (firstScreenRendered(xml, packageName, labels.firstScreen)) { rendered = true; break }
      if (answerNotResponding(dialogs, xml) === "app") return NOT_RESPONDING_FAILURE
    }
    await setTimeout(2000)
  }
  if (!rendered) return "signed-out first screen did not render within 90 seconds"
  await setTimeout(15000)
  const settledScreen = await settledScreenFailure(dialogs, labels)
  const settledProcess = processId(packageName)
  writeFileSync(join(output, "process.txt"), `initial=${firstProcess}\nsettled=${settledProcess}\n`)
  if (fatalLogcat(capture(output, uid))) return "app logcat contains a fatal error after settling"
  if (!settledProcess || settledProcess !== firstProcess) return "app process exited or restarted after its first screen"
  return settledScreen
}

async function run(options) {
  mkdirSync(options.output, { recursive: true })
  if ((await infrastructure(["shell", "getprop", "sys.boot_completed"])).trim() !== "1") throw new Error("emulator has not booted")
  const abis = (await infrastructure(["shell", "getprop", "ro.product.cpu.abilist"])).trim()
  writeFileSync(join(options.output, "emulator-abis.txt"), `${abis}\n`)
  if (!abis.split(",").includes("x86_64")) throw new Error("emulator image does not support the shipping x86_64 libraries")
  await infrastructure(["install", "--no-streaming", "-r", options.apk])
  await infrastructure(["shell", "pm", "clear", options.package])
  const packages = await infrastructure(["shell", "cmd", "package", "list", "packages", "--user", "0", "-U", options.package])
  writeFileSync(join(options.output, "package-uid.txt"), packages)
  const record = packages.trim().split(/\r?\n/).find((line) => line.startsWith(`package:${options.package} uid:`))
  const uid = record?.slice(`package:${options.package} uid:`.length)
  if (!/^\d+$/.test(uid ?? "")) throw new Error("package manager did not report a unique app UID")
  await infrastructure(["logcat", "-c"])
  try {
    requireAdb(["shell", "am", "force-stop", options.package])
    requireAdb(["shell", "am", "start", "-W", "-n", `${options.package}/.MainActivity`])
    const failure = await assertApp(options, uid)
    writeFileSync(join(options.output, "verdict.txt"), `${failure ?? "passed"}\n`)
    if (failure) { console.error(`Android boot failed: ${failure}`); return 1 }
    console.log("Android boot passed: first screen rendered, process survived, app logcat has no fatal errors.")
    return 0
  } finally {
    capture(options.output, uid)
    if (!existsSync(join(options.output, "first-screen.xml"))) {
      try { captureScreen(options.output) }
      catch (error) { console.error(`Android boot XML unavailable: ${error.message}`) }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--help") || process.argv.includes("-h")) console.log(USAGE)
  else {
    try { process.exitCode = await run(optionsFor(process.argv.slice(2))) }
    catch (error) { console.error(`android-boot: ${error.message}`); process.exitCode = 2 }
  }
}
