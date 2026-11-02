import { commandWords, expandCommands } from "./command-expander.mjs"

// Ticket tracker invariant: writes to thomasluizon/orbit-tickets and its Projects v2
// board go through the repository tools. Reads stay open, as do issue and label writes
// whose command proves that a different repository is the target.

const TICKET_REPOSITORY = "thomasluizon/orbit-tickets"
const TICKET_PROJECT_OWNER = "thomasluizon"
const TICKET_PROJECT_NUMBER = "2"
const ISSUE_WRITES = new Set(["close", "comment", "create", "delete", "edit", "lock", "pin", "reopen", "transfer", "unlock", "unpin"])
const LABEL_READS = new Set(["list"])
const PROJECT_READS = new Set(["field-list", "item-list", "list", "view"])
const API_RESOURCES = /(?:^|\/)(?:issues?|labels?|milestones?|projects?)(?:\/|$)/i
const API_VALUE_FLAGS = new Set(["--cache", "--field", "-F", "--header", "-H", "--hostname", "--input", "--jq", "-q", "--method", "-X", "--preview", "-p", "--raw-field", "-f", "--template", "-t"])
const API_BOOLEAN_FLAGS = new Set(["--allow-escape-sequences", "--include", "-i", "--paginate", "--silent", "--slurp", "--verbose", "--help"])
// The shell removes backslash escapes and quote characters before gh sees argv, so `g''h`,
// `g"h"` and `\gh` all execute gh. Mirror that here, as _lib/rules-git.mjs already does, or a
// concatenated spelling walks past the word scan.
const unquote = (word) => word?.replace(/\\(.)/g, "$1").replace(/["']/g, "") ?? ""

const wordsOf = (segment) => commandWords(segment).map(unquote)

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
  const itemIndex = ghIndex(words) + 2
  const number = words[itemIndex + 1]?.startsWith("-") ? null : words[itemIndex + 1] ?? null
  if (!owner || !number || owner === "@me") return blocked(command, "The command does not prove which GitHub project it will mutate.")
  if (owner.toLowerCase() === TICKET_PROJECT_OWNER && number === TICKET_PROJECT_NUMBER) {
    return blocked(command, `The command mutates the ticket board ${TICKET_PROJECT_OWNER}/${TICKET_PROJECT_NUMBER}.`)
  }
  return null
}

function expandApiShortFlags(words) {
  const expanded = []
  let unknown = false
  for (let index = 0; index < words.length; index++) {
    const word = words[index]
    if (word === "--") {
      expanded.push(...words.slice(index))
      break
    }
    if (word.startsWith("--") || word === "-" || !/^-[A-Za-z]/.test(word)) {
      expanded.push(word)
      continue
    }
    let rest = word.slice(1)
    while (rest.length > 0) {
      const flag = `-${rest[0]}`
      rest = rest.slice(1)
      if (API_BOOLEAN_FLAGS.has(flag)) {
        expanded.push(flag)
        continue
      }
      if (API_VALUE_FLAGS.has(flag)) {
        expanded.push(flag)
        if (rest.length > 0) expanded.push(rest)
        rest = ""
        continue
      }
      unknown = true
      rest = ""
    }
  }
  return { expanded, unknown }
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
  const cluster = expandApiShortFlags(words.slice(apiIndex + 1))
  if (cluster.unknown) {
    return blocked(command, "The command carries a flag this guard cannot classify, so neither its method nor its endpoint can be proved.")
  }
  const { positionals, unknownArity } = apiPositionals(cluster.expanded, -1)
  const endpoint = positionals[0] ?? ""
  const method = apiMethod(cluster.expanded, -1)
  if (method === "GET") return null
  if (endpoint.toLowerCase() === "graphql") {
    // Read the EXPANDED words here too: `-iFquery=@payload.graphql` hides `-F` inside a cluster,
    // and reading the raw words let exactly that opaque payload through.
    const typedField = valueOf(cluster.expanded, ["-F", "--field"])
    const opaquePayload = valueOf(cluster.expanded, ["--input"]) !== null || /^query=@/.test(typedField ?? "")
    if (opaquePayload) return blocked(command, "The GraphQL request body is opaque, so the ticket target cannot be proved safe.")
    if (!/\bmutation\b/.test(command)) return null
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
  const nodeIndex = words.findIndex((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word))
  if (!/(?:^|[\\/])node(?:\.exe)?$/i.test(words[nodeIndex] ?? "")) return false
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
    else if (group === "label" && !LABEL_READS.has(action)) verdict = repositoryVerdict(words, command)
    else if (group === "project" && !PROJECT_READS.has(action)) verdict = projectVerdict(words, command)
    else if (group === "api") verdict = apiVerdict(words, index + 1, command)
    if (verdict) return verdict
  }
  return null
}

/** Verdict for a shell command or source text about to be written, or null to allow. */
export function checkTicketMutation(command, { sourcePath = "" } = {}) {
  if (/\.md$/i.test(sourcePath)) return null
  // The cheap pre-filter runs on a flattened copy: the shell turns `g''h` and `\gh` into gh, so
  // testing the raw text would bail out before the word normalization ever sees the invocation.
  if (typeof command !== "string") return null
  if (command.toLowerCase().includes(TICKET_REPOSITORY) || /--owner(?:=|\s+)thomasluizon/.test(command)) {
    const dynamic = expandCommands(command).some((segment) => {
      const words = wordsOf(segment)
      return words[0]?.startsWith("$") || words.some((word) => /^[A-Za-z_][A-Za-z0-9_]*=gh$/.test(word))
    })
    if (dynamic) return blocked(command, "A dynamic command cannot prove that the ticket target is read-only.")
  }
  if (!/\bgh(?:\.exe|\.cmd)?\b/i.test(command.replace(/\\(.)/g, "$1").replace(/["']/g, ""))) return null
  return scanSegments(expandCommands(command), command)
}
