import { chmodSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { check, root, run, stage, T } from "./_harness.mjs"

const TOOL = "record-classifier-fixtures.mjs"

export const cases = () => {
  check(TOOL, "unknown option is a usage error", ["--orbit-not-a-flag"], { status: 2, stderr: /usage:/ })
  const binary = stage("record-classifier/codex-stub.mjs", `#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs"
const cases = JSON.parse(readFileSync(process.env.ORBIT_CLASSIFIER_CASES, "utf8"))
const responses = JSON.parse(readFileSync(process.env.ORBIT_CLASSIFIER_RESPONSES, "utf8"))
const input = readFileSync(0, "utf8")
const body = input.split("<ticket-body>\\n")[1].split("\\n</ticket-body>")[0]
const entry = cases.find((item) => item.body === body)
if (!entry) process.exit(1)
writeFileSync(process.argv[process.argv.indexOf("-o") + 1], JSON.stringify(responses[entry.id]))
process.stdout.write(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } }) + "\\n")
`)
  chmodSync(binary, 0o755)
  const output = join(root, "record-classifier", "replayed.json")
  const environment = {
    ORBIT_CLASSIFIER_CODEX_BIN: binary,
    ORBIT_CLASSIFIER_CASES: new URL("../__fixtures__/ticket-classifier-cases.json", import.meta.url).pathname,
    ORBIT_CLASSIFIER_RESPONSES: new URL("../__fixtures__/ticket-classifier-responses.json", import.meta.url).pathname,
  }
  const result = run(TOOL, ["--output", output], { env: environment })
  const cases = JSON.parse(readFileSync(new URL("../__fixtures__/ticket-classifier-cases.json", import.meta.url), "utf8"))
  T(`${TOOL}: recorder replays every captured response`, result.status === 0 && result.stdout.includes(`agreement ${cases.length}/${cases.length}`), result.stderr || result.stdout)
  T(`${TOOL}: recorder writes responses without usage metadata`, existsSync(output) && Object.keys(JSON.parse(readFileSync(output, "utf8"))).length === cases.length)
}
