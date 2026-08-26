#!/usr/bin/env node
/**
 * Captures manifest-backed Android surfaces from an installed capture build.
 *
 * Build first with capture mode compiled in:
 *   $env:EXPO_PUBLIC_CAPTURE_MODE='true'; npm run android:apk:emulator -w @orbit/mobile
 *
 * The capture build accepts captureTheme and captureLocale deep-link query parameters,
 * disables router, React Native Animated, and Reanimated motion, and exposes a route
 * probe that each Maestro flow asserts before writing its PNG.
 */

import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = resolve(TOOLS_DIR, "..")
const DEFAULT_MANIFEST = join(REPOSITORY_ROOT, ".claude", "manifests", "surfaces.json")
const FLOW_DIRECTORY = join(REPOSITORY_ROOT, ".maestro", "surfaces")
const APP_ID = "org.useorbit.app"
const EXIT = { OK: 0, FAILED: 1, INVALID_INPUT: 2, UNREACHABLE: 3 }

const USAGE = `capture-surfaces-mobile.mjs - capture Android surfaces from the manifest

Usage:
  node tools/capture-surfaces-mobile.mjs --surface <surface-id> [--surface <surface-id> ...]
    [--theme <all|light|dark>] [--locale <all|en|pt-BR>]
    [--driver <maestro|adb>] [--serial <emulator-serial>]
    [--output <directory>] [--manifest <path>] [--settle-ms <milliseconds>] [--dry-run]

Prerequisites:
  1. Build the harness APK with EXPO_PUBLIC_CAPTURE_MODE=true and android:apk:emulator.
  2. Install it on a running Android emulator.
  3. Put Maestro on PATH for the default driver. Set MAESTRO_BIN to override its path.

Options:
  --surface <id>       Exact mobile surface id from .claude/manifests/surfaces.json. Repeatable.
  --theme <value>      Capture one theme or all themes. Default: all.
  --locale <value>     Capture one locale or all locales. Default: all.
  --driver <value>     maestro, or adb for the framework-free fallback. Default: maestro.
  --serial <value>     Explicit emulator serial. Passed to Maestro --device or adb -s.
  --output <path>      Run directory. Default: .artifacts/mobile-surfaces/<UTC timestamp>.
  --manifest <path>    Manifest override, resolved from the repository root.
  --settle-ms <value>  Fallback-only fixed delay after am start. Default: 2000.
  --dry-run            Validate and print the plan without contacting an emulator.
  --help, -h           Print this usage and exit 0.

Output:
  PNG files plus report.json in the run directory. Every unsupported or unreachable cell is listed.

Exit codes:
  0  every selected cell was captured, or a reachable dry-run plan was produced
  1  a capture command failed or did not produce a fresh PNG
  2  invalid input, missing manifest, or no matching cells
  3  one or more selected cells were unreachable
`

function fail(message) {
  process.stderr.write(`capture-surfaces-mobile: ${message}\n`)
  return EXIT.INVALID_INPUT
}

function parseArgs(argv) {
  const options = {
    surfaces: [],
    theme: "all",
    locale: "all",
    driver: "maestro",
    serial: null,
    output: null,
    manifest: DEFAULT_MANIFEST,
    settleMs: 2000,
    dryRun: false,
    help: false,
    error: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === "--help" || flag === "-h") {
      options.help = true
    } else if (flag === "--dry-run") {
      options.dryRun = true
    } else if (["--surface", "--theme", "--locale", "--driver", "--serial", "--output", "--manifest", "--settle-ms"].includes(flag)) {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith("--")) {
        options.error = `${flag} requires a value`
        break
      }
      index += 1
      if (flag === "--surface") options.surfaces.push(value)
      else if (flag === "--settle-ms") options.settleMs = Number(value)
      else if (flag === "--output") options.output = resolveFromRepository(value)
      else if (flag === "--manifest") options.manifest = resolveFromRepository(value)
      else options[flag.slice(2)] = value
    } else {
      options.error = `unknown argument: ${flag}`
      break
    }
  }

  if (!options.error && options.surfaces.length === 0 && !options.help) {
    options.error = "at least one --surface is required"
  }
  if (!options.error && !["all", "light", "dark"].includes(options.theme)) {
    options.error = `--theme must be all, light, or dark, got ${options.theme}`
  }
  if (!options.error && !["all", "en", "pt-BR"].includes(options.locale)) {
    options.error = `--locale must be all, en, or pt-BR, got ${options.locale}`
  }
  if (!options.error && !["maestro", "adb"].includes(options.driver)) {
    options.error = `--driver must be maestro or adb, got ${options.driver}`
  }
  if (!options.error && (!Number.isInteger(options.settleMs) || options.settleMs < 0)) {
    options.error = `--settle-ms must be a non-negative integer, got ${options.settleMs}`
  }
  return options
}

