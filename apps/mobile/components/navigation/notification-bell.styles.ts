import { StyleSheet } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

export function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    bellDisplay: {
      width: 48, minHeight: 48,
      alignItems: 'center', justifyContent: 'center',
    },
    bellButton: {
      backgroundColor: tokens.bgField, width: 48, minHeight: 48, borderRadius: 999, overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center',
    },
    countMarker: { position: 'absolute', top: 0, right: 0 },
    bellCount: {
      minWidth: 20, minHeight: 20, paddingHorizontal: 4, borderRadius: 8,
      backgroundColor: tokens.fg1, color: tokens.bg,
      fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 20,
      textAlign: 'center', boxShadow: `0 0 0 3px ${tokens.bg}`,
    },
  })
}
