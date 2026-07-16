// Agent-scoped shell allowlists — the structural half of a read-only agent's
// "never writes" promise. Pure: takes the command string and ONE agent's
// allowlist, returns { block, message } or null. The per-agent adapters in
// ../ are thin; the allowlists themselves are data, exported below.
//
// Why this exists at all: an agent's `tools:` frontmatter CANNOT scope Bash.
// `tools: Bash(gh:*)` silently resolves to bare `Bash` — full unscoped shell
// behind frontmatter that reads like a restriction. See the "Agent tool scoping"
// section of CLAUDE.md. A PreToolUse hook declared in the agent's own
// frontmatter is the only mechanism that scopes a shell to one agent.
//
// ORDER IS LOAD-BEARING. Metacharacters are rejected BEFORE the prefix match,
// because a prefix allowlist alone is not a fence: `git log && echo pwned > x.ts`
// starts with an allowed prefix and then writes a file. Rejecting `>` is what
// actually enforces "never writes" — withholding Edit/Write from `tools:` means
// nothing while Bash can redirect.

// Checked against the RAW command, so a shell-escaped metacharacter (`\&\&`) is
// caught too. `\` itself is NOT rejected: Windows paths need it, and /prime
// passes absolute `git -C "C:\Users\..."` paths.
const METACHARACTERS = [
  { test: /[&|;]/, why: "Command chaining (`&`, `|`, `;`) is not allowed — only one simple command per call." },
  { test: /[<>]/, why: "Redirection (`<`, `>`) is not allowed. This is the rule that makes 'never writes' structural: a shell that can redirect can write any file, whatever the tool list says." },
  { test: /\$/, why: "`$` is not allowed — it opens command substitution (`$(...)`) and variable expansion, both of which smuggle a second command past a prefix check." },
  { test: /`/, why: "Backtick command substitution is not allowed." },
  { test: /[\n\r]/, why: "Newlines are not allowed — a second line is a second command." },
]

// Quote-aware so `git -C "C:\path with spaces\repo" log` stays three tokens.
// Metacharacters are already rejected by the time this runs, so quotes cannot
// be hiding anything executable.
function tokenize(command) {
  const tokens = []
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match
  while ((match = pattern.exec(command)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3])
  }
  return tokens
}

// `git -C <dir>` only selects the repo, and /prime uses it to read the sibling
// repos, so it is allowed and stripped before the subcommand match. EVERY other
// pre-subcommand option is rejected, because `-c` is a code-execution channel:
// `git -c core.pager='!sh -c "..."' log` runs arbitrary shell through config and
// would otherwise walk straight through a subcommand allowlist.
function stripGitGlobalOptions(tokens) {
  let index = 1
  while (index < tokens.length && tokens[index].startsWith("-")) {
    if (tokens[index] !== "-C") return null
    index += 2
  }
  return [tokens[0], ...tokens.slice(index)]
}

const blocked = (agent, command, why) => ({
  block: true,
  message:
    `BLOCKED shell command (${agent} allowlist):\n  ${command}\n\n${why}\n` +
    `This agent is read-only: its shell is scoped to a fixed allowlist by a PreToolUse hook\n` +
    `declared in .claude/agents/${agent}.md. See the "Agent tool scoping" section of CLAUDE.md.\n`,
})

const describe = (allowlist) => allowlist.map((entry) => `  ${entry.join(" ")}`).join("\n")

/**
 * Verdict for one Bash command against one agent's allowlist.
 * @param {string} command raw command from the PreToolUse payload
 * @param {{allowlist: string[][], agent: string}} options the agent's allowed
 *   command prefixes (token arrays) and its name, used in the block message
 * @returns {{block: true, message: string} | null} null when allowed
 */
export function checkShellAllowlist(command, { allowlist, agent } = {}) {
  if (typeof command !== "string" || !Array.isArray(allowlist) || allowlist.length === 0) return null

  const metacharacter = METACHARACTERS.find((rule) => rule.test.test(command))
  if (metacharacter) return blocked(agent, command, metacharacter.why)

  let tokens = tokenize(command.trim())
  if (tokens.length === 0) return blocked(agent, command, "Empty command.")

  if (tokens[0] === "git") {
    const stripped = stripGitGlobalOptions(tokens)
    if (!stripped) {
      return blocked(
        agent,
        command,
        "`git` accepts only `-C <dir>` before the subcommand here. Options like `-c <key>=<value>` execute arbitrary code through git config (`core.pager`, `alias.*`), which would bypass this allowlist.",
      )
    }
    tokens = stripped
  }

  const allowed = allowlist.some((entry) => entry.every((token, index) => tokens[index] === token))
  if (allowed) return null

  return blocked(agent, command, `Not on the allowlist. This agent may run only:\n${describe(allowlist)}`)
}

// primer runs `/prime <N>` in single-issue mode and nothing else. That skill's
// only shell steps are the issue read and the recent-state read, so this list is
// exactly those three commands. It is deliberately NOT a general git/gh list:
// widening it is a reviewed change, not a convenience.
// Source: .claude/skills/prime/SKILL.md steps 1 and 4.
export const PRIMER_SHELL_ALLOWLIST = [
  ["gh", "issue", "view"],
  ["git", "log"],
  ["git", "branch", "--show-current"],
]
