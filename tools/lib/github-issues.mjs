/** The sole ticket-system adapter. Callers never shell out to gh for ticket data. */

import { readFileSync } from "node:fs"

import { runBounded } from "./bounded-process.mjs"
import { readOrchestratorConfig } from "./orchestrator-config.mjs"

const ISSUE_FIELDS = "number,url,title,body,state,stateReason,labels,blockedBy,blocking"
const COMMAND_TIMEOUT_MS = 30000
const COMMAND_MAX_BUFFER = 32 * 1024 * 1024
const STATE_REASON_FILTER = 'if .stateReason == "" then .stateReason = null else . end'
const LIST_STATE_REASON_FILTER = `map(${STATE_REASON_FILTER})`

const ticketMap = JSON.parse(readFileSync(new URL("../../.claude/linear-to-github-map.json", import.meta.url), "utf8"))
if (ticketMap === null || typeof ticketMap !== "object" || Array.isArray(ticketMap) || ticketMap.issues === null || typeof ticketMap.issues !== "object" || Array.isArray(ticketMap.issues)) {
  throw new Error(".claude/linear-to-github-map.json must declare an issues object")
}

const ticketsByIdentifier = new Map()
const identifiersByNumber = new Map()
for (const [identifier, ticket] of Object.entries(ticketMap.issues)) {
  if (!/^ORB-[1-9]\d*$/.test(identifier) || !Number.isInteger(ticket?.number) || ticket.number <= 0) {
    throw new Error(`.claude/linear-to-github-map.json carries an invalid entry for ${identifier}`)
  }
  if (identifiersByNumber.has(ticket.number)) {
    throw new Error(`.claude/linear-to-github-map.json maps issue #${ticket.number} more than once`)
  }
  ticketsByIdentifier.set(identifier, ticket.number)
  identifiersByNumber.set(ticket.number, identifier)
}

const positiveIssueNumber = (number) => {
  if (!Number.isInteger(number) || number <= 0) throw new Error(`GitHub issue number must be a positive integer, got ${JSON.stringify(number)}`)
  return number
}

const ticketConfiguration = () => readOrchestratorConfig().tickets

const nonEmptyString = (value, name) => {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} must be a non-empty string`)
  return value
}

const runGh = async (args, { input } = {}) => {
  const result = await runBounded(process.env.GH_BIN || "gh", args, {
    env: process.env,
    timeoutMs: COMMAND_TIMEOUT_MS,
    maxBuffer: COMMAND_MAX_BUFFER,
    input,
  })
  const command = `gh ${args.join(" ")}`
  if (result.timedOut) throw new Error(`${command} timed out after ${COMMAND_TIMEOUT_MS}ms`)
  if (result.overflowed) throw new Error(`${command} exceeded ${COMMAND_MAX_BUFFER} bytes of output`)
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${(result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim()}`)
  }
  return result.stdout
}

const parseGhJson = (command, stdout) => {
  try {
    return JSON.parse(stdout)
  } catch (error) {
    throw new Error(`${command} returned invalid JSON: ${error.message}`)
  }
}

const issueViewArgs = (number, repository) => [
  "issue",
  "view",
  String(number),
  "--repo",
  repository,
  "--json",
  ISSUE_FIELDS,
  "--jq",
  STATE_REASON_FILTER,
]

const projectItemsArgs = (tickets) => [
  "project",
  "item-list",
  String(tickets.projectNumber),
  "--owner",
  tickets.projectOwner,
  "--format",
  "json",
  "--limit",
  "1000",
]

const projectItemsByProject = new Map()

const readProjectItems = async (tickets) => {
  const projectKey = JSON.stringify([tickets.projectOwner, tickets.projectNumber])
  const cached = projectItemsByProject.get(projectKey)
  if (cached) return cached
  const args = projectItemsArgs(tickets)
  const pending = (async () => {
    const response = parseGhJson(`gh ${args.join(" ")}`, await runGh(args))
    if (!Array.isArray(response?.items)) throw new Error("gh project item-list returned no items array")
    return response.items
  })()
  projectItemsByProject.set(projectKey, pending)
  try {
    return await pending
  } catch (error) {
    if (projectItemsByProject.get(projectKey) === pending) projectItemsByProject.delete(projectKey)
    throw error
  }
}

const projectItemFor = (ticket, projectItems, repository) => {
  const matches = projectItems.filter(
    (item) => item?.content?.type === "Issue" && item.content.number === ticket.number && item.content.repository === repository,
  )
  if (matches.length > 1) throw new Error(`GitHub issue #${ticket.number} appears more than once on the configured project`)
  return matches[0] ?? null
}

