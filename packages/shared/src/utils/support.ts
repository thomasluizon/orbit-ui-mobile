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

export const SUPPORT_API_SUBJECT_MAX_LENGTH = 200
export const SUPPORT_API_MESSAGE_MAX_LENGTH = 5000

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
