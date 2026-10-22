import parseResponse from '../../response.mjs'
import { chatResponse, toolCall } from './producer.mjs'

export default class MockAstra {
  constructor(options) { this.config = options.config }
  id() { return 'mock-astra' }
  async callApi(_prompt, context) {
    const requestId = context.vars.evalRequestId
    const call = toolCall('log_habit', { habit_id: context.vars.broken ? 'wrong' : 'water' }, 'PendingConfirmation')
    call.result.payload.instruction = 'TOOL_TRACE_SECRET'
    const response = chatResponse(requestId, [call])
    if (context.vars.noTrace) delete response.evalTrace
    return { output: parseResponse(response, '', { response: {
      status: 200, headers: { 'x-orbit-request-id': requestId },
    } }) }
  }
}
