import { commandsFedBy, commandWords, expandCommands, heredocsOf, invocationsOf, PLAIN_SUBSET_ADVICE, programName, readCommand, readsStandardInput, shellValue, SHELLS, SUBSTITUTION, walkCommands, withoutRedirects } from "./command-expander.mjs"
import { posix, resolve } from "node:path"

// Only these three repositories protect main; other repositories may allow direct pushes.
const PROTECTED_REPOS = ["orbit-ui-mobile", "orbit-api", "orbit-landing-page"]

/**
 * The repository name of a remote URL or path, or null when the hook cannot name it with certainty. The name has no case, and the path
 * loses each `.` and `..` segment, each repeated or trailing `/` and each trailing `.git`, as git and GitHub resolve them. A percent
 * escape, a `?` or a `#` gives null, and so does a path that ends in no name. A caller reads null as a protected repository.
 */
function repoNameFrom(remoteUrl) {
  if (typeof remoteUrl !== "string") return null
  const text = remoteUrl.trim().toLowerCase().replaceAll("\\", "/")
  if (text === "" || /[%?#]/.test(text)) return null
  const url = /^[a-z][a-z0-9+.-]*:\/\/[^/]*(.*)$/.exec(text)
  const scp = url ? null : /^[^/]*?:(.*)$/.exec(text)
  let path = posix.normalize(`/${url ? url[1] : scp ? scp[1] : text}`)
  while (/(?:\/|\.git)$/.test(path)) path = path.replace(/(?:\/+|\.git)$/, "")
  const name = path.split("/").pop()
  return name && name !== "." && name !== ".." ? name : null
}

/** The two forms of a URL that a push in an unattended run or in a protected repository can name. Each other URL or path is refused. */
const CANONICAL_REMOTE_FORMS = "`https://github.com/<owner>/<repo>` or `git@github.com:<owner>/<repo>`, each with an optional `.git`"
const CANONICAL_REMOTE = /^(?:https:\/\/github\.com\/|git@github\.com:)[A-Za-z0-9-]+\/([A-Za-z0-9_.-]+)$/
/** True for a URL that is byte-equal to a canonical form: no dot segment, no percent escape, no repeated or trailing `/`, no query and no fragment. */
const isCanonicalRemote = (remote) => {
  const repository = CANONICAL_REMOTE.exec(remote)?.[1].replace(/\.git$/, "")
  return Boolean(repository) && repository !== "." && repository !== ".."
}

// Fails SAFE: when the target repo cannot be resolved, assume it is protected.
// Wrongly blocking a push is recoverable; wrongly allowing one onto main is not.
function targetsProtectedRepo(chain, resolveRemoteUrl) {
  if (typeof resolveRemoteUrl !== "function") return true
  try {
    const name = repoNameFrom(resolveRemoteUrl(chain))
    return name ? PROTECTED_REPOS.includes(name) : true
  } catch {
    return true
  }
}

/**
 * The directories that git changes to before it reads the repository: the shell directory after the `cd` model, then each `-C`
 * word in order, as the shell gives it to git. `resolveRemoteUrl` gives the whole chain to git as `git -C <dir> -C <w1> ... -C <wn>`. Node never resolves
 * a `-C` word, because git applies each one with `chdir`, which follows a symlink before it reads `..`.
 */
export const gitDirectoryChain = (globals, directory) => [directory, ...globals.flatMap((token, index) => (token === "-C" && globals[index + 1] !== undefined ? [globals[index + 1]] : []))]

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

export { SHELLS }

/** Stands for the heredoc operator, so that the shell parser finds the commands that read the body. */
const HEREDOC_OPERATOR = "__heredoc_operator__"

/** The words of a simple command, without its redirects. A here-string is a redirect of standard input, so it is no argument. */
const argumentsOf = (command) => commandWords(withoutRedirects(command)).map(shellValue)

const isShell = (word) => SHELLS.includes(word.split(/[\\/]/).pop())
const holdsSubstitution = (words) => words.some((word) => word.includes(SUBSTITUTION))
/** True for a command in which `accepts` holds for the words after a word that `isCommandWord` names. A wrapper such as `env` or `exec` can come first. */
const hasWordThat = (command, isCommandWord, accepts) => {
  const words = argumentsOf(command)
  return words.some((word, index) => isCommandWord(word) && accepts(words.slice(index + 1)))
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

const blocked = (command, why) => ({
  block: true,
  message:
    `BLOCKED git command (Orbit git workflow):\n  ${command}\n\n${why}\n` +
    `The user has prevented this. See the "Git workflow" section of CLAUDE.md.\n`,
})

/** True for the long option, and for each short form that git reads as the option: git takes a prefix that names one option only. */
const isLongOption = (token, option, shortest) => token.length >= shortest.length && option.startsWith(token.split("=")[0]) && token.startsWith(shortest)

/** Short options of `git commit` that take the rest of the word, or the next word, as their value. */
const COMMIT_VALUE_LETTERS = "mFCctuS"
/** True for a short option word of `git commit` that holds `-n`, such as `-n` or `-an`. In `-mn` the `n` is the message. */
function holdsCommitNoVerify(token) {
  if (!/^-[A-Za-z]/.test(token)) return false
  for (const letter of token.slice(1)) {
    if (letter === "n") return true
    if (COMMIT_VALUE_LETTERS.includes(letter)) return false
  }
  return false
}

/** git reads a config key with no case, and `no`, `off`, `0` and an empty value as false. */
const UNSIGNED_CONFIG = /^(?:-c)?commit\.gpgsign=(?:false|no|off|0)?$/i
const HOOKS_PATH_CONFIG = /^(?:-c)?core\.hookspath=/i

// Hygiene rules are universal: bypassing hooks or signing is wrong anywhere. A flag counts only as a word of a git command:
// the same text in the argument of `grep`, `echo` or `gh` is data. Each rule reads the words after the git command word.
const HYGIENE_RULES = [
  {
    test: ({ tokens }) => tokens.some((token) => isLongOption(token, "--no-verify", "--no-veri")),
    why: "--no-verify skips the pre-commit/pre-push hooks. Fix what the hook flags, then commit normally.",
  },
  {
    test: ({ tokens }) => tokens.some((token) => isLongOption(token, "--no-gpg-sign", "--no-g") || UNSIGNED_CONFIG.test(token) || (/^--config-env/.test(token) && /commit\.gpgsign/i.test(token))),
    why: "This bypasses commit signing. Let the commit sign as configured.",
  },
  {
    test: ({ subcommand, rest }) => subcommand === "commit" && rest.some(holdsCommitNoVerify),
    why: "`-n` is git's short alias for --no-verify on commit; it skips the pre-commit hooks. Commit normally.",
  },
]

/** Options before the git subcommand that change no config, no repository and no hook. `-C <path>` is read as the directory. */
const SAFE_GLOBAL_OPTIONS = new Set(["--no-pager", "-P", "-p", "--paginate", "--no-optional-locks", "--literal-pathspecs", "--glob-pathspecs", "--noglob-pathspecs",
  "--icase-pathspecs", "--no-replace-objects", "--version", "--help", "-h"])

/** The subcommand of a git command, the options before it, and everything after it. `tokens` are the words after the git word, as argv carries them. */
export const gitCommandParts = (tokens) => {
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token === "-C") {
      index++
      continue
    }
    if (token.startsWith("-")) {
      if (!SAFE_GLOBAL_OPTIONS.has(token)) return { subcommand: null, globals: tokens.slice(0, index + 1), rest: [], refusedOption: token }
      continue
    }
    return { subcommand: token, globals: tokens.slice(0, index), rest: tokens.slice(index + 1), refusedOption: "" }
  }
  return { subcommand: null, globals: tokens, rest: [], refusedOption: "" }
}

/** Options of `git push` that take the next word as their value, from the output of `git push -h`. */
const PUSH_VALUE_OPTIONS = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec", "--recurse-submodules"])
/** Each repository word of a push: its first word that is no option and no option value, and each value of `--repo`, which git reads as the same argument. */
function pushRepositories(rest) {
  const repositories = []
  let positional = false
  for (let index = 0; index < rest.length; index++) {
    const word = rest[index]
    if (isLongOption(word, "--repo", "--rep") && word.includes("=")) repositories.push(word.slice(word.indexOf("=") + 1))
    else if (isLongOption(word, "--repo", "--rep") && index + 1 < rest.length) repositories.push(rest[++index])
    else if (PUSH_VALUE_OPTIONS.has(word)) index++
    else if (!word.startsWith("-") && !positional) { positional = true; repositories.push(word) }
  }
  return repositories
}

/** True for a URL or a path in place of a remote name. */
const isRemoteLocation = (remote) => /[:/\\]/.test(remote) || remote.startsWith(".")

/** A plain branch name that is not `main` or `master` in any spelling that git resolves to it, and not `HEAD`. */
const isPlainBranch = (name) => /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name) && !/\.\.|\/\/|\/$|\.lock$|\.$/.test(name) && !/HEAD$/i.test(name) &&
  !/^(?:refs\/)?(?:heads\/)?(?:main|master)$/i.test(name)

