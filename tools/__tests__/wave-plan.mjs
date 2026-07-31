import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, SELF, T, stage, orcaEnv, run, check } from "./_harness.mjs"

// ORB-1 <- ORB-2 <- ORB-3 is a three-link chain, so ORB-1's reach is 2 only if
// the count is transitive. ORB-4 is unblocked but at the strike limit: it lands
// in wave 1, is excluded from `launchable` by design, and must still surface in
// `twoStrikes` (PR #613 review, D9).
const ISSUES_WAVE_STUB = [
  { match: "linear list-issues", stdout: JSON.stringify({ ok: true, result: { issues: [{ identifier: "ORB-1" }, { identifier: "ORB-2" }, { identifier: "ORB-3" }, { identifier: "ORB-99" }] } }) },
  { match: "linear issue ORB-1", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-1", title: "requested first", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [] } }) },
  { match: "linear issue ORB-2", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-2", title: "requested second", state: { name: "Todo", type: "unstarted" }, labels: [{ name: "attempts:2" }] }, relations: [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-99" } }] } }) },
  { match: "linear issue ORB-3", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-3", title: "out-of-set dependent", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-1" } }] } }) },
  { match: "linear issue ORB-99", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-99", title: "external blocker", state: { name: "In Progress", type: "started" }, labels: [] }, relations: [] } }) },
]

