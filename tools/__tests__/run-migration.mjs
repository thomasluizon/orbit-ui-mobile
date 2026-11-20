import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { intakeSource, readIntake } from "../lib/auto-work-intake.mjs"
import { runFiles } from "../lib/run-files.mjs"
import { ManifestError, mergeIntake, migrateRunState, planItem } from "../lib/run-migration.mjs"
import { writeRunState } from "../lib/run-state.mjs"
import { unseenMailIds } from "../orbit-mail.mjs"
import { importPlayReviews, PLAY_PACKAGES } from "../orbit-play-reviews.mjs"

import { T, root, same, seedIntake } from "./_harness.mjs"

const UNIT = "lib/run-migration.mjs"
const HEAD = "d".repeat(40)

/** The intake of a live run record, shaped as the run writes it: Gmail, Play and the waiter's marks. */
const LOCAL_INTAKE = {
  gmail: { completed: { m1: { id: "m1", classification: "praise" } }, pending: { m2: { id: "m2" } }, highWater: "m2" },
  play: { completed: { r1: { id: "r1", reply: "Obrigado!" } }, pending: {}, highWater: { [PLAY_PACKAGES[0]]: "101.000000000" } },
  wake: { seen: { mail: ["m2"], board: ["#2152 2026-11-18T00:00:00Z"] }, failures: {}, sentryListedAt: "2026-11-18T00:00:00.000Z" },
}

