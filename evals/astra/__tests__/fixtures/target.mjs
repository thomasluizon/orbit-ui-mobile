import parseResponse from '../../response.mjs'
import AstraHttpProvider from '../../http-provider.mjs'
import { READ_LATENCY_BUDGET_MILLISECONDS } from '../../latency.mjs'
import { chatResponse, habitBlock, toolCall, turnTiming } from './producer.mjs'

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
    if (context.vars.composition.mode === 'data') response.evalTrace.timing = turnTiming()
    if (context.vars.responseMode) {
      response.aiMessage = ['block-only', 'slow-latency', 'missing-timing'].includes(context.vars.responseMode) ? ''
        : context.vars.responseMode === 'repeated-figure' ? 'One out of one is pending.' : 'Water is ready.'
      const prose = { type: 'text', text: response.aiMessage }
      response.parts = ['block-only', 'slow-latency', 'missing-timing'].includes(context.vars.responseMode) ? [habitBlock]
        : context.vars.responseMode === 'prose-first' ? [prose, habitBlock] : [habitBlock, prose]
    }
    if (context.vars.responseMode === 'slow-latency') {
      const timing = response.evalTrace.timing
      const slowMilliseconds = READ_LATENCY_BUDGET_MILLISECONDS + 2000
      timing.phases.find((phase) => phase.name === 'model_call').milliseconds += slowMilliseconds - timing.totalMilliseconds
      timing.phases.find((phase) => phase.name === 'model_call').elapsedMilliseconds += slowMilliseconds - timing.totalMilliseconds
      timing.totalMilliseconds = slowMilliseconds
    }
    if (context.vars.responseMode === 'missing-timing') delete response.evalTrace.timing
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
