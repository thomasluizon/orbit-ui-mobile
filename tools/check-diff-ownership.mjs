#!/usr/bin/env node
/**
 * check-diff-ownership: the anti-reward-hacking gate, scoped to the DIFF rather
 * than to the shape of a shell command.
 *
 * The failure this exists to stop is not "the agent lied". It is "the agent
 * found the cheapest route to green", and the cheapest route is usually editing
 * the check instead of the code. The previous guard tried to stop that before
 * execution, by allowlisting read-only COMMAND LEADERS. That cannot work: a
 * `for` loop, an `if` test and a `2>/dev/null` redirect all fail a leader
 * allowlist while writing nothing, so it blocked three pure reads in one session
 * while a `git log --output=<path>` forged a protected file straight past it.
 *
 * A diff cannot false-positive on a read, because a read produces no diff. So
 * the layering is:
 *   - PreToolUse (.claude/hooks/forbid-gate-tamper.mjs) is a cheap early NUDGE.
 *   - This tool is the AUTHORITY for the threat it actually covers.
 *
 * Two independent questions, both answered from `git`:
 *   1. Did the change stay inside the work order's owned files?
 *   2. Did the change touch gate state, or shrink a suppression baseline for a
 *      file it never edited (the precise shape of faking the mechanical floor)?
 *
 * WHAT THIS TOOL DOES NOT CATCH, stated plainly because an adversarial review of
 * this design refuted the claim that it would:
 *
 * It is structurally blind to a bad change that stays entirely inside the files
 * the unit legitimately owns. An agent that guts a surface, memorises a test, or
 * reports far more progress than it made, without ever touching an unowned path,
 * passes this gate cleanly. That blind spot is not a tuning problem and no
 * redrawing of the ownership manifest fixes it.
 *
 * That matters because it is EXACTLY the shape of the failure this harness was
 * built for: ten sessions reported a whole-app redesign done while 9 of 171
 * surfaces cleared a 30% depth floor. No protected file was ever tampered with.
 * So this tool does not address that failure and must not be credited with it.
 * What addresses it is the work order's objective per-unit count
 * (`tools/workorder.mjs --check`, which cannot be satisfied by a self-report)
 * and the removal of any `done` status a child is able to return at all.
 *
 * This tool covers a real but narrower threat: an agent editing the scoreboard,
 * and two parallel agents overwriting each other. Keep the claim that size.
 */
import { spawnSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// ORBIT_SURFACE_ROOT mirrors the other gate tools (check-surface-coverage,
// workorder): hermetic tests point this gate at a disposable fixture repo
// instead of judging the live checkout's diff, which changes under them.
const REPO_ROOT = process.env.ORBIT_SURFACE_ROOT
  ? resolve(process.env.ORBIT_SURFACE_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..")
const WORKORDER_DIR = join(REPO_ROOT, ".claude", "workorders")

// State the gate derives its verdict from. An agent editing any of these is
// changing the scoreboard, not the game, whatever its intent.
const GATE_STATE = [
  /^\.claude[\\/]manifests[\\/]/,
  /^\.artifacts[\\/]surfaces[\\/]/,
  /^tools[\\/]calibrate-judge\.mjs$/,
  /^tools[\\/]check-surface-coverage\.mjs$/,
  /^tools[\\/]check-diff-ownership\.mjs$/,
  /^tools[\\/]workorder\.mjs$/,
  /^\.claude[\\/]hooks[\\/]/,
  /^eslint-rules[\\/]/,
]

const SUPPRESSION_FILES = ["apps/web/eslint-suppressions.json", "apps/mobile/eslint-suppressions.json"]

/*
 * Three classes of path are PERMITTED without being owned, because the harness's
 * own generated prompt orders edits to them: the first mobile-residual bundle
 * owns 9 style files, yet its rules demand `npm run lint:prune` (rewrites a
 * suppression ledger), Vitest tests (creates a test file) and i18n parity
 * (edits both locale files) - and then makes this gate's exit 0 a condition of
 * done. Obeying the prompt failed the prompt's own gate. Each class is
 * structural, not prompt-text, and each has a guard that is not ownership:
 *
 *  - The eslint-suppressions ledgers are workspace-GLOBAL by construction:
 *    `lint:prune` rewrites the whole file, so no per-surface order can own one.
 *    The real guard stays fakedSuppressions below, at full strength - a count
 *    that falls for a file this diff never edited still fails.
 *  - A test companion of an OWNED file, in the repo's actual Vitest layout
 *    (per-workspace `__tests__` trees, `*.test.ts[x]` named after the source
 *    file, or `<dir>-page` for a router `page.tsx`). A test whose source
 *    counterpart is NOT owned stays an escape: it belongs to whoever owns that
 *    source.
 *  - The i18n pair, en.json + pt-BR.json: DESIGN.md judgement work includes
 *    microcopy, the parity contract requires BOTH files in the same edit, and
 *    they are append-mostly shared state no single surface could ever own.
 *    Whether the pair actually moved together is the parity hook's verdict,
 *    not this one's.
 *
 * Nothing else is granted. Any other unowned path is still exactly the
 * parallel-agent overwrite hazard this gate exists to stop.
 */
const I18N_PAIR = ["packages/shared/src/i18n/en.json", "packages/shared/src/i18n/pt-BR.json"]

/**
 * The Vitest convention, read off the configs rather than guessed: apps/web and
 * apps/mobile include `__tests__/**\/*.test.{ts,tsx}`, packages/shared includes
 * `src/__tests__/**\/*.test.ts`. Test names are the source basename
 * (`login-styles.test.ts` for `login-styles.ts`) or `<dir>-page.test.tsx` for a
 * router `page.tsx` (`challenges-page.test.tsx` for `challenges/page.tsx`).
 */
function isOwnedTestCompanion(file, owned) {
  const match = /^(apps\/(?:web|mobile)\/|packages\/shared\/src\/)__tests__\/(?:.+\/)?([^/]+)\.test\.tsx?$/.exec(file)
  if (!match) return false
  const workspace = match[1] === "packages/shared/src/" ? "packages/shared/" : match[1]
  const stem = match[2]
  for (const ownedFile of owned) {
    if (!ownedFile.startsWith(workspace)) continue
    const segments = ownedFile.split("/")
    const base = segments[segments.length - 1].replace(/\.[jt]sx?$/, "")
    if (base === stem) return true
    if (base === "page" && `${(segments[segments.length - 2] ?? "").replace(/^\(|\)$/g, "")}-page` === stem) return true
  }
  return false
}

const USAGE = `check-diff-ownership - fail a run whose diff escaped its work order

USAGE
  node tools/check-diff-ownership.mjs --id <workOrderId> [--id <id2> ...] [--base <ref>]
  node tools/check-diff-ownership.mjs --files <a,b,c> [--base <ref>]
  node tools/check-diff-ownership.mjs --help

  --id <id>       A work order whose owned files are permitted. Repeatable, so a
                  bundle of several work orders passes several --id flags.
  --files <list>  Comma-separated permitted paths, for a unit with no work order.
  --base <ref>    Compare against this ref (default: the branch merge-base with
                  origin/HEAD, else HEAD). Uncommitted changes are always included.
  --help, -h      This text.

EXIT CODES
  0  every changed file is owned or structurally permitted (the suppression
     ledgers, an owned file's test companion, the i18n pair), and no gate state
     was touched
  1  the diff escaped its ownership, touched gate state, or moved a suppression
     count for a file it never edited
  2  bad invocation, or a work order that does not exist
`

function fail(message, code = 2) {
  process.stderr.write(`check-diff-ownership: ${message}\n`)
  process.exit(code)
}

function git(args) {
  const result = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" })
  return result.status === 0 ? result.stdout : ""
}

function normalize(path) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").trim()
}

/** Every path the working tree has changed against `base`, committed or not. */
function changedFiles(base) {
  const committed = base ? git(["diff", "--name-only", `${base}...HEAD`]) : ""
  const unstaged = git(["diff", "--name-only", "HEAD"])
  const untracked = git(["ls-files", "--others", "--exclude-standard"])
  return [...new Set([committed, unstaged, untracked].join("\n").split("\n").map(normalize).filter(Boolean))]
}

function defaultBase() {
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]).trim()
  if (!upstream) return ""
  return git(["merge-base", "HEAD", upstream]).trim()
}

