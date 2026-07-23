#!/usr/bin/env node
// Measures the vision judge's RECALL against ground truth: the defects a human
// actually found by looking at the app (.claude/specs/issue-539-user-found-defects.md).
//
// Why this exists. Six sessions trusted the judge as a completion oracle
// without ever asking how many known defects it catches. That is the missing
// number: a detector whose recall is unmeasured is not a detector, it is a
// mood. The published prior is poor - MLLM judges score F1 20.4% on text
// overflow and 31.2% on element collision (UI-Lens, CVPR 2026) - so the
// expectation going in is LOW recall, and the point of printing the number is
// to stop anyone treating a clean judge sweep as evidence of quality.
//
// Ground truth is encoded below rather than parsed out of the markdown: each
// row names the surface the defect lives on and the terms a judge finding
// would have to contain to count as a hit. A defect on a surface that was
// never captured is scored separately as STRUCTURALLY INVISIBLE - it is not a
// judge miss, it is an inventory/state-axis hole, and conflating the two is
// how the harness previously flattered itself.

import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = process.env.ORBIT_SURFACE_ROOT
  ? resolve(process.env.ORBIT_SURFACE_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..")

const USAGE = `calibrate-judge - measure vision-judge recall against human-found defects.

Usage:
  node tools/calibrate-judge.mjs [--verdicts <path>] [--json] [--help]

Default verdicts source: .artifacts/surfaces/verdicts.json (the judge sweep on disk).
Prints per-defect HIT / MISS / INVISIBLE and the overall recall.

Exit codes:
  0  measurement printed
  2  no verdict data to measure against
`

// Each row: the human-found defect, the surface(s) whose findings could
// contain it, and the terms a finding must mention to count as a detection.
const GROUND_TRUTH = [
  { id: 1, surfaces: ["overlay-command-palette", "command-palette"], terms: ["focus", "ring", "overflow", "double"], defect: "command palette: double focus border + input overflows container", captured: false },
  {
    id: 2,
    surfaces: null,
    terms: ["double", "title", "twice", "duplicate"],
    defect: "~17 pages: double page title (AppBar title AND page h1)",
    captured: true,
    adjudicated: false,
    adjudication: "REJECTED - the finding says the title bar is OBSCURED so defect #2 cannot be verified. That is a non-detection that names the defect, and it names it by number because the judge was handed the defect list.",
  },
  {
    id: 3,
    surfaces: ["route-calendar"],
    terms: ["default", "grid", "wrap", "misalign", "tile", "stat"],
    defect: "/calendar entirely default-styled; stat-tile labels wrap and misalign",
    captured: true,
    adjudicated: false,
    adjudication: "REJECTED - the finding is about a legend glyph on future dates, a different (real) calendar defect. It says nothing about wrapping or misaligned stat-tile labels.",
  },
  { id: 4, surfaces: ["overlay-create-habit-modal", "create-habit"], terms: ["label", "align", "chip", "template", "gap"], defect: "create-habit checklist: MODELOS label misaligned against 36px pill, mixed gaps", captured: true },
  { id: 5, surfaces: ["overlay-confirm-dialog", "confirm-dialog"], terms: ["stretch", "full-bleed", "full bleed", "width", "hug"], defect: "confirm-dialog: Salvar pill stretches full-bleed on desktop", captured: true },
  {
    id: 6,
    surfaces: null,
    terms: ["indent", "depth", "chevron", "nest", "left"],
    defect: "habit list depth-2: 3rd tier renders left of the 2nd, no chevron column",
    captured: true,
    adjudicated: false,
    adjudication: "REJECTED - the finding is the orphaned back-chevron / missing NavHeader defect on a different surface. Same word, different defect, different root cause.",
  },
  { id: 7, surfaces: ["route-chat"], terms: ["raw", "monospace", "dump", "card", "hierarchy", "pascal"], defect: "Astra chat: tool-operation result card is a raw purple dump", captured: true },
  { id: 8, surfaces: ["route-chat"], terms: ["english", "pt-br", "translat", "locale", "untranslated"], defect: "Astra chat: operation summary rendered in English inside pt-BR", captured: true },
  { id: 9, surfaces: ["view-today", "view-all", "view-general"], terms: ["empty", "cta", "width", "mismatch", "pair"], defect: "habit-list EMPTY state: stacked CTA pair visually mismatched", captured: false },
  { id: 10, surfaces: null, terms: ["wordy", "word", "cta", "label", "long"], defect: "onboarding save-plan CTA over the 1-2 word rule", captured: false },
  { id: 11, surfaces: null, terms: ["wordy", "word", "cta", "label", "long"], defect: "onboarding import CTA over the 1-2 word rule", captured: false },
  { id: 12, surfaces: ["overlay-trial-expired-modal", "trial-expired"], terms: ["wordy", "word", "cta", "label", "long"], defect: "trial-expired modal CTA over the 1-2 word rule", captured: false },
]

function loadVerdicts(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return null
  }
}

