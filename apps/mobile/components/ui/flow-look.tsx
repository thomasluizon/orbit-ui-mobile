import { createContext, useCallback, useContext, useRef, useState, type ReactNode, type RefObject } from 'react'
import { type View } from 'react-native'
import { orbitLookVector, type OrbitLookTarget } from '@orbit/shared/contracts/brand'

type MeasurableView = RefObject<View | null>

interface FlowLook {
  lookAt: OrbitLookTarget | null
  mascotRef: MeasurableView
  lookAtControl: (control: MeasurableView) => void
  lookAway: () => void
}

const NO_LOOK: Pick<FlowLook, 'lookAtControl' | 'lookAway'> = { lookAtControl: () => {}, lookAway: () => {} }

const FlowLookContext = createContext<Pick<FlowLook, 'lookAtControl' | 'lookAway'>>(NO_LOOK)

/** Orbit looks at the control in focus. A control reports its focus through `useFlowLook`. */
export function useFlowLook() {
  return useContext(FlowLookContext)
}

export function useFlowLookState(): FlowLook {
  const mascotRef = useRef<View>(null)
  const [lookAt, setLookAt] = useState<OrbitLookTarget | null>(null)
  const lookAtControl = useCallback((control: MeasurableView) => {
    const mascot = mascotRef.current
    const target = control.current
    if (!mascot || !target) return
    mascot.measureInWindow((mascotX, mascotY, mascotWidth, mascotHeight) => {
      target.measureInWindow((targetX, targetY, targetWidth, targetHeight) => {
        setLookAt(orbitLookVector({ x: mascotX + mascotWidth / 2, y: mascotY + mascotHeight / 2 }, { x: targetX + targetWidth / 2, y: targetY + targetHeight / 2 }))
      })
    })
  }, [])
  const lookAway = useCallback(() => setLookAt(null), [])
  return { lookAt, mascotRef, lookAtControl, lookAway }
}

export function FlowLookProvider({ look, children }: Readonly<{ look: Pick<FlowLook, 'lookAtControl' | 'lookAway'>; children: ReactNode }>) {
  return <FlowLookContext value={look}>{children}</FlowLookContext>
}
