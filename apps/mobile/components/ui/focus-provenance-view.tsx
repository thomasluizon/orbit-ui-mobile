import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { AccessibilityInfo, View, type ViewProps } from 'react-native'
import { useUIStore } from '@/stores/ui-store'

interface FocusCaptureEvent {
  nativeEvent: { target: number }
}

type FocusCaptureViewProps = ViewProps & {
  onFocusCapture?: (event: FocusCaptureEvent) => void
}

const PreviousFocusTargetContext = createContext<(() => number | null) | null>(null)
const CurrentFocusTargetContext = createContext<(() => number | null) | null>(null)

export function FocusProvenanceView({
  children,
  ...props
}: Readonly<ViewProps & { children: ReactNode }>) {
  const currentTargetRef = useRef<number | null>(null)
  const previousTargetRef = useRef<number | null>(null)
  const getPreviousTarget = useCallback(() => previousTargetRef.current, [])
  const getCurrentTarget = useCallback(() => currentTargetRef.current, [])
  const recordFocusTarget = useCallback((event: FocusCaptureEvent) => {
    previousTargetRef.current = currentTargetRef.current
    currentTargetRef.current = event.nativeEvent.target
  }, [])
  const focusCaptureProps: FocusCaptureViewProps = {
    ...props,
    onFocusCapture: recordFocusTarget,
  }

  return (
    <PreviousFocusTargetContext.Provider value={getPreviousTarget}>
      <CurrentFocusTargetContext.Provider value={getCurrentTarget}>
        <View {...focusCaptureProps}>
          {children}
        </View>
      </CurrentFocusTargetContext.Provider>
    </PreviousFocusTargetContext.Provider>
  )
}

export function usePreviousFocusTarget() {
  return useContext(PreviousFocusTargetContext)
}

export function useOverlayFocus(open: boolean) {
  const getCurrentTarget = useContext(CurrentFocusTargetContext)
  useEffect(() => {
    if (!open) return
    const target = getCurrentTarget?.() ?? null
    const previousOverlay = useUIStore.getState().openOverlayIds.at(-1)
    return () => {
      if (target === null) return
      setTimeout(() => {
        if (useUIStore.getState().openOverlayIds.at(-1) === previousOverlay) AccessibilityInfo.setAccessibilityFocus(target)
      }, 50)
    }
  }, [getCurrentTarget, open])
}
