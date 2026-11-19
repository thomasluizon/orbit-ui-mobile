import { fileURLToPath } from 'node:url'

// The absolute provider reference that a test sets as ORBIT_EVAL_GRADER, so the hooks' grader check finds this grader.
export const offlineGrader = `file://${fileURLToPath(import.meta.url)}`

// The card question read (config { schema: 'half' }): the half that each recorded card question asks about, keyed by the
// question text of the capture that serves it (fixtures/core-streams.mjs). An unknown question is unclear.
const questionHalves = {
  'Quais dois hábitos Water - 710ml você quer excluir?': 'deleted',
  'Há 6 Water - 710ml, não 7. Quais dois você quer excluir?': 'deleted',
}
const questionLine = 'Question text: '

export default class MockGrader {
  constructor(options) { this.schema = options?.config?.schema }

  id() { return 'mock-grader' }

  async callApi(prompt) {
    if (this.schema === 'half') {
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
