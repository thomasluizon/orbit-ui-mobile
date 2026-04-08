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
