import { existsSync, readFileSync } from "node:fs"

import { T, check, githubIssueReadPlan, orcaEnv, run, stage } from "./_harness.mjs"

const TOOL = "update-ticket.mjs"

const LIVE_BODY = "Ticket body\n"
const LIVE_TITLE = "Ticket title"
const NEW_TITLE = "A corrected title"

const issue = () => JSON.stringify({
  blockedBy: { nodes: [], totalCount: 0 },
  blocking: { nodes: [], totalCount: 0 },
  body: LIVE_BODY,
  labels: [{ name: "repo:ui" }],
  number: 221,
  state: "OPEN",
  stateReason: null,
  title: LIVE_TITLE,
  url: "https://github.com/thomasluizon/orbit-tickets/issues/221",
})

const project = () => JSON.stringify({
  items: [{ content: { number: 221, repository: "thomasluizon/orbit-tickets", type: "Issue" }, id: "PVTI_update", status: "Todo" }],
  totalCount: 1,
})

/**
 * The arguments AFTER the subcommand, compared exactly. argv[0] is checked separately because node
 * resolves it to an absolute path, which differs per machine.
 */
const titleArgv = (title) => JSON.stringify(["edit", "221", "--repo", "thomasluizon/orbit-tickets", "--title", title])
const forwarded = (captureFile) => {
  const argv = JSON.parse(readFileSync(captureFile, "utf8"))
  return { subcommand: String(argv[0] ?? ""), rest: JSON.stringify(argv.slice(1)) }
}

const plan = (label) => {
  const bodyCapture = stage(`update-ticket/${label}-body.txt`, "unwritten")
  const editMarker = stage(`update-ticket/${label}-edit`, "pending")
  const titleMarker = stage(`update-ticket/${label}-title`, "pending")
  const titleCapture = stage(`update-ticket/${label}-title-argv.txt`, "unwritten")
  const statusMarker = stage(`update-ticket/${label}-status`, "must remain")
  const commentMarker = stage(`update-ticket/${label}-comment`, "must remain")
  const projectReadMarker = stage(`update-ticket/${label}-project-read`, "must remain")
  return {
    bodyCapture,
    editMarker,
    titleMarker,
    titleCapture,
    statusMarker,
    commentMarker,
    projectReadMarker,
    entries: [
      ...githubIssueReadPlan(issue()),
      { match: "project item-list 2 --owner thomasluizon", stdout: project(), removePath: projectReadMarker },
      { match: "issue edit 221 --repo thomasluizon/orbit-tickets --title", stdout: "", ignoreTicketShape: true, argvFile: titleCapture, removePath: titleMarker },
      { match: "issue edit 221 --repo thomasluizon/orbit-tickets", stdout: "", ignoreTicketShape: true, stdinFile: bodyCapture, removePath: editMarker },
      { match: "issue comment 221 --repo thomasluizon/orbit-tickets", stdout: "", ignoreTicketShape: true, removePath: commentMarker },
      { match: "project item-edit 2 --owner thomasluizon", stdout: "", ignoreTicketShape: true, removePath: statusMarker },
    ],
  }
}

