import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { runFiles } from "../lib/run-files.mjs"
import { ManifestError, migrateRunState, planItem } from "../lib/run-migration.mjs"
import { writeRunState } from "../lib/run-state.mjs"

import { T, root, same } from "./_harness.mjs"

const UNIT = "lib/run-migration.mjs"
const HEAD = "d".repeat(40)

const checkoutOf = (label) => {
  const checkout = join(root, "run-migration", label)
  mkdirSync(join(checkout, ".git"), { recursive: true })
  writeRunState({ sessionId: "migrator", sleep: true, remaining: [] }, checkout)
  return checkout
}

const recordingActions = (existing = null) => {
  const writes = []
  return { writes, actions: {
    findRunRecord: async (title) => { writes.push(["find", title]); return existing },
    createRunRecord: async (title, body) => { writes.push(["create", title, body]); return { number: 2300, url: "https://github.com/thomasluizon/orbit-tickets/issues/2300" } },
    postComment: async (number, body) => { writes.push(["comment", number, body]) },
    editPullBody: async (repo, pr, body) => { writes.push(["body", repo, pr, body]) },
    replyThread: async (repo, pr, thread, body) => { writes.push(["reply", repo, pr, thread, body]) },
  } }
}

const planCases = () => {
  const texts = { "round.md": "Fix the two findings.\n", "review.md": "VERDICT: DEFECTS (1)\n\n1. tools/a.mjs:3", "empty.md": "  \n", "body.md": "## Summary\n" }
  const readText = (path) => {
    if (!(path in texts)) throw new Error(`ENOENT: ${path}`)
    return texts[path]
  }
  T(`${UNIT}: a round note item becomes its ticket comment`, planItem({ kind: "round-note", file: "round.md", issue: 2152, round: 2, head: HEAD }, { readText }).text.startsWith(`<!-- orbit-run-note: kind=round-note round=2 head=${HEAD} pullfrogThreads=0 -->`))
  for (const [label, count, expected] of [["no count", undefined, "pullfrogThreads=0"], ["a count of 0", 0, "pullfrogThreads=0"], ["a count of 3", 3, "pullfrogThreads=3"]]) {
    const marker = planItem({ kind: "round-note", file: "round.md", issue: 2152, round: 2, head: HEAD, pullfrogThreads: count }, { readText }).text.split("\n")[0]
    T(`${UNIT}: a round note item with ${label} posts ${expected}, the count that launch-worker.mjs --fix-round reads`, marker.includes(expected), marker)
  }
  for (const [label, count] of [["a negative count", -1], ["a fractional count", 1.5], ["a count that is text", "many"]]) {
    let error = null
    try { planItem({ kind: "round-note", file: "round.md", issue: 2152, round: 2, head: HEAD, pullfrogThreads: count }, { readText }) } catch (caught) { error = caught }
    T(`${UNIT}: a round note item with ${label} is refused before any write`, error instanceof ManifestError && /--pullfrog-threads/.test(error.message), error?.message)
  }
  same(`${UNIT}: a body item targets its pull request`, planItem({ kind: "body", file: "body.md", repo: "ui", pr: 2486 }, { readText }).target, "ui#2486 body")
  for (const [label, item, message] of [
    ["an unknown kind", { kind: "note", file: "round.md" }, /manifest kind/],
    ["a review without a verdict", { kind: "review", file: "round.md", issue: 2152, head: HEAD }, /VERDICT/],
    ["an empty file", { kind: "decision", file: "empty.md", issue: 2152 }, /is empty/],
    ["a missing file", { kind: "decision", file: "gone.md", issue: 2152 }, /gone\.md cannot be read: ENOENT/],
    ["a round note without its head", { kind: "round-note", file: "round.md", issue: 2152, round: 2 }, /round note needs --head/],
    ["a pull request number that is not positive", { kind: "body", file: "body.md", repo: "ui", pr: 0 }, /pr must be a positive integer/],
    ["a reply without its thread", { kind: "reply", file: "body.md", repo: "ui", pr: 2486 }, /PRRT_/],
    ["a review sent to the run record", { kind: "review", file: "review.md", head: HEAD, runRecord: true }, /only a decision/],
    ["a note without its ticket", { kind: "decision", file: "round.md" }, /issue must be a positive integer/],
  ]) {
    let error = null
    try { planItem(item, { readText }) } catch (caught) { error = caught }
    T(`${UNIT}: ${label} is refused before any write`, message.test(error?.message ?? ""), error?.message)
    T(`${UNIT}: ${label} throws a ManifestError, the structured input of the exit code`, error instanceof ManifestError, String(error?.constructor?.name))
  }
}

