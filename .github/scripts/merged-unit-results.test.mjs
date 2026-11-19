import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { findMergedUnitResults, main, matchKeys } from "./merged-unit-results.mjs"

// Trimmed from the real responses for ui#2473: GET commits/b9c2fd519.../pulls, GET actions/workflows/test.yml/runs
// (run 44216168902) and GET actions/runs/44216168902/artifacts?name=unit-test-coverage. The keys are the plan
// outputs of that run and of main run 44219082100 at its merge commit.
const repository = "thomasluizon/orbit-ui-mobile"
const mergeCommit = "b9c2fd51954a98e6d20bf92942930f695dcb12aa"
const head = "aef1b537c9137ce21016f2dc50bffd3b79826b25"
const pull = { number: 2473, state: "closed", merged_at: "2026-11-18T01:52:21Z", merge_commit_sha: mergeCommit, head: { sha: head, ref: "fix/ticket-2144-icon-eyes", repo: { full_name: repository } }, base: { ref: "main" } }
const run = { id: 44216168902, run_attempt: 1, event: "pull_request", status: "completed", conclusion: "success", head_sha: head, path: ".github/workflows/test.yml", head_repository: { full_name: repository }, pull_requests: [], created_at: "2026-11-18T01:29:14Z" }
const artifact = { id: 14388998463, name: "unit-test-coverage", size_in_bytes: 591958, expired: false, created_at: "2026-11-18T01:45:11Z", workflow_run: { id: 44216168902, head_sha: head } }
const keys = {
  "web-unit": "web-unit-dc5f6a3a7daa8b5c63ed87b9-095ca005d57a889ee284a950",
  "mobile-unit": "mobile-unit-21bdec711a68941fb358471b-095ca005d57a889ee284a950",
  "workspace-unit": "workspace-unit-1b2e13218dbef83c5384f377-095ca005d57a889ee284a950",
}
const keyEnvironment = { WEB_UNIT_KEY: keys["web-unit"], MOBILE_UNIT_KEY: keys["mobile-unit"], WORKSPACE_UNIT_KEY: keys["workspace-unit"] }

function api({ pulls = [pull], runs = [run], artifacts = [artifact] } = {}) {
  const paths = []
  const request = async (path) => {
    paths.push(path)
    if (path.startsWith(`/repos/${repository}/commits/${mergeCommit}/pulls`)) return pulls
    if (path.startsWith(`/repos/${repository}/actions/workflows/test.yml/runs?`)) return { total_count: runs.length, workflow_runs: runs }
    if (path.startsWith(`/repos/${repository}/actions/runs/`)) return { total_count: artifacts.length, artifacts }
    throw new Error(`unexpected ${path}`)
  }
  return { request, paths }
}

const find = (overrides) => findMergedUnitResults({ repository, sha: mergeCommit, request: api(overrides).request })

test("a push to main finds the coverage artifact of the successful run at the head of the pull request it merged", async () => {
  const { request, paths } = api()
  assert.deepEqual(await findMergedUnitResults({ repository, sha: mergeCommit, request }), { runId: 44216168902, artifactId: 14388998463, pull: 2473 })
  assert.match(paths[1], new RegExp(`event=pull_request&status=success&head_sha=${head}`))
  assert.match(paths[2], /\/actions\/runs\/44216168902\/artifacts\?name=unit-test-coverage/)
})

test("the newest qualifying run and artifact win", async () => {
  const rerun = { ...run, id: 44216168999, created_at: "2026-11-18T01:59:00Z" }
  const newer = { ...artifact, id: 14388998999, created_at: "2026-11-18T02:10:00Z", workflow_run: { id: rerun.id } }
  assert.deepEqual(await find({ runs: [run, rerun], artifacts: [newer] }), { runId: rerun.id, artifactId: newer.id, pull: 2473 })
})

