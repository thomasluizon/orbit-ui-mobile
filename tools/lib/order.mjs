/** The delivery driver's work orders: the seven kinds of order and the one generic brief that every worker reads. */

import { parityExemptTerms } from "./parity-scope.mjs"

export const ORDER_KINDS = Object.freeze(["build", "build part", "fix", "ci-fix", "merge-forward", "find", "apply-comment"])

/** The first line of a comment that holds an order of the owner. `update-ticket.mjs note --owner` writes it. */
export const OWNER_MARKER = "<!-- orbit-owner -->"
/** The first line of a comment that holds a decision of the owner session. `update-ticket.mjs note --decision` writes it. */
export const DECISION_MARKER = "<!-- orbit-decision -->"
/** Every comment that a tool writes for a tool starts with this. Only the two markers above reach a worker. */
const TOOL_MARK = "<!-- orbit-"

/** The first line of an owner's part comment: heading marks, an optional ticket reference such as `#7`, then `Part n of m`. The rest of the line is the title. */
const PART_HEADING = /^#{0,6}\s*(?:#\d+\s+)?\**\s*Part\s+(\d+)\s+of\s+(\d+)/i

/** A first line that starts like a part heading and goes on with a total, a separator or nothing. "Part 5 is complete" goes on with prose, so it is a status note and not a broken heading. */
const PART_LIKE = /^#{0,6}\s*(?:#\d+\s+)?\**\s*Parte?\s+\d+\s*(?:$|[/:.,;\u2013\u2014-]|of\b|de\b)/i

const BRIEF_LIMIT_BYTES = 6000
const LOG_LINES_PER_CHECK = 60
/** The section of earlier launches stays under this size. The oldest launch goes first. */
export const EARLIER_LAUNCHES_LIMIT_BYTES = 16000
/** The tail of a worker result that the failure history keeps. */
export const RESULT_TAIL_BYTES = 2000

const firstLineOf = (text) => text.split("\n", 1)[0]

/** The first line of every comment that looks like a part heading but does not read as one, with its comment. */
export const brokenPartHeadings = (comments) =>
  comments.filter((comment) => partOf(comment) === null && PART_LIKE.test(firstLineOf(comment.body))).map((comment) => ({ comment, line: firstLineOf(comment.body) }))

/** The part comments in force that share one part number, as one entry for each such number. */
export const duplicateParts = (comments) => {
  const live = ownerParts(comments)
  return [...new Set(live.map((comment) => partOf(comment).number))]
    .map((number) => ({ number, comments: live.filter((comment) => partOf(comment).number === number) }))
    .filter((entry) => entry.comments.length > 1)
}

/** The reason that a ticket holds for the owner: a broken part heading or two live comments of one part. Null when the part comments are sound. */
export const partProblem = (comments) => {
  const [broken] = brokenPartHeadings(comments)
  if (broken !== undefined) return `The comment ${broken.comment.url} starts with "${broken.line}", which is not a part heading. Write it as "Part <n> of <m>: <title>" or remove the part number.`
  const [duplicate] = duplicateParts(comments)
  if (duplicate !== undefined) return `Part ${duplicate.number} has two live comments: ${duplicate.comments.map((comment) => comment.url).join(" and ")}. Start the old one with "Superseded: ".`
  return null
}

/** The part numbers and total that a comment announces, or null when the comment is not a part comment. */
export const partOf = (comment) => {
  const match = PART_HEADING.exec(firstLineOf(comment.body))
  return match ? { number: Number(match[1]), total: Number(match[2]) } : null
}

/**
 * The part comments of the newest part set, oldest first. A ticket can hold two sets (Part 1 of 2, then Part 1 of 13). The set of
 * the newest part comment is the set in force, and an older set with another total is dropped. A comment of the driver starts with
 * its hidden marker, so it never reads as a part.
 */
export const ownerParts = (comments) => {
  const parts = comments.filter((comment) => partOf(comment) !== null)
  const newest = parts.reduce((best, comment) => (best === null || String(comment.createdAt ?? "") >= String(best.createdAt ?? "") ? comment : best), null)
  return newest === null ? [] : parts.filter((comment) => partOf(comment).total === partOf(newest).total)
}

const trimmed = (text) => text.replace(/\s*$/, "")

/** `owner` or `decision` for a comment that starts with one of the two markers, else null. */
export const noteKindOf = (comment) => (comment.body.startsWith(OWNER_MARKER) ? "owner" : comment.body.startsWith(DECISION_MARKER) ? "decision" : null)

const noteText = (body) => trimmed(body.replace(/^<!-- orbit-(?:owner|decision) -->\n*/, ""))

