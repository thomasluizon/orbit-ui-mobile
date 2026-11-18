import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { alertCheck, dismissAlert, githubPageReader, listedWakeKeys, listOpenAlerts, listOpenPullRequests, markItem, PULL_REQUEST_CLASSES, pendingItems, pullRequestCheck,
  pullRequestClass, recordClosedTicketPullRequests, recordListing, runPullRequestKeys, unexpectedAuthor, unreportedPullRequests } from "../lib/auto-work-github.mjs"
import { evaluateChecks } from "../lib/auto-work-wake.mjs"
import { readRunState, writeRunState } from "../lib/run-state.mjs"
import { T, TOOLS_DIR, root } from "./_harness.mjs"

const REPOSITORIES = [{ key: "ui", slug: "thomasluizon/orbit-ui-mobile" }, { key: "api", slug: "thomasluizon/orbit-api" },
  { key: "landing", slug: "thomasluizon/orbit-landing-page" }]
const TICKET = "https://github.com/thomasluizon/orbit-tickets/issues/2149"
/** The commit of the newest code scanning analysis of orbit-api main, from a live read of code-scanning/analyses?ref=refs/heads/main&per_page=1. */
export const API_SCAN_COMMIT = "38513551ad4eb24eb93a8c7bc33891a4920bce89"

/*
 * Each item is a live projection of a real REST response. OWNER_PULL (ui#2473) is an open owner pull request; the other pull requests and the
 * alerts are closed ones, read with their state filter removed.
 */
export const DEPENDABOT_PULL = { number: 1106, author: "dependabot[bot]", authorType: "Bot", head: "1eb7c13b62064064a60a3589eff1b1812f39190e",
  branch: "dependabot/nuget/src/Orbit.Infrastructure/System.Formats.Cbor-10.0.15", base: "main", draft: false, title: "Bump System.Formats.Cbor from 10.0.14 to 10.0.15", url: "https://github.com/thomasluizon/orbit-api/pull/1106" }
const OWNER_PULL = { number: 2473, author: "thomasluizon", authorType: "User", head: "859e0638209bff39521cb381642f00d203f75116", branch: "fix/ticket-2144-icon-eyes", base: "main", draft: false,
  title: "fix(brand): draw every app icon as the mascot with its eyes (#2144)", url: "https://github.com/thomasluizon/orbit-ui-mobile/pull/2473" }
/** An owner pull request that no entry of the current run names, so an earlier run opened it. */
const EARLIER_OWNER_PULL = { number: 1115, author: "thomasluizon", authorType: "User", head: "fcfcc2d215a0eca16b43935efd77635bec167183", branch: "fix/ticket-2074-timeless-loop", base: "main", draft: false,
  title: "test: run the cross-repository timeless hook test once and give each fixture value and helper one name", url: "https://github.com/thomasluizon/orbit-api/pull/1115" }
const CONTRACT_PULL = { number: 2462, author: "orbit-contract-rebaseline[bot]", authorType: "Bot", head: "1fe4df96f28dedab74f55c6b285a7bc956116bfb", branch: "chore/contract-snapshot", base: "main", draft: false,
  title: "Update pinned API contract snapshot", url: "https://github.com/thomasluizon/orbit-ui-mobile/pull/2462" }
/** A pull request from an account that no repository configures to open pull requests. */
export const UNEXPECTED_PULL = { number: 20, author: "bellaFG", authorType: "User", head: "8edde4aebbb2f26a21a0c83b2b4d986e1e2757e2", branch: "fix/mobile-ring-centering", base: "main", draft: false,
  title: "fix: center orbital rings over hero title on mobile", url: "https://github.com/thomasluizon/orbit-landing-page/pull/20" }
export const CODE_SCANNING_ALERT = { line: 84, message: "Cookie attribute 'Secure' is not set to true.\nCookie attribute 'Secure' is not set to true.", number: 28,
  path: "tests/Orbit.Infrastructure.Tests/Controllers/OAuthControllerTests.CookiePolicy.cs", rule: "cs/web/cookie-secure-not-set", severity: "medium", tool: "CodeQL",
  url: "https://github.com/thomasluizon/orbit-api/security/code-scanning/28" }
export const DEPENDABOT_ALERT = { message: "hono: Hono: `csrf()` does not check requests sent by hyperlink auditing (`text/ping`)", number: 186, path: "evals/astra/package-lock.json",
  rule: "GHSA-46wx-v44x-9hh2", severity: "medium", tool: "npm", url: "https://github.com/thomasluizon/orbit-ui-mobile/security/dependabot/186" }
