import { suggestionAnswer } from './suggestions.mjs'
import { loadApiProvider } from 'promptfoo'
import { visibleAnswer } from './visible-answer.mjs'
import { completeRestart } from './restart-lifecycle.mjs'
import { structural, behavior } from './assertions.mjs'
import { brainDumpPreview } from './brain-dumps.mjs'
import { approveBrainDump, brainDumpBaseline } from './brain-dump-approval.mjs'

export default class AstraHttpProvider {
  constructor(options) {
    this.config = { ...options.config, validateStatus: '() => true' }
    this.provider = null
  }

  id() { return 'astra-http' }

  async refine(prompt, context, options) {
    const { multipart, transformResponse, ...config } = this.config
    const provider = await loadApiProvider('http', { options: { config: {
      ...config, url: `${config.url}/habit-suggestions/refine`,
      headers: { ...config.headers, 'Content-Type': 'application/json' },
      body: { draft: '{{refineDraftJson}}', instruction: '{{prompt}}', language: '{{clientContext.locale}}' },
      transformResponse: (draft, _text, { response }) => ({ refinedDraft: draft, httpStatus: response.status }),
    } } })
    const response = await provider.callApi(prompt, { ...context, vars: { ...context.vars,
      refineDraftJson: JSON.stringify(context.vars.refineDraft),
    } }, options)
    if (response.output?.httpStatus !== 200) return { ...response, output: { ...response.output, answer: '' } }
    const drafts = structuredClone(context.vars.baselineDrafts).map((draft) => draft.id === context.vars.refineDraft.id ? response.output.refinedDraft : draft)
    return { ...response, output: { ...response.output, drafts,
      answer: suggestionAnswer([{ type: 'block', kind: 'habitSuggestions', block: { drafts } }], context.vars.clientContext.locale),
    } }
  }

  async callApi(prompt, context, options) {
    if (!context.vars.brainDump || context.vars.preconditionFailure) return this.chat(prompt, context, options)
    const baseline = await brainDumpBaseline(context.vars)
    const response = await this.chat(prompt, context, options)
    let verdict = { pass: false, score: 0, reason: response.error ?? 'Missing brain dump response.' }
    if (response.output?.composition && !response.error) {
      for (const grade of [structural, behavior, brainDumpPreview]) {
        verdict = await (grade === brainDumpPreview ? grade(response.output, context.vars)
          : grade(response.output, { vars: context.vars, test: context.test ?? { vars: context.vars } }))
        if (!verdict.pass) break
      }
    }
    response.output ??= {}
    response.output.brainDumpReadback = await approveBrainDump(response.output, context.vars, baseline, verdict)
    return response
  }

  async chat(prompt, context, options) {
    if (context.vars.preconditionFailure) return {
      error: `Precondition unavailable: ${context.vars.preconditionFailure}`,
      metadata: { astraPreconditionFailure: true, astraPreconditionReason: context.vars.preconditionFailure },
    }
    let response
    try {
      if (context.vars.refine) return await this.refine(prompt, context, options)
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
      } catch (error) {
        const renderError = { message: error.message, blockKind: error.blockKind ?? null }
        return { ...response,
          error: `Astra returned an unrenderable visible answer (${renderError.blockKind ?? 'composition'}): ${renderError.message}`,
          output: { ...response.output, answer: null, renderError },
        }
      }
    }
    if (context.vars.restart && response.output?.composition && !response.error) {
      try { response.output = await completeRestart(response.output, context.vars) } catch {
        return { ...response, error: 'Restart approval or independent persisted readback failed.' }
      }
    }
    return response
  }
}
