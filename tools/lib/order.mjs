/** The delivery driver's work orders: the six kinds of order and the one generic brief that every worker reads. */

export const ORDER_KINDS = Object.freeze(["build", "build part", "fix", "ci-fix", "merge-forward", "find"])

/** The first line of an owner's part comment, with or without a leading `## `. */
const PART_HEADING = /^(## )?Part (\d+) of (\d+)\b/

const BRIEF_LIMIT_BYTES = 6000
const LOG_LINES_PER_CHECK = 60

const firstLineOf = (text) => text.split("\n", 1)[0]

/** The part numbers and total that a comment announces, or null when the comment is not a part comment. */
export const partOf = (comment) => {
  const match = PART_HEADING.exec(firstLineOf(comment.body))
  return match ? { number: Number(match[2]), total: Number(match[3]) } : null
}

/** The part comments of a ticket, oldest first. A comment of the driver starts with its hidden marker, so it never reads as a part. */
const ownerParts = (comments) => comments.filter((comment) => partOf(comment) !== null)

const trimmed = (text) => text.replace(/\s*$/, "")

/** The heading of a part comment as a list item or a section title, without a leading `## `. */
const headingOf = (comment) => firstLineOf(comment.body).replace(/^## /, "")

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

const instanceList = (review) =>
  review.blocking.map((finding) => `- ${finding.path === null ? "the review body" : `${finding.path}:${finding.line}`}\n\n${trimmed(finding.body).split("\n").map((line) => `  ${line}`).join("\n")}`).join("\n\n")

const checkSection = (check) => {
  const steps = check.failedSteps?.length > 0 ? ` (failed steps: ${check.failedSteps.join(", ")})` : ""
  const lines = (check.logLines ?? []).slice(-LOG_LINES_PER_CHECK)
  return `### ${check.name}${steps}${lines.length === 0 ? "" : `\n\n\`\`\`\n${lines.join("\n")}\n\`\`\``}`
}

/** The part of the order that belongs to one kind: what to do first and what to fix. */
const kindSection = ({ kind, pull, review, failure, partNumber }) => {
  switch (kind) {
    case "build":
      return "Build the ticket. Rebase on `origin/main` before the first push."
    case "build part":
      return `Build Part ${partNumber} of this ticket and no other part. Rebase on \`origin/main\` before the first push.`
    case "fix":
      return `The pull request ${pull.number} has the head \`${pull.headSha}\`. Its latest review blocks the merge with the classes below. Each class lists every instance.\n\n${instanceList(review)}\n\nFix every instance of every class in one commit. Write one table test per class, and run it red before the fix. Change no line that the classes do not need. Run the focused tests, the type check and the lint. Merge \`origin/main\`. Push once.`
    case "ci-fix":
      return `The pull request ${pull.number} has the head \`${pull.headSha}\`. These checks failed.\n\n${failure.checks.map(checkSection).join("\n\n")}\n\nFix the cause. Merge \`origin/main\`. Push once.`
    case "merge-forward":
      return `The pull request ${pull.number} has the head \`${pull.headSha}\`. It conflicts with \`origin/main\`${failure?.conflicts?.length > 0 ? ` in: ${failure.conflicts.join(", ")}` : ""}. Merge \`origin/main\` into the branch and resolve the conflicts. Run the focused checks. Push once.`
    case "find":
      return `Read only the slice that the part names. Your final message is the area list, then the findings table with one row per finding as \`path:line | class | fix\`, and nothing after the table. Commit nothing, push nothing and open no pull request.`
    default:
      throw new Error(`unknown order kind: ${kind}`)
  }
}

/** A fix, ci-fix or merge-forward order pushes to the branch of an open pull request and opens none. */
const pushesToOpenPull = (kind) => kind === "fix" || kind === "ci-fix" || kind === "merge-forward"

/** The delivery rules. A find order has no delivery, so it does not get them. */
const deliverySection = ({ ticket, kind }) => {
  const repository = ticket.repository
  const pushes = pushesToOpenPull(kind)
  const pullRequest = pushes
    ? "Push to the branch of the open pull request. Open no other pull request."
    : `Open one non-draft pull request with \`gh pr create\`. The body holds \`Tracks ${repository}#${ticket.number}\` (never \`Closes\`), \`## Assumptions\`, \`## Manual steps\`, \`## Test evidence\` and a \`Remaining:\` line. The line says \`Remaining: none\`, or lists the parts that stay open.`
  return `**Delivery.** Commit after each coherent piece. ${pullRequest} The title and body pass the dash ban: write no em dash and no en dash. Add no attribution line (\`Co-Authored-By\`, \`Generated with\`) to a commit or a pull request body. Delete tracked files with \`git rm\` and other files with Node \`rmSync\`, never \`rm\`. Stage named paths only. Never merge, never force-push, never \`--no-verify\`. Write to GitHub only with ${pushes ? "`git push`" : "`git push` and `gh pr create`"}.`
}