const checkoutOf = (label) => {
  const checkout = join(root, "run-migration", label)
  mkdirSync(join(checkout, ".git"), { recursive: true })
  writeRunState({ sessionId: "migrator", sleep: true, autoWork: true, remaining: [] }, checkout)
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

const mergeCases = () => {
  const remote = { gmail: { completed: { m2: { id: "m2", classification: "bug" } }, pending: {}, highWater: "m3" }, wake: { seen: { mail: ["m3"] } } }
  const merged = mergeIntake(remote, LOCAL_INTAKE)
  T(`${UNIT}: a mark already on GitHub wins, and a completed item never returns to pending`, merged.gmail.completed.m1 && merged.gmail.completed.m2.classification === "bug" &&
    Object.keys(merged.gmail.pending).length === 0 && merged.gmail.highWater === "m3", JSON.stringify(merged.gmail))
  same(`${UNIT}: the waiter's seen keys on GitHub stay`, merged.wake, remote.wake)
  same(`${UNIT}: a source only the local record has moves whole`, merged.play, LOCAL_INTAKE.play)
  same(`${UNIT}: an empty local record changes nothing`, mergeIntake(remote, {}), remote)
}

const planCases = () => {
  const texts = { "round.md": "Fix the two findings.\n", "review.md": "VERDICT: DEFECTS (1)\n\n1. tools/a.mjs:3", "empty.md": "  \n", "body.md": "## Summary\n" }
  const readText = (path) => {
    if (!(path in texts)) throw new Error(`ENOENT: ${path}`)
    return texts[path]
  }
  T(`${UNIT}: a round note item becomes its ticket comment`, planItem({ kind: "round-note", file: "round.md", issue: 2152, round: 2, head: HEAD }, { readText }).text.startsWith(`<!-- orbit-run-note: kind=round-note round=2 head=${HEAD} pullfrogThreads=0 -->`))
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
  const plan = await migrateRunState({ localIntake: LOCAL_INTAKE, manifest, actions: dryRun.actions, store: runFiles(dry) })
  T(`${UNIT}: a dry run plans the run record, the intake and every item`, plan.apply === false && plan.runRecord === "create" && plan.intake.changes === true && plan.items.length === 5, JSON.stringify(plan))
  same(`${UNIT}: a dry run makes no write`, dryRun.writes.map(([kind]) => kind), ["find"])
  same(`${UNIT}: a dry run leaves the intake file absent`, readIntake(dry), {})

  const applied = checkoutOf("applied")
  const live = recordingActions()
  const result = await migrateRunState({ localIntake: LOCAL_INTAKE, manifest, apply: true, actions: live.actions, store: runFiles(applied) })
  same(`${UNIT}: the run record is created once, then every item posts in manifest order`, live.writes.map(([kind, target]) => `${kind} ${target}`),
    ["find Orbit run record", "create Orbit run record", "comment 2152", "comment 2152", "comment 2300", "body ui", "reply ui"])
  T(`${UNIT}: each note is the composed run note, and each body and reply is the file verbatim`, live.writes[2][2].startsWith("<!-- orbit-run-note: kind=round-note") &&
    live.writes[4][2].startsWith("<!-- orbit-run-note: kind=decision -->") && live.writes[5][3] === "## Summary\n\nThe draft body.\n" && live.writes[6][3] === "PRRT_kwDOR5Siws61FNhy", JSON.stringify(live.writes))
  T(`${UNIT}: the applied result names the run record and the posted items`, result.runRecord === "#2300" && result.posted.length === 5)

  // The next collections read the migrated marks: no message is read twice and no review is classified twice.
  same(`${UNIT}: the Gmail marks moved`, intakeSource("gmail", applied).completed.m1.classification, "praise")
  const unseen = await unseenMailIds({ list: async () => ({ messages: [{ id: "m1" }, { id: "m2" }, { id: "m9" }] }) }, applied)
  same(`${UNIT}: the next mail collection skips every migrated message`, unseen, ["m9"])
  const reviews = importPlayReviews({ collectedAt: "2026-11-18T01:00:00Z", failures: [], packages: [...PLAY_PACKAGES],
    reviews: [{ packageName: PLAY_PACKAGES[0], id: "r1", version: "101.000000000", text: "Ótimo" }, { packageName: PLAY_PACKAGES[0], id: "r2", version: "102.000000000", text: "Bom" }] }, applied)
  same(`${UNIT}: the next review collection leaves a migrated review classified`, reviews.pending.map((item) => item.id), ["r2"])
  same(`${UNIT}: the waiter's seen keys moved`, readIntake(applied).wake.seen.mail, ["m2"])

  const withContent = checkoutOf("content")
  const mailLocal = { gmail: { completed: {}, pending: { m5: { id: "m5", threadId: "t5", bodiesComplete: true, sentId: "s5", subject: "SECRET subject", from: "SECRET sender",
    snippet: "SECRET snippet", bodies: [{ text: "SECRET body" }], replyTo: "SECRET reply" } }, highWater: "m5" } }
  await migrateRunState({ localIntake: mailLocal, manifest: [], apply: true, actions: recordingActions().actions, store: runFiles(withContent) })
  const migratedText = readFileSync(join(withContent, ".git", "orbit-test-run-files", "run-state", "intake.json"), "utf8")
  T(`${UNIT}: a pending Gmail message moves as its marks and no mail content reaches the intake file`, !/SECRET/.test(migratedText) &&
    JSON.stringify(intakeSource("gmail", withContent).pending.m5) === JSON.stringify({ id: "m5", threadId: "t5", sentId: "s5", bodiesComplete: true }), migratedText)

  const existing = checkoutOf("existing")
  seedIntake(existing, { gmail: { completed: { m1: { id: "m1", classification: "bug" } }, pending: {}, highWater: "m1" } })
  const again = recordingActions({ number: 2300, url: "https://github.com/thomasluizon/orbit-tickets/issues/2300", state: "CLOSED" })
  await migrateRunState({ localIntake: LOCAL_INTAKE, manifest: [manifest[2]], apply: true, actions: again.actions, store: runFiles(existing) })
  same(`${UNIT}: an existing run record is reused, never created twice`, again.writes.map(([kind, target]) => `${kind} ${target}`), ["find Orbit run record", "comment 2300"])
  same(`${UNIT}: a second migration keeps the mark GitHub already had`, intakeSource("gmail", existing).completed.m1.classification, "bug")

  const invalid = recordingActions()
  let refusal = null
  try { await migrateRunState({ localIntake: LOCAL_INTAKE, manifest: [manifest[0], { kind: "review", file: join(directory, "round.md"), issue: 2152, head: HEAD }], apply: true, actions: invalid.actions, store: runFiles(checkoutOf("invalid")) }) } catch (error) { refusal = error.message }
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
  try { await migrateRunState({ localIntake: LOCAL_INTAKE, manifest, apply: true, actions, store }) } catch (error) { failure = error }
  T(`${UNIT}: a GitHub write that fails midway is not a ManifestError`, failure !== null && !(failure instanceof ManifestError) && /needs a token/.test(failure.message), String(failure))
  same(`${UNIT}: the failed run posted the first item only`, posted.map(([, body]) => /First/.test(body)), [true])
  failSecond = false
  const dry = await migrateRunState({ localIntake: LOCAL_INTAKE, manifest, actions, store })
  same(`${UNIT}: a dry run after the failure names the item that already posted`, dry.items.map((item) => item.alreadyPosted), [true, false, false])
  const rerun = await migrateRunState({ localIntake: LOCAL_INTAKE, manifest, apply: true, actions, store })
  same(`${UNIT}: the rerun posts only the two items that did not post`, rerun.posted.map((item) => item.file.split("/").pop()), ["two.md", "three.md"])
  same(`${UNIT}: each item is posted exactly once across both runs`, posted.map(([, body]) => /(First|Second|Third) decision\./.exec(body)?.[1]), ["First", "Second", "Third"])
  const third = await migrateRunState({ localIntake: LOCAL_INTAKE, manifest, apply: true, actions, store })
  T(`${UNIT}: a third run posts nothing`, third.posted.length === 0 && posted.length === 3, JSON.stringify(third.posted))
  const record = readFileSync(join(checkout, ".git", "orbit-test-run-files", "run-state", "migration.json"), "utf8")
  T(`${UNIT}: the record of posted items names no local file`, !record.includes(directory) && Object.keys(JSON.parse(record).posted).length === 3, record)
}

export const cases = async () => {
  mergeCases()
  planCases()
  await migrationCases()
  await rerunCases()
}