function resolveFromRepository(path) {
  return isAbsolute(path) ? resolve(path) : resolve(REPOSITORY_ROOT, path)
}

function timestampDirectory() {
  const stamp = new Date().toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
  return join(REPOSITORY_ROOT, ".artifacts", "mobile-surfaces", stamp)
}

export function mobileUnreachableReason(cell, driver = "maestro", flowDirectory = FLOW_DIRECTORY) {
  if (cell.state && cell.state !== "default") {
    return { reason: "state-not-capturable", detail: `state ${cell.state} needs a bespoke deterministic flow` }
  }
  if (cell.kind !== "route") {
    return { reason: "needs-surface-flow", detail: `${cell.kind} surface has no deterministic deep-link entry point` }
  }
  if (!cell.href || cell.href.includes("[")) {
    return { reason: "dynamic-route", detail: "route needs a concrete parameter value" }
  }
  if (driver === "maestro" && !existsSync(join(flowDirectory, `${cell.surfaceId}.yaml`))) {
    return { reason: "missing-flow", detail: `no .maestro/surfaces/${cell.surfaceId}.yaml flow exists` }
  }
  return null
}

export function buildCaptureDeepLink(cell, theme, locale) {
  const path = cell.href === "/" ? "" : cell.href.replace(/^\//, "")
  const query = new URLSearchParams({ captureTheme: theme, captureLocale: locale })
  return `orbit://${path}?${query}`
}

function captureFilename(cell) {
  return `${cell.surfaceId}--${cell.state ?? "default"}--${cell.theme}--${cell.locale}`
}

export function planMobileCaptures(manifest, options, flowDirectory = FLOW_DIRECTORY) {
  const selectedIds = new Set(options.surfaces)
  const knownIds = new Set(manifest.cells.filter((cell) => cell.platform === "mobile").map((cell) => cell.surfaceId))
  const unknownIds = [...selectedIds].filter((surfaceId) => !knownIds.has(surfaceId))
  if (unknownIds.length > 0) {
    throw new Error(`unknown mobile surface id${unknownIds.length === 1 ? "" : "s"}: ${unknownIds.join(", ")}`)
  }

  const selected = manifest.cells.filter((cell) =>
    cell.platform === "mobile" &&
    selectedIds.has(cell.surfaceId) &&
    (options.theme === "all" || cell.theme === options.theme) &&
    (options.locale === "all" || cell.locale === options.locale)
  )
  const captures = []
  const unreachable = []
  for (const cell of selected) {
    const blocked = mobileUnreachableReason(cell, options.driver, flowDirectory)
    if (blocked) unreachable.push({ cell, ...blocked })
    else captures.push(cell)
  }
  return { captures, unreachable, selectedCount: selected.length }
}

function runProcess(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: REPOSITORY_ROOT,
    encoding: options.binary ? null : "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    maxBuffer: 32 * 1024 * 1024,
    shell: process.platform === "win32" && /\.(?:bat|cmd)$/i.test(command),
    windowsHide: true,
  })
}