const relationNumbers = (relation, name) => {
  if (relation === null || typeof relation !== "object" || Array.isArray(relation) || !Array.isArray(relation.nodes) || !Number.isInteger(relation.totalCount)) {
    throw new Error(`gh issue output carried an invalid ${name} connection`)
  }
  return relation.nodes.map((ticket) => ({ number: positiveIssueNumber(ticket?.number) }))
}

const normalizeTicket = (issue, projectItems, repository) => {
  if (issue === null || typeof issue !== "object" || Array.isArray(issue)) throw new Error("gh issue output was not an object")
  const number = positiveIssueNumber(issue.number)
  if (!Array.isArray(issue.labels) || issue.labels.some((label) => typeof label?.name !== "string")) {
    throw new Error(`gh issue output for #${number} carried invalid labels`)
  }
  if (!new Set(["OPEN", "CLOSED"]).has(issue.state)) throw new Error(`gh issue output for #${number} carried unsupported state ${JSON.stringify(issue.state)}`)
  for (const field of ["url", "title", "body"]) {
    if (typeof issue[field] !== "string") throw new Error(`gh issue output for #${number} carried invalid ${field}`)
  }
  const stateReason = issue.stateReason === "" ? null : issue.stateReason
  if (!["COMPLETED", "NOT_PLANNED", "DUPLICATE", "REOPENED", null].includes(stateReason)) {
    throw new Error(`gh issue output for #${number} carried unsupported stateReason ${JSON.stringify(stateReason)}`)
  }
  const projectItem = projectItemFor({ number }, projectItems, repository)
  if (projectItem && (typeof projectItem.id !== "string" || projectItem.id.length === 0)) {
    throw new Error(`gh project item-list carried no project item id for issue #${number}`)
  }
  const status = typeof projectItem?.status === "string" && projectItem.status.length > 0 ? projectItem.status : null
  return {
    number,
    url: issue.url,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    stateReason,
    labels: issue.labels.map((label) => ({ name: label.name })),
    blockedBy: relationNumbers(issue.blockedBy, "blockedBy"),
    blocking: relationNumbers(issue.blocking, "blocking"),
    status,
    projectItemId: projectItem?.id ?? null,
    identifier: identifiersByNumber.get(number) ?? null,
  }
}

export const resolveTicket = (reference) => {
  if (typeof reference === "string") {
    const trimmed = reference.trim()
    if (/^ORB-/i.test(trimmed)) {
      const identifier = trimmed.toUpperCase()
      if (!/^ORB-[1-9]\d*$/.test(identifier) || !ticketsByIdentifier.has(identifier)) {
        throw new Error(`Unknown migrated ticket ${trimmed}; refusing to guess a GitHub issue number`)
      }
      return { number: ticketsByIdentifier.get(identifier), identifier }
    }
    const match = /^#?([1-9]\d*)$/.exec(trimmed)
    if (!match) throw new Error(`Ticket reference must be ORB-N, #N, or N, got ${JSON.stringify(reference)}`)
    const number = positiveIssueNumber(Number(match[1]))
    return { number, identifier: identifiersByNumber.get(number) ?? null }
  }
  const number = positiveIssueNumber(reference)
  return { number, identifier: identifiersByNumber.get(number) ?? null }
}

export const readTicket = async (number, { withProjectItem = true } = {}) => {
  positiveIssueNumber(number)
  if (typeof withProjectItem !== "boolean") throw new Error("readTicket withProjectItem must be a boolean")
  const tickets = ticketConfiguration()
  const args = issueViewArgs(number, tickets.repository)
  const projectItemsPromise = withProjectItem ? readProjectItems(tickets) : Promise.resolve([])
  const [issueOutput, projectItems] = await Promise.all([runGh(args), projectItemsPromise])
  return normalizeTicket(parseGhJson(`gh ${args.join(" ")}`, issueOutput), projectItems, tickets.repository)
}

const writeStatus = async (number, status, { allowDone = false } = {}) => {
  positiveIssueNumber(number)
  const tickets = ticketConfiguration()
  if (!allowDone && (status === tickets.states.done || status === "Done")) throw new Error("The readiness loop never targets Done before merge")
  if (!Object.hasOwn(tickets.statusOptions, status)) throw new Error(`Unknown ticket status ${JSON.stringify(status)}`)
  const issueUrl = `https://github.com/${tickets.repository}/issues/${number}`
  await runGh([
    "project",
    "item-edit",
    String(tickets.projectNumber),
    "--owner",
    tickets.projectOwner,
    "--url",
    issueUrl,
    "--field",
    "Status",
    "--value",
    status,
  ])
}

