import { commandsFedBy, commandWords, expandCommands, heredocScan, heredocsOf, hereStringTexts, inspectCommands, looseReadings, shellValue, SUBSTITUTION, withoutRedirects } from "./command-expander.mjs"
import { resolve } from "node:path"

// Only these three repositories protect main; other repositories may allow direct pushes.
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
function pushTargetDir(segment, cwd) {
  let directory = cwd
  for (const match of segment.matchAll(/(?:^|\s)-C\s+("[^"]+"|'[^']+'|[^\s"']+)/g)) directory = resolve(directory, unquote(match[1]))
  return directory
}

/** An unquoted heredoc expands command substitutions before its consumer starts. */
export function unquotedHeredocRunsCommand(command) {
  for (const { quote, body } of heredocsOf(command)) {
    if (quote !== "") continue
    const escapedAt = (index) => {
      let backslashes = 0
      for (let cursor = index - 1; cursor >= 0 && body[cursor] === "\\"; cursor--) backslashes++
      return backslashes % 2 === 1
    }
    for (let index = 0; index < body.length; index++) {
      if (body[index] === "`" && !escapedAt(index)) return true
      if (body[index] === "$" && body[index + 1] === "(" && body[index + 2] !== "(" && !escapedAt(index)) return true
    }
  }
  return false
}

/** The shells that read standard input as a script. */
export const SHELLS = ["bash", "sh", "zsh", "dash", "ksh", "mksh", "ash", "hush", "rbash"]
/**
 * Option letters that take the next word in a shell of `SHELLS`: `o` (POSIX `sh`), `O` (bash), `R` (ksh) and `T` (mksh).
 * A letter that takes no word in the shell at hand keeps a body that is data, so the rules refuse more, never less.
 */
const LETTERS_WITH_ARGUMENT = new Set(["o", "O", "R", "T"])
/** Long options that take the next word: `--rcfile` and `--init-file` in bash, `--emulate` in zsh. */
const LONG_OPTIONS_WITH_ARGUMENT = new Set(["--rcfile", "--init-file", "--emulate"])
/** Stands for the heredoc operator, so that the shell parser finds the commands that read the body. */
const HEREDOC_OPERATOR = "__heredoc_operator__"

/** The words of a simple command, without its redirects. A here-string is a redirect of standard input, so it is no argument. */
const argumentsOf = (command) => commandWords(withoutRedirects(command, { keepHereStrings: false })).map(shellValue)

const isShell = (word) => SHELLS.includes(word.split(/[\\/]/).pop())
const holdsSubstitution = (words) => words.some((word) => word.includes(SUBSTITUTION))
/** True for a command in which `accepts` holds for the words after a word that `isCommandWord` names. A wrapper such as `env` or `exec` can come first. */
const hasWordThat = (command, isCommandWord, accepts) => {
  const words = argumentsOf(command)
  return words.some((word, index) => isCommandWord(word) && accepts(words.slice(index + 1)))
}

/**
 * True when the words after a shell word leave it no script file, so it reads its script from standard input.
 * Each option letter in `LETTERS_WITH_ARGUMENT` takes one word. After `-s`, each word that is not an option is a positional argument.
 */
function readsStandardInput(words) {
  let positionalArguments = false
  for (let index = 0; index < words.length; index++) {
    const word = words[index]
    if (/^[-+]-?$/.test(word)) return positionalArguments || index === words.length - 1
    if (/^[-+]-/.test(word)) {
      if (LONG_OPTIONS_WITH_ARGUMENT.has(word)) index++
      continue
    }
    if (!/^[-+]./.test(word)) return positionalArguments
    for (const letter of word.slice(1)) {
      if (letter === "s") positionalArguments = true
      if (LETTERS_WITH_ARGUMENT.has(letter)) index++
    }
  }
  return true
}

/**
 * True when the words after a shell word have `-c` and then a command substitution: the shell runs the text of the substitution.
 * Each word after `-c` counts, also a positional argument, so the rules refuse more, never less.
 */
function runsSubstitution(words) {
  const flag = words.findIndex((word) => /^-[A-Za-z]*c[A-Za-z]*$/.test(word))
  return flag >= 0 && holdsSubstitution(words.slice(flag + 1))
}

/**
 * True when a command substitution is the command word: the shell runs the words of its output as a command.
 * An assignment with a value can come first, also in its append form `y+=1`. `x=$(` is an assignment with no value before the substitution, so it is data.
 */
const substitutionIsCommandWord = (command) =>
  (argumentsOf(command).find((word) => !/^[A-Za-z_]\w*\+?=./.test(word)) ?? "").startsWith(SUBSTITUTION)

/**
 * True when a shell runs the heredoc as a script. Redirects do not count.
 * - A reader of the body has a shell word, by name or by path, followed only by options and, after `-s`, positional arguments.
 * - A command that holds the body in a command substitution is a shell with a command string after `-c`, or `eval`, or has
 *   the substitution as its command word.
 */
function feedsShell(beforeOperator, restOfLine) {
  const { readers, holders } = commandsFedBy(`${beforeOperator} ${HEREDOC_OPERATOR} ${restOfLine}`, HEREDOC_OPERATOR)
  return readers.some((command) => hasWordThat(command, isShell, readsStandardInput)) ||
    holders.some((command) => substitutionIsCommandWord(command) || hasWordThat(command, isShell, runsSubstitution) ||
      hasWordThat(command, (word) => word === "eval", holdsSubstitution))
}

/** Strip heredoc bodies so a message that NAMES a flag is not read as using it. A body that a shell reads stays; a file named `x.sh` is not a shell. */
export function stripHeredocBodies(command) {
  let kept = ""
  let cursor = 0
  for (const { start, end, lineStart, restOfLine } of heredocsOf(command)) {
    if (feedsShell(command.slice(lineStart, start), restOfLine)) continue
    kept += command.slice(cursor, start) + restOfLine
    cursor = end
  }
  return kept + command.slice(cursor)
}

/** A construct that bash and zsh can read in two ways, or that the reader does not follow: the name for the refusal, and its text. */
const UNMODELLED_TEXT = [
  { name: "a here-string (`<<<`)", test: /<<</ },
  // After a pair `$$`, which is the process id, a `"` opens or closes a plain quote.
  { name: 'a `$"..."` quote', test: /(?<!\$)(?:\$\$)*\$"/ },
  { name: "a run of `$` before a `'`", test: /\$\$'/ },
  { name: "an ANSI-C quote that spells a character as a code", test: /\$'(?:[^'\\]|\\[\s\S])*?\\[xuUc0-7]/ },
  { name: "a line continuation inside a word", test: /[^\s\\]\\\r?\n\S/ },
  {
    name: "an `eval` or a shell `-c` script that holds the value of a variable, which the shell reads again as code",
    test: new RegExp(`(?:^|[\\s;&|(/"'])(?:eval\\s[^\\n;&|]*|(?:${SHELLS.join("|")})["']?\\s(?:[^\\n;&|]*\\s)?-[A-Za-z]*c\\s+(?:"(?:\\\\.|[^"\\\\])*|[^\\s'"]*))\\$[A-Za-z_{]`),
  },
  { name: "a script from `/dev/stdin`", test: /\/dev\/stdin\b/ },
  { name: "a process substitution", test: /[<>]\(/ },
]
/** The programs that the rules read by name. A quote or an escape in such a name is one more spelling that the reader does not follow. */
const READ_PROGRAMS = new Set([...SHELLS, "eval", "git", "rm", "rmdir"])
const ASSIGNMENT_WORD = /^[A-Za-z_]\w*\+?=/

/** True for a command with a quote or an escape in the name of a shell or `eval`, or in a command word that names a program of `READ_PROGRAMS`. */
function spellsProgramName(segment) {
  const words = commandWords(segment)
  const commandIndex = words.findIndex((word) => !ASSIGNMENT_WORD.test(word))
  return words.some((word, index) => {
    const name = word.replace(/\$?["']|\\/g, "").split("/").pop()
    return /["'\\]/.test(word) && READ_PROGRAMS.has(name) && (index === commandIndex || isShell(name) || name === "eval")
  })
}

/**
 * The name of the first construct that the reader does not model exactly in bash and in zsh, or "". The rules fail closed on
 * it: they read the command again with `looseReadings`, and refuse what that text holds. A heredoc body that no shell reads
 * is data, so a construct that it names does not count.
 */
export function unmodelledConstruct(command) {
  const { heredocs, unmodelled } = heredocScan(command)
  if (unmodelled) return unmodelled
  let read = ""
  let cursor = 0
  for (const { start, end, lineStart, restOfLine, body } of heredocs) {
    const script = feedsShell(command.slice(lineStart, start), restOfLine) ? body : ""
    read += `${command.slice(cursor, start)} ${restOfLine}\n${script}`
    cursor = end
  }
  read += command.slice(cursor)
  const construct = UNMODELLED_TEXT.find(({ test }) => test.test(read))
  if (construct) return construct.name
  return expandCommands(stripHeredocBodies(command)).some(spellsProgramName) ? "a quote or an escape in the name of a program" : ""
}

const blocked = (command, why) => ({
  block: true,
  message:
    `BLOCKED git command (Orbit git workflow):\n  ${command}\n\n${why}\n` +
    `The user has prevented this. See the "Git workflow" section of CLAUDE.md.\n`,
})

/** The token as argv carries it: no escape and no quote, also not the `$` that opens an ANSI-C quote. */
const unquoteToken = (token) => token.replace(/\\(.)/g, "$1").replace(/\$?["']/g, "")

/** A leading `NAME=value` is an environment assignment, not the command word. */
const isEnvironmentAssignment = (token) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)

const isGitBinary = (token) => /(?:^|[\\/])git(?:\.exe)?$/i.test(token)

/** Everything after the git command word, normalized to what argv would carry. Empty for a command that names no git. */
const gitTokens = (segment) => {
  const tokens = segment.split(/\s+/).map(unquoteToken).filter(Boolean)
  let index = 0
  while (index < tokens.length && isEnvironmentAssignment(tokens[index])) index++
  while (index < tokens.length && !isGitBinary(tokens[index])) index++
  return index < tokens.length ? tokens.slice(index + 1) : []
}

/**
 * The subcommand and everything after it. Both come from ONE normalized tokenization, because
 * re-scanning the raw segment for the word `push` misses `git p''ush`, whose quotes sit inside
 * the token rather than around it.
 */
const gitCommandParts = (segment) => {
  const tokens = gitTokens(segment)
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token === "-C" || token === "-c" || token === "--git-dir" || token === "--work-tree") {
      index++
      continue
    }
    if (token.startsWith("-")) continue
    return { subcommand: token, globals: tokens.slice(0, index), rest: tokens.slice(index + 1) }
  }
  return { subcommand: null, globals: [], rest: [] }
}

const pushesProtectedRef = (rest) => rest.some((token) => {
  if (token.startsWith("-")) return false
  const parts = token.replace(/^\+/, "").split(":")
  const destination = parts.length > 1 ? parts[parts.length - 1] : parts[0]
  return /^(?:main|master)$/.test(destination.replace(/^refs\/heads\//, ""))
})

// Hygiene rules are universal: bypassing hooks or signing is wrong anywhere. A flag counts only as a word of a git command:
// the same text in the argument of `grep`, `echo` or `gh` is data.
const HYGIENE_RULES = [
  {
    test: ({ gitWords }) => /(?<![\w-])--no-verify\b/.test(gitWords),
    why: "--no-verify skips the pre-commit/pre-push hooks. Fix what the hook flags, then commit normally.",
  },
  {
    test: ({ gitWords }) => /(?<![\w-])--no-gpg-sign\b|commit\.gpgsign\s*=\s*false/.test(gitWords),
    why: "This bypasses commit signing. Let the commit sign as configured.",
  },
  {
    test: ({ segment }) => /\bgit\s+(?:-C\s+\S+\s+|-c\s+\S+\s+)*commit\s+(?:[^\n]*?\s)?-[A-Za-z]*n[A-Za-z]*(?=\s|$)/.test(segment),
    why: "`-n` is git's short alias for --no-verify on commit; it skips the pre-commit hooks. Commit normally.",
  },
]

/** The refusal for the commands in `segments`, each one `{ segment, directory }`, or null. `command` is the text that the message shows. */
function judgeGitCommands(command, segments, { resolveHeadBranch, resolveRemoteUrl }) {
  // Match each command on its own, so no flag of one command counts for the command before it. The full string,
  // heredoc bodies included, is still what gets shown back in the block message.
  const hit = HYGIENE_RULES.find((rule) => segments.some(({ segment }) => rule.test({ segment, gitWords: gitTokens(segment).join(" ") })))
  if (hit) return blocked(command, hit.why)

  // Everything below is branch protection, so it applies only to the repos that actually have it.
  // Each push in a chained command is judged on its own target. An early push to
  // an unprotected sibling repo must never vouch for a later push to a protected
  // main, and a protected push must not be blamed for a `main` ref belonging to a
  // different segment.
  for (const { segment, directory } of segments) {
    const { subcommand, globals, rest } = gitCommandParts(segment)
    if (["commit", "push"].includes(subcommand) && globals.some((token, offset) =>
      (token === "-c" && globals[offset + 1]?.startsWith("core.hooksPath=")) || token.startsWith("-ccore.hooksPath="))) {
      return blocked(command, "Overriding core.hooksPath bypasses the repository hooks.")
    }
    if (subcommand !== "push") continue
    const targetDir = pushTargetDir(segment, directory)
    if (!targetsProtectedRepo(targetDir, resolveRemoteUrl)) continue

    if (pushesProtectedRef(rest) || rest.some((token) => ["--all", "--mirror", "--branches"].includes(token))) {
      return blocked(command, "Direct or force push to main is forbidden (branch protection, squash-merge only). Open a PR.")
    }

    // A bare push (no explicit main/master ref) issued while HEAD is on the
    // protected branch still lands on main. Resolve HEAD via the injected resolver.
    if (typeof resolveHeadBranch !== "function") continue
    if (rest.filter((token) => !token.startsWith("-")).length > 1) continue
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

export function checkGitCommand(command, { resolveHeadBranch, resolveRemoteUrl, cwd } = {}) {
  // No text check for the word `git` comes first: a quote or an escape can divide the word, or put a letter before it.
  if (typeof command !== "string") return null
  const startDirectory = cwd || process.cwd()

  // Each command as argv carries it: no redirect reaches argv, and a here-string is a redirect of standard input. The word of a
  // here-string is text that its command reads, so it is read as commands of its own, in the directory of its command.
  const segments = []
  const collect = (segment, directory) => {
    const words = commandWords(segment).map(shellValue)
    if (words[0] === "cd" && words[1]) directory = resolve(directory, words[1])
    segments.push({ segment: withoutRedirects(segment, { keepHereStrings: false }), directory })
    for (const text of hereStringTexts(segment)) inspectCommands(text, directory, collect)
    return directory
  }
  inspectCommands(stripHeredocBodies(command), startDirectory, collect)
  const refusal = judgeGitCommands(command, segments, { resolveHeadBranch, resolveRemoteUrl })
  if (refusal) return refusal

  // Fail closed: the reading above is exact only for the constructs that the reader models. With one that it does not model,
  // each word of the text counts as a word of a command, in the session directory, and no remote lookup clears a push.
  const construct = unmodelledConstruct(command)
  if (!construct) return null
  const holdsRefusal = looseReadings(command).some((text) => judgeGitCommands(command,
    text.split(/[;&|\n]+/).map((segment) => ({ segment: withoutRedirects(segment, { keepHereStrings: false }), directory: startDirectory })), { resolveHeadBranch }))
  return holdsRefusal
    ? blocked(command, `This command uses ${construct}. The hook does not read that with certainty in bash and in zsh, and the text of the command holds a git command that the workflow forbids.\n` +
      "Rewrite the command in a plain form: no here-string, no `$\"...\"` quote, no `$` before `$'`, no quote or escape in a program name, and a heredoc only with a plain end marker. " +
      "Put a longer script in a file and run it by its literal path, such as `bash /abs/path.sh`.")
    : null
}

export function checkGitWorktreeRemove(command) {
  if (typeof command !== "string" || !/\bgit\b/.test(command)) return null
  // A heredoc/commit-message body that merely NAMES the flag is data, not a
  // command — strip bodies before matching, same as checkGitCommand.
  const scannable = expandCommands(stripHeredocBodies(command)).join("\n")
  // Judge each segment on its own target, mirroring checkGitCommand: the force
  // flag must belong to the SAME segment as `worktree remove`, so a later
  // `&& npm test -- --force` cannot false-block a plain `git worktree remove`.
  for (const segment of scannable.split(/[&|;\n]/)) {
    if (!/\bgit\b[\s\S]*\bworktree\s+remove\b/.test(segment)) continue
    if (!/(?<![\w-])(?:--force|-f)(?![\w-])/.test(segment)) continue
    return {
      block: true,
      message:
        `BLOCKED git command (worktree junction footgun):\n  ${command}\n\n` +
        "`git worktree remove --force` follows a Windows junction/reparse-point inside the worktree and deletes the\n" +
        "TARGET's contents, not the link. SAFE cleanup order:\n" +
        "  1. `rmdir` every junction inside the worktree (removes the link, not the target).\n" +
        "  2. Verify each junction is gone (`git status` / `dir` shows it removed).\n" +
        "  3. THEN `git worktree remove` (no --force needed once the tree carries no reparse points).\n",
    }
  }
  return null
}