/** Two cursor pages of ui Dependabot alerts at per_page=2, each line the live output of the Dependabot projection for that page. */
const DEPENDABOT_PAGES = [[DEPENDABOT_ALERT,
  { message: "hono: Hono: `mount()` and `app.mount()` can forward a path that bypasses middleware scoped inside the mount prefix", number: 185, path: "evals/astra/package-lock.json",
    rule: "GHSA-4m76-xfj5-7975", severity: "medium", tool: "npm", url: "https://github.com/thomasluizon/orbit-ui-mobile/security/dependabot/185" }],
[{ message: "hono: Hono: `css` helper does not escape a closing tag split between the template and an interpolated value, allowing HTML injection", number: 184,
  path: "evals/astra/package-lock.json", rule: "GHSA-3gg2-335m-rxc6", severity: "low", tool: "npm", url: "https://github.com/thomasluizon/orbit-ui-mobile/security/dependabot/184" },
{ message: "hono: Hono: `validator('form')` skips validation for `multipart/form-data` requests with extra parameters", number: 183, path: "evals/astra/package-lock.json",
  rule: "GHSA-4h7h-rv7c-7m2v", severity: "medium", tool: "npm", url: "https://github.com/thomasluizon/orbit-ui-mobile/security/dependabot/183" }]]
/** The gh failure line for a missing resource, copied from a live read. */
export const NOT_FOUND = "gh: Not Found (HTTP 404)"

const fakeReader = (answers) => {
  const calls = []
  const readPages = async (path, projection) => {
    calls.push({ path, projection })
    const answer = Object.entries(answers).find(([prefix]) => path.startsWith(prefix))?.[1] ?? []
    if (typeof answer === "string") throw new Error(`GitHub read failed at ${path}: ${answer}`)
    return answer
  }
  return { readPages, calls }
}

const fresh = (label, state = {}) => {
  const checkout = join(root, "auto-work-github", label)
  mkdirSync(join(checkout, ".git"), { recursive: true })
  writeRunState({ sessionId: "github", sleep: true, autoWork: true, remaining: [], ...state }, checkout)
  return checkout
}

const refusal = (change) => { try { change(); return "" } catch (error) { return error.message } }

const listingCases = async () => {
  const pulls = fakeReader({ "repos/thomasluizon/orbit-api/pulls": [DEPENDABOT_PULL, EARLIER_OWNER_PULL], "repos/thomasluizon/orbit-ui-mobile/pulls": [OWNER_PULL, CONTRACT_PULL],
    "repos/thomasluizon/orbit-landing-page/pulls": [UNEXPECTED_PULL] })
  const pullListing = await listOpenPullRequests({ repositories: REPOSITORIES, readPages: pulls.readPages })
  T("github: every repository is read for open pull requests of every author", JSON.stringify(pulls.calls.map((call) => call.path)) === JSON.stringify([
    "repos/thomasluizon/orbit-ui-mobile/pulls?state=open&per_page=100", "repos/thomasluizon/orbit-api/pulls?state=open&per_page=100",
    "repos/thomasluizon/orbit-landing-page/pulls?state=open&per_page=100"]) && !pulls.calls[0].path.includes("creator"), JSON.stringify(pulls.calls))
  T("github: a pull request key is the repository key and number", JSON.stringify(pullListing.items.map((pull) => pull.key)) ===
    JSON.stringify(["ui#2473", "ui#2462", "api#1106", "api#1115", "landing#20"]) && pullListing.items[2].author === "dependabot[bot]" && pullListing.failures.length === 0,
  JSON.stringify(pullListing))
  T("github: only an author outside the configured bots and the repository owner is unexpected", JSON.stringify(pullListing.items.map((pull) => [pull.key, pull.unexpectedAuthor])) ===
    JSON.stringify([["ui#2473", false], ["ui#2462", false], ["api#1106", false], ["api#1115", false], ["landing#20", true]]), JSON.stringify(pullListing.items))
  T("github: a bot configured in one repository is unexpected in another", !unexpectedAuthor(REPOSITORIES[0], CONTRACT_PULL.author) &&
    unexpectedAuthor(REPOSITORIES[2], CONTRACT_PULL.author) && REPOSITORIES.every((repository) => !unexpectedAuthor(repository, "dependabot[bot]")))

  const alerts = fakeReader({ "repos/thomasluizon/orbit-api/code-scanning": [CODE_SCANNING_ALERT], "repos/thomasluizon/orbit-ui-mobile/dependabot": [DEPENDABOT_ALERT],
    "repos/thomasluizon/orbit-landing-page/secret-scanning": NOT_FOUND })
  const alertListing = await listOpenAlerts({ repositories: REPOSITORIES, readPages: alerts.readPages })
  T("github: code scanning, secret scanning and Dependabot are read for open alerts in all three repositories", alerts.calls.length === 9 &&
    ["code-scanning", "secret-scanning", "dependabot"].every((kind) => alerts.calls.filter((call) => call.path.includes(`/${kind}/alerts?state=open&per_page=100`)).length === 3),
  JSON.stringify(alerts.calls.map((call) => call.path)))
  T("github: the secret scanning read hides the secret and never projects it", alerts.calls.filter((call) => call.path.includes("secret-scanning"))
    .every((call) => call.path.endsWith("&hide_secret=true") && !/\.secret\b/.test(call.projection)))
  const codeAlert = alertListing.items.find((alert) => alert.key === "api code-scanning 28")
  T("github: an alert keeps its id, rule, file and line, and the first message line", codeAlert?.rule === "cs/web/cookie-secure-not-set" &&
    codeAlert.path.endsWith("CookiePolicy.cs") && codeAlert.line === 84 && codeAlert.message === "Cookie attribute 'Secure' is not set to true.", JSON.stringify(codeAlert))
  T("github: a failed alert read is named and never an empty list", JSON.stringify(alertListing.failures) === JSON.stringify([{ read: "landing secret-scanning",
    message: `GitHub read failed at repos/thomasluizon/orbit-landing-page/secret-scanning/alerts?state=open&per_page=100&hide_secret=true: ${NOT_FOUND}` }]) &&
    alertListing.items.length === 2, JSON.stringify(alertListing))
  return { pullListing, alertListing }
}

