import type { ApiKeyCreateRequest } from '../types/api-key'
import { apiKeyFormSchema, getApiKeyNameError } from '../validation/api-key-form'

/** The steps of the API key create flow. `reveal` shows the new key once and is never a question. */
export type ApiKeyCreateStep = 'name' | 'access' | 'scope' | 'expiry' | 'reveal'
export type ApiKeyQuestionStep = Exclude<ApiKeyCreateStep, 'reveal'>

export const API_KEY_CREATE_QUESTION_KEYS: Readonly<Record<ApiKeyCreateStep, string>> = {
  name: 'orbitMcp.keyName',
  access: 'profile.apiKeys.accessQuestion',
  scope: 'profile.apiKeys.scopeLabel',
  expiry: 'profile.apiKeys.expiryQuestion',
  reveal: 'orbitMcp.revealHeading',
}

/** The place of the flow: the step on screen, the steps of this key, and the question before and after it. */
export interface ApiKeyCreatePosition {
  step: ApiKeyCreateStep
  steps: readonly ApiKeyCreateStep[]
  index: number
  next: ApiKeyQuestionStep | null
  previous: ApiKeyQuestionStep | null
}

/** Only a scoped key asks for its scope. A created key shows the reveal step, which has no way back. */
export function apiKeyCreatePosition(question: ApiKeyQuestionStep, scoped: boolean, created: boolean): ApiKeyCreatePosition {
  const steps: ApiKeyCreateStep[] = scoped ? ['name', 'access', 'scope', 'expiry', 'reveal'] : ['name', 'access', 'expiry', 'reveal']
  const step: ApiKeyCreateStep = created ? 'reveal' : question
  const index = steps.indexOf(step)
  const after = steps[index + 1]
  const before = steps[index - 1]
  return {
    step,
    steps,
    index,
    next: after && after !== 'reveal' ? after : null,
    previous: step !== 'reveal' && before ? (before as ApiKeyQuestionStep) : null,
  }
}

/** The field a text step sends the person back to, or null when its answer lets the flow go on. */
export function apiKeyTextStepIssue(step: 'name' | 'scope', name: string, scope: string): 'name' | 'scope' | null {
  if (step === 'name') return getApiKeyNameError(name) ? 'name' : null
  return scope.trim() ? null : 'scope'
}

export type ApiKeyCreateSubmission =
  | { kind: 'name' }
  | { kind: 'expiry' }
  | { kind: 'ready'; request: ApiKeyCreateRequest }

/** The answers as one create request, or the step that holds the wrong answer: a bad name goes back to the name step, a bad expiry stays on the expiry step. */
export function readApiKeyCreateSubmission({ name, scope, expiresAt, scoped }: { name: string; scope: string; expiresAt: string; scoped: boolean }): ApiKeyCreateSubmission {
  const form = apiKeyFormSchema.safeParse({ name, expiresAt })
  if (!form.success) return { kind: getApiKeyNameError(name) ? 'name' : 'expiry' }
  return { kind: 'ready', request: { name: form.data.name, ...(scoped ? { scopes: [scope.trim()] } : {}), expiresAtUtc: form.data.expiresAt } }
}

/** The main action of a step. The access step has none: each option answers it. */
export function apiKeyCreatePrimary(step: ApiKeyCreateStep): { labelKey: string; action: 'continue' | 'create' | 'close' } | null {
  if (step === 'access') return null
  if (step === 'reveal') return { labelKey: 'orbitMcp.done', action: 'close' }
  if (step === 'expiry') return { labelKey: 'profile.apiKeys.scopeAction', action: 'create' }
  return { labelKey: 'common.continue', action: 'continue' }
}
