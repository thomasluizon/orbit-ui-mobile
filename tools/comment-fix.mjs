#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const COMMENT_RULE = "local/no-comments"
const LINTED_WORKSPACES = ["apps/web", "apps/mobile", "packages/shared", "apps/desktop"]
const SOURCE_FILE = /\.(?:c|m)?[jt]sx?$/

const USAGE = `usage: comment-fix.mjs --base <ref> [--head <ref>] [--root <repository>]

  Applies only the ${COMMENT_RULE} autofix to the JavaScript and TypeScript files that
  git diff --name-only <base> <head> lists under ${LINTED_WORKSPACES.join(", ")}. Each workspace
  uses its own ESLint config and its own ESLint package. Every other rule is reported by its own gate
  and is never fixed here. The fix writes the working tree; commit the result yourself.

  --base <ref>         the commit the change starts from (required)
  --head <ref>         the commit the change ends at (default: HEAD)
  --root <repository>  the repository to fix (default: the repository of this script)
  --help, -h           print this usage and exit 0

Prints one line for each workspace with changed files, then each remaining ${COMMENT_RULE} message.

exit codes: 0 no ${COMMENT_RULE} message is left, 1 a message is left that the autofix cannot remove,
            2 usage error, an unreadable git diff or a workspace whose ESLint cannot load`

const fail = (message) => {
  console.error(`${message}\n\n${USAGE}`)
  process.exit(2)
}

const parseArguments = (argv) => {
  const options = { base: null, head: "HEAD", root: resolve(dirname(fileURLToPath(import.meta.url)), "..") }
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    if (flag === "--help" || flag === "-h") {
      console.log(USAGE)
      process.exit(0)
    }
    const value = argv[index + 1]
    if (!["--base", "--head", "--root"].includes(flag)) fail(`unknown argument: ${flag}`)
    if (typeof value !== "string" || value === "" || value.startsWith("--")) fail(`${flag} requires a value`)
    options[flag.slice(2)] = flag === "--root" ? resolve(value) : value
    index++
  }
  if (options.base === null) fail("--base is required")
  return options
}

const changedSourceFiles = ({ root, base, head }) => {
  const diff = spawnSync("git", ["-C", root, "diff", "--name-only", base, head], { encoding: "utf8" })
  if (diff.status !== 0) fail(`git diff ${base} ${head} failed: ${(diff.stderr || diff.error?.message || "").trim()}`)
  return diff.stdout.split("\n").filter((file) => SOURCE_FILE.test(file) && existsSync(join(root, file)))
}

const fixWorkspace = async (root, workspace, files) => {
  const cwd = join(root, workspace)
  let ESLint
  try {
    ({ ESLint } = createRequire(join(cwd, "package.json"))("eslint"))
  } catch (error) {
    fail(`${workspace}: ESLint cannot load: ${error.message}`)
  }
  const eslint = new ESLint({ cwd, fix: (message) => message.ruleId === COMMENT_RULE })
  const results = await eslint.lintFiles(files.map((file) => join(root, file)))
  await ESLint.outputFixes(results)
  const left = results.flatMap((result) => result.messages.filter((message) => message.ruleId === COMMENT_RULE)
    .map((message) => `${relative(root, result.filePath)}:${message.line} ${message.message}`))
  console.log(`${workspace}: ${files.length} files, ${results.filter((result) => result.output !== undefined).length} fixed, ${left.length} ${COMMENT_RULE} left`)
  for (const line of left) console.log(`  ${line}`)
  return left.length
}

const options = parseArguments(process.argv.slice(2))
const changed = changedSourceFiles(options)
let remaining = 0
for (const workspace of LINTED_WORKSPACES) {
  const files = changed.filter((file) => file.startsWith(`${workspace}/`))
  if (files.length > 0) remaining += await fixWorkspace(options.root, workspace, files)
}
process.exitCode = remaining === 0 ? 0 : 1
