#!/usr/bin/env node
/** Records path and JSON-type evidence from read-only live gh invocations. */

import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { repositorySlug } from "./lib/github-auth.mjs"
import { pullRequestQuery } from "./review-rounds.mjs"

/** One round, several rounds with a dismissed approval, a re-reviewed head, unapproved, another bot. */
const REVIEW_ROUNDS_PULLS = [2371, 2373, 2343, 2338, 2325]

const USAGE = `usage: record-gh-fixtures.mjs [--review-rounds] [--output <path>]

  Records path and JSON-type manifests from read-only gh issue and project commands.
  Defaults to tools/__fixtures__/gh-issue-envelopes.json.

  --review-rounds  instead record the raw review-rounds.mjs response for the pinned pull requests
                   ${REVIEW_ROUNDS_PULLS.join(", ")} of the ui repository.
                   Defaults to tools/__fixtures__/gh-review-rounds.json.
  --output <path>  write the manifest to this path
  --help, -h       print this usage and exit 0

exit codes: 0 fixture recorded, 1 live command or write failed, 2 usage error`

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const reviewRounds = args.includes("--review-rounds")
let outputPath = fileURLToPath(new URL(reviewRounds ? "./__fixtures__/gh-review-rounds.json" : "./__fixtures__/gh-issue-envelopes.json", import.meta.url))
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--review-rounds") continue
  if (args[index] !== "--output" || index + 1 >= args.length || args[index + 1].startsWith("-")) {
    console.error(`record-gh-fixtures: invalid arguments: ${args.join(" ")}\n\n${USAGE}`)
    process.exit(2)
  }
  outputPath = resolve(args[++index])
}

/** Recorded bot prose can hold dashes the Dash Ban rejects; a JSON escape parses to the same value. */
const writeJson = (value) => {
  mkdirSync(dirname(outputPath), { recursive: true })
  const text = JSON.stringify(value, null, 2).replaceAll("\u2014", "\\u2014").replaceAll("\u2013", "\\u2013")
  writeFileSync(outputPath, `${text}\n`)
  console.log(`record-gh-fixtures: wrote ${outputPath}`)
}

/**
 * The raw response, not a path manifest, because the review-rounds cases hand count rounds and
 * categories from real reviews. The repository comes from the ui checkout's own origin.
 */
if (reviewRounds) {
  let slug
  try {
    slug = repositorySlug(fileURLToPath(new URL("..", import.meta.url)))
  } catch (error) {
    console.error(`record-gh-fixtures: ${error.message}`)
    process.exit(1)
  }
  const [owner, name] = slug.split("/")
  const query = pullRequestQuery(REVIEW_ROUNDS_PULLS)
  const result = spawnSync(process.env.GH_BIN || "gh", ["api", "graphql", "-f", `owner=${owner}`, "-f", `name=${name}`, "-f", `query=${query}`], { encoding: "utf8", timeout: 60000, maxBuffer: 32 * 1024 * 1024, windowsHide: true })
  let response
  try {
    response = JSON.parse(result.stdout)
  } catch {
    response = null
  }
  const missing = REVIEW_ROUNDS_PULLS.filter((number) => !Array.isArray(response?.data?.repository?.[`pr${number}`]?.reviews?.nodes))
  if (result.status !== 0 || response?.errors || missing.length > 0) {
    console.error(`record-gh-fixtures: the review-rounds query did not return every pinned pull request (${missing.join(", ") || "errors"}): ${(result.stderr || JSON.stringify(response?.errors ?? "")).trim()}`)
    process.exit(1)
  }
  writeJson({
    schemaVersion: 1,
    generation: {
      method: "Recorded verbatim from one read-only live gh api graphql call. No value was entered by hand.",
      generator: "tools/record-gh-fixtures.mjs --review-rounds",
      producer: "pullRequestQuery(numbers) from tools/review-rounds.mjs",
      query,
      repository: slug,
      numbers: REVIEW_ROUNDS_PULLS,
    },
    response,
  })
  process.exit(0)
}

