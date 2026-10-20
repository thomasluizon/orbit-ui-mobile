import { chmodSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { check, root, run, stage, T } from "./_harness.mjs"

const TOOL = "record-classifier-fixtures.mjs"

export const cases = () => {
  check(TOOL, "unknown option is a usage error", ["--orbit-not-a-flag"], { status: 2, stderr: /usage:/ })
  const binary = stage("record-classifier/claude-stub.mjs", `#!/usr/bin/env node
import { readFileSync } from "node:fs"
const cases = JSON.parse(readFileSync(process.env.ORBIT_CLASSIFIER_CASES, "utf8"))
const responses = JSON.parse(readFileSync(process.env.ORBIT_CLASSIFIER_RESPONSES, "utf8"))
const input = readFileSync(0, "utf8")
const body = input.split("<ticket-body>\\n")[1].split("\\n</ticket-body>")[0]
const entry = cases.find((item) => item.body === body)
if (!entry) process.exit(1)
const envelope = JSON.parse(readFileSync(process.env.ORBIT_CLASSIFIER_ENVELOPE, "utf8"))
process.stdout.write(JSON.stringify({ ...envelope, structured_output: responses[entry.id] }))
`)
  chmodSync(binary, 0o755)
  const output = join(root, "record-classifier", "replayed.json")
  const environment = {
    ORBIT_CLASSIFIER_CLAUDE_BIN: binary,
    ORBIT_CLASSIFIER_ENVELOPE: new URL("../__fixtures__/ticket-classifier-envelope.json", import.meta.url).pathname,
    ORBIT_CLASSIFIER_CASES: new URL("../__fixtures__/ticket-classifier-cases.json", import.meta.url).pathname,
    ORBIT_CLASSIFIER_RESPONSES: new URL("../__fixtures__/ticket-classifier-responses.json", import.meta.url).pathname,
  }
  const result = run(TOOL, ["--output", output], { env: environment })
  const cases = JSON.parse(readFileSync(new URL("../__fixtures__/ticket-classifier-cases.json", import.meta.url), "utf8"))
  T(`${TOOL}: recorder replays every captured response`, result.status === 0 && result.stdout.includes(`agreement ${cases.length}/${cases.length}`), result.stderr || result.stdout)
  T(`${TOOL}: recorder writes responses without usage metadata`, existsSync(output) && Object.keys(JSON.parse(readFileSync(output, "utf8"))).length === cases.length)
  const calibrationPath = join(root, "record-classifier", "ticket-classifier-calibration.json")
  const calibration = existsSync(calibrationPath) ? JSON.parse(readFileSync(calibrationPath, "utf8")) : null
  T(`${TOOL}: recorder binds calibration to its model, prompt and complete agreement`, calibration?.model === JSON.parse(readFileSync(new URL("../../.claude/orchestrator.json", import.meta.url), "utf8")).classifier.model && /^[a-f0-9]{16}$/.test(calibration.promptDigest) && calibration.agreement === `${cases.length}/${cases.length}` && calibration.responsesDigest && calibration.casesDigest)
}