const readerCases = async () => {
  const checkout = join(root, "auto-work-github", "reader")
  mkdirSync(checkout, { recursive: true })
  spawnSync("git", ["-C", checkout, "init", "-q"])
  spawnSync("git", ["-C", checkout, "remote", "add", "origin", "https://github.com/thomasluizon/orbit-ui-mobile.git"])
  const gh = join(checkout, "gh")
  writeFileSync(gh, `#!/bin/sh\ncase "$*" in "auth token --user thomasluizon") echo token-2149;; esac\n`)
  chmodSync(gh, 0o755)
  const previous = process.env.GH_BIN
  process.env.GH_BIN = gh
  try {
    const calls = []
    const config = { repos: { ui: "." }, timeouts: { gitRemoteSeconds: 7 } }
    let answer = { status: 0, stdout: `${JSON.stringify(DEPENDABOT_PULL)}\n${JSON.stringify(OWNER_PULL)}\n`, stderr: "" }
    const read = githubPageReader({ config, repoRoot: checkout, run: async (file, args, options) => { calls.push({ file, args, options }); return answer } })
    const items = await read("repos/thomasluizon/orbit-api/pulls?state=open&per_page=100", ".[] | tojson")
    T("github: the reader paginates every page with the owner token and parses one item per line", items.length === 2 && items[0].number === 1106 &&
      JSON.stringify(calls[0].args) === JSON.stringify(["api", "--paginate", "repos/thomasluizon/orbit-api/pulls?state=open&per_page=100", "--jq", ".[] | tojson"]) &&
      calls[0].options.env.GH_TOKEN === "token-2149" && calls[0].options.timeoutMs === 7000, JSON.stringify(calls))
    answer = { status: 1, stdout: "{\"message\":\"Not Found\",\"status\":\"404\"}", stderr: `${NOT_FOUND}\n` }
    let message = ""
    try { await read("repos/thomasluizon/orbit-api/code-scanning/alerts?state=open&per_page=100", ".[]") } catch (error) { message = error.message }
    T("github: a failed page read names the path and the last gh line", message === `GitHub read failed at repos/thomasluizon/orbit-api/code-scanning/alerts?state=open&per_page=100: ${NOT_FOUND}`, message)

    /* gh prints the projection of each page in order with --paginate, and only the first page without it. */
    const pages = DEPENDABOT_PAGES.map((page, index) => {
      const file = join(checkout, `page-${index + 1}.jsonl`)
      writeFileSync(file, page.map((alert) => `${JSON.stringify(alert)}\n`).join(""))
      return file
    })
    writeFileSync(gh, `#!/bin/sh
case "$*" in
  "auth token --user thomasluizon") echo token-2149;;
  "api --paginate "*) cat "${pages[0]}" "${pages[1]}";;
  "api "*) cat "${pages[0]}";;
  *) exit 1;;
esac
`)
    const paged = await githubPageReader({ config, repoRoot: checkout })("repos/thomasluizon/orbit-ui-mobile/dependabot/alerts?state=open&per_page=2", ".[] | tojson")
    T("github: the reader returns the items of both pages in order", JSON.stringify(paged.map((alert) => alert.number)) === JSON.stringify([186, 185, 184, 183]) &&
      JSON.stringify(paged) === JSON.stringify(DEPENDABOT_PAGES.flat()), JSON.stringify(paged.map((alert) => alert.number)))
  } finally {
    if (previous === undefined) delete process.env.GH_BIN
    else process.env.GH_BIN = previous
  }
}

