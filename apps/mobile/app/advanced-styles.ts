import { StyleSheet } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

export type Tokens = ReturnType<typeof createTokensV2>

export const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  widgetSheetContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 16,
  },
  widgetHeading: {
    fontFamily: 'Geist_500Medium',
    fontSize: 15,
  },
  widgetList: { gap: 12 },
  widgetStepRow: {
    flexDirection: 'row',
    gap: 8,
  },
  widgetStepNumber: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  widgetFeatureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  widgetItemText: {
    flex: 1,
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
})
