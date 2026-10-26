import parseResponse from '../../response.mjs'
import { visibleAnswer } from '../../visible-answer.mjs'
import { chatResponse, habitBlock, toolCall } from './producer.mjs'

export default class MockAstra {
  constructor(options) { this.config = options.config }
  id() { return 'mock-astra' }
  async callApi(_prompt, context) {
    const requestId = context.vars.evalRequestId
    const call = toolCall('log_habit', { habit_id: context.vars.broken ? 'wrong' : 'water' }, 'PendingConfirmation')
    call.result.payload.instruction = 'TOOL_TRACE_SECRET'
    const response = chatResponse(requestId, [call])
    if (context.vars.responseMode) {
      response.aiMessage = ['block-only', 'slow-latency', 'missing-timing'].includes(context.vars.responseMode) ? ''
        : context.vars.responseMode === 'repeated-figure' ? 'One out of one is pending.' : 'Water is ready.'
      const prose = { type: 'text', text: response.aiMessage }
      response.parts = ['block-only', 'slow-latency', 'missing-timing'].includes(context.vars.responseMode) ? [habitBlock]
        : context.vars.responseMode === 'prose-first' ? [prose, habitBlock] : [habitBlock, prose]
    }
    if (context.vars.responseMode === 'slow-latency') {
      const timing = response.evalTrace.timing
      timing.phases.find((phase) => phase.name === 'model_call').milliseconds += 7000 - timing.totalMilliseconds
      timing.phases.find((phase) => phase.name === 'model_call').elapsedMilliseconds += 7000 - timing.totalMilliseconds
      timing.totalMilliseconds = 7000
    }
    if (context.vars.responseMode === 'missing-timing') delete response.evalTrace.timing
    if (context.vars.noTrace) delete response.evalTrace
    const output = parseResponse(response, '', { response: {
      status: 200, headers: { 'x-orbit-request-id': requestId },
    } })
    if (output.composition) output.answer = visibleAnswer(output.composition, context.vars.clientContext, context.vars.accountDate)
    return { output }
  }
}
