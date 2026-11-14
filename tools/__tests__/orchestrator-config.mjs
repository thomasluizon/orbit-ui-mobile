import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { runInNewContext } from "node:vm"

import { AUTO_COMPACT_TOKENS } from "../lib/session-context.mjs"
import { T, root, realOrchestratorConfig, run, stage, stageRepo, toolPath } from "./_harness.mjs"

const NAME = "orchestrator-config.mjs"
/** The shipped claude model for each worker tier, in escalation order. */
const WORKER_TIER_MODELS = [
  ["default", "claude-sonnet-5-5"],
  ["mechanical", "claude-sonnet-5-5"],
  ["deep", "claude-opus-5-5"],
  ["max", "claude-opus-5-5"],
]

/** The message a caller would actually read, or null when the call returned. */
const thrown = (call) => {
  try {
    call()
    return null
  } catch (error) {
    return error.message
  }
}

const configUrl = (label, body) => pathToFileURL(stage(join("orchestrator-config", label, "orchestrator.json"), body))

/**
 * A repository whose .claude/orchestrator.json is committed twice, so the staleness guard has a
 * real `git show origin/<base>:<path>` to compare against. `head` selects which commit the
 * checkout sits on and `origin` which one the remote ref names, which is the only pair of knobs
 * the guard branches on.
 */
const stageConfigRepo = (label, { head, origin, working }) => {
  const path = join(root, "orchestrator-config-repo", label)
  mkdirSync(join(path, ".claude"), { recursive: true })
  const git = (args) => spawnSync("git", ["-C", path, ...args], { encoding: "utf8" })
  const configPath = join(path, ".claude", "orchestrator.json")
  const commits = {}
  for (const args of [["init", "-q", "--initial-branch=main"], ["config", "user.email", "gate@orbit.test"], ["config", "user.name", "Orbit Gate"]]) {
    if (git(args).status !== 0) return null
  }
  for (const revision of ["base", "newer"]) {
    writeFileSync(configPath, `{"revision":"${revision}"}\n`)
    if (git(["add", ".claude/orchestrator.json"]).status !== 0 || git(["commit", "-q", "-m", revision]).status !== 0) return null
    commits[revision] = git(["rev-parse", "HEAD"]).stdout.trim()
  }
  if (git(["update-ref", "refs/remotes/origin/main", commits[origin]]).status !== 0) return null
  if (git(["reset", "-q", "--hard", commits[head]]).status !== 0) return null
  writeFileSync(configPath, working)
  return { path, configPath }
}

