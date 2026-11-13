import type { ReactNode } from 'react'
import { Modal, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OrbitOverlayLayer } from '@/components/ui/orbit-overlay-layer'
import { createTokensV2 } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

interface FlowScreenProps {
  /** The accessible name of the screen: the action the flow does, such as "Start over". */
  label: string
  /** Android back. The flow decides what a dismissal does: a step back, the discard sheet, or a close. */
  onDismiss: () => void
  children: ReactNode
}

/** The screen that hosts a one-question flow started from a settings row. It covers the view and fades in, instantly under reduced motion. */
export function FlowScreen({ label, onDismiss, children }: Readonly<FlowScreenProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const reducedMotion = usePrefersReducedMotion()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible animationType={reducedMotion ? 'none' : 'fade'} statusBarTranslucent onRequestClose={onDismiss}>
      <OrbitOverlayLayer>
        <View
          testID="flow-screen"
          accessibilityViewIsModal
          accessibilityLabel={label}
          style={[styles.root, { backgroundColor: tokens.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}
        >
          {children}
        </View>
      </OrbitOverlayLayer>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
