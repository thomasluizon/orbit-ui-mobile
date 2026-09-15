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

function utf8ByteLength(value: string): number {
  let byteLength = 0
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    byteLength += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4
  }
  return byteLength
}

export function buildSupportVersionSuffix(appVersion?: string | null): string {
  const version = appVersion?.trim()
  return version ? `${SUPPORT_VERSION_PREFIX}${version}` : ''
}

export function getSupportMessageMaxLength(appVersion?: string | null): number {
  return SUPPORT_API_MESSAGE_MAX_LENGTH - utf8ByteLength(buildSupportVersionSuffix(appVersion))
}

export function attachSupportVersion(message: string, appVersion?: string | null): string {
  return `${message.trim()}${buildSupportVersionSuffix(appVersion)}`
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
