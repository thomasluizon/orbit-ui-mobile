import { createContext, useCallback, useContext, useId, useMemo, useState, type ReactNode } from 'react'
import { Modal, View } from 'react-native'
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

export function useNativeWindow() {
  const context = useContext(NativeWindowContext)
  if (!context) throw new Error('Native dialogs require NativeWindowHost')
  return context
}

export function NativeWindowHost({ children }: Readonly<{ children: ReactNode }>) {
  const hostName = `native-window:${useId()}`
  const [dialogs, setDialogs] = useState<WindowDialog[]>([])
  const register = useCallback((dialog: WindowDialog) => {
    setDialogs((current) => [...current, dialog])
    return () => setDialogs((current) => current.filter(({ id }) => id !== dialog.id))
  }, [])
  const topDialog = dialogs.at(-1)
  const open = topDialog !== undefined
  const context = useMemo(() => ({ hostName, topDialogId: topDialog?.id, register }), [hostName, topDialog?.id, register])
  return <NativeWindowContext.Provider value={context}>
    <View style={{ flex: 1 }} pointerEvents={open ? 'none' : 'auto'} importantForAccessibility={open ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={open}>
      {children}
    </View>
    <Modal visible={open} transparent statusBarTranslucent navigationBarTranslucent animationType="none"
      onRequestClose={() => topDialog?.close()} onShow={() => topDialog?.focus()}>
      <View style={{ flex: 1 }}>
        <PortalHost name={hostName} />
      </View>
    </Modal>
  </NativeWindowContext.Provider>
}
