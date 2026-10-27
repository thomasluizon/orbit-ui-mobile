import { ShellSideInsetsContext } from '@/components/shell/shell-side-insets'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { AccessibilityInfo, StyleSheet, findNodeHandle, View } from 'react-native'
import * as Dialog from '@rn-primitives/dialog'
import { useUIStore } from '@/stores/ui-store'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { useOverlayFocus } from './focus-provenance-view'
import { useNativeWindow } from './native-window-host'

interface NativeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
}

export function NativeDialog({ open, onOpenChange, title, children }: Readonly<NativeDialogProps>) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <WindowPortal title={title}>{children}</WindowPortal>
  </Dialog.Root>
}

function WindowPortal({ title, children }: Readonly<Pick<NativeDialogProps, 'title' | 'children'>>) {
  const { open, onOpenChange } = Dialog.useRootContext()
  useOverlayFocus(open)
  const { hostName, topDialogId, register } = useNativeWindow()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const overlayId = `dialog:${useId()}`
  const contentRef = useRef<View>(null)
  const onOpenChangeRef = useRef(onOpenChange)
  useLayoutEffect(() => { onOpenChangeRef.current = onOpenChange }, [onOpenChange])
  const close = useCallback(() => onOpenChangeRef.current(false), [])
  const focus = useCallback(() => {
    const target = findNodeHandle(contentRef.current)
    if (target !== null) AccessibilityInfo.setAccessibilityFocus(target)
  }, [])
  const registerOverlay = useUIStore((state) => state.registerOpenOverlay)
  const unregisterOverlay = useUIStore((state) => state.unregisterOpenOverlay)
  useEffect(() => {
    if (!open) return
    const unregister = register({ id: overlayId, close, focus })
    registerOverlay(overlayId)
    return () => { unregister(); unregisterOverlay(overlayId) }
  }, [open, overlayId, register, close, focus, registerOverlay, unregisterOverlay])
  const topmost = topDialogId === overlayId
  return <Dialog.Portal hostName={hostName}>
    <Dialog.Overlay closeOnPress={false} style={[StyleSheet.absoluteFill, { backgroundColor: tokens.bg }]}
      pointerEvents={topmost ? 'auto' : 'none'} accessibilityElementsHidden={!topmost}
      importantForAccessibility={topmost ? 'auto' : 'no-hide-descendants'}>
      <Dialog.Content ref={contentRef} style={styles.content} accessibilityLabel={title} accessibilityViewIsModal
        onAccessibilityEscape={() => { if (topmost) close() }}>
        <Dialog.Title style={styles.hiddenTitle} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{title}</Dialog.Title>
        <ShellSideInsetsContext.Provider value={false}>{children}</ShellSideInsetsContext.Provider>
      </Dialog.Content>
    </Dialog.Overlay>
  </Dialog.Portal>
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  hiddenTitle: { height: 1, opacity: 0, position: 'absolute', width: 1 },
})