function maestroExecutable() {
  if (process.env.MAESTRO_BIN) return process.env.MAESTRO_BIN
  const candidates = process.platform === "win32"
    ? ["maestro.bat", "maestro.cmd", "maestro"].map((name) => join(homedir(), ".maestro", "bin", name))
    : [join(homedir(), ".maestro", "bin", "maestro")]
  return candidates.find((candidate) => existsSync(candidate)) ?? "maestro"
}

export function maestroEnvironmentArguments(variables) {
  return Object.entries(variables).flatMap(([name, value]) => ["-e", `${name}=${value}`])
}

function maestroCapture(cell, options, outputBase) {
  const maestro = maestroExecutable()
  const flow = join(FLOW_DIRECTORY, `${cell.surfaceId}.yaml`)
  const captureName = captureFilename(cell)
  const pngBase = join(outputBase, captureName)
  const debugOutput = join(outputBase, ".maestro", captureName)
  const bundledPng = join(debugOutput, cell.surfaceId, "takeScreenshot", `${captureName}.png`)
  const link = buildCaptureDeepLink(cell, cell.theme, cell.locale)
  // Maestro suffixes an existing flattened flow folder as `<surfaceId>-2`, so a reused output
  // directory would leave the hard-coded bundledPng path pointing at the PREVIOUS run's screenshot.
  // Clearing it first keeps that path correct by construction rather than by naming luck.
  rmSync(debugOutput, { recursive: true, force: true })
  const args = [
    "test",
    ...maestroEnvironmentArguments({ CAPTURE_LINK: link, CAPTURE_PATH: captureName }),
    "--debug-output", debugOutput,
    "--flatten-debug-output",
  ]
  if (options.serial) args.push("--device", options.serial)
  args.push(flow)
  const startedAt = Date.now()
  const result = runProcess(maestro, args)
  if (!result.error && result.status === 0 && existsSync(bundledPng)) {
    copyFileSync(bundledPng, `${pngBase}.png`)
  }
  return captureResult(cell, `${pngBase}.png`, startedAt, result, "maestro")
}

async function adbCapture(cell, options, outputBase) {
  const adb = process.env.ADB_BIN || "adb"
  const target = buildCaptureDeepLink(cell, cell.theme, cell.locale)
  const prefix = options.serial ? ["-s", options.serial] : []
  const started = runProcess(adb, [...prefix, "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", target, APP_ID])
  if (started.error || started.status !== 0) {
    return captureResult(cell, null, Date.now(), started, "adb-am-start")
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, options.settleMs))
  const pngPath = join(outputBase, `${captureFilename(cell)}.png`)
  const startedAt = Date.now()
  const screenshot = runProcess(adb, [...prefix, "exec-out", "screencap", "-p"], { binary: true })
  if (!screenshot.error && screenshot.status === 0 && Buffer.isBuffer(screenshot.stdout)) {
    writeFileSync(pngPath, screenshot.stdout)
  }
  return captureResult(cell, pngPath, startedAt, screenshot, "adb-screencap")
}

export function summarizeCommandOutput(output, maxCharacters = 8000) {
  if (output.length <= maxCharacters) return output
  const half = Math.floor(maxCharacters / 2)
  const omitted = output.length - (half * 2)
  return `${output.slice(0, half)}\n... ${omitted} characters omitted ...\n${output.slice(-half)}`
}

function commandOutput(commandResult) {
  const streams = [commandResult.stderr, commandResult.stdout]
    .filter((stream) => typeof stream === "string" && stream.trim().length > 0)
    .map((stream) => stream.trim())
  if (streams.length === 0) return ""
  return `: ${summarizeCommandOutput(streams.join(" | "))}`
}

