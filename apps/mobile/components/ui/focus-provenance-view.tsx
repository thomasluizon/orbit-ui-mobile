import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from 'react'
import { View, type ViewProps } from 'react-native'

interface FocusCaptureEvent {
  nativeEvent: { target: number }
}

type FocusCaptureViewProps = ViewProps & {
  onFocusCapture?: (event: FocusCaptureEvent) => void
}

const PreviousFocusTargetContext = createContext<(() => number | null) | null>(null)

export function FocusProvenanceView({
  children,
  ...props
}: Readonly<ViewProps & { children: ReactNode }>) {
  const currentTargetRef = useRef<number | null>(null)
  const previousTargetRef = useRef<number | null>(null)
  const getPreviousTarget = useCallback(() => previousTargetRef.current, [])
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
      <View {...focusCaptureProps}>
        {children}
      </View>
    </PreviousFocusTargetContext.Provider>
  )
}

export function usePreviousFocusTarget() {
  return useContext(PreviousFocusTargetContext)
}
