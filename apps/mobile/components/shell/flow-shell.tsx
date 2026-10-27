import { SPACING, SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'
import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SHELL_SCROLLER_CLEARANCE, useShellScrollerClearance } from './shell-scroller-clearance'
import { ShellSideInsetsContext, useShellContentStyle } from './shell-side-insets'
import { useAppTheme } from '@/lib/use-app-theme'

interface FlowShellProps {
  nav: false
  mode?: 'detail' | 'centered'
  children: ReactNode
  action?: ReactNode
  header?: ReactNode
  notice?: ReactNode
}

export function FlowShell({ children, action, header, notice, mode = 'centered' }: Readonly<FlowShellProps>) {
  const { surfaces } = useAppTheme()
  const contentStyle = useShellContentStyle(SPACING.s16)
  const headerStyle = useShellContentStyle()
  const shellClearance = useShellScrollerClearance()
  const clearance = action || notice ? Math.max(shellClearance, SHELL_SCROLLER_CLEARANCE) : shellClearance

  return (
    <ShellSideInsetsContext.Provider value={true}>
    <SafeAreaView
      style={[styles.root, { backgroundColor: surfaces.screen.backgroundColor }]}
      edges={['top', 'bottom']}
      testID="flow-shell"
    >
      {header ? <View style={[styles.column, headerStyle]}>{header}</View> : null}
      <ScrollView
        style={[styles.scroller, styles.column]}
        contentContainerStyle={[styles.content, mode === 'centered' && styles.centered, contentStyle, { paddingBottom: clearance }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {notice ? <View style={[styles.notice, contentStyle]}>{notice}</View> : null}
      {action ? <View style={[styles.action, contentStyle]}>{action}</View> : null}
    </SafeAreaView>
    </ShellSideInsetsContext.Provider>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroller: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: 24,
    maxWidth: SHELL_CONTENT_MAX_WIDTH,
    paddingHorizontal: SPACING.s16,
    paddingVertical: SPACING.s32,
    width: '100%',
  },
  column: { alignSelf: 'center', width: '100%', maxWidth: SHELL_CONTENT_MAX_WIDTH },
  centered: { justifyContent: 'center' },
  action: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: SHELL_CONTENT_MAX_WIDTH,
    paddingBottom: SPACING.s16,
    paddingHorizontal: SPACING.s16,
    paddingTop: SPACING.s16,
  },
  notice: { alignSelf: 'center', width: '100%', maxWidth: SHELL_CONTENT_MAX_WIDTH, paddingHorizontal: SPACING.s16 },
})
