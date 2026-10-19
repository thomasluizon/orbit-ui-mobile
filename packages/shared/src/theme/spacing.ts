import definition from './spacing.json'

export const SPACING = definition.scale

export const PADDING = Object.fromEntries(
  Object.entries(definition.roles).map(([role, token]) => [role, SPACING[token as keyof typeof SPACING]]),
) as Record<keyof typeof definition.roles, number>
