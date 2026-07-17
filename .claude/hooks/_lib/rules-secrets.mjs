// Command (Bash) secret-hygiene invariant: a literal credential must never be
// typed into argv. argv is echoed into shell history, the session transcript,
// and every process listing on the box, so a secret passed this way is leaked
// three ways before the command even runs. Pure; called by the Claude Code
// PreToolUse(Bash) hook and the opencode tool.execute.before plugin.

import { stripHeredocBodies } from "./rules-git.mjs"

// A variable reference is the CORRECT way to pass a credential: `--token $GH_PAT`
// puts no secret in history or the transcript. Blocking it would push the author
// toward pasting the literal instead, which is the thing this guard exists to
// stop. The residual process-listing exposure is local-only and is the accepted
// trade; the threat model here is history/transcript, not a local ps sniffer.
const VARIABLE_REFERENCE = /^(?:\$\w+|\$\{[^}]+\}|["']?\$(?:\w+|\{[^}]+\})["']?)$/

const isLiteral = (value) => {
  const trimmed = String(value ?? "").trim()
  if (!trimmed) return false
  return !VARIABLE_REFERENCE.test(trimmed)
}

const RULES = [
  {
    // `(?<![\w-])` keeps `--with-token` (gh's stdin form) from matching `--token`.
    pattern: /(?<![\w-])--(?:token|api-key)(?:=|\s+)(\S+)/gi,
    label: (match) => `${match[0].split(/[=\s]/)[0]} carries a literal value`,
  },
  {
    pattern: /Authorization:\s*Bearer\s+(\S+)/gi,
    label: () => "an Authorization: Bearer header carries a literal token",
  },
  {
    pattern: /(?<![\w-])(VERCEL_TOKEN|GITHUB_TOKEN|GH_TOKEN|STRIPE_[A-Z0-9_]*KEY)=(\S*)/g,
    label: (match) => `${match[1]}= is assigned a literal value inline`,
  },
]

export function checkSecretInArgv(command) {
  if (typeof command !== "string" || !command) return null
  // A heredoc body is data: documenting `--token` in a commit message or a PR
  // body is writing ABOUT it, not passing one. Same reasoning as rules-git.mjs.
  const scannable = stripHeredocBodies(command)

  const findings = []
  for (const rule of RULES) {
    for (const match of scannable.matchAll(rule.pattern)) {
      const value = match[match.length - 1]
      if (!isLiteral(value)) continue
      findings.push(rule.label(match))
    }
  }
  if (!findings.length) return null

  return {
    block: true,
    // The command is deliberately NOT echoed back: it contains the secret, and
    // the block message lands in the transcript this guard exists to keep clean.
    message:
      "BLOCKED command (secret in argv):\n" +
      findings.map((f) => `  - ${f}`).join("\n") +
      "\n\nargv is echoed into shell history, the session transcript, and process listings.\n" +
      "Pass the credential by reference instead:\n" +
      "  - export it once and use the variable (`--token \"$GH_TOKEN\"`), or\n" +
      "  - let the tool read its own configured auth (`gh` already holds a token), or\n" +
      "  - feed it on stdin (`gh auth login --with-token < file`).\n" +
      "If this credential was already pasted anywhere, rotate it.\n",
  }
}
