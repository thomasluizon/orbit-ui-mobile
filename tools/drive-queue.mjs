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
 *  - The old bundler hardcoded `ui: true` on every bundle and filtered --only-debt
 *    on lint debt alone. Verified end to end: a 2-file packages/shared plan bundle
 *    was queued as UI work and graded against DESIGN.md, while under the documented
 *    --only-debt commands the same plan (0 lint debt by construction) was queued
 *    NOWHERE. Kind now decides both: a plan work order is always kept, always its
 *    own bundle, and never flagged ui.
 *
 * The definition of done here is three things a machine can actually check, and
 * it deliberately stops short of granting completion: a bundle reaches READY FOR
 * REVIEW, never DONE. Only a human tick in signoff.json grants a cell.
 */
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// ORBIT_SURFACE_ROOT mirrors the other gate tools (workorder,
// check-diff-ownership): hermetic tests point this tool at a disposable fixture
// repo instead of bundling the live checkout's work orders, which change under
// them.
const REPO_ROOT = process.env.ORBIT_SURFACE_ROOT
  ? resolve(process.env.ORBIT_SURFACE_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..")
const WORKORDER_DIR = join(REPO_ROOT, ".claude", "workorders")
const DRIVE_DIR = join(REPO_ROOT, ".claude", "drive")

const DEFAULTS = { maxFiles: 14, maxDebt: 45, maxOrders: 6 }

const USAGE = `drive-queue - build a drive queue and its prompts from the generated work orders

USAGE
  node tools/drive-queue.mjs [--only-debt] [--platform web|mobile]
                             [--max-files N] [--max-debt N] [--max-orders N]
                             [--dry-run] [--help]

  --only-debt     Queue only work orders carrying mechanical debt (the machine-checkable
                  work). Plan work orders (kind: plan) are kept regardless of debt: their
                  backlog is the plan's acceptance criteria, not the lint baseline, so a
                  debt filter would silently drop them. Without the flag, every work order
                  is queued, including the 87 whose backlog is judgement-only.
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
  A plan work order always becomes its OWN bundle (a plan is already a sized slice),
  with tier read from the plan file's Tier field and ui: false, so the --sleep
  verifier never grades non-visual work against DESIGN.md. Manifest-derived bundles
  (route, view, overlay, residual) carry ui: true.

  A bundle can reach READY FOR REVIEW. It can never reach DONE: completion is granted
  only by a human tick in .claude/manifests/signoff.json, which no agent can write.
`

function fail(message) {
  process.stderr.write(`drive-queue: ${message}\n`)
  process.exit(2)
}

/**
 * Read the frontmatter every work order carries, so bundling never re-parses
 * prose. \r?\n throughout, and every captured value is trimmed: a fresh Windows
 * checkout materializes the committed orders with CRLF (core.autocrlf), and the
 * LF-only regex here parsed ZERO of the 214 committed orders - a loud exit 2
 * when all of them were CRLF, but a silent exit-0 ONE-bundle queue the moment a
 * single LF plan order joined them. workorder.mjs's own parsers already
 * tolerate CRLF; this one had missed it. A file that still fails to parse is
 * named on stderr rather than dropped, because a skipped order silently shrinks
 * the queue.
 */
function readWorkOrders() {
  if (!existsSync(WORKORDER_DIR)) fail("no .claude/workorders/. Run `node tools/workorder.mjs` first.")
  const orders = []
  const unparseable = []
  for (const name of readdirSync(WORKORDER_DIR)) {
    if (!name.endsWith(".md") || name === "INDEX.md") continue
    const text = readFileSync(join(WORKORDER_DIR, name), "utf8")
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!frontmatter) {
      unparseable.push(name)
      continue
    }
    const fields = {}
    for (const line of frontmatter[1].split(/\r?\n/)) {
      const match = line.match(/^(\w+):\s*(.*)$/)
      if (match) fields[match[1]] = match[2].trim()
    }
    if (!fields.surfaceId) {
      unparseable.push(name)
      continue
    }
    const timelineEntries = (text.split("## Timeline")[1] ?? "")
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith("- ") && !line.includes("(no work recorded"))
    orders.push({
      id: fields.surfaceId,
      platform: fields.platform,
      kind: fields.kind,
      generatedFrom: fields.generatedFrom ?? null,
      ownedFiles: Number(fields.ownedFiles ?? 0),
      cells: Number(fields.cells ?? 0),
      debt: Number(fields.mechanicalDebt ?? 0),
      attempts: timelineEntries.length,
    })
  }
  if (unparseable.length) {
    process.stderr.write(
      `drive-queue: skipped ${unparseable.length} file(s) in .claude/workorders/ with no parseable frontmatter: ` +
        `${unparseable.join(", ")}. Each one silently shrinks the queue - regenerate with \`node tools/workorder.mjs\`.\n`,
    )
  }
  return orders
}

