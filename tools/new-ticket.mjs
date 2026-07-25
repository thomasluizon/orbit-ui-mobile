#!/usr/bin/env node
/**
 * Create a Linear issue via `orca linear create`, then validate the issue that was
 * ACTUALLY created.
 *
 * `orca linear create` already does the creating, so this does not reimplement it:
 * every flag is passed straight through. The only thing this adds is the one link a
 * hand-rolled call keeps getting wrong. Creating and checking are two commands, and
 * a human or an agent joins them by typing the identifier. That identifier is a
 * GUESS: on 2026-07-25 a ticket was created as ORB-87 while the validation ran
 * against ORB-85, which existed, belonged to something else, and passed. The
 * defective ticket read as verified.
 *
 * Here the identifier can only come from `--json` output, so the check cannot
 * target the wrong issue.
 *
 * Usage: node tools/new-ticket.mjs --title "<t>" --project "<name>" --body-file - < body.md
 * Exit 0 created and valid, 1 created but DEFECTIVE, 2 usage error, 3 orca error.
 */

import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"

const USAGE = `usage: new-ticket.mjs <orca linear create flags> < body.md

  A thin wrapper over \`orca linear create\`. Every flag is forwarded verbatim, so
  see \`orca linear create --help\` for the full set. Typical:

    --title "<text>"        the issue title
    --project "<name>"      exact project name
    --body-file -           read the body from stdin (recommended)
    --label "<name>"        repeatable, exact label name
    --estimate <number>
    --state "<name>"

  --help, -h                print this usage and exit 0

  What this adds over calling orca directly: the created issue is immediately
  validated with check-ticket.mjs against the identifier orca REPORTED, never one
  typed by hand. A defective ticket therefore cannot read as verified.

exit codes:
  0  created and it passes check-ticket.mjs
  1  created but DEFECTIVE; the identifier and the problems are printed
  2  usage error
  3  orca or Linear failed; nothing reliable was created`

const argv = process.argv.slice(2)
if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE)
  process.exit(argv.length === 0 ? 2 : 0)
}

if (!argv.includes("--title")) {
  console.error("--title is required\n")
  console.error(USAGE)
  process.exit(2)
}

let raw
try {
  raw = execFileSync(ORCA, ["linear", "create", ...argv, "--json"], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  })
} catch (error) {
  console.error("orca linear create failed:")
  console.error(String(error.stderr || error.stdout || error.message).trim())
  process.exit(3)
}

let identifier
try {
  const parsed = JSON.parse(raw)
  const issue = parsed?.result?.issue ?? parsed?.issue ?? parsed?.result ?? parsed
  identifier = issue?.identifier
} catch {
  identifier = undefined
}

if (!identifier) {
  console.error("orca reported success but no issue identifier was in its JSON, so nothing can be")
  console.error("validated. Raw output follows; check Linear before retrying, to avoid a duplicate.\n")
  console.error(raw.slice(0, 2000))
  process.exit(3)
}

console.log(raw.trim())

try {
  process.stdout.write(
    execFileSync(process.execPath, [path.join(HERE, "check-ticket.mjs"), "--issue", identifier], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  )
  process.exit(0)
} catch (error) {
  console.error(`\n${identifier} was CREATED but is DEFECTIVE:\n`)
  console.error(String(error.stderr || error.stdout || error.message).trim())
  console.error(`\nFix the body, then re-run: node tools/check-ticket.mjs --issue ${identifier}`)
  process.exit(1)
}
