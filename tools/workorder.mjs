#!/usr/bin/env node
/**
 * workorder: turn the surface manifest + the lint suppression baselines into a
 * per-unit CONTRACT FILE that a fresh agent reads instead of rediscovering the
 * codebase.
 *
 * Why this exists (measured, not assumed). Classifying every tool call across
 * nine drive-child transcripts: orienting 36.6% of actions, misc shell 33.7%,
 * git 9.5%, EDITING 5.6%, verifying 5.6% - about 6.5 orientation actions per
 * single edit. Verification was never the bottleneck. Agents booting blind was.
 * The manifest has held exclusive file ownership for all 171 surfaces the whole
 * time and no agent was ever handed it.
 *
 * What a work order carries, and why each part:
 *  - GOAL + BOUNDARIES: the exclusive owned-file list, straight from the
 *    manifest. First-party Claude Code guidance is explicit that two agents
 *    editing one file overwrite each other, and the partition is already
 *    computed, so handing it over costs nothing.
 *  - MECHANICAL BACKLOG: the surface's own suppressed `local/*` violations,
 *    file by file. These are real DESIGN.md defects that were measured, written
 *    down, committed, and then never handed to anyone.
 *  - JUDGEMENT BACKLOG: the DESIGN.md checks no gate can make, named for this
 *    surface kind so the agent is not re-reading a 557-line spec to find the
 *    eight lines that apply to it.
 *  - TIMELINE: append-only. The one thing a fresh process cannot reconstruct is
 *    what the previous nine sessions already tried here.
 *
 * What it deliberately does NOT do: grant completion. The mechanical backlog is
 * a floor, and clearing it means "this surface no longer violates the rules we
 * can check", never "this surface looks good". Only a human tick grants a cell
 * (.claude/manifests/signoff.json). See `## Refuted, do not re-propose` in
 * .claude/specs/issue-539.spec.md - a churn threshold and a vision judge were
 * both tried as grants and both failed.
 *
 * Redesign depth is wired in as MEASUREMENT, never as a target. The loop's only
 * countable axis here is lint debt, and that axis is disjoint from the failure
 * this harness was built for: view-today measured 0.0% changed against the
 * baseline while carrying mechanicalDebt 0. So a per-order --check now prints
 * the surface's depth against the floor - the number rides along for the human
 * who holds the veto. It never moves an exit code, because the refuted-grants
 * ledger above already records what happens when it does: an agent optimizing
 * token distance produces churn, not design.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { REDESIGN_DEPTH_FLOOR, baselineResolves, redesignDepthOf } from "./check-surface-coverage.mjs"

// ORBIT_SURFACE_ROOT mirrors check-surface-coverage.mjs: hermetic tests point
// both tools at a disposable fixture repo instead of this checkout's live debt
// numbers, which change under them.
const REPO_ROOT = process.env.ORBIT_SURFACE_ROOT
  ? resolve(process.env.ORBIT_SURFACE_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MANIFEST_PATH = join(REPO_ROOT, ".claude", "manifests", "surfaces.json")
const OUT_DIR = join(REPO_ROOT, ".claude", "workorders")
const WORKSPACES = [
  { prefix: "apps/web/", suppressions: "apps/web/eslint-suppressions.json" },
  { prefix: "apps/mobile/", suppressions: "apps/mobile/eslint-suppressions.json" },
]

const TIMELINE_HEADING = "## Timeline"

const USAGE = `workorder - generate per-unit contract files an agent reads instead of exploring

USAGE
  node tools/workorder.mjs [--check] [--id <surfaceId>] [--help]
  node tools/workorder.mjs --from-plan <path/to/x.plan.md>

  --from-plan <p> Emit ONE work order for an arbitrary issue, sourced from a /plan file's
                  "## Files to Change" section instead of the surface manifest. This is what
                  makes the orientation fix apply to EVERY issue, not just visual ones:
                  without it a non-visual bundle gets no contract and the agent goes back to
                  discovering its own file list. Writes .claude/workorders/<plan-name>.md.

  (no flags)      Regenerate every work order into .claude/workorders/ plus INDEX.md.
                  Existing Timeline sections are PRESERVED verbatim, and so are the
                  plan work orders --from-plan wrote (they are not manifest-derived,
                  so a regeneration must never read them as stale); everything else
                  is derived, so a regeneration is a reviewable diff.
  --check         Do not write. Print one greppable "DEBT <id> ..." line per work
                  order still carrying debt, the totals, and a one-line depth
                  summary; exit 1 if ANY work order still carries mechanical debt.
  --id <id>       Print one work order to stdout and exit. Does not write.
  --check --id <id>  Per-order verdict: THAT order's outstanding debt rows and total,
                  plus (for a surface order) its redesign depth vs the floor. The
                  depth is a veto axis a human consults - it never moves the exit
                  code. Exit 1 only if that order carries mechanical debt.
  --help, -h      This text.

EXIT CODES
  0  generation succeeded, or --check found no outstanding mechanical debt
     (repo-wide without --id, scoped to that one order with --id)
  1  --check found outstanding mechanical debt in its scope
  2  a required input is missing or unreadable (manifest, suppression baseline),
     or a unit with cells owns zero files after resolution and cannot be folded

INPUTS (all on disk, none hand-written)
  .claude/manifests/surfaces.json   the denominator + exclusive file ownership
  apps/*/eslint-suppressions.json   the committed baseline of pre-existing DESIGN.md
                                    violations, per file, per rule

