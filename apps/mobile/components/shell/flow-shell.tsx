import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAppTheme } from '@/lib/use-app-theme'

interface FlowShellProps {
  nav: false
  children: ReactNode
  action?: ReactNode
  header?: ReactNode
}

export function FlowShell({ children, action, header }: Readonly<FlowShellProps>) {
  const { surfaces } = useAppTheme()

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: surfaces.screen.backgroundColor }]}
      edges={['top', 'bottom']}
      testID="flow-shell"
    >
      {header}
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
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
    paddingHorizontal: 16,
    paddingVertical: 32,
    width: '100%',
  },
  action: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
})
