import {
  createElement,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react'
import type { SheetProps } from '@orbit/shared/contracts/overlay'

interface SheetHandle {
  requestClose: (exitAction?: () => void) => void
}

interface SheetDoubleProps extends SheetProps {
  ref?: Ref<SheetHandle>
}

let pendingDismissal: (() => void) | null = null
let deferDismissal = false

/**
 * The real sheet finishes its dismissal asynchronously and only then runs the
 * close path. The double runs it at once by default, so a test that does not
 * care about that gap stays simple. Turn `defer` on to hold the dismissal and
 * prove that nothing runs before it completes.
 */
export const sheetTestControls = {
  defer(next: boolean) {
    deferDismissal = next
    pendingDismissal = null
  },
  completeDismissal() {
    const finish = pendingDismissal
    pendingDismissal = null
    finish?.()
  },
  get isDismissPending() {
    return pendingDismissal !== null
  },
}


/**
 * The one test double for `Sheet`. It is typed against the shared contract, so
 * a test cannot assert a prop the real sheet does not take, and it reproduces
 * the real close path: `onClose` runs only from a completed dismissal, and a
 * `requestClose` exit action replaces it. Import it through
 * `vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))`.
 */
export function Sheet({ title, actions, onClose, children, ref }: Readonly<SheetDoubleProps>) {
  const [presented, setPresented] = useState(true)
  const requestClose = useCallback(
    (exitAction?: () => void) => {
      const finish = () => {
        if (exitAction) {
          exitAction()
          return
        }
        onClose?.()
      }
      if (deferDismissal) {
        setPresented(false)
        pendingDismissal = finish
        return
      }
      finish()
    },
    [onClose],
  )

  useImperativeHandle(ref, () => ({ requestClose }), [requestClose])

  return createElement(
    'Sheet',
    { title, open: presented },
    title ? createElement('Text', null, title) : null,
    createElement('Pressable', {
      accessibilityLabel: 'attempt-dismiss',
      onPress: () => requestClose(),
    }),
    children,
    actions,
  )
}

export function useSheetHost() {
  const sheetRef = useRef<SheetHandle>(null)

  const closeSheet = useCallback((exitAction?: () => void) => {
    const handle = sheetRef.current
    if (handle) handle.requestClose(exitAction)
    else exitAction?.()
  }, [])

  return { sheetRef, closeSheet }
}