const stateCases = async ({ pullListing, alertListing }) => {
  const checkout = fresh("state", { pullRequests: [{ repositoryKey: "ui", prNumber: 2473, receiptPath: "receipt.json" }] })
  const pulls = recordListing("pullRequests", pullListing, checkout, "2026-11-16T12:00:00.000Z")
  T("github: the listing persists in intake.pullRequests and reads back", JSON.stringify(readRunState(checkout).intake.pullRequests) === JSON.stringify(pulls) &&
    pulls.listedAt === "2026-11-16T12:00:00.000Z")
  T("github: a pull request the run opened is marked run owned and is not pending", pulls.open["ui#2473"].runOwned === true &&
    !pendingItems("pullRequests", pulls).some((pull) => pull.key === "ui#2473"))
  T("github: the configured bots and an owner pull request from an earlier run are pending", pulls.open["api#1115"].runOwned === false &&
    JSON.stringify(pendingItems("pullRequests", pulls).map((pull) => pull.key)) === JSON.stringify(["ui#2462", "api#1106", "api#1115"]))
  T("github: a pull request from an unexpected author is never pending and waits for its report",
    JSON.stringify(unreportedPullRequests(pulls).map((pull) => pull.key)) === JSON.stringify(["landing#20"]))
  T("github: a pull request from an unexpected author is never merged, fixed or closed", ["merged", "closed", "fix"].every((action) =>
    refusal(() => markItem("pullRequests", { key: "landing#20", head: UNEXPECTED_PULL.head, action, ticket: TICKET, reason: "Superseded." }, checkout)) ===
    "a pull request from an unexpected author is never merged, fixed or closed; report it to the owner"))
  T("github: only a pull request from an unexpected author or with closed tickets is reported", refusal(() => markItem("pullRequests", { key: "api#1106", head: DEPENDABOT_PULL.head,
    action: "reported" }, checkout)) === "only a pull request from an unexpected author or with closed tickets is reported")
  const reported = markItem("pullRequests", { key: "landing#20", head: UNEXPECTED_PULL.head, action: "reported" }, checkout)
  T("github: a reported pull request from an unexpected author is not reported again", unreportedPullRequests(reported).length === 0 &&
    readRunState(checkout).intake.pullRequests.marks["landing#20"].action === "reported")

  T("github: a fix mark needs its carrying ticket", refusal(() => markItem("pullRequests", { key: "api#1106", head: DEPENDABOT_PULL.head, action: "fix" }, checkout)) ===
    "a fix needs its carrying ticket")
  T("github: a close mark needs the written reason", refusal(() => markItem("pullRequests", { key: "api#1106", head: DEPENDABOT_PULL.head, action: "closed" }, checkout)) ===
    "a closed pull request needs the written reason")
  T("github: a mark at an old head is refused", refusal(() => markItem("pullRequests", { key: "api#1106", head: "old", action: "merged" }, checkout))
    .startsWith("The receipt head is not the current head"))
  T("github: an unknown item or action is refused", refusal(() => markItem("pullRequests", { key: "api#1", head: "x", action: "merged" }, checkout)) ===
    "No open pullRequests item matches the receipt key" &&
    refusal(() => markItem("pullRequests", { key: "api#1106", head: DEPENDABOT_PULL.head, action: "dismissed" }, checkout)).startsWith("Unknown pullRequests action"))
  const marked = markItem("pullRequests", { key: "api#1106", head: DEPENDABOT_PULL.head, action: "fix", ticket: TICKET }, checkout)
  T("github: a fix mark at the current head persists and clears the pending item", readRunState(checkout).intake.pullRequests.marks["api#1106"].ticket === TICKET &&
    !pendingItems("pullRequests", marked).some((pull) => pull.key === "api#1106"))
  const moved = recordListing("pullRequests", { ...pullListing, items: pullListing.items.map((pull) => ["api#1106", "landing#20"].includes(pull.key) ? { ...pull, head: "a".repeat(40) } : pull) }, checkout)
  T("github: a new head on a marked pull request makes it pending again", pendingItems("pullRequests", moved).some((pull) => pull.key === "api#1106") &&
    moved.marks["api#1106"].head === DEPENDABOT_PULL.head)
  T("github: a new head on a reported pull request from an unexpected author asks nothing again", unreportedPullRequests(moved).length === 0 &&
    !pendingItems("pullRequests", moved).some((pull) => pull.key === "landing#20"))
  const failed = recordListing("pullRequests", { items: [], reads: pullListing.reads, failures: [{ read: "api pulls", message: NOT_FOUND }] }, checkout)
  T("github: a failed read keeps its previous items and marks and names the failure", failed.open["api#1106"] !== undefined && failed.marks["api#1106"] !== undefined &&
    failed.open["ui#2473"] === undefined && failed.failures[0].read === "api pulls", JSON.stringify(failed))
  const closed = recordListing("pullRequests", { items: [], reads: pullListing.reads, failures: [] }, checkout)
  T("github: a pull request that is no longer open leaves the listing and its mark", Object.keys(closed.open).length === 0 && Object.keys(closed.marks).length === 0 &&
    closed.failures === undefined)

  const alerts = recordListing("alerts", alertListing, checkout)
  T("github: the alert listing persists in intake.alerts beside the pull requests", JSON.stringify(readRunState(checkout).intake.alerts) === JSON.stringify(alerts) &&
    pendingItems("alerts", alerts).length === 2 && readRunState(checkout).intake.pullRequests !== undefined)
  T("github: an alert mark needs its ticket and the verified cause", refusal(() => markItem("alerts", { key: "api code-scanning 28", action: "ticket", ticket: TICKET }, checkout)) ===
    "an alert needs its carrying ticket and the verified cause")
  T("github: a mark never dismisses an alert", refusal(() => markItem("alerts", { key: "api code-scanning 28", action: "dismissed", ticket: TICKET }, checkout))
    .startsWith("Unknown alerts action") &&
    refusal(() => markItem("alerts", { key: "api code-scanning 28", action: "false-positive", ticket: TICKET, reason: "Test fixture." }, checkout)) ===
    "a false positive is recorded only by --dismiss, which dismisses the alert first")
  const writes = []
  let dismissal = ""
  try {
    await dismissAlert({ key: "api code-scanning 28", ticket: TICKET }, { repositories: REPOSITORIES, write: async (...call) => { writes.push(call) }, repoRoot: checkout })
  } catch (error) { dismissal = error.message }
  T("github: a dismissal without the written analysis is refused before any GitHub write", dismissal === "a false positive needs the ticket that holds the analysis and the reason" &&
    writes.length === 0, `${dismissal} ${JSON.stringify(writes)}`)
  const ticketed = markItem("alerts", { key: "api code-scanning 28", action: "ticket", ticket: TICKET, cause: "The test fixture sets Secure false on purpose." }, checkout)
  T("github: an alert mark keeps the rule, the file and line, the ticket and the cause", JSON.stringify({ ...ticketed.marks["api code-scanning 28"], markedAt: undefined }) ===
    JSON.stringify({ action: "ticket", rule: "cs/web/cookie-secure-not-set", location: "tests/Orbit.Infrastructure.Tests/Controllers/OAuthControllerTests.CookiePolicy.cs:84",
      ticket: TICKET, cause: "The test fixture sets Secure false on purpose." }), JSON.stringify(ticketed.marks))
  T("github: the waiter seeds its keys from the last listing without run owned pull requests", JSON.stringify(listedWakeKeys(readRunState(checkout).intake)) ===
    JSON.stringify({ pullRequests: [], alerts: ["ui dependabot 186", "api code-scanning 28"] }), JSON.stringify(listedWakeKeys(readRunState(checkout).intake)))
  writeRunState({ ...readRunState(checkout), sessionId: "child", relay: { from: "github" } }, checkout)
  T("github: a relay carries the pull request and alert marks", readRunState(checkout).intake.alerts.marks["api code-scanning 28"].ticket === TICKET)
  T("github: the run pull request keys come from the pull request entries and the readiness ledger",
    JSON.stringify([...runPullRequestKeys({ pullRequests: [{ repositoryKey: "ui", prNumber: 1 }], readinessLedger: [{ repositoryKey: "api", prNumber: 2 }, { prNumber: 3 }] })]) ===
    JSON.stringify(["ui#1", "api#2"]) && runPullRequestKeys(null).size === 0)
}

