import { StyleSheet } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

export function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    bellButton: {
      width: 44, height: 44, borderRadius: 999,
      alignItems: 'center', justifyContent: 'center',
    },
    bellCount: {
      position: 'absolute', top: 0, right: 0,
      minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 999,
      backgroundColor: tokens.fg1, color: tokens.bg,
      fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 20,
      textAlign: 'center', boxShadow: `0 0 0 3px ${tokens.bg}`,
    },
  })
}