/** The generic brief. It names no ticket, feature or screen: the ticket is the order, in the owner's words. */
export const renderBrief = ({ kind, place, ticket }) => {
  if (!ORDER_KINDS.includes(kind)) throw new Error(`unknown order kind: ${kind}`)
  const reads = kind === "find"
  const pushes = pushesToOpenPull(kind)
  const brief = `## Brief

**Place.** Repository \`${place.repoKey}\` at \`${place.repoPath}\`. Working tree \`${place.worktree}\`. Branch \`${place.branch}\` is checked out. Base branch \`${place.base}\`. Work in this repository only, and create no other branch.

**Order.** The ticket above is the order, in the owner's words. The section "This order" says which part of it you do now.

**Checks.** Run only the focused checks of your change. CI runs every full suite. Judge each check by its exit code.
- Vitest: \`npx vitest related <changed source files> --run\` in each changed workspace. Never start Vitest without a file name.
- Tools: \`node tools/test-tools.mjs --only <case module>\` for each case module that covers a changed tool or reads a changed file. Never run the complete tools suite.
- The type check and the lint of each changed workspace.
${reads ? "" : "- Spend at most 25 minutes on verification. Report each command with its exit code.\n"}- Open no browser. Start no dev server. Run no production CLI.
- Never write a deployment barrier: \`.github/migration-contracts.json\` and \`.github/migration-locks.json\`.

**Decisions.** Nobody answers a question. Decide every choice with the recommended option. ${reads ? "Never wait on a prompt." : `Write the choice and its evidence in the ${pushes ? "commit message" : "pull request body"}. Never wait on a prompt. End with the line \`NEEDS_DECISION: <question>\` only for money, a change of model or effort, a change to a standing owner order, or an irreversible act in production.`}

**Copy.** Write copy against \`BRAND.md\` with \`/humanizer\`. Then approve it with \`/second-opinion\`, run with the same \`--settings\` and environment as this session, inside your own turn.

${reads ? "**Delivery.** This is a read-only order. Change no file, make no commit and write nothing to GitHub." : deliverySection({ ticket, kind })}

**Commands.** Keep each shell command plain. Never put \`$(\`, a backtick, \`eval\` or a variable in a path or a redirect. Search with the Grep tool. Write a longer check as a \`.mjs\` file in the system temporary directory and run it with \`node\`. Run no command that Claude Code holds for an approval.

**Report.** ${reads ? "Your final message is the area list and the findings table of \"This order\", with nothing after the table." : "Your final message is at most 12 lines: the verdict, the commit SHAs, each test command with its pass count, and the pull request URL."}
`
  if (Buffer.byteLength(brief) > BRIEF_LIMIT_BYTES) throw new Error(`the brief is ${Buffer.byteLength(brief)} bytes, over the ${BRIEF_LIMIT_BYTES} byte limit`)
  return brief
}

/**
 * The order text for one worker. It holds the ticket body, the owner's part comments (the full comment of the
 * part it builds and the first line of each other part), the `findings` comments of an apply part, the work of its kind, and the brief.
 * Another comment of the driver never reaches the worker, so a later part does not read an earlier launch again.
 */
export const renderOrder = ({ kind, ticket, partComments = [], findings = [], pull = null, review = null, failure = null, ownerNote = null, place, partNumber = null }) => {
  if (!ORDER_KINDS.includes(kind)) throw new Error(`unknown order kind: ${kind}`)
  if ((kind === "build part" || kind === "find") && !Number.isInteger(partNumber)) throw new Error(`a ${kind} order needs the number of its part`)
  if ((kind === "fix" && (pull === null || !(review?.blocking?.length > 0))) || (kind === "ci-fix" && (pull === null || !(failure?.checks?.length > 0))) || (kind === "merge-forward" && pull === null)) {
    throw new Error(`a ${kind} order needs its pull request and what it fixes`)
  }
  if ((kind === "build part" || kind === "find") && !ownerParts(partComments).some((comment) => partOf(comment).number === partNumber)) {
    throw new Error(`the ticket has no comment for part ${partNumber}`)
  }
  const parts = kind === "build" ? "" : partSection(partComments, partNumber)
  return `# ${ticket.title}\n\n${trimmed(ticket.body)}${parts}${findingsSection(findings)}\n\n---\n\n## This order (${kind})\n\n${kindSection({ kind, pull, review, failure, partNumber })}${ownerNote === null ? "" : `\n\n## Owner comment\n\nThe owner gave one more launch after the cap, with this comment on the ticket.\n\n${trimmed(ownerNote)}`}\n\n${renderBrief({ kind, place, ticket })}`
}
