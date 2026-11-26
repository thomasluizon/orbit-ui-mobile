#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-retired-name.mjs [--root <repository>] [--files <path>...]

  Fails when a tracked file path or a tracked file body carries the retired
  product name "astra" outside the wire-name allowlist. The AI, the app and the
  mascot are all "Orbit". A name that old clients or the API read keeps its
  spelling and sits in WIRE_NAMES. A file that must keep the old name sits in
  KEPT_FILES, with the reason.

  --root <repository>  scan this repository instead of the script's repository
  --files <path>...    scan only these tracked paths
  --help, -h           print this usage and exit 0

exit codes: 0 no retired name outside the allowlist, 1 retired name found, 2 usage error`

/** One exact wire name or one exact list of them: no name may continue on either side. */
const exact = (names, { before = "(?<![A-Za-z0-9_-])", after = "(?![A-Za-z0-9_-])" } = {}) => new RegExp(`${before}(?:${names.join("|")})${after}`, "g")

const FLAG_AND_EVENT_NAMES = [
  "astra_eval_unmetered", "astra_eval_trace", "astra_block_first", "astra_ask_blocks_disabled", "astra_proactive_engine_disabled",
  "astra_crisis_resources_disabled", "astra_change_preview_disabled", "astra_tool_steps_disabled", "astra_parts_disabled",
  "astra_follow_ups_disabled", "astra_period_blocks_disabled", "astra_goal_projections_disabled", "astra_status_blocks_disabled",
  "astra_record_lists_disabled", "astra_account_rows_disabled",
]

/** A name that a person never sees and that another system reads. Each entry says who reads it. */
export const WIRE_NAMES = [
  { reason: "feature flag names that the API stores and sends", pattern: exact(FLAG_AND_EVENT_NAMES) },
  { reason: "how DESIGN.md names the flag, event and error-code families of the API", pattern: exact(["astra_\\*", "astra_proactive_item_\\*", "ASTRA_BLOCK_\\*", "aggregate:astra_ai"]) },
  { reason: "profile field and data export field that the API sends and that old mobile builds read", pattern: exact(["[Pp]roactiveAstraEnabled", "storedProactiveAstraEnabled"], { before: "(?<![A-Za-z0-9_])", after: "(?![A-Za-z0-9_])" }) },
  { reason: "profile field that the API sends and that old mobile builds read", pattern: exact(["[Hh]asTriedAstra"], { before: "(?<![A-Za-z0-9_])", after: "(?![A-Za-z0-9_])" }) },
  { reason: "profile endpoint of the API and the permission names that carry it", pattern: exact(["(?:profile-)?proactive-astra(?:-write)?"]) },
  {
    reason: "generated client names of the profile endpoint",
    pattern: exact(["PutApiProfileProactiveAstra(?:Header|Body|Response)?", "getApiProfileResponseProactiveAstraEnabledDefault"], { before: "(?<![A-Za-z0-9_])", after: "(?![A-Za-z0-9_])" }),
  },
  {
    reason: "offline mutation, pending operation key and request names of the profile endpoint",
    pattern: exact(["[Ss]etProactiveAstra(?:Request|EnabledRequest|RequestSchema)?"], { before: "(?<![A-Za-z0-9_])", after: "(?![A-Za-z0-9_])" }),
  },
  { reason: "MCP tool name of the API", pattern: exact(["set_proactive_astra"]) },
  { reason: "tool-result message key that the API sends", pattern: exact(["proactiveAstra\\.(?:enabled|disabled)"], { before: "(?<![A-Za-z0-9_])", after: "(?![A-Za-z0-9_])" }) },
  { reason: "tool-result message key that the API sends", pattern: /"proactiveAstra"/g },
  { reason: "table and entity name of the API", pattern: exact(["IssuedAstraBlocks"], { before: "(?<![A-Za-z0-9_])", after: "(?![A-Za-z0-9_])" }) },
  { reason: "account row id that the API sends", pattern: /(?<!account\.row\.)\bastraAllowance\b/g },
  { reason: "schema name of the API OpenAPI document", pattern: /components\/schemas\/AstraNextAction(?![\w-])/g },
  { reason: "schema name of the API OpenAPI document, read by the offer contract test", pattern: /contract\.AstraNextAction(?![\w-])/g },
  { reason: "legacy profile route that stored links and old builds open", pattern: /profile\/astra(?![\w/-]|\.\w)/g },
  { reason: "the legacy route file of the mobile app and its import specifier", pattern: /(?:apps\/mobile\/app|@\/app)\/profile\/astra(?:\.tsx)?(?![\w/-]|\.\w)/g },
  { reason: "the web test that proves the legacy profile route file is gone", pattern: /\(app\)\/profile\/astra\/page\.tsx/g },
  { reason: "legacy profile anchor that stored links carry", pattern: /(?<=['"`])#astra(?=['"`])/g },
  { reason: "conversation query parameter that stored notification links and the service worker carry", pattern: /(?<![\w-])astra=/g },
  { reason: "the one query parameter that stored links carry", pattern: /PARAM_CARRIED_BY_STORED_LINKS = 'astra'/g },
  { reason: "the two design files that keep their name", pattern: /Orbit(?:%20| )Astra(?:%20| )(?:Conversation|Ideas)(?![A-Za-z0-9_-])/g },
]

