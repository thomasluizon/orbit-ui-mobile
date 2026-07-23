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
 * The trust root for question 1 is GIT HISTORY, never the working tree. The
 * child is ordered to edit its own work order file (the Timeline append is part
 * of the definition of done), so the on-disk copy is writable by the exact
 * party this gate polices. Reading Boundaries from it let a child annex any
 * file in the repo with one appended line, and for plan orders nothing
 * downstream ever reverted it. The base ref is "before the child ran" (the
 * driver starts every bundle from a clean committed tree), which no child can
 * edit from inside a run: ownership is read from `git show <base>:...`, and the
 * child's copies may only APPEND to that base copy. See ownedFilesOf.
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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
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
                  MUTUALLY EXCLUSIVE with --id: --files carries no work-order
                  trust root, so accepting both would drop every --id check while
                  still granting each order file (exit 2 if both are passed).
  --base <ref>    Compare against this ref. Default resolution, fail-closed: the
                  merge-base with @{upstream}, else with origin/main, else with
                  main; none resolving is exit 2, never an empty diff. An
                  unresolvable explicit ref is exit 2 too. Uncommitted changes
                  are always included.
  --help, -h      This text.

EXIT CODES
  0  every changed file is owned or structurally permitted (the suppression
     ledgers, an owned file's test companion, the i18n pair, or a work-order
     change that byte-equals a fresh \`node tools/workorder.mjs\` regeneration
     with every base Timeline entry intact), and no gate state was touched
  1  the diff escaped its ownership, touched gate state, moved a suppression
     count for a file it never edited, deleted or corrupted a suppression
     ledger that existed at base (the scoreboard cannot vanish mid-run), or
     rewrote a work order file beyond an append or a sanctioned regeneration
  2  bad invocation, an unresolvable base, or a work order absent at the base
     ref (a work order created mid-run cannot self-grant ownership)
`

function fail(message, code = 2) {
  process.stderr.write(`check-diff-ownership: ${message}\n`)
  process.exit(code)
}

function git(args) {
  const result = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" })
  return result.status === 0 ? result.stdout : ""
}

/** A ref's copy of a repo file, or null when the path is absent at that ref. */
function gitShow(ref, path) {
  const result = spawnSync("git", ["show", `${ref}:${path}`], { cwd: REPO_ROOT, encoding: "utf8" })
  return result.status === 0 ? result.stdout : null
}

function normalize(path) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").trim()
}

/** Every path the working tree has changed against `base`, committed or not. */
function changedFiles(base) {
  const committed = git(["diff", "--name-only", `${base}...HEAD`])
  const unstaged = git(["diff", "--name-only", "HEAD"])
  const untracked = git(["ls-files", "--others", "--exclude-standard"])
  return [...new Set([committed, unstaged, untracked].join("\n").split("\n").map(normalize).filter(Boolean))]
}

/**
 * Resolve the ref the diff is judged against, and refuse to guess. The old
 * default returned "" when @{upstream} was unset, and "" silently dropped the
 * COMMITTED diff from the verdict - vacuously green exactly when the child had
 * committed, which the definition of done orders it to do. An unresolvable
 * explicit --base degraded the same way. A gate that cannot see the diff must
 * fail loudly, never pass quietly.
 *
 * Resolution order: merge-base with @{upstream}, else origin/main, else main.
 * A candidate whose merge-base IS HEAD proves nothing about branch-local
 * commits - the post-push upstream is the branch's own remote copy, so their
 * merge-base is HEAD and the committed diff is empty by construction. Such a
 * candidate is kept only as a last resort for the legitimate no-local-commits
 * case, where HEAD genuinely is the base.
 */