NOTE
  Clearing the mechanical backlog is a FLOOR, never a grant. Completion is granted
  only by a human tick in .claude/manifests/signoff.json.
`

function fail(message, code = 2) {
  process.stderr.write(`workorder: ${message}\n`)
  process.exit(code)
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    fail(`could not read ${label} at ${path}: ${error?.message ?? error}`)
  }
}

/** file -> { rule -> count } for every committed lint suppression, keyed by repo-relative path. */
function loadSuppressions() {
  const byFile = {}
  for (const workspace of WORKSPACES) {
    const path = join(REPO_ROOT, workspace.suppressions)
    if (!existsSync(path)) continue
    const raw = readJson(path, "lint suppression baseline")
    for (const [file, rules] of Object.entries(raw)) {
      const key = (workspace.prefix + file).replace(/\\/g, "/")
      for (const [rule, entry] of Object.entries(rules)) {
        byFile[key] ??= {}
        byFile[key][rule] = (byFile[key][rule] ?? 0) + (entry?.count ?? 0)
      }
    }
  }
  return byFile
}

function debtOf(files, suppressions) {
  const rows = []
  let total = 0
  for (const file of files) {
    const rules = suppressions[file]
    if (!rules) continue
    for (const [rule, count] of Object.entries(rules)) {
      rows.push({ file, rule, count })
      total += count
    }
  }
  return { rows: rows.sort((a, b) => b.count - a.count), total }
}

/** Collapse the manifest's cell rows into one record per surface, keeping the cell axes it expands over. */
function collapseSurfaces(manifest) {
  const surfaces = new Map()
  for (const cell of manifest.cells ?? []) {
    let surface = surfaces.get(cell.surfaceId)
    if (!surface) {
      surface = {
        surfaceId: cell.surfaceId,
        platform: cell.platform,
        kind: cell.kind,
        sourceFile: cell.sourceFile,
        href: cell.href ?? null,
        ownedFiles: [...(cell.ownedFiles ?? [])],
        pixelEvidence: cell.pixelEvidence,
        cells: 0,
        states: new Set(),
        themes: new Set(),
        locales: new Set(),
      }
      surfaces.set(cell.surfaceId, surface)
    }
    surface.cells += 1
    surface.states.add(cell.state)
    surface.themes.add(cell.theme)
    surface.locales.add(cell.locale)
  }
  return [...surfaces.values()]
}

/**
 * Files carrying real design debt that NO surface owns.
 *
 * This is not a rounding error and it is the reason a "finish every surface"
 * pass could still leave the app broken: 551 of the 988 committed violations
 * (56%), across 126 files, sit outside the 388-file surface partition, heavily
 * in mobile `*-styles.ts` modules where mobile design actually lives. Work that
 * belongs to nobody never gets done, so it gets grouped into residual work
 * orders by feature directory and owned explicitly.
 */
function residualGroups(suppressions, ownedEverywhere) {
  const groups = new Map()
  for (const file of Object.keys(suppressions)) {
    if (ownedEverywhere.has(file)) continue
    const segments = file.split("/")
    const platform = segments[1] === "web" ? "web" : "mobile"
    // Group by the file's DIRECTORY, so a group is a real feature folder. Slicing
    // fixed segment positions instead turned every root-level `foo-styles.ts` into
    // its own group named `app-foo-stylests`, which is neither readable nor coherent.
    const directory = segments.slice(2, -1).join("-") || "root"
    const key = `residual-${platform}-${directory}`
    const group = groups.get(key) ?? { surfaceId: key, platform, kind: "residual", ownedFiles: [] }
    group.ownedFiles.push(file)
    groups.set(key, group)
  }
  return [...groups.values()].map((group) => ({
    ...group,
    sourceFile: null,
    href: null,
    pixelEvidence: "none",
    cells: 0,
    states: new Set(),
    themes: new Set(),
    locales: new Set(),
    ownedFiles: group.ownedFiles.sort(),
  }))
}

// DESIGN.md's reviewer-judgment list is one 3-line paragraph covering every
// surface in the app. Handed over whole it is unreadable, so it is split by the
// kind of surface it is being applied to. This is a POINTER into DESIGN.md, not
// a second copy of it: DESIGN.md stays authoritative and is cited by section.
const JUDGEMENT_BY_KIND = {
  route: [
    "One focal element per view (DESIGN.md `## Working model`). Name it before you edit.",
    "Spacing rhythm: tight within a group, air between groups (`## Layout & spacing`).",
    "The loading / empty / error triad actually exists for this route (`## States`).",
    "Measure: body text does not exceed 65ch (`### Measure and wrapping`).",
    "A card is not a layout primitive. If it wraps the whole page, it is wrong (`## Surface rules`).",
    "The three shipping tests: AI-slop, squint, scene-sentence (`### AI-slop test` onward).",
  ],
  overlay: [
    "Focus management: focus moves in on open and returns on close (`### Keyboard and focus`).",
    "The overlay has an accessible name (`local/require-dialog-title` gates the mechanical half).",
    "Confirmation warrant: a dialog that asks nothing the user cannot undo should not exist (`## Copy`).",
    "Stacking uses a named `z-<tier>` / `zLayers.<tier>`, never an arbitrary literal (`### Stacking`).",
    "The three shipping tests: AI-slop, squint, scene-sentence.",
  ],
  plan: [
    "The acceptance criteria in the source plan are the real backlog. Read them there; they are not copied here, because a copy goes stale the moment the plan is edited.",
    "Cross-platform parity is MANDATORY: a web change lands in `apps/mobile` too and vice versa, and i18n keys land in BOTH `en.json` and `pt-BR.json` in the same edit.",
    "A shared or DTO change is append-only and deploy-API-first: add optional fields, never rename or retype a field an old mobile client still reads.",
    "Add or extend behaviour tests for what you changed. A green suite that never exercised your change proves nothing.",
  ],
  residual: [
    "These files are shared or style-only modules that no single surface owns.",
    "Fix the enumerated violations without changing rendered behaviour: this is conformance work, not a redesign.",
    "A token or primitive that does not exist yet is a REQUEST, never a judgement call (`.claude/rules` product-and-content rule 2).",
  ],
}

