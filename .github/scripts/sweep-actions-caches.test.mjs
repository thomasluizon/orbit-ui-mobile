import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"
import { CAP_BYTES, LARGE_ENTRY_BYTES, keyFamily, selectCachesToDelete, sweep } from "./sweep-actions-caches.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const script = resolve(here, "sweep-actions-caches.mjs")
// The unedited response of GET /repos/{owner}/{repo}/actions/caches?per_page=100 for this repository.
const response = JSON.parse(readFileSync(resolve(here, "fixtures/actions-caches.json"), "utf8"))
const caches = response.actions_caches
const defaultRef = "refs/heads/main"
const pullRequestRef = "refs/pull/2463/merge"
const total = (entries) => entries.reduce((sum, cache) => sum + cache.size_in_bytes, 0)
const isMarker = (cache) => /-pass-v\d+-/.test(cache.key)
const keysFor = (selection, reason) => selection.filter((entry) => entry.reason === reason).map((entry) => entry.cache.key)
const select = (overrides = {}) => selectCachesToDelete({ caches, openPullRequests: [2463], defaultRef, ...overrides })

test("the fixture is the real list: seven fields per entry, one pull request ref and the pass markers on main", () => {
  assert.equal(response.total_count, caches.length)
  for (const cache of caches) {
    assert.deepEqual(Object.keys(cache), ["id", "ref", "key", "version", "last_accessed_at", "created_at", "size_in_bytes"])
    assert.match(cache.last_accessed_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/)
  }
  assert.deepEqual([...new Set(caches.map((cache) => cache.ref))].sort(), [defaultRef, pullRequestRef])
  assert.deepEqual(caches.filter(isMarker).map((cache) => cache.key.replace(/-v1-.*/, "")).sort(), ["android-compile-pass", "ios-compile-pass"])
  assert.ok(total(caches) > 10_000_000_000, "the recorded list is over the 10 GB limit")
})

test("every entry on the merge ref of a closed pull request is deleted, and an open one keeps its entries", () => {
  const onPullRequest = caches.filter((cache) => cache.ref === pullRequestRef)
  assert.equal(onPullRequest.length, 7)
  assert.deepEqual(keysFor(select({ openPullRequests: [] }), "closed pull request").sort(), onPullRequest.map((cache) => cache.key).sort())
  assert.deepEqual(keysFor(select(), "closed pull request"), [])
  assert.deepEqual(keysFor(select({ capBytes: Infinity }), "closed pull request"), [])
  assert.deepEqual(select({ capBytes: Infinity }), [])
})

test("a pass marker is never deleted: not on a closed pull request ref, and not when the total is over the cap", () => {
  const marker = caches.find(isMarker)
  const closedMarker = { ...marker, id: marker.id + 1, ref: "refs/pull/2462/merge" }
  const selection = selectCachesToDelete({ caches: [...caches, closedMarker], openPullRequests: [], defaultRef, capBytes: 0 })
  assert.deepEqual(selection.filter((entry) => isMarker(entry.cache)), [])
  const kept = [...caches, closedMarker].filter((cache) => !selection.some((entry) => entry.cache === cache))
  assert.ok(kept.includes(closedMarker))
  assert.equal(kept.filter(isMarker).length, 3)
  const largeKept = kept.filter((cache) => !isMarker(cache) && cache.size_in_bytes >= LARGE_ENTRY_BYTES)
  assert.ok(largeKept.every((cache) => cache.ref === defaultRef), "a cap of zero removes every large pull request entry")
  assert.equal(new Set(largeKept.map((cache) => keyFamily(cache.key))).size, largeKept.length, "and keeps one main entry for each key family")
})

test("only the newest CodeQL overlay base database of each ref stays", () => {
  const newest = caches.find((cache) => cache.key.startsWith("codeql-overlay-base-database-"))
  assert.match(newest.key, /^codeql-overlay-base-database-1-[0-9a-f]+-javascript-[\d.]+-[0-9a-f]{40}-\d+-\d+$/)
  const older = { ...newest, id: newest.id - 1, key: newest.key.replace(/[0-9a-f]{40}-\d+-\d+$/, "e590374a82871f6628b5d0caf203785294541abc-43721544925-1"), created_at: "2026-11-15T17:20:00.000000Z", last_accessed_at: "2026-11-15T18:30:00.000000Z" }
  const selection = selectCachesToDelete({ caches: [older, ...caches], openPullRequests: [2463], defaultRef, capBytes: Infinity })
  assert.deepEqual(selection, [{ cache: older, reason: "superseded overlay base database" }])
  assert.deepEqual(select({ capBytes: Infinity }), [], "one overlay base database is the newest and stays")
})