function resolveBase(explicitBase) {
  if (explicitBase) {
    const sha = git(["rev-parse", "--verify", "--quiet", `${explicitBase}^{commit}`]).trim()
    if (!sha) fail(`--base "${explicitBase}" does not resolve to a commit. An unresolvable base must never degrade to an empty diff.`)
    return { sha, how: `explicit --base ${explicitBase}` }
  }
  const head = git(["rev-parse", "HEAD"]).trim()
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]).trim()
  let headIsBase = null
  for (const candidate of [upstream, "origin/main", "main"].filter(Boolean)) {
    if (!git(["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]).trim()) continue
    const mergeBase = git(["merge-base", "HEAD", candidate]).trim()
    if (!mergeBase) continue
    if (mergeBase !== head) return { sha: mergeBase, how: `merge-base with ${candidate}` }
    if (!headIsBase) headIsBase = { sha: head, how: `HEAD (already contained in ${candidate})` }
  }
  if (headIsBase) return headIsBase
  fail(
    "no base resolved: no @{upstream}, origin/main or main to merge-base against. Pass --base <ref>. " +
      "Without a base the committed diff is invisible, and a gate that cannot see the diff fails rather than passes.",
  )
}

/**
 * The owned-file list a work order declares in its Boundaries section, read
 * from the BASE ref's copy - never the working tree, which the policed child
 * writes to by contract (the Timeline append). The base ref cannot be edited
 * from inside a run, so a Boundaries line added mid-run grants nothing: this is
 * the fix for the measured annexation exploit, where one working-tree line
 * handed a child exclusive ownership of another order's file and the driver's
 * own measurement then reported a false green.
 *
 * Both the committed (HEAD) and working copies are held APPEND-ONLY against the
 * base copy: byte-prefix after CRLF normalisation, because checkouts
 * materialise these files with either line ending. The Timeline may grow at the
 * end; a rewrite, reorder or truncation is the same exploit through the other
 * door, and checking HEAD as well as the working tree closes the
 * commit-the-rewrite-then-revert-the-working-copy variant. The ONE sanctioned
 * exception to the byte-prefix rule is regeneration output - see the
 * regeneration carve-out below for why it exists and why it grants nothing.
 */
function ownedFilesOf(id, baseSha, regenAllowed) {
  const relPath = `.claude/workorders/${id}.md`
  const baseRaw = gitShow(baseSha, relPath)
  if (baseRaw === null)
    fail(
      `no work order "${id}" at base ${baseSha}. Ownership is granted by the base ref, not the working tree: ` +
        `a work order created mid-run cannot self-grant ownership. A legitimate order is committed before the ` +
        `run starts (the driver requires a clean tree); commit it and pass a --base that contains it.`,
    )
  const baseText = baseRaw.replace(/\r\n/g, "\n")
  const workingPath = join(WORKORDER_DIR, `${id}.md`)
  const workingText = existsSync(workingPath) ? readFileSync(workingPath, "utf8").replace(/\r\n/g, "\n") : null
  const headRaw = gitShow("HEAD", relPath)
  const headText = headRaw === null ? null : headRaw.replace(/\r\n/g, "\n")
  const appendOnly = (text) => text !== null && text.startsWith(baseText)
  if (!appendOnly(workingText) || !appendOnly(headText)) {
    // The bundle's own order may change beyond an append in exactly one way:
    // clearing Backlog A moves `mechanicalDebt` in the frontmatter, and the CI
    // freshness gate requires that regenerated ledger committed. The Timeline
    // may still only grow.
    const sanctioned = regenAllowed && regenSanctioned(relPath, baseText, [workingText, headText], true)
    if (!sanctioned)
      fail(
        `work order "${id}" rewritten - Timeline is append-only. The base ref's copy must be a byte-prefix of ` +
          `both the committed and working copies; revert the file and append your Timeline entry at the end instead. ` +
          `The one sanctioned exception is byte-exact \`node tools/workorder.mjs\` regeneration output with every ` +
          `base Timeline entry intact${regenAllowed ? ", and this change is not it" : "; it is withheld here because gate state was touched"}.`,
        1,
      )
  }
  const start = baseText.indexOf("## Boundaries")
  const sharedAt = baseText.indexOf("### Shared, and NOT yours to edit")
  const end = baseText.indexOf("## Backlog A")
  if (start === -1 || end === -1) fail(`work order "${id}" is malformed at base ${baseSha}: no Boundaries or Backlog A section.`)
  // A file listed under "Shared" is deliberately NOT owned, so the slice stops there.
  const stop = sharedAt !== -1 && sharedAt < end ? sharedAt : end
  return [...baseText.slice(start, stop).matchAll(/^- `([^`]+)`$/gm)].map((match) => normalize(match[1]))
}

/*
 * THE REGENERATION CARVE-OUT, and its trust chain.
 *
 * An honest debt-clearing bundle cannot avoid rewriting its own work order:
 * clearing Backlog A moves `mechanicalDebt` in the frontmatter, which sits
 * BEFORE the Timeline append point, and the CI freshness gate (test.yml,
 * "Work-order ledger freshness") requires the regenerated ledger to be
 * COMMITTED. Byte-prefix append-only plus byte-strict freshness were therefore
 * mutually unsatisfiable for the loop's primary work - measured end to end:
 * append-only green with freshness red, or freshness green with append-only
 * red, and no third state existed.
 *
 * The resolution is not to weaken either gate but to sanction exactly ONE
 * shape: a work-order change whose content byte-equals what the CURRENT
 * `tools/workorder.mjs` regenerates from the same inputs (CRLF-normalised),
 * with every base-ref Timeline entry still present in order. The trust chain:
 *
 *   1. Gate state is judged FIRST (main computes touchedGateState before any
 *      ownership check runs). The generator, this tool, the manifest and the
 *      hooks are all GATE_STATE, so a run that edited any of them never
 *      reaches this carve-out: a tampered generator cannot certify its own
 *      output.
 *   2. Regeneration DERIVES from the manifest (gate state, untouched by step 1)
 *      and the suppression ledgers (whose legitimacy fakedSuppressions and its
 *      ledger-vanish check enforce independently). Matching regeneration output
 *      can therefore only re-state what those inputs already say - it can never
 *      GRANT ownership, and Boundaries are read off the base ref regardless.
 *   3. Timeline entries recorded at the base ref must survive verbatim, in
 *      order: regeneration preserves them, so a regen-shaped copy missing one
 *      is a hand rewrite laundered through the generator, and it fails.
 *
 * A plan order gets NO carve-out: regeneration preserves plan orders verbatim
 * instead of re-deriving them, so "matches regeneration output" would be
 * vacuously true for any hand edit. Their append-only contract stands whole.
 */

/**
 * The generator the carve-out compares against: the judged tree's own
 * tools/workorder.mjs. Hermetic tests point ORBIT_SURFACE_ROOT at a fixture
 * tree carrying no tools/, so the sibling next to this script (the same file
 * in a real checkout) is the fallback; in a real run a deleted or edited
 * in-repo copy is gate state and failed before the carve-out could run.
 */
function generatorPath() {
  const inRepo = join(REPO_ROOT, "tools", "workorder.mjs")
  return existsSync(inRepo) ? inRepo : join(dirname(fileURLToPath(import.meta.url)), "workorder.mjs")
}

let regenCanonical = null
/** Regenerate the work-order ledger from the working tree's inputs, once, in a throwaway dir. */
function canonicalRegenTree() {
  if (regenCanonical) return regenCanonical
  const temp = mkdtempSync(join(tmpdir(), "orbit-regen-canonical-"))
  process.on("exit", () => {
    try {
      rmSync(temp, { recursive: true, force: true })
    } catch {
      /* temp cleanup is housekeeping; it must never move a verdict */
    }
  })
  const seed = (rel) => {
    const source = join(REPO_ROOT, rel)
    if (!existsSync(source)) return
    const target = join(temp, rel)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(source, target, { recursive: true })
  }
  seed(".claude/manifests/surfaces.json")
  seed(".claude/workorders")
  for (const file of SUPPRESSION_FILES) {
    seed(file)
    // loadSuppressions treats "ledger missing while its workspace exists" as a
    // hard failure, so the workspace's presence must be mirrored too.
    const workspace = file.split("/").slice(0, 2).join("/")
    if (existsSync(join(REPO_ROOT, workspace))) mkdirSync(join(temp, workspace), { recursive: true })
  }
  const regen = spawnSync(process.execPath, [generatorPath()], {
    cwd: temp,
    env: { ...process.env, ORBIT_SURFACE_ROOT: temp },
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
  regenCanonical =
    regen.status === 0
      ? { dir: temp }
      : { failure: `the generator exited ${regen.status}: ${(regen.stderr || regen.stdout || "").trim().slice(-200)}` }
  return regenCanonical
}

/** Timeline entries of a work-order body; the generator's own placeholder is presentation, not history. */
function timelineEntriesOf(text) {
  const index = text.indexOf("## Timeline")
  if (index === -1) return []
  return text
    .slice(index)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().startsWith("- ") && !line.includes("(no work recorded on this surface yet)"))
}

/**
 * Is every candidate copy exactly the generator's own output, with the base
 * ref's recorded history intact? `timelineMayGrow` is true only for the
 * bundle's OWN orders (the Timeline append is part of its contract); a foreign
 * order's Timeline is not this bundle's to write, appended or otherwise.
 * A `null` candidate is an absent copy, sanctioned only when the regeneration
 * also produces no such file (the generator's own sweep of a cleared order).
 */
function regenSanctioned(relPath, baseText, candidates, timelineMayGrow) {
  const canonical = canonicalRegenTree()
  if (!canonical.dir) return false
  const canonicalPath = join(canonical.dir, relPath)
  const canonicalText = existsSync(canonicalPath) ? readFileSync(canonicalPath, "utf8").replace(/\r\n/g, "\n") : null
  const isIndex = relPath === ".claude/workorders/INDEX.md"
  const kindOf = (text) => /^kind:\s*(.+?)\s*$/m.exec(/^---\n([\s\S]*?)\n---/.exec(text ?? "")?.[1] ?? "")?.[1] ?? null
  if (!isIndex && (kindOf(baseText) === "plan" || kindOf(canonicalText) === "plan")) return false
  const baseEntries = timelineEntriesOf(baseText ?? "")
  for (const text of candidates) {
    if (text === null && canonicalText === null) {
      // A DELETION can never carry the base ref's recorded history forward, so
      // sanctioning one used to launder exactly the destruction step 3 below
      // claims is impossible: the mandated regeneration deleted a cleared
      // residual order and this gate exited 0 on a diff that erased its
      // Timeline. The generator now RETIRES such an order instead
      // (tools/workorder.mjs retiredUnitFrom), so a deletion that drops
      // recorded history is a hand rewrite again, and it fails.
      if (baseEntries.length) return false
      continue
    }
    if (text === null || canonicalText === null || text !== canonicalText) return false
    if (isIndex) continue
    const entries = timelineEntriesOf(text)
    if (!baseEntries.every((entry, index) => entries[index] === entry)) return false
    if (!timelineMayGrow && entries.length !== baseEntries.length) return false
  }
  return true
}

/** The carve-out for a changed workorders file the bundle does not own - INDEX.md, or a sibling swept by regeneration. */
function regenSanctionedFile(relPath, baseSha) {
  const readNormalized = (raw) => (raw === null ? null : raw.replace(/\r\n/g, "\n"))
  const workingPath = join(REPO_ROOT, relPath)
  const workingText = existsSync(workingPath) ? readFileSync(workingPath, "utf8").replace(/\r\n/g, "\n") : null
  return regenSanctioned(
    relPath,
    readNormalized(gitShow(baseSha, relPath)),
    [workingText, readNormalized(gitShow("HEAD", relPath))],
    false,
  )
}

/**
 * A suppression count that fell for a file the diff never touched is the exact
 * shape of faking the mechanical floor: the scoreboard moved without the code
 * moving. Legitimately clearing debt always edits the source file too.
 *
 * A ledger that existed at base but is missing or unparseable in the working
 * tree is the same threat through a cruder door: one `rm` of a baseline wiped
 * every recorded web violation and read as a clean pass here, because the
 * ENOENT was swallowed. The scoreboard cannot vanish mid-run - deletion or
 * corruption is an explicit failure, never a skip.
 */
function fakedSuppressions(base, changed) {
  const problems = []
  const changedSet = new Set(changed)
  for (const file of SUPPRESSION_FILES) {
    const before = gitShow(base, file)
    if (before === null || !before.trim()) continue
    const workspace = `${file.split("/").slice(0, 2).join("/")}/`
    let previous
    try {
      previous = JSON.parse(before)
    } catch {
      problems.push(`${file}: the base ref's copy is not valid JSON, so suppression movement cannot be judged - failing closed`)
      continue
    }
    let current
    try {
      current = JSON.parse(readFileSync(join(REPO_ROOT, file), "utf8"))
    } catch {
      problems.push(
        `${file}: ledger deleted or unreadable - the scoreboard cannot vanish mid-run. Restore the committed ` +
          `baseline; debt is cleared by fixing the source, then \`npm run lint:prune\`.`,
      )
      continue
    }
    if (!changedSet.has(file)) continue
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
  // --files used to WIN silently: `owned` short-circuited to the explicit list,
  // so ownedFilesOf never ran for any --id and neither the "no work order at
  // base" check nor the append-only byte-prefix check was applied - while the
  // loop below still granted every named order's file. Adding a flag strictly
  // WEAKENED the gate: the identical tree exited 1 under --id and 0 with
  // `--files x` appended. They are alternatives, so they are refused together.
  if (ids.length && explicitFiles) {
    fail(
      "--id and --files are mutually exclusive. --files replaces the work-order trust root entirely (no " +
        "base-existence check, no append-only check), so combining them silently drops every verification " +
        "--id exists to perform. Pass --id for a work order, --files for a unit that has none.",
    )
  }

  const resolvedBase = resolveBase(base)
  const changed = changedFiles(resolvedBase.sha)

  // ORDER MATTERS: gate state is judged before any ownership check runs,
  // because the regeneration carve-out trusts the working tree's generator and
  // that trust holds only while tools/ and the hooks are untouched. A run that
  // moved gate state gets no sanction path at all - a tampered generator must
  // never certify its own output.
  const touchedGateState = changed.filter((file) => GATE_STATE.some((pattern) => pattern.test(file)))
  const regenAllowed = touchedGateState.length === 0

  const owned = new Set(explicitFiles ?? ids.flatMap((id) => ownedFilesOf(id, resolvedBase.sha, regenAllowed)))
  // A work order's own file is owned by the unit it describes: appending to the
  // Timeline is required by the definition of done, so it must not read as an
  // escape. What it may GRANT is pinned to the base ref's copy by ownedFilesOf,
  // and any non-append edit already failed there. INDEX.md is NOT included - it
  // is generated, and hand-editing it is editing the scoreboard; the one thing
  // that may change it is the generator itself, which the carve-out below
  // verifies byte for byte.
  for (const id of ids) owned.add(`.claude/workorders/${id}.md`)

  const structurallyPermitted = (file) =>
    SUPPRESSION_FILES.includes(file) || I18N_PAIR.includes(file) || isOwnedTestCompanion(file, owned)
  const escaped = changed.filter((file) => {
    if (owned.has(file) || touchedGateState.includes(file) || structurallyPermitted(file)) return false
    if (regenAllowed && /^\.claude\/workorders\/[^/]+\.md$/.test(file) && regenSanctionedFile(file, resolvedBase.sha)) return false
    return true
  })
  const faked = fakedSuppressions(resolvedBase.sha, changed)

  const label = explicitFiles ? `${owned.size} explicit file(s)` : ids.join(", ")
  process.stdout.write(
    `scope: ${label}\nbase: ${resolvedBase.sha} (${resolvedBase.how})\nchanged: ${changed.length} file(s), ${owned.size} owned\n\n`,
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
