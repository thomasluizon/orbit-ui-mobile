// Command (Bash and PowerShell) invariants for an orchestrating session: model spend routes
// through the launcher, and no agent performs an admin merge.
// Pure: they take the command string plus injected environment and cwd, and return
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
//   4. the cwd exemption: an orchestrating session that changes directory into any
//      launcher-created worktree gets the engine exemption. ACCEPTED by the specification,
//      which scopes the refusal to the caller rather than the command, and recorded here
//      because an accepted risk that is written down is a decision and one that is not is a
//      hole. Note the admin-merge rule takes NO exemption, so this does not reach it.
// The control for the admin merge is the prohibition itself, which ships in the worker
// contract, AGENTS.md and CLAUDE.md; the separate non-admin machine identity that would have
// closed it mechanically was declined (J3a).

import { stripHeredocBodies } from "./rules-git.mjs"
import { insideLinkedWorktree } from "./repo-roots.mjs"

/** The launcher exports this into every worker it starts (tools/launch-worker.mjs). */
const LAUNCHER_MARKER = "ORBIT_LAUNCH_WORKER"
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
 * refusing the flag would break the launcher itself. Permitted from a process carrying the
 * launcher's marker, and from inside a launcher-created worktree, which is a LINKED git
 * worktree of a declared repository and never the main checkout the orchestrator sits in.
 */
export function checkEngineInvocation(command, { env = {}, cwd = "", repoRoots = [] } = {}) {
  if (typeof command !== "string") return null
  if (env[LAUNCHER_MARKER]) return null
  if (cwd && insideLinkedWorktree(cwd, repoRoots)) return null

  // The marker is read from the ENVIRONMENT only. The launcher exports it on the spawn and
  // never shells out with an inline assignment, so a text-based exemption would exempt nothing
  // legitimate and everything an agent chose to type. Removed rather than softened.
  for (const segment of segmentsOf(command)) {
    if (!ENGINE_BINARIES.has(invokedBinary(segment))) continue
    return blocked(
      command,
      "An orchestrating session may not spend model budget outside the launcher. Every worker\n" +
        "starts through `node tools/launch-worker.mjs`, which reserves the budget, creates the\n" +
        "worktree, injects the standing worker contract and records the worker PID. None of that\n" +
        "happens for a raw `codex` or `claude` invocation, so its spend is invisible and its\n" +
        "worker is unsupervised.\n" +
        "This refusal is scoped to the CALLER, not the flag: the launcher itself, and any command\n" +
        "run from inside a launcher-created worktree, are permitted, `codex exec` included.",
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
