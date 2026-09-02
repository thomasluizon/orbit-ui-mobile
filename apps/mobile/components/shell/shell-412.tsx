import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Shell412Props } from '@orbit/shared/contracts/shell'
import { zLayers } from '@orbit/shared/theme'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import {
  ShellComposerSlotProvider,
  ShellNoticeSlotProvider,
  useShellSlotHost,
} from './shell-composer-slot'

export function Shell412(props: Readonly<Shell412Props>) {
  const registeredComposer = useShellSlotHost()
  const registeredNotice = useShellSlotHost()
  const navigationEnabled = props.nav !== false
  const pinnedSlot = navigationEnabled ? (props.composer ?? registeredComposer.content) : props.action
  const conversationOpen = props.conversation !== undefined && props.conversationOpen !== false
  const notice = registeredNotice.content ?? props.notice
  const hasBottomChrome = navigationEnabled || notice !== undefined || pinnedSlot !== undefined
  const insets = useSafeAreaInsets()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )

  return (
    <ShellComposerSlotProvider value={registeredComposer.value}>
    <ShellNoticeSlotProvider value={registeredNotice.value}>
    <View
      testID="shell-412"
      className="flex-1 overflow-hidden"
      style={{ backgroundColor: tokens.bg }}
    >
      <View
        testID="shell-background"
        className="flex-1"
        importantForAccessibility={conversationOpen ? 'no-hide-descendants' : 'auto'}
      >
        {props.header !== undefined ? (
          <View testID="shell-header">{props.header}</View>
        ) : null}

        <View testID="shell-scroller" className="flex-1">
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
            {notice !== undefined ? (
              <View testID="shell-notice">{notice}</View>
            ) : null}
            <View style={styles.destinationBottom}>
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
          </View>
        ) : null}

        {props.sheets}
      </View>

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
    </View>
    </ShellNoticeSlotProvider>
    </ShellComposerSlotProvider>
  )
}

const styles = StyleSheet.create({
  bottomChrome: {
    borderTopWidth: 1,
    position: 'relative',
    zIndex: zLayers.sticky,
  },
  destinationBottom: {
    position: 'relative',
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