const orchestrateFlagCases = () => {
  const skillPath = join(REPO_ROOT, ".claude", "skills", "orchestrate", "SKILL.md")
  const skill = readFileSync(skillPath, "utf8")
  const scopeSection = skill.slice(skill.indexOf("## 0."), skill.indexOf("## 0a."))
  T(
    "orchestrate flags: --single accepts project scope without changing it",
    /`--single` is valid with every resolved scope/.test(scopeSection)
      && /does not change which tickets belong to it/.test(scopeSection),
    scopeSection,
  )
  T(
    "orchestrate flags: --only on a project is a usage error naming both flags",
    /`--only` on a project name is also a usage error/.test(scopeSection)
      && /`--only` requires one `ORB-N` identifier and `--single` serialises a project run/.test(scopeSection),
    scopeSection,
  )
  T(
    "orchestrate flags: --only ORB-N preserves the former one-ticket boundary",
    /With `--only`, reconcile and launch THAT TICKET[\s\S]*ONLY/.test(scopeSection),
    scopeSection,
  )
  T(
    "orchestrate flags: --only rejects two or more identifiers",
    /`--only` with an explicit set is a usage error/.test(scopeSection),
    scopeSection,
  )
  T(
    "orchestrate flags: --single accepts an explicit set and runs it serially",
    /including an explicit set/.test(scopeSection)
      && /effective[\s\S]*`maxParallelWorktrees` to 1/.test(scopeSection)
      && /Wait for each ticket to reach a terminal state before launching the next/.test(scopeSection),
    scopeSection,
  )
  T(
    "orchestrate flags: --single passes cap 1 to the shared launcher enforcement",
    /--max-parallel-worktrees 1` when the run has `--single`/.test(skill),
    skill,
  )

  const recordedMainSinglePlan = {
    identifiers: ["ORB-1"],
    launchable: ["ORB-1"],
  }
  const onlyResult = run(
    "wave-plan.mjs",
    ["--issues", "ORB-1", "--json"],
    { env: orcaEnv(ISSUES_WAVE_STUB) },
  )
  let onlyPlan = null
  try {
    const parsed = JSON.parse(onlyResult.stdout)
    onlyPlan = {
      identifiers: parsed.waves.flatMap((wave) => wave.issues.map((issue) => issue.identifier)),
      launchable: parsed.launchable,
    }
  } catch {
    onlyPlan = null
  }
  T(
    "orchestrate flags: --only ORB-N resolves the recorded former --single plan",
    onlyResult.status === 0
      && JSON.stringify(onlyPlan) === JSON.stringify(recordedMainSinglePlan),
    `exit ${onlyResult.status}; expected ${JSON.stringify(recordedMainSinglePlan)}; got ${JSON.stringify(onlyPlan)}\n     ${onlyResult.stderr}`,
  )

  const tracked = spawnSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
  const textFiles = tracked.status === 0
    ? tracked.stdout
      .split("\0")
      .filter((path) => /\.(md|mjs|json|ya?ml|txt)$/i.test(path))
      .filter((path) => path.replaceAll("\\", "/") !== `tools/${SELF}`)
      .filter((path) => existsSync(join(REPO_ROOT, path)))
    : []
  const oneTicketSingle = [
    /\/orchestrate\s+ORB-(?:N|\d+)\s+--single/,
    /one ticket.{0,80}`--single`/i,
    /`--single`.{0,80}(?:one-ticket scope|THAT TICKET ONLY)/i,
  ]
  const staleUses = []
  for (const relativePath of textFiles) {
    const contents = readFileSync(join(REPO_ROOT, relativePath), "utf8")
    if (oneTicketSingle.some((pattern) => pattern.test(contents))) staleUses.push(relativePath)
  }
  T(
    "orchestrate flags: tracked-doc guard reads files and finds no one-ticket-only --single use",
    textFiles.length > 0 && staleUses.length === 0,
    `scanned ${textFiles.length} tracked text files; stale uses: ${staleUses.join(", ") || "none"}`,
  )
}

const WAVE_STUB = [
  {
    match: "linear list-issues",
    stdout: JSON.stringify({ ok: true, result: { issues: [{ identifier: "ORB-1" }, { identifier: "ORB-2" }, { identifier: "ORB-3" }, { identifier: "ORB-4" }] } }),
  },
  {
    match: "linear issue ORB-1",
    stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-1", title: "first", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [] } }),
  },
  {
    match: "linear issue ORB-2",
    stdout: JSON.stringify({
      ok: true,
      result: { issue: { identifier: "ORB-2", title: "second", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-1" } }] },
    }),
  },
  {
    match: "linear issue ORB-3",
    stdout: JSON.stringify({
      ok: true,
      result: { issue: { identifier: "ORB-3", title: "third", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-2" } }] },
    }),
  },
  {
    match: "linear issue ORB-4",
    stdout: JSON.stringify({
      ok: true,
      result: { issue: { identifier: "ORB-4", title: "fourth", state: { name: "Todo", type: "unstarted" }, labels: [{ name: "attempts:2" }] }, relations: [] },
    }),
  },
]

const delayedWaveStub = () => {
  const issues = Array.from({ length: 100 }, (_, index) => ({ identifier: `ORB-${index + 1}` }))
  return [
    { match: "linear list-issues", stdout: JSON.stringify({ ok: true, result: { issues } }) },
    ...issues.map(({ identifier }, index) => ({
      match: `linear issue ${identifier} --relations`,
      delayMs: 40,
      stdout: JSON.stringify({ ok: true, result: { issue: { identifier, title: `ticket ${index + 1}`, state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [] } }),
    })),
  ]
}

const relationFetchConcurrency = (timingLog) => {
  const events = readFileSync(timingLog, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
  let active = 0
  let peak = 0
  for (const event of events) {
    active += event.event === "start" ? 1 : -1
    peak = Math.max(peak, active)
  }
  return { events, peak, active }
}

export const cases = () => {
    orchestrateFlagCases()
    check("wave-plan.mjs", "documents the explicit issue selection mode", ["--help"], { status: 0, stdout: /--issues "ORB-a,\.\.\."/ })
    const body = (files) => `## Affected modules / files\n\n${files}\n`
    const stubDescriptions = (aDescription, bDescription, aLabels = [], bLabels = [], aRelations = [], bRelations = []) =>
      orcaEnv([
        { match: "linear list-issues", stdout: JSON.stringify({ ok: true, result: { issues: [{ identifier: "ORB-201" }, { identifier: "ORB-202" }] } }) },
        { match: "linear issue ORB-201", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-201", title: "first collision probe", description: aDescription, state: { name: "Todo", type: "unstarted" }, labels: aLabels }, relations: aRelations } }) },
        { match: "linear issue ORB-202", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-202", title: "second collision probe", description: bDescription, state: { name: "Todo", type: "unstarted" }, labels: bLabels }, relations: bRelations } }) },
      ])
    const stub = (aFiles, bFiles) => stubDescriptions(body(aFiles), body(bFiles))
    check("wave-plan.mjs", "two tickets naming a common path are reported as a collision pair", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: tools\/test-tools\.mjs/ }, { env: stub("`tools/test-tools.mjs`", "`tools/test-tools.mjs`") })
    check("wave-plan.mjs", "a backticked root file is reported as a collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: README\.md/ }, { env: stub("`README.md`", "`README.md`") })
    check("wave-plan.mjs", "a bare root file list item is reported as a collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: README\.md/ }, { env: stub("- README.md", "- README.md") })
    check("wave-plan.mjs", "checkbox root files remain collision candidates", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: CLAUDE\.md/ }, { env: stub("- [ ] CLAUDE.md\n`tools/a.mjs`", "- [x] CLAUDE.md\n`tools/b.mjs`") })
    check("wave-plan.mjs", "annotated root files remain collision candidates", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: README\.md/ }, { env: stub("- README.md: update badge link\n`tools/a.mjs`", "- README.md - revise registry\n`tools/b.mjs`") })
    check("wave-plan.mjs", "comma and word-separated bare root files remain collision candidates", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: README\.md/ }, { env: stub("README.md, CLAUDE.md and package.json\n`tools/a.mjs`", "README.md, CHANGELOG.md and eslint.config.mjs\n`tools/b.mjs`") })
    check("wave-plan.mjs", "the same relative path in different repositories is not a collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stubDescriptions(body("`CLAUDE.md`"), body("`CLAUDE.md`"), ["repo:ui"], ["repo:api"]) })
    check("wave-plan.mjs", "the same path in different waves is not a collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /WAVE 1[\s\S]*?collisions: none[\s\S]*?WAVE 2[\s\S]*?collisions: none/ }, { env: stubDescriptions(body("`tools/test-tools.mjs`"), body("`tools/test-tools.mjs`"), [], [], [], [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-201" } }]) })
    check("wave-plan.mjs", "two tickets naming disjoint paths report no collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stub("`tools/a.mjs`", "`tools/b.mjs`") })
    check("wave-plan.mjs", "dynamic route segments stay part of disjoint paths", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stub("`apps/web/app/r/[code]/page.tsx`", "`apps/web/app/(app)/social/challenges/[id]/page.tsx`") })
    check("wave-plan.mjs", "native paths collide even when each ticket also names a recognised tool path", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: apps\/mobile\/android\/app\/src\/main\/java\/com\/orbit\/MainActivity\.kt/ }, { env: stub("`tools/a.mjs`\n`apps/mobile/android/app/src/main/java/com/orbit/MainActivity.kt`", "`tools/b.mjs`\n`apps/mobile/android/app/src/main/java/com/orbit/MainActivity.kt`") })
    check("wave-plan.mjs", "ordinary dotted prose is not reported as a collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stub("e.g. `tools/a.mjs` with Node.js v20.5", "e.g. `tools/b.mjs` with Node.js v20.5") })
    check("wave-plan.mjs", "a shared URL is not reported as a file collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stub("See https://github.com/org/repo/blob/main/docs/collisions.md and `tools/a.mjs`", "See https://github.com/org/repo/blob/main/docs/collisions.md and `tools/b.mjs`") })
    check("wave-plan.mjs", "a shared bare-domain URL is not reported as a file collision", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stub("See github.com/org/repo/blob/main/docs/collisions.md and `tools/a.mjs`", "See github.com/org/repo/blob/main/docs/collisions.md and `tools/b.mjs`") })
    const fencedDescription = ["## Technical details", "```sh", "# Files affected: `scripts/deploy.sh`", "```", "## Affected modules / files", "`tools/test-tools.mjs`"].join("\n")
    check("wave-plan.mjs", "a heading-shaped line inside a fence cannot shadow the affected section", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /ORB-201 \+ ORB-202: tools\/test-tools\.mjs/ }, { env: stubDescriptions(fencedDescription, body("`tools/test-tools.mjs`")) })
    const fencedAffected = (file) => body(`\`${file}\`\n\`\`\`sh\nscripts/shared-example.sh\n\`\`\``)
    check("wave-plan.mjs", "fenced examples inside the affected section are not collision candidates", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stubDescriptions(fencedAffected("tools/a.mjs"), fencedAffected("tools/b.mjs")) })
    const boundedBody = (file) => `${body(file)}\n## Test scenarios\n\n\`tools/shared-after-section.mjs\`\n`
    check("wave-plan.mjs", "a later section cannot leak a shared path into collisions", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /collisions: none/ }, { env: stubDescriptions(boundedBody("`tools/a.mjs`"), boundedBody("`tools/b.mjs`")) })
    check("wave-plan.mjs", "a ticket with no affected section is reported as unknown", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /unknown \(no parseable path in Affected modules \/ files\): ORB-201/ }, { env: stubDescriptions("## Summary\n\nno affected section here\n", body("`tools/b.mjs`")) })
    check("wave-plan.mjs", "a ticket with no parseable affected path is reported as unknown", ["--issues", "ORB-201,ORB-202"], { status: 0, stdout: /unknown \(no parseable path/ }, { env: stub("nothing recognisable here", "`tools/b.mjs`") })
    check("wave-plan.mjs", "the json output carries the same collision pair", ["--issues", "ORB-201,ORB-202", "--json"], { status: 0, stdout: /"files": \[\s*"tools\/test-tools\.mjs"/ }, { env: stub("`tools/test-tools.mjs`", "`tools/test-tools.mjs`") })
    check("wave-plan.mjs", "the json output carries unknown affected identifiers", ["--issues", "ORB-201,ORB-202", "--json"], { status: 0, stdout: /"unknownAffected": \[\s*"ORB-201"/ }, { env: stub("nothing recognisable here", "`tools/b.mjs`") })

    check("wave-plan.mjs", "plans one explicitly requested identifier and counts out-of-set dependents in reach", ["--issues", "ORB-1", "--json"], { status: 0, stdout: /"identifier": "ORB-1"[\s\S]*?"reach": 1[\s\S]*?"launchable": true/ }, { env: orcaEnv(ISSUES_WAVE_STUB) })
    const duplicateLog = stage("wave-plan-duplicate.log", "")
    const duplicate = run("wave-plan.mjs", ["--issues", "ORB-1,ORB-1", "--json"], { env: { ...orcaEnv(ISSUES_WAVE_STUB), ORBIT_ORCA_LOG: duplicateLog } })
    const duplicateFetches = readFileSync(duplicateLog, "utf8").split("\n").filter(Boolean).map(JSON.parse).filter((argv) => argv[0].split(/[\\/]/).pop() === "linear" && argv[1] === "issue" && argv[2] === "ORB-1")
    T("wave-plan.mjs: deduplicates explicitly requested identifiers before fetching", duplicate.status === 0 && duplicateFetches.length === 1, duplicate.stderr || duplicate.stdout)
    check("wave-plan.mjs", "renders both members of an explicit two-ticket selection", ["--issues", "ORB-1,ORB-2", "--json"], { status: 0, stdout: /"identifier": "ORB-1"[\s\S]*?"identifier": "ORB-2"/ }, { env: orcaEnv(ISSUES_WAVE_STUB) })
    check("wave-plan.mjs", "refuses explicit issues combined with another mode", ["--issues", "ORB-1", "--project", "Redesign"], { status: 2, stderr: /cannot be combined/ })
    check("wave-plan.mjs", "refuses explicit issues combined with a label", ["--issues", "ORB-1", "--label", "bug"], { status: 2, stderr: /cannot be combined/ })
    check("wave-plan.mjs", "refuses explicit issues combined with all", ["--issues", "ORB-1", "--all"], { status: 2, stderr: /cannot be combined/ })
    check("wave-plan.mjs", "requires a value for explicit issues", ["--issues"], { status: 2, stderr: /requires at least one identifier/ })
    check("wave-plan.mjs", "names an unresolved requested identifier", ["--issues", "ORB-404"], { status: 1, stderr: /unresolved requested identifier\(s\): ORB-404/ }, { env: orcaEnv([{ match: "linear issue ORB-404", stdout: JSON.stringify({ ok: false, error: { message: "not found" } }) }]) })
    check("wave-plan.mjs", "refuses a requested Done identifier", ["--issues", "ORB-3"], { status: 1, stderr: /Done requested identifier\(s\): ORB-3/ }, { env: orcaEnv([{ match: "linear issue ORB-3", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-3", title: "done", state: { name: "Done", type: "completed" }, labels: [] }, relations: [] } }) }]) })
    check("wave-plan.mjs", "uses an out-of-set team blocker while displaying only requested issues", ["--issues", "ORB-2", "--json"], { status: 0, stdout: /"blockedBy": \[\s*"ORB-99"\s*\][\s\S]*?"blockerState": "blocked by ORB-99"[\s\S]*?"launchable": false[\s\S]*?"twoStrikes": \[\s*"ORB-2"\s*\]/ }, { env: orcaEnv(ISSUES_WAVE_STUB) })
    check("wave-plan.mjs", "restricts text output to requested identifiers with their blocker state", ["--issues", "ORB-2"], { status: 0, stdout: /ORB-2[\s\S]*?blockerState: blocked by ORB-99[\s\S]*?launchable: no/, stderr: /^$/ }, { env: orcaEnv(ISSUES_WAVE_STUB) })
    check("wave-plan.mjs", "orders a blockedBy pair into two waves", ["--project", "Redesign", "--json"], { status: 0, stdout: /"wave": 2[\s\S]*ORB-2/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "wave 1 is the unblocked ticket", ["--project", "Redesign", "--json"], { status: 0, stdout: /"launchable": \[\s*"ORB-1"\s*\]/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "reach counts the whole downstream chain, not just direct blockers", ["--project", "Redesign", "--json"], { status: 0, stdout: /"identifier": "ORB-1"[\s\S]*?"reach": 2/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "a wave-1 ticket at the strike limit is reported, not dropped", ["--project", "Redesign", "--json"], { status: 0, stdout: /"twoStrikes": \[\s*"ORB-4"\s*\]/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "text mode marks the same strike-limit ticket", ["--project", "Redesign"], { status: 0, stdout: /ORB-4[\s\S]*?TWO STRIKES/ }, { env: orcaEnv(WAVE_STUB) })
    check("wave-plan.mjs", "an empty project is nothing to plan", ["--project", "Empty"], { status: 1, stderr: /nothing to plan/ }, { env: orcaEnv([{ match: "linear list-issues", stdout: JSON.stringify({ ok: true, result: { issues: [] } }) }]) })
    const timingLog = stage("wave-plan-timing.log", "")
    const delayed = run("wave-plan.mjs", ["--all"], {
      env: { ...orcaEnv(delayedWaveStub()), ORBIT_ORCA_TIMING_LOG: timingLog },
    })
    const concurrency = relationFetchConcurrency(timingLog)
    T(
      "wave-plan.mjs: fetches 100 relations in a bounded pool while preserving the table order",
      delayed.status === 0
        && concurrency.events.filter((event) => event.event === "start").length === 100
        && concurrency.peak > 1
        && concurrency.peak <= 8
        && concurrency.active === 0
        && /ORB-1[\s\S]*ORB-100/.test(delayed.stdout),
      `exit ${delayed.status}, relation events ${concurrency.events.length}, peak concurrency ${concurrency.peak}, active at exit ${concurrency.active}\n     ${delayed.stderr}`,
    )
    check(
      "wave-plan.mjs",
      "names a failing relation fetch without an execFile stack trace",
      ["--project", "Redesign"],
      { status: 2, stderr: /failed to fetch ORB-2: unavailable/ },
      { env: orcaEnv([{ ...WAVE_STUB[0] }, WAVE_STUB[1], { match: "linear issue ORB-2", stdout: JSON.stringify({ ok: false, error: { message: "unavailable" } }) }, WAVE_STUB[3], WAVE_STUB[4]]) },
    )
    check(
      "wave-plan.mjs",
      "keeps planning when one external blocker cannot be fetched",
      ["--project", "External"],
      { status: 0, stdout: /ORB-1[\s\S]*blockedBy: ORB-99/, stderr: /WARNING: blocker ORB-99 could not be fetched[\s\S]*treating it as blocking/ },
      {
        env: orcaEnv([
          { match: "linear list-issues", stdout: JSON.stringify({ ok: true, result: { issues: [{ identifier: "ORB-1" }] } }) },
          { match: "linear issue ORB-1", stdout: JSON.stringify({ ok: true, result: { issue: { identifier: "ORB-1", title: "dependent", state: { name: "Todo", type: "unstarted" }, labels: [] }, relations: [{ relationship: "blockedBy", relatedIssue: { identifier: "ORB-99" } }] } }) },
          { match: "linear issue ORB-99", stdout: JSON.stringify({ ok: false, error: { message: "unavailable" } }) },
        ]),
      },
    )
  }