export const setStatus = async (number, status) => writeStatus(number, status)

export const addComment = async (number, body) => {
  positiveIssueNumber(number)
  if (typeof body !== "string" || body.trim().length === 0) throw new Error("GitHub issue comment body must be a non-empty string")
  const tickets = ticketConfiguration()
  await runGh(["issue", "comment", String(number), "--repo", tickets.repository, "--body-file", "-"], { input: body })
}

/**
 * Verified live on 2026-08-08. This exact read returned one title per line for every milestone:
 * gh api repos/thomasluizon/orbit-tickets/milestones?state=all&per_page=100 --paginate --jq .[].title
 */
export const listMilestones = async () => {
  const tickets = ticketConfiguration()
  const output = await runGh(["api", `repos/${tickets.repository}/milestones?state=all&per_page=100`, "--paginate", "--jq", ".[].title"])
  return output
    .split(/\r?\n/)
    .filter((title) => title.length > 0)
}

export const listLabels = async () => {
  const tickets = ticketConfiguration()
  const args = ["label", "list", "--repo", tickets.repository, "--limit", "1000", "--json", "name"]
  const labels = parseGhJson(`gh ${args.join(" ")}`, await runGh(args))
  if (!Array.isArray(labels) || labels.some((label) => typeof label?.name !== "string" || label.name.length === 0)) {
    throw new Error("gh label list returned no valid label array")
  }
  return labels.map((label) => label.name)
}

export const createMilestone = async ({ title, description }) => {
  nonEmptyString(title, "Milestone title")
  nonEmptyString(description, "Milestone description")
  if ((await listMilestones()).includes(title)) throw new Error(`Milestone ${JSON.stringify(title)} already exists`)
  const tickets = ticketConfiguration()
  await runGh(
    ["api", `repos/${tickets.repository}/milestones`, "--method", "POST", "--input", "-"],
    { input: JSON.stringify({ title, description }) },
  )
  return { title }
}

const createdIssueFromUrl = (stdout, repository) => {
  const escapedRepository = repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = new RegExp(`^https://github\\.com/${escapedRepository}/issues/([1-9]\\d*)/?$`).exec(stdout.trim())
  if (!match) throw new Error(`gh issue create returned no issue URL for ${repository}`)
  return { number: positiveIssueNumber(Number(match[1])), url: stdout.trim().replace(/\/$/, "") }
}

/**
 * GitHub CLI v2.97.0 prints exactly the created issue URL on stdout after every deferred update
 * succeeds. Source: pkg/cmd/issue/create/create.go at tag v2.97.0,
 * `fmt.Fprintln(opts.IO.Out, newIssue.URL)`. No other write output is parsed here.
 */
export const createTicket = async ({ title, body, labels, milestone = null, status = "Todo", blockedBy = [] }) => {
  nonEmptyString(title, "Ticket title")
  nonEmptyString(body, "Ticket body")
  if (!Array.isArray(labels) || labels.length === 0 || labels.some((label) => typeof label !== "string" || label.trim().length === 0)) {
    throw new Error("Ticket labels must be a non-empty array of non-empty strings")
  }
  if (milestone !== null) nonEmptyString(milestone, "Ticket milestone")
  nonEmptyString(status, "Ticket status")
  if (!Array.isArray(blockedBy)) throw new Error("Ticket blockers must be an array")

  const tickets = ticketConfiguration()
  if (status === tickets.states.done || status === "Done") throw new Error("A new ticket cannot start at Done")
  if (!Object.hasOwn(tickets.statusOptions, status)) throw new Error(`Unknown ticket status ${JSON.stringify(status)}`)

  const [availableLabels, availableMilestones, resolvedBlockers] = await Promise.all([
    listLabels(),
    milestone === null ? [] : listMilestones(),
    Promise.all(blockedBy.map(async (reference) => {
      const resolved = resolveTicket(reference)
      await readTicket(resolved.number)
      return resolved.number
    })),
  ])
  const missingLabels = [...new Set(labels)].filter((label) => !availableLabels.includes(label))
  if (missingLabels.length > 0) throw new Error(`Unknown ticket label(s): ${missingLabels.join(", ")}`)
  if (milestone !== null && !availableMilestones.includes(milestone)) {
    throw new Error(`Unknown ticket milestone ${JSON.stringify(milestone)}; create it as a separate explicit action first`)
  }

  const createArgs = ["issue", "create", "--repo", tickets.repository, "--title", title, "--body-file", "-"]
  for (const label of [...new Set(labels)]) createArgs.push("--label", label)
  if (milestone !== null) createArgs.push("--milestone", milestone)
  const created = createdIssueFromUrl(await runGh(createArgs, { input: body }), tickets.repository)

  await runGh([
    "project",
    "item-add",
    String(tickets.projectNumber),
    "--owner",
    tickets.projectOwner,
    "--url",
    created.url,
  ])
  await writeStatus(created.number, status)

  const blockerNumbers = [...new Set(resolvedBlockers)]
  if (blockerNumbers.length > 0) {
    await runGh([
      "issue",
      "edit",
      String(created.number),
      "--repo",
      tickets.repository,
      "--add-blocked-by",
      blockerNumbers.join(","),
    ])
  }

  return { ...created, title, milestone, status }
}

