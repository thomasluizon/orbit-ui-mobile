// Command (Bash) invariants — the git workflow guard and the Expo-SDK pin guard.
// Pure: they take the command string (and, for the bare-push case, a resolver so
// the module stays runtime-agnostic) and return { block, message } or null.
// Both the Claude Code PreToolUse(Bash) hooks and the opencode
// tool.execute.before plugin call these.

// Branch protection is Orbit's, not a universal law. These three repos have it;
// a session launched from orbit-ui-mobile routinely drives sibling repos (the
// brain vault, thomas-brain) whose sanctioned workflow IS direct-to-main, and
// blocking those was a false positive that forced a manual push workaround.
const PROTECTED_REPOS = ["orbit-ui-mobile", "orbit-api", "orbit-landing-page"]

const unquote = (token) => token.replace(/^["']|["']$/g, "")

function repoNameFrom(remoteUrl) {
  if (typeof remoteUrl !== "string") return null
  const trimmed = remoteUrl.trim().replace(/\.git$/, "")
  return trimmed ? (trimmed.split(/[/:]/).filter(Boolean).pop() ?? null) : null
}

// Fails SAFE: when the target repo cannot be resolved, assume it is protected.
// Wrongly blocking a push is recoverable; wrongly allowing one onto main is not.
function targetsProtectedRepo(dir, resolveRemoteUrl) {
  if (typeof resolveRemoteUrl !== "function") return true
  try {
    const name = repoNameFrom(resolveRemoteUrl(dir))
    return name ? PROTECTED_REPOS.includes(name) : true
  } catch {
    return true
  }
}

// The push may target another repo: `git -C <dir> push`, or a `cd <dir> &&`
// earlier in the same chain. Honor both before falling back to the session cwd.
function pushTargetDir(segments, pushIndex, cwd) {
  const cMatch = /-C\s+("[^"]+"|'[^']+'|[^\s"']+)/.exec(segments[pushIndex])
  if (cMatch) return unquote(cMatch[1])
  for (let index = pushIndex - 1; index >= 0; index--) {
    const cdMatch = /(?:^|\s)cd\s+("[^"]+"|'[^']+'|[^\s"']+)/.exec(segments[index])
    if (cdMatch) return unquote(cdMatch[1])
  }
  return cwd
}

// A heredoc body is data, not command flags: `git commit -F -` with a message
// that mentions the no-verify flag is writing ABOUT it, not using it, and the
// guard blocking that is a false positive. Strip heredoc bodies before matching.
//
// Exception: when the heredoc feeds a shell, its body IS commands and stays in
// scope. That check is anchored to the consumer immediately before each `<<`,
// never searched across the whole string: a body that merely MENTIONS `bash <<`
// would otherwise switch its own stripping off, which is the same
// text-is-not-command bug one level down.
const heredoc = /^([^\n]*?)<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2([^\n]*)\n[\s\S]*?^\3[ \t]*$/gm

function stripHeredocBodies(command) {
  return command.replace(heredoc, (match, beforeOperator, _quote, _tag, restOfLine) =>
    /\b(?:ba|z)?sh[ \t]+$/.test(beforeOperator) ? match : `${beforeOperator}${restOfLine}`,
  )
}

const blocked = (command, why) => ({
  block: true,
  message:
    `BLOCKED git command (Orbit git workflow):\n  ${command}\n\n${why}\n` +
    `The user has prevented this. See the "Git workflow" section of CLAUDE.md.\n`,
})

export function checkGitCommand(command, { resolveHeadBranch, resolveRemoteUrl, cwd } = {}) {
  if (typeof command !== "string" || !/\bgit\b/.test(command)) return null

  // Match against the command only. The full string, heredoc bodies included,
  // is still what gets shown back in the block message.
  const scannable = stripHeredocBodies(command)

  // Hygiene rules are universal: bypassing hooks or signing is wrong anywhere.
  const hygieneRules = [
    {
      test: /(?<![\w-])--no-verify\b/,
      why: "--no-verify skips the pre-commit/pre-push hooks. Fix what the hook flags, then commit normally.",
    },
    {
      test: /(?<![\w-])--no-gpg-sign\b|commit\.gpgsign\s*=\s*false/,
      why: "This bypasses commit signing. Let the commit sign as configured.",
    },
    {
      test: /\bgit\s+(?:-C\s+\S+\s+|-c\s+\S+\s+)*commit\s+(?:-[A-Za-z]\s+)*-n(?=\s|$)/,
      why: "`-n` is git's short alias for --no-verify on commit; it skips the pre-commit hooks. Commit normally.",
    },
  ]
  const hit = hygieneRules.find((rule) => rule.test.test(scannable))
  if (hit) return blocked(command, hit.why)

  // Everything below is branch protection, so it applies only to the repos that
  // actually have it.
  const segments = scannable.split(/[&|;\n]/)

  // Each push in a chained command is judged on its own target. An early push to
  // an unprotected sibling repo must never vouch for a later push to a protected
  // main, and a protected push must not be blamed for a `main` ref belonging to a
  // different segment.
  for (const [index, segment] of segments.entries()) {
    if (!/\bgit\b[\s\S]*\bpush\b/.test(segment)) continue
    const targetDir = pushTargetDir(segments, index, cwd)
    if (!targetsProtectedRepo(targetDir, resolveRemoteUrl)) continue

    if (/\bgit\s+(?:-C\s+\S+\s+|-c\s+\S+\s+|-\S+\s+)*push\b[^&|;\n]*[\s:/](?:main|master)(?=$|[\s:])/.test(segment)) {
      return blocked(command, "Direct or force push to main is forbidden (branch protection, squash-merge only). Open a PR.")
    }

    // A bare push (no explicit main/master ref) issued while HEAD is on the
    // protected branch still lands on main. Resolve HEAD via the injected resolver.
    if (typeof resolveHeadBranch !== "function") continue
    const afterPush = segment.slice(segment.search(/\bpush\b/) + 4)
    const positional = afterPush.split(/\s+/).filter((token) => token && !token.startsWith("-"))
    if (positional.length > 1) continue
    let branch = null
    try {
      branch = resolveHeadBranch(targetDir)
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
