/** Table tests of the required checks file: its shape, its reads, the protection write and the merge bar that follows it. */

import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { REQUIRED_CHECKS_FILE, requiredChecksOf } from "../lib/github-read.mjs"
import { checkTicket, classOf, mergeBar, permanentFixOf, protectionForMerge, readBoardFor, readProtectionChecks, readRequiredChecksFile, sameRequiredChecks, writeProtectionChecks } from "../lib/github.mjs"
import { REPO_ROOT, T, root, same } from "./_harness.mjs"

const HEAD = "a".repeat(40)
const ACTIONS = 15368
const PULLFROG = 1768019

const required = (...contexts) => ({ strict: false, checks: contexts.map((context) => ({ context, app_id: ACTIONS })) })
const protectionOf = (...contexts) => contexts.map((context) => ({ context, appId: ACTIONS }))
const green = (name, appId = ACTIONS, conclusion = "SUCCESS") => ({ __typename: "CheckRun", databaseId: 1, name, status: "COMPLETED", conclusion, startedAt: "2026-11-20T09:00:00Z", detailsUrl: "", checkSuite: { app: { databaseId: appId } } })

/** A pull request that holds the bar apart from its checks: protection requires `Checks`, and only `PR Tests` reports. */
const pull = (extra = {}) => ({
  number: 30, state: "OPEN", draft: false, author: "thomasluizon", labels: [], headSha: HEAD, tracks: 7, body: "Tracks thomasluizon/orbit-tickets#7", ticketRepository: "thomasluizon/orbit-tickets", mergeState: "BLOCKED", changedFiles: 1, files: [REQUIRED_CHECKS_FILE], commitMessages: ["ci: rename a required check"], commits: [{ sha: HEAD, parents: 1 }],
  checks: [green("PR Tests"), green("pullfrog-approval", PULLFROG)], checksComplete: true, requiredChecks: protectionOf("Checks"),
  reviews: [{ state: "APPROVED", commit: HEAD, submittedAt: "2026-11-20T10:00:00Z", body: "", author: "pullfrog", blocking: [] }], threads: [], threadsComplete: true,
  requiredChecksChange: { base: required("Checks"), head: required("PR Tests") }, ...extra,
})

const barCases = () => {
  same("lib/github.mjs: a head file that drops Checks and adds PR Tests passes the bar with PR Tests green and no Checks run", mergeBar(pull()), [])
  same("lib/github.mjs: a head file that creates the list stands for the protection", mergeBar(pull({ requiredChecksChange: { base: null, head: required("PR Tests") } })), [])
  same("lib/github.mjs: a pull request with no change of the file keeps the protection", mergeBar(pull({ requiredChecksChange: null })), ["required-check-missing:Checks", "merge-state:BLOCKED"])
  same("lib/github.mjs: a check that the head file adds must report", mergeBar(pull({ checks: [green("pullfrog-approval", PULLFROG)] })), ["required-check-missing:PR Tests"])
  same("lib/github.mjs: a check that the head file adds must come from its app", mergeBar(pull({ checks: [green("PR Tests", 1), green("pullfrog-approval", PULLFROG)] })), ["required-check-missing:PR Tests"])
  same("lib/github.mjs: an added check with a null app id accepts every app", mergeBar(pull({ checks: [green("PR Tests", 1), green("pullfrog-approval", PULLFROG)], requiredChecksChange: { base: required("Checks"), head: { strict: false, checks: [{ context: "PR Tests", app_id: null }] } } })), [])
  same("lib/github.mjs: a branch behind its base keeps a check that the base gained", mergeBar(pull({ requiredChecks: protectionOf("Checks", "Gained") })), ["required-check-missing:Gained"])
  same("lib/github.mjs: a branch behind its base does not bring back a check that the base removed", mergeBar(pull({ requiredChecks: [], mergeState: "CLEAN", requiredChecksChange: { base: required("Old"), head: required("Old", "PR Tests") } })), [])
  same("lib/github.mjs: a head file of another shape fails the bar and keeps the protection", mergeBar(pull({ requiredChecksChange: { base: required("Checks"), head: null } })), ["required-checks-invalid", "required-check-missing:Checks", "merge-state:BLOCKED"])
  same("lib/github.mjs: the Pullfrog check stays required when the head file removes it", mergeBar(pull({ checks: [green("PR Tests")], requiredChecks: [{ context: "pullfrog-approval", appId: PULLFROG }], requiredChecksChange: { base: { strict: false, checks: [{ context: "pullfrog-approval", app_id: PULLFROG }] }, head: required("PR Tests") } })).includes("required-check-missing:pullfrog-approval"), true)
  same("lib/github.mjs: BLOCKED with no removed check still fails the bar", mergeBar(pull({ requiredChecksChange: { base: required("Checks"), head: required("Checks", "PR Tests") }, checks: [green("Checks"), green("PR Tests"), green("pullfrog-approval", PULLFROG)] })), ["merge-state:BLOCKED"])
  same("lib/github.mjs: BLOCKED fails the bar when the removed check reports on the head", mergeBar(pull({ checks: [green("Checks"), green("PR Tests"), green("pullfrog-approval", PULLFROG)] })), ["merge-state:BLOCKED"])
  same("lib/github.mjs: another merge state fails the bar of a change that removes a check", mergeBar(pull({ mergeState: "DIRTY" })), ["merge-state:DIRTY"])
  same("lib/github.mjs: a removed check that failed on the head still fails the bar", mergeBar(pull({ checks: [green("Checks", ACTIONS, "FAILURE"), green("PR Tests"), green("pullfrog-approval", PULLFROG)] })), ["check-not-green:Checks", "merge-state:BLOCKED"])
}