export const preflightTicketCompletion = async (number) => {
  positiveIssueNumber(number)
  const tickets = ticketConfiguration()
  if (!Object.hasOwn(tickets.statusOptions, tickets.states.done)) throw new Error("The configured Done status has no project option")
  const ticket = await readTicket(number)
  if (ticket.state !== "OPEN") throw new Error(`Ticket #${number} is ${ticket.state}; only an open ticket can complete after merge`)
  if (!ticket.projectItemId) throw new Error(`Ticket #${number} is absent from the configured project`)
  return ticket
}

/**
 * `preflighted` lets the caller pass the ticket it already read, so posting the manual-steps comment
 * before the close costs one read instead of two. The value is verified to be the same ticket rather
 * than trusted, because a mismatched object here would close the wrong issue.
 */
export const completeTicket = async (number, preflighted = null) => {
  const ticket = preflighted?.number === positiveIssueNumber(number) ? preflighted : await preflightTicketCompletion(number)
  const tickets = ticketConfiguration()
  await writeStatus(number, tickets.states.done, { allowDone: true })
  await runGh(["issue", "close", String(number), "--repo", tickets.repository, "--reason", "completed"])
  return { number: ticket.number, url: ticket.url, title: ticket.title }
}

export const listTickets = async ({ labels = [], state = "open", milestone = null } = {}) => {
  if (!Array.isArray(labels) || labels.some((label) => typeof label !== "string" || label.trim().length === 0)) {
    throw new Error("Ticket labels must be an array of non-empty strings")
  }
  if (!new Set(["open", "closed", "all"]).has(state)) throw new Error(`Ticket state must be open, closed, or all, got ${JSON.stringify(state)}`)
  if (milestone !== null && (typeof milestone !== "string" || milestone.trim().length === 0)) {
    throw new Error("Ticket milestone must be null or a non-empty string")
  }
  const tickets = ticketConfiguration()
  const args = ["issue", "list", "--repo", tickets.repository, "--state", state, "--limit", "1000", "--json", ISSUE_FIELDS]
  for (const label of labels) args.push("--label", label)
  if (milestone !== null) args.push("--milestone", milestone)
  args.push("--jq", LIST_STATE_REASON_FILTER)
  const [issueOutput, projectItems] = await Promise.all([runGh(args), readProjectItems(tickets)])
  const issues = parseGhJson(`gh ${args.join(" ")}`, issueOutput)
  if (!Array.isArray(issues)) throw new Error("gh issue list returned no issue array")
  return issues.map((issue) => normalizeTicket(issue, projectItems, tickets.repository))
}

export const assertRepositoryLabel = (ticket, repoKey) => {
  if (typeof repoKey !== "string" || repoKey.trim().length === 0) throw new Error("Repository key must be a non-empty string")
  if (!Array.isArray(ticket?.labels) || ticket.labels.some((label) => typeof label?.name !== "string")) {
    throw new Error("Ticket carries no valid labels array")
  }
  const repositoryLabels = ticket.labels.map((label) => label.name).filter((name) => name.startsWith("repo:"))
  if (repositoryLabels.length !== 1 || repositoryLabels[0] !== `repo:${repoKey}`) {
    const found = repositoryLabels.length === 0 ? "no repo:* label" : repositoryLabels.join(" and ")
    throw new Error(`Ticket carries ${found}; expected exactly repo:${repoKey}`)
  }
  return ticket
}
