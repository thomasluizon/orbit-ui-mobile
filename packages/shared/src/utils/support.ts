export interface SupportProfileFields {
  name?: string | null
  email?: string | null
}

export interface SupportFormFields {
  name: string
  email: string
  subject: string
  message: string
}

export interface SupportRequestBody {
  name?: string
  email?: string
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
  hasMessage: boolean
  hasSubject: boolean
  isOnline: boolean
  isSending: boolean
  messageFits: boolean
}

export function getSupportSendReasonKey({
  hasMessage,
  hasSubject,
  isOnline,
  isSending,
  messageFits,
}: SupportSendState): string | null {
  if (!isOnline || isSending) return null
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
    descriptionKey: 'profile.support.subjects.problem.description',
  },
  {
    id: 'billing',
    labelKey: 'profile.support.subjects.billing.label',
    descriptionKey: 'profile.support.subjects.billing.description',
  },
  {
    id: 'account',
    labelKey: 'profile.support.subjects.account.label',
    descriptionKey: 'profile.support.subjects.account.description',
  },
  {
    id: 'other',
    labelKey: 'profile.support.subjects.other.label',
    descriptionKey: 'profile.support.subjects.other.description',
  },
] as const

export type SupportSubjectId = (typeof SUPPORT_SUBJECT_OPTIONS)[number]['id']

export function normalizeSupportSubjectId(value: unknown): SupportSubjectId | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const option = SUPPORT_SUBJECT_OPTIONS.find(({ id }) => id === value)
  return option?.id ?? 'other'
}

export function buildSupportRequestBody(
  profile: SupportProfileFields | null | undefined,
  fields: SupportFormFields,
): SupportRequestBody {
  const name = fields.name.trim()
  const email = fields.email.trim()

  return {
    name: name || profile?.name || undefined,
    email: email || profile?.email || undefined,
    subject: fields.subject.trim(),
    message: fields.message.trim(),
  }
}
