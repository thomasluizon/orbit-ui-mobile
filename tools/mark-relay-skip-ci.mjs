#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

const USAGE = `usage: mark-relay-skip-ci.mjs <message-file> [<source> [<commit>]]

  The prepare-commit-msg hook of the relay record. When a commit stages .claude/handoffs/NEXT.md and
  every other staged path is a spec under .claude/specs/, it adds a [skip ci] line to the message, so
  GitHub starts no pull_request or push workflow for that head. A later head without the marker runs
  every check, so the head that merges is checked in full. A merge or squash message, a message that
  already holds the marker, and any other staged path leave the message as it is.

  --help, -h  print this usage and exit 0

exit codes: 0 message checked, 1 git or the message file failed, 2 usage error`

const MARKER = "[skip ci]"
const PROMPT = ".claude/handoffs/NEXT.md"
const SPEC = /^\.claude\/specs\/[^/]+\.md$/

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
if (args.length === 0 || args.length > 3 || args.some((argument) => argument.startsWith("-"))) {
  console.error(`mark-relay-skip-ci: expected <message-file> [<source> [<commit>]], got: ${args.join(" ")}\n\n${USAGE}`)
  process.exit(2)
}
const [messageFile, source = ""] = args
if (source === "merge" || source === "squash") process.exit(0)

const staged = spawnSync("git", ["diff", "--cached", "--name-only", "--no-renames", "-z"], { encoding: "utf8", windowsHide: true })
if (staged.status !== 0) {
  console.error(`mark-relay-skip-ci: git diff --cached failed: ${(staged.stderr || staged.error?.message || "").trim()}`)
  process.exit(1)
}
const paths = staged.stdout.split("\0").filter(Boolean)
if (!paths.includes(PROMPT) || !paths.every((path) => path === PROMPT || SPEC.test(path))) process.exit(0)

let message
try {
  message = readFileSync(messageFile, "utf8")
} catch (error) {
  console.error(`mark-relay-skip-ci: cannot read ${messageFile}: ${error.message}`)
  process.exit(1)
}
if (message.includes(MARKER)) process.exit(0)
const lines = message.split("\n")
const firstComment = lines.findIndex((line) => line.startsWith("#"))
const body = (firstComment === -1 ? lines : lines.slice(0, firstComment)).join("\n").trimEnd()
const comments = firstComment === -1 ? "" : `\n${lines.slice(firstComment).join("\n")}`
writeFileSync(messageFile, `${body}\n\n${MARKER}\n${comments}`)
