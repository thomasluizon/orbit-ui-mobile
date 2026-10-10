import { StyleSheet } from 'react-native'

export type ProfileStyles = ReturnType<typeof createProfileStyles>

export function createProfileStyles() {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
    },
    container: {
      flex: 1,
    },
    scrollContent: {
      paddingTop: 16,
    },
    errorBlock: {
      paddingBottom: 12,
    },
    errorText: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 21.7,
      textAlign: 'center',
    },
  })
}
