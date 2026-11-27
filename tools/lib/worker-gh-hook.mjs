/**
 * The PreToolUse hook of a code worker. It reads one Bash call and blocks each `gh` write, except `gh pr create` and an edit
 * or a comment on the pull request of the worker's own branch. A permission pattern cannot say "my own pull request".
 * It also blocks a `git push` of a branch that changes more than the cap of `diff-size.mjs` against `origin/main`. The push must
 * come before every command of the call except a `cd`, because the hook runs before the call and cannot see a commit of the same call.
 * It reads the command text, so it does not see a `gh` call that a script or a `bash -c` string makes.
 */

import { spawnSync } from "node:child_process"
import { readFileSync, realpathSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

import { MAX_CHANGED_LINES, changedLines, gitFiles } from "./diff-size.mjs"

/** Words that can stand before a program, so the program is a later word of the command. */
const PREFIX_WORDS = new Set(["!", "{", "builtin", "command", "do", "elif", "else", "env", "exec", "if", "nice", "nohup", "sudo", "then", "time", "timeout", "until", "while", "xargs"])
const ASSIGNMENT = /^[A-Za-z_]\w*\+?=/

/** The `gh` commands that a code worker may run in each group: the reads, `gh pr create` and the local checkout. */
const GH_ALLOWED = Object.freeze({
  cache: ["list", "ls"],
  issue: ["list", "ls", "status", "view"],
  label: ["list", "ls"],
  pr: ["checkout", "checks", "create", "diff", "list", "ls", "new", "status", "view"],
  release: ["download", "list", "ls", "verify", "verify-asset", "view"],
  repo: ["clone", "list", "ls", "read-dir", "read-file", "view"],
  ruleset: ["check", "list", "ls", "view"],
  run: ["download", "list", "ls", "view", "watch"],
  variable: ["get", "list", "ls"],
  workflow: ["list", "ls", "view"],
})
const GH_READ_GROUPS = new Set(["help", "search", "status", "version"])

/** The only flags of the two writes on the worker's own pull request. Each one takes a value. */
const OWN_PULL_FLAGS = Object.freeze({
  edit: ["--add-label", "--body-file", "--remove-label", "-F"],
  comment: ["--body", "--body-file", "-F", "-b"],
})

const API_VALUE_FLAGS = new Set(["--cache", "--field", "--header", "--hostname", "--input", "--jq", "--method", "--preview", "--raw-field", "--template"])
const API_SHORT_FLAGS = Object.freeze({ F: "--field", H: "--header", X: "--method", f: "--raw-field", p: "--preview", q: "--jq", t: "--template" })

/**
 * The simple commands of a shell text as lists of words, in the order they run: a substitution comes before the command
 * that holds it. Quotes are removed, and redirect targets, comments and heredoc bodies are dropped.
 */
export const shellCommands = (text) => {
  const commands = []
  /** Reads from `start` to the unquoted `closer`, and returns the index of that closer or the end of the text. */
  const read = (start, closer) => {
    let words = []
    let word = null
    let target = null
    const heredocs = []
    const add = (part) => { word = (word ?? "") + part }
    const endWord = () => {
      if (word === null) return
      if (target === "heredoc") heredocs.push(word)
      else if (target === null) words.push(word)
      word = null
      target = null
    }
    const endCommand = () => {
      endWord()
      if (words.length > 0) commands.push(words)
      words = []
    }
    const readQuoted = (from) => {
      let index = from
      for (; index < text.length && text[index] !== '"'; index++) {
        if (text[index] === "\\" && '$`"\\\n'.includes(text[index + 1])) add(text[++index].replace("\n", ""))
        else if (text[index] === "`") index = read(index + 1, "`")
        else if (text.startsWith("$(", index)) { add("$"); index = read(index + 2, ")") }
        else add(text[index])
      }
      return index
    }
    const skipHeredocs = (newline) => {
      let index = newline
      while (heredocs.length > 0 && index < text.length) {
        const delimiter = heredocs.shift()
        let line = null
        while (line !== delimiter && index < text.length) {
          const end = text.indexOf("\n", index + 1)
          const stop = end === -1 ? text.length : end
          line = text.slice(index + 1, stop).replace(/^\t+/, "")
          index = stop
        }
      }
      return index
    }
    let index = start
    for (; index < text.length; index++) {
      const character = text[index]
      if (character === closer) break
      if (character === "\\") {
        if (text[index + 1] !== "\n") add(text[index + 1] ?? "")
        index++
      } else if (character === "'") {
        const end = text.indexOf("'", index + 1)
        const stop = end === -1 ? text.length : end
        add(text.slice(index + 1, stop))
        index = stop
      } else if (character === '"') {
        add("")
        index = readQuoted(index + 1)
      } else if (character === "#" && word === null) {
        const end = text.indexOf("\n", index)
        index = (end === -1 ? text.length : end) - 1
      } else if (character === " " || character === "\t") {
        endWord()
      } else if (character === "<" || character === ">" || (character === "&" && text[index + 1] === ">")) {
        if (/^\d+$/.test(word ?? "")) word = null
        else endWord()
        const operator = /^(?:<<<|<<-|<<|&>>|&>|>>|>&|>\||<&|<>|<|>)/.exec(text.slice(index, index + 3))[0]
        target = operator === "<<" || operator === "<<-" ? "heredoc" : "redirect"
        index += operator.length - 1
      } else if (character === "`") {
        add("$")
        index = read(index + 1, "`")
      } else if (character === "(") {
        // `$(` and `<(` belong to the command around them, and a plain `(` starts a subshell.
        if (word?.endsWith("$")) index = read(index + 1, ")")
        else if (target !== null && word === null) { target = null; index = read(index + 1, ")") }
        else { endCommand(); index = read(index + 1, ")") }
      } else if (character === "\n") {
        endCommand()
        index = skipHeredocs(index)
      } else if (";&|)".includes(character)) {
        endCommand()
      } else {
        add(character)
      }
    }
    endCommand()
    return index
  }
  read(0, null)
  return commands
}

/** The arguments of the call of `program` in one command and the place of `program` in it, or null when the command runs another program. */
const callOf = (words, program) => {
  let prefixed = false
  let index = 0
  for (; index < words.length; index++) {
    if (PREFIX_WORDS.has(words[index])) prefixed = true
    else if (!ASSIGNMENT.test(words[index]) && !(prefixed && /^(?:-.*|\d+[smhd]?)$/.test(words[index]))) break
  }
  return (words[index] ?? "").split("/").at(-1) === program ? { at: index, args: words.slice(index + 1) } : null
}

const ghCallOf = (words) => callOf(words, "gh")

/** The `git` options that take a value in the next word. */
const GIT_VALUE_OPTIONS = new Set(["-C", "-c", "--exec-path", "--git-dir", "--namespace", "--work-tree"])

/** The directory and the arguments of a `git push` command, or null when the command is no push. `-C <path>` moves the directory. */
const gitPushOf = (words, directory) => {
  const call = callOf(words, "git")
  if (call === null) return null
  let moved = directory
  let index = 0
  for (; index < call.args.length && call.args[index].startsWith("-"); index++) {
    if (call.args[index] === "-C") moved = resolve(moved, call.args[++index] ?? "")
    else if (GIT_VALUE_OPTIONS.has(call.args[index])) index++
  }
  return call.args[index] === "push" ? { directory: moved, args: call.args.slice(index + 1) } : null
}

/** A push that deletes a remote branch (`--delete`, `-d` or a `:<branch>` refspec) sends no commit, so it has no size. */
const deletesRemote = (args) => args.some((argument) => argument === "--delete" || argument === "-d" || argument.startsWith(":"))

/** The denial text of a push of `lines` changed lines, or null when the push is within the cap. */
const pushDenial = (lines) => lines > MAX_CHANGED_LINES
  ? `This push changes ${lines} lines. The cap is ${MAX_CHANGED_LINES.toLocaleString("en-US")}. Push nothing more. End your run with the last line "NEEDS_SPLIT: <one sentence that names the work that is left>".`
  : null

/** The first two words of a `gh` call that are no flag and no repository value. */
const commandWords = (args) => {
  const words = []
  for (let index = 0; index < args.length && words.length < 2; index++) {
    if (args[index] === "-R" || args[index] === "--repo") index++
    else if (!args[index].startsWith("-")) words.push(args[index])
  }
  return words
}

/** `gh pr edit --help` prints help. A `--help` after another flag can be the value of that flag, so it does not count. */
const isHelp = (args) => args.at(-1) === "--help" && args.slice(0, -1).every((argument) => !argument.startsWith("-"))

/** Why a `gh api` call is a write, or null for a read: a GET with no body, or a GraphQL query. */
const apiDenial = (args) => {
  const flags = []
  let endpoint = null
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument.startsWith("--")) {
      const [name, ...value] = argument.split("=")
      if (API_VALUE_FLAGS.has(name)) flags.push([name, value.length > 0 ? value.join("=") : args[++index] ?? ""])
    } else if (argument.startsWith("-") && argument.length > 1) {
      const cluster = argument.slice(1).replace(/^i+/, "")
      const name = API_SHORT_FLAGS[cluster[0]]
      if (name !== undefined) flags.push([name, cluster.length > 1 ? cluster.slice(1).replace(/^=/, "") : args[++index] ?? ""])
    } else {
      endpoint ??= argument
    }
  }
  const values = (...names) => flags.filter(([name]) => names.includes(name)).map(([, value]) => value)
  if (values("--method").some((method) => method.toUpperCase() !== "GET") || values("--input").length > 0) return "a `gh api` write is not allowed"
  const fields = values("--field", "--raw-field")
  if (fields.length === 0) return null
  const queries = fields.filter((field) => field.startsWith("query=")).map((field) => field.slice("query=".length).trim())
  const reads = /^\/?graphql$/.test(endpoint ?? "") && queries.length > 0 && queries.every((query) => /^(?:query\b|\{)/.test(query) && !/\bmutation\b/.test(query))
  return reads ? null : "a `gh api` call with a field is a write. Only a GraphQL query that starts with `query` or `{` may have fields"
}