// An older version of a main family: the Linux npm entry of the lockfile before the current one.
const currentNpm = caches.find((cache) => cache.key.startsWith("node-cache-Linux-x64-npm-"))
const olderNpm = { ...currentNpm, id: currentNpm.id - 1, key: "node-cache-Linux-x64-npm-c91b799ca60001dc00c500d11b081f9c6150bd6b7f3451a3cb2b21e433f23754", created_at: "2026-11-14T04:34:00.000000Z", last_accessed_at: "2026-11-15T04:44:03.000000Z" }

test("a key family drops its version parts, so a new lockfile, toolchain or commit is a new version of the same family", () => {
  assert.equal(keyFamily(olderNpm.key), keyFamily(currentNpm.key))
  assert.equal(keyFamily("v0-rust-desktop-x86_64-pc-windows-msvc-Windows_NT-x64-8bca1467-b3672f0d"), "v0-rust-desktop-x86_64-pc-windows-msvc-Windows_NT-x64-#-#")
  assert.equal(keyFamily("ubuntu-24.04-x64-ndk-v1-27.1.12297006"), keyFamily("ubuntu-24.04-x64-ndk-v1-28.0.13004108"))
  assert.notEqual(keyFamily("node-cache-macOS-arm64-npm-4b59a6714d0105240094823a4527cf02559cb624a9b91d251ff3e79b68135722"), keyFamily(currentNpm.key))
  assert.notEqual(keyFamily("Windows-windows-app-sdk-aarch64-pc-windows-msvc-e37f2d79"), keyFamily("Windows-windows-app-sdk-x86_64-pc-windows-msvc-e37f2d79"))
})

test("over the cap, pull request entries go first, then older main versions, and the newest entry of each main family stays", () => {
  const withOlder = [olderNpm, ...caches]
  const selection = selectCachesToDelete({ caches: withOlder, openPullRequests: [2463], defaultRef })
  assert.ok(total(withOlder) > CAP_BYTES)
  assert.deepEqual(new Set(selection.map((entry) => entry.reason)), new Set(["over the cap"]))
  const deleted = selection.map((entry) => entry.cache)
  const largeOnPullRequest = caches.filter((cache) => cache.ref === pullRequestRef && cache.size_in_bytes >= LARGE_ENTRY_BYTES)
  assert.deepEqual(deleted.slice(0, largeOnPullRequest.length).map((cache) => cache.key).sort(), largeOnPullRequest.map((cache) => cache.key).sort())
  const pullRequestReads = deleted.slice(0, largeOnPullRequest.length).map((cache) => cache.last_accessed_at)
  assert.deepEqual(pullRequestReads, [...pullRequestReads].sort(), "least recently read first")
  assert.deepEqual(deleted.slice(largeOnPullRequest.length), [olderNpm], "then the older version on main, and no entry main restores")
  assert.ok(total(withOlder) - total(deleted) > CAP_BYTES, "the newest main entries alone are over the cap in this recorded list")
  assert.deepEqual(selectCachesToDelete({ caches: withOlder, openPullRequests: [2463], defaultRef, capBytes: total(withOlder) - 1 }).map((entry) => entry.cache.key), [largeOnPullRequest.sort((left, right) => left.last_accessed_at.localeCompare(right.last_accessed_at))[0].key], "the sweep stops at the first entry that makes the total fit")
})

test("the cap leaves headroom under the 10 GB repository limit", () => {
  assert.equal(CAP_BYTES, 9_000_000_000)
  assert.equal(LARGE_ENTRY_BYTES, 5_000_000)
})

