import parseResponse from '../../response.mjs'

export default class MockAstra {
  constructor(options) { this.config = options.config }
  id() { return 'mock-astra' }
  async callApi(_prompt, context) {
    if (context.vars.noTrace) return { output: parseResponse({ aiMessage: 'Water is ready.' }) }
    return { output: {
      answer: 'Water is ready.',
      trace: { state: 'available', requestId: 'offline', responseRequestId: 'offline', calls: [{
        name: 'log_habit', arguments: { habit_id: context.vars.broken ? 'wrong' : 'water' },
        resultStatus: 'ok', result: { privateText: 'TOOL_TRACE_SECRET' },
      }] },
    } }
  }
}