/** The push forms that a protected repository allows: `git push [-u] origin <branch>` and `git push origin HEAD:<branch>`. */
function isAllowedPush(rest) {
  if (rest.length === 2 && rest[0] === "origin") return isPlainBranch(rest[1].startsWith("HEAD:") ? rest[1].slice(5) : rest[1])
  return rest.length === 3 && rest[0] === "-u" && rest[1] === "origin" && isPlainBranch(rest[2])
}

/** True when the push goes to a protected repository: the directory, or a remote, URL or path that names one. Fails safe. */
function pushesToProtected(chain, rest, resolveRemoteUrl) {
  if (targetsProtectedRepo(chain, resolveRemoteUrl)) return true
  return pushRepositories(rest).some((remote) => {
    if (remote === "origin") return false
    if (isRemoteLocation(remote)) {
      const name = repoNameFrom(remote)
      return name ? PROTECTED_REPOS.includes(name) : true
    }
    return targetsProtectedRepo(chain, typeof resolveRemoteUrl === "function" ? (directories) => resolveRemoteUrl(directories, remote) : null)
  })
}

/**
 * The git subcommands that the rule knows. In an unattended run, and in a protected repository, each other subcommand is refused, so an
 * alias, `subtree`, `send-pack`, `submodule`, `difftool`, `filter-branch` and each other subcommand that can push or run a command never runs.
 */