function fakeGh({ failDelete = false } = {}) {
  const calls = []
  const gh = (argumentsList) => {
    calls.push(argumentsList)
    const path = argumentsList.at(-1)
    if (argumentsList.includes("DELETE")) {
      if (failDelete) throw new Error("gh: Not Found (HTTP 404)")
      return ""
    }
    if (path === "repos/orbit/example/actions/caches?per_page=100") return JSON.stringify([{ total_count: caches.length, actions_caches: caches.slice(0, 20) }, { total_count: caches.length, actions_caches: caches.slice(20) }])
    if (path === "repos/orbit/example/pulls?state=open&per_page=100") return JSON.stringify([[{ number: 2466 }], [{ number: 2450 }]])
    if (path === "repos/orbit/example") return JSON.stringify({ default_branch: "main" })
    throw new Error(`unexpected gh call: ${argumentsList.join(" ")}`)
  }
  return { gh, calls }
}

test("the sweep reads every page, then deletes each selected entry by the id that the list returned", () => {
  const { gh, calls } = fakeGh()
  const lines = []
  sweep({ gh, repository: "orbit/example", dryRun: false, log: (line) => lines.push(line) })
  assert.deepEqual(calls.slice(0, 3), [
    ["api", "--paginate", "--slurp", "repos/orbit/example/actions/caches?per_page=100"],
    ["api", "--paginate", "--slurp", "repos/orbit/example/pulls?state=open&per_page=100"],
    ["api", "repos/orbit/example"],
  ])
  const expected = selectCachesToDelete({ caches, openPullRequests: [2466, 2450], defaultRef })
  assert.equal(expected.filter((entry) => entry.reason === "closed pull request").length, 7)
  assert.deepEqual(calls.slice(3), expected.map((entry) => ["api", "--method", "DELETE", `repos/orbit/example/actions/caches/${entry.cache.id}`]))
  assert.match(lines.at(-2), /^41 entries, 10777\.5 MB before; 7 selected, 9930\.5 MB after; cap 9000\.0 MB$/)
  assert.match(lines.at(-1), /^::warning::The newest main entries keep the total over the cap/)
})

test("a dry run deletes nothing, and a failed delete fails the sweep after every delete ran", () => {
  const dry = fakeGh()
  sweep({ gh: dry.gh, repository: "orbit/example", dryRun: true, log: () => {} })
  assert.equal(dry.calls.filter((call) => call.includes("DELETE")).length, 0)
  const failing = fakeGh({ failDelete: true })
  assert.throws(() => sweep({ gh: failing.gh, repository: "orbit/example", dryRun: false, log: () => {} }), /delete requests failed/)
  assert.equal(failing.calls.filter((call) => call.includes("DELETE")).length, selectCachesToDelete({ caches, openPullRequests: [2466, 2450], defaultRef }).length)
})

test("the command rejects a call without one repository", () => {
  assert.equal(spawnSync(process.execPath, [script], { encoding: "utf8" }).status, 2)
  assert.equal(spawnSync(process.execPath, [script, "--repository", "not a repository"], { encoding: "utf8" }).status, 2)
  assert.equal(spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" }).status, 0)
})

test("the Cache Budget workflow sweeps on a closed pull request, on a schedule and on a dispatch, from main code only", () => {
  const workflow = yaml.load(readFileSync(resolve(here, "../workflows/cache-budget.yml"), "utf8"))
  assert.deepEqual(workflow.on.pull_request, { types: ["closed"] })
  assert.ok(workflow.on.schedule.length === 1 && "workflow_dispatch" in workflow.on)
  assert.deepEqual(workflow.permissions, {})
  const job = workflow.jobs.sweep
  assert.equal(job.if, "github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository", "a fork pull request has a read-only token, so its close never starts the sweep")
  assert.deepEqual(job.permissions, { actions: "write", contents: "read", "pull-requests": "read" })
  assert.deepEqual(workflow.concurrency, { group: "cache-budget", "cancel-in-progress": false })
  const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"))
  assert.deepEqual(checkout.with, { ref: "main", "persist-credentials": false, "sparse-checkout": ".github/scripts" })
  const run = job.steps.find((step) => step.run?.includes("sweep-actions-caches.mjs"))
  assert.equal(run.run, 'node .github/scripts/sweep-actions-caches.mjs --repository "$GITHUB_REPOSITORY"')
  assert.deepEqual(run.env, { GH_TOKEN: "${{ github.token }}" })
  assert.ok(job.steps.every((step) => !/^actions\/(cache|setup-node)/.test(step.uses ?? "")), "the sweep saves and restores no cache")
})
