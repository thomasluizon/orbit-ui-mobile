import { fileURLToPath } from 'node:url'
import { recordedAnswer } from './recorded-halves.mjs'

// The absolute provider reference that a test sets as ORBIT_EVAL_GRADER, so the hooks' grader check finds this grader.
export const offlineGrader = `file://${fileURLToPath(import.meta.url)}`

// The card question read (config { schema: 'half' }): the answer of a live read when the prompt is one that a live read
// answered (recorded-halves.mjs), else the half of a one-action question of a recorded capture (fixtures/core-streams.mjs),
// keyed by its question text. An unknown question is unclear.
const questionHalves = {
  'Há 6 Water - 710ml, não 7. Quais dois você quer excluir?': 'deleted',
}
const questionLine = 'Question text: '

export default class MockGrader {
  constructor(options) { this.schema = options?.config?.schema }

  id() { return 'mock-grader' }

  async callApi(prompt) {
    if (this.schema === 'half') {
      const recorded = recordedAnswer(prompt)
      if (recorded.value) return { output: JSON.stringify(recorded.value) }
      const line = prompt.split('\n').find((text) => text.startsWith(questionLine))
      return { output: JSON.stringify({ half: (line && questionHalves[JSON.parse(line.slice(questionLine.length))]) ?? 'unclear' }) }
    }
    const pass = (prompt.includes('Water is ready.') || prompt.includes('Water') || prompt.includes('Daily AI message limit reached.') || prompt.includes('habits and goals.')) && !prompt.includes('TOOL_TRACE_SECRET')
      && !prompt.includes('One out of one is pending.')
    if (prompt.includes('One out of one is pending.') && (!prompt.includes('1 of 1') || !prompt.includes('semantic paraphrases'))) {
      throw new Error('Semantic calibration did not receive its block or rubric.')
    }
    return { output: JSON.stringify({ pass, score: pass ? 1 : 0, reason: 'Offline final-answer boundary check.' }) }
  }
}
