import { SPACING, SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'
import { StyleSheet } from 'react-native'

export const errorSurfaceStyles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: SPACING.s16, paddingTop: SPACING.s64, paddingBottom: SPACING.s32, gap: 16, alignItems: 'flex-start' },
  flow: { alignSelf: 'center', width: '100%', maxWidth: SHELL_CONTENT_MAX_WIDTH, justifyContent: 'center', paddingTop: SPACING.s32 },
  title: { alignSelf: 'stretch', fontFamily: 'SpaceGrotesk_500Medium', fontSize: 22, lineHeight: 26.4, letterSpacing: -0.44 },
  titleWide: { fontSize: 28, lineHeight: 32.2, letterSpacing: -0.56 },
  body: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24.8 },
  reference: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 18 },
  countdown: { fontFamily: 'GeistMono_400Regular', fontSize: 20, lineHeight: 28, fontVariant: ['tabular-nums'] },
})
