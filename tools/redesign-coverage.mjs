#!/usr/bin/env node
// Asserts the redesign's denominator twice over (REBUILD.md D35 + D38):
// 1. EVERY surface in .claude/manifests/surfaces.json is claimed by exactly one redesign
//    ticket. A surface claimed by no ticket is the failure mode this exists to prevent:
//    it is how "we redesigned the whole app" silently ships with screens nobody looked at.
// 2. EVERY .tsx AND co-located StyleSheet module (*.styles.ts, *-styles.ts, styles.ts) under
//    apps/*/app and apps/*/components maps to exactly one ticket by directory rule (D38, 8.5.2),
//    because the manifest only sees files a surface closure reaches; the 2026-07-24 denominator
//    audit confirmed orphan component files it cannot. Style modules are covered because they
//    carry the local/spacing-scale and z-index suppressions the redesign must own.
// Exits 1 on any unclaimed surface or orphaned file. Multi-match is resolved first-rule-wins.
//
// Usage: node tools/redesign-coverage.mjs [--json]

import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MANIFEST_PATH = join(REPO_ROOT, ".claude", "manifests", "surfaces.json")

const has =
  (...needles) =>
  (id) =>
    needles.some((needle) => id.includes(needle))

/** Ordered; first match wins. Every entry becomes one Linear ticket in the #539 project. */
export const TICKETS = [
  ["R1-primitive-overlay", "Overlay, sheet, dialog, popover, menu and picker primitives",
    has("-ui-app-overlay", "-ui-centered-overlay", "-ui-confirm-dialog", "-ui-context-menu",
      "-ui-popover", "-ui-app-date-picker", "-ui-app-time-picker", "-ui-app-select",
      "-ui-anchored-menu", "confirm-dialogs")],
  ["R2-primitive-shell", "App shell, page header, rail, tab bar, filter pills, command palette",
    has("-app-layout", "-app-today-shell", "-shell-rail-drawer", "today-shell", "command-palette")],
  ["R3-primitive-row", "Habit list row, trailing controls, bulk action bar",
    has("-habits-habit-row", "-habits-bulk-action-bar", "-habits-controls-menu",
      "habit-list-move-parent")],
  ["R4-motion-celebration", "Celebrations, toasts, level-up, fresh start, streak animation",
    has("-gamification-", "fresh-start", "level-up")],
  ["R5-screen-today", "Today: the four root views plus the mobile equivalents",
    has("view-today", "view-all", "view-general", "m-route-tabs-index", "today-sections",
      "today-modals", "app-today-page-view")],
  ["R6-screen-goals", "Goals: view, card, create, edit, detail",
    has("-goals-", "view-goals")],
  ["R7-screen-habits-crud", "Habit create, edit, detail, emoji, description, reschedule",
    has("-habits-create", "-habits-edit", "-habits-habit-detail", "habit-emoji-selector",
      "-habits-description-viewer", "-habits-reschedule")],
  ["R8-screen-calendar", "Calendar and calendar sync", has("calendar")],
  ["R9-screen-streak", "Streak page, sections, freeze", has("streak")],
  ["R10-screen-achievements", "Achievements", has("achievements")],
  ["R11-screen-astra", "Astra chat and AI settings", has("chat", "ai-settings")],
  ["R12-screen-insights", "Insights, retrospective, wrapped",
    has("insights", "retrospective", "wrapped")],
  ["R13-screen-social", "Social, challenges, friends, pairs, public profile",
    has("social", "challenge", "friend", "cheer", "buddy", "pair", "public-profile", "u-slug",
      "explore", "invite")],
  ["R14-screen-onboarding", "Onboarding, tour, feature guide",
    has("onboarding", "tour-", "feature-guide")],
  ["R15-screen-auth", "Login, auth callback, email and code steps",
    has("login", "auth-callback", "email-step", "code-step")],
  ["R16-screen-settings", "Preferences, advanced, profile, account, notifications, API keys",
    has("preferences", "advanced", "profile", "delete-account", "notification", "create-api-key",
      "edit-handle", "edit-name", "preference-picker")],
  ["R17-screen-monetization", "Upgrade, trial expired, referral, share, marketing consent",
    has("upgrade", "trial-expired", "referral", "share", "milestone", "marketing-consent",
      "push-prompt", "r-code")],
  ["R18-screen-static", "About, privacy, terms, support", has("about", "privacy", "terms", "support")],
]

/**
 * Ordered directory rules over repo-relative .tsx paths; first match wins. The file-level
 * assignments follow REBUILD.md 8.5.2: chat to R11, upgrade to R17, habit form fields to R7,
 * goals to R6, gamification to R4, ui primitives to R1, layouts and not-found to R2. The
 * feature rules come first so a feature-scoped layout stays with its feature; the shell rule
 * then owns the remaining layouts, errors and not-found files; the ui-primitives rule is the
 * final catch-all for everything under components/ui.
 */
