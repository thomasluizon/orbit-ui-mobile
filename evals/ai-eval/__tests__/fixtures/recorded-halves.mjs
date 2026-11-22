import { readFileSync } from 'node:fs'

// Three real reads of a card question through the real path (sameTitleCard, askGrader, ORBIT_EVAL_GRADER=claude-grader.mjs,
// the installed CLI, Opus 5.5), recorded on 19 November 2026 with a recording shim in front of the CLI. Each entry holds the
// argument list, the prompt that the CLI read on stdin, and the complete JSON result: the English baseline card that asks
// about both halves, the run 3 card that asks about both halves, and the one-action control. The session id and the message
// uuid were removed; every other field is as the CLI printed it.
export const recordedReads = JSON.parse(readFileSync(new URL('./claude-grader-half-results.json', import.meta.url), 'utf8'))

// The recorded answer to a prompt, byte for byte, as askGrader returns it. A prompt that no read answered gets an error,
// so a test that depends on a read fails when the production prompt drifts from the prompt that the live read answered.
export function recordedAnswer(prompt) {
  const read = recordedReads.find((entry) => entry.prompt === prompt)
  return read ? { value: read.result.structured_output } : { error: 'No live read of the card question answered this prompt.' }
}

export const recordedAskGrader = async (prompt) => recordedAnswer(prompt)
