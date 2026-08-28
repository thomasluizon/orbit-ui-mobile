import type { CapacityNoticeProps } from '@orbit/shared/contracts/feedback'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** A neutral boundary and the one action that changes it. */
export function CapacityNotice({ message, body, action }: Readonly<CapacityNoticeProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={[styles.container, { backgroundColor: tokens.bgWell }]} testID="capacity-notice">
      <Text style={[styles.message, { color: tokens.fg1 }]}>{message}</Text>
      {body ? <Text style={[styles.body, { color: tokens.fg3 }]}>{body}</Text> : null}
      {action ? <View testID="capacity-notice-action">{action}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    gap: 12,
    padding: 16,
  },
  message: {
    fontFamily: 'Geist_500Medium',
    fontSize: 16,
  },
  body: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
})