/** The live run state names #2144 in remaining and has no pull request entry for its open pull request ui#2473. */
const ownershipCases = async ({ pullListing }) => {
  const checkout = fresh("ownership", { remaining: ["#2144", "#2149"] })
  const pulls = recordListing("pullRequests", pullListing, checkout)
  T("github: an owner pull request whose branch names an in-flight ticket is run owned and not pending", pulls.open["ui#2473"]?.runOwned === true &&
    !pendingItems("pullRequests", pulls).some((pull) => pull.key === "ui#2473"), JSON.stringify(pulls.open["ui#2473"]))
  T("github: an owner pull request of a ticket outside remaining stays pending", pulls.open["api#1115"]?.runOwned === false &&
    pendingItems("pullRequests", pulls).some((pull) => pull.key === "api#1115"))
  const renamed = recordListing("pullRequests", { ...pullListing, items: pullListing.items.map((pull) => pull.key === "ui#2473" ? { ...pull, branch: "fix/icon-eyes" } : pull) }, checkout)
  T("github: an owner pull request whose title alone names an in-flight ticket is run owned", renamed.open["ui#2473"]?.runOwned === true, JSON.stringify(renamed.open["ui#2473"]))
  const borrowed = recordListing("pullRequests", { ...pullListing, items: pullListing.items.map((pull) => pull.key === "api#1106"
    ? { ...pull, branch: "fix/ticket-2144-bump", title: `${pull.title} (#2144)` } : pull) }, checkout)
  T("github: a bot pull request never becomes run owned through a ticket reference", borrowed.open["api#1106"]?.runOwned === false &&
    pendingItems("pullRequests", borrowed).some((pull) => pull.key === "api#1106"))
  const keys = await pullRequestCheck({ list: async () => pullListing, readState: () => readRunState(checkout) })()
  T("github: the waiter skips an owner pull request of an in-flight ticket", JSON.stringify(keys.keys) ===
    JSON.stringify([`ui#2462 ${CONTRACT_PULL.head}`, `api#1106 ${DEPENDABOT_PULL.head}`, `api#1115 ${EARLIER_OWNER_PULL.head}`, "landing#20"]), JSON.stringify(keys))
}