/**
 * What can change a ticket after a launch, each with the time of its last change: an edit of the body, a part comment in
 * force, and an owner or decision comment. `ticket.editedAt` and `comment.editedAt` are the `lastEditedAt` of GitHub.
 */
export const ticketChanges = (ticket) => {
  const parts = new Set(ownerParts(ticket.comments.filter((comment) => noteKindOf(comment) === null && !comment.body.startsWith(TOOL_MARK))))
  const comments = ticket.comments.flatMap((comment) => {
    const kind = noteKindOf(comment) ?? (parts.has(comment) ? "part" : null)
    return kind === null ? [] : [{ kind, at: comment.editedAt ?? comment.createdAt, comment }]
  })
  return ticket.editedAt ? [{ kind: "body", at: ticket.editedAt, comment: null }, ...comments] : comments
}

const section = (title, texts) => (texts.length === 0 ? "" : `\n\n## ${title}\n\n${texts.join("\n\n")}`)

/** The owner orders and the decisions of the owner session, in full. Every order and the ticket comment for Pullfrog carry them. */
export const noteSections = (comments) => {
  const notes = (kind) => comments.filter((comment) => noteKindOf(comment) === kind).map((comment) => noteText(comment.body))
  return `${section("Owner orders", notes("owner"))}${section("Decisions of the owner session", notes("decision"))}`
}

/** The comments that every order carries in full: the owner orders, the decisions, then each comment that no tool wrote and that is no part. */
const commentSections = (comments) => {
  const others = comments.filter((comment) => !comment.body.startsWith(TOOL_MARK) && partOf(comment) === null).map((comment) => trimmed(comment.body))
  return `${noteSections(comments)}${section("Other comments on the ticket", others)}`
}

