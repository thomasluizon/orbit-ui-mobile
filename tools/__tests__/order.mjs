import { ORDER_KINDS, ownerParts, partOf, renderBrief, renderOrder } from "../lib/order.mjs"
import { T, same } from "./_harness.mjs"

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
  ]
  for (const [heading, want] of forms) same(`lib/order.mjs: the heading "${heading.split("\n")[0]}" reads as a part`, partOf({ body: heading }), want)

  const none = ["See Part 1 of 3", "The rebrand is Part 1 of 3", "# Title\nPart 1 of 3", "#Part 1 of 3", "# #7Part 1 of 3", "Parts of speech", "Part 1 of", "part 1 of 3", " Part 1 of 3", "# #abc Part 1 of 3"]
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

  for (const kind of ORDER_KINDS.filter((name) => name !== "find")) {
    const brief = renderBrief({ kind, place: PLACE, ticket: TICKET })
    T(`lib/order.mjs: the ${kind} brief fits the byte limit`, Buffer.byteLength(brief) <= 6000)
  }
  const build = renderBrief({ kind: "build", place: PLACE, ticket: TICKET })
  T("lib/order.mjs: a build brief says to commit and push after each finished step and to open the pull request after the first push", build.includes("Commit and push after each finished step, and open the pull request after the first push."))
  const fix = renderBrief({ kind: "fix", place: PLACE, ticket: TICKET })
  T("lib/order.mjs: a fix brief says to push to the open pull request and does not say to open one", !fix.includes("open the pull request after the first push") && fix.includes("Push to the branch of the open pull request."))
  T("lib/order.mjs: a find brief has no delivery rule", !renderBrief({ kind: "find", place: PLACE, ticket: TICKET }).includes("first push"))
}
