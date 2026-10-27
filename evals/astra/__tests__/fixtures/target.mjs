import parseResponse from '../../response.mjs'
import AstraHttpProvider from '../../http-provider.mjs'
import { chatResponse, habitBlock, toolCall } from './producer.mjs'

export default class MockAstra {
  constructor(options) { this.config = options.config }
  id() { return 'mock-astra' }
  async callApi(_prompt, context) {
    const requestId = context.vars.evalRequestId
    const call = toolCall('log_habit', { habit_id: context.vars.broken ? 'wrong' : 'water' }, 'PendingConfirmation')
    call.result.payload.instruction = 'TOOL_TRACE_SECRET'
    Object.assign(call.result.payload, { token: 'PRIVATE_TOKEN_VALUE', cookie: 'PRIVATE_COOKIE_VALUE',
      refreshToken: 'PRIVATE_REFRESH_VALUE', accountId: 'PRIVATE_ACCOUNT_VALUE', email: 'private@example.invalid' })
    const response = chatResponse(requestId, [call])
    if (context.vars.responseMode) {
      response.aiMessage = context.vars.responseMode === 'block-only' ? ''
        : context.vars.responseMode === 'repeated-figure' ? 'One out of one is pending.' : 'Water is ready.'
      const prose = { type: 'text', text: response.aiMessage }
      response.parts = context.vars.responseMode === 'block-only' ? [habitBlock]
        : context.vars.responseMode === 'prose-first' ? [prose, habitBlock] : [habitBlock, prose]
    }
    if (context.vars.noTrace) delete response.evalTrace
    if (context.vars.responseMode === 'unrenderable') response.parts = [{ type: 'block', kind: 'habitList', block: {} }]
    const output = parseResponse(response, '', { response: {
      status: 200, headers: { 'x-orbit-request-id': requestId },
    } })
    const provider = new AstraHttpProvider({ config: {} })
    provider.provider = Promise.resolve({ callApi: async () => ({ output }) })
    return provider.callApi(_prompt, context)
  }
}
