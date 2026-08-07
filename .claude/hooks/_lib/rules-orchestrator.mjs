// Command (Bash and PowerShell) invariants for an orchestrating session: model spend routes
// through the launcher, and no agent performs an admin merge.
// Pure: they take the command string plus injected environment and cwd, and return
// { block, message } or null. The Claude Code PreToolUse orchestrator-guardrails hook calls
// these on BOTH tools, because the PowerShell tool fires no hook by default and that alone
// defeats every command guard in this repository.
//
// KNOWN BYPASSES, stated rather than implied, because an incomplete disclosed-bypass list is
// worse than none: it reads as exhaustive. This gate is cost-raising defence in depth and is
// NEVER the control: another tool that runs a shell with no PreToolUse matcher; a shell wrapper
// (`sh -c '<command>'`) whose inner text this never inspects; script-file indirection; and the
// cwd exemption, where an orchestrating session that changes directory into a launcher-created
// worktree gets the engine exemption. The admin-merge rule takes NO exemption.

import { stripHeredocBodies } from "./rules-git.mjs"
import { insideLinkedWorktree } from "./repo-roots.mjs"

/** The launcher exports this into every worker it starts (tools/launch-worker.mjs). */
const LAUNCHER_MARKER = "ORBIT_LAUNCH_WORKER"
const ENGINE_BINARIES = new Set(["claude", "codex"])
/** Subcommands that start no model session, so refusing them protects no budget and only breaks
 * ordinary preflight. `codex --version` was refused by the previous revision, which keyed on the
 * binary alone. */
const ZERO_COST_FLAGS = new Set(["--version", "-v", "--help", "-h", "help", "whoami", "--list", "login", "logout"])
const LEADING_ENV_ASSIGNMENT = /^\s*[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)(?:\s+|$)/
const LEADING_TOKEN = /^\s*("[^"]*"|'[^']*'|\S+)/
const PR_MERGE = /(?:^|\s)pr\s+merge(?:\s|$)/
const ADMIN_FLAG = /(?<![\w-])--admin(?![\w-])/
// `[=\s]*` and not `[= ]+`: curl's concatenated short form `-XPUT` carries no separator at all,
// and the quoted forms carry one on each side. rules-linear.mjs uses `[=\s]*` for the same reason.
const PUT_METHOD = /(?<![\w-])(?:-X|--method|--request)[=\s]*["']?PUT["']?(?![\w-])/i
const PULLS_MERGE_PATH = /repos\/[^/\s"']+\/[^/\s"']+\/pulls\/[^/\s"']+\/merge(?![\w-])/
const MERGE_MUTATION = /(?<![\w])mergePullRequest(?![\w])/
const API_CLIENTS = new Set(["gh", "curl", "wget", "http", "https", "httpie"])
// httpie takes the method as a POSITIONAL argument (`http PUT <url>`), never as a flag, so the
// flag-shaped PUT_METHOD above cannot match it. Measured 2026-08-04: `http PUT .../pulls/1/merge`
// was ALLOWED while the byte-identical curl call was blocked. A prohibition with a documented
// bypass is not a prohibition, and this is the one everything else rests on.
const HTTPIE_BINARIES = new Set(["http", "https", "httpie"])
const BARE_PUT = /(?<![\w-])PUT(?![\w-])/
const SHELL_WORD = /"[^"]*"|'[^']*'|\S+/g
const BROAD_ADD_FLAGS = new Set(["-A", "--all", "-u", "--update", "--renormalize"])
const COMMIT_VALUE_FLAGS = new Set(["-m", "--message", "-F", "--file", "-C", "--reuse-message", "-c", "--reedit-message", "--author", "--date", "--cleanup", "--trailer", "--fixup", "--squash"])

const isBroadPathspec = (argument, literalGlobally) => {
  const literalPrefix = argument.startsWith(":(literal)")
  const path = literalPrefix ? argument.slice(10) : argument
  if (!path || /^\.\/?$/.test(path)) return true
  return !literalGlobally && !literalPrefix && (/[*?[\]]/.test(path) || argument.startsWith(":"))
}

/**
 * Everything before the first real word: leading grouping punctuation and any number of
 * `NAME=value` assignments, skipped so `FOO=1 codex exec` still resolves to codex. The values are
 * discarded on purpose; nothing an agent types into a command exempts it.
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
 * extension. Matching HERE and not against the whole string is the point: `.claude/skills/...` is
 * a path, not the `claude` binary, and a commit message naming a command is data.
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

/**
 * Split on shell operators that are NOT inside quotes. Quote-awareness is the whole fix: the
 * previous revision split on a bare /[&|;\n]/, so `grep -rnE 'claude|codex' .` produced a phantom
 * second segment beginning `codex' .`, whose invoked binary resolved to `codex` and blocked a
 * read-only search. A search PATTERN is data, never an invocation.
 */
export function segmentsOf(command) {
  const source = stripHeredocBodies(command)
  const segments = []
  let current = ""
  let quote = ""
  for (const character of source) {
    if (quote) {
      if (character === quote) quote = ""
      current += character
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }
    if (character === "&" || character === "|" || character === ";" || character === "\n") {
      segments.push(current)
      current = ""
      continue
    }
    current += character
  }
  segments.push(current)
  return segments
}

const blocked = (command, why) => ({ block: true, message: `BLOCKED (Orbit orchestration guardrail):\n  ${command}\n\n${why}\n` })

/**
 * Refuse a raw engine invocation from an ORCHESTRATING session. It keys on WHO is calling, never
 * on the subcommand: after the headless flip `codex exec` is how every worker runs, so refusing
 * the flag would break the launcher itself. Permitted from a process carrying the launcher's
 * marker, from inside a launcher-created worktree, and for subcommands that start no session.
 */