const config = JSON.parse(readFileSync(new URL("../.claude/orchestrator.json", import.meta.url), "utf8")).tickets
const map = JSON.parse(readFileSync(new URL("../.claude/linear-to-github-map.json", import.meta.url), "utf8"))
const sampleNumber = map.issues?.["ORB-215"]?.number
if (!Number.isInteger(sampleNumber)) {
  console.error("record-gh-fixtures: .claude/linear-to-github-map.json carries no ORB-215 issue number")
  process.exit(1)
}

const issueFields = "number,url,title,body,state,stateReason,labels,blockedBy,blocking"
const stateReasonFilter = 'if .stateReason == "" then .stateReason = null else . end'
const issueProjectItemsQuery = `query IssueProjectItems($o: String!, $r: String!, $n: Int!, $after: String) {
  repository(owner: $o, name: $r) {
    issue(number: $n) {
      number
      state
      projectItems(first: 5, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          project { id number }
          fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
        }
      }
    }
  }
}`
const boardStateQuery = `query BoardState($o: String!, $r: String!, $after: String) {
  repository(owner: $o, name: $r) {
    issues(states: OPEN, first: 100, after: $after, orderBy: { field: CREATED_AT, direction: ASC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        updatedAt
        projectItems(first: 10) { totalCount nodes { project { id } } }
        blockedBy(first: 100) { totalCount nodes { number state } }
      }
    }
  }
}`
const restIssueFilter = "{number,html_url,title,body,state:(.state|ascii_upcase),state_reason:(if .state_reason==null then null else (.state_reason|ascii_upcase) end),labels:[.labels[]|{name}]}"
const dependencySampleNumber = 318
const [repositoryOwner, repositoryName] = config.repository.split("/")
const commands = {
  issueView: ["issue", "view", String(sampleNumber), "--repo", config.repository, "--json", issueFields, "--jq", stateReasonFilter],
  issueViewError: ["issue", "view", "2147483647", "--repo", config.repository, "--json", issueFields, "--jq", stateReasonFilter],
  /**
   * A separate envelope from issueView, because it is a different query with a different response
   * shape. Recording it against the same sample only proves the comment paths while that issue
   * still carries comments, so `record` fails loudly on an empty array rather than writing a
   * manifest whose `$.comments[]` paths silently vanish.
   */
  issueViewComments: ["issue", "view", String(sampleNumber), "--repo", config.repository, "--json", "comments"],
  issueProjectItems: ["api", "graphql", "-F", `o=${repositoryOwner}`, "-F", `r=${repositoryName}`, "-F", `n=${sampleNumber}`, "-f", `query=${issueProjectItemsQuery}`],
  boardState: ["api", "graphql", "-F", `o=${repositoryOwner}`, "-F", `r=${repositoryName}`, "-f", `query=${boardStateQuery}`],
  restIssue: ["api", `repos/${config.repository}/issues/${sampleNumber}`, "--jq", restIssueFilter],
  issueDependencyNumbers: ["api", "--paginate", `repos/${config.repository}/issues/${dependencySampleNumber}/dependencies/blocked_by?per_page=100`, "--jq", "[.[].number]"],
  issueList: ["issue", "list", "--repo", config.repository, "--state", "all", "--limit", "1000", "--json", issueFields, "--jq", `map(${stateReasonFilter})`],
  projectItemList: ["project", "item-list", String(config.projectNumber), "--owner", config.projectOwner, "--format", "json", "--limit", "1000"],
  labelList: ["label", "list", "--repo", config.repository, "--limit", "1000", "--json", "name"],
}

const jsonType = (value) => {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value === "object" ? "object" : typeof value
}

const addPaths = (paths, value, path = "$") => {
  const type = jsonType(value)
  const entry = paths[path] ?? { types: [] }
  if (!entry.types.includes(type)) entry.types.push(type)
  entry.types.sort()
  paths[path] = entry
  if (type === "array") {
    for (const item of value) addPaths(paths, item, `${path}[]`)
  } else if (type === "object") {
    for (const [key, child] of Object.entries(value)) addPaths(paths, child, `${path}.${key}`)
  }
}