/** The owned-file list a work order declares in its Boundaries section. */
function ownedFilesOf(id) {
  const path = join(WORKORDER_DIR, `${id}.md`)
  if (!existsSync(path)) fail(`no work order "${id}". Run \`node tools/workorder.mjs\` to generate them.`)
  const text = readFileSync(path, "utf8")
  const start = text.indexOf("## Boundaries")
  const sharedAt = text.indexOf("### Shared, and NOT yours to edit")
  const end = text.indexOf("## Backlog A")
  if (start === -1 || end === -1) fail(`work order "${id}" is malformed: no Boundaries or Backlog A section.`)
  // A file listed under "Shared" is deliberately NOT owned, so the slice stops there.
  const stop = sharedAt !== -1 && sharedAt < end ? sharedAt : end
  return [...text.slice(start, stop).matchAll(/^- `([^`]+)`$/gm)].map((match) => normalize(match[1]))
}

/**
 * A suppression count that fell for a file the diff never touched is the exact
 * shape of faking the mechanical floor: the scoreboard moved without the code
 * moving. Legitimately clearing debt always edits the source file too.
 */
function fakedSuppressions(base, changed) {
  const problems = []
  const changedSet = new Set(changed)
  for (const file of SUPPRESSION_FILES) {
    if (!changedSet.has(file)) continue
    const before = base ? git(["show", `${base}:${file}`]) : ""
    if (!before.trim()) continue
    const workspace = `${file.split("/").slice(0, 2).join("/")}/`
    let previous
    let current
    try {
      previous = JSON.parse(before)
      current = JSON.parse(readFileSync(join(REPO_ROOT, file), "utf8"))
    } catch {
      continue
    }
    for (const [entry, rules] of Object.entries(previous)) {
      for (const [rule, value] of Object.entries(rules)) {
        const was = value?.count ?? 0
        const now = current[entry]?.[rule]?.count ?? 0
        if (now >= was) continue
        const source = normalize(workspace + entry)
        if (!changedSet.has(source)) {
          problems.push(`${file}: ${entry} ${rule} dropped ${was} -> ${now}, but ${source} was never edited`)
        }
      }
    }
  }
  return problems
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE)
    return
  }

  const ids = []
  let explicitFiles = null
  let base = null
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--id" && argv[index + 1]) ids.push(argv[++index])
    else if (argv[index] === "--files" && argv[index + 1]) explicitFiles = argv[++index].split(",").map(normalize)
    else if (argv[index] === "--base" && argv[index + 1]) base = argv[++index]
  }
  if (!ids.length && !explicitFiles) fail("pass at least one --id or a --files list. See --help.")

  const resolvedBase = base ?? defaultBase()
  const owned = new Set(explicitFiles ?? ids.flatMap(ownedFilesOf))
  // A work order's own file is owned by the unit it describes: appending to the
  // Timeline is required by the definition of done, so it must not read as an
  // escape. INDEX.md is NOT included - it is generated, and hand-editing it is
  // editing the scoreboard.
  for (const id of ids) owned.add(`.claude/workorders/${id}.md`)
  const changed = changedFiles(resolvedBase)

  const touchedGateState = changed.filter((file) => GATE_STATE.some((pattern) => pattern.test(file.replace(/\//g, "/"))))
  const structurallyPermitted = (file) =>
    SUPPRESSION_FILES.includes(file) || I18N_PAIR.includes(file) || isOwnedTestCompanion(file, owned)
  const escaped = changed.filter((file) => !owned.has(file) && !touchedGateState.includes(file) && !structurallyPermitted(file))
  const faked = fakedSuppressions(resolvedBase, changed)

  const label = explicitFiles ? `${owned.size} explicit file(s)` : ids.join(", ")
  process.stdout.write(
    `scope: ${label}\nbase: ${resolvedBase || "(none, comparing working tree to HEAD)"}\nchanged: ${changed.length} file(s), ${owned.size} owned\n\n`,
  )

  if (!touchedGateState.length && !escaped.length && !faked.length) {
    process.stdout.write("OK: every changed file is owned by this work order or structurally permitted, and no gate state moved.\n")
    return
  }

  if (touchedGateState.length) {
    process.stderr.write(
      "GATE STATE TOUCHED. These files decide whether the work counts as done, so changing them in the\n" +
        "same run as the work is changing the scoreboard. If one genuinely needs to change, do it in its\n" +
        "own commit, on its own PR, and say why.\n" +
        touchedGateState.map((file) => `  - ${file}\n`).join(""),
    )
  }
  if (escaped.length) {
    process.stderr.write(
      "\nOUTSIDE THE WORK ORDER. Ownership is exclusive: another work order owns these, and a parallel\n" +
        "agent may be editing them right now. Revert them, or say in your summary that the work order\n" +
        "boundary was wrong and needs regenerating.\n" +
        escaped.map((file) => `  - ${file}\n`).join(""),
    )
  }
  if (faked.length) {
    process.stderr.write(
      "\nSUPPRESSION BASELINE MOVED WITHOUT THE CODE. A violation count fell for a file this diff never\n" +
        "edited, which is the scoreboard moving on its own. Clear debt by fixing the source, then\n" +
        "`npm run lint:prune`.\n" +
        faked.map((problem) => `  - ${problem}\n`).join(""),
    )
  }
  process.exit(1)
}

main()
