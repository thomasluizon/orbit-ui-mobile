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