export const GIT_SUBCOMMANDS = ["add", "apply", "bisect", "blame", "branch", "cat-file", "check-attr", "check-ignore", "checkout", "cherry", "cherry-pick", "clean", "commit",
  "config", "count-objects", "describe", "diff", "diff-files", "diff-index", "diff-tree", "fetch", "for-each-ref", "format-patch", "fsck", "grep", "hash-object", "log",
  "ls-files", "ls-remote", "ls-tree", "merge", "merge-base", "mv", "name-rev", "pull", "push", "range-diff", "rebase", "reflog", "remote", "reset", "restore", "rev-list",
  "rev-parse", "revert", "rm", "shortlog", "show", "show-branch", "show-ref", "stash", "status", "switch", "symbolic-ref", "tag", "var", "verify-commit", "verify-tag",
  "version", "worktree", "merge-tree"]

/** True for a short option word that holds `letter` before a letter in `valueLetters`, which takes the rest of the word as its value. */
const holdsShortOption = (word, letter, valueLetters) => {
  if (!/^-[A-Za-z]/.test(word)) return false
  for (const character of word.slice(1)) {
    if (character === letter) return true
    if (valueLetters.includes(character)) return false
  }
  return false
}

/** The option of a known subcommand that runs a command, or "". Each one is named in the order of the subcommands. */
function commandOption(subcommand, rest) {
  const runs = {
    rebase: (word) => isLongOption(word, "--exec", "--ex") || holdsShortOption(word, "x", "sXSC"),
    bisect: (word, index) => index === 0 && word === "run",
    fetch: (word) => isLongOption(word, "--upload-pack", "--upl"),
    pull: (word) => isLongOption(word, "--upload-pack", "--upl"),
    "ls-remote": (word) => isLongOption(word, "--upload-pack", "--u"),
    push: (word) => isLongOption(word, "--receive-pack", "--rece") || isLongOption(word, "--exec", "--e"),
    grep: (word) => isLongOption(word, "--open-files-in-pager", "--op") || holdsShortOption(word, "O", "efABCm"),
  }[subcommand]
  return (runs && rest.find((word, index) => runs(word, index))) ?? ""
}

const PUSH_FORMS = "A protected repository allows only `git push origin <branch>`, `git push -u origin <branch>` and `git push origin HEAD:<branch>`, " +
  "where <branch> is a plain branch name that is not main or master."