export const FILE_RULES = [
  ["R1-primitive-overlay", has("confirm-dialog")],
  ["R4-motion-celebration", has("/gamification/", "fresh-start", "app-toast", "/review-moment/")],
  ["R11-screen-astra", has("/chat/", "/chat.tsx", "/chat.styles", "(chat)", "message-bubble", "ai-settings")],
  ["R3-primitive-row", has("habit-row", "habit-list", "bulk-action-bar", "controls-menu")],
  ["R7-screen-habits-crud", has("/habits/")],
  ["R6-screen-goals", has("/goals/", "goal-card")],
  ["R13-screen-social",
    has("/social", "public-profile", "accountability-pair", "explore", "(public)/u/",
      "friend-profile")],
  ["R12-screen-insights", has("insights", "retrospective", "wrapped", "/charts/")],
  ["R9-screen-streak", has("streak")],
  ["R10-screen-achievements", has("achievements")],
  ["R8-screen-calendar", has("calendar")],
  ["R14-screen-onboarding", has("onboarding", "/tour/", "feature-guide")],
  ["R15-screen-auth", has("login", "auth-callback", "email-step", "code-step", "(auth)")],
  ["R16-screen-settings",
    has("preferences", "notification", "create-api-key", "delete-account", "advanced",
      "/profile")],
  ["R17-screen-monetization",
    has("upgrade", "trial-", "referral", "/share/", "milestone", "marketing-consent",
      "push-prompt", "expiry-warning", "pro-badge", "/r/")],
  ["R5-screen-today",
    has("(app)/page.tsx", "(tabs)/index", "today-sections", "today-modals", "today-page-view",
      "today-provider", "use-today-page", "/today/")],
  ["R18-screen-static", has("about", "privacy", "terms", "support")],
  ["R2-primitive-shell",
    has("today-shell", "/shell/", "/navigation/", "/command/", "/motion/", "layout",
      "not-found", "global-error", "error.tsx", "version-update", "update-available",
      "update-prompt")],
  ["R1-primitive-overlay", has("/components/ui/", "bottom-sheet-modal", "global-overlays")],
]

const FILE_ROOTS = ["apps/web/app", "apps/web/components", "apps/mobile/app", "apps/mobile/components"]

const knownTickets = new Set(TICKETS.map(([ticket]) => ticket))
for (const [ticket] of FILE_RULES)
  if (!knownTickets.has(ticket)) throw new Error(`FILE_RULES references unknown ticket "${ticket}"`)

const toPosix = (absolutePath) => relative(REPO_ROOT, absolutePath).split("\\").join("/")

const isStyleModule = (name) =>
  name.endsWith(".styles.ts") || name.endsWith("-styles.ts") || name === "styles.ts"

function walkSurfaceFiles(dir, found = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkSurfaceFiles(full, found)
    else if (entry.name.endsWith(".tsx") || isStyleModule(entry.name)) found.push(full)
  }
  return found
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
const surfaces = [...new Set(manifest.cells.map((cell) => `${cell.platform}:${cell.surfaceId}`))].sort()

const assignment = new Map()
const multiMatch = []
for (const id of surfaces) {
  const matches = TICKETS.filter(([, , test]) => test(id)).map(([ticket]) => ticket)
  if (matches.length === 0) continue
  if (matches.length > 1) multiMatch.push({ surface: id, matches })
  assignment.set(id, matches[0])
}

const unclaimed = surfaces.filter((id) => !assignment.has(id))
const perTicket = {}
for (const [id, ticket] of assignment) (perTicket[ticket] ||= []).push(id)

const files = FILE_ROOTS.flatMap((root) => walkSurfaceFiles(join(REPO_ROOT, root))).map(toPosix).sort()
const fileAssignment = new Map()
for (const path of files) {
  const match = FILE_RULES.find(([, test]) => test(path))
  if (match) fileAssignment.set(path, match[0])
}
const orphans = files.filter((path) => !fileAssignment.has(path))
const filesPerTicket = {}
for (const [path, ticket] of fileAssignment) (filesPerTicket[ticket] ||= []).push(path)

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({
    total: surfaces.length, perTicket, unclaimed, multiMatch,
    files: { total: files.length, perTicket: filesPerTicket, orphans },
  }, null, 2))
} else {
  console.log(`surfaces ${surfaces.length}   claimed ${assignment.size}   unclaimed ${unclaimed.length}`)
  console.log(`files    ${files.length}   claimed ${fileAssignment.size}   orphaned ${orphans.length}\n`)
  for (const [ticket, description] of TICKETS) {
    const surfaceCount = String((perTicket[ticket] || []).length).padStart(3)
    const fileCount = String((filesPerTicket[ticket] || []).length).padStart(4)
    console.log(`${surfaceCount} ${fileCount}  ${ticket.padEnd(26)} ${description}`)
  }
  if (multiMatch.length > 0) {
    console.log(`\nmulti-match (resolved first-rule-wins): ${multiMatch.length}`)
    for (const entry of multiMatch) console.log(`  ${entry.surface} -> ${entry.matches.join(", ")}`)
  }
  if (unclaimed.length > 0) {
    console.log("\nUNCLAIMED, these would never be redesigned:")
    for (const id of unclaimed) console.log(`  ${id}`)
  }
  if (orphans.length > 0) {
    console.log("\nORPHANED FILES, no ticket owns these:")
    for (const path of orphans) console.log(`  ${path}`)
  }
}

process.exit(unclaimed.length > 0 || orphans.length > 0 ? 1 : 0)
