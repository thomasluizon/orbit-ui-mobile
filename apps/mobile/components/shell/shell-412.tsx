import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Keyboard, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Shell412Props } from '@orbit/shared/contracts/shell'
import { ShellNoticeSlotProvider, useShellNoticeHost } from '@/hooks/use-shell-notice-slot'
import { PADDING, SPACING, TOUCH_TARGET_MIN, BUTTON_SIZES, zLayers, SHELL_CONTENT_MAX_WIDTH, TAB_BAR_MIN_HEIGHT } from '@orbit/shared/theme'
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
  conversationOpen,
  navigationEnabled,
  pinnedSlot,
  notice,
  fab,
  tabBar,
  backgroundColor,
  safeAreaBottom,
  onTabBarHeight,
}: Readonly<{
  visible: boolean
  conversationOpen: boolean
  navigationEnabled: boolean
  pinnedSlot: ReactNode
  notice: ReactNode
  fab: ReactNode
  tabBar: ReactNode
  backgroundColor: string
  safeAreaBottom: number
  onTabBarHeight: (height: number) => void
}>) {
  const viewportRef = useRef<ScrollView>(null)
  const viewportSize = useRef({ height: 0, contentHeight: 0 })
  function revealBottomControls() {
    const { height, contentHeight } = viewportSize.current
    viewportRef.current?.scrollTo({ y: Math.max(0, contentHeight - height - PADDING.screenGutter), animated: false })
  }
  if (!visible) return null
  const actionMinimum = !navigationEnabled && pinnedSlot !== undefined ? BUTTON_SIZES.md.height : 0
  const minimumHeight = fab !== undefined ? SPACING.s64 : actionMinimum

  return (
    <View
      testID="shell-bottom"
      style={[
        styles.bottomChrome,
        { backgroundColor, paddingBottom: safeAreaBottom },
      ]}
    >
      <View style={[styles.bottomColumn, { minHeight: minimumHeight }]}>
        <ScrollView
          ref={viewportRef}
          testID="shell-bottom-viewport"
          style={[styles.bottomViewport, { minHeight: minimumHeight }]}
          contentContainerStyle={fab !== undefined ? styles.fabClearance : undefined}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          onLayout={event => { viewportSize.current.height = event.nativeEvent.layout.height; revealBottomControls() }}
          onContentSizeChange={(_width, height) => { viewportSize.current.contentHeight = height; revealBottomControls() }}
        >
          <View style={styles.bottomContent}>
            {notice !== undefined ? <View testID="shell-notice" style={styles.notice}>{notice}</View> : null}
            {pinnedSlot !== undefined ? (
              <View testID="shell-composer-band" style={[styles.composerBand, { minHeight: actionMinimum, display: conversationOpen ? 'none' : 'flex' }]}>
                <View testID="shell-pinned-slot" style={{ minHeight: actionMinimum }}>{pinnedSlot}</View>
              </View>
            ) : null}
            {fab !== undefined ? (
              <View testID="shell-fab-band" pointerEvents="box-none" style={styles.fabBand}>
                <View testID="shell-fab" style={styles.fab}>{fab}</View>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
      {navigationEnabled ? <View testID="shell-tab-bar" onLayout={event => onTabBarHeight(event.nativeEvent.layout.height)}>{tabBar}</View> : null}
    </View>
  )
}

function FlowViewport({ enabled, constrained, minimumHeight, children }: Readonly<{
  enabled: boolean
  constrained: boolean
  minimumHeight: number
  children: ReactNode
}>) {
  return (
    <ScrollView
      testID="shell-flow-viewport"
      scrollEnabled={enabled && constrained}
      nestedScrollEnabled={enabled && constrained}
      keyboardShouldPersistTaps="handled"
      style={styles.flowViewport}
      contentContainerStyle={enabled && constrained
        ? { flexGrow: 1, minHeight: minimumHeight + TOUCH_TARGET_MIN }
        : styles.flowViewportContent}
    >
      {children}
    </ScrollView>
  )
}

function ShellScrollToTopSlot({ visible, content }: Readonly<{ visible: boolean; content: React.ReactNode }>) {
  if (!visible || content === undefined) return null
  return <View testID="shell-scroll-to-top" pointerEvents="box-none" style={styles.scrollToTop}>{content}</View>
}

function useShellViewport({ navigationEnabled, hasFab, hasHeader, hasTabBar, safeTop, safeBottom }: Readonly<{
  navigationEnabled: boolean
  hasFab: boolean
  hasHeader: boolean
  hasTabBar: boolean
  safeTop: number
  safeBottom: number
}>) {
  const [height, setHeight] = useState<number | null>(null)
  const [headerHeight, setHeaderHeight] = useState<number>(hasHeader ? TOUCH_TARGET_MIN : 0)
  const [tabBarHeight, setTabBarHeight] = useState<number>(hasTabBar ? TAB_BAR_MIN_HEIGHT : 0)
  const minimumFlowHeight = safeTop + TOUCH_TARGET_MIN + BUTTON_SIZES.md.height + safeBottom
  const minimumDestinationHeight = headerHeight + SPACING.s96 + SPACING.s64 + tabBarHeight
  const constrainedFlow = !navigationEnabled && height !== null && height < minimumFlowHeight
  const constrainedDestination = navigationEnabled && hasFab && height !== null
    && height - safeTop - safeBottom < minimumDestinationHeight
  return {
    setHeight, setHeaderHeight, setTabBarHeight,
    scrollable: !navigationEnabled || constrainedDestination,
    constrained: constrainedFlow || constrainedDestination,
    minimumHeight: navigationEnabled ? minimumDestinationHeight - TOUCH_TARGET_MIN : minimumFlowHeight,
    outerInsets: constrainedDestination ? { paddingTop: safeTop, paddingBottom: safeBottom } : undefined,
    innerInsets: constrainedDestination ? { top: 0, bottom: 0 } : { top: safeTop, bottom: safeBottom },
    relaxedScroller: !navigationEnabled && !constrainedFlow,
  }
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
  const safeTop = (props.safeAreaTop ?? navigationEnabled) ? insets.top : 0
  const columnWidth = Math.min(width, SHELL_CONTENT_MAX_WIDTH)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const safeBottom = keyboardVisible ? 0 : insets.bottom
  const viewport = useShellViewport({ navigationEnabled, hasFab: props.fab !== undefined, hasHeader: header !== undefined,
    hasTabBar: props.tabBar !== undefined, safeTop, safeBottom })
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
      onLayout={(event) => viewport.setHeight(event.nativeEvent.layout.height)}
      style={[styles.root, { backgroundColor: tokens.bg }, viewport.outerInsets]}
    >
      <FlowViewport enabled={viewport.scrollable} constrained={viewport.constrained} minimumHeight={viewport.minimumHeight}>
        <View
          testID="shell-background"
          style={[styles.background, { width: columnWidth, paddingTop: viewport.innerInsets.top }]}
          importantForAccessibility={conversationOpen ? 'no-hide-descendants' : 'auto'}
        >
          {header !== undefined ? (
            navigationEnabled ? <View testID="shell-header" onLayout={event => viewport.setHeaderHeight(event.nativeEvent.layout.height)}>{header}</View> : (
              <ScrollView testID="shell-header" style={[styles.pinnedSlot, styles.flowHeader]} keyboardShouldPersistTaps="handled">{header}</ScrollView>
            )
          ) : null}

          <View testID="shell-scroller" style={[styles.scroller, viewport.relaxedScroller && styles.flowScroller]}>
            {props.children}
            <ShellScrollToTopSlot visible={!conversationOpen} content={registeredScrollToTop.content ?? props.scrollToTop} />
          </View>

          <ShellBottomChrome
            visible={hasBottomChrome}
            conversationOpen={conversationOpen}
            navigationEnabled={navigationEnabled}
            pinnedSlot={pinnedSlot}
            notice={notice}
            fab={props.fab}
            tabBar={props.tabBar}
            backgroundColor={tokens.bg}
            safeAreaBottom={viewport.innerInsets.bottom}
            onTabBarHeight={viewport.setTabBarHeight}
          />

          {props.sheets}
        </View>
      </FlowViewport>

      {conversationOpen ? (
        <View
          accessibilityRole="none"
          accessibilityLabel={props.conversationLabel}
          accessibilityViewIsModal
          testID="shell-conversation"
          style={[styles.conversation, { backgroundColor: tokens.bg, width: columnWidth, paddingTop: insets.top }]}
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
  flowViewport: { flex: 1 },
  flowViewportContent: { flex: 1 },
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
    minHeight: SPACING.s96,
  },
  scrollToTop: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center', zIndex: zLayers.sticky },
  flowScroller: { minHeight: 0 },
  flowHeader: { minHeight: TOUCH_TARGET_MIN },
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
    paddingHorizontal: PADDING.screenGutter,
  },
  bottomColumn: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    alignSelf: 'center',
    maxWidth: SHELL_CONTENT_MAX_WIDTH,
    width: '100%',
  },
  bottomContent: { position: 'relative' },
  bottomViewport: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
  fabClearance: { paddingTop: SHELL_SCROLLER_CLEARANCE },
  fabBand: { position: 'absolute', top: 0, height: 0, left: 0, right: 0 },
  fab: { bottom: 16, position: 'absolute', right: 16 },
  conversation: {
    alignSelf: 'center',
    maxWidth: SHELL_CONTENT_MAX_WIDTH,
    bottom: 0,
    position: 'absolute',
    top: 0,
    zIndex: zLayers.modal,
  },
})
