#!/usr/bin/env node
// Asserts that EVERY surface in .claude/manifests/surfaces.json is claimed by exactly one
// redesign ticket. A surface claimed by no ticket is the failure mode this exists to prevent:
// it is how "we redesigned the whole app" silently ships with screens nobody looked at.
// Exits 1 on any unclaimed surface. Multi-match is reported and resolved first-rule-wins.
//
// Usage: node tools/redesign-coverage.mjs [--json]

import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
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

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ total: surfaces.length, perTicket, unclaimed, multiMatch }, null, 2))
} else {
  console.log(`surfaces ${surfaces.length}   claimed ${assignment.size}   unclaimed ${unclaimed.length}\n`)
  for (const [ticket, description] of TICKETS) {
    console.log(`${String((perTicket[ticket] || []).length).padStart(3)}  ${ticket.padEnd(26)} ${description}`)
  }
  if (multiMatch.length > 0) {
    console.log(`\nmulti-match (resolved first-rule-wins): ${multiMatch.length}`)
    for (const entry of multiMatch) console.log(`  ${entry.surface} -> ${entry.matches.join(", ")}`)
  }
  if (unclaimed.length > 0) {
    console.log("\nUNCLAIMED, these would never be redesigned:")
    for (const id of unclaimed) console.log(`  ${id}`)
  }
}

process.exit(unclaimed.length > 0 ? 1 : 0)
