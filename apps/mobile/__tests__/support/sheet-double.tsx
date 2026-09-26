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
  requestClose: (exitAction?: () => void, onRejected?: () => void) => void
}

interface SheetDoubleProps extends SheetProps {
  ref?: Ref<SheetHandle>
}

let pendingDismissal: (() => void) | null = null
let pendingRejection: (() => void) | null = null
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
    pendingRejection = null
  },
  completeDismissal() {
    const finish = pendingDismissal
    pendingDismissal = null
    pendingRejection = null
    finish?.()
  },
  /** Stands in for the native dismissal rejecting, for example VIEW_NOT_FOUND while the sheet still mounts. */
  rejectDismissal() {
    const reject = pendingRejection
    pendingDismissal = null
    pendingRejection = null
    reject?.()
  },
  get isDismissPending() {
    return pendingDismissal !== null
  },
}



export function Sheet({ title, actions, onClose, children, ref }: Readonly<SheetDoubleProps>) {
  const [presented, setPresented] = useState(true)
  const requestClose = useCallback(
    (exitAction?: () => void, onRejected?: () => void) => {
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
        pendingRejection = () => {
          setPresented(true)
          onRejected?.()
        }
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
    createElement('SheetBody', { testID: 'sheet-body-slot' }, children),
    createElement('SheetActions', { testID: 'sheet-actions-slot' }, actions),
  )
}

export function useSheetHost() {
  const sheetRef = useRef<SheetHandle>(null)

  const closeSheet = useCallback((exitAction?: () => void, onRejected?: () => void) => {
    const handle = sheetRef.current
    if (handle) handle.requestClose(exitAction, onRejected)
    else exitAction?.()
  }, [])

  return { sheetRef, closeSheet }
}