/** The heading of a part comment as a list item or a section title, without its leading `#` marks. */
const headingOf = (comment) => firstLineOf(comment.body).replace(/^#+ +/, "")

/** The full comment of the part that the order builds, and only the first line of every other part. */
const partSection = (partComments, partNumber) => {
  const parts = ownerParts(partComments)
  if (parts.length === 0) return ""
  const built = parts.filter((comment) => partOf(comment).number === partNumber)
  const others = parts.filter((comment) => partOf(comment).number !== partNumber)
  const sections = [
    ...built.map((comment) => `### ${headingOf(comment)} (this order)\n\n${trimmed(comment.body)}`),
    ...(others.length === 0 ? [] : [`Other parts, first line only:\n\n${others.map((comment) => `- ${headingOf(comment)}`).join("\n")}`]),
  ]
  return `\n\n## Parts\n\n${sections.join("\n\n")}`
}

/** The `findings` comments that an apply part applies, in full. */
const findingsSection = (findings) =>
  findings.length === 0 ? "" : `\n\n## Findings to apply\n\n${findings.map((comment) => trimmed(comment.body.replace(/^<!-- orbit-drive:[a-z-]+ -->\n?/, ""))).join("\n\n")}`

const changeText = ({ kind, comment }) => {
  if (kind === "body") return "- The ticket body was edited. Compare the body above with the code."
  if (kind === "part") return `- This part comment is new or edited:\n\n${trimmed(comment.body).split("\n").map((line) => `  ${line}`).join("\n")}`
  return `- This comment under "${kind === "owner" ? "Owner orders" : "Decisions of the owner session"}" is new or edited: ${firstLineOf(noteText(comment.body))}`
}

/** The work of an apply-comment order: each change, and where its commits go. */
const applySection = ({ pull, changes }) => {
  const where = pull === null
    ? "No pull request of the ticket is open. Rebase on `origin/main` before the first push. Open one pull request. Its `Remaining:` line keeps each item that the last merged pull request left open. When the code already meets each change, commit nothing, open no pull request and say so in your final message."
    : `The pull request ${pull.number} has the head \`${pull.headSha}\`. Push to its branch. When the code already meets each change, commit nothing and say so in your final message. Do not merge \`origin/main\`.`
  return `The ticket changed after the newest launch. Apply each change below, and change nothing else. Do not build the ticket again.\n\n${changes.map(changeText).join("\n")}\n\n${where}`
}

const instanceList = (review) =>
  review.blocking.map((finding) => `- ${finding.path === null ? "the review body" : `${finding.path}:${finding.line}`}\n\n${trimmed(finding.body).split("\n").map((line) => `  ${line}`).join("\n")}`).join("\n\n")

const checkSection = (check, lineLimit = LOG_LINES_PER_CHECK) => {
  const steps = check.failedSteps?.length > 0 ? ` (failed steps: ${check.failedSteps.join(", ")})` : ""
  const lines = lineLimit > 0 ? (check.logLines ?? []).slice(-lineLimit) : []
  return `### ${check.name}${steps}${lines.length === 0 ? "" : `\n\n\`\`\`\n${lines.join("\n")}\n\`\`\``}`
}

/** The instruction of every fix order: the review or the check names one instance, and the worker fixes the class. */
export const CLASS_RULE = "Fix the whole class of each finding in this round. Name the class. Search the whole tree for every instance of the class. Fix each instance. List each path in the commit message. Add a test that fails without the fix, and run it red before the fix."

const baseMergeSection = (baseMerge) => `The head is a clean merge of \`origin/main\`. The branch was green at \`${baseMerge.before}\` before the merge. The merge brought in these base commits:\n\n${baseMerge.commits.map((line) => `- ${line}`).join("\n")}\n\nThe cause is one of these commits and how it meets this branch. Find it and fix it.\n\n`

/** The part of the order that belongs to one kind: what to do first and what to fix. */
const kindSection = ({ kind, pull, review, failure, partNumber, partTotal, changes }) => {
  switch (kind) {
    case "apply-comment":
      return applySection({ pull, changes })
    case "build":
      return "Build the ticket. Rebase on `origin/main` before the first push."
    case "build part":
      return `Build Part ${partNumber} of this ticket and no other part. Rebase on \`origin/main\` before the first push. End the pull request title with "(Part ${partNumber} of ${partTotal})".`
    case "fix":
      return `The pull request ${pull.number} has the head \`${pull.headSha}\`. Its latest review blocks the merge with the classes below. Each finding names one instance of a class. The class can have more instances.\n\n${instanceList(review)}\n\n${CLASS_RULE} Fix every class in one commit. Change no line that the classes do not need. Run the focused tests, the type check and the lint. Do not merge \`origin/main\`. Push once.`
    case "ci-fix":
      return `The pull request ${pull.number} has the head \`${pull.headSha}\`. These checks failed.\n\n${failure.baseMerge ? baseMergeSection(failure.baseMerge) : ""}${failure.checks.map((check) => checkSection(check)).join("\n\n")}\n\n${CLASS_RULE} Do not merge \`origin/main\`. Push once.`
    case "merge-forward":
      return `The pull request ${pull.number} has the head \`${pull.headSha}\`. It conflicts with \`origin/main\`${failure?.conflicts?.length > 0 ? ` in: ${failure.conflicts.join(", ")}` : ""}. Merge \`origin/main\` into the branch and resolve the conflicts. Run the focused checks. Push once.`
    case "find":
      return `Read only the slice that the part names. Your final message is the area list, then the findings table with one row per finding as \`path:line | class | fix\`, and nothing after the table. Commit nothing, push nothing and open no pull request.`
    default:
      throw new Error(`unknown order kind: ${kind}`)
  }
}

const fenced = (text) => {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length))
  const fence = "`".repeat(Math.max(3, longest + 1))
  return `${fence}\n${text}\n${fence}`
}

const byteTail = (text, limit) => {
  const buffer = Buffer.from(text)
  return buffer.length <= limit ? text : buffer.subarray(buffer.length - limit).toString()
}