/** Why the worker may not edit or comment here, or null when the target is the pull request of its own branch. */
const ownPullDenial = ({ verb, args, cwd, own, read }) => {
  const flags = OWN_PULL_FLAGS[verb]
  const selectors = []
  for (let index = 0; index < args.length; index++) {
    if (!args[index].startsWith("-")) selectors.push(args[index])
    else if (!flags.includes(args[index].split("=")[0])) return `\`gh pr ${verb}\` takes only ${flags.join(", ")} here, not ${args[index]}`
    else if (!args[index].includes("=")) index++
  }
  if (own === null) return "this run has no branch of its own, so it may edit no pull request"
  const here = read.checkout(cwd)
  if (here.root !== read.checkout(own.worktree).root) return `run \`gh pr ${verb}\` in your working tree ${own.worktree}`
  if (selectors.length > 1) return `\`gh pr ${verb}\` takes at most one pull request`
  const [selector] = selectors
  if (selector === undefined) return here.branch === own.branch ? null : `your branch is ${own.branch}, and the working tree is on ${here.branch || "no branch"}`
  if (selector === own.branch) return null
  const pull = read.ownPull(own)
  return selector === String(pull.number) || selector === pull.url ? null : `${selector} is not the pull request of your branch ${own.branch}, which is ${pull.number}`
}

