import type { ReactNode } from 'react'
import { Modal, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OrbitOverlayLayer } from '@/components/ui/orbit-overlay-layer'
import { KeyboardAwareView } from '@/components/ui/keyboard-aware-scroll-view'
import { createTokensV2 } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

interface FlowScreenProps {
  label: string
  onDismiss: () => void
  presentation?: 'overlay' | 'route'
  children: ReactNode
}

/** The one host of a one-question flow on Android. Every flow mounts inside it. */
export function FlowScreen({ label, onDismiss, presentation = 'overlay', children }: Readonly<FlowScreenProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const reducedMotion = usePrefersReducedMotion()
  const insets = useSafeAreaInsets()
  const screen = (
    <View
      testID="flow-screen"
      accessibilityViewIsModal={presentation === 'overlay'}
      accessibilityLabel={label}
      style={[styles.root, { backgroundColor: tokens.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      {children}
    </View>
  )
  if (presentation === 'route') return <KeyboardAwareView style={styles.root}>{screen}</KeyboardAwareView>
  return (
    <Modal visible animationType={reducedMotion ? 'none' : 'fade'} statusBarTranslucent onRequestClose={onDismiss}>
      <OrbitOverlayLayer>{screen}</OrbitOverlayLayer>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
