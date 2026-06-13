export type TypeRoleFamily = 'sans' | 'display' | 'mono'

export type TypeRoleColor = 'fg1' | 'fg2' | 'fg3'

export interface TypeRole {
  readonly family: TypeRoleFamily
  readonly size?: number
  readonly weight: 400 | 500 | 600 | 700
  readonly lineHeight?: number
  readonly letterSpacingEm?: number
  readonly uppercase?: boolean
  readonly tabularNums?: boolean
  readonly colorToken: TypeRoleColor
}

/**
 * The 11 semantic type roles of the navy+violet system (Rubik = sans,
 * Inter = display, Roboto = mono-role). Web maps these to .t-* classes,
 * mobile to RN TextStyles, the widget to XML attrs.
 */
export const typeRoles = {
  eyebrow: {
    family: 'sans',
    size: 12,
    weight: 500,
    letterSpacingEm: 0.08,
    uppercase: true,
    colorToken: 'fg3',
  },
  display: {
    family: 'sans',
    size: 34,
    weight: 500,
    lineHeight: 1.15,
    letterSpacingEm: -0.01,
    colorToken: 'fg1',
  },
  hero: {
    family: 'display',
    size: 60,
    weight: 700,
    lineHeight: 1.15,
    letterSpacingEm: -0.02,
    colorToken: 'fg1',
  },
  h1: {
    family: 'sans',
    size: 28,
    weight: 500,
    lineHeight: 1.3,
    letterSpacingEm: -0.01,
    colorToken: 'fg1',
  },
  h2: {
    family: 'sans',
    size: 22,
    weight: 500,
    lineHeight: 1.3,
    letterSpacingEm: -0.01,
    colorToken: 'fg1',
  },
  row: {
    family: 'sans',
    size: 18,
    weight: 400,
    lineHeight: 1.3,
    colorToken: 'fg1',
  },
  body: {
    family: 'sans',
    size: 16,
    weight: 400,
    lineHeight: 1.55,
    colorToken: 'fg1',
  },
  secondary: {
    family: 'sans',
    size: 14,
    weight: 400,
    lineHeight: 1.55,
    colorToken: 'fg2',
  },
  meta: {
    family: 'mono',
    size: 12,
    weight: 400,
    letterSpacingEm: 0.02,
    tabularNums: true,
    colorToken: 'fg3',
  },
  num: {
    family: 'mono',
    weight: 500,
    tabularNums: true,
    colorToken: 'fg1',
  },
  numXl: {
    family: 'display',
    size: 44,
    weight: 700,
    lineHeight: 1,
    letterSpacingEm: -0.02,
    tabularNums: true,
    colorToken: 'fg1',
  },
} as const satisfies Record<string, TypeRole>

export type TypeRoleName = keyof typeof typeRoles
