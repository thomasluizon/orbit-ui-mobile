#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { addComment, readTicket, resolveTicket } from "./lib/github-issues.mjs"
import { runFilePath, runFiles } from "./lib/run-files.mjs"

const PREFIX = "run-files/"
const USAGE = `usage: run-file.mjs --get <name> [--out <file>]
       run-file.mjs --put <name> --file <file> --issue <ORB-N|#N|N>

  Keeps large run data, such as an eval baseline window, as one file under ${PREFIX} in the private
  tickets repository, so a fresh clone on any computer reads it. GitHub serves a file of up to 100 MB.

  --get <name>      print the file to stdout, or write it to --out
  --put <name>      store --file under ${PREFIX}<name>, replacing the version this run read, then comment
                    on --issue with the name and blob sha, so the ticket links its data
  --file <file>     the local file to store (with --put)
  --issue <ref>     the ticket that owns the data (with --put); copy it from output of this run
  --out <file>      write the file here instead of stdout (with --get)
  --help, -h        print this usage and exit 0

  <name> is a relative path of plain names, for example 2135/baseline-windows.json.

exit codes: 0 done, 1 a GitHub read or write failed, 2 usage error, 3 the file does not exist`

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const VALUE_FLAGS = new Set(["--get", "--put", "--file", "--issue", "--out"])
const values = {}
const argv = process.argv.slice(2)
for (let index = 0; index < argv.length; index++) {
  const flag = argv[index]
  if (flag === "--help" || flag === "-h") {
    console.log(USAGE)
    process.exit(0)
  }
  if (!VALUE_FLAGS.has(flag) || typeof argv[index + 1] !== "string" || argv[index + 1].startsWith("--")) fail(2, `${USAGE}\n\nunknown option or missing value: ${flag}`)
  values[flag] = argv[++index]
}
const get = values["--get"]
const put = values["--put"]
if (Boolean(get) === Boolean(put)) fail(2, `${USAGE}\n\npass exactly one of --get or --put`)
if (get && (values["--file"] || values["--issue"])) fail(2, `${USAGE}\n\n--file and --issue go with --put`)
if (put && (!values["--file"] || !values["--issue"] || values["--out"])) fail(2, `${USAGE}\n\n--put needs --file and --issue, and takes no --out`)
let path
try { path = runFilePath(`${PREFIX}${get ?? put}`) } catch (error) { fail(2, `run-file: ${error.message}`) }
const store = runFiles()

if (get) {
  let file
  try { file = store.read(path) } catch (error) { fail(1, `run-file: ${error.message}`) }
  if (file.bytes === null) fail(3, `run-file: ${path} does not exist in ${store.repository}`)
  if (values["--out"]) writeFileSync(resolve(values["--out"]), file.bytes)
  else process.stdout.write(file.bytes)
  process.exit(0)
}

let resolved
try { resolved = resolveTicket(values["--issue"]) } catch (error) { fail(2, `run-file: ${error.message}`) }
let bytes
try { bytes = readFileSync(resolve(values["--file"])) } catch (error) { fail(2, `run-file: cannot read ${values["--file"]}: ${error.message}`) }
try {
  const ticket = await readTicket(resolved.number, { withProjectItem: false })
  const { sha } = store.read(path)
  const written = store.write(path, bytes, sha, `run file: ${path} for #${ticket.number}`)
  await addComment(ticket.number, `Run data \`${path}\` is stored in the tickets repository (blob \`${written.sha}\`, ${bytes.length} bytes). Read it on any computer with \`node tools/run-file.mjs --get ${put}\`.\n`)
  console.log(JSON.stringify({ path, sha: written.sha, bytes: bytes.length, issue: ticket.number }))
} catch (error) {
  fail(1, `run-file: ${error.message}`)
}
