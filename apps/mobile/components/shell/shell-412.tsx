import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Keyboard, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Shell412Props } from '@orbit/shared/contracts/shell'
import { ShellNoticeSlotProvider, useShellNoticeHost } from '@/hooks/use-shell-notice-slot'
import { zLayers } from '@orbit/shared/theme'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ShellComposerSlotProvider, useShellComposerHost } from './shell-composer-slot'
import { KeyboardAwareView } from '@/components/ui/keyboard-aware-scroll-view'
import { SHELL_SCROLLER_CLEARANCE, ShellScrollerClearanceContext } from './shell-scroller-clearance'

function ShellBottomChrome({
  visible,
  navigationEnabled,
  pinnedSlot,
  notice,
  tabBar,
  backgroundColor,
  safeAreaBottom,
}: Readonly<{
  visible: boolean
  navigationEnabled: boolean
  pinnedSlot: ReactNode
  notice: ReactNode
  tabBar: ReactNode
  backgroundColor: string
  safeAreaBottom: number
}>) {
  if (!visible) return null

  return (
    <View
      testID="shell-bottom"
      style={[
        styles.bottomChrome,
        { backgroundColor, paddingBottom: safeAreaBottom },
      ]}
    >
      {notice !== undefined ? <View testID="shell-notice">{notice}</View> : null}
      {pinnedSlot !== undefined ? (
        <View testID="shell-composer-band" style={styles.composerBand}>
          <View testID="shell-pinned-slot">{pinnedSlot}</View>
        </View>
      ) : null}
      {navigationEnabled ? <View testID="shell-tab-bar">{tabBar}</View> : null}
    </View>
  )
}

export function Shell412(props: Readonly<Shell412Props & { safeAreaTop?: boolean }>) {
  const registeredComposer = useShellComposerHost()
  const registeredNotice = useShellNoticeHost()
  const navigationEnabled = props.nav !== false
  const pinnedSlot = navigationEnabled ? (registeredComposer.content ?? props.composer) : props.action
  const notice = registeredNotice.content === undefined
    ? props.notice
    : <>{props.notice}{registeredNotice.content}</>
  const hasBottomChrome = navigationEnabled
    || notice !== undefined
    || pinnedSlot !== undefined
    || props.fab !== undefined
  const conversationOpen = props.conversation !== undefined && props.conversationOpen !== false
  const insets = useSafeAreaInsets()
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )

  const shell = (
    <View
      testID="shell-412"
      style={[styles.root, { backgroundColor: tokens.bg }]}
    >
      <View
        testID="shell-background"
        style={[styles.background, { paddingTop: (props.safeAreaTop ?? navigationEnabled) ? insets.top : 0 }]}
        importantForAccessibility={conversationOpen ? 'no-hide-descendants' : 'auto'}
      >
        {props.header !== undefined ? (
          <View testID="shell-header">{props.header}</View>
        ) : null}

        <View testID="shell-scroller" style={styles.scroller}>
          {props.children}
          {props.fab !== undefined ? (
            <View testID="shell-fab-band" pointerEvents="box-none" style={styles.fabBand}>
              <View testID="shell-fab" style={styles.fab}>{props.fab}</View>
            </View>
          ) : null}
        </View>

        <ShellBottomChrome
          visible={hasBottomChrome}
          navigationEnabled={navigationEnabled}
          pinnedSlot={conversationOpen ? undefined : pinnedSlot}
          notice={notice}
          tabBar={props.tabBar}
          backgroundColor={tokens.bg}
          safeAreaBottom={keyboardVisible ? 0 : insets.bottom}
        />

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
  )

  return (
    <ShellNoticeSlotProvider value={registeredNotice.value}>
      <ShellComposerSlotProvider value={registeredComposer.value}>
        <KeyboardAwareView style={styles.keyboardOwner} avoidKeyboard={navigationEnabled}>
          <ShellScrollerClearanceContext.Provider value={hasBottomChrome ? SHELL_SCROLLER_CLEARANCE : 0}>
            {shell}
          </ShellScrollerClearanceContext.Provider>
        </KeyboardAwareView>
      </ShellComposerSlotProvider>
    </ShellNoticeSlotProvider>
  )
}

const styles = StyleSheet.create({
  keyboardOwner: {
    flex: 1,
  },
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  background: {
    flex: 1,
  },
  scroller: {
    flex: 1,
  },
  bottomChrome: {
    position: 'relative',
    zIndex: zLayers.sticky,
  },
  composerBand: {
    position: 'relative',
  },
  fabBand: {
    position: 'absolute',
    bottom: 0,
    top: 0,
    left: 0,
    right: 0,
  },
  fab: {
    bottom: 16,
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
