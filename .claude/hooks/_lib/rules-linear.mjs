// Linear invariant: a WRITE to Linear goes through the orca CLI, never through
// hand-rolled GraphQL. Pure: takes the command (or file) text and returns
// { block, message } or null.
//
// Why a gate and not a rule: the prose rule already existed ("reach for the tool
// directly, do not hand-roll what the tool already does", ~/.claude/rules/
// tooling-defaults.md), was loaded in context, and was broken anyway on
// 2026-07-25 - a 190-line GraphQL reimplementation of `orca linear create`, and
// before that a create whose validation ran against a GUESSED identifier and so
// passed against an unrelated issue. A ninth prose rule is more of the thing
// that already failed.
//
// READS stay open. `project(id) { content }` has no orca equivalent (project
// list returns no content field) and /orchestrate depends on it, so this gate
// is scoped to mutations only.

// Every issue-level write orca covers, and the command that covers it. A
// mutation absent from this map is not automatically fine; the ALLOWED set
// below is what decides. This map only makes the block message actionable.
const ORCA_EQUIVALENT = {
  issueCreate: "node tools/new-ticket.mjs --title ... --project ... --body-file -",
  issueUpdate: "orca linear save-issue (or status set / priority set / estimate set / due-date set / assignee set)",
  issueDelete: "orca linear save-issue",
  issueArchive: "orca linear save-issue",
  commentCreate: "orca linear comment add",
  issueRelationCreate: "orca linear relation add",
  issueRelationDelete: "orca linear relation remove",
  issueAddLabel: "orca linear label add",
  issueRemoveLabel: "orca linear label remove",
  attachmentCreate: "orca linear attach",
  attachmentLinkURL: "orca linear attach",
}

// The ONLY Linear writes with no orca command. `orca linear` exposes project
// list and nothing else for projects, so the project overview document - where
// /feature stores the locked decisions and #539 stores targetBranch (D36) - is
// unreachable any other way.
const ALLOWED = new Set(["projectCreate", "projectUpdate"])

const ENDPOINT = /api\.linear\.app/

// A payload read from a file is opaque to this gate, so a mutation hidden behind
// `-d @payload.json` would sail past a keyword scan. Inline reads are unaffected:
// this matches only the file-reference form.
const OPAQUE_PAYLOAD = /--data(?:-binary|-raw|-urlencode)?[= ]\s*@|(?:^|\s)-d[= ]?\s*@/

/**
 * Root field names of every GraphQL mutation operation in the text.
 * Returns null when a mutation keyword is present but no field could be read,
 * which is the fail-safe case: an unreadable mutation cannot be shown to be one
 * of the two allowed ones.
 */
export function mutationFields(text) {
  const fields = []

  // `\bmutation\b` alone also matches inside `forbid-raw-linear-mutation`, since
  // `-` is a word boundary. Requiring a non-hyphen, non-underscore neighbour
  // keeps the keyword scan on GraphQL and off identifiers that merely contain
  // the word - measured on this repo's own skill docs.
  for (const match of text.matchAll(/(?<![-\w])mutation(?![-\w])/g)) {
    const open = text.indexOf("{", match.index)
    if (open === -1) continue
    let depth = 0
    let found = false
    // Shorthand, common in prose and in a command that names the operation and
    // its body in separate strings: `mutation \`projectCreate(input: {...})\``.
    // The first brace is then the INPUT object, not the selection set, so the
    // depth walk below finds only argument keys and reports unreadable. Judge
    // such a form on the first call-shaped identifier after the keyword.
    const shorthand = /^[^{]*?\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(text.slice(match.index + "mutation".length, open + 1))
    for (let index = open; index < text.length; index++) {
      const char = text[index]
      if (char === "{") {
        depth++
        continue
      }
      if (char === "}") {
        depth--
        if (depth === 0) break
        continue
      }
      if (depth !== 1) continue
      // At depth 1 an identifier is a root mutation field (or its alias, which
      // is followed by `:` and skipped in favour of the real field after it).
      const rest = /^([A-Za-z_][A-Za-z0-9_]*)\s*([:({])/.exec(text.slice(index))
      if (!rest) continue
      index += rest[1].length - 1
      if (rest[2] === ":") continue
      fields.push(rest[1])
      found = true
    }
    if (!found && shorthand) fields.push(shorthand[1])
  }

  // An occurrence that parses to no field at all is prose, not an operation: a
  // real call always has a root field. The fail-safe deliberately does NOT live
  // here - it lives in OPAQUE_PAYLOAD, which is the only form that genuinely
  // hides a mutation. Blocking every paragraph that says "mutation" near a
  // Linear URL is the kind of noise that gets a gate switched off, and the
  // threat model is an accident, not an adversary.
  return fields
}

function message(offenders) {
  const lines = offenders.map((field) => {
    const equivalent = ORCA_EQUIVALENT[field]
    return equivalent ? `  ${field} -> ${equivalent}` : `  ${field} -> see \`orca linear --help\``
  })
  return `BLOCKED: raw GraphQL mutation against api.linear.app.

Every Linear write orca covers must go through orca, so the result is the one
the API reported rather than one assumed by the caller:

${lines.join("\n")}

Reads are fine, including \`project(id) { content }\`, which orca cannot do.
The only mutations allowed raw are projectCreate and projectUpdate, for the
project overview document, which orca also cannot do.
`
}

/** Verdict for a shell command about to run, or null to allow. */
export function checkLinearMutation(text) {
  if (typeof text !== "string" || !ENDPOINT.test(text)) return null
  const fields = OPAQUE_PAYLOAD.test(text) ? null : mutationFields(text)
  if (fields === null) {
    return {
      block: true,
      message: `BLOCKED: a request to api.linear.app whose GraphQL operation could not be read.

Fails safe: an operation this gate cannot see cannot be shown to be a read, or
one of the two allowed mutations (projectCreate, projectUpdate). Use the orca
CLI for the write, or inline the query so the gate can see what it targets.
`,
    }
  }
  const offenders = fields.filter((field) => !ALLOWED.has(field))
  return offenders.length ? { block: true, message: message([...new Set(offenders)]) } : null
}