/** Every judge finding, flattened to { surfaceId, severity, issue }. */
function flattenFindings(verdicts) {
  const out = []
  for (const [surfaceId, record] of Object.entries(verdicts?.surfaces ?? {}))
    for (const finding of record.findings ?? [])
      out.push({ surfaceId, severity: finding.severity, issue: String(finding.issue ?? "") })
  return out
}

// A single shared word is not a detection. The first cut of this matcher scored
// 3 hits that were all spurious - "title" matched inside "toast covers the page
// title", "chevron" matched an unrelated nav row - which would have reported
// 42.9% recall for a judge that had found none of them. A hit therefore
// requires the finding to be ON the named surface AND to carry at least two
// distinct ground-truth terms, and every hit is printed with the matched text
// so the number can be audited by eye rather than trusted.
const MIN_TERMS_FOR_HIT = 2

function matches(row, finding) {
  if (row.surfaces && !row.surfaces.some((surface) => finding.surfaceId.includes(surface))) return false
  const text = finding.issue.toLowerCase()
  const distinct = new Set(row.terms.filter((term) => text.includes(term)))
  return distinct.size >= MIN_TERMS_FOR_HIT
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(USAGE)
    return 0
  }
  const pathIndex = args.indexOf("--verdicts")
  const verdictsPath =
    pathIndex !== -1 ? args[pathIndex + 1] : join(REPO_ROOT, ".artifacts", "surfaces", "verdicts.json")

  const verdicts = loadVerdicts(verdictsPath)
  if (!verdicts) {
    process.stderr.write(`calibrate-judge: no verdict data at ${verdictsPath}\n`)
    return 2
  }
  const findings = flattenFindings(verdicts)
  const judgedSurfaces = Object.keys(verdicts.surfaces ?? {}).length

  const rows = GROUND_TRUTH.map((row) => {
    const candidates = findings.filter((finding) => matches(row, finding))
    const status = !row.captured ? "INVISIBLE" : candidates.length > 0 ? "CANDIDATE" : "MISS"
    return { ...row, hits: candidates, status }
  })

  const capturable = rows.filter((row) => row.captured)
  const candidates = capturable.filter((row) => row.status === "CANDIDATE")
  const hit = capturable.filter((row) => row.adjudicated === true)
  const invisible = rows.filter((row) => !row.captured)

  if (args.includes("--json")) {
    process.stdout.write(JSON.stringify({ judgedSurfaces, findings: findings.length, rows }, null, 2) + "\n")
    return 0
  }

  process.stdout.write(`JUDGE CALIBRATION against ${GROUND_TRUTH.length} human-found defects\n`)
  process.stdout.write(`  verdict source   ${verdictsPath.split("\\").join("/").replace(REPO_ROOT.split("\\").join("/") + "/", "")}\n`)
  process.stdout.write(`  judged surfaces  ${judgedSurfaces}\n`)
  process.stdout.write(`  judge findings   ${findings.length}\n\n`)

  for (const row of rows) {
    const verdict = row.adjudicated === true ? "HIT" : row.adjudicated === false ? "REJECTED" : row.status
    process.stdout.write(`  [${verdict.padEnd(9)}] #${String(row.id).padStart(2)}  ${row.defect}\n`)
    if (row.hits.length > 0) {
      process.stdout.write(`               candidate: "${row.hits[0].issue.slice(0, 105)}"\n`)
      if (row.adjudication) process.stdout.write(`               adjudged:  ${row.adjudication}\n`)
    }
    if (row.status === "INVISIBLE") process.stdout.write("               the state/surface this lives on was never captured\n")
  }

  const recall = capturable.length > 0 ? (hit.length / capturable.length) * 100 : 0
  const overall = (hit.length / GROUND_TRUTH.length) * 100
  process.stdout.write(`\nkeyword CANDIDATES (unadjudicated):         ${candidates.length}/${capturable.length}\n`)
  process.stdout.write(`ADJUDICATED RECALL, defects it could see:  ${hit.length}/${capturable.length}  (${recall.toFixed(1)}%)\n`)
  process.stdout.write(`ADJUDICATED RECALL, all known defects:     ${hit.length}/${GROUND_TRUTH.length}  (${overall.toFixed(1)}%)\n`)
  process.stdout.write(`STRUCTURALLY INVISIBLE to the pipeline:    ${invisible.length}/${GROUND_TRUTH.length}  (an inventory/state hole, not a judge miss)\n`)
  process.stdout.write(
    "\nEvery keyword candidate is adjudicated by reading the matched text, because the\n" +
      "first cut of this tool scored 3 hits that were all spurious and would have\n" +
      "reported 42.9% recall for a judge that found none of them.\n" +
      "\nCONTAMINATION WARNING: until 2026-07-19 the judge prompt included the very file\n" +
      "this ground truth comes from, so a judge could quote a defect it had been handed\n" +
      "rather than seen (candidate #2 is literally the judge saying it CANNOT verify\n" +
      "defect #2, by number). Numbers measured against that sweep are an upper bound.\n" +
      "\nRead this as a ceiling on what a clean judge sweep proves. It is why the judge\n" +
      "can VETO a cell but never GRANT one: completion is granted by a human tick.\n",
  )
  return 0
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) process.exit(main())
