export default class MockGrader {
  id() { return 'mock-grader' }
  async callApi(prompt) {
    const pass = prompt.includes('Water is ready.') && !prompt.includes('TOOL_TRACE_SECRET')
    return { output: JSON.stringify({ pass, score: pass ? 1 : 0, reason: 'Offline final-answer boundary check.' }) }
  }
}