export function checkEngineInvocation(command, { env = {}, cwd = "", repoRoots = [] } = {}) {
  if (typeof command !== "string") return null
  if (env[LAUNCHER_MARKER]) return null
  if (cwd && insideLinkedWorktree(cwd, repoRoots)) return null

  for (const segment of segmentsOf(command)) {
    if (!ENGINE_BINARIES.has(invokedBinary(segment))) continue
    const words = withoutLeadingAssignments(segment).trim().split(/\s+/).slice(1)
    if (words.some((word) => ZERO_COST_FLAGS.has(word.toLowerCase()))) continue
    return blocked(
      command,
      "An orchestrating session may not start a model session outside the launcher. Every worker\n" +
        "starts through `node tools/launch-worker.mjs`, which creates the worktree, composes the\n" +
        "work order, supervises the two clocks and records the worker PID. None of that happens\n" +
        "for a raw `codex` or `claude` invocation, so its worker is unsupervised.\n" +
        "The refusal is scoped to the CALLER, not the flag: the launcher itself, any command run\n" +
        "from inside a launcher-created worktree, and version or help queries are permitted.",
    )
  }
  return null
}

/** Workers stage only named paths. Broad staging can sweep prompt residue, generated output, or a
 * colleague's tracked `.orca/` edit into the commit. The rule applies only to launcher children and
 * linked worktrees; ordinary user Git outside a worker remains untouched. */
export function checkBroadStaging(command, { env = {}, cwd = "", repoRoots = [] } = {}) {
  if (typeof command !== "string") return null
  if (!env[LAUNCHER_MARKER] && !(cwd && insideLinkedWorktree(cwd, repoRoots))) return null
  for (const segment of segmentsOf(command)) {
    const source = withoutLeadingAssignments(segment)
    if (invokedBinary(source) !== "git") continue
    const words = (source.match(SHELL_WORD) ?? []).map((word) => word.replace(/^["']|["']$/g, ""))
    const commitIndex = words.findIndex((word, index) => index > 0 && word.toLowerCase() === "commit")
    if (commitIndex >= 0) {
      const literalGlobally = words.slice(1, commitIndex).includes("--literal-pathspecs")
      let afterSeparator = false
      let skipValue = false
      let broadCommit = false
      for (const argument of words.slice(commitIndex + 1)) {
        if (skipValue) {
          skipValue = false
          continue
        }
        if (!afterSeparator && argument === "--") {
          afterSeparator = true
          continue
        }
        if (!afterSeparator && argument.startsWith("-")) {
          if (["--all", "--interactive", "--patch"].includes(argument) || /^-[^-]*[aip]/.test(argument) || argument.startsWith("--pathspec")) broadCommit = true
          if (COMMIT_VALUE_FLAGS.has(argument)) skipValue = true
          continue
        }
        if (isBroadPathspec(argument, literalGlobally)) broadCommit = true
      }
      if (broadCommit) {
        return blocked(
          command,
          "Worker worktrees may not let `git commit -a/--all` stage every tracked change. Inspect\n" +
            "`git status --short`, stage each intended literal path by name, then commit without an\n" +
            "automatic staging flag. Tracked `.orca/` changes are source.",
        )
      }
    }
    // `git stage` is an exact synonym for `git add`; guarding only the canonical spelling leaves
    // every broad pathspec form available through the alias.
    const addIndex = words.findIndex((word, index) => index > 0 && ["add", "stage"].includes(word.toLowerCase()))
    if (addIndex < 0) continue
    const literalGlobally = words.slice(1, addIndex).includes("--literal-pathspecs")
    let afterSeparator = false
    let namedPaths = 0
    let broad = false
    for (const argument of words.slice(addIndex + 1)) {
      if (!afterSeparator && argument === "--") {
        afterSeparator = true
        continue
      }
      if (!afterSeparator && argument.startsWith("-")) {
        if (BROAD_ADD_FLAGS.has(argument) || /^-[^-]*[Au][^-]*$/.test(argument)) broad = true
        // Git accepts unambiguous long-option abbreviations (measured: --pathspec-from-f), so
        // matching only the documented full spelling leaves the same indirect staging bypass.
        if (argument.startsWith("--pathspec")) broad = true
        continue
      }
      namedPaths += 1
      if (isBroadPathspec(argument, literalGlobally)) broad = true
    }
    if (!broad && !(words.length > addIndex + 1 && namedPaths === 0)) continue
    return blocked(
      command,
      "Worker worktrees may stage only explicitly named literal paths. Bulk update flags, dot,\n" +
        "wildcards, and non-literal magic pathspecs can capture unrelated or runtime residue.\n" +
        "Inspect `git status --short`, then use `git --literal-pathspecs add` with each intended\n" +
        "path by name. Tracked `.orca/` changes are source.",
    )
  }
  return null
}

/**
 * Refuse the admin merge in every shape, with NO launcher or worktree exemption: the prohibition
 * is absolute for every agent, and forbidding only the CLI flag would leave both raw API paths
 * open, which is the exact bypass shape it exists to close.
 */
export function checkAdminMerge(command) {
  if (typeof command !== "string") return null
  for (const segment of segmentsOf(command)) {
    const binary = invokedBinary(segment)
    if (binary === "gh" && PR_MERGE.test(segment) && ADMIN_FLAG.test(segment)) {
      return blocked(command, adminMergeReason("`gh pr merge --admin`"))
    }
    if (!API_CLIENTS.has(binary)) continue
    const putMethod = PUT_METHOD.test(segment) || (HTTPIE_BINARIES.has(binary) && BARE_PUT.test(segment))
    if (putMethod && PULLS_MERGE_PATH.test(segment)) {
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