const protectionCases = () => {
  const current = required("Checks", "Guards")
  const change = { base: current, head: required("Guards", "PR Tests") }
  same("lib/github.mjs: the protection of a merge drops the removed check, adds the new one and keeps strict", protectionForMerge({ ...current, strict: true }, change), { ...required("Guards", "PR Tests"), strict: true })
  same("lib/github.mjs: a change that only adds a check needs no protection write before the merge", protectionForMerge(current, { base: current, head: required("Checks", "Guards", "PR Tests") }), null)
  T("lib/github.mjs: the order of the checks does not matter", sameRequiredChecks(required("a", "b"), required("b", "a")))
  same("lib/github.mjs: another strict value, app id or check is a difference", [
    sameRequiredChecks(required("a"), { ...required("a"), strict: true }),
    sameRequiredChecks(required("a"), { strict: false, checks: [{ context: "a", app_id: 1 }] }),
    sameRequiredChecks(required("a"), required("a", "b")),
    sameRequiredChecks(required("a", "b"), required("a")),
  ], [false, false, false, false])
}

const shapeCases = () => {
  same("lib/github-read.mjs: the app id -1 reads as every app", requiredChecksOf({ strict: false, checks: [{ context: "a", app_id: -1 }] }), { strict: false, checks: [{ context: "a", app_id: null }] })
  const wrong = [null, {}, { strict: "no", checks: [{ context: "a", app_id: 1 }] }, { strict: false, checks: [] }, { strict: false, checks: [{ context: "", app_id: 1 }] }, { strict: false, checks: [{ context: "a" }] }, { strict: false, checks: [{ context: "a", app_id: "1" }] }, { strict: false, contexts: ["a"] }]
  same("lib/github-read.mjs: another shape is refused", wrong.map(requiredChecksOf), wrong.map(() => null))
  const file = requiredChecksOf(JSON.parse(readFileSync(join(REPO_ROOT, REQUIRED_CHECKS_FILE), "utf8")))
  T(`${REQUIRED_CHECKS_FILE}: the committed file has the shape that the driver applies`, file !== null)
  T(`${REQUIRED_CHECKS_FILE}: the committed file requires the Pullfrog approval`, file?.checks.some((check) => check.context === "pullfrog-approval" && check.app_id === PULLFROG))
  T(`${REQUIRED_CHECKS_FILE}: the committed file names each check once`, new Set(file?.checks.map((check) => check.context)).size === file?.checks.length)
}

/** The recorded shape of `GET /repos/{owner}/{repo}/contents/{path}?ref=<sha>`: base64 content in lines of 60 characters. */
const contents = (text) => JSON.stringify({ name: "required-checks.json", path: REQUIRED_CHECKS_FILE, type: "file", content: `${Buffer.from(text).toString("base64").match(/.{1,60}/g).join("\n")}\n`, encoding: "base64" })

