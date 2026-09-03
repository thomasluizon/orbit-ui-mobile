import { useMemo, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Shell412Props } from '@orbit/shared/contracts/shell'
import { zLayers } from '@orbit/shared/theme'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ShellComposerSlotProvider, useShellComposerHost } from './shell-composer-slot'

function ShellBottomChrome({
  navigationEnabled,
  pinnedSlot,
  notice,
  tabBar,
  fab,
  backgroundColor,
  borderTopColor,
  safeAreaBottom,
}: Readonly<{
  navigationEnabled: boolean
  pinnedSlot: ReactNode
  notice: ReactNode
  tabBar: ReactNode
  fab: ReactNode
  backgroundColor: string
  borderTopColor: string
  safeAreaBottom: number
}>) {
  const visible = navigationEnabled
    || notice !== undefined
    || pinnedSlot !== undefined
    || fab !== undefined
  if (!visible) return null

  return (
    <View
      testID="shell-bottom"
      style={[
        styles.bottomChrome,
        { backgroundColor, borderTopColor, paddingBottom: safeAreaBottom },
      ]}
    >
      {notice !== undefined ? <View testID="shell-notice">{notice}</View> : null}
      {fab !== undefined ? <View testID="shell-fab-band" style={styles.fabBand} /> : null}
      {pinnedSlot !== undefined || fab !== undefined ? (
        <View testID="shell-composer-band" style={styles.composerBand}>
          {pinnedSlot !== undefined ? (
            <View testID="shell-pinned-slot">{pinnedSlot}</View>
          ) : null}
          {fab !== undefined ? (
            <View testID="shell-fab" style={styles.fab}>{fab}</View>
          ) : null}
        </View>
      ) : null}
      {navigationEnabled ? <View testID="shell-tab-bar">{tabBar}</View> : null}
    </View>
  )
}

export function Shell412(props: Readonly<Shell412Props>) {
  const registeredComposer = useShellComposerHost()
  const navigationEnabled = props.nav !== false
  const pinnedSlot = navigationEnabled ? (registeredComposer.content ?? props.composer) : props.action
  const conversationOpen = props.conversation !== undefined && props.conversationOpen !== false
  const insets = useSafeAreaInsets()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )

  return (
    <ShellComposerSlotProvider value={registeredComposer.value}>
    <View
      testID="shell-412"
      style={[styles.root, { backgroundColor: tokens.bg }]}
    >
      <View
        testID="shell-background"
        style={styles.background}
        importantForAccessibility={conversationOpen ? 'no-hide-descendants' : 'auto'}
      >
        {props.header !== undefined ? (
          <View testID="shell-header">{props.header}</View>
        ) : null}

        <View testID="shell-scroller" style={styles.scroller}>
          {props.children}
        </View>

        <ShellBottomChrome
          navigationEnabled={navigationEnabled}
          pinnedSlot={pinnedSlot}
          notice={props.notice}
          tabBar={props.tabBar}
          fab={props.fab}
          backgroundColor={tokens.bg}
          borderTopColor={tokens.hairline}
          safeAreaBottom={insets.bottom}
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
    </ShellComposerSlotProvider>
  )
}

const styles = StyleSheet.create({
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
    borderTopWidth: 1,
    position: 'relative',
    zIndex: zLayers.sticky,
  },
  composerBand: {
    position: 'relative',
  },
  fabBand: {
    height: 76,
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
