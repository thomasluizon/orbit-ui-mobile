import {
  createElement,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react'
import type { SheetProps } from '@orbit/shared/contracts/overlay'
import { ActionRow } from '@/components/ui/action-row'

interface SheetHandle {
  requestClose: (exitAction?: () => void, onRejected?: () => void) => void
  isDismissed: () => boolean
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



export function Sheet({ title, accessibleTitle, actions, onClose, children, ref }: Readonly<SheetDoubleProps>) {
  const [presented, setPresented] = useState(true)
  const dismissal = useMemo(() => ({ finished: false }), [])
  const requestClose = useCallback(
    (exitAction?: () => void, onRejected?: () => void) => {
      if (dismissal.finished) return
      const finish = () => {
        dismissal.finished = true
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
    [dismissal, onClose],
  )

  useImperativeHandle(ref, () => ({ requestClose, isDismissed: () => dismissal.finished }), [dismissal, requestClose])

  return createElement(
    'Sheet',
    { title, accessibleTitle, open: presented },
    title ? createElement('Text', null, title) : null,
    createElement('Pressable', {
      accessibilityLabel: 'attempt-dismiss',
      onPress: () => requestClose(),
    }),
    createElement('SheetBody', { testID: 'sheet-body-slot' }, children),
    createElement('SheetActions', { testID: 'sheet-actions-slot' }, actions ? createElement(ActionRow, null, actions) : null),
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