/** A repository whose origin names `slug`, which is how the adapter finds the repository of a key. */
const stageRepository = (slug) => {
  const path = join(root, "required-checks")
  mkdirSync(path, { recursive: true })
  for (const args of [["init", "-q"], ["remote", "add", "origin", `https://github.com/${slug}.git`]]) {
    const result = spawnSync("git", ["-C", path, ...args], { encoding: "utf8" })
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`)
  }
  return path
}

const adapterCases = async () => {
  const slug = "thomasluizon/orbit-ui-mobile"
  const config = { tickets: { repository: "thomasluizon/orbit-tickets" }, repos: { ui: stageRepository(slug) } }
  const seams = (answer) => {
    const calls = []
    return { calls, config, run: async (args, options = {}) => { calls.push({ text: args.join(" "), input: options.input }); return answer(args) } }
  }
  const fails = (message) => () => { throw new Error(message) }

  const found = seams(() => contents(JSON.stringify(required("PR Tests"))))
  same("lib/github.mjs: the file at a ref is read through the contents endpoint", [await readRequiredChecksFile("ui", HEAD, found), found.calls.map((call) => call.text)], [{ required: required("PR Tests") }, [`api repos/${slug}/contents/.github/required-checks.json?ref=${HEAD}`]])
  same("lib/github.mjs: a ref with no file reads as null", await readRequiredChecksFile("ui", HEAD, seams(fails(`gh api repos/${slug}/contents/x failed: gh: Not Found (HTTP 404)`))), null)
  same("lib/github.mjs: a file that is not JSON has no required checks", await readRequiredChecksFile("ui", HEAD, seams(() => contents("{ not json"))), { required: null })
  const refused = await readRequiredChecksFile("ui", HEAD, seams(fails("gh api failed: gh: Server Error (HTTP 502)"))).catch((error) => error.message)
  T("lib/github.mjs: a read that fails for another reason is no missing file", /HTTP 502/.test(refused), String(refused))

  const answer = { url: "u", strict: true, contexts: ["a", "b"], contexts_url: "c", checks: [{ context: "a", app_id: ACTIONS }, { context: "b", app_id: null }] }
  const read = seams(() => JSON.stringify(answer))
  same("lib/github.mjs: the protection reads in the shape of the file", [await readProtectionChecks("ui", "main", read), read.calls[0].text], [{ strict: true, checks: answer.checks }, `api repos/${slug}/branches/main/protection/required_status_checks`])
  const written = seams(() => "{}")
  await writeProtectionChecks("ui", "main", { strict: false, checks: answer.checks }, written)
  same("lib/github.mjs: the protection write is one PATCH that sends -1 for every app", [written.calls.map((call) => call.text), JSON.parse(written.calls[0].input)], [[`api repos/${slug}/branches/main/protection/required_status_checks --method PATCH --input -`], { strict: false, checks: [{ context: "a", app_id: ACTIONS }, { context: "b", app_id: -1 }] }])
}

const FIX = "## Permanent fix\n\n"
const bug = (fix, name = "Clipped label") => `Problem\n\nClass: ${name}\n\n${fix}`
const part = (number, line = `## Part ${number} of 2: Build it`, extra = {}) => ({ number, url: `https://example.test/c/${number}`, body: `${line}\n\nWork`, createdAt: `2026-11-2${number}T00:00:00Z`, kind: null, ...extra })

const ticketCases = async () => {
  const N = "lib/github.mjs: checkTicket"
  const check = (name, ticket, board, want, options = { primitives: null }) => same(`${N} ${name}`, checkTicket(ticket, board, options).length, want)
  const bugTicket = (body, labels = ["Bug"]) => ({ body, labels })
  check("accepts a sound Bug ticket", bugTicket(bug(`${FIX}Add \`eslint-rules/label-fit.cjs\`.`)), [], 0)
  check("refuses a Bug ticket with no Class line", bugTicket(`${FIX}Add eslint-rules/x.cjs`), [], 1)
  check("accepts a ticket of another type with no Class line", bugTicket("Problem", ["Improvement"]), [], 0)
  check("refuses a Bug ticket with no Permanent fix section", bugTicket("Class: Clipped label"), [], 1)
  check("refuses a Permanent fix section that names no code", bugTicket(bug(`${FIX}Fix it in the code.`)), [], 1)
  check("accepts none with a reason", bugTicket(bug(`${FIX}none: the class has no code home`)), [], 0)
  check("refuses none with no reason", bugTicket(bug(`${FIX}none:`)), [], 1)
  check("accepts a JS test file", bugTicket(bug(`${FIX}Test in \`apps/web/__tests__/label.test.tsx\`.`)), [], 0)
  check("accepts a spec file", bugTicket(bug(`${FIX}Test in packages/shared/src/label.spec.ts.`)), [], 0)
  check("accepts an orbit-api test file", bugTicket(bug(`${FIX}tests/Orbit.Api.Tests/Habits/HabitTests.cs`)), [], 0)
  check("refuses a tests/Shared file", bugTicket(bug(`${FIX}tests/Shared/HabitTests.cs`)), [], 1)
  check("refuses a file of an app that is no primitive", bugTicket(bug(`${FIX}apps/web/components/habits/card.tsx`)), [], 1)
  check("accepts a ui folder file when no list exists", bugTicket(bug(`${FIX}apps/web/components/ui/text.tsx`)), [], 0)
  check("accepts a primitive that the list names", bugTicket(bug(`${FIX}apps/mobile/components/text.tsx`)), [], 0, { primitives: ["apps/mobile/components/text.tsx"] })
  check("refuses a ui folder file that the list leaves out", bugTicket(bug(`${FIX}apps/web/components/ui/text.tsx`)), [], 1, { primitives: ["apps/mobile/components/text.tsx"] })

  const earlier = [{ number: 7, state: "CLOSED", body: bug(`${FIX}eslint-rules/label-fit.cjs`) }]
  check("refuses a repeat of a class that names none of the earlier code", bugTicket(bug(`${FIX}eslint-rules/other.cjs`, "clipped LABEL")), earlier, 1)
  check("accepts a repeat that names the earlier code", bugTicket(bug(`${FIX}eslint-rules/other.cjs and eslint-rules/label-fit.cjs`)), earlier, 0)
  check("ignores an earlier ticket of another class", bugTicket(bug(`${FIX}eslint-rules/other.cjs`, "Other class")), earlier, 0)
  check("ignores an earlier ticket with no paths", bugTicket(bug(`${FIX}eslint-rules/other.cjs`)), [{ number: 8, body: bug(`${FIX}none: no home`) }], 0)
  check("ignores an earlier none section whose reason holds a slash word", bugTicket(bug(`${FIX}eslint-rules/new.cjs`)), [{ number: 3, body: bug(`${FIX}none: an iOS/Android store setting`) }], 0)
  check("refuses a repeat whose own none reason holds the earlier path", bugTicket(bug(`${FIX}none: see eslint-rules/label-fit.cjs`)), earlier, 1)

  const driver = "Problem\n\nFiled by: driver"
  for (const label of ["design-system", "gate", "flag:approved"]) check(`refuses a driver ticket with ${label}`, bugTicket(driver, ["Improvement", label]), [], 1)
  check("accepts a driver ticket with no lock label", bugTicket(driver, ["Improvement"]), [], 0)
  check("accepts a lock label on an owner ticket", bugTicket("Problem", ["Improvement", "gate"]), [], 0)

  check("accepts a strict part heading", { comments: [part(1)] }, [], 0)
  check("refuses a part heading with a hash mark", { comments: [part(1, "# Part 1 of 2: Build it")] }, [], 1)
  check("refuses a part heading with no title", { comments: [part(1, "## Part 1 of 2")] }, [], 1)
  check("refuses a repeated part number", { comments: [part(1), { ...part(1), url: "https://example.test/c/9" }] }, [], 1)
  check("ignores a comment of the driver", { comments: [part(1, "## Part 1 of 2", { kind: "launch" })] }, [], 0)
  const edit = (after) => ({ comments: [], edits: [{ before: "## Part 2 of 3: Build", after }] })
  check("accepts an edit that keeps the part number", edit("## Part 2 of 4: Build"), [], 0)
  check("refuses an edit that changes the part number", edit("## Part 3 of 3: Build"), [], 1)
  check("refuses an edit that removes the part heading", edit("Build"), [], 1)

  same(`${N}: classOf and permanentFixOf read the body`, [classOf("a\r\nClass:  Clipped label \nb"), classOf("none"), permanentFixOf("x"), permanentFixOf(`${FIX}none: web/mobile or tools/a.mjs`).paths, permanentFixOf(`${FIX}See \`tools/a.mjs:12\`, then eslint-rules/b.cjs.\n## Next\nc/d`)], ["Clipped label", null, null, [], { none: false, paths: ["tools/a.mjs", "eslint-rules/b.cjs"] }])

  const slug = "thomasluizon/orbit-tickets"
  const calls = []
  const seams = { config: { tickets: { repository: slug } }, run: async (args) => { calls.push(args.join(" ")); return JSON.stringify([{ number: 7, state: "CLOSED", body: "b" }, { number: 9, state: "OPEN", body: null }]) } }
  same(`${N}: a ticket with no class reads no board`, [await readBoardFor({ body: "Problem" }, seams), calls.length], [[], 0])
  same(`${N}: the board read lists the tickets of the class and skips the ticket itself`, [await readBoardFor({ number: 9, body: "Class: Clipped label" }, seams), calls], [[{ number: 7, state: "CLOSED", body: "b" }], [`issue list --repo ${slug} --state all --search "Class: Clipped label" in:body --limit 200 --json number,state,body`]])
}

export const cases = async () => {
  await ticketCases()
  barCases()
  protectionCases()
  shapeCases()
  await adapterCases()
}