export const cases = () => {
  check(TOOL, "refuses a missing issue reference", ["--body-file", "-", "--confirm-replace"], { status: 2, stderr: /--issue is required/ })
  check(TOOL, "refuses a call that names no field", ["--issue", "#221", "--confirm-replace"], { status: 2, stderr: /at least one of --body-file and --title is required/ })
  check(TOOL, "refuses --body-file with no path", ["--issue", "#221", "--body-file", "--confirm-replace"], { status: 2, stderr: /--body-file needs a path/ })
  check(TOOL, "refuses --title with no title", ["--issue", "#221", "--title"], { status: 2, stderr: /--title needs a title/ })
  /** A GitHub title is one line, so a newline is a quoting mistake that would otherwise reach the API. */
  check(TOOL, "refuses a multi-line title", ["--issue", "#221", "--title", "First line\nSecond line"], { status: 2, stderr: /must be one line/ })
  check(TOOL, "refuses a blank title", ["--issue", "#221", "--title", "   "], { status: 2, stderr: /the new title is empty/ })
  check(TOOL, "refuses an unknown migrated identifier", ["--issue", "ORB-999999", "--body-file", "-", "--confirm-replace"], { status: 2, stderr: /Unknown migrated ticket ORB-999999/ })

  const replacement = stage("update-ticket/replacement.md", "Ticket body\n\n## Delivery shape\n\nShip as ONE pull request.\n")
  /**
   * The overwrite destroys every omitted section, so an unflagged call must not reach GitHub at
   * all. This is the case that keeps --confirm-replace from decaying into decoration.
   */
  check(TOOL, "refuses to replace without --confirm-replace", ["--issue", "#221", "--body-file", replacement], { status: 2, stderr: /--confirm-replace is required/ })

  const empty = stage("update-ticket/empty.md", "   \n")
  check(TOOL, "refuses an empty body", ["--issue", "#221", "--body-file", empty, "--confirm-replace"], { status: 2, stderr: /the new body is empty/ })
  check(TOOL, "refuses an unreadable body file", ["--issue", "#221", "--body-file", `${empty}.absent`, "--confirm-replace"], { status: 2, stderr: /cannot read/ })

  const replaced = plan("replaced")
  check(TOOL, "replaces the body verbatim", ["--issue", "#221", "--body-file", replacement, "--confirm-replace"], { status: 0, stdout: /"changed": true/ }, { env: orcaEnv(replaced.entries) })
  T(`${TOOL}: the edit carried the file's exact bytes`, readFileSync(replaced.bodyCapture, "utf8") === readFileSync(replacement, "utf8"), readFileSync(replaced.bodyCapture, "utf8"))
  T(`${TOOL}: replacing the body edits the issue`, !existsSync(replaced.editMarker))
  /** Replacing a work order is not a lifecycle transition and not a conversation. Either write here would be unasked. */
  T(`${TOOL}: replacing the body never comments`, existsSync(replaced.commentMarker))
  T(`${TOOL}: replacing the body never touches board Status`, existsSync(replaced.statusMarker))
  T(`${TOOL}: replacing the body never touches the title`, existsSync(replaced.titleMarker))

  /**
   * An identical write is the retry case: a caller that re-runs after a network failure must not
   * churn the issue's edit history when nothing differs.
   */
  const identical = stage("update-ticket/identical.md", LIVE_BODY)
  const unchanged = plan("unchanged")
  check(TOOL, "reports an identical body as unchanged", ["--issue", "#221", "--body-file", identical, "--confirm-replace"], { status: 0, stdout: /"changed": false/ }, { env: orcaEnv(unchanged.entries) })
  T(`${TOOL}: an identical body performs no edit`, existsSync(unchanged.editMarker))

  /**
   * A title alone is a valid write, and it needs no --confirm-replace: that guard exists because a
   * partial body file silently deletes every section it omits, which a title typed in full cannot do.
   */
  /**
   * A title alone is a valid write, and it needs no --confirm-replace: that guard exists because a
   * partial body file silently deletes every section it omits, which a title typed in full cannot do.
   * The whole result is PARSED rather than pattern-matched, so a wrong field cannot hide behind a
   * fragment that happens to appear somewhere in the JSON.
   */
  const renamed = plan("renamed")
  const renamedRun = run(TOOL, ["--issue", "#221", "--title", NEW_TITLE], { env: orcaEnv(renamed.entries) })
  const renamedJson = JSON.parse(renamedRun.stdout || "{}")
  T(
    `${TOOL}: replaces the title alone`,
    renamedRun.status === 0 &&
      renamedJson.changed === true &&
      renamedJson.titleChanged === true &&
      renamedJson.bodyChanged === false &&
      renamedJson.title === NEW_TITLE &&
      renamedJson.bytesBefore === renamedJson.bytesAfter,
    `${renamedRun.status} ${renamedRun.stdout}${renamedRun.stderr}`,
  )
  T(`${TOOL}: replacing the title edits the issue`, !existsSync(renamed.titleMarker))
  /**
   * Every argument is compared, not searched. The stub matches by substring, so pinning the title
   * inside `match` cannot catch a value the tool appended to it: proven on 2026-08-25 by forwarding
   * `title + " WRONG"`, which left the whole gate green.
   */
  T(
    `${TOOL}: the title edit forwarded the exact new title`,
    forwarded(renamed.titleCapture).subcommand.endsWith("issue") && forwarded(renamed.titleCapture).rest === titleArgv(NEW_TITLE),
    readFileSync(renamed.titleCapture, "utf8"),
  )
  T(`${TOOL}: a title-only write never touches the body`, existsSync(renamed.editMarker))
  T(`${TOOL}: a title-only write leaves the body bytes unwritten`, readFileSync(renamed.bodyCapture, "utf8") === "unwritten")
  T(`${TOOL}: a title-only write never comments`, existsSync(renamed.commentMarker))
  T(`${TOOL}: a title-only write never touches board Status`, existsSync(renamed.statusMarker))

  /** The retry case, one field over: re-running after a network failure must not churn the history. */
  const sameTitle = plan("same-title")
  const sameTitleRun = run(TOOL, ["--issue", "#221", "--title", LIVE_TITLE], { env: orcaEnv(sameTitle.entries) })
  const sameTitleJson = JSON.parse(sameTitleRun.stdout || "{}")
  T(
    `${TOOL}: reports an identical title as unchanged`,
    sameTitleRun.status === 0 &&
      sameTitleJson.changed === false &&
      sameTitleJson.titleChanged === false &&
      sameTitleJson.bodyChanged === false &&
      sameTitleJson.title === LIVE_TITLE,
    `${sameTitleRun.status} ${sameTitleRun.stdout}${sameTitleRun.stderr}`,
  )
  T(`${TOOL}: an identical title performs no edit`, existsSync(sameTitle.titleMarker))

  const both = plan("both")
  const bothRun = run(TOOL, ["--issue", "#221", "--title", NEW_TITLE, "--body-file", replacement, "--confirm-replace"], { env: orcaEnv(both.entries) })
  const bothJson = JSON.parse(bothRun.stdout || "{}")
  T(
    `${TOOL}: replaces the title and the body in one call`,
    bothRun.status === 0 && bothJson.changed === true && bothJson.titleChanged === true && bothJson.bodyChanged === true && bothJson.title === NEW_TITLE,
    `${bothRun.status} ${bothRun.stdout}${bothRun.stderr}`,
  )
  T(`${TOOL}: a combined call edits the title`, !existsSync(both.titleMarker))
  T(
    `${TOOL}: a combined call forwarded the exact new title`,
    forwarded(both.titleCapture).subcommand.endsWith("issue") && forwarded(both.titleCapture).rest === titleArgv(NEW_TITLE),
    readFileSync(both.titleCapture, "utf8"),
  )
  T(`${TOOL}: a combined call edits the body`, !existsSync(both.editMarker))
  T(`${TOOL}: a combined call carries the file's exact bytes`, readFileSync(both.bodyCapture, "utf8") === readFileSync(replacement, "utf8"))

  /** The body guard must not decay just because a title rides along. */
  check(TOOL, "still refuses a body without --confirm-replace when a title is given", ["--issue", "#221", "--title", NEW_TITLE, "--body-file", replacement], { status: 2, stderr: /--confirm-replace is required/ })

  /** GitHub returns CRLF for a body submitted through the browser; a file on disk here is LF. */
  const crlf = stage("update-ticket/crlf.md", LIVE_BODY.replace(/\n/g, "\r\n"))
  const lineEndings = plan("line-endings")
  check(TOOL, "treats a CRLF twin of the live body as unchanged", ["--issue", "#221", "--body-file", crlf, "--confirm-replace"], { status: 0, stdout: /"changed": false/ }, { env: orcaEnv(lineEndings.entries) })
  T(`${TOOL}: a CRLF twin performs no edit`, existsSync(lineEndings.editMarker))
}