/**
 * A plan bundle's tier comes from the plan file itself: /plan writes a Tier
 * field (default opus; sonnet must be earned), and the work order's
 * generatedFrom frontmatter points back at that file. Both shapes /plan has
 * produced are read: the `| Tier | sonnet |` metadata row and a bare
 * `Tier: sonnet` line. A plan without one falls back to opus, LOUDLY - a
 * silent default is how a hard epic ends up on the cheap model.
 */
function planTierOf(order) {
  const source = order.generatedFrom
  if (source) {
    const path = resolve(REPO_ROOT, source)
    if (!existsSync(path)) {
      // A missing plan file is a different failure from a plan missing its Tier
      // field: plans are committed alongside the work orders they source, so an
      // absent file means this checkout lost the bundle's contract, not that
      // /plan forgot a field. The old message blamed the field either way, and
      // an operator on a fresh checkout hunted the wrong bug.
      process.stderr.write(
        `drive-queue: plan "${order.id}"'s source file ${source} is missing from this checkout ` +
          `(plans are committed next to their work orders - restore it); defaulting to opus.\n`,
      )
      return "opus"
    }
    const text = readFileSync(path, "utf8")
    const match = /^\|\s*Tier\s*\|\s*(sonnet|opus)\s*\|/im.exec(text) ?? /^Tier:\s*(sonnet|opus)\s*$/im.exec(text)
    if (match) return match[1].toLowerCase()
  }
  process.stderr.write(`drive-queue: plan "${order.id}" has no Tier field in ${source || "(no generatedFrom in its work order)"}; defaulting to opus.\n`)
  return "opus"
}

/**
 * Pack work orders into bundles.
 *
 * Manifest-derived orders are packed within a platform and a kind, because a
 * child that switches between a web route and a mobile StyleSheet mid-bundle
 * pays the orientation cost twice. Caps are on files, debt and count together:
 * any one of them alone lets a pathological bundle through (one 30-violation
 * file, or twelve trivial work orders spread across twelve directories).
 *
 * A plan work order is never packed: Phase A already approved it as ONE sized
 * slice, so folding it into a debt-picked bundle would bury an approved epic
 * under a numeric id and grade it against caps meant for lint conformance.
 * Plan bundles run first - they are the work the run was launched for; the
 * debt bundles are the standing backlog.
 */
