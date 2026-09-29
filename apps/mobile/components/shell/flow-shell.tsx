import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SHELL_SCROLLER_CLEARANCE, useShellScrollerClearance } from './shell-scroller-clearance'
import { useAppTheme } from '@/lib/use-app-theme'

interface FlowShellProps {
  nav: false
  children: ReactNode
  action?: ReactNode
  header?: ReactNode
  notice?: ReactNode
}

export function FlowShell({ children, action, header, notice }: Readonly<FlowShellProps>) {
  const { surfaces } = useAppTheme()
  const shellClearance = useShellScrollerClearance()
  const clearance = action || notice ? Math.max(shellClearance, SHELL_SCROLLER_CLEARANCE) : shellClearance

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: surfaces.screen.backgroundColor }]}
      edges={['top', 'bottom']}
      testID="flow-shell"
    >
      {header}
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={[styles.content, { paddingBottom: clearance }]}
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
    maxWidth: 740,
    paddingHorizontal: 16,
    paddingVertical: 32,
    width: '100%',
  },
  action: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  notice: { paddingHorizontal: 16 },
})
