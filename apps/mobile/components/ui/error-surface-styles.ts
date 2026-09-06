import { StyleSheet } from 'react-native'

export const errorSurfaceStyles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 64, paddingBottom: 32, gap: 16, alignItems: 'flex-start' },
  title: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 22, lineHeight: 26.4, letterSpacing: -0.44 },
  body: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24.8 },
  reference: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 18 },
  countdown: { fontFamily: 'GeistMono_400Regular', fontSize: 20, lineHeight: 28, fontVariant: ['tabular-nums'] },
})