function bundle(orders, limits) {
  const groups = new Map()
  const planOrders = []
  for (const order of orders) {
    if (order.kind === "plan") {
      planOrders.push(order)
      continue
    }
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
        current = { key, kind: order.kind, orders: [], files: 0, debt: 0, cells: 0 }
        bundles.push(current)
      }
      current.orders.push(order)
      current.files += order.ownedFiles
      current.debt += order.debt
      current.cells += order.cells
    }
  }

  const planBundles = [...planOrders]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((order) => ({
      id: `plan-${order.id}`,
      label: `plan ${order.id}: ${order.ownedFiles} owned file(s), ${order.debt} mechanical violation(s)`,
      repo: "orbit-ui-mobile",
      tier: planTierOf(order),
      effort: "high",
      ui: false,
      kind: "plan",
      workOrders: [order.id],
      debt: order.debt,
      files: order.ownedFiles,
    }))

  // The ui flag routes the --sleep verifier's DESIGN.md clause, and it used to
  // be hardcoded true for every bundle - a 2-file packages/shared plan bundle
  // got graded as UI work. Kind decides it now: every manifest-derived kind
  // (route, view, overlay, residual) is visual by construction; plan is not.
  //
  // The id is derived from the bundle's CONTENT (platform-kind plus a short
  // hash of its sorted work-order ids), never from its position: positional
  // ids (`web-residual-02` = second-most debt globally) re-keyed EVERY bundle
  // whenever any debt moved, so after the documented mid-campaign queue
  // regeneration, run logs and spec rows written before it silently named
  // different work orders than the same id did after. A stable id re-keys only
  // when the bundle's membership genuinely changed.
  const manifestBundles = bundles
    .filter((entry) => entry.orders.length)
    .sort((a, b) => b.debt - a.debt)
    .map((entry) => ({
      id: `${entry.key}-${createHash("sha256")
        .update([...entry.orders.map((order) => order.id)].sort().join("\n"))
        .digest("hex")
        .slice(0, 8)}`,
      label: `${entry.orders.length} ${entry.key} work order(s), ${entry.debt} mechanical violation(s), ${entry.files} owned file(s)`,
      repo: "orbit-ui-mobile",
      tier: entry.debt > 25 || entry.files > 10 ? "opus" : "sonnet",
      effort: "high",
      ui: true,
      kind: entry.kind,
      workOrders: entry.orders.map((order) => order.id),
      debt: entry.debt,
      files: entry.files,
    }))

  return [...planBundles, ...manifestBundles]
}

/**
 * Every action this prompt ORDERS must be permitted by the ownership gate as it
 * stands - the first cut ordered lint:prune, tests and i18n parity, then made
 * the gate's exit 0 a condition of done, and obeying the prompt failed the
 * prompt's own gate. The satisfiability test in test-hooks pins that: each file
 * class ordered here (owned files, their test companions, the suppressions
 * ledger, the i18n pair, the work order's Timeline) is asserted against the
 * real check-diff-ownership permitted set.
 *
 * Condition (b) is PINNED through the {{DRIVE_BASE}} placeholder, because this
 * tool cannot know the run base at generation time and only the driver knows
 * the sha it just reset the work repo to. Unpinned, the gate's own resolution
 * lands on a merge-base that predates every work order in this deployment
 * (exit 2 for honest work), while a child improvising --base HEAD after
 * committing measures an empty diff (a vacuous green). run.mjs substitutes the
 * placeholder at spawn and hard-fails a prompt it cannot pin; its preflight
 * rejects a workOrders bundle whose prompt lacks the placeholder.
 */
