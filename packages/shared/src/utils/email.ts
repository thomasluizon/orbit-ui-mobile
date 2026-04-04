export function isValidEmail(value: string): boolean {
  const email = value.trim()
  if (!email || email.includes(' ')) return false

  const parts = email.split('@')
  if (parts.length !== 2) return false

  const [localPart, domainPart] = parts
  if (!localPart || !domainPart) return false
  if (localPart.includes('..') || domainPart.includes('..')) return false
  if (domainPart.startsWith('.') || domainPart.endsWith('.')) return false

  const domainSegments = domainPart.split('.')
  if (domainSegments.length < 2) return false
  if (domainSegments.some(segment => segment.length === 0)) return false

  return true
}
