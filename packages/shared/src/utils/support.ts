import type { FlowStepFrame } from '../contracts/flow/QuestionFlow'
export interface SupportProfileFields {
  name: string
  email: string
}

export interface SupportFormFields {
  subject: string
  message: string
}

export interface SupportRequestBody {
  name: string
  email: string
  subject: string
  message: string
}

export const SUPPORT_API_MESSAGE_MAX_LENGTH = 5000
const SUPPORT_VERSION_PREFIX = '\n\nOrbit '

export function buildSupportVersionSuffix(appVersion?: string | null): string {
  const version = appVersion?.trim()
  return version ? `${SUPPORT_VERSION_PREFIX}${version}` : ''
}

export function getSupportMessageMaxLength(appVersion?: string | null): number {
  return SUPPORT_API_MESSAGE_MAX_LENGTH - buildSupportVersionSuffix(appVersion).length
}

export function attachSupportVersion(message: string, appVersion?: string | null): string {
  return `${message.trim()}${buildSupportVersionSuffix(appVersion)}`
}

export function getSupportMessageFit(
  message: string,
  appVersion?: string | null,
): { fits: boolean; overage: number } {
  const overage = Math.max(
    0,
    attachSupportVersion(message, appVersion).length - SUPPORT_API_MESSAGE_MAX_LENGTH,
  )
  return { fits: overage === 0, overage }
}

interface SupportSendState {
  hasProfile: boolean
  hasMessage: boolean
  hasSubject: boolean
  isOnline: boolean
  isSending: boolean
  messageFits: boolean
}

export function getSupportSendReasonKey({
  hasProfile,
  hasMessage,
  hasSubject,
  isOnline,
  isSending,
  messageFits,
}: SupportSendState): string | null {
  if (!isOnline || isSending) return null
  if (!hasProfile) return 'profile.support.sendNeedsProfile'
  if (!messageFits) return 'profile.support.sendNeedsShorterMessage'
  if (!hasSubject && !hasMessage) return 'profile.support.sendIncomplete'
  if (!hasSubject) return 'profile.support.sendNeedsSubject'
  if (!hasMessage) return 'profile.support.sendNeedsMessage'
  return null
}

/** Each subject: the label of the current form, and the shorter quick option of the guided flow, which holds one line at 320. */
export const SUPPORT_SUBJECT_OPTIONS = [
  {
    id: 'problem',
    labelKey: 'profile.support.subjects.problem.label',
    optionKey: 'profile.support.subjects.problem.option',
  },
  {
    id: 'billing',
    labelKey: 'profile.support.subjects.billing.label',
    optionKey: 'profile.support.subjects.billing.option',
  },
  {
    id: 'account',
    labelKey: 'profile.support.subjects.account.label',
    optionKey: 'profile.support.subjects.account.option',
  },
  {
    id: 'other',
    labelKey: 'profile.support.subjects.other.label',
    optionKey: 'profile.support.subjects.other.option',
  },
] as const

export type SupportSubjectId = (typeof SUPPORT_SUBJECT_OPTIONS)[number]['id']

export function normalizeSupportSubjectId(value: unknown): SupportSubjectId | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const option = SUPPORT_SUBJECT_OPTIONS.find(({ id }) => id === value)
  return option?.id ?? 'other'
}

export function buildSupportRequestBody(
  profile: SupportProfileFields,
  fields: SupportFormFields,
): SupportRequestBody {
  return {
    name: profile.name.trim(),
    email: profile.email.trim(),
    subject: fields.subject.trim(),
    message: fields.message.trim(),
  }
}

type FlowTranslate = (key: string, values?: Record<string, string>) => string

/** The state of the support flow that its frame reads. */
export interface SupportFlowStepState {
  step: 'subject' | 'message'
  error: string | null
  isSending: boolean
  isOnline: boolean
  disabledReason: string | null
  onBack: () => void
  onClose: () => void
  onSend: () => void
}

/**
 * The frame of a support flow step: the place in the two steps, the question and line, the way back and the send.
 * The subject step has no way back and no send: a subject answers it. A send in progress removes the way back, so the
 * close of the frame closes the flow. The reason the send waits shows only online: offline has its own notice.
 */
export function describeSupportFlowStep(state: SupportFlowStepState, translate: FlowTranslate): FlowStepFrame {
  if (state.step === 'subject') {
    return { position: 1, direction: -1 as const, question: translate('profile.support.subject'), line: null, onBack: undefined, onDismiss: state.onClose, primary: undefined }
  }
  const onBack = state.isSending ? undefined : state.onBack
  const hint = state.isOnline ? state.disabledReason ?? undefined : undefined
  const primary = { label: translate(state.error ? 'profile.support.retry' : 'profile.support.send'), onPress: state.onSend, loading: state.isSending, hint }
  return { position: 2, direction: 1 as const, question: translate('profile.support.message'), line: translate('profile.support.description'), onBack, onDismiss: onBack ?? state.onClose, primary }
}
