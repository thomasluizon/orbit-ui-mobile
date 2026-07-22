#!/usr/bin/env node
/**
 * drive-queue: turn generated work orders into a runnable drive queue plus one
 * prompt per bundle.
 *
 * This replaces a hand-written `queue.json` and a hand-written prompt per
 * bundle. Both were the failure point rather than an inconvenience:
 *
 *  - The old prompt template required `npm run surfaces:check` to PASS before a
 *    bundle could report done. After the gate rebuild made a human tick the only
 *    granting axis, that condition became unsatisfiable by construction, so every
 *    queued bundle would burn its full wall clock and return `blocked`. An
 *    honest agent could not report success no matter what it built.
 *  - The old prompt said "redesign these routes to DESIGN.md" and handed over no
 *    file list, no defect list, and no history, which is how a fresh child spent
 *    36.6% of its actions orienting and 5.6% editing.
 *
 * The definition of done here is three things a machine can actually check, and
 * it deliberately stops short of granting completion: a bundle reaches READY FOR
 * REVIEW, never DONE. Only a human tick in signoff.json grants a cell.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const WORKORDER_DIR = join(REPO_ROOT, ".claude", "workorders")
const DRIVE_DIR = join(REPO_ROOT, ".claude", "drive")

const DEFAULTS = { maxFiles: 14, maxDebt: 45, maxOrders: 6 }

const USAGE = `drive-queue - build a drive queue and its prompts from the generated work orders

USAGE
  node tools/drive-queue.mjs [--only-debt] [--platform web|mobile]
                             [--max-files N] [--max-debt N] [--max-orders N]
                             [--dry-run] [--help]

  --only-debt     Queue only work orders carrying mechanical debt (the machine-checkable
                  work). Without it, every work order is queued, including the 87 whose
                  backlog is judgement-only.
  --platform      Restrict to one platform.
  --max-files N   Owned-file cap per bundle (default ${DEFAULTS.maxFiles}).
  --max-debt N    Mechanical-debt cap per bundle (default ${DEFAULTS.maxDebt}).
  --max-orders N  Work-order cap per bundle (default ${DEFAULTS.maxOrders}).
  --dry-run       Print the bundle plan; write nothing.
  --help, -h      This text.

OUTPUT
  .claude/drive/queue.json              one entry per bundle, in run order
  .claude/drive/prompts/task-<id>.md    the bundle's prompt

EXIT CODES
  0  queue written (or planned, under --dry-run)
  2  no work orders on disk, or a bad flag

NOTE
  A bundle can reach READY FOR REVIEW. It can never reach DONE: completion is granted
  only by a human tick in .claude/manifests/signoff.json, which no agent can write.
`

function fail(message) {
  process.stderr.write(`drive-queue: ${message}\n`)
  process.exit(2)
}

/** Read the frontmatter every work order carries, so bundling never re-parses prose. */
function readWorkOrders() {
  if (!existsSync(WORKORDER_DIR)) fail("no .claude/workorders/. Run `node tools/workorder.mjs` first.")
  const orders = []
  for (const name of readdirSync(WORKORDER_DIR)) {
    if (!name.endsWith(".md") || name === "INDEX.md") continue
    const text = readFileSync(join(WORKORDER_DIR, name), "utf8")
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)
    if (!frontmatter) continue
    const fields = {}
    for (const line of frontmatter[1].split("\n")) {
      const match = line.match(/^(\w+):\s*(.*)$/)
      if (match) fields[match[1]] = match[2]
    }
    const timelineEntries = (text.split("## Timeline")[1] ?? "")
      .split("\n")
      .filter((line) => line.trim().startsWith("- ") && !line.includes("(no work recorded"))
    orders.push({
      id: fields.surfaceId,
      platform: fields.platform,
      kind: fields.kind,
      ownedFiles: Number(fields.ownedFiles ?? 0),
      cells: Number(fields.cells ?? 0),
      debt: Number(fields.mechanicalDebt ?? 0),
      attempts: timelineEntries.length,
    })
  }
  return orders.filter((order) => order.id)
}

