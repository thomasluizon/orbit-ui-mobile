import { StyleSheet } from 'react-native'
import { PADDING, SPACING } from '@orbit/shared/theme'

/** The styles the Progresso screens share. */
export const progressStyles = StyleSheet.create({
  screenReaderTitle: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: 'transparent' },
  root: { flex: 1 },
  content: { gap: PADDING.sectionStackGap },
  sections: { gap: PADDING.sectionStackGap, paddingHorizontal: PADDING.screenGutter, paddingVertical: SPACING.s16 },
  fill: { flexGrow: 1 },
  body: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  windowLock: { width: '100%' },
  actionStart: { alignSelf: 'flex-start' },
  sectionTitle: { fontFamily: 'Geist_500Medium', fontSize: 20, lineHeight: 24 },
  windowSection: { gap: PADDING.sectionTitleGap },
})