export const cases = async () => {
  const { readOrchestratorConfig, resolveWorkerInvocation, workerAccounts } = await import(pathToFileURL(toolPath("lib/orchestrator-config.mjs")).href)

  for (const [name, endMarker] of [["audit", "const VERIFY_CAP"], ["prod-readiness", "const OPS_SCHEMA"]]) {
    const source = readFileSync(new URL(`../../.claude/workflows/${name}.mjs`, import.meta.url), "utf8")
    const start = source.indexOf("const parsedArgs =")
    const end = source.indexOf(endMarker, start)
    const guard = start >= 0 && end > start ? source.slice(start, end) : ""
    T(`${NAME}: ${name} workflow uses no Node or dynamic imports`,
      guard.length > 0 && !source.includes("import(") && !source.includes("process."))
    for (const roots of [undefined, { ui: ".", api: "../orbit-api" }]) {
      const message = thrown(() => runInNewContext(`${guard}\n;({ UI, API })`, { args: { roots } }))
      T(`${NAME}: ${name} workflow rejects ${roots ? "relative" : "missing"} roots`,
        /requires absolute ui and api roots/.test(message ?? ""), message ?? "workflow accepted invalid roots")
    }
    const absolute = runInNewContext(`${guard}\n;({ UI, API })`, { args: { roots: { ui: "/checkout/ui", api: "/checkout/api" } } })
    T(`${NAME}: ${name} workflow accepts absolute roots`,
      absolute.UI === "/checkout/ui" && absolute.API === "/checkout/api")
  }

  const readinessSource = readFileSync(new URL("../../.claude/workflows/prod-readiness.mjs", import.meta.url), "utf8").replace(/^export const meta = [\s\S]*?\n}\n/, "")
  // A finder that the case does not script reads every candidate row of its repository.
  const judgedCountOf = (hygiene, label) =>
    Object.values(hygiene?.repositories?.[label.slice("hygiene:".length)]?.counts ?? {}).reduce((total, count) => total + count.judged, 0)
  const finderAnswer = (hygiene, label, answer) =>
    answer && label.startsWith("hygiene:") && answer.rowsRead === undefined ? { ...answer, rowsRead: judgedCountOf(hygiene, label) } : answer
  const runReadiness = async ({ hygiene, refute = true, verdict = { refuted: refute, note: "checked" }, scope = "both", finderFindings = {}, finderResults = {}, throwing = () => false }) => {
    const prompts = {}
    const labels = []
    const scripted = (label) => {
      if (finderResults[label]) return finderResults[label]
      if (finderFindings[label]) return { findings: finderFindings[label], deferred: [] }
      if (label === "hygiene:ui") {
        return {
          findings: [{ severity: "Blocker", check: "hygiene-old", title: "Old file", location: "orbit-ui-mobile x.md", risk: "an agent reads it", evidence: "row and search", fix: "delete x.md" }],
          deferred: [{ check: "hygiene-deployed-readers", path: "apps/web/public/a.png", reason: "a public URL can serve it" }],
        }
      }
      if (label === "hygiene:workshop") {
        return {
          findings: [{ severity: "Medium", check: "hygiene-temporary", title: "Draft file", location: "thomas-brain drafts/z.md", risk: "a script reads it", evidence: "temporaryPattern segment:drafts; searched drafts/z.md: no reader", fix: "delete drafts/z.md" }],
          deferred: [],
        }
      }
      if (label === "ops:staging") {
        return { findings: [{ severity: "High", check: "staging", title: "No gate", location: "orbit-api .github/workflows/release.yml:1", risk: "an unadmitted commit ships", evidence: "release.yml:1 has no admission step", fix: "add the admission step" }] }
      }
      if (label === "hygiene:api") return null
      if (label.startsWith("verify:")) return verdict
      return { findings: [], deferred: [] }
    }
    const context = {
      args: { roots: { ui: "/checkout/ui", api: "/checkout/api" }, scope, hygiene },
      phase() {},
      log() {},
      // The workflow runtime resolves a thunk that throws to null, and parallel itself never rejects.
      parallel: (calls) => Promise.all(calls.map((call) => Promise.resolve().then(call).catch(() => null))),
      workflow: async (_, input) => ({ kind: input.kind, findings: [], counts: {}, coverage: [], deferred: [], converged: true }),
      agent: async (prompt, options) => {
        prompts[options.label] = prompt
        labels.push(options.label)
        if (throwing(options.label)) throw new Error(`${options.label} failed`)
        return finderAnswer(hygiene, options.label, scripted(options.label))
      },
    }
    const result = await runInNewContext(`(async () => {\n${readinessSource}\n})()`, context)
    return { result, prompts, labels }
  }
  // The kinds and the file folder of this fixture copy what tools/file-ledger.mjs --candidates prints; the handoff case below runs the tool itself.
  const candidatesFileOf = (name) => `/checkout/ui/.claude/sweeps/hygiene/${name}.jsonl`
  const hygieneEntry = (root, name, judged = {}, deferred = {}) => ({
    root,
    candidatesFile: candidatesFileOf(name),
    counts: Object.fromEntries(["outdated", "temporary", "duplicate", "old"].map((kind) => [kind, { judged: judged[kind] ?? 0, deferred: deferred[kind] ?? 0 }])),
  })
  const hygieneArgument = { repositories: {
    ui: hygieneEntry("/checkout/ui", "orbit-ui-mobile", { old: 1 }),
    api: hygieneEntry("/checkout/api", "orbit-api", { outdated: 1 }),
    landing: { root: null, reason: "scope" },
    workshop: hygieneEntry("/checkout/workshop", "thomas-brain", { temporary: 1 }),
    vault: { root: null },
  } }
  const refuted = await runReadiness({ hygiene: hygieneArgument })
  T(`${NAME}: the hygiene phase runs one finder for each repository that has a root`,
    JSON.stringify(refuted.result.hygieneChecksRun) === JSON.stringify(["ui", "workshop"]) && JSON.stringify(refuted.result.hygieneChecksFailed) === JSON.stringify(["api"]),
    JSON.stringify([refuted.result.hygieneChecksRun, refuted.result.hygieneChecksFailed]))
  T(`${NAME}: a delete finding that the skeptic refutes is dropped`, refuted.result.hygieneFindings.length === 0, JSON.stringify(refuted.result.hygieneFindings))
  const deferredChecks = refuted.result.hygieneDeferred.map((item) => item.check)
  T(`${NAME}: a missing root, a scope exclusion and a deployed reader land in the deferred ledger`,
    deferredChecks.includes("hygiene-landing") && deferredChecks.includes("hygiene-vault") && deferredChecks.includes("hygiene-deployed-readers") &&
      refuted.result.hygieneDeferred.find((item) => item.check === "hygiene-landing")?.reason === "scope", JSON.stringify(refuted.result.hygieneDeferred))
  T(`${NAME}: the finder prompt carries the ledger rule and the four kinds`,
    /Every tracked file starts as a suspect/.test(refuted.prompts["hygiene:ui"]) && ["hygiene-old", "hygiene-outdated", "hygiene-duplicate", "hygiene-temporary"].every((kind) => refuted.prompts["hygiene:ui"].includes(kind)))
  const kept = await runReadiness({ hygiene: hygieneArgument, refute: false })
  const keptOld = kept.result.hygieneFindings.find((finding) => finding.check === "hygiene-old")
  T(`${NAME}: a surviving hygiene finding is never a Blocker`, kept.result.hygieneFindings.length === 2 && keptOld?.severity === "High", JSON.stringify(kept.result.hygieneFindings))
  T(`${NAME}: a surviving hygiene finding carries the root of its repository`,
    keptOld?.root === "/checkout/ui" && kept.result.hygieneFindings.find((finding) => finding.check === "hygiene-temporary")?.root === "/checkout/workshop", JSON.stringify(kept.result.hygieneFindings))
  const skepticPrompt = refuted.prompts["verify:hygiene-temporary"] ?? ""
  T(`${NAME}: the skeptic prompt of a hygiene finding outside orbit-ui-mobile names the root of its repository`,
    skepticPrompt.includes("rooted at /checkout/workshop") && !skepticPrompt.includes("/checkout/ui"), skepticPrompt)
  T(`${NAME}: the skeptic prompt of a hygiene finding carries its evidence and its fix`,
    skepticPrompt.includes("searched drafts/z.md: no reader") && skepticPrompt.includes("fix=delete drafts/z.md"), skepticPrompt)
  for (const label of ["verify:hygiene-temporary", "verify:staging"]) {
    T(`${NAME}: the ${label} prompt says a file the skeptic cannot open is deferred, never refuted`,
      /cannot open the cited file[^\n]*deferred=true and refuted=false/.test(refuted.prompts[label] ?? ""), refuted.prompts[label])
  }
  const opsPrompt = refuted.prompts["verify:staging"] ?? ""
  T(`${NAME}: the skeptic prompt of an ops finding names both repository roots, the evidence and the fix`,
    opsPrompt.includes("/checkout/ui") && opsPrompt.includes("/checkout/api") && opsPrompt.includes("release.yml:1 has no admission step") && opsPrompt.includes("fix=add the admission step"), opsPrompt)
  T(`${NAME}: the observability finder is told the workflow defers the console-only alert routing, and opsDeferred carries it`,
    /deferred check alert-routing/.test(refuted.prompts["ops:observability"] ?? "") && !/no alert sink is a finding/.test(refuted.prompts["ops:observability"] ?? "") &&
      refuted.result.opsDeferred.some((item) => item.check === "alert-routing"), refuted.prompts["ops:observability"])
  const unopened = await runReadiness({ hygiene: hygieneArgument, verdict: { refuted: true, deferred: true, note: "could not open /checkout/workshop/drafts/z.md" } })
  T(`${NAME}: a hygiene finding whose skeptic cannot open the file is deferred, never refuted`,
    unopened.result.hygieneFindings.length === 0 &&
      unopened.result.hygieneDeferred.some((item) => item.check === "hygiene-temporary" && item.path === "thomas-brain drafts/z.md" && item.reason.includes("/checkout/workshop")),
    JSON.stringify(unopened.result.hygieneDeferred))
  T(`${NAME}: an ops finding whose skeptic cannot open the file is kept as unverified`,
    unopened.result.opsFindings.length === 1 && /could not open the cited file/.test(unopened.result.opsFindings[0].unverified ?? ""), JSON.stringify(unopened.result.opsFindings))
  const deleteFindings = Array.from({ length: 70 }, (_, index) => ({ severity: "Medium", check: "hygiene-old", title: `Old file ${index}`, location: `orbit-ui-mobile old-${index}.md`, risk: "an agent reads it", evidence: "row and search", fix: `delete old-${index}.md` }))
  const overflow = await runReadiness({ hygiene: hygieneArgument, refute: false, finderFindings: { "hygiene:ui": deleteFindings } })
  const overflowSkeptics = overflow.labels.filter((label) => label.startsWith("verify:"))
  const capDeferred = overflow.result.hygieneDeferred.filter((item) => /adversarial-verify cap of 60/.test(item.reason))
  T(`${NAME}: the Verify phase starts at most 60 skeptics when 72 findings qualify`, overflowSkeptics.length === 60, `${overflowSkeptics.length} skeptics`)
  T(`${NAME}: an ops finding takes a skeptic slot before hygiene findings of a lower or equal severity`,
    overflowSkeptics.includes("verify:staging") && overflow.result.opsFindings.length === 1 && overflow.result.opsFindings[0].unverified === undefined, JSON.stringify(overflow.result.opsFindings))
  T(`${NAME}: hygiene delete findings beyond the cap go to hygieneDeferred with the reason and never into hygieneFindings`,
    overflow.result.hygieneFindings.length === 59 && capDeferred.length === 12 &&
      capDeferred.some((item) => item.path === "thomas-brain drafts/z.md") &&
      capDeferred.every((item) => !overflow.result.hygieneFindings.some((finding) => finding.location === item.path)),
    `${overflow.result.hygieneFindings.length} findings, ${capDeferred.length} deferred by the cap`)
  const opsFlood = Array.from({ length: 61 }, (_, index) => ({ severity: "High", check: "staging", title: `Gap ${index}`, location: `orbit-api release.yml:${index + 1}`, risk: "an unadmitted commit ships", evidence: `release.yml:${index + 1}`, fix: "add the admission step" }))
  const opsOverflow = await runReadiness({ hygiene: hygieneArgument, refute: false, finderFindings: { "ops:staging": opsFlood } })
  const unchallengedOps = opsOverflow.result.opsFindings.filter((finding) => /adversarial-verify cap of 60/.test(finding.unverified ?? ""))
  T(`${NAME}: an ops finding beyond the cap is kept with unverified, and no hygiene finding takes a skeptic slot first`,
    opsOverflow.labels.filter((label) => label.startsWith("verify:")).length === 60 && opsOverflow.result.opsFindings.length === 61 && unchallengedOps.length === 1 &&
      opsOverflow.result.hygieneDeferred.filter((item) => /adversarial-verify cap of 60/.test(item.reason)).length === 2,
    `${opsOverflow.result.opsFindings.length} ops findings, ${unchallengedOps.length} unchallenged`)
  for (const [label, options] of [["dies", { verdict: null }], ["throws", { throwing: (name) => name.startsWith("verify:") }]]) {
    const unjudged = await runReadiness({ hygiene: hygieneArgument, ...options })
    const deferredBySkeptic = unjudged.result.hygieneDeferred.filter((item) => /the skeptic died or failed/.test(item.reason)).map((item) => item.path)
    T(`${NAME}: a hygiene finding whose skeptic ${label} is deferred, never filed unchecked`,
      unjudged.result.hygieneFindings.length === 0 && JSON.stringify(deferredBySkeptic.sort()) === JSON.stringify(["orbit-ui-mobile x.md", "thomas-brain drafts/z.md"]),
      JSON.stringify([unjudged.result.hygieneFindings, unjudged.result.hygieneDeferred]))
    T(`${NAME}: an ops finding whose skeptic ${label} is kept with unverified`,
      unjudged.result.opsFindings.length === 1 && /skeptic died or failed/.test(unjudged.result.opsFindings[0].unverified ?? ""), JSON.stringify(unjudged.result.opsFindings))
  }
  const updateFinding = { severity: "Medium", check: "hygiene-outdated", title: "Stale path", location: "orbit-ui-mobile docs/a.md", risk: "an agent follows it", evidence: "unresolvedReferences docs/gone.md", fix: "update docs/a.md to name docs/new.md" }
  const updateOnly = await runReadiness({ hygiene: hygieneArgument, finderFindings: { "hygiene:ui": [updateFinding] } })
  T(`${NAME}: a Medium update hygiene finding needs no skeptic and is kept`,
    updateOnly.result.hygieneFindings.some((finding) => finding.location === "orbit-ui-mobile docs/a.md") && !updateOnly.labels.includes("verify:hygiene-outdated"),
    JSON.stringify(updateOnly.result.hygieneFindings))
  const verifyPhaseDetail = /title: 'Verify', detail: '([^']*)'/.exec(readFileSync(new URL("../../.claude/workflows/prod-readiness.mjs", import.meta.url), "utf8"))?.[1] ?? ""
  T(`${NAME}: the Verify phase detail names the hygiene findings and the cap`, /hygiene/.test(verifyPhaseDetail) && /60/.test(verifyPhaseDetail), verifyPhaseDetail)
  const absent = await runReadiness({})
  T(`${NAME}: a run with no hygiene argument defers all five repositories and never reads as clean`,
    absent.result.hygieneDeferred.length === 5 && absent.result.hygieneChecksRun.length === 0 && absent.result.hygieneChecksFailed.length === 0, JSON.stringify(absent.result.hygieneDeferred))
  const unreadableRefusal = (path) => ({ check: "hygiene-unreadable", path, reason: "Read was refused outside the working directories" })
  const unreadable = await runReadiness({
    hygiene: { repositories: {
      ui: hygieneEntry("/checkout/ui", "orbit-ui-mobile", { old: 2 }),
      api: hygieneEntry("/checkout/api", "orbit-api", { outdated: 1 }),
      landing: hygieneEntry("/checkout/landing", "orbit-landing-page", { old: 1 }),
      workshop: hygieneEntry("/checkout/workshop", "thomas-brain", { outdated: 1 }),
    } },
    finderResults: {
      "hygiene:ui": { findings: [], deferred: [unreadableRefusal("w.md")] },
      "hygiene:api": { findings: [], deferred: [] },
      "hygiene:landing": { findings: [], deferred: [unreadableRefusal("/checkout/landing/l.md")] },
      "hygiene:workshop": {
        findings: [{ severity: "Medium", check: "hygiene-outdated", title: "Stale note", location: "thomas-brain notes/a.md", risk: "an agent reads it", evidence: "no file was read", fix: "update notes/a.md" }],
        deferred: [unreadableRefusal("/checkout/workshop/")],
      },
    },
  })
  T(`${NAME}: a finder that cannot open its root or any candidate is not run, so its repository never reads as swept`,
    JSON.stringify(unreadable.result.hygieneChecksRun) === JSON.stringify(["ui", "api"]) && JSON.stringify(unreadable.result.hygieneChecksFailed) === JSON.stringify(["landing", "workshop"]),
    JSON.stringify([unreadable.result.hygieneChecksRun, unreadable.result.hygieneChecksFailed]))
  T(`${NAME}: a finder that read nothing adds no finding, and each unreadable path stays in the deferred ledger`,
    unreadable.result.hygieneFindings.length === 0 &&
      ["w.md", "/checkout/landing/l.md", "/checkout/workshop/"].every((path) => unreadable.result.hygieneDeferred.some((item) => item.check === "hygiene-unreadable" && item.path === path)),
    JSON.stringify([unreadable.result.hygieneFindings, unreadable.result.hygieneDeferred]))
  T(`${NAME}: the finder prompt says an unopened root or candidate is a hygiene-unreadable entry, never an empty result`,
    /cannot open the root[^\n]*"hygiene-unreadable"[^\n]*the path \/checkout\/workshop [^\n]*Never return an empty result/.test(unreadable.prompts["hygiene:workshop"] ?? ""), unreadable.prompts["hygiene:workshop"])
  const mixed = await runReadiness({ hygiene: { repositories: { ui: hygieneEntry("/checkout/ui", "orbit-ui-mobile", { outdated: 29, temporary: 5, duplicate: 10, old: 256 }, { old: 144 }) } } })
  T(`${NAME}: hygieneCandidates is the counts that the ledger tool printed`,
    JSON.stringify(mixed.result.hygieneCandidates?.ui) === JSON.stringify({ outdated: { judged: 29, deferred: 0 }, temporary: { judged: 5, deferred: 0 }, duplicate: { judged: 10, deferred: 0 }, old: { judged: 256, deferred: 144 } }),
    JSON.stringify(mixed.result.hygieneCandidates))
  T(`${NAME}: the deferred entry names each kind that went unjudged`,
    mixed.result.hygieneDeferred.some((item) => item.check === "hygiene-ui" && /old 144 of 400/.test(item.reason) && !/outdated|duplicate|temporary/.test(item.reason)), JSON.stringify(mixed.result.hygieneDeferred))
  const mixedPrompt = mixed.prompts["hygiene:ui"] ?? ""
  T(`${NAME}: the finder reads the 300 judged rows from the candidates file in parts and returns rowsRead`,
    mixedPrompt.includes(`the 300 lines of ${candidatesFileOf("orbit-ui-mobile")}`) && /at most 100 lines in one call with offset and limit/.test(mixedPrompt) && /Return rowsRead/.test(mixedPrompt) && !mixedPrompt.includes('{"path"'), mixedPrompt)
  T(`${NAME}: the finder prompt takes the kinds and their order from the counts`,
    mixedPrompt.includes("in the order outdated, temporary, duplicate, old") && mixedPrompt.includes('"hygiene-outdated", "hygiene-temporary", "hygiene-duplicate", "hygiene-old"'), mixedPrompt)
  const oldFinding = { severity: "Medium", check: "hygiene-old", title: "Old file", location: "orbit-ui-mobile x.md", risk: "an agent reads it", evidence: "row and search", fix: "update x.md" }
  const unopenedFile = await runReadiness({
    hygiene: { repositories: { ui: hygieneEntry("/checkout/ui", "orbit-ui-mobile", { old: 2 }) } },
    finderResults: { "hygiene:ui": { findings: [oldFinding], deferred: [unreadableRefusal(candidatesFileOf("orbit-ui-mobile"))], rowsRead: 0 } },
  })
  T(`${NAME}: a finder that cannot open the candidates file adds no finding and lands in hygieneChecksFailed`,
    JSON.stringify(unopenedFile.result.hygieneChecksFailed) === JSON.stringify(["ui"]) && unopenedFile.result.hygieneChecksRun.length === 0 && unopenedFile.result.hygieneFindings.length === 0 &&
      unopenedFile.result.hygieneDeferred.some((item) => item.check === "hygiene-unreadable" && item.path === candidatesFileOf("orbit-ui-mobile")),
    JSON.stringify(unopenedFile.result))
  const unread = await runReadiness({ hygiene: { repositories: { ui: hygieneEntry("/checkout/ui", "orbit-ui-mobile", { old: 2 }) } }, finderResults: { "hygiene:ui": { findings: [oldFinding], deferred: [] } } })
  const noRowsRead = await runReadiness({ hygiene: { repositories: { ui: hygieneEntry("/checkout/ui", "orbit-ui-mobile", { old: 2 }) } }, finderResults: { "hygiene:ui": { findings: [oldFinding], deferred: [], rowsRead: 0 } } })
  T(`${NAME}: a finder that read no row of its candidates file has not run`,
    unread.result.hygieneChecksFailed.length === 0 && JSON.stringify(noRowsRead.result.hygieneChecksFailed) === JSON.stringify(["ui"]) && noRowsRead.result.hygieneFindings.length === 0,
    JSON.stringify([unread.result.hygieneChecksFailed, noRowsRead.result.hygieneChecksFailed]))
  const partial = await runReadiness({ hygiene: { repositories: { ui: hygieneEntry("/checkout/ui", "orbit-ui-mobile", { outdated: 100, old: 200 }) } }, finderResults: { "hygiene:ui": { findings: [oldFinding], deferred: [], rowsRead: 120 } } })
  T(`${NAME}: a finder that read part of its candidates file runs, and the rows it did not read are deferred`,
    JSON.stringify(partial.result.hygieneChecksRun) === JSON.stringify(["ui"]) && partial.result.hygieneFindings.length === 1 &&
      partial.result.hygieneDeferred.some((item) => item.check === "hygiene-unreadable" && /read 120 of the 300 candidate rows/.test(item.reason)),
    JSON.stringify(partial.result.hygieneDeferred))
  const noCandidate = await runReadiness({ hygiene: { repositories: { ui: hygieneEntry("/checkout/ui", "orbit-ui-mobile") } } })
  T(`${NAME}: a repository with no candidate starts no finder and counts as swept`,
    !noCandidate.labels.includes("hygiene:ui") && JSON.stringify(noCandidate.result.hygieneChecksRun) === JSON.stringify(["ui"]) && noCandidate.result.hygieneChecksFailed.length === 0 &&
      noCandidate.result.hygieneFindings.length === 0 && !noCandidate.result.hygieneDeferred.some((item) => item.check === "hygiene-unreadable" || item.check === "hygiene-ui"),
    JSON.stringify([noCandidate.labels, noCandidate.result.hygieneChecksRun, noCandidate.result.hygieneDeferred]))

  // The handoff at the size of orbit-ui-mobile at c53c4ed (outdated 43, duplicate 58, old 1,714): the ledger tool
  // selects the candidates, and the Workflow call carries only the file and the counts of every candidate.
  const handoff = stageRepo("hygiene-handoff")
  const handoffFiles = [
    ...Array.from({ length: 1714 }, (_, index) => [`old/note-${String(index).padStart(4, "0")}.md`, `old note ${index}\n`]),
    ...Array.from({ length: 43 }, (_, index) => [`docs/stale-${index}.md`, `see \`docs/gone-${index}.md\`\n`]),
    ...Array.from({ length: 29 }, (_, index) => [[`copies/twin-${index}-a.png`, `twin ${index}\n`], [`copies/twin-${index}-b.png`, `twin ${index}\n`]]).flat(),
  ]
  for (const [path, body] of handoffFiles) {
    mkdirSync(dirname(join(handoff.path, path)), { recursive: true })
    writeFileSync(join(handoff.path, path), body)
  }
  handoff.git(["add", "-A"])
  handoff.git(["commit", "-q", "-m", "ledger rows"])
  writeFileSync(join(handoff.path, "scratch.tmp"), "untracked\n")
  const emitted = run("file-ledger.mjs", ["--repo", handoff.path])
  // A copy of the tool in a staged checkout, so the candidates file lands under the suite root.
  const handoffTool = stage("hygiene-handoff/checkout/tools/file-ledger.mjs", readFileSync(toolPath("file-ledger.mjs"), "utf8"))
  const selected = run("file-ledger.mjs", ["--candidates", stage("hygiene-handoff/ledger.jsonl", emitted.stdout), "--repo", handoff.path], { path: handoffTool })
  const entry = selected.status === 0 ? JSON.parse(selected.stdout) : { counts: {} }
  const handoffArgument = { repositories: { ui: entry } }
  const handed = await runReadiness({ hygiene: handoffArgument })
  const handoffPrompt = handed.prompts["hygiene:ui"] ?? ""
  const fileRows = selected.status === 0 ? readFileSync(entry.candidatesFile, "utf8").split("\n").filter(Boolean) : []
  const totals = Object.values(entry.counts).reduce((sum, count) => ({ judged: sum.judged + count.judged, deferred: sum.deferred + count.deferred }), { judged: 0, deferred: 0 })
  T(`${NAME}: at 1,816 candidates the Workflow args carry the candidates file and the counts, never a row`,
    emitted.status === 0 && selected.status === 0 && JSON.stringify(handoffArgument).length < 1000 && handoffPrompt.includes(entry.candidatesFile) && !handoffPrompt.includes('{"path"') &&
      entry.candidatesFile === join(dirname(dirname(handoffTool)), ".claude", "sweeps", "hygiene", "hygiene-handoff.jsonl"),
    `exit ${emitted.status}/${selected.status}, ${JSON.stringify(handoffArgument).length} bytes, ${selected.stderr.trim()}`)
  T(`${NAME}: at 1,816 candidates each candidate reads as judged or deferred, and the judged ones are the rows of the file`,
    totals.judged + totals.deferred === 1816 && totals.judged === 300 && fileRows.length === 300 && JSON.stringify(handed.result.hygieneCandidates.ui) === JSON.stringify(entry.counts) &&
      entry.counts.outdated?.judged === 43 && entry.counts.temporary?.judged === 1 && entry.counts.duplicate?.judged === 58 && entry.counts.old?.deferred === 1714 - entry.counts.old?.judged,
    JSON.stringify(entry.counts))
  T(`${NAME}: at 1,816 candidates the old rows beyond the cap stay in the deferred ledger with their count`,
    handed.result.hygieneDeferred.some((item) => item.check === "hygiene-ui" && item.reason.includes(`old ${entry.counts.old?.deferred} of 1714`)) && JSON.stringify(handed.result.hygieneChecksRun) === JSON.stringify(["ui"]),
    JSON.stringify(handed.result.hygieneDeferred))

  const refusal = (hygiene) => thrown(() => runInNewContext(readinessSource.slice(readinessSource.indexOf("const parsedArgs ="), readinessSource.indexOf("const OPS_SCHEMA")), { args: { roots: { ui: "/a", api: "/b" }, hygiene } }))
  const rows = refusal({ repositories: { ui: { root: "/a", candidates: [{ path: "x.md", kind: "old" }], candidatesFile: "/a/x.jsonl", counts: { old: { judged: 1, deferred: 0 } } } } })
  T(`${NAME}: hygiene candidate rows in the args are refused naming the repository`, /takes no hygiene candidate rows for ui/.test(rows ?? ""), rows ?? "accepted")
  for (const [label, repository] of [
    ["no candidatesFile", { root: "/b", counts: { old: { judged: 1, deferred: 0 } } }],
    ["a relative candidatesFile", { root: "/b", candidatesFile: "x.jsonl", counts: { old: { judged: 1, deferred: 0 } } }],
    ["no counts", { root: "/b", candidatesFile: "/b/x.jsonl" }],
    ["a count that is not a whole number", { root: "/b", candidatesFile: "/b/x.jsonl", counts: { old: { judged: 1.5, deferred: 0 } } }],
  ]) {
    const message = refusal({ repositories: { api: repository } })
    T(`${NAME}: a hygiene entry with ${label} is refused naming the repository`, /requires the candidatesFile and counts .* for api/.test(message ?? ""), message ?? "accepted")
  }
  const relativeRoot = refusal({ repositories: { vault: { root: "../brain" } } })
  T(`${NAME}: a relative hygiene root is refused naming the repository`, /absolute hygiene root for vault/.test(relativeRoot ?? ""), relativeRoot ?? "accepted")

  for (const [label, args] of [
    ["--model", ["exec", "--model", "gpt-5.6-sol"]],
    ["-m", ["exec", "-m", "gpt-5.6-sol"]],
    ["--model=", ["exec", "--model=gpt-5.6-sol"]],
  ]) {
    const message = thrown(() => resolveWorkerInvocation("codex", { args, models: { default: { model: "gpt-5.6-sol" } } }))
    T(
      `${NAME}: an engine pinning the model with ${label} in args is refused`,
      /worker engine "codex" must declare args as an array of non-model strings/.test(message ?? ""),
      `resolveWorkerInvocation returned instead of throwing, or threw: ${message}`,
    )
  }
  T(
    `${NAME}: a non-string entry in args is refused`,
    /must declare args as an array of non-model strings/.test(thrown(() => resolveWorkerInvocation("codex", { args: ["exec", 7], models: { default: { model: "x" } } })) ?? ""),
    "an args array carrying a number resolved",
  )
  T(
    `${NAME}: a missing engine is refused by name`,
    /worker engine "ghost" is missing from \.claude\/orchestrator\.json/.test(thrown(() => resolveWorkerInvocation("ghost", undefined)) ?? ""),
    "an absent engine resolved",
  )

  const unknownTier = thrown(() => resolveWorkerInvocation("codex", { args: [], models: { default: { model: "a" }, review: { model: "b" } } }, "cheap"))
  T(
    `${NAME}: an unknown tier is refused naming the tiers that are declared`,
    /has no valid models\.cheap; declared tiers: default, review/.test(unknownTier ?? ""),
    `a caller cannot fix a tier typo without being told what exists; got: ${unknownTier}`,
  )
  T(
    `${NAME}: a tier whose args are not an array of strings is refused`,
    /models\.default\.args must be an array of strings/.test(thrown(() => resolveWorkerInvocation("codex", { args: [], models: { default: { model: "a", args: "high" } } })) ?? ""),
    "a string args value resolved",
  )

  /** The shipped config, so this asserts the real engine rather than a fixture agreeing with it. */
  const real = realOrchestratorConfig()
  for (const [name, offArgs] of [["codex", ["--disable", "multi_agent"]], ["claude", ["--disallowed-tools", "Task"]]]) {
    const worker = real.workers[name]
    T(`${NAME}: ${name} declares the verified sub-agent off vector`,
      JSON.stringify(worker.subagentOffArgs) === JSON.stringify(offArgs))
    for (const tier of ["default", "mechanical", "deep", "max"]) {
      const disabled = resolveWorkerInvocation(name, worker, tier)
      T(`${NAME}: ${name}.${tier} always disables sub-agents`,
        JSON.stringify(disabled.args) === JSON.stringify([...worker.args, ...offArgs, ...(worker.models[tier].args ?? []), "--model", worker.models[tier].model]), JSON.stringify(disabled))
    }
  }
  T(`${NAME}: a malformed sub-agent off vector is refused`,
    /subagentOffArgs must be an array of non-model strings/.test(thrown(() => resolveWorkerInvocation("codex", {
      ...real.workers.codex, subagentOffArgs: ["--disable", 7],
    })) ?? ""))
  const killSwitch = { ...real.workers.codex }
  delete killSwitch.subagentOffArgs
  T(`${NAME}: removing the off vector is the config kill switch`,
    JSON.stringify(resolveWorkerInvocation("codex", killSwitch).args) === JSON.stringify([...killSwitch.args, ...(killSwitch.models.default.args ?? []), "--model", killSwitch.models.default.model]))
  const shipped = readOrchestratorConfig()
  T(`${NAME}: the shipped relay arms at 350000 tokens and forces at 400000`, shipped.relay.softTokens === 350000 && shipped.relay.hardTokens === 400000, `got ${JSON.stringify(shipped.relay)}`)
  T(`${NAME}: the shipped parallel ticket cap is 40`, real.caps.parallelTickets === 40)
  for (const name of ["parallelTickets", "maxOpenPullRequests", "maxQueuedRuns"]) {
    T(`${NAME}: the reader preserves the shipped ${name} cap`, shipped.caps[name] === real.caps[name])
  }
  T(`${NAME}: shipped standing ticket numbers are read`, JSON.stringify(shipped.tickets.standing) === JSON.stringify([556, 746]))
  const repeatedStanding = structuredClone(real)
  repeatedStanding.tickets.standing = [556, 556]
  T(`${NAME}: duplicate standing ticket numbers are refused`, /tickets\.standing must be an array of unique positive ticket numbers/.test(thrown(() => readOrchestratorConfig(configUrl("repeated-standing", JSON.stringify(repeatedStanding)))) ?? ""))
  const commonDir = spawnSync("git", ["-C", dirname(toolPath("lib/orchestrator-config.mjs")), "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" })
  const primaryRoot = dirname(commonDir.stdout.trim())
  const shippedRepos = readOrchestratorConfig().repos
  T(
    `${NAME}: shipped paths resolve from the primary checkout even in a linked worktree`,
    commonDir.status === 0 && shippedRepos.ui === primaryRoot &&
      shippedRepos.api === resolve(primaryRoot, "../orbit-api") &&
      shippedRepos.landing === resolve(primaryRoot, "../orbit-landing-page"),
    JSON.stringify(shippedRepos),
  )
  const primary = join(root, "resolver-primary", "orbit-ui-mobile")
  const linked = join(root, "resolver-linked")
  mkdirSync(join(primary, ".claude"), { recursive: true })
  writeFileSync(join(primary, ".claude", "orchestrator.json"), JSON.stringify(real))
  const git = (args) => spawnSync("git", ["-C", primary, ...args], { encoding: "utf8" })
  const staged = [
    ["init", "-q", "--initial-branch=main"],
    ["config", "user.email", "gate@orbit.test"],
    ["config", "user.name", "Orbit Gate"],
    ["add", ".claude/orchestrator.json"],
    ["commit", "-q", "-m", "config"],
    ["worktree", "add", "-q", "--detach", linked],
  ].every((args) => git(args).status === 0)
  const linkedConfig = pathToFileURL(join(linked, ".claude", "orchestrator.json")).href
  const resolverCommand = `import { readOrchestratorConfig } from ${JSON.stringify(pathToFileURL(toolPath("lib/orchestrator-config.mjs")).href)}; console.log(JSON.stringify(readOrchestratorConfig(new URL(${JSON.stringify(linkedConfig)})).repos))`
  const linkedResult = staged && spawnSync(process.execPath, ["--input-type=module", "-e", resolverCommand], { cwd: linked, encoding: "utf8" })
  const linkedRepos = linkedResult?.status === 0 ? JSON.parse(linkedResult.stdout) : null
  T(
    `${NAME}: resolver command prints primary checkout siblings from an outside linked worktree`,
    staged && relative(dirname(primary), linked).startsWith("..") &&
      linkedRepos?.ui === primary &&
      linkedRepos?.api === resolve(primary, "../orbit-api") &&
      linkedRepos?.landing === resolve(primary, "../orbit-landing-page"),
    linkedResult?.stderr || JSON.stringify(linkedRepos),
  )
  const relativeRepos = { ...real, repos: { ui: ".", api: "../orbit-api", landing: "../orbit-landing-page" } }
  const relativeConfig = configUrl("relative-repositories", JSON.stringify(relativeRepos))
  const fixtureRoot = dirname(dirname(fileURLToPath(relativeConfig)))
  const resolvedRepos = readOrchestratorConfig(relativeConfig).repos
  T(
    `${NAME}: relative repository paths resolve from the primary checkout`,
    resolvedRepos.ui === fixtureRoot &&
      resolvedRepos.api === resolve(fixtureRoot, "../orbit-api") &&
      resolvedRepos.landing === resolve(fixtureRoot, "../orbit-landing-page"),
    JSON.stringify(resolvedRepos),
  )
  const hygieneConfig = configUrl("hygiene-roots", JSON.stringify({ ...real, hygieneRoots: { workshop: "../thomas-brain", vault: "../brain" } }))
  const hygieneRoots = readOrchestratorConfig(hygieneConfig)
  const hygieneFixtureRoot = dirname(dirname(fileURLToPath(hygieneConfig)))
  T(`${NAME}: hygieneRoots resolve to absolute paths from the repository root`,
    hygieneRoots.hygieneRoots.workshop === resolve(hygieneFixtureRoot, "../thomas-brain") && hygieneRoots.hygieneRoots.vault === resolve(hygieneFixtureRoot, "../brain") &&
      isAbsolute(hygieneRoots.hygieneRoots.workshop) && isAbsolute(hygieneRoots.hygieneRoots.vault),
    JSON.stringify(hygieneRoots.hygieneRoots))
  T(`${NAME}: the shipped config resolves both hygiene roots outside the repos block`,
    typeof shipped.hygieneRoots?.workshop === "string" && isAbsolute(shipped.hygieneRoots.workshop) && isAbsolute(shipped.hygieneRoots.vault) &&
      !("workshop" in shipped.repos) && !("vault" in shipped.repos), JSON.stringify(shipped.hygieneRoots))
  for (const key of ["workshop", "vault"]) {
    const invalid = { ...real, hygieneRoots: { workshop: "../thomas-brain", vault: "../brain", [key]: 7 } }
    const message = thrown(() => readOrchestratorConfig(configUrl(`invalid-hygiene-${key}`, JSON.stringify(invalid))))
    T(`${NAME}: a hygieneRoots value that is not a string is refused naming ${key}`, message?.includes(`hygieneRoots.${key} must be a non-empty string`), message ?? "config was accepted")
  }
  const { hygieneRoots: removedHygiene, ...withoutHygiene } = real
  const loadedWithoutHygiene = readOrchestratorConfig(configUrl("no-hygiene-roots", JSON.stringify(withoutHygiene)))
  T(`${NAME}: a config with no hygieneRoots block still loads and keeps the same repos keys`,
    removedHygiene !== undefined && loadedWithoutHygiene.hygieneRoots === undefined &&
      JSON.stringify(Object.keys(loadedWithoutHygiene.repos)) === JSON.stringify(Object.keys(real.repos)))
  for (const name of ["maxOpenPullRequests", "maxQueuedRuns"]) {
    const invalid = { ...real, caps: { ...real.caps, [name]: 0 } }
    const message = thrown(() => readOrchestratorConfig(configUrl(`invalid-${name}`, JSON.stringify(invalid))))
    T(`${NAME}: ${name} must be a positive integer`, message?.includes(`caps.${name} must be a positive integer`), message ?? "config was accepted")
  }
  T(`${NAME}: classifier model is declared`, typeof real.classifier?.model === "string" && real.classifier.model.length > 0)
  const withoutClassifier = structuredClone(real)
  delete withoutClassifier.classifier
  T(`${NAME}: a missing classifier is refused`, /classifier object/.test(thrown(() => readOrchestratorConfig(configUrl("missing-classifier", JSON.stringify(withoutClassifier)))) ?? ""))
  const emptyClassifier = structuredClone(real)
  emptyClassifier.classifier.model = ""
  T(`${NAME}: an empty classifier model is refused`, /classifier.model must be a non-empty string/.test(thrown(() => readOrchestratorConfig(configUrl("empty-classifier", JSON.stringify(emptyClassifier)))) ?? ""))
  const engineName = real.worker
  const engine = real.workers[engineName]
  const invocation = resolveWorkerInvocation(engineName, engine, "default")
  T(
    `${NAME}: resolves the declared tier, model, and a single appended --model`,
    invocation.tier === "default" &&
      invocation.model === engine.models.default.model &&
      JSON.stringify(invocation.args) === JSON.stringify([...engine.args, ...(engine.subagentOffArgs ?? []), ...(engine.models.default.args ?? []), "--model", engine.models.default.model]),
    JSON.stringify(invocation),
  )
  /** The installed claude CLI accepts exactly low, medium, high, xhigh and max for --effort. */
  const effortOf = (args) => {
    const index = args.indexOf("--effort")
    return index === -1 || args.indexOf("--effort", index + 1) !== -1 ? null : args[index + 1]
  }
  T(
    `${NAME}: the shipped worker engine is claude`,
    engineName === "claude" && engine.command === "claude",
    `.claude/orchestrator.json names worker ${JSON.stringify(engineName)} with command ${JSON.stringify(engine.command)}`,
  )
  T(
    `${NAME}: the claude engine names its worker account by variable, never by path`,
    engine.configDirEnv === "ORBIT_WORKER_CLAUDE_CONFIG_DIR",
    JSON.stringify(engine.configDirEnv),
  )
  const accountDirectory = dirname(stage("orchestrator-config/worker-account/.claude.json", "{}\n"))
  const accountsFor = (value) => workerAccounts(engineName, engine, { [engine.configDirEnv]: value })
  T(`${NAME}: a set worker account variable runs the worker account first, then the main account`,
    JSON.stringify(accountsFor(accountDirectory)) === JSON.stringify([{ name: "worker", configDirectory: accountDirectory }, { name: "main", configDirectory: null }]),
    JSON.stringify(accountsFor(accountDirectory)))
  for (const [label, value] of [["unset", undefined], ["empty", ""], ["blank", "  "]]) {
    T(`${NAME}: a worker account variable that is ${label} runs single-account mode on the main account alone`,
      JSON.stringify(accountsFor(value)) === JSON.stringify([{ name: "main", configDirectory: null }]), JSON.stringify(accountsFor(value)))
  }
  T(`${NAME}: a worker account variable naming a missing directory is refused`,
    /names .*absent-account, which is not an existing directory; unset it to run workers on the main account$/.test(thrown(() => accountsFor(join(accountDirectory, "absent-account"))) ?? ""))
  T(`${NAME}: an engine with no Claude account has no accounts`,
    JSON.stringify(workerAccounts("codex", real.workers.codex, { [engine.configDirEnv]: accountDirectory })) === "[]")
  /** Owner order on #2067: default and mechanical run Sonnet 5.5, deep and max keep Opus 5.5, all at high effort. */
  for (const [tier, model] of WORKER_TIER_MODELS) {
    const resolved = resolveWorkerInvocation(engineName, engine, tier)
    T(`${NAME}: the shipped ${tier} implementer is ${model} at high effort`,
      resolved.model === model && effortOf(resolved.args) === "high",
      `.claude/orchestrator.json resolved ${resolved.model} with ${JSON.stringify(resolved.args)}`)
  }

  const engineFailures = []
  const codexEngine = real.workers.codex
  for (const [tier, effort] of [["default", "high"], ["mechanical", "medium"], ["deep", "xhigh"], ["max", "max"]]) {
    const resolved = resolveWorkerInvocation("codex", codexEngine, tier)
    T(`${NAME}: the retained codex ${tier} profile is gpt-6.1-sol at ${effort} reasoning effort`,
      resolved.model === "gpt-6.1-sol" && resolved.args.includes(`model_reasoning_effort="${effort}"`), JSON.stringify(resolved))
  }
  for (const [declaredName, declaredEngine] of Object.entries(real.workers)) {
    T(`${NAME}: ${declaredName} declares exactly the four worker tiers`,
      JSON.stringify(Object.keys(declaredEngine.models ?? {}).sort()) === JSON.stringify(["deep", "default", "max", "mechanical"]))
    const tiers = Object.keys(declaredEngine.models ?? {})
    if (tiers.length === 0) {
      engineFailures.push(`${declaredName}: declares no model tiers`)
      continue
    }
    for (const tier of tiers) {
      const message = thrown(() => {
        const resolved = resolveWorkerInvocation(declaredName, declaredEngine, tier)
        const expectedModel = declaredEngine.models[tier].model
        if (resolved.model !== expectedModel) throw new Error(`resolved model ${resolved.model}, declared ${expectedModel}`)
        if (JSON.stringify(resolved.args.slice(-2)) !== JSON.stringify(["--model", expectedModel])) {
          throw new Error(`args do not end with the declared model: ${JSON.stringify(resolved.args)}`)
        }
      })
      if (message !== null) engineFailures.push(`${declaredName}.${tier}: ${message}`)
    }
  }
  T(
    `${NAME}: every declared tier of every declared engine resolves`,
    engineFailures.length === 0,
    engineFailures.join("; "),
  )

  const claudeEngine = real.workers.claude ?? { args: [], models: {} }
  const claudeTiers = Object.keys(claudeEngine.models ?? {})
  const isolationFailures = claudeTiers.length === 0 ? ["the claude engine declares no model tiers"] : []
  for (const tier of claudeTiers) {
    const message = thrown(() => {
      const { args } = resolveWorkerInvocation("claude", claudeEngine, tier)
      const detail = JSON.stringify(args)
      if (!args.includes("--strict-mcp-config")) throw new Error(`no --strict-mcp-config in ${detail}`)
      if (args.some((argument) => argument === "--mcp-config" || argument.startsWith("--mcp-config="))) {
        throw new Error(`--mcp-config is present, so the server set is not empty: ${detail}`)
      }
      if (!args.includes("--verbose")) throw new Error(`no --verbose, which stream-json requires: ${detail}`)
      if (!args.join(" ").includes("--output-format stream-json")) throw new Error(`output is not stream-json: ${detail}`)
    })
    if (message !== null) isolationFailures.push(`${tier}: ${message}`)
  }
  T(
    `${NAME}: every claude tier resolves an argv that loads no MCP server and streams its output`,
    isolationFailures.length === 0,
    isolationFailures.join("; "),
  )

  const fallback = real.workers.claude ?? {}
  T(
    `${NAME}: the claude engine runs claude with sonnet 5.5 on default and mechanical and opus 5.5 on deep and max`,
    fallback.command === "claude" &&
      WORKER_TIER_MODELS.every(([tier, model]) => fallback.models?.[tier]?.model === model),
    `.claude/orchestrator.json declares command ${JSON.stringify(fallback.command)} with ${JSON.stringify(fallback.models)}`,
  )

  const readAndFail = (label, config) => thrown(() => readOrchestratorConfig(configUrl(label, JSON.stringify(config))))
  for (const softTokens of [149999, AUTO_COMPACT_TOKENS, "330000", 330000.5]) {
    T(`${NAME}: relay soft threshold ${softTokens} is refused`,
      /relay.softTokens/.test(readAndFail(`relay-soft-${softTokens}`, { ...real, relay: { enabled: true, softTokens, hardTokens: 390000 } }) ?? ""))
  }
  for (const hardTokens of [330000, 300000, AUTO_COMPACT_TOKENS, "390000", 390000.5, undefined]) {
    T(`${NAME}: relay hard ceiling ${hardTokens} is refused`,
      /relay.hardTokens/.test(readAndFail(`relay-hard-${hardTokens}`, { ...real, relay: { enabled: true, softTokens: 330000, hardTokens } }) ?? ""))
  }
  T(`${NAME}: a hard ceiling one token below the auto-compact point is accepted`, readAndFail("relay-hard-top", { ...real, relay: { enabled: true, softTokens: 330000, hardTokens: AUTO_COMPACT_TOKENS - 1 } }) === null)
  T(`${NAME}: a hard ceiling one token above the soft threshold is accepted`, readAndFail("relay-hard-edge", { ...real, relay: { enabled: true, softTokens: 330000, hardTokens: 330001 } }) === null)
  T(`${NAME}: relay enabled must be boolean`, /relay.enabled/.test(readAndFail("relay-enabled", { ...real, relay: { enabled: "true", softTokens: 330000, hardTokens: 390000 } }) ?? ""))
  T(
    `${NAME}: a config with no workers object is refused`,
    /must declare a workers object/.test(readAndFail("no-workers", { worker: "codex" }) ?? ""),
    "a config with no workers was accepted",
  )
  T(
    `${NAME}: a worker naming no declared engine is refused`,
    /worker "ghost" is not one of its workers/.test(readAndFail("bad-worker", { ...real, worker: "ghost" }) ?? ""),
    "a worker key naming no engine was accepted",
  )
  T(
    `${NAME}: cloud.enabled must be a boolean`,
    /cloud\.enabled must be a boolean/.test(
      readAndFail("bad-cloud-enabled", { ...real, cloud: { ...real.cloud, enabled: "false" } }) ?? "",
    ),
    "a string cloud.enabled value was accepted",
  )
  T(
    `${NAME}: a config with no tickets object is refused`,
    /must declare a tickets object/.test(readAndFail("no-tickets", { ...real, tickets: undefined }) ?? ""),
    "a config with no tickets object was accepted",
  )
  T(
    `${NAME}: a tickets block with no states object is refused`,
    /tickets\.states must be an object/.test(readAndFail("no-ticket-states", { ...real, tickets: { ...real.tickets, states: undefined } }) ?? ""),
    "a tickets block with no states object was accepted",
  )
  T(
    `${NAME}: a non-integer project number is refused`,
    /tickets\.projectNumber must be a positive integer/.test(
      readAndFail("fractional-project-number", { ...real, tickets: { ...real.tickets, projectNumber: 2.5 } }) ?? "",
    ),
    "a fractional project number was accepted",
  )
  const missingDone = { ...real.tickets.statusOptions }
  delete missingDone.Done
  T(
    `${NAME}: a missing board status option is refused by name`,
    /tickets\.statusOptions must declare exactly[\s\S]*missing: Done/.test(
      readAndFail("missing-status-option", { ...real, tickets: { ...real.tickets, statusOptions: missingDone } }) ?? "",
    ),
    "a status option set missing Done was accepted",
  )
  T(
    `${NAME}: an extra board status option is refused by name`,
    /extra: Shipped/.test(
      readAndFail("extra-status-option", {
        ...real,
        tickets: { ...real.tickets, statusOptions: { ...real.tickets.statusOptions, Shipped: "new-option" } },
      }) ?? "",
    ),
    "an unknown status option was accepted",
  )
  T(
    `${NAME}: duplicate board option ids are refused`,
    /statusOptions values must be unique/.test(
      readAndFail("duplicate-status-option", {
        ...real,
        tickets: {
          ...real.tickets,
          statusOptions: { ...real.tickets.statusOptions, Todo: real.tickets.statusOptions.Backlog },
        },
      }) ?? "",
    ),
    "two status names sharing one option id were accepted",
  )
  T(
    `${NAME}: a workflow state must name a declared board status`,
    /tickets\.states\.review must be "In Review"/.test(
      readAndFail("unknown-workflow-status", {
        ...real,
        tickets: { ...real.tickets, states: { ...real.tickets.states, review: "Shipped" } },
      }) ?? "",
    ),
    "an incorrect workflow state was accepted",
  )
  T(
    `${NAME}: the shipped ticket configuration carries the measured GitHub ids`,
    !Object.hasOwn(real, "linear") &&
      real.tickets.repository === "thomasluizon/orbit-tickets" &&
      real.tickets.projectId === "PVT_kwHOBE6dNc4Bfy2y" &&
      real.tickets.statusFieldId === "PVTSSF_lAHOBE6dNc4Bfy2yzhaDLqQ" &&
      real.tickets.statusOptions.Done === "9e4bdc69" &&
      real.tickets.states.working === "In Progress" &&
      real.tickets.states.review === "In Review" &&
      real.tickets.states.done === "Done",
    JSON.stringify(real.tickets),
  )
  for (const [label, key] of [["hardCeilingMinutes", "timeouts"]]) {
    const stripped = { ...real }
    delete stripped[key]
    T(
      `${NAME}: a config with no ${key} is refused naming ${key}.${label}`,
      new RegExp(`${key}\\.${label} must be a positive number`).test(readAndFail(`no-${key}`, stripped) ?? ""),
      `a config with no ${key} was accepted`,
    )
  }
  T(
    `${NAME}: a zero timeout is refused rather than read as "no clock"`,
    /timeouts\.noProgressMinutes must be a positive number/.test(readAndFail("zero-timeout", { ...real, timeouts: { ...real.timeouts, noProgressMinutes: 0 } }) ?? ""),
    "a zero no-progress clock was accepted",
  )
  T(
    `${NAME}: a zero review fixer bound is refused rather than becoming unbounded`,
    /caps\.reviewFixAttempts must be a positive number/.test(readAndFail("zero-review-fixes", { ...real, caps: { ...real.caps, reviewFixAttempts: 0 } }) ?? ""),
    "a zero review fixer bound was accepted",
  )
  for (const name of ["maxOpenPullRequests", "maxQueuedRuns"]) {
    T(`${NAME}: ${name} requires a positive integer`,
      new RegExp(`caps\\.${name} must be a positive integer`).test(readAndFail(`zero-${name}`, { ...real, caps: { ...real.caps, [name]: 0 } }) ?? ""))
  }
  T(
    `${NAME}: a branch launch cap must be a positive integer`,
    /caps\.workerLaunchesPerBranch must be a positive integer/.test(
      readAndFail("fractional-launch-cap", { ...real, caps: { ...real.caps, workerLaunchesPerBranch: 1.5 } }) ?? "",
    ),
    "a fractional worker launch cap was accepted",
  )
  T(
    `${NAME}: a cloud cap outside the measured 4 through 8 range is refused`,
    /caps\.cloudParallelTasks must be an integer from 4 through 8/.test(
      readAndFail("cloud-cap-too-high", { ...real, caps: { ...real.caps, cloudParallelTasks: 9 } }) ?? "",
    ),
    "a cloud cap above 8 was accepted",
  )
  T(
    `${NAME}: the cloud wall clock and environment are required`,
    /timeouts\.cloudCeilingMinutes must be a positive number/.test(
      readAndFail("no-cloud-ceiling", { ...real, timeouts: { ...real.timeouts, cloudCeilingMinutes: undefined } }) ?? "",
    ) &&
      /timeouts\.cloudCommandMinutes must be a positive number/.test(
        readAndFail("no-cloud-command-bound", { ...real, timeouts: { ...real.timeouts, cloudCommandMinutes: undefined } }) ?? "",
      ) &&
      /timeouts\.gitRemoteSeconds must be a positive number/.test(
        readAndFail("no-git-remote-bound", { ...real, timeouts: { ...real.timeouts, gitRemoteSeconds: undefined } }) ?? "",
      ) &&
      /timeouts\.receiptLockSeconds must be a positive number/.test(
        readAndFail("no-receipt-lock-bound", { ...real, timeouts: { ...real.timeouts, receiptLockSeconds: undefined } }) ?? "",
      ) &&
      /cloud\.environmentId must be a non-empty string/.test(
        readAndFail("no-cloud-environment", { ...real, cloud: { ...real.cloud, environmentId: "" } }) ?? "",
      ),
    "a cloud configuration field was optional",
  )
  T(
    `${NAME}: the cloud environment must name one configured repository`,
    /cloud\.repositoryKey must be a non-empty string/.test(
      readAndFail("no-cloud-repository", { ...real, cloud: { ...real.cloud, repositoryKey: "" } }) ?? "",
    ) &&
      /cloud\.repositoryKey must name a configured repository/.test(
        readAndFail("unknown-cloud-repository", { ...real, cloud: { ...real.cloud, repositoryKey: "unknown" } }) ?? "",
      ),
    "a cloud environment without a configured repository was accepted",
  )
  T(
    `${NAME}: the shipped cloud configuration carries the measured environment and the M5 Pro caps`,
    real.cloud.environmentId === "6a95b419b608819199eb78d9eabc9579" &&
      real.cloud.repositoryKey === "ui" &&
      real.timeouts.cloudCeilingMinutes === 45 &&
      real.timeouts.cloudCommandMinutes === 10 &&
      real.timeouts.gitRemoteSeconds === 30 &&
      real.timeouts.receiptLockSeconds === 1 &&
      real.caps.cloudParallelTasks === 8 &&
      real.caps.parallelTickets === 40 &&
      real.caps.workerLaunchesPerBranch === 2 &&
      real.caps.workerLogMegabytes === 512,
    JSON.stringify({ cloud: real.cloud, timeouts: real.timeouts, caps: real.caps }),
  )
  T(
    `${NAME}: an unreadable file is refused as unreadable, not as invalid JSON`,
    /could not be read: /.test(thrown(() => readOrchestratorConfig(pathToFileURL(join(root, "orchestrator-config", "absent.json")))) ?? ""),
    "a missing config did not report itself as missing",
  )
  T(
    `${NAME}: the shipped config is accepted when read from outside any repository`,
    readOrchestratorConfig(configUrl("shipped", JSON.stringify(real))).worker === real.worker,
    "the real config shape was refused by its own reader",
  )

  const stale = stageConfigRepo("stale", { head: "base", origin: "newer", working: '{"revision":"local"}\n' })
  T(
    `${NAME}: a working copy behind origin/main is refused with the fetch command to repair it`,
    stale !== null &&
      /disagrees with origin\/main and this checkout does not contain origin\/main[\s\S]*git fetch origin main/.test(
        thrown(() => readOrchestratorConfig(pathToFileURL(stale.configPath))) ?? "",
      ),
    stale === null ? "could not stage the git fixture" : String(thrown(() => readOrchestratorConfig(pathToFileURL(stale.configPath)))),
  )
  const ahead = stageConfigRepo("ahead", { head: "newer", origin: "base", working: `${JSON.stringify(real)}\n` })
  T(
    `${NAME}: a checkout that already contains origin/main is deliberately newer and is read`,
    ahead !== null && readOrchestratorConfig(pathToFileURL(ahead.configPath)).worker === real.worker,
    ahead === null ? "could not stage the git fixture" : `the staleness guard fired on a checkout containing origin/main: ${thrown(() => readOrchestratorConfig(pathToFileURL(ahead.configPath)))}`,
  )
}
