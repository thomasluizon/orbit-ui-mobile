import type { SchemeMode } from './types'

export interface NeutralColors {
  readonly bg: string
  readonly bgCard: string
  readonly bgField: string
  readonly bgWell: string
  readonly bgElev: string
  readonly bgElev2: string
  readonly bgHover: string
  readonly bgSunk: string
  readonly hairline: string
  readonly borderControl: string
  readonly hairlineGhost: string
  readonly hairlineStrong: string
  readonly fg1: string
  readonly fg2: string
  readonly fg3: string
  readonly fg4: string
  readonly scrim: string
}

/** Byte-exact neutral and surface roles from the DESIGN.md token table. */
export const neutralColors: Record<SchemeMode, NeutralColors> = {
  dark: {
    bg: '#09090B',
    bgCard: 'rgba(250,250,250,0.04)',
    bgField: 'rgba(250,250,250,0.06)',
    bgWell: 'rgba(250,250,250,0.08)',
    bgElev: '#1C1C1E',
    bgElev2: 'rgba(250,250,250,0.12)',
    bgHover: 'rgba(250,250,250,0.14)',
    bgSunk: 'rgba(0,0,0,0.28)',
    hairline: 'rgba(255,255,255,0.08)',
    borderControl: 'rgba(255,255,255,0.08)',
    hairlineGhost: 'rgba(255,255,255,0.10)',
    hairlineStrong: 'rgba(255,255,255,0.16)',
    fg1: '#F4F4F6',
    fg2: '#C9C9CC',
    fg3: '#8F8F93',
    fg4: '#5D5D60',
    scrim: 'rgba(0,0,0,0.55)',
  },
  light: {
    bg: '#FAFAFA',
    bgCard: '#FFFFFF',
    bgField: '#FFFFFF',
    bgWell: 'rgba(9,9,11,0.04)',
    bgElev: '#FFFFFF',
    bgElev2: '#FFFFFF',
    bgHover: 'rgba(9,9,11,0.06)',
    bgSunk: 'rgba(9,9,11,0.04)',
    hairline: 'rgba(9,9,11,0.08)',
    borderControl: 'rgba(9,9,11,0.08)',
    hairlineGhost: 'rgba(9,9,11,0.10)',
    hairlineStrong: 'rgba(9,9,11,0.16)',
    fg1: '#1A1A1D',
    fg2: '#424247',
    fg3: '#68686D',
    fg4: '#89898D',
    scrim: 'rgba(0,0,0,0.55)',
  },
}

export interface StatusConstants {
  readonly overdue: string
  readonly bad: string
  readonly overdueText: string
  readonly badText: string
  readonly fgOnBad: string
  readonly fgOnOverdue: string
}

export const statusConstants: Record<SchemeMode, StatusConstants> = {
  dark: {
    overdue: '#FE9A00',
    bad: '#FB2C36',
    overdueText: '#FE9A00',
    badText: '#FB2C36',
    fgOnBad: '#020618',
    fgOnOverdue: '#020618',
  },
  light: {
    overdue: '#946A00',
    bad: '#E7000B',
    overdueText: '#946A00',
    badText: '#E7000B',
    fgOnBad: '#FFFFFF',
    fgOnOverdue: '#FFFFFF',
  },
}

export const selectionAlpha: Record<SchemeMode, number> = {
  dark: 0.32,
  light: 0.18,
}

export const primaryTintAlphas = {
  bg: 0.08,
  bgHover: 0.1,
  selected: 0.12,
  iconWell: 0.15,
  soft: 0.18,
  ring: 0.28,
} as const
