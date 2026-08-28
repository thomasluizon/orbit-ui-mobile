import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Shell412Props } from '@orbit/shared/contracts/shell'
import { zLayers } from '@orbit/shared/theme'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function Shell412(props: Readonly<Shell412Props>) {
  const navigationEnabled = props.nav !== false
  const pinnedSlot = navigationEnabled ? props.composer : props.action
  const conversationOpen = props.conversation !== undefined && props.conversationOpen !== false
  const hasBottomChrome = navigationEnabled || props.notice !== undefined || pinnedSlot !== undefined
  const insets = useSafeAreaInsets()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )

  return (
    <View
      testID="shell-412"
      className="flex-1 overflow-hidden"
      style={{ backgroundColor: tokens.bg }}
    >
      {props.header !== undefined ? (
        <View testID="shell-header">{props.header}</View>
      ) : null}

      <View
        testID="shell-scroller"
        className="flex-1"
        importantForAccessibility={conversationOpen ? 'no-hide-descendants' : 'auto'}
      >
        {props.children}
      </View>

      {hasBottomChrome ? (
        <View
          testID="shell-bottom"
          style={[
            styles.bottomChrome,
            {
              backgroundColor: tokens.bg,
              borderTopColor: tokens.hairline,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          {props.notice !== undefined ? (
            <View testID="shell-notice">{props.notice}</View>
          ) : null}
          {pinnedSlot !== undefined ? (
            <View testID="shell-pinned-slot">{pinnedSlot}</View>
          ) : null}
          {navigationEnabled ? (
            <View testID="shell-tab-bar">{props.tabBar}</View>
          ) : null}
          {props.fab !== undefined ? (
            <View testID="shell-fab" style={styles.fab}>
              {props.fab}
            </View>
          ) : null}
        </View>
      ) : null}

      {conversationOpen ? (
        <View
          accessibilityRole="none"
          accessibilityLabel={props.conversationLabel}
          accessibilityViewIsModal
          testID="shell-conversation"
          style={[styles.conversation, { backgroundColor: tokens.bg }]}
        >
          {props.conversation}
        </View>
      ) : null}

      {props.sheets}
    </View>
  )
}

const styles = StyleSheet.create({
  bottomChrome: {
    borderTopWidth: 1,
    position: 'relative',
    zIndex: zLayers.sticky,
  },
  fab: {
    bottom: '100%',
    marginBottom: 16,
    position: 'absolute',
    right: 16,
  },
  conversation: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: zLayers.modal,
  },
})
