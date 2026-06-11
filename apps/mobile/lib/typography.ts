import type { TextStyle } from 'react-native'
import {
  typeRoles,
  type TypeRoleFamily,
  type TypeRoleName,
} from '@orbit/shared/theme'
import type { AppTokensV2 } from '@/lib/theme'

const FONT_FAMILIES: Record<TypeRoleFamily, Record<number, string>> = {
  sans: {
    400: 'Rubik_400Regular',
    500: 'Rubik_500Medium',
    600: 'Rubik_600SemiBold',
    700: 'Rubik_700Bold',
  },
  display: {
    500: 'Inter_500Medium',
    600: 'Inter_600SemiBold',
    700: 'Inter_700Bold',
  },
  mono: {
    400: 'Roboto_400Regular',
    500: 'Roboto_500Medium',
    700: 'Roboto_700Bold',
  },
}

/** Resolves a loaded font name for the family + weight (nearest loaded weight). */
export function resolveFontFamily(
  family: TypeRoleFamily,
  weight: 400 | 500 | 600 | 700,
): string {
  const familyWeights = FONT_FAMILIES[family]
  const exact = familyWeights[weight]
  if (exact) return exact
  const available = Object.keys(familyWeights)
    .map(Number)
    .sort((a, b) => Math.abs(a - weight) - Math.abs(b - weight))
  return familyWeights[available[0] ?? 400] ?? FONT_FAMILIES.sans[400]!
}

/**
 * RN TextStyle for a shared semantic type role. Pass tokens to resolve the
 * role's color; omit for layout-only usage.
 */
export function typeRoleStyle(
  role: TypeRoleName,
  tokens?: AppTokensV2,
): TextStyle {
  const spec = typeRoles[role]
  const style: TextStyle = {
    fontFamily: resolveFontFamily(spec.family, spec.weight),
  }

  if ('size' in spec && spec.size !== undefined) {
    style.fontSize = spec.size
    if ('lineHeight' in spec && spec.lineHeight !== undefined) {
      style.lineHeight = Math.round(spec.size * spec.lineHeight)
    }
    if ('letterSpacingEm' in spec && spec.letterSpacingEm !== undefined) {
      style.letterSpacing = spec.size * spec.letterSpacingEm
    }
  }
  if ('uppercase' in spec && spec.uppercase) {
    style.textTransform = 'uppercase'
  }
  if ('tabularNums' in spec && spec.tabularNums) {
    style.fontVariant = ['tabular-nums']
  }
  if (tokens) {
    style.color = tokens[spec.colorToken]
  }

  return style
}
