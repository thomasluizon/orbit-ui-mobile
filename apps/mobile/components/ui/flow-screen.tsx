import { useEffect, useRef, type ReactNode } from 'react'
import { Keyboard, Modal, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlowWindowProvider, type FlowWindowResultClose } from '@/components/ui/flow-window'
import { OrbitOverlayLayer } from '@/components/ui/orbit-overlay-layer'
import { KeyboardAwareView } from '@/components/ui/keyboard-aware-scroll-view'
import { createTokensV2 } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

interface FlowScreenProps {
  label: string
  onDismiss: () => void
  presentation?: 'overlay' | 'route'
  open?: boolean
  onDismissed?: () => void
  result?: ReactNode
  children: ReactNode
}

/** The one host of a one-question flow on Android. Every flow mounts inside it, and so does its result dialog. */
export function FlowScreen({ label, onDismiss, presentation = 'overlay', open = true, onDismissed, result, children }: Readonly<FlowScreenProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const reducedMotion = usePrefersReducedMotion()
  const insets = useSafeAreaInsets()
  const showsResult = Boolean(result)
  const resultClose: FlowWindowResultClose = useRef(null)
  useEffect(() => {
    if (showsResult) Keyboard.dismiss()
  }, [showsResult])
  const screen = (
    <View
      testID="flow-screen"
      accessibilityViewIsModal={presentation === 'overlay' && !result}
      accessibilityLabel={label}
      style={[styles.root, { backgroundColor: tokens.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      {children}
    </View>
  )
  if (presentation === 'route') return <><KeyboardAwareView style={styles.root}>{screen}</KeyboardAwareView>{result}</>
  return (
    <Modal visible={open} onDismiss={onDismissed} animationType={reducedMotion ? 'none' : 'fade'} statusBarTranslucent onRequestClose={() => (resultClose.current ?? onDismiss)()}>
      <OrbitOverlayLayer>
        <FlowWindowProvider value={resultClose}>
          {screen}
          {result}
        </FlowWindowProvider>
      </OrbitOverlayLayer>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
