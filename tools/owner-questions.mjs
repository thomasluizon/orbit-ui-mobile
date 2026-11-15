#!/usr/bin/env node
import { text } from "node:stream/consumers"
import { pathToFileURL } from "node:url"
import { ownerQuestionCandidates, recordQuestionFilter } from "./lib/owner-questions.mjs"

const USAGE = `usage: owner-questions.mjs --list | --record

  Lists and filters the owner question queue of the current run.
  Reads session identity from CLAUDE_CODE_SESSION_ID. The run state counts when this session
  owns it, or when no other session still holds it: a stopped run, or an unattended run whose
  session process is gone. A live unattended run of another session keeps its own queue.
  --list      print the candidates as a JSON array on stdout: one row per distinct question
              from the open session chain and the run state, as { id, question, sources, blocks }
              plus every other field its rows carry, such as ticket or recommendation. The list
              starts at the newest recorded filter; after a filter of this session, only the run
              state holds candidates
  --record    read the dispositions as a JSON array on stdin, exactly one row per candidate id:
              { id, disposition, record?, of?, blocks? }
                answered | decided   record names where the work reads the answer or the decision
                owner-step           record names the spec line that lists the step as owner-only
                duplicate            of names the candidate id that carries the same question
                queued               the question stays for the owner's own /questions
              blocks adds blockers to a queued row, directly or through a duplicate.
              Writes the surviving rows to that run's openOwnerQuestions with the filter record, and
              prints them as a JSON array of { question, sources, blocks } with the other fields
              of the queued row and its duplicates. The filter record keeps each settled row of
              an earlier filter of this session that the new rows do not name.
  --help, -h  print usage and exit 0

exit codes: 0 done, 1 QUESTIONS_REFUSED (no session, no run state, a run that another session
  still holds, or dispositions that do not cover the candidates), 2 usage error`

const main = async () => {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) { process.stdout.write(`${USAGE}\n`); return }
  if (args.length !== 1 || !["--list", "--record"].includes(args[0])) { process.stderr.write(`${USAGE}\n`); process.exitCode = 2; return }
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID
  if (!sessionId) throw new Error("no CLAUDE_CODE_SESSION_ID")
  if (args[0] === "--list") { process.stdout.write(`${JSON.stringify(ownerQuestionCandidates(sessionId), null, 2)}\n`); return }
  let dispositions
  try { dispositions = JSON.parse(await text(process.stdin)) } catch (error) { throw new Error(`stdin is not JSON: ${error.message}`, { cause: error }) }
  process.stdout.write(`${JSON.stringify(recordQuestionFilter(sessionId, dispositions), null, 2)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { process.stderr.write(`QUESTIONS_REFUSED: ${error.message}\n`); process.exitCode = 1 })
}