function captureResult(cell, pngPath, startedAt, commandResult, command) {
  if (commandResult.error || commandResult.status !== 0) {
    // A nonzero Maestro exit is NOT evidence that the surface is unreachable. TestRunner.runSingle
    // collapses a failed route assertion, a driver timeout and any other flow exception into the same
    // status, so inferring "unreachable" from the exit code reports a broken flow or a dead emulator as
    // a product fact. Runtime failures are reported as failures, carrying Maestro's own output so the
    // real cause is readable. Only the plan marks a cell unreachable, where the evidence is real.
    return {
      cell,
      ok: false,
      command,
      detail: commandResult.error?.message ?? `exit ${commandResult.status}${commandOutput(commandResult)}`,
    }
  }
  if (!pngPath || !existsSync(pngPath)) {
    return { cell, ok: false, command, detail: "capture command produced no PNG" }
  }
  const file = statSync(pngPath)
  if (file.size === 0 || file.mtimeMs + 1000 < startedAt) {
    return { cell, ok: false, command, detail: "capture command produced no fresh PNG bytes" }
  }
  return { cell, ok: true, command, path: pngPath, bytes: file.size }
}

function relativeOutput(path) {
  const withinRepository = relative(REPOSITORY_ROOT, path)
  return withinRepository.startsWith("..") ? path : withinRepository.replaceAll("\\", "/")
}

function writeReport(output, report) {
  mkdirSync(output, { recursive: true })
  const reportPath = join(output, "report.json")
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  return reportPath
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(USAGE)
    return EXIT.OK
  }
  if (options.error) return fail(options.error)
  if (!existsSync(options.manifest)) return fail(`manifest not found: ${options.manifest}`)

  let manifest
  try {
    manifest = JSON.parse(readFileSync(options.manifest, "utf8"))
  } catch (error) {
    return fail(`could not read manifest: ${error.message}`)
  }

  let plan
  try {
    plan = planMobileCaptures(manifest, options)
  } catch (error) {
    return fail(error.message)
  }
  if (plan.selectedCount === 0) return fail("the selected theme and locale matched no cells")

  const output = options.output ?? timestampDirectory()
  mkdirSync(output, { recursive: true })
  const captured = []
  const failed = []
  if (!options.dryRun) {
    for (const cell of plan.captures) {
      const result = options.driver === "maestro"
        ? maestroCapture(cell, options, output)
        : await adbCapture(cell, options, output)
      if (result.ok) captured.push(result)
      else failed.push(result)
    }
  }

  const report = {
    driver: options.driver,
    dryRun: options.dryRun,
    selectedCells: plan.selectedCount,
    plannedCells: plan.captures.length,
    captured: captured.map((entry) => ({ ...entry, cell: entry.cell.surfaceId, path: relativeOutput(entry.path) })),
    failed: failed.map((entry) => ({ ...entry, cell: entry.cell.surfaceId })),
    unreachable: [
      ...plan.unreachable.map((entry) => ({
        cell: entry.cell.surfaceId,
        state: entry.cell.state ?? "default",
        theme: entry.cell.theme,
        locale: entry.cell.locale,
        sourceFile: entry.cell.sourceFile,
        reason: entry.reason,
        detail: entry.detail,
      })),
    ],
  }
  const reportPath = writeReport(output, report)
  process.stdout.write(`${options.dryRun ? "planned" : "captured"} ${options.dryRun ? plan.captures.length : captured.length}/${plan.selectedCount} cells into ${relativeOutput(output)}\n`)
  if (report.unreachable.length > 0) {
    process.stdout.write(`\nUNREACHABLE (${report.unreachable.length}):\n`)
    for (const entry of report.unreachable) {
      process.stdout.write(`  ${entry.cell}--${entry.state}--${entry.theme}--${entry.locale}: ${entry.reason} - ${entry.detail}\n`)
    }
  }
  if (failed.length > 0) {
    process.stdout.write(`\nFAILED (${failed.length}):\n`)
    for (const entry of report.failed) {
      process.stdout.write(`  ${entry.cell}: ${entry.command} - ${entry.detail}\n`)
    }
  }
  process.stdout.write(`report: ${relativeOutput(reportPath)}\n`)
  if (failed.length > 0) return EXIT.FAILED
  if (report.unreachable.length > 0) return EXIT.UNREACHABLE
  return EXIT.OK
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`capture-surfaces-mobile: ${error.message}\n`)
      process.exit(EXIT.FAILED)
    },
  )
}
