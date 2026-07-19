import { useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { createTokensV2, shadowsV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export type Tokens = AppTokensV2

export type TranslationFn = (key: string, params?: Record<string, unknown>) => string

export type StreakDayView = {
  dateStr: string
  dayLabel: string
  dayNum: string
  status: 'active' | 'frozen' | 'missed' | 'today'
}

export const STREAK_DAYS_PER_FREEZE = 7

export function useTokens(): AppTokensV2 {
  const { currentScheme, currentTheme } = useAppTheme()
  return useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
}

export function rgbaFromHex(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function isInRun(status: StreakDayView['status']): boolean {
  return status === 'active' || status === 'frozen'
}

export const styles = StyleSheet.create({
  groupWrap: {
    paddingHorizontal: 20,
  },
  sectionBottomPad: {
    paddingBottom: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
  },
  weekCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  weekHeaderRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekHeaderLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Roboto_500Medium',
    fontSize: 11,
    letterSpacing: 0.44,
    fontVariant: ['tabular-nums'],
  },
  weekCellsRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runBand: {
    position: 'absolute',
    top: 8,
    bottom: 8,
  },
  dayDisc: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumeral: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  dayNumeralToday: {
    fontFamily: 'Roboto_700Bold',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  freezeDrop: {
    position: 'absolute',
    top: 1,
    width: 17,
    height: 17,
    borderTopLeftRadius: 8.5,
    borderTopRightRadius: 8.5,
    borderBottomRightRadius: 8.5,
    borderBottomLeftRadius: 0,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowsV2.shadow1,
  },
  freezeDropIcon: {
    transform: [{ rotate: '-45deg' }],
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    paddingTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  legendDotHollow: {
    width: 8,
    height: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  legendLabel: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 11,
    letterSpacing: 0.44,
  },
  cardGroup: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    minHeight: 52,
  },
  cardRowLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
    minWidth: 0,
  },
  cardRowIcon: {
    width: 22,
    alignItems: 'center',
    flexShrink: 0,
  },
  cardRowLabel: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    flexShrink: 1,
  },
  cardRowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  statValue: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  explainer: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  freezeCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 16,
  },
  freezeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  nextFreezeBlock: {
    gap: 10,
  },
  gaugeTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gauge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  proGateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  proGateCopy: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    lineHeight: 22,
  },
  proGatePill: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexShrink: 0,
  },
  proGatePillLabel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
})
