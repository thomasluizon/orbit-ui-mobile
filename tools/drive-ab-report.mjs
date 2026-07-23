#!/usr/bin/env node
/**
 * drive-ab-report: tally drive outcomes per model from the run logs, so the
 * Sonnet-vs-Opus quality delta on real work is measured, not guessed.
 *
 * Reads `<drive-dir>/runs/<stamp>/task-*.json` (written by run.mjs, each carrying
 * the `model` that actually ran the bundle) and reports, per model: bundle count,
 * status split (done/blocked/failed/unknown), the independent verifier's DISAGREE
 * rate (--sleep runs only), an "intervention rate" (blocked+failed+unknown+DISAGREE
 * over total — the bundles that did NOT cleanly self-complete), and spend/duration.
 *
 * With --rework it augments each done/blocked PR with `gh pr view` commit counts as
 * a rough post-drive rework proxy (best-effort; needs `gh`, degrades to a note).
 *
 * Contract: tools/CONVENTIONS.md — non-interactive, cwd-safe, stdout=report,
 * stderr=errors. Exit 0 = report printed, 1 = no records found, 2 = usage/error.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIR = resolve(HERE, "..", ".claude", "drive")

const HELP = `drive-ab-report — per-model quality tally from drive run logs

USAGE
  node tools/drive-ab-report.mjs [--dir <drive-dir>] [--since <ISO-date>] [--rework] [--json]

OPTIONS
  --dir <path>    drive runtime dir holding runs/ (default: .claude/drive next to this repo)
  --since <date>  only count run folders at/after this ISO date (e.g. 2026-07-18)
  --rework        augment with 'gh pr view' commit counts per PR (best-effort; needs gh)
  --json          emit the structured report as JSON instead of the human table
  -h, --help      this help

READS   <dir>/runs/<stamp>/task-*.json  (run.mjs records the model per bundle)
EXIT    0 report printed · 1 no records found · 2 usage / read error`

function parseArgs(argv) {
  const out = { dir: DEFAULT_DIR, since: null, rework: false, json: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "-h" || a === "--help") return { help: true }
    else if (a === "--dir" && argv[i + 1]) out.dir = resolve(argv[++i])
    else if (a === "--since" && argv[i + 1]) out.since = argv[++i]
    else if (a === "--rework") out.rework = true
    else if (a === "--json") out.json = true
    else return { error: `unknown or incomplete argument: ${a}` }
  }
  return out
}

/** Collect every task record under runs/, keeping the run-folder stamp for --since filtering. */
function collectRecords(dir, since) {
  const runsDir = join(dir, "runs")
  let stamps = []
  try {
    stamps = readdirSync(runsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  } catch {
    return []
  }
  const records = []
  for (const stamp of stamps) {
    if (since && stamp.slice(0, 10) < since) continue
    const runPath = join(runsDir, stamp)
    let files = []
    try {
      files = readdirSync(runPath).filter((f) => /^task-.*\.json$/.test(f))
    } catch {
      continue
    }
    for (const file of files) {
      try {
        const rec = JSON.parse(readFileSync(join(runPath, file), "utf8"))
        records.push({ ...rec, _stamp: stamp })
      } catch {
        continue
      }
    }
  }
  return records
}

function emptyGroup() {
  return {
    n: 0,
    status: { done: 0, blocked: 0, failed: 0, unknown: 0, skipped: 0 },
    verdict: { AGREE: 0, DISAGREE: 0, UNSURE: 0 },
    verified: 0,
    totalCost: 0,
    totalMs: 0,
    prs: [],
  }
}

function tally(records) {
  const groups = {}
  for (const rec of records) {
    const model = rec.model || "unknown(pre-instrumentation)"
    const g = (groups[model] ||= emptyGroup())
    g.n++
    if (g.status[rec.status] !== undefined) g.status[rec.status]++
    else g.status.unknown++
    if (rec.verdict && g.verdict[rec.verdict] !== undefined) {
      g.verdict[rec.verdict]++
      g.verified++
    }
    g.totalCost += Number(rec.cost) || 0
    g.totalMs += Number(rec.elapsedMs) || 0
    if (rec.pr) g.prs.push({ pr: rec.pr, model, status: rec.status })
  }
  return groups
}

function pct(part, whole) {
  return whole > 0 ? (100 * part) / whole : 0
}

/** Bundles that did NOT cleanly self-complete: blocked + failed + unknown + verifier DISAGREE. */
function interventionCount(g) {
  return g.status.blocked + g.status.failed + g.status.unknown + g.verdict.DISAGREE
}

function addRework(groups) {
  const probe = spawnSync("gh", ["--version"], { encoding: "utf8" })
  if (probe.status !== 0) {
    process.stderr.write("--rework: `gh` not runnable; skipping the rework augmentation.\n")
    return null
  }
  const rework = {}
  for (const [model, g] of Object.entries(groups)) {
    let prsSeen = 0
    let commitSum = 0
    let merged = 0
    for (const { pr } of g.prs) {
      const r = spawnSync("gh", ["pr", "view", pr, "--json", "commits,state"], { encoding: "utf8" })
      if (r.status !== 0) continue
      try {
        const info = JSON.parse(r.stdout)
        prsSeen++
        commitSum += Array.isArray(info.commits) ? info.commits.length : 0
        if (info.state === "MERGED") merged++
      } catch {
        continue
      }
    }
    rework[model] = { prsSeen, avgCommits: prsSeen ? commitSum / prsSeen : null, merged }
  }
  return rework
}

function buildReport(groups, rework) {
  const models = Object.keys(groups).sort()
  const report = { models: {}, comparison: null }
  for (const model of models) {
    const g = groups[model]
    const intervention = interventionCount(g)
    report.models[model] = {
      bundles: g.n,
      done: g.status.done,
      blocked: g.status.blocked,
      failed: g.status.failed,
      unknown: g.status.unknown,
      skipped: g.status.skipped,
      donePct: pct(g.status.done, g.n),
      interventionRate: pct(intervention, g.n),
      verifierRuns: g.verified,
      disagree: g.verdict.DISAGREE,
      disagreeRate: g.verified ? pct(g.verdict.DISAGREE, g.verified) : null,
      avgCostUsd: g.n ? g.totalCost / g.n : 0,
      totalCostUsd: g.totalCost,
      avgMinutes: g.n ? g.totalMs / g.n / 60000 : 0,
      rework: rework?.[model] || null,
    }
  }
  const s = report.models.sonnet
  const o = report.models.opus
  if (s && o) {
    report.comparison = {
      donePctDelta: s.donePct - o.donePct,
      interventionRateDelta: s.interventionRate - o.interventionRate,
      disagreeRateDelta: s.disagreeRate != null && o.disagreeRate != null ? s.disagreeRate - o.disagreeRate : null,
      avgCostDeltaPct: o.avgCostUsd > 0 ? pct(o.avgCostUsd - s.avgCostUsd, o.avgCostUsd) : null,
    }
  }
  return report
}

function n1(x) {
  return x == null ? "n/a" : x.toFixed(1)
}

function renderHuman(report) {
  const lines = ["drive A/B — outcomes per model", ""]
  const models = Object.keys(report.models)
  if (!models.length) return "No task records found."
  for (const model of models) {
    const m = report.models[model]
    lines.push(`## ${model}  (${m.bundles} bundle${m.bundles === 1 ? "" : "s"})`)
    lines.push(`  done ${m.done} · blocked ${m.blocked} · failed ${m.failed} · unknown ${m.unknown}${m.skipped ? ` · skipped ${m.skipped}` : ""}`)
    lines.push(`  done rate ............ ${n1(m.donePct)}%`)
    lines.push(`  intervention rate .... ${n1(m.interventionRate)}%  (blocked+failed+unknown+DISAGREE / bundles)`)
    lines.push(`  verifier DISAGREE .... ${m.verifierRuns ? `${m.disagree}/${m.verifierRuns} = ${n1(m.disagreeRate)}%` : "n/a (no --sleep verifier runs)"}`)
    lines.push(`  avg cost ............. $${m.avgCostUsd.toFixed(2)}  (total $${m.totalCostUsd.toFixed(2)})`)
    lines.push(`  avg duration ......... ${n1(m.avgMinutes)} min`)
    if (m.rework) {
      lines.push(`  rework (gh) .......... ${m.rework.prsSeen} PR seen · avg ${n1(m.rework.avgCommits)} commits/PR · ${m.rework.merged} merged`)
    }
    lines.push("")
  }
  if (report.comparison) {
    const c = report.comparison
    lines.push("## sonnet − opus (Sonnet worse if positive on intervention/DISAGREE, better if positive on cost saved)")
    lines.push(`  done-rate delta ...... ${n1(c.donePctDelta)} pts`)
    lines.push(`  intervention delta ... ${n1(c.interventionRateDelta)} pts`)
    lines.push(`  DISAGREE delta ....... ${c.disagreeRateDelta == null ? "n/a" : `${n1(c.disagreeRateDelta)} pts`}`)
    lines.push(`  cost saved ........... ${c.avgCostDeltaPct == null ? "n/a" : `${n1(c.avgCostDeltaPct)}%`}  (Sonnet vs Opus avg $/bundle)`)
    lines.push("")
    lines.push("Read: a small/zero intervention+DISAGREE delta ⇒ all-Sonnet is safe (take the cost saving).")
    lines.push("A large positive delta on YOUR multi-repo bundles ⇒ the compounding bit; keep Opus for the hard tier.")
  } else {
    lines.push("(Need bundles recorded under BOTH `sonnet` and `opus` to print the comparison — run your Opus")
    lines.push(" baseline and the Sonnet override week, then re-run this.)")
  }
  return lines.join("\n")
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    process.stdout.write(HELP + "\n")
    return 0
  }
  if (opts.error) {
    process.stderr.write(opts.error + "\n\n" + HELP + "\n")
    return 2
  }
  try {
    statSync(opts.dir)
  } catch {
    process.stderr.write(`drive dir not found: ${opts.dir}\n`)
    return 2
  }
  const records = collectRecords(opts.dir, opts.since)
  if (!records.length) {
    process.stderr.write(`No task records under ${join(opts.dir, "runs")}${opts.since ? ` since ${opts.since}` : ""}.\n`)
    return 1
  }
  const groups = tally(records)
  const rework = opts.rework ? addRework(groups) : null
  const report = buildReport(groups, rework)
  if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + "\n")
  else process.stdout.write(renderHuman(report) + "\n")
  return 0
}

process.exit(main())
