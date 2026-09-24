#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { recordClassification } from "./lib/ticket-executability.mjs"

const USAGE = `usage: record-classifier-fixtures.mjs [--output <path>]

  Records real Codex CLI structured responses for every ticket classifier replay case.
  --output <path>  output JSON path (default tools/__fixtures__/ticket-classifier-responses.json)
  --help, -h       print usage

exit codes: 0 all cases agree, 1 a call or verdict failed, 2 usage error`
const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`${USAGE}\n`)
  process.exit(0)
}
let output = fileURLToPath(new URL("./__fixtures__/ticket-classifier-responses.json", import.meta.url))
if (args.length > 0) {
  if (args.length !== 2 || args[0] !== "--output" || !args[1] || args[1].startsWith("-")) {
    process.stderr.write(`${USAGE}\n`)
    process.exit(2)
  }
  output = resolve(args[1])
}

const cases = JSON.parse(await readFile(new URL("./__fixtures__/ticket-classifier-cases.json", import.meta.url), "utf8"))
const responses = {}
let agreed = 0
let failed = false
for (const entry of cases) {
  const started = performance.now()
  let events = ""
  try {
    const result = await recordClassification(entry.body, { onEvents: (stream) => { events = stream }, onResponse: (response) => { responses[entry.id] = response } })
    responses[entry.id] = result.response
    const event = events.trim().split("\n").map((line) => JSON.parse(line)).findLast((item) => item.type === "turn.completed")
    const usage = event?.usage
    if (!usage || !Number.isInteger(usage.input_tokens) || !Number.isInteger(usage.output_tokens)) throw new Error("Codex CLI returned no token usage")
    const names = new Set(entry.labels.map((label) => typeof label === "string" ? label : label.name))
    const signals = names.has("needs:conversation") ? ["LABEL"] : names.has("needs:no-conversation") ? [] : result.classification.signals.map((item) => item.kind)
    const deferrals = result.classification.deferrals.map((item) => item.reason)
    const pass = JSON.stringify(deferrals) === JSON.stringify(entry.expected.deferrals) && JSON.stringify(signals) === JSON.stringify(entry.expected.signals)
    if (pass) agreed++
    else failed = true
    process.stdout.write(`${entry.id}: ${pass ? "PASS" : "FAIL"} ${Math.round(performance.now() - started)} ms input ${usage.input_tokens} output ${usage.output_tokens}${pass ? "" : ` expected ${JSON.stringify(entry.expected)} got ${JSON.stringify({ deferrals, signals })}`}\n`)
  } catch (error) {
    failed = true
    const completed = events.trim().split("\n").flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } }).findLast((item) => item.type === "turn.completed")
    process.stdout.write(`${entry.id}: FAIL ${Math.round(performance.now() - started)} ms input ${completed?.usage?.input_tokens ?? "n/a"} output ${completed?.usage?.output_tokens ?? "n/a"} ${error.message}\n`)
  }
}
await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(responses, null, 2)}\n`)
process.stdout.write(`agreement ${agreed}/${cases.length}\n`)
process.exitCode = failed ? 1 : 0