function judgementFor(kind) {
  if (kind === "residual") return JUDGEMENT_BY_KIND.residual
  return JUDGEMENT_BY_KIND[kind] ?? JUDGEMENT_BY_KIND.route
}

/** Keep whatever an agent appended under `## Timeline`, so regeneration never eats history. */
function existingTimeline(path) {
  if (!existsSync(path)) return []
  const text = readFileSync(path, "utf8")
  const index = text.indexOf(TIMELINE_HEADING)
  if (index === -1) return []
  return text
    .slice(index + TIMELINE_HEADING.length)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().startsWith("- "))
}

function renderWorkOrder(surface, debt, timeline, manifest) {
  const axes = [
    surface.states.size ? `states ${[...surface.states].sort().join("/")}` : null,
    surface.themes.size ? `themes ${[...surface.themes].sort().join("/")}` : null,
    surface.locales.size ? `locales ${[...surface.locales].sort().join("/")}` : null,
  ].filter(Boolean)

  const lines = [
    "---",
    `surfaceId: ${surface.surfaceId}`,
    `platform: ${surface.platform}`,
    `kind: ${surface.kind}`,
    surface.href ? `href: ${surface.href}` : null,
    `ownedFiles: ${surface.ownedFiles.length}`,
    `cells: ${surface.cells}`,
    `mechanicalDebt: ${debt.total}`,
    `pixelEvidence: ${surface.pixelEvidence}`,
    `generatedFrom: ${manifest.generatedFrom ?? "unknown"}`,
    "---",
    "",
    `# Work order: ${surface.surfaceId}`,
    "",
    "## Goal",
    "",
    surface.kind === "residual"
      ? "Bring these shared/style-only files into DESIGN.md conformance without changing what they render."
      : surface.kind === "plan"
        ? `Implement the plan at \`${surface.sourceFile}\`. That file holds the objective, the tasks and the acceptance criteria; this work order holds your boundary and your starting state, so you do not have to go looking for either.`
        : `Bring \`${surface.surfaceId}\`${surface.href ? ` (\`${surface.href}\`)` : ""} to DESIGN.md. Read DESIGN.md once, then edit; the parts that apply to this surface are named below so you do not have to search for them.`,
    "",
    ...(surface.foldedSurfaceIds?.length
      ? [
          "## Folded in: surface ids this order also carries",
          "",
          "These surfaces render entirely through files this order owns, so a work order of their",
          "own would forbid every edit that could move their cells. Their cells and axes are merged",
          "into this order's counts; there is no other file to look for.",
          "",
          ...surface.foldedSurfaceIds.map((id) => `- \`${id}\``),
          "",
        ]
      : []),
    "## Boundaries: you own these files, and only these",
    "",
    surface.kind === "plan"
      ? "Ownership comes from the plan's own \"Files to Change\" section. Two agents editing one file"
      : "Ownership is exclusive and frozen in the manifest. Two agents editing one file overwrite",
    surface.kind === "plan"
      ? "overwrite each other, so editing outside this list is a defect even when the change is correct."
      : "each other, so editing outside this list is a defect even when the change is correct.",
    "If a shared file must change, STOP, write it in the Timeline, and say so in your summary.",
    "",
    ...surface.ownedFiles.map((file) => `- \`${file}\``),
    "",
  ]

  if (surface.sharedFiles?.length) {
    lines.push(
      "### Shared, and NOT yours to edit",
      "",
      "This surface renders through files another work order owns. Read them for context; editing",
      "one is how two agents overwrite each other. If the change you need lives here, STOP and say so.",
      "",
      ...surface.sharedFiles.map((entry) => `- \`${entry.file}\` (owned by \`${entry.owner}\`)`),
      "",
    )
  }

  lines.push("## Backlog A: enumerated and machine-COUNTED (the fix is still a judgement call)", "")
  if (debt.total === 0) {
    lines.push(
      "None. Every `local/*` design rule already passes on your owned files.",
      "",
      "That is a FLOOR you have already met, not evidence the surface looks right. Backlog B is the work.",
      "",
    )
  } else {
    lines.push(
      `${debt.total} suppressed DESIGN.md violation(s) in your owned files. These are real defects that`,
      "were measured and committed to the lint baseline, then never assigned to anyone.",
      "",
      "| file | rule | count |",
      "|---|---|---|",
      ...debt.rows.map((row) => `| \`${row.file}\` | \`${row.rule}\` | ${row.count} |`),
      "",
      "**Counting these is objective. Fixing them is not.** `local/spacing-scale` autofixes only an",
      "unambiguous snap (within 1px of a unique step: 9 -> 8, 13 -> 12) and deliberately refuses the",
      "rest, because taking a 6px gap to 4 or a 14px padding to 12 CHANGES THE LAYOUT. Verified on this",
      "repo: `eslint --fix` over a 30-violation file changed zero lines. So do not batch-snap every",
      "number to the nearest step and call it done - that is the shallow sweep this harness exists to",
      "stop. Decide each one against the surrounding rhythm (tight within a group, air between groups),",
      "and where a value is genuinely load-bearing, say so in the Timeline rather than forcing it.",
      "",
      "See the violations with:",
      "  `npx eslint <file> --suppressions-location <an-empty-json-file>`  (the baseline hides them otherwise)",
      "Then `npm run lint:prune` in the workspace, then `node tools/workorder.mjs --check`.",
      "Editing `eslint-suppressions.json` by hand instead of fixing the code is fabricating a result,",
      "and `tools/check-diff-ownership.mjs` detects a count that fell for a file you never edited.",
      "",
    )
  }

  lines.push(
    "## Backlog B: judgement, human-granted",
    "",
    "No gate can check these. They are why a human tick is the only thing that grants a cell.",
    "",
    ...judgementFor(surface.kind).map((item) => `- ${item}`),
    "",
  )

  if (surface.cells) {
    lines.push(
      "## Cells",
      "",
      `This ${surface.foldedSurfaceIds?.length ? "order (with its folded surface ids)" : "surface"} expands to ${surface.cells} cell(s): ${axes.join(", ")}.`,
      surface.pixelEvidence === "web-capture"
        ? "Web: `npm run surfaces:capture -- --filter <id>` produces the screenshot a human will look at."
        : "Mobile: no deterministic pixel pipeline exists, so there is no screenshot to produce. Say so plainly rather than implying visual evidence you do not have.",
      "",
    )
  }

  lines.push(
    "## Definition of done for THIS work order",
    "",
    `1. Backlog A is 0 (\`node tools/workorder.mjs --check --id ${surface.surfaceId}\` exits 0).`,
    "2. The diff touches only the owned files above (`node tools/check-diff-ownership.mjs --id <id>` agrees).",
    "3. You appended one Timeline entry saying what you changed and what you deliberately did not.",
    "",
    ...(surface.cells > 0
      ? [
          "Clearing Backlog A is a floor and is NOT evidence of redesign: the depth number for this",
          `surface comes from \`node tools/workorder.mjs --check --id ${surface.surfaceId}\`, and it is a veto`,
          "axis a human consults, never a target. Only a human tick in `signoff.json` grants completion.",
          "",
        ]
      : []),
    ...(surface.kind === "plan"
      ? [
          "Meeting all three, plus the plan's own acceptance criteria and a green lint/type-check/test run,",
          "makes this READY FOR REVIEW. Open the PR and stop there. Merging is a human action, and whether",
          "the acceptance criteria are genuinely met is a human judgement, not yours to record.",
        ]
      : [
          "This makes the work order READY FOR REVIEW. It does not make it done: a human tick in",
          "`.claude/manifests/signoff.json` is the only thing that grants completion, and you cannot write it.",
        ]),
    "",
    TIMELINE_HEADING,
    "",
    "Append-only. Never rewrite or delete an entry, including your own. A fresh session cannot",
    "reconstruct what the previous ones already tried here, and that is the whole cost this section buys.",
    "",
    ...(timeline.length ? timeline : ["- (no work recorded on this surface yet)"]),
    "",
  )

  return lines.filter((line) => line !== null).join("\n")
}

