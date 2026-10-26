export default class MockGrader {
  id() { return 'mock-grader' }
  async callApi(prompt) {
    const pass = (prompt.includes('Water is ready.') || prompt.includes('Water') || prompt.includes('Daily AI message limit reached.') || prompt.includes('habits and goals.')) && !prompt.includes('TOOL_TRACE_SECRET')
      && !prompt.includes('One out of one is pending.')
    if (prompt.includes('One out of one is pending.') && (!prompt.includes('1 of 1') || !prompt.includes('semantic paraphrases'))) {
      throw new Error('Semantic calibration did not receive its block or rubric.')
    }
    return { output: JSON.stringify({ pass, score: pass ? 1 : 0, reason: 'Offline final-answer boundary check.' }) }
  }
}