/** The refusal for the git commands in `gitCommands`, each one `{ tokens, directory }`, or null. `command` is the text that the message shows. */
function judgeGitCommands(command, gitCommands, { resolveRemoteUrl, unattended }) {
  // Each git command is judged on its own words, so no flag of one command counts for another. The full string,
  // heredoc bodies included, is still what gets shown back in the block message.
  const read = gitCommands.map(({ tokens, directory }) => ({ tokens, directory, ...gitCommandParts(tokens) }))
  const hit = HYGIENE_RULES.find((rule) => read.some((parts) => rule.test(parts)))
  if (hit) return blocked(command, hit.why)
  for (const { subcommand, globals } of read) {
    if (["commit", "push"].includes(subcommand) && globals.some((token) => HOOKS_PATH_CONFIG.test(token))) {
      return blocked(command, "Overriding core.hooksPath bypasses the repository hooks.")
    }
  }
  const refused = read.find(({ refusedOption }) => refusedOption)
  if (refused) {
    return blocked(command, `The git option \`${refused.refusedOption}\` before the subcommand can change the config, the repository or the hooks that git uses. ` +
      `Before the subcommand, the hook allows only \`-C <path>\` and ${[...SAFE_GLOBAL_OPTIONS].map((option) => `\`${option}\``).join(", ")}.`)
  }
  for (const { subcommand, rest, globals, directory } of read) {
    if (subcommand === null || !(unattended || targetsProtectedRepo(gitDirectoryChain(globals, directory), resolveRemoteUrl))) continue
    if (!GIT_SUBCOMMANDS.includes(subcommand)) {
      return blocked(command, `The git subcommand \`${subcommand}\` is not one that the hook knows. An alias and a subcommand that can push or run a command are refused. ` +
        `The hook knows only: ${GIT_SUBCOMMANDS.join(" ")}. For another subcommand, write the command to a script file and run the file by its literal path, such as \`bash /abs/path.sh\`.`)
    }
    const option = commandOption(subcommand, rest)
    if (option) return blocked(command, `The word \`${option}\` of \`git ${subcommand}\` runs a command that the hook does not read. Run that command as its own command.`)
  }
  const pushes = read.filter(({ subcommand }) => subcommand === "push")
  if (pushes.length === 0) return null
  // A config change earlier in the same line can point a remote, an alias or a push default at a protected repository after the hook reads it.
  if (read.some(({ subcommand, rest }) => subcommand === "config" || (subcommand === "remote" && !["-v", "show", "get-url"].includes(rest[0] ?? "-v")))) {
    return blocked(command, "A `git config` or `git remote` change in the same command as a push can send the push to a protected repository. Run them as two commands.")
  }
  // Everything below is branch protection, so it applies only to the repos that actually have it. Each push is judged on its own target.
  for (const { globals, rest, directory } of pushes) {
    const target = gitDirectoryChain(globals, directory)
    // git and GitHub resolve a dot segment, an escape or a repeated `/` that a name reader can miss, so only the canonical forms are read.
    const unread = (unattended || targetsProtectedRepo(target, resolveRemoteUrl)) && pushRepositories(rest).find((remote) => isRemoteLocation(remote) && !isCanonicalRemote(remote))
    if (unread) {
      return blocked(command, `The push names the URL or path \`${unread}\`. In an unattended run and in a protected repository, a push names a remote by its name, or a URL in a canonical form: ` +
        `${CANONICAL_REMOTE_FORMS}, with no dot segment, no percent escape, no repeated or trailing \`/\`, and no query or fragment.`)
    }
    if (!pushesToProtected(target, rest, resolveRemoteUrl)) continue
    if (!isAllowedPush(rest)) return blocked(command, `This push form is refused in a protected repository (branch protection, squash-merge only). ${PUSH_FORMS} Open a PR.`)
  }
  return null
}

/** True when the dequoted text names git: an attended session refuses a command outside the subset only then. */
const namesGit = (command) => /git/i.test(command.replace(/['"\\]/g, ""))

const notModelledRefusal = (command, notModelled) => ({
  block: true,
  notModelled,
  message:
    `BLOCKED command (the Orbit hooks cannot read it):\n  ${command.slice(0, 400)}\n\n` +
    `The command holds ${notModelled}. The git workflow hook reads one plain shell subset exactly, and it refuses each command outside it, ` +
    `because it cannot prove that such a command runs no forbidden git command.\n${PLAIN_SUBSET_ADVICE}\n`,
})

/**
 * Each git command that `command` runs, as `{ tokens, directory }`: its words after the git word and the shell directory after the `cd` model.
 * `notModelled` names the first construct outside the subset, or is "", and `gitCommands` is empty when it is not "".
 */
export function readGitCommands(command, { cwd, home } = {}) {
  const { list, notModelled } = readCommand(command, home ? { home } : undefined)
  if (notModelled) return { gitCommands: [], notModelled }
  const gitCommands = []
  const unread = walkCommands(list, cwd || process.cwd(), ({ words }, directory) => {
    for (const { program, args } of invocationsOf(words)) {
      if (programName(program.text) === "git") gitCommands.push({ tokens: args.map((word) => word.text), directory })
    }
    // The shell `cd` is logical: it reads `..` by text before it follows a symlink, as `resolve` does. git `-C` is not, so git reads those words.
    return words[0]?.text === "cd" && words[1] ? resolve(directory, words[1].text) : directory
  })
  return unread ? { gitCommands: [], notModelled: unread } : { gitCommands, notModelled: "" }
}

/**
 * The refusal for a command that holds a git command which the workflow forbids, or null. The rule reads only the parsed
 * words of the modelled subset (`readCommand`). In an unattended run it refuses each command outside the subset, because it
 * cannot prove what that command runs. In an attended session it refuses such a command only when its dequoted text names git.
 */
export function checkGitCommand(command, { resolveRemoteUrl, cwd, home, unattended = true } = {}) {
  if (typeof command !== "string") return null
  const { gitCommands, notModelled } = readGitCommands(command, { cwd, home })
  if (notModelled) return unattended || namesGit(command) ? notModelledRefusal(command, notModelled) : null
  return judgeGitCommands(command, gitCommands, { resolveRemoteUrl, unattended })
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
