import { SPACING } from '@orbit/shared/theme'
import { StyleSheet } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

export type Tokens = ReturnType<typeof createTokensV2>

export const styles = StyleSheet.create({
  sheetContent: {
    paddingHorizontal: SPACING.s24,
    paddingBottom: SPACING.s24,
  },
  sheetDescription: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 19.6,
    marginBottom: SPACING.s12,
  },
  timeZoneOptions: {
    gap: 8,
  },
  timeZoneSearch: {
    borderRadius: 12,
    marginBottom: SPACING.s4,
  },
  timeZoneSearchLabel: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
  },
  timeZoneEmpty: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    paddingHorizontal: SPACING.s4,
    paddingVertical: SPACING.s16,
  },
  timeZoneMore: {
    alignItems: 'flex-start',
  },
})
