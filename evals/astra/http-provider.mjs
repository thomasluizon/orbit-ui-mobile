import { loadApiProvider } from 'promptfoo'

export default class AstraHttpProvider {
  constructor(options) {
    this.config = { ...options.config, validateStatus: '() => true' }
    this.provider = loadApiProvider('http', { options: { config: this.config } })
  }

  id() { return 'astra-http' }

  async callApi(prompt, context, options) {
    let response
    try {
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
    return response
  }
}