/** One earlier launch: what ran, how it ended, and what stayed open at its head. */
const launchSection = (launch, lineLimit = LOG_LINES_PER_CHECK) => {
  const ended = launch.exitCode === null || launch.exitCode === undefined ? "unknown" : String(launch.exitCode)
  const killed = launch.killReason ? `, killed: ${launch.killReason}` : ""
  const heads = launch.headBefore ? `${launch.headBefore} to ${launch.headAfter ?? "unknown"}` : "unknown"
  const findings = (launch.blocking ?? []).map((entry) => `- ${entry.path === null ? "the review body" : `${entry.path}:${entry.line}`}: ${trimmed(entry.body).split("\n").join(" ")}`)
  const checks = (launch.checks ?? []).map((entry) => checkSection(entry, lineLimit).replace(/^###/, "####"))
  const parts = [
    `### ${launch.kind} on ${launch.model}, started ${launch.at ?? "at an unknown time"}`,
    `Exit: ${ended}${killed}. Head: ${heads}.`,
    ...(findings.length === 0 ? [] : [`Open BLOCKING findings at the head:\n\n${findings.join("\n")}`]),
    ...(checks.length === 0 ? [] : [`Failing checks at the head:\n\n${checks.join("\n\n")}`]),
    ...(launch.result ? [`The end of the worker result:\n\n${fenced(byteTail(launch.result, RESULT_TAIL_BYTES))}`] : []),
  ]
  return parts.join("\n\n")
}

/** The failure history of the launches of a plan, newest first, under the size limit. A launch that no longer fits drops, the oldest first. */
const earlierLaunchesSection = (history) => {
  if (history.length === 0) return ""
  const sections = history.map((launch) => launchSection(launch))
  const size = (list) => Buffer.byteLength(list.join("\n\n"))
  while (sections.length > 1 && size(sections) > EARLIER_LAUNCHES_LIMIT_BYTES) sections.pop()
  // One launch is left here. When it is still over the limit, drop its oldest check-log lines and render it again, so every fence closes and the result tail stays.
  let lineLimit = LOG_LINES_PER_CHECK
  while (size(sections) > EARLIER_LAUNCHES_LIMIT_BYTES && lineLimit > 0) sections[0] = launchSection(history[0], --lineLimit)
  return `\n\n## Earlier launches\n\n${sections.join("\n\n")}\n\nThe launches above failed. Find why before you change code.`
}

/** A fix, ci-fix or merge-forward order, and an apply-comment order with a pull request, push to the branch of that open pull request and open none. */
const pushesToOpenPull = (kind, pull) => kind === "fix" || kind === "ci-fix" || kind === "merge-forward" || (kind === "apply-comment" && pull !== null)

/** The delivery rules. A find order has no delivery, so it does not get them. */
const deliverySection = ({ ticket, pushes }) => {
  const repository = ticket.repository
  const pullRequest = pushes
    ? "Push to the branch of the open pull request. Open no other pull request."
    : `Open one non-draft pull request with \`gh pr create\`. The body holds \`Tracks ${repository}#${ticket.number}\` \`## Assumptions\`, \`## Manual steps\`, \`## Test evidence\` and a \`Remaining:\` line. The line says \`Remaining: none\`, or lists the parts that stay open, separated by semicolons. Start each item that waits on the owner, on another ticket or on a release with \`owner:\` or \`blocked by #<ticket>\`.`
  const parity = `The \`## Parity\` line of a \`parity:exempt\` pull request names one of these terms: ${parityExemptTerms.join(", ")}.`
  const pushRule = pushes ? "" : " Commit and push after each finished step, and open the pull request after the first push."
  const writes = `Write to GitHub only with ${pushes ? "`git push`" : "`git push`, `gh pr create`"} and, on the pull request of your own branch, \`gh pr edit\` (only \`--body-file\`, \`--add-label\`, \`--remove-label\`) and \`gh pr comment\` (only \`--body\`, \`--body-file\`). Start the Bash call with that command, from your working tree, with no \`-R\`.`
  const metadata = "After your last push, read the `PR Metadata` check with `gh pr checks`. When it fails on the body or a label, fix it yourself in this run. Never end with `NEEDS_DECISION` for a pull request body or label."
  return `**Delivery.** Commit after each coherent piece.${pushRule} ${pullRequest} ${parity} The title and body pass the dash ban: write no em dash and no en dash. Add no attribution line (\`Co-Authored-By\`, \`Generated with\`) to a commit or a pull request body. Delete tracked files with \`git rm\` and other files with Node \`rmSync\`, never \`rm\`. Stage named paths only. Never merge and never force-push. ${writes}\n\n**PR Metadata.** ${metadata}`
}

/** The generic brief. It names no ticket, feature or screen: the ticket is the order, in the owner's words. */
export const renderBrief = ({ kind, place, ticket, pull = null }) => {
  if (!ORDER_KINDS.includes(kind)) throw new Error(`unknown order kind: ${kind}`)
  const reads = kind === "find"
  const pushes = pushesToOpenPull(kind, pull)
  const brief = `## Brief

**Place.** Repository \`${place.repoKey}\` at \`${place.repoPath}\`. Working tree \`${place.worktree}\`. Branch \`${place.branch}\` is checked out. Base branch \`${place.base}\`. Work in this repository only, and create no other branch.

**Order.** The ticket above is the order, in the owner's words. The section "This order" says which part of it you do now.

**Checks.** Judge each check by its exit code.
- Start Vitest with \`--run\` and a file name.
- The type check and the lint of each changed workspace.
${reads ? "" : "- Spend at most 25 minutes on verification. Report each command with its exit code.\n"}- Open no browser. Start no dev server. Run no production CLI.
- Never write a deployment barrier: \`.github/migration-contracts.json\` and \`.github/migration-locks.json\`.

**Decisions.** Nobody answers a question. Decide every choice with the recommended option. ${reads ? "Never wait on a prompt." : `Write the choice and its evidence in the ${pushes ? "commit message" : "pull request body"}. Never wait on a prompt. End with the line \`NEEDS_DECISION: <question>\` only for money, a change of model or effort, a change to a standing owner order, or an irreversible act in production.`}

**Copy.** Write copy with \`/humanizer\`. Then approve it with \`/second-opinion\`, run with the same \`--settings\` and environment as this session, inside your own turn.

${reads ? "**Delivery.** This is a read-only order. Change no file, make no commit and write nothing to GitHub." : deliverySection({ ticket, pushes })}

**Commands.** Keep each shell command plain. Never put \`$(\`, a backtick, \`eval\` or a variable in a path or a redirect. Search with the Grep tool. Write a longer check as a \`.mjs\` file in the system temporary directory and run it with \`node\`. Run no command that Claude Code holds for an approval.

**Report.** ${reads ? "Your final message is the area list and the findings table of \"This order\", with nothing after the table." : "Your final message is at most 12 lines: the verdict, the commit SHAs, each test command with its pass count, and the pull request URL."}
`
  if (Buffer.byteLength(brief) > BRIEF_LIMIT_BYTES) throw new Error(`the brief is ${Buffer.byteLength(brief)} bytes, over the ${BRIEF_LIMIT_BYTES} byte limit`)
  return brief
}

const assertFixInputs = ({ kind, pull, review, failure }) => {
  if ((kind === "fix" && (pull === null || !(review?.blocking?.length > 0))) || (kind === "ci-fix" && (pull === null || !(failure?.checks?.length > 0))) || (kind === "merge-forward" && pull === null)) {
    throw new Error(`a ${kind} order needs its pull request and what it fixes`)
  }
}

/**
 * The order text for a worker that resumes its own session. The session already holds the ticket, the parts and the brief,
 * so the text holds only the new findings. The first order and its brief still hold. One delivery rule changes: the worker pushes
 * to the branch of the open pull request and opens no other pull request. Every other rule of the brief holds.
 */
export const renderResumeOrder = ({ kind, pull, review = null, failure = null, ownerNote = null }) => {
  if (kind !== "fix" && kind !== "ci-fix" && kind !== "merge-forward") throw new Error(`a ${kind} order does not resume a session`)
  assertFixInputs({ kind, pull, review, failure })
  return `## This order (${kind}, resumed)\n\n${kindSection({ kind, pull, review, failure })}${ownerNote === null ? "" : `\n\n## Owner comment\n\nThe owner gave one more launch after the stop report, with this comment on the ticket.\n\n${trimmed(ownerNote)}`}\n\nYour first order and its brief still hold. One delivery rule changes: push to the branch of the open pull request and open no other pull request. Write the choice and its evidence in the commit message.\n`
}

/**
 * The order text for one worker. It holds the ticket body, the part comments (the full comment of the part it builds and
 * the first line of each other part), the comments that every order carries, the `findings` comments of an apply part, the
 * work of its kind, and the brief. A comment that a tool wrote never reaches the worker, except an owner order or a
 * decision, so a later part does not read an earlier launch again.
 */
export const renderOrder = ({ kind, ticket, comments = [], findings = [], pull = null, review = null, failure = null, history = [], changes = [], ownerNote = null, place, partNumber = null }) => {
  if (!ORDER_KINDS.includes(kind)) throw new Error(`unknown order kind: ${kind}`)
  if ((kind === "build part" || kind === "find") && !Number.isInteger(partNumber)) throw new Error(`a ${kind} order needs the number of its part`)
  assertFixInputs({ kind, pull, review, failure })
  if (kind === "apply-comment" && changes.length === 0) throw new Error("an apply-comment order needs the changes it applies")
  if ((kind === "build part" || kind === "find") && !ownerParts(comments).some((comment) => partOf(comment).number === partNumber)) {
    throw new Error(`the ticket has no comment for part ${partNumber}`)
  }
  const parts = kind === "build" ? "" : partSection(comments, partNumber)
  const partTotal = kind === "build part" ? partOf(ownerParts(comments).findLast((comment) => partOf(comment).number === partNumber)).total : null
  return `# ${ticket.title}\n\n${trimmed(ticket.body)}${parts}${commentSections(comments)}${findingsSection(findings)}\n\n---\n\n## This order (${kind})\n\n${kindSection({ kind, pull, review, failure, partNumber, partTotal, changes })}${earlierLaunchesSection(history)}${ownerNote === null ? "" : `\n\n## Owner comment\n\nThe owner gave one more launch after the stop report, with this comment on the ticket.\n\n${trimmed(ownerNote)}`}\n\n${renderBrief({ kind, place, ticket, pull })}`
}