/**
 * Pack work orders into bundles.
 *
 * Bundles are packed within a platform and a kind, because a child that switches
 * between a web route and a mobile StyleSheet mid-bundle pays the orientation
 * cost twice. Caps are on files, debt and count together: any one of them alone
 * lets a pathological bundle through (one 30-violation file, or twelve trivial
 * work orders spread across twelve directories).
 */
function bundle(orders, limits) {
  const groups = new Map()
  for (const order of orders) {
    const key = `${order.platform}-${order.kind}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(order)
  }

  const bundles = []
  for (const [key, group] of [...groups.entries()].sort()) {
    const sorted = [...group].sort((a, b) => b.debt - a.debt || a.id.localeCompare(b.id))
    let current = null
    for (const order of sorted) {
      const wouldExceed =
        current &&
        (current.orders.length >= limits.maxOrders ||
          current.files + order.ownedFiles > limits.maxFiles ||
          current.debt + order.debt > limits.maxDebt)
      if (!current || wouldExceed) {
        current = { key, orders: [], files: 0, debt: 0, cells: 0 }
        bundles.push(current)
      }
      current.orders.push(order)
      current.files += order.ownedFiles
      current.debt += order.debt
      current.cells += order.cells
    }
  }

  return bundles
    .filter((entry) => entry.orders.length)
    .sort((a, b) => b.debt - a.debt)
    .map((entry, index) => ({
      id: `${entry.key}-${String(index + 1).padStart(2, "0")}`,
      label: `${entry.orders.length} ${entry.key} work order(s), ${entry.debt} mechanical violation(s), ${entry.files} owned file(s)`,
      repo: "orbit-ui-mobile",
      tier: entry.debt > 25 || entry.files > 10 ? "opus" : "sonnet",
      effort: "high",
      ui: true,
      workOrders: entry.orders.map((order) => order.id),
      debt: entry.debt,
      files: entry.files,
    }))
}

function renderPrompt(entry) {
  const ids = entry.workOrders
  return `You are an autonomous Orbit engineer running one bundle. Proceed to completion on your own
judgement. Do not ask questions; there is nobody to answer them.

YOUR WORK ORDERS (${ids.length}). Read each one FIRST, before opening any source file:
${ids.map((id) => `  .claude/workorders/${id}.md`).join("\n")}

Each work order already contains what you would otherwise spend a third of this session
rediscovering: the exact files you own, the enumerated DESIGN.md violations in them with
counts, the judgement checks that apply to this kind of surface, and a Timeline of what
previous sessions already tried here. Read the Timeline before you plan: several of these
surfaces have been attempted and reported done before, and repeating a failed approach is
the single most likely way this bundle wastes its clock.

RULES OF ENGAGEMENT
1. Branch off the current base: \`feature/<slug>\` or \`fix/<slug>\`. Never commit to main.
2. Edit ONLY the files your work orders list under "Boundaries". Files under "Shared, and
   NOT yours to edit" are context: another work order owns them and another agent may be
   editing them right now. If the fix you need lives in a shared file, do NOT edit it -
   record that in the Timeline and say so in your summary. That is a useful result, not a
   failure.
3. Clear Backlog A (the enumerated violations) by fixing the SOURCE, then run
   \`npm run lint:prune\` in the affected workspace. Never hand-edit eslint-suppressions.json:
   the gate detects a count that fell for a file you did not edit, and treats it as fabrication.
   COUNTING these is objective; FIXING them is not. \`local/spacing-scale\` autofixes only a
   within-1px snap and refuses the rest on purpose, because moving a 6px gap to 4 changes the
   layout. Measured on this repo: \`eslint --fix\` over a 30-violation file changed zero lines.
   Judge each value against the surrounding rhythm. Batch-snapping every number to the nearest
   step is the shallow sweep this harness exists to stop, and it will read as one.
4. Work Backlog B (the judgement list) with DESIGN.md open. Cross-platform parity is
   MANDATORY: a web change lands in apps/mobile too and vice versa, and i18n keys land in
   BOTH en.json and pt-BR.json.
5. Append ONE Timeline entry per work order you touched, saying what you changed and what
   you deliberately left alone. Append only; never rewrite an existing entry, including
   your own.
6. Add or extend Vitest behaviour tests for logic you changed.
7. Commit, push, and open a PR READY FOR REVIEW with \`gh pr create\` (never --draft, so CI
   and the review bots run).

DEFINITION OF DONE - three machine-checkable conditions, and nothing else:
  a. \`node tools/workorder.mjs --check\` reports 0 mechanical debt for your work orders.
  b. \`node tools/check-diff-ownership.mjs ${ids.map((id) => `--id ${id}`).join(" ")}\` exits 0.
  c. Each touched work order has your new Timeline entry.
Then lint, type-check and the tests pass.

Meeting a, b and c makes this bundle READY FOR REVIEW. It does NOT make it done, and you
must not say it does. Completion is granted only by a human tick in
.claude/manifests/signoff.json, which you are structurally blocked from writing. Do not
claim a surface "looks good", is "redesigned", or is "complete" - you have no instrument
that can establish that, and ten previous sessions made exactly that claim and were wrong.
State what you changed and what you verified. If you believe a surface is ready for a human
to look at, say which ones and why.

If you cannot finish: commit what works, open the PR describing exactly what is blocked, and
exit. A blocked-but-documented bundle is a success.

HARD RULES: never merge, never push to main, never force-push, never --no-verify.

END with EXACTLY one line of JSON (no fences):
{"task":"${entry.id}","status":"ready-for-review"|"blocked"|"failed","pr":"<url or null>","cleared":<violations you actually cleared>,"summary":"<one sentence>"}
`
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE)
    return
  }
  const flag = (name, fallback) => {
    const index = argv.indexOf(name)
    return index === -1 ? fallback : Number(argv[index + 1])
  }
  const platformIndex = argv.indexOf("--platform")
  const platform = platformIndex === -1 ? null : argv[platformIndex + 1]
  const limits = {
    maxFiles: flag("--max-files", DEFAULTS.maxFiles),
    maxDebt: flag("--max-debt", DEFAULTS.maxDebt),
    maxOrders: flag("--max-orders", DEFAULTS.maxOrders),
  }

  let orders = readWorkOrders()
  if (!orders.length) fail("no work orders parsed. Run `node tools/workorder.mjs` first.")
  if (platform) orders = orders.filter((order) => order.platform === platform)
  if (argv.includes("--only-debt")) orders = orders.filter((order) => order.debt > 0)
  if (!orders.length) fail("no work orders match those filters.")

  const queue = bundle(orders, limits)
  const totalDebt = queue.reduce((sum, entry) => sum + entry.debt, 0)

  process.stdout.write(
    `${queue.length} bundle(s) over ${orders.length} work order(s), ${totalDebt} mechanical violation(s)\n\n` +
      queue.map((entry) => `  ${entry.id.padEnd(22)} ${String(entry.debt).padStart(3)} debt  ${String(entry.files).padStart(2)} files  ${entry.tier}\n`).join("") +
      "\n",
  )

  if (argv.includes("--dry-run")) return

  mkdirSync(join(DRIVE_DIR, "prompts"), { recursive: true })
  writeFileSync(join(DRIVE_DIR, "queue.json"), `${JSON.stringify(queue, null, 2)}\n`)
  for (const entry of queue) writeFileSync(join(DRIVE_DIR, "prompts", `task-${entry.id}.md`), renderPrompt(entry))
  process.stdout.write(`written: .claude/drive/queue.json and ${queue.length} prompt(s)\n`)
}

main()
