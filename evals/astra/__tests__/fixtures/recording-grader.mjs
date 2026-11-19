import { fileURLToPath } from 'node:url'
import { appendFileSync } from 'node:fs'

// The absolute provider reference that a test sets as ORBIT_EVAL_GRADER.
export const recordingGrader = `file://${fileURLToPath(import.meta.url)}`

// A grader that records each call (the schema its reference names and the prompt) to the file that TEST_GRADER_RECORD names,
// and answers as TEST_GRADER_MODE says: a half read by default, a failed call for `error`, text that is not JSON for `text`.
export default class RecordingGrader {
  constructor(options) { this.schema = options?.config?.schema }

  id() { return 'recording-grader' }

  async callApi(prompt) {
    appendFileSync(process.env.TEST_GRADER_RECORD, `${JSON.stringify({ schema: this.schema ?? null, prompt })}\n`)
    if (process.env.TEST_GRADER_MODE === 'error') return { error: 'Recording grader failed.' }
    if (process.env.TEST_GRADER_MODE === 'text') return { output: 'deleted' }
    return { output: JSON.stringify({ half: 'deleted' }) }
  }
}
