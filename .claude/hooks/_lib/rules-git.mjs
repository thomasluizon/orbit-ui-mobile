// Command (Bash) invariants — the git workflow guard and the Expo-SDK pin guard.
// Pure: they take the command string (and, for the bare-push case, a resolver so
// the module stays runtime-agnostic) and return { block, message } or null.
// Both the Claude Code PreToolUse(Bash) hooks and the opencode
// tool.execute.before plugin call these.

export function checkGitCommand(command, { resolveHeadBranch, cwd } = {}) {
  if (typeof command !== "string" || !/\bgit\b/.test(command)) return null

  const rules = [
    {
      test: /(?<![\w-])--no-verify\b/,
      why: "--no-verify skips the pre-commit/pre-push hooks. Fix what the hook flags, then commit normally.",
    },
    {
      test: /(?<![\w-])--no-gpg-sign\b|commit\.gpgsign\s*=\s*false/,
      why: "This bypasses commit signing. Let the commit sign as configured.",
    },
    {
      test: /\bgit\s+(?:-C\s+\S+\s+|-c\s+\S+\s+|-\S+\s+)*push\b[^&|;\n]*[\s:/](?:main|master)(?=$|[\s:])/,
      why: "Direct or force push to main is forbidden (branch protection, squash-merge only). Open a PR.",
    },
    {
      test: /\bgit\s+(?:-C\s+\S+\s+|-c\s+\S+\s+)*commit\s+(?:-[A-Za-z]\s+)*-n(?=\s|$)/,
      why: "`-n` is git's short alias for --no-verify on commit; it skips the pre-commit hooks. Commit normally.",
    },
  ]

  const hit = rules.find((rule) => rule.test.test(command))
  if (hit) {
    return {
      block: true,
      message:
        `BLOCKED git command (Orbit git workflow):\n  ${command}\n\n${hit.why}\n` +
        `The user has prevented this. See the "Git workflow" section of CLAUDE.md.\n`,
    }
  }

  // A bare push (no explicit main/master ref) issued while HEAD is on the
  // protected branch still lands on main. Resolve HEAD via the injected resolver.
  const segment = command.split(/[&|;\n]/).find((s) => /\bgit\b[\s\S]*\bpush\b/.test(s))
  if (segment && typeof resolveHeadBranch === "function") {
    const afterPush = segment.slice(segment.search(/\bpush\b/) + 4)
    const positional = afterPush.split(/\s+/).filter((token) => token && !token.startsWith("-"))
    if (positional.length <= 1) {
      const cMatch = /-C\s+("[^"]+"|'[^']+'|[^\s"']+)/.exec(segment)
      const dir = cMatch ? cMatch[1].replace(/^["']|["']$/g, "") : cwd
      let branch = null
      try {
        branch = resolveHeadBranch(dir)
      } catch {
        branch = null
      }
      if (branch && /^(?:main|master)$/.test(branch)) {
        return {
          block: true,
          message:
            `BLOCKED git command (Orbit git workflow):\n  ${command}\n\n` +
            `HEAD is on '${branch}'. Pushing from the protected branch is forbidden — switch to a feature branch and open a PR.\n`,
        }
      }
    }
  }

  return null
}

export function checkNpmExpoPin(command) {
  if (typeof command !== "string" || !/\bnpm\b/.test(command)) return null

  if (/\bnpm\s+(?:update|upgrade|up)\b/.test(command)) {
    return {
      block: true,
      message:
        `BLOCKED npm command (Expo SDK pin):\n  ${command}\n\n` +
        "`npm update`/`upgrade` bulk-bumps the Expo-pinned tree. Use `npx expo install` for SDK packages, or the /dep-sweep skill for a controlled sweep.\n",
    }
  }

  if (/\bnpm\s+(?:i|install|add)\b[^&|;]*\s(?:expo(?:-[\w.-]+)?|react-native(?:-[\w.-]+)?|hermes-compiler|nativewind)@/.test(command)) {
    return {
      block: true,
      message:
        `BLOCKED npm command (Expo SDK pin):\n  ${command}\n\n` +
        "That package's version is managed by the Expo SDK 57 pin. Install it with `npx expo install <pkg>` so it resolves to the SDK-correct, ABI-compatible version.\n",
    }
  }

  return null
}
