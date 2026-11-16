import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { alertCheck, githubPageReader, listedWakeKeys, listOpenAlerts, listOpenPullRequests, markItem, pendingItems, pullRequestCheck, recordListing, runPullRequestKeys } from "../lib/auto-work-github.mjs"
import { readRunState, writeRunState } from "../lib/run-state.mjs"
import { T, root } from "./_harness.mjs"

const REPOSITORIES = [{ key: "ui", slug: "thomasluizon/orbit-ui-mobile" }, { key: "api", slug: "thomasluizon/orbit-api" },
  { key: "landing", slug: "thomasluizon/orbit-landing-page" }]
const TICKET = "https://github.com/thomasluizon/orbit-tickets/issues/2149"

/* Each item is a live projection of a real REST response; the bot pull request and the alerts are closed ones, read with their state filter removed. */
export const DEPENDABOT_PULL = { number: 1106, author: "dependabot[bot]", authorType: "Bot", head: "1eb7c13b62064064a60a3589eff1b1812f39190e", base: "main",
  draft: false, title: "Bump System.Formats.Cbor from 10.0.14 to 10.0.15", url: "https://github.com/thomasluizon/orbit-api/pull/1106" }
const OWNER_PULL = { number: 2473, author: "thomasluizon", authorType: "User", head: "859e0638209bff39521cb381642f00d203f75116", base: "main", draft: false,
  title: "fix(brand): draw every app icon as the mascot with its eyes (#2144)", url: "https://github.com/thomasluizon/orbit-ui-mobile/pull/2473" }
export const CODE_SCANNING_ALERT = { line: 84, message: "Cookie attribute 'Secure' is not set to true.\nCookie attribute 'Secure' is not set to true.", number: 28,
  path: "tests/Orbit.Infrastructure.Tests/Controllers/OAuthControllerTests.CookiePolicy.cs", rule: "cs/web/cookie-secure-not-set", severity: "medium", tool: "CodeQL",
  url: "https://github.com/thomasluizon/orbit-api/security/code-scanning/28" }
const DEPENDABOT_ALERT = { message: "hono: Hono: `csrf()` does not check requests sent by hyperlink auditing (`text/ping`)", number: 186, path: "evals/astra/package-lock.json",
  rule: "GHSA-46wx-v44x-9hh2", severity: "medium", tool: "npm", url: "https://github.com/thomasluizon/orbit-ui-mobile/security/dependabot/186" }
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
  const pulls = fakeReader({ "repos/thomasluizon/orbit-api/pulls": [DEPENDABOT_PULL], "repos/thomasluizon/orbit-ui-mobile/pulls": [OWNER_PULL] })
  const pullListing = await listOpenPullRequests({ repositories: REPOSITORIES, readPages: pulls.readPages })
  T("github: every repository is read for open pull requests of every author", JSON.stringify(pulls.calls.map((call) => call.path)) === JSON.stringify([
    "repos/thomasluizon/orbit-ui-mobile/pulls?state=open&per_page=100", "repos/thomasluizon/orbit-api/pulls?state=open&per_page=100",
    "repos/thomasluizon/orbit-landing-page/pulls?state=open&per_page=100"]) && !pulls.calls[0].path.includes("creator"), JSON.stringify(pulls.calls))
  T("github: a pull request key is the repository key and number", JSON.stringify(pullListing.items.map((pull) => pull.key)) === JSON.stringify(["ui#2473", "api#1106"]) &&
    pullListing.items[1].author === "dependabot[bot]" && pullListing.failures.length === 0, JSON.stringify(pullListing))

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
  } finally {
    if (previous === undefined) delete process.env.GH_BIN
    else process.env.GH_BIN = previous
  }
}

const stateCases = ({ pullListing, alertListing }) => {
  const checkout = fresh("state", { pullRequests: [{ repositoryKey: "ui", prNumber: 2473, receiptPath: "receipt.json" }] })
  const pulls = recordListing("pullRequests", pullListing, checkout, "2026-11-16T12:00:00.000Z")
  T("github: the listing persists in intake.pullRequests and reads back", JSON.stringify(readRunState(checkout).intake.pullRequests) === JSON.stringify(pulls) &&
    pulls.listedAt === "2026-11-16T12:00:00.000Z")
  T("github: a pull request the run opened is marked run owned and is not pending", pulls.open["ui#2473"].runOwned === true &&
    JSON.stringify(pendingItems("pullRequests", pulls).map((pull) => pull.key)) === JSON.stringify(["api#1106"]))

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
    pendingItems("pullRequests", marked).length === 0)
  const moved = recordListing("pullRequests", { ...pullListing, items: pullListing.items.map((pull) => pull.key === "api#1106" ? { ...pull, head: "a".repeat(40) } : pull) }, checkout)
  T("github: a new head on a marked pull request makes it pending again", JSON.stringify(pendingItems("pullRequests", moved).map((pull) => pull.key)) === JSON.stringify(["api#1106"]) &&
    moved.marks["api#1106"].head === DEPENDABOT_PULL.head)
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
  T("github: a dismissal without a written analysis is refused", refusal(() => markItem("alerts", { key: "api code-scanning 28", action: "dismissed", ticket: TICKET }, checkout))
    .startsWith("Unknown alerts action") &&
    refusal(() => markItem("alerts", { key: "api code-scanning 28", action: "false-positive", ticket: TICKET }, checkout)) ===
    "a false positive needs the ticket that holds the analysis and the reason")
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

const checkCases = async ({ pullListing, alertListing }) => {
  const pulls = await pullRequestCheck({ list: async () => pullListing, ownedKeys: () => new Set(["ui#2473"]) })()
  T("github: the pull request check keys each pull request the run did not open by its head", JSON.stringify(pulls) ===
    JSON.stringify({ keys: [`api#1106 ${DEPENDABOT_PULL.head}`] }), JSON.stringify(pulls))
  const listed = listedWakeKeys({ pullRequests: { open: { "ui#2473": { key: "ui#2473", head: OWNER_PULL.head, runOwned: true },
    "api#1106": { key: "api#1106", head: DEPENDABOT_PULL.head, runOwned: false } } } })
  T("github: the listed wake keys skip run owned pull requests and carry the head", JSON.stringify(listed) ===
    JSON.stringify({ pullRequests: [`api#1106 ${DEPENDABOT_PULL.head}`] }), JSON.stringify(listed))
  const partial = await alertCheck({ list: async () => alertListing })()
  T("github: a partial alert read passes its keys and names the failure", partial.keys.length === 2 && partial.failure.includes(NOT_FOUND), JSON.stringify(partial))
  let message = ""
  try { await alertCheck({ list: async () => ({ items: [], reads: ["ui dependabot"], failures: [{ read: "ui dependabot", message: NOT_FOUND }] }) })() } catch (error) { message = error.message }
  T("github: an alert check with no successful read rejects instead of an empty source", message === NOT_FOUND, message)
}

export const cases = async () => {
  const listings = await listingCases()
  await readerCases()
  stateCases(listings)
  await checkCases(listings)
}
