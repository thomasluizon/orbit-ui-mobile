import { SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'
import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SHELL_SCROLLER_CLEARANCE, useShellScrollerClearance } from './shell-scroller-clearance'
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
  const shellClearance = useShellScrollerClearance()
  const clearance = action || notice ? Math.max(shellClearance, SHELL_SCROLLER_CLEARANCE) : shellClearance

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: surfaces.screen.backgroundColor }]}
      edges={['top', 'bottom']}
      testID="flow-shell"
    >
      {header ? <View style={styles.column}>{header}</View> : null}
      <ScrollView
        style={[styles.scroller, styles.column]}
        contentContainerStyle={[styles.content, mode === 'centered' && styles.centered, { paddingBottom: clearance }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {notice ? <View style={styles.notice}>{notice}</View> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </SafeAreaView>
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
    paddingHorizontal: 16,
    paddingVertical: 32,
    width: '100%',
  },
  column: { alignSelf: 'center', width: '100%', maxWidth: SHELL_CONTENT_MAX_WIDTH },
  centered: { justifyContent: 'center' },
  action: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: SHELL_CONTENT_MAX_WIDTH,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  notice: { alignSelf: 'center', width: '100%', maxWidth: SHELL_CONTENT_MAX_WIDTH, paddingHorizontal: 16 },
})