/** Open ticket #33 is the migrated ORB-27 (.claude/linear-to-github-map.json), so remaining can name it either way, and so can a branch or a title. */
const migratedOwnershipCases = async ({ pullListing }) => {
  const migrated = [{ ...OWNER_PULL, number: 5, head: "5".repeat(40), branch: "fix/ticket-33-migrated", title: "docs: record the demo clips (#33)" },
    { ...OWNER_PULL, number: 6, head: "6".repeat(40), branch: "fix/orb-27-migrated", title: "docs: record the demo clips (ORB-27)" },
    { ...OWNER_PULL, number: 7, head: "7".repeat(40), branch: "fix/orb-99999-unknown", title: "docs: a name outside the migration map (ORB-99999)" }]
  const listing = { ...pullListing, items: [...pullListing.items, ...(await listOpenPullRequests({ repositories: REPOSITORIES,
    readPages: fakeReader({ "repos/thomasluizon/orbit-ui-mobile/pulls": migrated }).readPages })).items] }
  for (const name of ["#33", "ORB-27"]) {
    const checkout = fresh(`migrated-${name.replace("#", "")}`, { remaining: ["#2144", "#2149", name] })
    const pulls = recordListing("pullRequests", listing, checkout)
    T(`github: with ${name} in remaining, the #33 and the ORB-27 owner pull requests are both run owned`, pulls.open["ui#5"]?.runOwned === true &&
      pulls.open["ui#6"]?.runOwned === true && !pendingItems("pullRequests", pulls).some((pull) => ["ui#5", "ui#6"].includes(pull.key)), JSON.stringify([pulls.open["ui#5"], pulls.open["ui#6"]]))
    T(`github: with ${name} in remaining, an ORB-N outside the migration map names no ticket and stays pending`, pulls.open["ui#7"]?.runOwned === false &&
      pendingItems("pullRequests", pulls).some((pull) => pull.key === "ui#7"))
  }
}

/** The run records bot pull requests too (the live run state records Dependabot api#1106), but only an owner pull request is ever the run's own. */
const recordedAuthorCases = async ({ pullListing }) => {
  const checkout = fresh("recorded-authors", { remaining: ["#2144"], pullRequests: [{ repositoryKey: "api", prNumber: 1106 }, { repositoryKey: "landing", prNumber: 20 }],
    readinessLedger: [{ repositoryKey: "ui", prNumber: 2462, receiptPath: "receipt-2462.json" }] })
  const pulls = recordListing("pullRequests", pullListing, checkout)
  T("github: a recorded Dependabot, contract bot or unexpected author pull request is not run owned", ["api#1106", "ui#2462", "landing#20"]
    .every((key) => pulls.open[key]?.runOwned === false), JSON.stringify(Object.values(pulls.open).map((pull) => [pull.key, pull.runOwned])))
  T("github: a recorded bot pull request stays pending and a recorded unexpected author waits for its report",
    pendingItems("pullRequests", pulls).some((pull) => pull.key === "api#1106") && unreportedPullRequests(pulls).some((pull) => pull.key === "landing#20"))
  const keys = await pullRequestCheck({ list: async () => pullListing, readState: () => readRunState(checkout) })()
  T("github: the waiter keeps the keys of a recorded bot and a recorded unexpected author pull request", keys.keys.includes(`api#1106 ${DEPENDABOT_PULL.head}`) &&
    keys.keys.includes("landing#20") && keys.keys.includes(`ui#2462 ${CONTRACT_PULL.head}`), JSON.stringify(keys))
}

/** One table row names the actions of each pull request class, and markItem permits exactly those actions. */
const permissionCases = ({ pullListing }) => {
  T("github: the pull request permission table has one row of actions for each class", JSON.stringify(Object.fromEntries(Object.entries(PULL_REQUEST_CLASSES)
    .map(([name, row]) => [name, row.actions]))) === JSON.stringify({ unexpectedAuthor: ["reported"], closedTickets: ["closed", "reported"], configured: ["merged", "fix", "closed"] }),
  JSON.stringify(PULL_REQUEST_CLASSES))
  const checkout = fresh("permissions")
  recordListing("pullRequests", pullListing, checkout)
  const pulls = recordClosedTicketPullRequests({ items: [{ key: "api#1115", closedTickets: [{ number: 2140, stateReason: "COMPLETED" }] }] }, checkout)
  const permitted = Object.fromEntries(["landing#20", "api#1115", "api#1106"].map((key) => [pullRequestClass(pulls.open[key]),
    ["merged", "fix", "closed", "reported"].filter((action) => refusal(() => markItem("pullRequests", { key, head: pulls.open[key].head, action, ticket: TICKET, reason: "Superseded." },
      checkout)) === "")]))
  T("github: markItem permits exactly the actions of each pull request class", JSON.stringify(permitted) ===
    JSON.stringify(Object.fromEntries(Object.entries(PULL_REQUEST_CLASSES).map(([name, row]) => [name, row.actions]))), JSON.stringify(permitted))
}

