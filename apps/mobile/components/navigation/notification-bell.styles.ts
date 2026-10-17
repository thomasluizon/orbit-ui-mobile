import { SPACING } from '@orbit/shared/theme'
import { StyleSheet } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

export function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    bellDisplay: {
      minWidth: 48, minHeight: 48, paddingHorizontal: SPACING.s8, paddingVertical: SPACING.s4,
      flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center',
    },
    bellButton: {
      backgroundColor: 'transparent', minWidth: 48, minHeight: 48, borderRadius: 999, overflow: 'hidden',
      paddingHorizontal: SPACING.s8, paddingVertical: SPACING.s4, flexDirection: 'row', gap: 4,
      alignItems: 'center', justifyContent: 'center',
    },
    countMarker: { flexShrink: 0 },
    bellCount: {
      minWidth: 20, minHeight: 20, paddingHorizontal: SPACING.s4, borderRadius: 8,
      backgroundColor: tokens.fg1, color: tokens.bg,
      fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 20,
      textAlign: 'center', fontVariant: ['tabular-nums'],
    },
  })
}
