import { SPACING } from '@orbit/shared/theme'
import type { CapacityNoticeProps } from '@orbit/shared/contracts/feedback'
import { StyleSheet, Text, View } from 'react-native'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** A neutral boundary and the one action that changes it. On an AI surface whose AI is the missing part, Orbit rests beside it at 48. */
export function CapacityNotice({ message, body, action, mascotState }: Readonly<CapacityNoticeProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const content = (
    <>
      <Text style={[styles.message, { color: tokens.fg1 }]}>{message}</Text>
      {body ? <Text style={[styles.body, { color: tokens.fg2 }]}>{body}</Text> : null}
      {action ? <View testID="capacity-notice-action">{action}</View> : null}
    </>
  )

  return (
    <View style={[styles.container, mascotState ? styles.withMascot : null, { backgroundColor: tokens.bgWell }]} testID="capacity-notice">
      {mascotState ? <><OrbitMascot size={48} state={mascotState} /><View style={styles.text}>{content}</View></> : content}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    gap: 12,
    padding: SPACING.s16,
  },
  withMascot: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  text: {
    flex: 1,
    gap: 12,
    minWidth: 0,
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
