import { StyleSheet } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

export function createDrawerStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 40,
      gap: 0,
    },
    titleBlock: {
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 16,
    },
    drawerTagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    drawerTagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    drawerTagDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    drawerTagName: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
    },
    emojiWell: {
      width: 76,
      height: 76,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${tokens.fg1}0F`,
    },
    emojiWellText: {
      fontSize: 38,
      lineHeight: 46,
    },
    titleMeta: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    description: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 21,
      color: tokens.fg2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    sectionInset: {
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    askAstra: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingLeft: 34,
      paddingRight: 20,
      paddingTop: 16,
      paddingBottom: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.hairline,
      marginTop: 8,
    },
    askAstraRule: {
      position: 'absolute',
      left: 20,
      top: 20,
      bottom: 28,
      width: 2,
      borderRadius: 1,
    },
    askAstraContent: {
      flex: 1,
    },
    askAstraEyebrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    askAstraEyebrowText: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 10.5,
      letterSpacing: 0.63,
    },
    askAstraBody: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 20,
    },
  })
}
