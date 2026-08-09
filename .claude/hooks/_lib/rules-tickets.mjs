// Ticket tracker invariant: writes to thomasluizon/orbit-tickets and its Projects v2
// board go through the repository tools. Reads stay open, as do issue and label writes
// whose command proves that a different repository is the target.

const TICKET_REPOSITORY = "thomasluizon/orbit-tickets"
const TICKET_PROJECT_OWNER = "thomasluizon"
const TICKET_PROJECT_NUMBER = "2"
const SHELL_WORD = /"[^"]*"|'[^']*'|\S+/g
const ISSUE_WRITES = new Set(["close", "comment", "create", "delete", "edit", "lock", "pin", "reopen", "transfer", "unlock", "unpin"])
const LABEL_WRITES = new Set(["create", "delete", "edit"])
const PROJECT_ITEM_WRITES = new Set(["item-add", "item-archive", "item-create", "item-delete", "item-edit"])
const API_RESOURCES = /(?:^|\/)(?:issues?|labels?|milestones?|projects?)(?:\/|$)/i
// Names confirmed from the live GitHub Mutation schema. Pull-request review mutations are absent.
const GRAPHQL_TICKET_WRITE = /\b(?:addComment|addLabelsToLabelable|clearLabelsFromLabelable|removeLabelsFromLabelable|lockLockable|unlockLockable|minimizeComment|unminimizeComment|addSubIssue|removeSubIssue|reprioritizeSubIssue|(?:close|create|delete|pin|reopen|set|transfer|unmark|unpin|update)Issue(?:AsDuplicate|Comment|Field|FieldValue|IssueType|Type)?|(?:add|archive|clear|convert|copy|create|delete|link|mark|unarchive|unlink|unmark|update)ProjectV2\w*|(?:create|delete|update)Label|(?:create|delete|update)Milestone)\b/

