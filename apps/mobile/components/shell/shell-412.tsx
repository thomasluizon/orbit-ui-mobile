import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Keyboard, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Shell412Props } from '@orbit/shared/contracts/shell'
import { ShellNoticeSlotProvider, useShellNoticeHost } from '@/hooks/use-shell-notice-slot'
import { BUTTON_SIZES, zLayers, SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ShellComposerSlotProvider, useShellComposerHost } from './shell-composer-slot'
import { ShellHeaderSlotProvider, useShellHeaderHost } from './shell-header-slot'
import { KeyboardAwareView } from '@/components/ui/keyboard-aware-scroll-view'
import { ShellScrollToTopSlotProvider, useShellScrollToTopHost } from './shell-scroll-to-top-slot'
import { RootScrollProvider } from './root-scroll-context'
import { SHELL_SCROLLER_CLEARANCE, ShellScrollerClearanceContext } from './shell-scroller-clearance'

function ShellBottomChrome({
  visible,
  navigationEnabled,
  pinnedSlot,
  notice,
  fab,
  tabBar,
  backgroundColor,
  safeAreaBottom,
}: Readonly<{
  visible: boolean
  navigationEnabled: boolean
  pinnedSlot: ReactNode
  notice: ReactNode
  fab: ReactNode
  tabBar: ReactNode
  backgroundColor: string
  safeAreaBottom: number
}>) {
  if (!visible) return null
  const actionMinimum = !navigationEnabled && pinnedSlot !== undefined ? BUTTON_SIZES.md.height : 0

  return (
    <View
      testID="shell-bottom"
      style={[
        styles.bottomChrome,
        { backgroundColor, paddingBottom: safeAreaBottom },
      ]}
    >
      <View style={[styles.bottomColumn, { minHeight: actionMinimum }]}>
        {notice !== undefined ? <View testID="shell-notice" style={styles.notice}>{notice}</View> : null}
        {pinnedSlot !== undefined ? (
          <View testID="shell-composer-band" style={[styles.composerBand, { minHeight: actionMinimum }]}>
            <ScrollView testID="shell-pinned-slot" style={[styles.pinnedSlot, { minHeight: actionMinimum }]} keyboardShouldPersistTaps="handled">{pinnedSlot}</ScrollView>
          </View>
        ) : null}
        {fab !== undefined ? (
          <View testID="shell-fab-band" pointerEvents="box-none" style={styles.fabBand}>
            <View testID="shell-fab" style={styles.fab}>{fab}</View>
          </View>
        ) : null}
      </View>
      {navigationEnabled ? <View testID="shell-tab-bar">{tabBar}</View> : null}
    </View>
  )
}

function ShellScrollToTopSlot({ visible, content }: Readonly<{ visible: boolean; content: React.ReactNode }>) {
  if (!visible || content === undefined) return null
  return <View testID="shell-scroll-to-top" pointerEvents="box-none" style={styles.scrollToTop}>{content}</View>
}

export function Shell412(props: Readonly<Shell412Props & { safeAreaTop?: boolean }>) {
  const registeredScrollToTop = useShellScrollToTopHost()
  const registeredHeader = useShellHeaderHost()
  const header = registeredHeader.content ?? props.header
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
  const scrollerClearance = pinnedSlot !== undefined || props.fab !== undefined
    ? SHELL_SCROLLER_CLEARANCE
    : 32
  const conversationOpen = props.conversation !== undefined && props.conversationOpen !== false
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const columnWidth = Math.min(width, SHELL_CONTENT_MAX_WIDTH)
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
        style={[styles.background, { width: columnWidth, paddingTop: (props.safeAreaTop ?? navigationEnabled) ? insets.top : 0 }]}
        importantForAccessibility={conversationOpen ? 'no-hide-descendants' : 'auto'}
      >
        {header !== undefined ? (
          navigationEnabled ? <View testID="shell-header">{header}</View> : (
            <ScrollView testID="shell-header" style={[styles.pinnedSlot, styles.flowHeader]} keyboardShouldPersistTaps="handled">{header}</ScrollView>
          )
        ) : null}

        <View testID="shell-scroller" style={[styles.scroller, !navigationEnabled && styles.flowScroller]}>
          {props.children}
          <ShellScrollToTopSlot visible={!conversationOpen} content={registeredScrollToTop.content ?? props.scrollToTop} />
        </View>

        <ShellBottomChrome
          visible={hasBottomChrome}
          navigationEnabled={navigationEnabled}
          pinnedSlot={conversationOpen ? undefined : pinnedSlot}
          notice={notice}
          fab={props.fab}
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
          style={[styles.conversation, { backgroundColor: tokens.bg, width: columnWidth }]}
        >
          {props.conversation}
        </View>
      ) : null}
    </View>
  )

  return (
    <ShellHeaderSlotProvider value={registeredHeader.value}>
      <ShellNoticeSlotProvider value={registeredNotice.value}>
        <ShellComposerSlotProvider value={registeredComposer.value}>
          <KeyboardAwareView style={styles.keyboardOwner} avoidKeyboard={navigationEnabled}>
            <ShellScrollerClearanceContext.Provider value={hasBottomChrome ? scrollerClearance : 0}>
              <RootScrollProvider>
                <ShellScrollToTopSlotProvider value={registeredScrollToTop.value}>
                  {shell}
                </ShellScrollToTopSlotProvider>
              </RootScrollProvider>
            </ShellScrollerClearanceContext.Provider>
          </KeyboardAwareView>
        </ShellComposerSlotProvider>
      </ShellNoticeSlotProvider>
    </ShellHeaderSlotProvider>
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
    alignSelf: 'center',
    maxWidth: SHELL_CONTENT_MAX_WIDTH,
    flex: 1,
  },
  scroller: {
    flex: 1,
    minHeight: 48,
  },
  scrollToTop: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center', zIndex: zLayers.sticky },
  flowScroller: { minHeight: 0 },
  flowHeader: { minHeight: 44 },
  bottomChrome: {
    flexShrink: 1,
    minHeight: 0,
    position: 'relative',
    zIndex: zLayers.sticky,
  },
  pinnedSlot: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  composerBand: {
    flexShrink: 1,
    minHeight: 0,
    position: 'relative',
  },
  notice: {
    paddingHorizontal: 16,
  },
  bottomColumn: {
    flexShrink: 1,
    minHeight: 0,
    alignSelf: 'center',
    maxWidth: SHELL_CONTENT_MAX_WIDTH,
    width: '100%',
  },
  fabBand: {
    position: 'absolute',
    top: 0,
    height: 0,
    left: 0,
    right: 0,
  },
  fab: {
    bottom: 16,
    position: 'absolute',
    right: 16,
  },
  conversation: {
    alignSelf: 'center',
    maxWidth: SHELL_CONTENT_MAX_WIDTH,
    bottom: 0,
    position: 'absolute',
    top: 0,
    zIndex: zLayers.modal,
  },
})
