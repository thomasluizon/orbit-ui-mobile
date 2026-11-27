import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ORDER_KINDS, SIZE_LINE, brokenPartHeadings, duplicateParts, highestTotal, ownerParts, parseReplanAnswer, partOf, partProblem, renderBrief, renderOrder, splitProblem, withTotal } from "../lib/order.mjs"
import { REPO_ROOT, T, same } from "./_harness.mjs"

const PLACE = { repoKey: "ui", repoPath: "/work/repo", worktree: "/work/tree", branch: "chore/ticket-9-part-2", base: "main" }
const TICKET = { number: 9, title: "A ticket title", body: "The ticket body.", repository: "owner/tickets" }
const owner = (body, createdAt) => ({ body, createdAt, kind: null })

export const cases = async () => {
  const forms = [
    ["Part 1 of 3", { number: 1, total: 3 }],
    ["## Part 1 of 3", { number: 1, total: 3 }],
    ["# Part 1 of 3", { number: 1, total: 3 }],
    ["# #7 Part 1 of 13", { number: 1, total: 13 }],
    ["### #2 Part 4 of 8", { number: 4, total: 8 }],
    ["# #7 Part 12 of 13: the title", { number: 12, total: 13 }],
    ["Part 3 of 4\n\nBody that says Part 9 of 9.", { number: 3, total: 4 }],
    ["#Part 1 of 3", { number: 1, total: 3 }],
    ["part 1 of 3", { number: 1, total: 3 }],
    [" Part 1 of 3", { number: 1, total: 3 }],
    ["## **Part 2 of 5**: bold", { number: 2, total: 5 }],
    ["###### Part 2 of 5", { number: 2, total: 5 }],
  ]
  for (const [heading, want] of forms) same(`lib/order.mjs: the heading "${heading.split("\n")[0]}" reads as a part`, partOf({ body: heading }), want)

  const none = ["See Part 1 of 3", "The rebrand is Part 1 of 3", "# Title\nPart 1 of 3", "# #7Part 1 of 3", "Parts of speech", "Part 1 of", "# #abc Part 1 of 3", "####### Part 1 of 3", "Superseded: # Part 1 of 2"]
  for (const body of none) same(`lib/order.mjs: "${body.replaceAll("\n", "\\n")}" reads as no part`, partOf({ body }), null)

  const sets = [
    owner("Part 1 of 2: old one", "2026-11-01T10:00:00Z"),
    owner("Part 2 of 2: old two", "2026-11-01T10:01:00Z"),
    owner("# #7 Part 1 of 13: new one", "2026-11-10T10:00:00Z"),
    owner("# #7 Part 2 of 13: new two", "2026-11-10T10:01:00Z"),
  ]
  same("lib/order.mjs: a ticket with two part sets uses the newest set", ownerParts(sets).map((comment) => partOf(comment).total), [13, 13])
  same("lib/order.mjs: a ticket with no part comment has no part set", ownerParts([owner("A note", "2026-11-01T10:00:00Z")]), [])

  const fiveParts = Array.from({ length: 5 }, (_, index) => owner(`# #9 Part ${index + 1} of 5: step ${index + 1}\n\nBODY-${index + 1}`, `2026-11-10T10:0${index}:00Z`))
  const part = renderOrder({ kind: "build part", ticket: TICKET, partComments: fiveParts, place: PLACE, partNumber: 2 })
  T("lib/order.mjs: the build part order for part 2 of 5 asks for a title that ends with (Part 2 of 5)", part.includes('End the pull request title with "(Part 2 of 5)".'))
  T("lib/order.mjs: the build part order shows the heading of the part without its # marks", part.includes("### #9 Part 2 of 5: step 2 (this order)") && part.includes("- #9 Part 1 of 5: step 1") && !part.includes("# #9 Part 2 of 5: step 2\n\nBODY-2\n\n## "))
  const mixed = renderOrder({ kind: "build part", ticket: TICKET, partComments: sets, place: PLACE, partNumber: 2 })
  T("lib/order.mjs: a build part order of a ticket with two part sets reads the newest set", mixed.includes("(Part 2 of 13)") && !mixed.includes("old one") && !mixed.includes("old two"))

  const fixtures = JSON.parse(readFileSync(join(REPO_ROOT, "tools/__tests__/fixtures/ticket-comments.json"), "utf8"))
  const live = (number) => fixtures[number].map((entry) => ({ ...entry, kind: null }))
  const numbers = (number) => ownerParts(live(number)).map((comment) => partOf(comment).number)

  const first = live(2121)
  same("lib/order.mjs: #2121 real comments, the four `# Part n of 4` comments are parts", first.slice(0, 4).map((comment) => partOf(comment)), [1, 2, 3, 4].map((number) => ({ number, total: 4 })))
  const ticket2121 = { number: 2121, title: "T", body: "B", repository: "owner/tickets" }
  const unique2121 = first.filter((comment) => !comment.body.startsWith("# Part 3 of 4, owner order"))
  const order2121 = renderOrder({ kind: "build part", ticket: ticket2121, partComments: unique2121, place: PLACE, partNumber: 3 })
  T("lib/order.mjs: #2121 build part order holds the full part 3 and the first line of the other three", order2121.includes("### Part 3 of 4: Move onboarding and auth to the Orbit logic (this order)") && order2121.includes("- Part 1 of 4: Build the guided create and edit flows: one question in each step") && order2121.includes("- Part 4 of 4: Move Perfil and settings to the Orbit logic, and move the AI settings slug") && order2121.includes("(Part 3 of 4)"))
  same("lib/order.mjs: #2121 real comments, the owner order that repeats part 3 is a second live comment of part 3", duplicateParts(first).map((entry) => [entry.number, entry.comments.map((comment) => comment.url)]), [[3, [first[2].url, first[4].url]]])
  T("lib/order.mjs: #2121 part problem names both comment URLs", partProblem(first)?.includes(first[2].url) && partProblem(first)?.includes(first[4].url))
  same("lib/order.mjs: #2121 work order for the sign-in part is no part and no broken heading", [partOf(first[6]), brokenPartHeadings([first[6]])], [null, []])

  same("lib/order.mjs: #2123 old sets of 2 and the set of 13 give the set of 13 with no duplicate", [numbers(2123).length, partProblem(live(2123))], [13, null])
  same("lib/order.mjs: #2124 old set of 3 and the set of 2 give the set of 2 with no duplicate", [numbers(2124), partProblem(live(2124))], [[1, 2], null])
  same("lib/order.mjs: #2125 the set of 3 is in force and notes, decisions and the Part 5 status hold nothing", [numbers(2125), partProblem(live(2125))], [[1, 2, 3], null])
  same("lib/order.mjs: #2129 \"# Work order, part 2:\" is no part and holds nothing", [numbers(2129), partProblem(live(2129))], [[], null])
  same("lib/order.mjs: #2187 the 24 parts are sound and the launch comments hold nothing", [numbers(2187).length, partProblem(live(2187))], [24, null])
  T("lib/order.mjs: #2125 \"## Part 5 is complete\" is no part", partOf(live(2125)[10]) === null && brokenPartHeadings([live(2125)[10]]).length === 0)
  T("lib/order.mjs: #2187 \"Owner-session launch for #2187 Part 2\" is no part", live(2187).slice(38).every((comment) => partOf(comment) === null && brokenPartHeadings([comment]).length === 0))

  const superseded = [owner("Part 1 of 2: old", "2026-11-01T10:00:00Z"), owner("Part 2 of 2: old", "2026-11-01T10:01:00Z")]
  const retitled = superseded.map((comment) => ({ ...comment, body: `Superseded: ${comment.body}` }))
  same("lib/order.mjs: a comment that starts with Superseded: reads as no part and is no broken heading", [retitled.map(partOf), brokenPartHeadings(retitled)], [[null, null], []])

  const broken = ["Part 1 of", "# Part 2 of two", "Part 3/4", "## Parte 2 de 5", "Part 2:", "# Part 4", "Part 1"]
  same("lib/order.mjs: a heading that starts like a part and is not one is broken", broken.map((body) => brokenPartHeadings([{ body }]).length), [1, 1, 1, 1, 1, 1, 1])
  const fault = partProblem([{ body: "Part 3/4: a", url: "https://example.test/c1" }])
  same("lib/order.mjs: a broken heading problem quotes the line and names the comment URL once", [fault.includes('"Part 3/4: a"'), fault.match(/https?:\/\/[^\s"]+/g)], [true, ["https://example.test/c1"]])
  same("lib/order.mjs: a dash ban holds in the part problem text", /[\u2013\u2014]/.test(fault), false)

  for (const kind of ORDER_KINDS.filter((name) => name !== "find" && name !== "replan")) {
    const brief = renderBrief({ kind, place: PLACE, ticket: TICKET })
    T(`lib/order.mjs: the ${kind} brief fits the byte limit`, Buffer.byteLength(brief) <= 6000)
  }
  const SIZE = "Keep the pull request at or under 400 changed lines and 30 files (aim for 200), counted by tools/lib/diff-size.mjs. A hook stops new files at 300 lines and every change at 400."
  same("lib/order.mjs: the size line is the one line of the ticket", SIZE_LINE, SIZE)
  for (const kind of ORDER_KINDS) {
    const holds = renderBrief({ kind, place: PLACE, ticket: TICKET }).includes(SIZE)
    T(`lib/order.mjs: the ${kind} brief ${kind === "find" || kind === "replan" ? "holds no size line" : "holds the size line once"}`, holds === (kind !== "find" && kind !== "replan"))
  }
  const sized = renderOrder({ kind: "build part", ticket: TICKET, partComments: fiveParts, place: PLACE, partNumber: 2 })
  same("lib/order.mjs: a build part order holds the size line once", sized.split(SIZE).length - 1, 1)
  const build = renderBrief({ kind: "build", place: PLACE, ticket: TICKET })
  T("lib/order.mjs: a build brief says to commit and push after each finished step and to open the pull request after the first push", build.includes("Commit and push after each finished step, and open the pull request after the first push."))
  const fix = renderBrief({ kind: "fix", place: PLACE, ticket: TICKET })
  T("lib/order.mjs: a fix brief says to push to the open pull request and does not say to open one", !fix.includes("open the pull request after the first push") && fix.includes("Push to the branch of the open pull request."))
  const stated = ["never \`Closes\`", "--no-verify", "CI runs every full suite", "Never start Vitest without a file name", "Never run the complete tools suite", "node tools/test-tools.mjs", "against \`BRAND.md\`", "needs the label \`parity:exempt\`"]
  T("lib/order.mjs: a brief holds no line that CLAUDE.md already states", ORDER_KINDS.every((kind) => { const brief = renderBrief({ kind, place: PLACE, ticket: TICKET }); return stated.every((line) => !brief.includes(line)) }))
  T("lib/order.mjs: a build brief keeps the facts that CLAUDE.md does not state", build.includes("Tracks owner/tickets#9") && build.includes("Remaining: none") && build.includes("Start Vitest with `--run` and a file name.") && build.includes("The `## Parity` line of a `parity:exempt` pull request names one of these terms: BFF"))
  T("lib/order.mjs: a find brief has no delivery rule", !renderBrief({ kind: "find", place: PLACE, ticket: TICKET }).includes("first push"))

  const OWN_WRITES = "on the pull request of your own branch, `gh pr edit` (only `--body-file`, `--add-label`, `--remove-label`) and `gh pr comment` (only `--body`, `--body-file`). Start the Bash call with that command, from your working tree, with no `-R`."
  for (const kind of ORDER_KINDS.filter((name) => name !== "find" && name !== "replan")) {
    const brief = renderBrief({ kind, place: PLACE, ticket: TICKET })
    T(`lib/order.mjs: the ${kind} brief allows the edit and the comment of its own pull request`, brief.includes(OWN_WRITES))
    T(`lib/order.mjs: the ${kind} brief ties the parity:exempt label to the ## Parity line`, brief.includes("The `## Parity` line of a `parity:exempt` pull request names one of these terms: BFF"))
    T(`lib/order.mjs: the ${kind} brief tells the worker to fix a PR Metadata failure and never to ask the owner for it`, brief.includes("read the `PR Metadata` check with `gh pr checks`. When it fails on the body or a label, fix it yourself in this run. A label change starts no `PR Metadata` run. Change the label first. Then change the body text with `gh pr edit --body-file` (an `edited` event) or push, and read the check again. Never end with `NEEDS_DECISION` for a pull request body or label."))
  }
  T("lib/order.mjs: a find brief names no pull request write", !renderBrief({ kind: "find", place: PLACE, ticket: TICKET }).includes("gh pr "))

  for (const kind of ORDER_KINDS) {
    const claude = renderBrief({ kind, place: PLACE, ticket: TICKET })
    const codex = renderBrief({ kind, place: PLACE, ticket: TICKET, runner: "codex" })
    T(`lib/order.mjs: the ${kind} Codex brief names no /second-opinion, no Grep tool and no Claude Code`, !/\/second-opinion|Grep tool|Claude Code/.test(codex))
    T(`lib/order.mjs: the ${kind} Codex brief reads the humanizer file and searches with rg`, codex.includes("**Copy.** Write copy with the rules in `~/.claude/skills/humanizer/SKILL.md`. Read that file first.\n") && codex.includes("Search with `rg`. Write a longer check as a `.mjs` file"))
    const other = (brief) => brief.split("\n").filter((line) => !line.startsWith("**Copy.**") && !line.startsWith("**Commands.**"))
    same(`lib/order.mjs: every other line of the ${kind} Codex brief is the Claude line`, other(codex), other(claude))
    same(`lib/order.mjs: the ${kind} brief with no runner is the claude brief`, renderBrief({ kind, place: PLACE, ticket: TICKET, runner: "claude" }), claude)
  }
  T("lib/order.mjs: an order for the codex runner ends with the Codex brief", renderOrder({ kind: "build", ticket: TICKET, place: PLACE, runner: "codex" }).endsWith(renderBrief({ kind: "build", place: PLACE, ticket: TICKET, runner: "codex" })))
  T("lib/order.mjs: an unknown runner is refused", await (async () => { try { renderBrief({ kind: "build", place: PLACE, ticket: TICKET, runner: "toString" }); return false } catch (error) { return /unknown runner/.test(error.message) } })())

  const replanBrief = renderBrief({ kind: "replan", place: PLACE, ticket: TICKET })
  T("lib/order.mjs: a replan brief is read only, fits the byte limit, names no pull request write and no delivery rule", Buffer.byteLength(replanBrief) <= 6000 && replanBrief.includes("This is a read-only order.") && !replanBrief.includes("gh pr ") && !replanBrief.includes("first push") && replanBrief.includes('Your final message is the answer of "This order", with nothing after it.'))

  const stuck = { stuckBranch: "chore/ticket-9-part-2", mergedParts: [1], currentTotal: 2, highestTotal: 2 }
  const twoParts = [owner("## Part 1 of 2: first\n\nBODY-ONE", "2026-11-10T10:00:00Z"), owner("## Part 2 of 2: second\n\nBODY-TWO", "2026-11-10T10:01:00Z")]
  const history = [{ kind: "fix", model: "claude-opus-5-5", at: "2026-11-19T10:00:00.000Z", exitCode: 1, killReason: null, headBefore: "a".repeat(40), headAfter: "b".repeat(40), blocking: [{ path: "tools/a.mjs", line: 3, body: "BLOCKING: one" }], checks: [], result: "RESULT-TAIL" }]
  const replan = renderOrder({ kind: "replan", ticket: TICKET, partComments: twoParts, history, place: PLACE, replan: stuck })
  T("lib/order.mjs: a replan order holds the ticket body, every part in full, the failure history and the answer format", replan.includes("The ticket body.") && replan.includes("BODY-ONE") && replan.includes("BODY-TWO") && replan.includes("## This order (replan)") && replan.includes("## Earlier launches") && replan.includes("fix on claude-opus-5-5") && replan.includes("tools/a.mjs:3: BLOCKING: one") && replan.includes("Plan: fresh") && replan.includes("Plan: split") && replan.includes("Merged parts: 1.") && replan.includes("Total of the part set in force: 2."))
  const openOrder = renderOrder({ kind: "replan", ticket: TICKET, partComments: twoParts, history, place: PLACE, replan: { ...stuck, openParts: [3] } })
  T("lib/order.mjs: a replan order names the open parts and asks the run to keep them with their number and title", openOrder.includes("Merged parts: 1.") && openOrder.includes("Open parts: 3.") && openOrder.includes("Write the merged parts and the open parts with their number and title"))
  T("lib/order.mjs: a replan order with no open part says none", replan.includes("Open parts: none."))
  T("lib/order.mjs: a replan order for a ticket with no part set says so", renderOrder({ kind: "replan", ticket: TICKET, history, place: PLACE, replan: { stuckBranch: "chore/ticket-9", mergedParts: [], currentTotal: 0, highestTotal: 0 } }).includes("Merged parts: none. Total of the part set in force: 0."))
  T("lib/order.mjs: a replan order without its facts is refused", await (async () => { try { renderOrder({ kind: "replan", ticket: TICKET, place: PLACE }); return false } catch (error) { return /needs its stuck branch/.test(error.message) } })())

  same("lib/order.mjs: a fresh answer carries its note", parseReplanAnswer("Thinking.\nPlan: fresh\nThe slice is too wide.\nStart with the hook."), { plan: "fresh", note: "The slice is too wide.\nStart with the hook.", parts: [] })
  same("lib/order.mjs: a missing answer is fresh with no note", [parseReplanAnswer("I could not decide."), parseReplanAnswer(""), parseReplanAnswer(undefined)], Array(3).fill({ plan: "fresh", note: "", parts: [] }))
  const split = parseReplanAnswer("Plan: split\n## Part 1 of 3: one\nline a\n\n## Part 2 of 3: two\n\n## Part 3 of 3: three\nend")
  same("lib/order.mjs: a split answer gives one body for each part heading", [split.plan, split.parts], ["split", ["## Part 1 of 3: one\nline a", "## Part 2 of 3: two", "## Part 3 of 3: three\nend"]])
  same("lib/order.mjs: the last answer line wins", parseReplanAnswer("Plan: split\n## Part 1 of 2: a\nPlan: fresh\nnote").plan, "fresh")
  same("lib/order.mjs: a split with a usable set has no problem", splitProblem(split.parts, 2), null)
  T("lib/order.mjs: a split with fewer than 2 parts, a gap, mixed totals or a total that is not higher is refused", [splitProblem(["## Part 1 of 1: a"], 0), splitProblem(["## Part 1 of 2: a", "## Part 3 of 2: b"], 0), splitProblem(["## Part 1 of 2: a", "## Part 2 of 3: b"], 0), splitProblem(["## Part 1 of 2: a", "## Part 2 of 2: b"], 2), splitProblem(["no heading", "## Part 2 of 2: b"], 0)].every((problem) => typeof problem === "string"))
  const olderLarger = [...Array.from({ length: 4 }, (_, index) => owner(`## Part ${index + 1} of 4: old ${index + 1}`, `2026-11-01T10:0${index}:00Z`)), ...Array.from({ length: 3 }, (_, index) => owner(`## Part ${index + 1} of 3: new ${index + 1}`, `2026-11-10T10:0${index}:00Z`))]
  same("lib/order.mjs: the highest total reads every part comment, so an older and larger set counts", [highestTotal(olderLarger), highestTotal(olderLarger.slice(4)), highestTotal([owner("A note", "2026-11-01T10:00:00Z")])], [4, 3, 0])
  same("lib/order.mjs: a split that brings back the total of an older set is refused", [splitProblem(Array.from({ length: 4 }, (_, index) => `## Part ${index + 1} of 4: x`), highestTotal(olderLarger)) !== null, splitProblem(Array.from({ length: 5 }, (_, index) => `## Part ${index + 1} of 5: x`), highestTotal(olderLarger))], [true, null])
  const largerOrder = renderOrder({ kind: "replan", ticket: TICKET, partComments: olderLarger, history: [], place: PLACE, replan: { stuckBranch: "chore/ticket-9", mergedParts: [], currentTotal: 3, highestTotal: 4 } })
  T("lib/order.mjs: a replan order tells the run to beat the highest total of any set", largerOrder.includes("Total of the part set in force: 3. Highest total of any part set on the ticket: 4.") && largerOrder.includes("make m higher than 4."))
  same("lib/order.mjs: a merged part keeps its text and takes the new total", [withTotal("## Part 2 of 3: two\nBody that says Part 2 of 3.", 5), withTotal("# #7 Part 1 of 2: x", 4)], ["## Part 2 of 5: two\nBody that says Part 2 of 3.", "# #7 Part 1 of 4: x"])
}