/** A file that keeps its path or its body. The key is a repository path. */
export const KEPT_FILES = new Map([
  ["design/canvas/Orbit Astra Conversation.dc.html", { path: true, body: true, reason: "tools/redesign-coverage.mjs needs this drawing; it stays active with an identity amendment" }],
  ["design/canvas/Orbit Astra Ideas.md", { path: true, body: true, reason: "the drawing set names it; the file stays under its name" }],
  ["apps/mobile/app/profile/astra.tsx", { path: true, body: false, reason: "the route file name is the legacy slug /profile/astra that stored links open" }],
  ["apps/web/lib/conversation-entry-query.ts", { path: false, body: true, reason: "it reads the legacy conversation query parameter of stored notification links" }],
  ["evals/ai-eval/__tests__/fixtures/offer-contract.json", { path: false, body: true, reason: "a copy of the API OpenAPI document, which names its schemas AstraNextAction" }],
  ["packages/shared/src/__tests__/orbit-copy.test.ts", { path: false, body: true, reason: "its guard test names the retired word to prove that no visible copy carries it" }],
  ["tools/check-retired-name.mjs", { path: false, body: true, reason: "this guard names the word it forbids" }],
])

const WORD = /Astra(?!l)|ASTRA(?!L)|(?<![A-Za-z])astra(?!l)/

const parseArguments = (argv) => {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  let files = null
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--help" || argument === "-h") {
      console.log(USAGE)
      process.exit(0)
    }
    if (argument === "--root") {
      if (!argv[index + 1]) throw new Error("--root requires a repository path")
      root = resolve(argv[index + 1])
      index += 1
      continue
    }
    if (argument === "--files") {
      files = argv.slice(index + 1)
      break
    }
    throw new Error(`unknown argument: ${argument}`)
  }
  return { root, files }
}

const trackedPaths = (root) => execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 1 << 28 }).split("\0").filter(Boolean)

const withoutWireNames = (text) => WIRE_NAMES.reduce((rest, { pattern }) => rest.replace(pattern, " "), text)

/** The findings of one file: its path first, then each body line. */
export const findingsOf = (path, body) => {
  const kept = KEPT_FILES.get(path)
  const findings = []
  if (!kept?.path && WORD.test(withoutWireNames(path))) findings.push(`${path}: the path carries the retired name`)
  if (kept?.body || body === null) return findings
  body.split("\n").forEach((line, index) => {
    if (WORD.test(withoutWireNames(line))) findings.push(`${path}:${index + 1}: ${line.trim().slice(0, 140)}`)
  })
  return findings
}

const main = () => {
  let options
  try {
    options = parseArguments(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
  const tracked = trackedPaths(options.root)
  const wanted = options.files ? tracked.filter((path) => options.files.includes(path)) : tracked
  const findings = []
  for (const path of wanted) {
    const absolute = resolve(options.root, path)
    const buffer = existsSync(absolute) ? readFileSync(absolute) : null
    const body = buffer && !buffer.includes(0) ? buffer.toString("utf8") : null
    findings.push(...findingsOf(path, body))
  }
  if (findings.length > 0) {
    console.error(`Retired name guard failed: write Orbit, or add a wire name to WIRE_NAMES in tools/check-retired-name.mjs with its reader.\n${findings.join("\n")}`)
    process.exit(1)
  }
  console.log(`Retired name guard passed: ${wanted.length} tracked files carry no retired name outside the allowlist.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
