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

export const SUPPORT_SUBJECT_OPTIONS = [
  {
    id: 'problem',
    labelKey: 'profile.support.subjects.problem.label',
  },
  {
    id: 'billing',
    labelKey: 'profile.support.subjects.billing.label',
  },
  {
    id: 'account',
    labelKey: 'profile.support.subjects.account.label',
  },
  {
    id: 'other',
    labelKey: 'profile.support.subjects.other.label',
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
