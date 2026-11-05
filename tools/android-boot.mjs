#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout } from "node:timers/promises"
import { SaxesParser } from "saxes"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const USAGE = `usage: android-boot.mjs --apk <universal.apk> --package <application id> --output <directory>

  Install an AAB-derived APK on the connected, already booted CI emulator.
  Clear app storage and cold start once. Require the signed-out first screen,
  a surviving process after a settle period and no app-UID fatal logcat entries.
  Retry adb infrastructure before launch only; never restart a failing app.

  --apk <path>       universal APK produced from the shipping AAB
  --package <id>     Android application id from Expo config
  --output <path>    retained XML, app logcat and process evidence
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

export function firstScreenRendered(xml, packageName, labels) {
  let found = false
  const parser = new SaxesParser()
  parser.on("opentag", ({ name, attributes }) => {
    if (name !== "node" || attributes.package !== packageName || attributes.enabled !== "true") return
    const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attributes.bounds ?? "")
    if (!bounds || Number(bounds[3]) <= Number(bounds[1]) || Number(bounds[4]) <= Number(bounds[2])) return
    if (labels.includes(attributes.text) || labels.includes(attributes["content-desc"])) found = true
  })
  parser.write(xml).close()
  return found
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

function firstScreenLabels() {
  return ["en", "pt-BR"].map((locale) => {
    const translations = JSON.parse(readFileSync(join(ROOT, "packages/shared/src/i18n", `${locale}.json`), "utf8"))
    return translations.onboarding.flow.what.title
  })
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

function captureScreen(output) {
  requireAdb(["shell", "rm", "-f", "/sdcard/orbit-boot.xml"])
  requireAdb(["shell", "uiautomator", "dump", "/sdcard/orbit-boot.xml"])
  const xml = requireAdb(["exec-out", "cat", "/sdcard/orbit-boot.xml"])
  writeFileSync(join(output, "first-screen.xml"), xml)
  return xml
}

async function assertApp({ package: packageName, output }, uid) {
  const labels = firstScreenLabels()
  const deadline = Date.now() + 90000
  let firstProcess = ""
  let rendered = false
  while (Date.now() < deadline) {
    if (fatalLogcat(capture(output, uid))) return "app logcat contains a fatal startup error"
    const currentProcess = processId(packageName)
    if (!currentProcess) return "app process unavailable before its first screen"
    if (firstProcess && firstProcess !== currentProcess) return "app process restarted during startup"
    firstProcess = currentProcess
    const xml = captureScreen(output)
    if (firstScreenRendered(xml, packageName, labels)) { rendered = true; break }
    await setTimeout(2000)
  }
  if (!rendered) return "signed-out first screen did not render within 90 seconds"
  await setTimeout(15000)
  const settledProcess = processId(packageName)
  writeFileSync(join(output, "process.txt"), `initial=${firstProcess}\nsettled=${settledProcess}\n`)
  if (fatalLogcat(capture(output, uid))) return "app logcat contains a fatal error after settling"
  if (!settledProcess || settledProcess !== firstProcess) return "app process exited or restarted after its first screen"
  return null
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
