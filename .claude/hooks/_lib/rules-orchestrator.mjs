// Command (Bash and PowerShell) invariants for an orchestrating session: model spend routes
// through the launcher, and no agent performs an admin merge.
// Pure: they take the command string plus injected environment and return
// { block, message } or null. The Claude Code PreToolUse orchestrator-guardrails hook calls
// these on BOTH tools, because the PowerShell tool fires no hook by default and that alone
// defeats every command guard in this repository.
//
// KNOWN BYPASSES, stated here rather than implied, because a disclosed-bypass list that is
// incomplete is worse than none: it gets read as exhaustive. This gate is cost-raising defence
// in depth and is NEVER the control:
//   1. another tool that runs a shell without a PreToolUse matcher,
//   2. a shell wrapper (`sh -c '<command>'`), whose inner text this never inspects,
//   3. script-file indirection (write a two-line script, then run the script),
//   4. a manually exported launcher marker can imitate the environment exemption. The
//      completion gate separately requires a launcher-issued provenance receipt tied to the
//      worker process, worktree, issue and configured headless invocation.
// The control for the admin merge is the prohibition itself, which ships in the worker
// contract, AGENTS.md and CLAUDE.md; the separate non-admin machine identity that would have
// closed it mechanically was declined (J3a).

import { stripHeredocBodies } from "./rules-git.mjs"

/** Each approved launcher exports its own marker into the model process it starts. */
const LAUNCHER_MARKERS = ["ORBIT_LAUNCH_WORKER", "ORBIT_LAUNCH_PR_REVIEW"]
const ENGINE_BINARIES = new Set(["claude", "codex"])
const LEADING_ENV_ASSIGNMENT = /^\s*[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)(?:\s+|$)/
const LEADING_TOKEN = /^\s*("[^"]*"|'[^']*'|\S+)/
const PR_MERGE = /(?:^|\s)pr\s+merge(?:\s|$)/
const ADMIN_FLAG = /(?<![\w-])--admin(?![\w-])/
// `[=\s]*` and not `[= ]+`: curl's concatenated short form `-XPUT` carries no separator at all,
// and the quoted forms carry one on each side. rules-linear.mjs already uses `[=\s]*` for the
// same reason, so the two files agree. A gate fixed for exactly the example it was shown is the
// defect this ticket exists to remove, so every shape an agent would type has its own case.
const PUT_METHOD = /(?<![\w-])(?:-X|--method|--request)[=\s]*["']?PUT["']?(?![\w-])/i
const PULLS_MERGE_PATH = /repos\/[^/\s"']+\/[^/\s"']+\/pulls\/[^/\s"']+\/merge(?![\w-])/
const MERGE_MUTATION = /(?<![\w])mergePullRequest(?![\w])/
const API_CLIENTS = new Set(["gh", "curl", "wget", "http", "httpie"])

/**
 * Everything before the first real word: leading grouping punctuation and any number of
 * `NAME=value` assignments, which are skipped so `FOO=1 codex exec` still resolves to codex.
 * The values are discarded on purpose; nothing an agent types into a command exempts it.
 */
function withoutLeadingAssignments(segment) {
  let rest = segment.replace(/^[\s(){]*/, "")
  let assignment = LEADING_ENV_ASSIGNMENT.exec(rest)
  while (assignment) {
    rest = rest.slice(assignment[0].length)
    assignment = LEADING_ENV_ASSIGNMENT.exec(rest)
  }
  return rest
}

/**
 * The binary a segment actually invokes, lowercased and stripped of directory and Windows
 * extension. Matching HERE and not against the whole string is the point: `.claude/skills/...`
 * is a path, not the `claude` binary, and a commit message naming a command is data. Reading
 * an arbitrary payload as an invocation is root cause 3 and this gate must not commit it.
 */
export function invokedBinary(segment) {
  const token = LEADING_TOKEN.exec(withoutLeadingAssignments(segment))
  if (!token) return ""
  return token[1]
    .replace(/^["']|["']$/g, "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/\.(?:exe|cmd|bat|ps1)$/i, "")
    .toLowerCase()
}

const segmentsOf = (command) => stripHeredocBodies(command).split(/[&|;\n]/)

const blocked = (command, why) => ({ block: true, message: `BLOCKED (Orbit orchestration guardrail):\n  ${command}\n\n${why}\n` })

/**
 * Refuse a raw engine invocation from an ORCHESTRATING session. It keys on WHO is calling,
 * never on the subcommand: after the headless flip `codex exec` is how every worker runs, so
 * refusing the flag would break the launcher itself. Permitted only from a process carrying the
 * launcher's environment marker. A worktree path alone is not worker provenance. Delivery
 * additionally requires the launcher's signed completion receipt for the exact PR head.
 */
export function checkEngineInvocation(command, { env = {} } = {}) {
  if (typeof command !== "string") return null
  if (LAUNCHER_MARKERS.some((marker) => env[marker])) return null

  // The marker is read from the ENVIRONMENT only. The launcher exports it on the spawn and
  // never shells out with an inline assignment, so a text-based exemption would exempt nothing
  // legitimate and everything an agent chose to type. Removed rather than softened.
  for (const segment of segmentsOf(command)) {
    if (!ENGINE_BINARIES.has(invokedBinary(segment))) continue
    return blocked(
      command,
      "An orchestrating session may not spend model budget outside an approved launcher.\n" +
        "Implementation workers start through `node tools/launch-worker.mjs`; independent pull\n" +
        "request reviews start through `node tools/launch-pr-review.mjs`. Each reserves and\n" +
        "records its budget and gives the model its own bounded contract. None of that happens\n" +
        "for a raw `codex` or `claude` invocation, so its spend is invisible and unsupervised.\n" +
        "This refusal is scoped to the CALLER, not the flag: the launcher itself carries the\n" +
        "environment marker, while a manually opened TUI or ad hoc `codex exec` does not.",
    )
  }
  return null
}

/**
 * Refuse the admin merge in every shape, with NO launcher or worktree exemption: J3a's
 * prohibition is absolute for every agent, and forbidding only the CLI flag would leave both
 * raw API paths open, which is the exact bypass shape it exists to close.
 */
export function checkAdminMerge(command) {
  if (typeof command !== "string") return null
  for (const segment of segmentsOf(command)) {
    const binary = invokedBinary(segment)
    if (binary === "gh" && PR_MERGE.test(segment) && ADMIN_FLAG.test(segment)) {
      return blocked(command, adminMergeReason("`gh pr merge --admin`"))
    }
    if (!API_CLIENTS.has(binary)) continue
    if (PUT_METHOD.test(segment) && PULLS_MERGE_PATH.test(segment)) {
      return blocked(command, adminMergeReason("a direct `PUT /repos/{owner}/{repo}/pulls/{number}/merge`"))
    }
    if (MERGE_MUTATION.test(segment)) {
      return blocked(command, adminMergeReason("a direct GraphQL `mergePullRequest` mutation"))
    }
  }
  return null
}

function adminMergeReason(shape) {
  return (
    `${shape} performs an administrator merge, which bypasses the required checks.\n` +
    "The override exists for Thomas alone. If a merge genuinely needs one, STOP and ask him to\n" +
    "merge it himself; never perform the override yourself.\n" +
    "See the git conventions in CLAUDE.md and the guardrails in AGENTS.md."
  )
}
