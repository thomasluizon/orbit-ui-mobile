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
// `gh api` flag arity, read from `gh api --help` on gh 2.97.0 and confirmed against gh itself: a
// value flag answers "flag needs an argument", a boolean answers "accepts 1 arg(s), received 0".
const API_VALUE_FLAGS = new Set(["--cache", "--field", "-F", "--header", "-H", "--hostname", "--input", "--jq", "-q", "--method", "-X", "--preview", "-p", "--raw-field", "-f", "--template", "-t"])
const API_BOOLEAN_FLAGS = new Set(["--allow-escape-sequences", "--include", "-i", "--paginate", "--silent", "--slurp", "--verbose", "--help"])
// Names confirmed from the live GitHub Mutation schema. Pull-request review mutations are absent.
const GRAPHQL_TICKET_WRITE = /\b(?:addComment|addLabelsToLabelable|clearLabelsFromLabelable|removeLabelsFromLabelable|lockLockable|unlockLockable|minimizeComment|unminimizeComment|addSubIssue|removeSubIssue|reprioritizeSubIssue|(?:close|create|delete|pin|reopen|set|transfer|unmark|unpin|update)Issue(?:AsDuplicate|Comment|Field|FieldValue|IssueType|Type)?|(?:add|archive|clear|convert|copy|create|delete|link|mark|unarchive|unlink|unmark|update)ProjectV2\w*|(?:create|delete|update)Label|(?:create|delete|update)Milestone)\b/

const unquote = (word) => word?.replace(/^(?:"|')|(?:"|')$/g, "") ?? ""

/** Segments plus whether the parse ended inside a quote, which means it could not be trusted. */
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
  return { segments, unbalanced: quote !== "" }
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

/**
 * Positional arguments of `gh api`, resolved the way gh parses flags rather than by position.
 * `unknownArity` records a flag whose arity these tables do not know, which leaves the endpoint
 * unproved. Reading the endpoint as the word after `api` allowed every mutation that put a flag
 * first, because that word was `--method` and matched no ticket resource.
 */
function apiPositionals(words, apiIndex) {
  const positionals = []
  let unknownArity = false
  for (let index = apiIndex + 1; index < words.length; index++) {
    const word = words[index]
    if (word === "--") {
      positionals.push(...words.slice(index + 1))
      break
    }
    if (word === "-" || !word.startsWith("-")) {
      positionals.push(word)
      continue
    }
    if (word.startsWith("--")) {
      const name = word.includes("=") ? word.slice(0, word.indexOf("=")) : word
      if (!API_VALUE_FLAGS.has(name) && !API_BOOLEAN_FLAGS.has(name)) unknownArity = true
      else if (API_VALUE_FLAGS.has(name) && !word.includes("=")) index++
      continue
    }
    const short = word.slice(0, 2)
    if (API_VALUE_FLAGS.has(short)) {
      if (word.length === 2) index++
      continue
    }
    if (API_BOOLEAN_FLAGS.has(short) && word.length === 2) continue
    unknownArity = true
  }
  return { positionals, unknownArity }
}

function apiVerdict(words, apiIndex, command) {
  const { positionals, unknownArity } = apiPositionals(words, apiIndex)
  const endpoint = positionals[0] ?? ""
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
  // Every positional is tested, not only the endpoint, so a wrong arity guess above cannot let a
  // ticket target through: it can only add a candidate, never hide one.
  for (const candidate of positionals) {
    if (!API_RESOURCES.test(candidate)) continue
    if (restRepository(candidate)?.toLowerCase() === TICKET_REPOSITORY) {
      return blocked(command, `The API mutation targets ticket objects in ${TICKET_REPOSITORY}.`)
    }
  }
  if (!endpoint || unknownArity) return blocked(command, "The API mutation does not prove which endpoint it will call.")
  if (!API_RESOURCES.test(endpoint)) return null
  const repository = restRepository(endpoint)
  if (!repository) return blocked(command, "The API mutation does not prove which repository owns the ticket object.")
  if (/[{}]/.test(repository)) return blocked(command, "The API mutation uses an unresolved repository placeholder.")
  return null
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

function scanSegments(segments, command) {
  for (const segment of segments) {
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

/** Verdict for a shell command or source text about to be written, or null to allow. */
export function checkTicketMutation(command) {
  if (typeof command !== "string" || !/\bgh(?:\.exe|\.cmd)?\b/i.test(command)) return null
  const { segments, unbalanced } = shellSegments(command)
  const verdict = scanSegments(segments, command)
  if (verdict) return verdict
  if (!unbalanced) return null
  // The quote never closed, so a gh invocation can sit inside an unterminated blob and never be
  // parsed as its own segment. Re-split with the quotes neutralised and judge what surfaces: an
  // unparseable command has to fail closed, and this reaches the accurate reason for doing so.
  return scanSegments(shellSegments(command.replaceAll(String.fromCharCode(34), " ").replaceAll(String.fromCharCode(39), " ")).segments, command)
}