const unquote = (word) => word?.replace(/^(?:"|')|(?:"|')$/g, "") ?? ""

function shellSegments(command) {
  const segments = []
  let current = ""
  let quote = ""
  for (const character of command) {
    if (quote) {
      current += character
      if (character === quote) quote = ""
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }
    if (["&", "|", ";", "\n"].includes(character)) {
      if (current.trim()) segments.push(current)
      current = ""
      continue
    }
    current += character
  }
  if (current.trim()) segments.push(current)
  return segments
}

const wordsOf = (segment) => (segment.match(SHELL_WORD) ?? []).map(unquote)

function ghIndex(words) {
  return words.findIndex((word) => /(?:^|[\\/])gh(?:\.exe|\.cmd)?$/i.test(word))
}

function valueOf(words, names) {
  for (let index = 0; index < words.length; index++) {
    if (names.includes(words[index])) return words[index + 1] ?? null
    for (const name of names) {
      if (words[index].startsWith(`${name}=`)) return words[index].slice(name.length + 1)
      if (/^-[A-Za-z]$/.test(name) && words[index].startsWith(name) && words[index].length > name.length) {
        return words[index].slice(name.length)
      }
    }
  }
  return null
}

function explicitRepository(words) {
  const flag = valueOf(words, ["--repo", "-R"])
  if (flag) return normalizeRepository(flag)
  const url = words.find((word) => /^https?:\/\/github\.com\/[^/]+\/[^/]+\/(?:issues|labels|milestones)(?:\/|$)/i.test(word))
  if (url) return normalizeRepository(url)
  const environment = words.find((word) => /^GH_REPO=/i.test(word))
  return environment ? normalizeRepository(environment.slice(environment.indexOf("=") + 1)) : null
}

function normalizeRepository(value) {
  const parts = value.replace(/^https?:\/\//i, "").replace(/\/(?:issues|labels|milestones)(?:\/.*)?$/i, "").split("/")
  if (parts.length >= 3 && parts[0].includes(".")) return parts.slice(1, 3).join("/")
  return parts.slice(0, 2).join("/")
}

function repositoryVerdict(words, command) {
  const repository = explicitRepository(words)
  if (!repository) return blocked(command, "The command does not prove which repository it will mutate.")
  if (/[{}]/.test(repository) || !repository.includes("/")) return blocked(command, "The command carries an unresolved repository target.")
  if (repository.toLowerCase() !== TICKET_REPOSITORY) return null
  return blocked(command, `The command mutates the ticket repository ${TICKET_REPOSITORY}.`)
}

function projectVerdict(words, command) {
  const owner = valueOf(words, ["--owner"])
  const itemIndex = words.findIndex((word) => PROJECT_ITEM_WRITES.has(word.toLowerCase()))
  const number = words[itemIndex + 1]?.startsWith("-") ? null : words[itemIndex + 1] ?? null
  if (!owner || !number || owner === "@me") return blocked(command, "The command does not prove which GitHub project it will mutate.")
  if (owner.toLowerCase() === TICKET_PROJECT_OWNER && number === TICKET_PROJECT_NUMBER) {
    return blocked(command, `The command mutates the ticket board ${TICKET_PROJECT_OWNER}/${TICKET_PROJECT_NUMBER}.`)
  }
  return null
}

function apiMethod(words, apiIndex) {
  const explicit = valueOf(words.slice(apiIndex + 1), ["--method", "-X"])
  if (explicit) return explicit.toUpperCase()
  const hasBody = words.slice(apiIndex + 1).some((word) => /^(?:-f|-F)(?:=|[^-]|$)/.test(word) || /^(?:--field|--raw-field|--input)(?:=|$)/.test(word))
  return hasBody ? "POST" : "GET"
}

function restRepository(endpoint) {
  const match = /(?:^|\/)repos\/([^/]+)\/([^/]+)\//i.exec(endpoint)
  return match ? `${match[1]}/${match[2]}` : null
}

function apiVerdict(words, apiIndex, command) {
  const endpoint = words[apiIndex + 1] ?? ""
  const method = apiMethod(words, apiIndex)
  if (method === "GET") return null
  if (endpoint.toLowerCase() === "graphql") {
    const typedField = valueOf(words.slice(apiIndex + 1), ["-F", "--field"])
    const opaquePayload = valueOf(words.slice(apiIndex + 1), ["--input"]) !== null || /^query=@/.test(typedField ?? "")
    if (opaquePayload) return blocked(command, "The GraphQL request body is opaque, so the ticket target cannot be proved safe.")
    if (!/\bmutation\b/.test(command) || !GRAPHQL_TICKET_WRITE.test(command)) return null
    const namesTicketRepository = command.toLowerCase().includes(TICKET_REPOSITORY)
    return blocked(command, namesTicketRepository ? "The GraphQL mutation names the ticket repository." : "The GraphQL mutation does not prove that its ticket object belongs to a different repository.")
  }
  if (!API_RESOURCES.test(endpoint)) return null
  const repository = restRepository(endpoint)
  if (!repository) return blocked(command, "The API mutation does not prove which repository owns the ticket object.")
  if (/[{}]/.test(repository)) return blocked(command, "The API mutation uses an unresolved repository placeholder.")
  if (repository.toLowerCase() !== TICKET_REPOSITORY) return null
  return blocked(command, `The API mutation targets ticket objects in ${TICKET_REPOSITORY}.`)
}

function sanctionedTool(words) {
  const nodeIndex = words.findIndex((word) => /(?:^|[\\/])node(?:\.exe)?$/i.test(word))
  if (nodeIndex === -1) return false
  const script = words[nodeIndex + 1]?.replaceAll("\\", "/") ?? ""
  return /(?:^|\/)tools\/[^/]+\.mjs$/i.test(script)
}

function blocked(command, detail) {
  return {
    block: true,
    message: `BLOCKED: raw ticket mutation.\n\n${detail}\nUse the repository tools, which validate the ticket target and response.\n`,
  }
}

/** Verdict for a shell command or source text about to be written, or null to allow. */
export function checkTicketMutation(command) {
  if (typeof command !== "string" || !/\bgh(?:\.exe|\.cmd)?\b/i.test(command)) return null
  for (const segment of shellSegments(command)) {
    const words = wordsOf(segment)
    if (sanctionedTool(words)) continue
    const index = ghIndex(words)
    if (index === -1) continue
    const group = words[index + 1]?.toLowerCase()
    const action = words[index + 2]?.toLowerCase()
    let verdict = null
    if (group === "issue" && ISSUE_WRITES.has(action)) verdict = repositoryVerdict(words, command)
    else if (group === "label" && LABEL_WRITES.has(action)) verdict = repositoryVerdict(words, command)
    else if (group === "project" && PROJECT_ITEM_WRITES.has(action)) verdict = projectVerdict(words, command)
    else if (group === "api") verdict = apiVerdict(words, index + 1, command)
    if (verdict) return verdict
  }
  return null
}