/**
 * Turn a /plan file into a work-order unit.
 *
 * The manifest-sourced path only covers visual surfaces, so without this a
 * non-visual issue gets no contract at all and its agent goes straight back to
 * discovering its own file list - the 36.6% orientation cost this whole tool
 * exists to remove. A plan already names every file it will touch, which is the
 * one input the manifest was providing.
 *
 * Both documented plan shapes are parsed: the `| repo | file | action |` table
 * in plan/SKILL.md, and the `- CREATE \`path\`` bullet list real plans actually
 * use. Glob entries (`apps/web/**`) are kept out of the owned list deliberately:
 * ownership has to be checkable file by file, and a glob would silently grant
 * an agent the whole tree.
 */
function planUnit(planPath) {
  const absolute = resolve(planPath)
  if (!existsSync(absolute)) fail(`no plan file at ${absolute}`)
  const text = readFileSync(absolute, "utf8")
  const section = text.split(/^##\s+Files to Change\s*$/m)[1]
  if (!section) fail(`${planPath} has no "## Files to Change" section, so it declares no ownership.`)
  const body = section.split(/^##\s+/m)[0]

  const candidates = [...body.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim())
  const owned = []
  const globs = []
  for (const candidate of candidates) {
    if (!candidate.includes("/") || /\s/.test(candidate)) continue
    if (candidate.includes("*") || candidate.includes("{")) globs.push(candidate)
    else if (!owned.includes(candidate)) owned.push(candidate)
  }
  if (!owned.length) fail(`${planPath} names no concrete file paths in "## Files to Change".`)

  const id = absolute.split(/[\\/]/).pop().replace(/\.plan\.md$/, "").replace(/[^\w-]/g, "-")
  return {
    surfaceId: id,
    platform: owned.some((file) => file.startsWith("apps/mobile/")) ? "mobile" : "web",
    kind: "plan",
    sourceFile: planPath.replace(/\\/g, "/"),
    href: null,
    ownedFiles: owned,
    sharedFiles: [],
    globs,
    pixelEvidence: "none",
    cells: 0,
    states: new Set(),
    themes: new Set(),
    locales: new Set(),
  }
}

/**
 * Plan work orders already on disk. They come from --from-plan, not the
 * manifest, so a regeneration that treats "not derived from the manifest" as
 * "stale" destroys them - verified end to end: the documented step-9 regen
 * deleted the work order the documented step 6 had just written. The sweep
 * keeps them, and INDEX.md lists them so the index never claims a file that
 * exists is stale.
 */
function planOrdersOnDisk() {
  if (!existsSync(OUT_DIR)) return []
  const orders = []
  for (const name of readdirSync(OUT_DIR)) {
    if (!name.endsWith(".md") || name === "INDEX.md") continue
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(OUT_DIR, name), "utf8"))
    if (!frontmatter || !/^kind:\s*plan\s*$/m.test(frontmatter[1])) continue
    orders.push({
      file: name,
      surfaceId: (/^surfaceId:\s*(.+)$/m.exec(frontmatter[1])?.[1] ?? name.replace(/\.md$/, "")).trim(),
      source: (/^generatedFrom:\s*(.+)$/m.exec(frontmatter[1])?.[1] ?? "unknown").trim(),
    })
  }
  return orders.sort((a, b) => a.surfaceId.localeCompare(b.surfaceId))
}

