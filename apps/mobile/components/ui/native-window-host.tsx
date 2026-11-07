import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { usePrefersReducedMotion } from '@/lib/motion'
import { Modal, Platform, View } from 'react-native'
import { PortalHost } from '@rn-primitives/portal'

interface WindowDialog {
  id: string
  close: () => void
  focus: () => void
}

interface NativeWindowContextValue {
  hostName: string
  topDialogId: string | undefined
  register: (dialog: WindowDialog) => () => void
}

const NativeWindowContext = createContext<NativeWindowContextValue | null>(null)

/** UIKit reports no completion for a transition it refuses, such as a presentation over a presented sheet. */
export const MODAL_TRANSITION_FALLBACK_MS = 1000

export function useNativeWindow() {
  const context = useContext(NativeWindowContext)
  if (!context) throw new Error('Native dialogs require NativeWindowHost')
  return context
}

/**
 * iOS changes `visible` only after the previous transition reports `onShow` or `onDismiss`. UIKit drops a
 * dismissal inside the fade presentation, and `Modal` unmounts its host on a late `onDismiss`, which leaves an
 * empty presented controller that takes every touch. Android reports no `onDismiss` and follows the dialogs.
 */
function useSettledModalVisibility(open: boolean) {
  const holdsTransitions = Platform.OS === 'ios'
  const [visible, setVisible] = useState(open)
  const [transitionRunning, setTransitionRunning] = useState(holdsTransitions && open)
  if (visible !== open && !(holdsTransitions && transitionRunning)) {
    setVisible(open)
    setTransitionRunning(holdsTransitions)
  }
  useEffect(() => {
    if (!transitionRunning) return
    const fallback = setTimeout(() => setTransitionRunning(false), MODAL_TRANSITION_FALLBACK_MS)
    return () => clearTimeout(fallback)
  }, [transitionRunning])
  const settle = useCallback(() => setTransitionRunning(false), [])
  return { visible, settle }
}

export function NativeWindowHost({ children }: Readonly<{ children: ReactNode }>) {
  const reducedMotion = usePrefersReducedMotion()
  const hostName = `native-window:${useId()}`
  const [dialogs, setDialogs] = useState<WindowDialog[]>([])
  const register = useCallback((dialog: WindowDialog) => {
    setDialogs((current) => [...current, dialog])
    return () => setDialogs((current) => current.filter(({ id }) => id !== dialog.id))
  }, [])
  const topDialog = dialogs.at(-1)
  const open = topDialog !== undefined
  const { visible, settle } = useSettledModalVisibility(open)
  const context = useMemo(() => ({ hostName, topDialogId: topDialog?.id, register }), [hostName, topDialog?.id, register])
  return <NativeWindowContext.Provider value={context}>
    <View style={{ flex: 1 }} pointerEvents={open ? 'none' : 'auto'} importantForAccessibility={open ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={open}>
      {children}
    </View>
    <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={() => topDialog?.close()} onShow={() => { settle(); topDialog?.focus() }} onDismiss={settle}>
      <View style={{ flex: 1 }}>
        <PortalHost name={hostName} />
      </View>
    </Modal>
  </NativeWindowContext.Provider>
}
