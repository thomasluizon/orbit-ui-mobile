import { loadApiProvider } from 'promptfoo'
import { visibleAnswer } from './visible-answer.mjs'

export default class AstraHttpProvider {
  constructor(options) {
    this.config = { ...options.config, validateStatus: '() => true' }
    this.provider = null
  }

  id() { return 'astra-http' }

  async callApi(prompt, context, options) {
    if (context.vars.preconditionFailure) return {
      error: `Precondition unavailable: ${context.vars.preconditionFailure}`,
      metadata: { astraPreconditionFailure: true, astraPreconditionReason: context.vars.preconditionFailure },
    }
    let response
    try {
      this.provider ??= loadApiProvider('http', { options: { config: this.config } })
      response = await (await this.provider).callApi(prompt, context, options)
    } catch (error) {
      const status = error.name === 'HttpRateLimitError' && error.status === 429 ? 429 : null
      return { error: status ? 'Astra returned HTTP 429.' : 'Astra HTTP request failed.',
        metadata: { astraHttpStatus: status, rateLimitRetryable: false } }
    }
    if (response.metadata?.http) {
      const { status, ...http } = response.metadata.http
      response.metadata = { ...response.metadata, http, astraHttpStatus: status, rateLimitRetryable: false }
    }
    if (response.output?.composition && !response.output.error) {
      try {
        response.output.answer = visibleAnswer(response.output.composition, context.vars.clientContext, context.vars.accountDate)
      } catch {
        return { error: 'Astra returned an unrenderable visible answer.' }
      }
    }
    return response
  }
}