test("no result is reused without a merged pull request, a successful run from this repository, or a live artifact", async () => {
  const cases = [
    [{ pulls: [] }, /no merged pull request/],
    [{ pulls: [{ ...pull, merged_at: null }] }, /no merged pull request/],
    [{ pulls: [{ ...pull, merge_commit_sha: head }] }, /no merged pull request/],
    [{ runs: [] }, /has no successful PR Tests run/],
    [{ runs: [{ ...run, conclusion: "failure" }] }, /has no successful PR Tests run/],
    [{ runs: [{ ...run, head_repository: { full_name: "someone/orbit-ui-mobile" } }] }, /has no successful PR Tests run/],
    [{ runs: [{ ...run, event: "push" }] }, /has no successful PR Tests run/],
    [{ runs: [{ ...run, path: ".github/workflows/guards.yml" }] }, /has no successful PR Tests run/],
    [{ runs: [{ ...run, head_sha: mergeCommit }] }, /has no successful PR Tests run/],
    [{ artifacts: [] }, /has no unit-test-coverage artifact/],
    [{ artifacts: [{ ...artifact, expired: true }] }, /has no unit-test-coverage artifact/],
    [{ artifacts: [{ ...artifact, workflow_run: { id: 1 } }] }, /has no unit-test-coverage artifact/],
  ]
  for (const [overrides, reason] of cases) {
    const found = await find(overrides)
    assert.equal(found.artifactId, undefined, JSON.stringify(overrides))
    assert.match(found.reason, reason, JSON.stringify(overrides))
  }
})

test("only a group whose stored key equals the key of this run is reused", () => {
  assert.deepEqual(matchKeys(keys, keys), { "web-unit": true, "mobile-unit": true, "workspace-unit": true })
  assert.deepEqual(matchKeys({ ...keys, "web-unit": "web-unit-other" }, keys), { "web-unit": false, "mobile-unit": true, "workspace-unit": true })
  assert.deepEqual(matchKeys(undefined, keys), { "web-unit": false, "mobile-unit": false, "workspace-unit": false })
  assert.deepEqual(matchKeys({ "web-unit": "" }, { ...keys, "web-unit": "" }), { "web-unit": false, "mobile-unit": false, "workspace-unit": false })
})

test("record writes the keys that match reads back", async () => {
  const directory = mkdtempSync(join(tmpdir(), "merged-unit-results-"))
  try {
    let recorded = ""
    assert.equal(await main(["record"], keyEnvironment, (text) => { recorded += text }), 0)
    writeFileSync(join(directory, "unit-test-keys.json"), recorded)
    let matched = ""
    assert.equal(await main(["match", "--keys-file", join(directory, "unit-test-keys.json")], { ...keyEnvironment, MOBILE_UNIT_KEY: "mobile-unit-new" }, (text) => { matched += text }), 0)
    assert.equal(matched, "web-unit=true\nmobile-unit=false\nworkspace-unit=true\n")
    let absent = ""
    assert.equal(await main(["match", "--keys-file", join(directory, "missing.json")], keyEnvironment, (text) => { absent += text }), 0)
    assert.match(absent, /::notice .*stored no unit result keys\nweb-unit=false\nmobile-unit=false\nworkspace-unit=false\n$/)
    writeFileSync(join(directory, "broken.json"), "{")
    assert.equal(await main(["match", "--keys-file", join(directory, "broken.json")], keyEnvironment, () => {}), 1)
    assert.equal(await main(["record"], { WEB_UNIT_KEY: "a" }, () => {}), 1)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("find reports a failed API call as a warning and prints no output, so main runs its unit tests", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => ({}) })
  try {
    let output = ""
    assert.equal(await main(["find", "--repository", repository, "--sha", mergeCommit], { GITHUB_TOKEN: "token" }, (text) => { output += text }), 0)
    assert.match(output, /^::warning title=Unit tests run on main::the merged pull request lookup failed: GET \/repos\/.+ returned HTTP 502\n$/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("invalid arguments exit 2", async () => {
  for (const argv of [[], ["find", "--sha", mergeCommit], ["match"], ["record", "extra"], ["other"]]) {
    assert.equal(await main(argv, { ...keyEnvironment, GITHUB_TOKEN: "token" }, () => {}), 2, JSON.stringify(argv))
  }
  assert.equal(await main(["find", "--repository", repository, "--sha", mergeCommit], {}, () => {}), 2)
})