const migrationCases = async () => {
  const directory = join(root, "run-migration", "files")
  mkdirSync(directory, { recursive: true })
  for (const [name, text] of [["round.md", "Fix the two findings.\n"], ["review.md", "VERDICT: CLEAN\n"], ["decision.md", "Batch the notes of one round into one comment.\n"],
    ["body.md", "## Summary\n\nThe draft body.\n"], ["reply.md", "fixed in abc1234\n"]]) writeFileSync(join(directory, name), text)
  const manifest = [
    { kind: "round-note", file: join(directory, "round.md"), issue: 2152, round: 2, head: HEAD },
    { kind: "review", file: join(directory, "review.md"), issue: 2152, head: HEAD },
    { kind: "decision", file: join(directory, "decision.md"), runRecord: true },
    { kind: "body", file: join(directory, "body.md"), repo: "ui", pr: 2486 },
    { kind: "reply", file: join(directory, "reply.md"), repo: "ui", pr: 2486, thread: "PRRT_kwDOR5Siws61FNhy" },
  ]

  const dry = checkoutOf("dry")
  const dryRun = recordingActions()
  const plan = await migrateRunState({ manifest, actions: dryRun.actions, store: runFiles(dry) })
  T(`${UNIT}: a dry run plans the run record and every item`, plan.apply === false && plan.runRecord === "create" && plan.items.length === 5, JSON.stringify(plan))
  same(`${UNIT}: a dry run makes no write`, dryRun.writes.map(([kind]) => kind), ["find"])

  const applied = checkoutOf("applied")
  const live = recordingActions()
  const result = await migrateRunState({ manifest, apply: true, actions: live.actions, store: runFiles(applied) })
  same(`${UNIT}: the run record is created once, then every item posts in manifest order`, live.writes.map(([kind, target]) => `${kind} ${target}`),
    ["find Orbit run record", "create Orbit run record", "comment 2152", "comment 2152", "comment 2300", "body ui", "reply ui"])
  T(`${UNIT}: each note is the composed run note, and each body and reply is the file verbatim`, live.writes[2][2].startsWith("<!-- orbit-run-note: kind=round-note") &&
    live.writes[4][2].startsWith("<!-- orbit-run-note: kind=decision -->") && live.writes[5][3] === "## Summary\n\nThe draft body.\n" && live.writes[6][3] === "PRRT_kwDOR5Siws61FNhy", JSON.stringify(live.writes))
  T(`${UNIT}: the applied result names the run record and the posted items`, result.runRecord === "#2300" && result.posted.length === 5)

  const existing = checkoutOf("existing")
  const again = recordingActions({ number: 2300, url: "https://github.com/thomasluizon/orbit-tickets/issues/2300", state: "CLOSED" })
  await migrateRunState({ manifest: [manifest[2]], apply: true, actions: again.actions, store: runFiles(existing) })
  same(`${UNIT}: an existing run record is reused, never created twice`, again.writes.map(([kind, target]) => `${kind} ${target}`), ["find Orbit run record", "comment 2300"])

  const invalid = recordingActions()
  let refusal = null
  try { await migrateRunState({ manifest: [manifest[0], { kind: "review", file: join(directory, "round.md"), issue: 2152, head: HEAD }], apply: true, actions: invalid.actions, store: runFiles(checkoutOf("invalid")) }) } catch (error) { refusal = error.message }
  T(`${UNIT}: one invalid item stops the migration before any write`, /VERDICT/.test(refusal ?? "") && invalid.writes.length === 0, JSON.stringify({ refusal, writes: invalid.writes }))
}

const rerunCases = async () => {
  const directory = join(root, "run-migration", "rerun")
  mkdirSync(directory, { recursive: true })
  for (const [name, text] of [["one.md", "First decision.\n"], ["two.md", "Second decision.\n"], ["three.md", "Third decision.\n"]]) writeFileSync(join(directory, name), text)
  const manifest = ["one", "two", "three"].map((name) => ({ kind: "decision", file: join(directory, `${name}.md`), issue: 2152 }))
  const checkout = checkoutOf("rerun")
  const store = runFiles(checkout)
  const posted = []
  let failSecond = true
  const actions = { ...recordingActions().actions, postComment: async (number, body) => {
    if (failSecond && posted.length === 1) throw new Error("gh issue comment failed: needs a token")
    posted.push([number, body])
  } }
  let failure = null
  try { await migrateRunState({ manifest, apply: true, actions, store }) } catch (error) { failure = error }
  T(`${UNIT}: a GitHub write that fails midway is not a ManifestError`, failure !== null && !(failure instanceof ManifestError) && /needs a token/.test(failure.message), String(failure))
  same(`${UNIT}: the failed run posted the first item only`, posted.map(([, body]) => /First/.test(body)), [true])
  failSecond = false
  const dry = await migrateRunState({ manifest, actions, store })
  same(`${UNIT}: a dry run after the failure names the item that already posted`, dry.items.map((item) => item.alreadyPosted), [true, false, false])
  const rerun = await migrateRunState({ manifest, apply: true, actions, store })
  same(`${UNIT}: the rerun posts only the two items that did not post`, rerun.posted.map((item) => item.file.split("/").pop()), ["two.md", "three.md"])
  same(`${UNIT}: each item is posted exactly once across both runs`, posted.map(([, body]) => /(First|Second|Third) decision\./.exec(body)?.[1]), ["First", "Second", "Third"])
  const third = await migrateRunState({ manifest, apply: true, actions, store })
  T(`${UNIT}: a third run posts nothing`, third.posted.length === 0 && posted.length === 3, JSON.stringify(third.posted))
  const record = readFileSync(join(checkout, ".git", "orbit-test-run-files", "run-state", "migration.json"), "utf8")
  T(`${UNIT}: the record of posted items names no local file`, !record.includes(directory) && Object.keys(JSON.parse(record).posted).length === 3, record)
}

export const cases = async () => {
  planCases()
  await migrationCases()
  await rerunCases()
}
