import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { StyleSheet } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

export type Tokens = ReturnType<typeof createTokensV2>

export const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  statusBlock: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  statusText: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
  },
  linkChip: {
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginTop: 4,
    minHeight: TOUCH_TARGET_MIN,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkChipPressed: {
    transform: [{ scale: 0.96 }],
  },
  linkText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
  },
  sheetScroll: {
    flexGrow: 0,
  },
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