/* An open alert whose carrying ticket closes wakes the idle waiter once, and the next scan that still finds it wakes it once more. */
const closedTicketAlertWakeCases = async () => {
  const listing = await listOpenAlerts({ repositories: REPOSITORIES, readPages: fakeReader({ "repos/thomasluizon/orbit-api/code-scanning": [CODE_SCANNING_ALERT] }).readPages })
  const state = { intake: { alerts: { marks: { "api code-scanning 28": { action: "ticket", ticket: TICKET, cause: "The test fixture sets Secure false on purpose." } } } } }
  let ticket = { state: "OPEN", stateReason: null }
  let scan = API_SCAN_COMMIT
  const ticketReads = []
  const check = { source: "alerts", run: alertCheck({ list: async () => listing, readState: () => state,
    readTicketState: async (number) => { ticketReads.push(number); if (ticket instanceof Error) throw ticket; return { number, ...ticket } }, readNewestScan: async () => scan }) }
  let marks = { seen: { alerts: ["api code-scanning 28"] }, failures: {}, sentryListedAt: new Date(0).toISOString() }
  const interval = async () => {
    const evaluated = evaluateChecks([check], await Promise.allSettled([check.run()]), marks, 0)
    marks = evaluated.marks
    return evaluated.wakes
  }
  const open = await interval()
  ticket = { state: "CLOSED", stateReason: "COMPLETED" }
  const closed = await interval()
  const again = await interval()
  ticket = new Error("GitHub read failed at repos/thomasluizon/orbit-tickets/issues/2149: timed out")
  const failed = await interval()
  ticket = { state: "CLOSED", stateReason: "COMPLETED" }
  const recovered = await interval()
  scan = "a".repeat(40)
  const rescanned = await interval()
  T("github: an open ticketed alert wakes nothing while its ticket is open", open.length === 0 && ticketReads[0] === 2149, JSON.stringify(open))
  T("github: the close of the carrying ticket of an open alert wakes the waiter once with alerts", JSON.stringify(closed) ===
    JSON.stringify([{ source: "alerts", kind: "new", items: [`api code-scanning 28 ticket-closed ${API_SCAN_COMMIT}`] }]) && again.length === 0, JSON.stringify({ closed, again }))
  T("github: a failed ticket read wakes once as a failure and its recovery wakes nothing", failed.length === 1 && failed[0].kind === "failure" &&
    recovered.length === 0, JSON.stringify({ failed, recovered }))
  T("github: a newer scan that still finds the alert wakes the waiter once more", JSON.stringify(rescanned) ===
    JSON.stringify([{ source: "alerts", kind: "new", items: [`api code-scanning 28 ticket-closed ${"a".repeat(40)}`] }]), JSON.stringify(rescanned))
}

/* The same failure wakes the model once: a read that fails keeps its seen keys, so its recovery is not new. */
const failedReadCases = async () => {
  const healthy = { "repos/thomasluizon/orbit-api/pulls": [DEPENDABOT_PULL], "repos/thomasluizon/orbit-ui-mobile/pulls": [CONTRACT_PULL],
    "repos/thomasluizon/orbit-api/code-scanning": [CODE_SCANNING_ALERT], "repos/thomasluizon/orbit-ui-mobile/dependabot": [DEPENDABOT_ALERT] }
  const failing = { ...healthy, "repos/thomasluizon/orbit-api/pulls": "timed out", "repos/thomasluizon/orbit-api/code-scanning": "timed out" }
  let answers = healthy
  const readPages = (path, projection) => fakeReader(answers).readPages(path, projection)
  const checks = [
    { source: "pullRequests", run: pullRequestCheck({ list: () => listOpenPullRequests({ repositories: REPOSITORIES, readPages }), readState: () => ({}) }) },
    { source: "alerts", run: alertCheck({ list: () => listOpenAlerts({ repositories: REPOSITORIES, readPages }) }) }]
  let marks = { seen: {}, failures: {}, sentryListedAt: new Date(0).toISOString() }
  const interval = async (current) => {
    answers = current
    const evaluated = evaluateChecks(checks, await Promise.allSettled(checks.map((check) => check.run())), marks, 0)
    marks = evaluated.marks
    return evaluated.wakes
  }
  const first = await interval(healthy)
  const failed = await interval(failing)
  const again = await interval(failing)
  const seenAfterFailure = marks.seen
  const recovered = await interval(healthy)
  T("github: a partial read failure wakes once per source and keeps the seen keys of the failed read", first.length === 2 &&
    JSON.stringify(failed.map((wake) => [wake.source, wake.kind])) === JSON.stringify([["pullRequests", "failure"], ["alerts", "failure"]]) && again.length === 0 &&
    seenAfterFailure.pullRequests.includes(`api#1106 ${DEPENDABOT_PULL.head}`) && seenAfterFailure.alerts.includes("api code-scanning 28"),
  JSON.stringify({ failed, again, seenAfterFailure }))
  T("github: the recovery of the same failure wakes nothing", recovered.length === 0, JSON.stringify(recovered))
}

