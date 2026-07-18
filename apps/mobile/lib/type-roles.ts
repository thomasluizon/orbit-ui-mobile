import type { TextStyle } from 'react-native'
import { typeRoles, type TypeRole, type TypeRoleName } from '@orbit/shared/theme'
import type { AppTokensV2 } from './theme'

const familyName = { sans: 'Rubik', display: 'Inter', mono: 'Roboto' } as const
const weightName = { 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold' } as const

/**
 * Resolve one of the shared DESIGN.md type roles to a React Native `TextStyle`,
 * so mobile primitives bind to the same scale the web `.t-*` classes bind to
 * instead of hand-rolling a family/size/weight per component.
 */
export function typeRoleStyle(name: TypeRoleName, tokens: AppTokensV2): TextStyle {
  const role: TypeRole = typeRoles[name]
  const { size } = role

  return {
    fontFamily: `${familyName[role.family]}_${role.weight}${weightName[role.weight]}`,
    ...(size === undefined ? {} : { fontSize: size }),
    ...(size !== undefined && role.lineHeight !== undefined
      ? { lineHeight: Math.round(size * role.lineHeight) }
      : {}),
    ...(size !== undefined && role.letterSpacingEm !== undefined
      ? { letterSpacing: size * role.letterSpacingEm }
      : {}),
    ...(role.uppercase === true ? { textTransform: 'uppercase' as const } : {}),
    ...(role.tabularNums === true ? { fontVariant: ['tabular-nums' as const] } : {}),
    color: tokens[role.colorToken],
  }
}