const record = (name, command) => {
  const result = spawnSync(process.env.GH_BIN || "gh", command, {
    encoding: "utf8",
    env: process.env,
    timeout: 30000,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  })
  const isExpectedError = name === "issueViewError"
  if (result.error || (isExpectedError ? result.status === 0 : result.status !== 0)) {
    const detail = (result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim()
    throw new Error(`${name} did not produce its expected live result: ${detail}`)
  }
  let value
  if (isExpectedError) {
    value = result.stderr.trim()
    if (!value) throw new Error("issueViewError returned no stderr")
  } else {
    try {
      value = JSON.parse(result.stdout)
    } catch (error) {
      throw new Error(`${name} returned invalid JSON: ${error.message}`)
    }
  }
  if (name === "issueViewComments" && (!Array.isArray(value?.comments) || value.comments.length === 0)) {
    throw new Error(`issueViewComments recorded no comments on issue ${sampleNumber}, so the comment paths would be missing rather than proven`)
  }
  if (name === "issueProjectItems" && !value?.data?.repository?.issue?.projectItems?.nodes?.some(
    (node) => node?.project?.id === config.projectId && node?.project?.number === config.projectNumber && typeof node?.id === "string" && typeof node?.fieldValueByName?.name === "string",
  )) {
    throw new Error(`issueProjectItems recorded no populated item for configured project ${config.projectId} on issue ${sampleNumber}`)
  }
  if (name === "issueProjectItems" && typeof value?.data?.repository?.issue?.projectItems?.pageInfo?.hasNextPage !== "boolean") {
    throw new Error(`issueProjectItems recorded no pagination state on issue ${sampleNumber}`)
  }
  if (name === "boardState") {
    const nodes = value?.data?.repository?.issues?.nodes
    if (typeof value?.data?.repository?.issues?.pageInfo?.hasNextPage !== "boolean" || !Array.isArray(nodes) ||
        !nodes.some((node) => node?.projectItems?.nodes?.some((item) => item?.project?.id === config.projectId)) ||
        !nodes.some((node) => node?.blockedBy?.nodes?.length > 0)) {
      throw new Error("boardState recorded no open ticket on the configured project with a blocker, so its paths would be missing rather than proven")
    }
  }
  if (name === "issueDependencyNumbers" && (!Array.isArray(value) || value.length === 0 || value.some((number) => !Number.isInteger(number)))) {
    throw new Error(`issueDependencyNumbers recorded no populated dependency array on issue ${dependencySampleNumber}`)
  }
  const paths = {}
  addPaths(paths, value)
  return {
    command: ["gh", ...command.map((part) => {
      if (part === String(sampleNumber)) return "<issue-number>"
      if (part === `n=${sampleNumber}`) return "n=<issue-number>"
      return part.replace(`/issues/${sampleNumber}`, "/issues/<issue-number>").replace(`/issues/${dependencySampleNumber}`, "/issues/<dependency-sample-number>")
    })],
    observedExitCode: result.status,
    paths,
  }
}

const unionPaths = (previous, next) => {
  const merged = { ...next }
  for (const [path, entry] of Object.entries(previous ?? {})) {
    const types = [...new Set([...(merged[path]?.types ?? []), ...entry.types])].sort()
    merged[path] = { types }
  }
  return merged
}

let priorCommands = {}
try {
  priorCommands = JSON.parse(readFileSync(outputPath, "utf8")).commands ?? {}
} catch {
  priorCommands = {}
}

try {
  const recorded = {}
  for (const [name, command] of Object.entries(commands)) {
    const fresh = record(name, command)
    recorded[name] = { ...fresh, paths: unionPaths(priorCommands[name]?.paths, fresh.paths) }
  }
  const manifest = {
    schemaVersion: 1,
    generation: {
      method: "Generated mechanically from read-only live gh commands. No response path or type was entered by hand.",
      generator: "tools/record-gh-fixtures.mjs",
      repository: config.repository,
      projectOwner: config.projectOwner,
      projectNumber: config.projectNumber,
    },
    commands: recorded,
  }
  writeJson(manifest)
} catch (error) {
  console.error(`record-gh-fixtures: ${error.message}`)
  process.exit(1)
}