/**
 * Owned files of a work order read back off disk. A plan order has no manifest
 * unit to recompute from, yet its definition of done points at
 * `--check --id <id>` - so that verdict has to be answerable from the contract
 * file itself, the same Boundaries slice tools/check-diff-ownership.mjs trusts.
 */
function ownedFilesFromDisk(path) {
  const text = readFileSync(path, "utf8")
  const start = text.indexOf("## Boundaries")
  const end = text.indexOf("## Backlog A")
  if (start === -1 || end === -1) return []
  const sharedAt = text.indexOf("### Shared, and NOT yours to edit")
  const stop = sharedAt !== -1 && sharedAt < end ? sharedAt : end
  return [...text.slice(start, stop).matchAll(/^- `([^`]+)`$/gm)].map((match) => match[1])
}

/**
 * The depth line is measurement for the human veto, never a target for the
 * agent: it must not move the exit code, and it must not read as a number to
 * raise - the header's refuted-grants ledger records that a churn threshold
 * was already tried as a grant and failed.
 */
function depthLineFor(unit, manifest) {
  const floorPercent = `${(REDESIGN_DEPTH_FLOOR * 100).toFixed(0)}%`
  const caveat = "veto axis a human consults; Backlog A being clear is NOT evidence of redesign"
  const baselineRef = manifest.baselineSha ?? manifest.baselineRef
  if (!baselineResolves(baselineRef)) {
    return `depth UNKNOWN vs floor ${floorPercent} - baseline ${manifest.baselineRef} does not resolve in this tree (${caveat})`
  }
  const depth = redesignDepthOf(unit.ownedFiles, baselineRef)
  return `depth ${(depth * 100).toFixed(1)}% vs floor ${floorPercent} since ${manifest.baselineRef} - ${caveat}`
}

/**
 * One line for the global --check: how much of the app the depth veto still
 * holds back, without turning --check into the full oracle. Measured before
 * wiring it in: computing depth for every surface costs ~10-15s on this repo
 * (one TS parse per owned file per side), far under the 90s budget that would
 * have demoted this to a pointer line.
 */
function depthSummaryLine(surfaceEntries, manifest) {
  const floorPercent = `${(REDESIGN_DEPTH_FLOOR * 100).toFixed(0)}%`
  const baselineRef = manifest.baselineSha ?? manifest.baselineRef
  if (!baselineResolves(baselineRef)) {
    return `depth: UNKNOWN for all ${surfaceEntries.length} surface orders - baseline ${manifest.baselineRef} does not resolve in this tree. Full report: npm run surfaces:check`
  }
  const signatureCache = new Map()
  let atZero = 0
  let belowFloor = 0
  for (const entry of surfaceEntries) {
    const depth = redesignDepthOf(entry.unit.ownedFiles, baselineRef, signatureCache)
    if (depth === 0) atZero += 1
    if (depth < REDESIGN_DEPTH_FLOOR) belowFloor += 1
  }
  return (
    `depth: ${atZero} of ${surfaceEntries.length} surface orders at 0% depth, ${belowFloor} below the ${floorPercent} floor - ` +
    "a veto axis a human consults, not a number to chase. Full report: npm run surfaces:check"
  )
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE)
    return
  }

  const planIndex = argv.indexOf("--from-plan")
  if (planIndex !== -1) {
    const unit = planUnit(argv[planIndex + 1])
    const suppressions = loadSuppressions()
    const debt = debtOf(unit.ownedFiles, suppressions)
    mkdirSync(OUT_DIR, { recursive: true })
    const path = join(OUT_DIR, `${unit.surfaceId}.md`)
    writeFileSync(path, renderWorkOrder(unit, debt, existingTimeline(path), { generatedFrom: unit.sourceFile }))
    process.stdout.write(
      `wrote ${path}\n  ${unit.ownedFiles.length} owned file(s), ${debt.total} existing lint violation(s) in them\n` +
        (unit.globs.length
          ? `  ${unit.globs.length} glob(s) in the plan were NOT granted as ownership (${unit.globs.join(", ")}).\n  Name the real files in the plan, or the agent has no checkable boundary there.\n`
          : ""),
    )
    return
  }
  const checkOnly = argv.includes("--check")
  const idIndex = argv.indexOf("--id")
  const wantedId = idIndex !== -1 ? argv[idIndex + 1] : null

  if (!existsSync(MANIFEST_PATH)) fail("the surface manifest does not exist. Run `npm run surfaces:manifest` first.")
  const manifest = readJson(MANIFEST_PATH, "surface manifest")
  const suppressions = loadSuppressions()

  const surfaces = collapseSurfaces(manifest)
  const ownedEverywhere = new Set(surfaces.flatMap((surface) => surface.ownedFiles))
  const units = [...surfaces, ...residualGroups(suppressions, ownedEverywhere)]

  // Exclusive ownership is the whole reason parallel agents can run at all, and the
  // manifest is NOT quite exclusive: `apps/web/app/(app)/page.tsx` is claimed by all
  // four Today views (view-all, view-general, view-goals, view-today), because one
  // page renders them. One file, four surfaces, 2% of the denominator - small, and
  // exactly the overwrite case first-party guidance warns about, on the surface the
  // spec records as byte-identical to baseline.
  //
  // Resolved rather than reported: a file is assigned to ONE primary owner (the
  // surface it is the sourceFile of, else the alphabetically-first claimant) and the
  // other claimants carry it as read-only context. Debt is therefore counted exactly
  // once globally, and no two agents are ever told to edit the same file.
  const claimants = new Map()
  for (const unit of units) {
    for (const file of unit.ownedFiles) {
      if (!claimants.has(file)) claimants.set(file, [])
      claimants.get(file).push(unit)
    }
  }
  const primaryOf = new Map()
  for (const [file, owners] of claimants) {
    if (owners.length === 1) {
      primaryOf.set(file, owners[0].surfaceId)
      continue
    }
    const preferred =
      owners.find((owner) => owner.sourceFile === file) ??
      [...owners].sort((a, b) => a.surfaceId.localeCompare(b.surfaceId))[0]
    primaryOf.set(file, preferred.surfaceId)
  }
  for (const unit of units) {
    unit.sharedFiles = unit.ownedFiles
      .filter((file) => primaryOf.get(file) !== unit.surfaceId)
      .map((file) => ({ file, owner: primaryOf.get(file) }))
    unit.ownedFiles = unit.ownedFiles.filter((file) => primaryOf.get(file) === unit.surfaceId)
  }

  // The resolution above can strand a unit: the four Today views all claim
  // `apps/web/app/(app)/page.tsx`, so after view-today takes it the other three
  // own ZERO files while still carrying 8 cells each - and their only work
  // order forbids every edit that could move those 24 cells. A unit like that
  // is FOLDED into the unit that owns its sourceFile: the cells, axes and any
  // recorded Timeline ride with the primary, and the primary's order names the
  // folded ids. A stranded unit with no fold target is a generation failure,
  // not a warning - cells reachable through no work order is exactly the shape
  // of debt that never gets done.
  const unitById = new Map(units.map((unit) => [unit.surfaceId, unit]))
  const foldedInto = new Map()
  for (const unit of units) {
    if (unit.ownedFiles.length > 0 || unit.cells === 0) continue
    const primary = unit.sourceFile ? unitById.get(primaryOf.get(unit.sourceFile)) : null
    if (!primary) {
      fail(
        `unit "${unit.surfaceId}" carries ${unit.cells} cell(s) but owns zero files after primary-owner ` +
          `resolution, and its sourceFile has no primary owner to fold into. Its cells would be reachable ` +
          `through no work order - fix the derivation before regenerating.`,
      )
    }
    primary.cells += unit.cells
    for (const state of unit.states) primary.states.add(state)
    for (const theme of unit.themes) primary.themes.add(theme)
    for (const locale of unit.locales) primary.locales.add(locale)
    primary.foldedSurfaceIds = [...(primary.foldedSurfaceIds ?? []), unit.surfaceId]
    primary.foldedTimeline = [
      ...(primary.foldedTimeline ?? []),
      ...existingTimeline(join(OUT_DIR, `${unit.surfaceId}.md`)).filter((line) => !line.includes("(no work recorded")),
    ]
    foldedInto.set(unit.surfaceId, primary.surfaceId)
  }

  const ledger = units
    .filter((unit) => !foldedInto.has(unit.surfaceId))
    .map((unit) => ({ unit, debt: debtOf(unit.ownedFiles, suppressions) }))
    .sort((a, b) => b.debt.total - a.debt.total || a.unit.surfaceId.localeCompare(b.unit.surfaceId))

  if (wantedId) {
    const foldedPrimary = foldedInto.get(wantedId)
    if (foldedPrimary) {
      fail(`work order "${wantedId}" is folded into "${foldedPrimary}": it renders entirely through files that order owns, so its cells ride there. Use --id ${foldedPrimary}.`)
    }
    let found = ledger.find((entry) => entry.unit.surfaceId === wantedId)
    if (!found) {
      const planOrder = planOrdersOnDisk().find((order) => order.surfaceId === wantedId)
      if (planOrder && checkOnly) {
        found = { unit: { surfaceId: wantedId, cells: 0 }, debt: debtOf(ownedFilesFromDisk(join(OUT_DIR, planOrder.file)), suppressions) }
      } else if (planOrder) {
        fail(`"${wantedId}" is a plan work order with no manifest unit to re-render: read .claude/workorders/${planOrder.file} directly.`)
      } else {
        fail(`no work order with id "${wantedId}". Run without --id to list them.`)
      }
    }
    if (!checkOnly) {
      process.stdout.write(renderWorkOrder(found.unit, found.debt, existingTimeline(join(OUT_DIR, `${wantedId}.md`)), manifest))
      return
    }
    // The per-order verdict a bundle child can act on. Before this existed,
    // --check --id printed the work order and returned before the exit logic,
    // so an order carrying 68 violations exited 0 exactly like a clean one.
    const lines = [`${wantedId}: ${found.debt.total} outstanding mechanical violation(s)`]
    for (const row of found.debt.rows) lines.push(`  ${row.file}  ${row.rule}  ${row.count}`)
    if (found.unit.cells > 0) lines.push(depthLineFor(found.unit, manifest))
    lines.push("Mechanical debt is a floor, not a grant. Only a human tick in signoff.json completes a cell.")
    process.stdout.write(lines.join("\n") + "\n")
    process.exit(found.debt.total > 0 ? 1 : 0)
  }

  const totalDebt = ledger.reduce((sum, entry) => sum + entry.debt.total, 0)
  const withDebt = ledger.filter((entry) => entry.debt.total > 0)
  const residual = ledger.filter((entry) => entry.unit.kind === "residual")
  const surfaceOrders = ledger.filter((entry) => entry.unit.kind !== "residual")

  const planOrders = planOrdersOnDisk()
  const foldedList = [...foldedInto.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  if (!checkOnly) {
    mkdirSync(OUT_DIR, { recursive: true })
    const keep = new Set(ledger.map((entry) => `${entry.unit.surfaceId}.md`))
    keep.add("INDEX.md")
    for (const order of planOrders) keep.add(order.file)
    for (const stale of readdirSync(OUT_DIR).filter((name) => name.endsWith(".md") && !keep.has(name))) {
      rmSync(join(OUT_DIR, stale))
    }
    for (const entry of ledger) {
      const path = join(OUT_DIR, `${entry.unit.surfaceId}.md`)
      const timeline = [...existingTimeline(path), ...(entry.unit.foldedTimeline ?? [])]
      writeFileSync(path, renderWorkOrder(entry.unit, entry.debt, timeline, manifest))
    }
    writeFileSync(
      join(OUT_DIR, "INDEX.md"),
      [
        "# Work order index",
        "",
        `Generated from manifest \`${manifest.generatedFrom ?? "unknown"}\`. Do not hand-edit; run \`node tools/workorder.mjs\`.`,
        "",
        `- ${ledger.length} work orders (${surfaceOrders.length} surfaces + ${residual.length} residual groups)`,
        `- ${totalDebt} mechanical violations outstanding across ${withDebt.length} work orders`,
        "",
        "Mechanical debt is a FLOOR. Completion is granted only by a human tick in signoff.json.",
        "",
        ...(foldedList.length
          ? [
              "## Folded surface ids (no file of their own, by design)",
              "",
              "Each renders entirely through files its primary owner's order controls, so a separate",
              "order would forbid every edit that could move its cells. The cells ride with the primary.",
              "",
              ...foldedList.map(([id, primary]) => `- \`${id}\` folded into [${primary}](${primary}.md)`),
              "",
            ]
          : []),
        ...(planOrders.length
          ? [
              "## Plan work orders (from --from-plan, preserved across regenerations)",
              "",
              "Not manifest-derived, so they are never stale to a regeneration; one is deleted by",
              "hand when its plan ships.",
              "",
              ...planOrders.map((order) => `- [${order.surfaceId}](${order.file}) - plan \`${order.source}\``),
              "",
            ]
          : []),
        "| work order | platform | kind | owned | cells | mech. debt |",
        "|---|---|---|---|---|---|",
        ...ledger.map(
          (entry) =>
            `| [${entry.unit.surfaceId}](${entry.unit.surfaceId}.md) | ${entry.unit.platform} | ${entry.unit.kind} | ${entry.unit.ownedFiles.length} | ${entry.unit.cells} | ${entry.debt.total} |`,
        ),
        "",
      ].join("\n"),
    )
  }

  if (checkOnly) {
    // One stable, greppable line per order still carrying debt, so a bundle
    // child can read ITS OWN number out of the global run (`grep '^DEBT <id> '`)
    // instead of inferring it from an aggregate total it cannot influence.
    for (const entry of withDebt) {
      const worst = entry.debt.rows.slice(0, 3).map((row) => `${row.file} (${row.count})`).join(", ")
      process.stdout.write(`DEBT ${entry.unit.surfaceId}  ${entry.debt.total}  worst: ${worst}\n`)
    }
  }

  process.stdout.write(
    [
      `${ledger.length} work orders  (${surfaceOrders.length} surfaces + ${residual.length} residual groups${foldedList.length ? `; ${foldedList.length} surface id(s) folded into their primary` : ""})`,
      `${ownedEverywhere.size} files owned by a surface; ${residual.reduce((n, entry) => n + entry.unit.ownedFiles.length, 0)} more carry debt and are owned by a residual group`,
      `${totalDebt} mechanical violations outstanding across ${withDebt.length} work orders`,
      checkOnly ? depthSummaryLine(surfaceOrders, manifest) : `written to .claude/workorders/`,
      "",
      "Mechanical debt is a floor, not a grant. Only a human tick in signoff.json completes a cell.",
      "",
    ]
      .filter(Boolean)
      .join("\n"),
  )

  if (checkOnly && totalDebt > 0) process.exit(1)
}

main()
