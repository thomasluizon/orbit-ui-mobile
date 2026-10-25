import { loadApiProvider } from 'promptfoo'

export default class AstraHttpProvider {
  constructor(options) {
    this.config = options.config
    this.provider = loadApiProvider('http', { options: { config: this.config } })
  }

  id() { return 'astra-http' }

  async callApi(prompt, context, options) {
    const response = await (await this.provider).callApi(prompt, context, options)
    const output = response.output
    if (context.vars.expectedHttpStatus === 403 && response.metadata?.http?.status === 403
      && output?.httpStatus === 403 && output.trace?.state === 'refused'
      && output.trace.responseRequestId === context.vars.evalRequestId) {
      const { status: _expectedStatus, ...http } = response.metadata.http
      response.metadata = { ...response.metadata, http }
    }
    return response
  }
}