const run = (executable, args, cwd) => {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8", timeout: 20 * 1000 })
  if (result.status !== 0) throw new Error(`${executable} ${args.join(" ")} failed: ${(result.stderr ?? result.error?.message ?? "").trim()}`)
  return result.stdout.trim()
}

const SYSTEM_READ = Object.freeze({
  checkout: (directory) => ({ root: realpathSync(run("git", ["rev-parse", "--show-toplevel"], directory)), branch: run("git", ["branch", "--show-current"], directory) }),
  ownPull: ({ worktree, branch }) => JSON.parse(run("gh", ["pr", "view", branch, "--json", "number,url"], worktree)),
  /** The changed lines of the checkout in `directory` against a fresh `origin/main`. */
  changedLines: (directory) => {
    run("git", ["fetch", "origin", "main"], directory)
    return changedLines(gitFiles({ cwd: directory, base: "origin/main" }))
  },
})

/**
 * Why the Bash call may not run, or null. `own` is the working tree and the branch of the worker, or null. An edit or a
 * comment comes before every other command of the call, so no earlier command can move the shell or set its environment.
 */
export const ghDenial = ({ command, cwd, own, read = SYSTEM_READ }) => {
  let onlyOwnWrites = true
  let directory = cwd
  let leading = true
  for (const words of shellCommands(command)) {
    const isCd = words[0] === "cd" && words.length === 2
    if (isCd) directory = resolve(directory, words[1])
    const push = gitPushOf(words, directory)
    if (push !== null && !deletesRemote(push.args)) {
      if (!leading) return "start the Bash call with `git push`, after your commit"
      const reason = pushDenial(read.changedLines(push.directory))
      if (reason !== null) return reason
    }
    leading &&= isCd
    const call = ghCallOf(words)
    const [group, verb] = call === null ? [] : commandWords(call.args)
    if (call !== null && group === "pr" && Object.hasOwn(OWN_PULL_FLAGS, verb ?? "") && !isHelp(call.args)) {
      if (!onlyOwnWrites || call.at !== 0 || call.args[0] !== group || call.args[1] !== verb) return `start the Bash call with \`gh pr ${verb}\`, with no command, variable or flag before it`
      const reason = ownPullDenial({ verb, args: call.args.slice(2), cwd, own, read })
      if (reason !== null) return reason
      continue
    }
    onlyOwnWrites = false
    if (group === undefined || isHelp(call.args) || GH_READ_GROUPS.has(group)) continue
    if (group === "api") {
      const reason = apiDenial(call.args.slice(call.args.indexOf("api") + 1))
      if (reason !== null) return reason
    } else if (verb !== undefined && !(Object.hasOwn(GH_ALLOWED, group) && GH_ALLOWED[group].includes(verb))) {
      return `\`gh ${group} ${verb}\` is not allowed for a worker`
    }
  }
  return null
}

/** Reads the hook input on stdin. Exit 0 lets the call run. Exit 2 blocks it and gives stderr to the model. */
const main = () => {
  try {
    const { values } = parseArgs({ options: { worktree: { type: "string" }, branch: { type: "string" } } })
    const input = JSON.parse(readFileSync(0, "utf8"))
    const own = values.worktree && values.branch ? { worktree: values.worktree, branch: values.branch } : null
    const reason = ghDenial({ command: String(input.tool_input.command), cwd: input.cwd, own })
    if (reason === null) return
    console.error(`Blocked: ${reason.endsWith(".") ? reason : `${reason}.`}`)
  } catch (error) {
    console.error(`Blocked: the GitHub hook could not check this call. ${error.message}`)
  }
  process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main()
