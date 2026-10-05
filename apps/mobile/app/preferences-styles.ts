import { StyleSheet } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

export type Tokens = ReturnType<typeof createTokensV2>

export const styles = StyleSheet.create({
  sheetContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  sheetDescription: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 19.6,
    marginBottom: 12,
  },
  timeZoneOptions: {
    gap: 8,
  },
  timeZoneSearch: {
    borderRadius: 12,
    marginBottom: 4,
  },
  timeZoneSearchLabel: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
  },
  timeZoneEmpty: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    paddingHorizontal: 4,
    paddingVertical: 16,
  },
  timeZoneMore: {
    alignItems: 'flex-start',
  },
})