function renderPrompt(entry) {
  const ids = entry.workOrders
  const isPlan = entry.kind === "plan"
  const parityRule = isPlan
    ? `4. Work Backlog B and the source plan's acceptance criteria with the plan open. Parity is
   scoped to the files the plan itself owns: if its "Files to Change" names BOTH platforms,
   full cross-platform parity is yours to do IN THIS BUNDLE. If it names only one platform,
   the plan shipped with a parity gap - STOP on the mirror work, record the gap in the
   Timeline as a planning defect, and do NOT edit mirror files you do not own: the ownership
   gate reads any such edit as an escape, and obeying a parity order it forbids is how a
   prompt fails its own gate. The i18n pair is still yours either way: keys land in BOTH
   en.json and pt-BR.json in the same edit.`
    : `4. Work Backlog B (the judgement list) with DESIGN.md open. Do NOT edit the other platform's
   mirror files: the mirror surface has its own work order, and possibly its own agent running
   right now. If a fix genuinely requires an edit to a mirror file you do not own, STOP on that
   fix and record it in the Timeline - that is a useful result, not a failure. The i18n pair is
   the one cross-platform edit that IS yours: microcopy changes land in BOTH en.json and
   pt-BR.json in the same edit.`
  const depthParagraph = isPlan
    ? ""
    : `
The redesign-depth oracle measures how much of each surface's render signature actually moved;
\`node tools/workorder.mjs --check --id <id>\` prints it. Clearing Backlog A does not move it.
The number is a veto a human consults, never a target you optimize: deliberately inflating it -
churn for churn's sake - reads as fabrication.
`
  const closing = isPlan
    ? `Meeting a, b and c makes this bundle READY FOR REVIEW. It does NOT make it done, and you
must not say it does: merging is a human action, and whether the plan's acceptance criteria
are genuinely met is a human judgement, not yours to record. State what you changed and what
you verified.`
    : `Meeting a, b and c makes this bundle READY FOR REVIEW. It does NOT make it done, and you
must not say it does. Completion is granted only by a human tick in
.claude/manifests/signoff.json, which you are structurally blocked from writing. Do not
claim a surface "looks good", is "redesigned", or is "complete" - you have no instrument
that can establish that, and ten previous sessions made exactly that claim and were wrong.
State what you changed and what you verified. If you believe a surface is ready for a human
to look at, say which ones and why.`
  // Ids are single-quoted in every runnable command line the prompt prints,
  // same as workorder.mjs's generated done commands: a route-group id like
  // `residual-web-app-(app)-social-_components` is a shell syntax error bare,
  // so a child pasting its own definition of done got a bash error instead of
  // a gate verdict.
  return `You are an autonomous Orbit engineer running one bundle. Proceed to completion on your own
judgement. Do not ask questions; there is nobody to answer them.

YOUR WORK ORDERS (${ids.length}). Read each one FIRST, before opening any source file:
${ids.map((id) => `  .claude/workorders/${id}.md`).join("\n")}

Each work order already contains what you would otherwise spend a third of this session
rediscovering: the exact files you own, the enumerated DESIGN.md violations in them with
counts, the judgement checks that apply to this kind of work, and a Timeline of what
previous sessions already tried here. Read the Timeline before you plan: repeating a failed
approach is the single most likely way this bundle wastes its clock.

RULES OF ENGAGEMENT
1. Branch off the current base: \`feature/<slug>\` or \`fix/<slug>\`. Never commit to main.
2. Edit ONLY the files your work orders list under "Boundaries", plus the classes rules 3, 4
   and 6 permit (the lint-suppressions ledger, the i18n pair, an owned file's test companion)
   and your own work orders' Timeline sections. Files under "Shared, and NOT yours to edit"
   are context: another work order owns them and another agent may be editing them right now.
   If the fix you need lives in a shared file, do NOT edit it - record that in the Timeline
   and say so in your summary. That is a useful result, not a failure.
3. Clear Backlog A (the enumerated violations) by fixing the SOURCE, then run
   \`npm run lint:prune\` in the workspace that carries the ledger: apps/web and apps/mobile
   are the ONLY workspaces with that script. A bundle owning only packages/shared files
   skips the prune step - the suppression scan covers apps/web and apps/mobile alone, so
   its Backlog A is zero by construction and there is no ledger to prune there. The rewrite
   lint:prune makes to eslint-suppressions.json is PERMITTED: the ledger is
   workspace-global, and the ownership gate expects it to move when files you edited
   improve. What stays detected and fatal is a count that falls for a file this diff
   never edited - that is the scoreboard moving without the code, and it reads as fabrication.
   COUNTING these is objective; FIXING them is not. \`local/spacing-scale\` autofixes only a
   within-1px snap and refuses the rest on purpose, because moving a 6px gap to 4 changes the
   layout. Measured on this repo: \`eslint --fix\` over a 30-violation file changed zero lines.
   Judge each value against the surrounding rhythm. Batch-snapping every number to the nearest
   step is the shallow sweep this harness exists to stop, and it will read as one.
${parityRule}
5. Append ONE Timeline entry per work order you touched, saying what you changed and what
   you deliberately left alone. Append only; never rewrite an existing entry, including
   your own.
6. Add or extend Vitest behaviour tests for logic you changed. The ownership gate permits a
   new test file ONLY at the repo's convention, and only for a file this bundle owns: the
   workspace \`__tests__\` tree (\`apps/web/__tests__/\`, \`apps/mobile/__tests__/\`,
   \`packages/shared/src/__tests__/\`), named \`<source-basename>.test.ts\` / \`.tsx\`, or
   \`<dir>-page.test.tsx\` for a router \`page.tsx\`. A test for a file you do not own
   belongs to whoever owns that file - do not write it.
7. LAST, before you commit: run \`node tools/workorder.mjs\` (the full regeneration) and
   commit its diff together with the work. Clearing debt moves your work order's
   mechanicalDebt frontmatter, and CI's ledger-freshness gate asserts the committed orders
   byte-equal a fresh regeneration. The ledger is DERIVED state: the ownership gate
   sanctions a work-order rewrite ONLY when it is byte-identical regeneration output with
   every recorded Timeline entry intact, so never hand-edit what the generator writes.
8. Commit, push, and open a PR READY FOR REVIEW with \`gh pr create\` (never --draft, so CI
   and the review bots run).
${depthParagraph}
DEFINITION OF DONE - three machine-checkable conditions, and nothing else:
  a. EACH of these exits 0 (per order; the global \`--check\` form covers bundles that are
     not yours and can stay red while your work is complete, so it is not your condition):
${ids.map((id) => `       node tools/workorder.mjs --check --id '${id}'`).join("\n")}
  b. The ownership gate, pinned to the commit this bundle branched from. The --base value
     below is stamped in by the driver at spawn; running the command by hand, substitute
     that branch-point sha yourself - never HEAD, whose committed diff is empty by
     construction, and never an unpinned run, which resolves a base that may predate your
     work orders entirely.
     \`node tools/check-diff-ownership.mjs ${ids.map((id) => `--id '${id}'`).join(" ")} --base {{DRIVE_BASE}}\` exits 0.
  c. Each touched work order has your new Timeline entry.
Then lint, type-check and the tests pass.

${closing}

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
  // A malformed or missing flag value must be a loud exit 2, never NaN: every
  // cap comparison against NaN is false, so `--max-files abc` silently turned
  // the cap OFF and packed a 33-file bundle under the documented 14-file
  // default while exiting 0 - against this tool's own exit-2-on-bad-flag
  // contract.
  const flag = (name, fallback) => {
    const index = argv.indexOf(name)
    if (index === -1) return fallback
    const raw = argv[index + 1]
    const value = Number(raw)
    if (raw === undefined || !Number.isFinite(value)) {
      fail(`${name} needs a numeric value as its next argument${raw !== undefined ? ` (got "${raw}")` : ""}. See --help.`)
    }
    return value
  }
  const platformIndex = argv.indexOf("--platform")
  const platform = platformIndex === -1 ? null : argv[platformIndex + 1]
  if (platformIndex !== -1 && platform !== "web" && platform !== "mobile") {
    fail(`--platform needs "web" or "mobile" as its next argument${platform ? ` (got "${platform}")` : ""}. See --help.`)
  }
  const limits = {
    maxFiles: flag("--max-files", DEFAULTS.maxFiles),
    maxDebt: flag("--max-debt", DEFAULTS.maxDebt),
    maxOrders: flag("--max-orders", DEFAULTS.maxOrders),
  }

  let orders = readWorkOrders()
  if (!orders.length) fail("no work orders parsed. Run `node tools/workorder.mjs` first.")
  if (platform) orders = orders.filter((order) => order.platform === platform)
  // A plan order carries 0 lint debt by construction (its backlog is the plan's
  // acceptance criteria), so a pure debt filter silently dropped every plan -
  // verified: the documented step-9 commands queued 48 bundles and the plan
  // work order appeared nowhere.
  if (argv.includes("--only-debt")) orders = orders.filter((order) => order.debt > 0 || order.kind === "plan")
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
  // A stale prompt is a same-format file with a current-looking name: this loop
  // only ever added, so three writes left 81 prompt files for a 50-entry queue,
  // and a resumed operator could hand a child a bundle the queue no longer
  // contains. Prompts are derived from queue.json alone, so any task-*.md the
  // current queue does not name is swept with the write.
  const currentPrompts = new Set(queue.map((entry) => `task-${entry.id}.md`))
  for (const name of readdirSync(join(DRIVE_DIR, "prompts"))) {
    if (name.startsWith("task-") && name.endsWith(".md") && !currentPrompts.has(name)) {
      rmSync(join(DRIVE_DIR, "prompts", name))
    }
  }
  process.stdout.write(`written: .claude/drive/queue.json and ${queue.length} prompt(s)\n`)
}

main()
