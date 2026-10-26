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
      response.aiMessage = context.vars.responseMode === 'block-only' ? ''
        : context.vars.responseMode === 'repeated-figure' ? 'One out of one is pending.' : 'Water is ready.'
      const prose = { type: 'text', text: response.aiMessage }
      response.parts = context.vars.responseMode === 'block-only' ? [habitBlock]
        : context.vars.responseMode === 'prose-first' ? [prose, habitBlock] : [habitBlock, prose]
    }
    if (context.vars.noTrace) delete response.evalTrace
    const output = parseResponse(response, '', { response: {
      status: 200, headers: { 'x-orbit-request-id': requestId },
    } })
    if (output.composition) output.answer = visibleAnswer(output.composition, context.vars.clientContext, context.vars.accountDate)
    return { output }
  }
}
