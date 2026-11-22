import { completeOfferAttempt } from './offer-lifecycle.mjs'
import { withLegacyProfileLanguage } from './fixtures/language.mjs'
import { suggestionAnswer } from './suggestions.mjs'
import { loadApiProvider } from 'promptfoo'
import { visibleAnswer } from './visible-answer.mjs'
import { safeFailureMessage } from './credentials.mjs'
import { restoreOfferTimeZone } from './fixtures/offer-timezone.mjs'
import { gradedByOutcome } from './grade-method.mjs'
import { offerTurns, openCaseConversation, runOutcomeCase } from './client-path.mjs'

export default class OrbitHttpProvider {
  constructor(options) {
    this.config = { ...options.config, validateStatus: '() => true' }
    this.provider = null
  }

  id() { return 'orbit-http' }

  async refine(prompt, context, options) {
    const { multipart: _multipart, transformResponse: _transformResponse, ...config } = this.config
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
    try { return await withLegacyProfileLanguage(context.vars, () => this.attempt(prompt, context, options)) }
    finally { await restoreOfferTimeZone(context.vars) }
  }

  // A case with an outcome runs on the client path. An offers case then runs its lifecycle in the same conversation.
  async outcomeCase(vars) {
    if (vars.preconditionFailure) return runOutcomeCase(vars)
    const conversation = vars.conversation ?? openCaseConversation(vars)
    const response = await runOutcomeCase(vars, { conversation })
    if (vars.offerFamily && response.output?.composition && !response.error) {
      response.output.offerReadback = await completeOfferAttempt(response.output, vars, offerTurns(conversation))
    }
    return response
  }

  async attempt(prompt, context, options) {
    if (gradedByOutcome(context.vars)) return this.outcomeCase(context.vars)
    return this.chat(prompt, context, options)
  }

  async chat(prompt, context, options) {
    if (context.vars.preconditionFailure) return {
      error: `Precondition unavailable: ${context.vars.preconditionFailure}`,
      metadata: { orbitPreconditionFailure: true, orbitPreconditionReason: context.vars.preconditionFailure, rateLimitRetryable: false },
    }
    let response
    try {
      if (context.vars.refine) return await this.refine(prompt, context, options)
      this.provider ??= loadApiProvider('http', { options: { config: this.config } })
      response = await (await this.provider).callApi(prompt, context, options)
    } catch (error) {
      const status = error.name === 'HttpRateLimitError' && error.status === 429 ? 429 : null
      return { error: status ? 'Orbit returned HTTP 429.' : `Orbit HTTP request failed: ${safeFailureMessage(error)}`,
        metadata: { orbitHttpStatus: status, rateLimitRetryable: false } }
    }
    if (response.metadata?.http) {
      const { status, ...http } = response.metadata.http
      response.metadata = { ...response.metadata, http, orbitHttpStatus: status, rateLimitRetryable: false }
    }
    if (response.output?.composition && !response.output.error) {
      try {
        response.output.answer = visibleAnswer(response.output.composition, context.vars.clientContext, context.vars.accountDate,
          context.vars.accountTimeZone)
      } catch (error) {
        const renderError = { message: error.message, blockKind: error.blockKind ?? null }
        return { ...response,
          error: `Orbit returned an unrenderable visible answer (${renderError.blockKind ?? 'composition'}): ${renderError.message}`,
          output: { ...response.output, answer: null, renderError },
        }
      }
    }
    return response
  }
}