/* Step 7 asks for the review before its waiter, and steps 7 and 8 name each GitHub write. */
const skillCases = () => {
  const skill = readFileSync(join(TOOLS_DIR, "..", ".claude", "skills", "auto-work", "SKILL.md"), "utf8")
  const waiters = skill.match(/node tools\/wait-ci\.mjs[^`]*/g) ?? []
  T("github skill: every CI waiter of step 7 waits for the requested Pullfrog review", waiters.length > 0 &&
    waiters.every((command) => command.includes("--require-check pullfrog-approval")) && skill.includes("node tools/list-bot-threads.mjs --pr <n> --repo <key> --head <sha>"),
  waiters.join("\n"))
  T("github skill: the close of a pull request and the dismissal of an alert name their commands",
    skill.includes("gh pr close <n> --repo <owner/name> --comment <reason>") && skill.includes("node tools/auto-work-github.mjs --dismiss"))
  const closedTicketRule = skill.slice(skill.indexOf("An owner pull request in `ticketClosed`"), skill.indexOf("For each other pending pull request"))
  T("github skill: step 7 never merges a pull request of a closed ticket, closes it when completed and asks the owner otherwise",
    closedTicketRule.includes("Never merge it") && closedTicketRule.includes("`COMPLETED`") && closedTicketRule.includes("superseded") &&
    closedTicketRule.includes("`NOT_PLANNED`") && closedTicketRule.includes("`/questions`"), closedTicketRule)
  /* gh api repos/thomasluizon/<name> --jq '{private, visibility}' gives {"private":false,"visibility":"public"} for orbit-ui-mobile, orbit-api and orbit-landing-page. */
  const authorRule = skill.slice(skill.indexOf("7. List every open pull request"), skill.indexOf("An owner pull request in `pending`"))
  T("github skill: step 7 states that the three repositories are public and never runs the branch of an unexpected author",
    authorRule.includes("The three repositories are public") && !/\bprivate\b/.test(authorRule) && authorRule.includes("never check out or run its branch"), authorRule)
}

const checkCases = async ({ pullListing, alertListing }) => {
  const pulls = await pullRequestCheck({ list: async () => pullListing, readState: () => ({ pullRequests: [{ repositoryKey: "ui", prNumber: 2473 }] }) })()
  T("github: the pull request check keys each pull request the run did not open by its head, and an unexpected author once", JSON.stringify(pulls) ===
    JSON.stringify({ keys: [`ui#2462 ${CONTRACT_PULL.head}`, `api#1106 ${DEPENDABOT_PULL.head}`, `api#1115 ${EARLIER_OWNER_PULL.head}`, "landing#20"] }), JSON.stringify(pulls))
  const listed = listedWakeKeys({ pullRequests: { open: { "ui#2473": { key: "ui#2473", head: OWNER_PULL.head, runOwned: true },
    "api#1106": { key: "api#1106", head: DEPENDABOT_PULL.head, runOwned: false },
    "landing#20": { key: "landing#20", head: UNEXPECTED_PULL.head, runOwned: false, unexpectedAuthor: true } } } })
  T("github: the listed wake keys skip run owned pull requests and match the check keys", JSON.stringify(listed) ===
    JSON.stringify({ pullRequests: [`api#1106 ${DEPENDABOT_PULL.head}`, "landing#20"] }), JSON.stringify(listed))
  const reportedMarks = { "api#1115": { head: "0".repeat(40), action: "reported", closedTickets: [{ number: 2140, stateReason: "NOT_PLANNED" }] } }
  const reported = await pullRequestCheck({ list: async () => pullListing, readState: () => ({ intake: { pullRequests: { marks: reportedMarks } } }) })()
  const reportedListed = listedWakeKeys({ pullRequests: { open: { "api#1115": { key: "api#1115", head: EARLIER_OWNER_PULL.head, runOwned: false } }, marks: reportedMarks } })
  T("github: a reported pull request keys without its head, so a new head does not wake the waiter", reported.keys.includes("api#1115") &&
    !reported.keys.some((key) => key.startsWith("api#1115 ")) && JSON.stringify(reportedListed) === JSON.stringify({ pullRequests: ["api#1115"] }),
  `${JSON.stringify(reported)} ${JSON.stringify(reportedListed)}`)
  const partial = await alertCheck({ list: async () => alertListing })()
  T("github: a partial alert read passes its keys and names the failure", partial.keys.length === 2 && partial.failure.includes(NOT_FOUND), JSON.stringify(partial))
  let message = ""
  try { await alertCheck({ list: async () => ({ items: [], reads: ["ui dependabot"], failures: [{ read: "ui dependabot", message: NOT_FOUND }] }) })() } catch (error) { message = error.message }
  T("github: an alert check with no successful read rejects instead of an empty source", message === NOT_FOUND, message)
}

export const cases = async () => {
  const listings = await listingCases()
  await readerCases()
  await stateCases(listings)
  await ownershipCases(listings)
  await migratedOwnershipCases(listings)
  await recordedAuthorCases(listings)
  permissionCases(listings)
  await closedTicketAlertWakeCases()
  await failedReadCases()
  skillCases()
  await checkCases(listings)
}
