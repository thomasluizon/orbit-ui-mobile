#!/usr/bin/env node
// Captures one screenshot per manifest cell into .artifacts/surfaces/ against a
// running local stack (web :3000, orbit-api :5000). It produces the evidence the
// oracle checks; it never decides completion -- that stays with
// tools/check-surface-coverage.mjs reading the files this wrote.
//
// A surface this script cannot reach is REPORTED, never skipped silently: a
// silently skipped surface is exactly the failure the completion gate exists to
// prevent (.claude/rules/visual-delivery.md rule 1).

import { readFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MANIFEST_PATH = join(REPO_ROOT, ".claude", "manifests", "surfaces.json")
const ARTIFACT_DIR = join(REPO_ROOT, ".artifacts", "surfaces")
const UI_STORE_KEY = "orbit-ui-store"
const UI_STORE_VERSION = 2

const USAGE = `capture-surfaces - screenshot every surface in the manifest, per theme and locale.

Usage:
  node tools/capture-surfaces.mjs [--base-url <url>] [--filter <substring>]
                                  [--storage-state <path>] [--viewport <WxH>] [--help]

Requires a running local stack and an authenticated session. Supply the session
as either ORBIT_AUTH_TOKEN (the auth_token cookie value) or a Playwright
storageState file (--storage-state). There is no implicit session default: a
wrong session silently captures 200 login screens.

Flags:
  --base-url        web origin (default http://localhost:3000)
  --filter          only capture cells whose surfaceId contains this substring
  --storage-state   Playwright storageState JSON for the signed-in session
  --viewport        WxH (default 1280x900)
  --help            this text

Exit codes:
  0  every cell in scope captured
  1  at least one cell failed to capture
  2  preconditions missing (no manifest, no playwright, no session)
  3  cells in scope need a bespoke opener that is not implemented yet
`

// Overlays open from a bespoke trigger, so each needs its own opener. Only
// openers whose selectors are verified against a real spec live here; every
// other overlay is reported as unreachable rather than silently skipped.
// The create-habit opener mirrors apps/web/e2e/visual/habit-create.visual.ts.
const OPENERS = {
  "overlay-create-habit-modal": async (page) => {
    await page.locator('[data-bottom-nav] [data-tour="tour-fab-button"]').click()
    await page.getByTestId("habit-create-submit").waitFor({ state: "visible" })
  },
}

const FREEZE_MOTION_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
}
`

function parseArgs(argv) {
  const args = { baseUrl: "http://localhost:3000", filter: null, storageState: null, viewport: "1280x900" }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === "--base-url") args.baseUrl = argv[++index]
    else if (flag === "--filter") args.filter = argv[++index]
    else if (flag === "--storage-state") args.storageState = argv[++index]
    else if (flag === "--viewport") args.viewport = argv[++index]
  }
  return args
}

function cookiesFor(baseUrl, theme, locale) {
  const { hostname } = new URL(baseUrl)
  const base = { domain: hostname, path: "/", httpOnly: false, secure: false, sameSite: "Lax" }
  const cookies = [
    { ...base, name: "orbit_theme_mode", value: theme },
    { ...base, name: "i18n_locale", value: locale },
  ]
  if (process.env.ORBIT_AUTH_TOKEN) {
    cookies.push({ ...base, name: "auth_token", value: process.env.ORBIT_AUTH_TOKEN, httpOnly: true })
  }
  return cookies
}

/**
 * Why a cell cannot be captured generically, or null when it can be. Reported,
 * never silently skipped.
 */
export function unreachableReason(cell) {
  if (cell.kind === "route" && cell.href === null) {
    return { reason: "dynamic-route", detail: "URL needs a real id; no fixture id wired" }
  }
  if (cell.kind === "overlay" && !OPENERS[cell.surfaceId]) {
    return { reason: "needs-opener", detail: `no opener implemented for ${cell.sourceFile}` }
  }
  return null
}

async function captureCell(page, cell, baseUrl) {
  await page.addInitScript(
    ([storeKey, storeVersion, activeView]) => {
      if (!activeView) return
      window.localStorage.setItem(
        storeKey,
        JSON.stringify({ state: { activeView, searchQuery: "", selectedTagIds: [], activeFilters: {} }, version: storeVersion }),
      )
    },
    [UI_STORE_KEY, UI_STORE_VERSION, cell.viewState ?? null],
  )

  const target = new URL(cell.href ?? "/", baseUrl).toString()
  const response = await page.goto(target, { waitUntil: "domcontentloaded" })
  if (response && response.status() >= 400) {
    return { ok: false, reason: "http-error", detail: `${response.status()} at ${target}` }
  }

  await page.waitForLoadState("networkidle")
  await page.addStyleTag({ content: FREEZE_MOTION_CSS })

  const opener = OPENERS[cell.surfaceId]
  if (opener) await opener(page)

  await page.screenshot({
    path: join(ARTIFACT_DIR, `${cell.surfaceId}--${cell.theme}--${cell.locale}.png`),
    fullPage: true,
  })
  return { ok: true }
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE)
    return 0
  }
  const args = parseArgs(argv)

  if (!existsSync(MANIFEST_PATH)) {
    process.stderr.write("capture-surfaces: no manifest. Run: npm run surfaces:manifest\n")
    return 2
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))

  let chromium
  try {
    ;({ chromium } = await import("playwright"))
  } catch {
    try {
      ;({ chromium } = await import("@playwright/test"))
    } catch {
      process.stderr.write("capture-surfaces: playwright not resolvable. Run: npm --workspace @orbit/web exec playwright install chromium\n")
      return 2
    }
  }

  const storageStatePath = args.storageState ?? null
  if (storageStatePath && !existsSync(storageStatePath)) {
    process.stderr.write(`capture-surfaces: --storage-state ${storageStatePath} does not exist.\n`)
    return 2
  }
  if (!storageStatePath && !process.env.ORBIT_AUTH_TOKEN) {
    process.stderr.write(
      "capture-surfaces: no session. Set ORBIT_AUTH_TOKEN to the auth_token cookie value for the local stack, or pass --storage-state <path>.\n",
    )
    return 2
  }

  const inScope = manifest.cells.filter((cell) => !args.filter || cell.surfaceId.includes(args.filter))
  if (inScope.length === 0) {
    process.stderr.write(`capture-surfaces: filter "${args.filter}" matched no cells.\n`)
    return 2
  }

  const unreachable = []
  const cells = []
  for (const cell of inScope) {
    const blocked = unreachableReason(cell)
    if (blocked) unreachable.push({ cell, ...blocked })
    else cells.push(cell)
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true })
  const [width, height] = args.viewport.split("x").map(Number)
  const browser = await chromium.launch()
  const captured = []
  const failed = []

  for (const theme of manifest.themes) {
    for (const locale of manifest.locales) {
      const scoped = cells.filter((cell) => cell.theme === theme && cell.locale === locale)
      if (scoped.length === 0) continue

      const context = await browser.newContext({
        viewport: { width, height },
        colorScheme: theme,
        locale,
        storageState: storageStatePath ?? undefined,
      })
      await context.addCookies(cookiesFor(args.baseUrl, theme, locale))

      for (const cell of scoped) {
        const page = await context.newPage()
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" })
        try {
          const result = await captureCell(page, cell, args.baseUrl)
          if (result.ok) captured.push(cell)
          else failed.push({ cell, ...result })
        } catch (error) {
          failed.push({ cell, reason: "threw", detail: error.message })
        } finally {
          await page.close()
        }
      }
      await context.close()
    }
  }
  await browser.close()

  process.stdout.write(`captured ${captured.length}/${inScope.length} cells in scope into .artifacts/surfaces/\n`)

  if (failed.length > 0) {
    process.stdout.write(`\nFAILED (${failed.length}):\n`)
    for (const entry of failed) process.stdout.write(`  ${entry.cell.surfaceId}--${entry.cell.theme}--${entry.cell.locale}: ${entry.reason} - ${entry.detail}\n`)
  }

  if (unreachable.length > 0) {
    const surfaces = [...new Set(unreachable.map((entry) => `${entry.cell.surfaceId} (${entry.reason}) <- ${entry.cell.sourceFile}`))]
    process.stdout.write(`\nNOT REACHABLE GENERICALLY (${surfaces.length} surfaces, ${unreachable.length} cells).\n`)
    process.stdout.write("Each needs a bespoke opener in OPENERS, or a fixture id for its dynamic segment:\n")
    for (const surface of surfaces.sort()) process.stdout.write(`  ${surface}\n`)
  }

  process.stdout.write("\nverify with: npm run surfaces:check\n")
  if (failed.length > 0) return 1
  return unreachable.length > 0 ? 3 : 0
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`capture-surfaces: ${error.message}\n`)
      process.exit(1)
    },
  )
}
