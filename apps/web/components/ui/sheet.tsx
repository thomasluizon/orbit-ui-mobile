'use client'

import { useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import type { SheetProps } from '@orbit/shared/contracts/overlay'
import { Dialog } from '@base-ui/react/dialog'
import { useTranslations } from 'next-intl'
import { X } from '@/components/ui/icons'
import {
  registerModalFocusOwner,
  registerOverlay,
  unregisterModalFocusOwner,
  unregisterOverlay,
} from '@/lib/overlay-stack'

export interface SheetHandle {
  /**
   * Closes the sheet and runs `exitAction` once the exit transition completes.
   * Without an `exitAction` the sheet's own `onClose` runs instead.
   */
  requestClose: (exitAction?: () => void) => void
}

/**
 * The one close path a sheet host may use. Never flip the open state directly:
 * the sheet has to finish its exit before it is unmounted, and any navigation
 * has to run after that, so both platforms share one close path. Pass
 * `sheetRef` to the sheet, then call `closeSheet()`, or `closeSheet(action)`
 * when something has to run after the sheet is gone.
 */
export function useSheetHost() {
  const sheetRef = useRef<SheetHandle>(null)

  const closeSheet = useCallback((exitAction?: () => void) => {
    const handle = sheetRef.current
    if (handle) handle.requestClose(exitAction)
    else exitAction?.()
  }, [])

  return { sheetRef, closeSheet }
}

interface WebSheetProps extends SheetProps {
  /** The handle `useSheetHost` fills in, so the host can close through the exit transition. */
  ref?: Ref<SheetHandle>
}

/** The sole modal surface. Callers mount it to open and unmount it to close. */
export function Sheet({ title, actions, onClose, children, ref }: Readonly<WebSheetProps>) {
  const t = useTranslations()
  const [presented, setPresented] = useState(true)
  const [modalFocusOwnerActive, setModalFocusOwnerActive] = useState(true)
  const overlayId = useId()
  const exitActionRef = useRef<(() => void) | null>(null)
  const onCloseRef = useRef(onClose)

  const requestClose = useCallback((exitAction?: () => void) => {
    exitActionRef.current = exitAction ?? null
    setPresented(false)
  }, [])

  const handle = useMemo<SheetHandle>(() => ({ requestClose }), [requestClose])

  useImperativeHandle(ref, () => handle, [handle])

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!modalFocusOwnerActive) return
    registerOverlay({
      id: overlayId,
      dismiss: () => {
        if (onCloseRef.current) requestClose()
      },
    })
    registerModalFocusOwner(overlayId)
    return () => {
      unregisterOverlay(overlayId)
      unregisterModalFocusOwner(overlayId)
    }
  }, [modalFocusOwnerActive, overlayId, requestClose])

  function runExit() {
    const exitAction = exitActionRef.current
    exitActionRef.current = null
    if (exitAction) {
      exitAction()
      return
    }
    onClose?.()
  }

  return (
    <Dialog.Root
      open={presented}
      modal
      disablePointerDismissal={onClose == null}
      onOpenChange={(nextOpen: boolean) => {
        if (!nextOpen && onClose) requestClose()
      }}
      onOpenChangeComplete={(nextOpen: boolean) => {
        if (!nextOpen) {
          setModalFocusOwnerActive(false)
          runExit()
        }
      }}
    >
      <Dialog.Portal className="orbit-sheet-portal">
        <Dialog.Backdrop className="orbit-sheet-backdrop" />
        <Dialog.Viewport className="orbit-sheet-viewport">
          <Dialog.Popup className="orbit-sheet-panel">
            <div className="orbit-sheet-grabber" aria-hidden="true" />
            <header className="orbit-sheet-header">
              <Dialog.Title className={title ? 'orbit-sheet-title' : 'sr-only'}>
                {title ?? t('common.appName')}
              </Dialog.Title>
              {onClose ? (
                <Dialog.Close className="orbit-sheet-close" aria-label={t('common.close')}>
                  <X size={24} strokeWidth={1.8} aria-hidden="true" />
                </Dialog.Close>
              ) : null}
            </header>
            {children == null ? null : (
              <div className="orbit-sheet-body" data-slot="sheet-body">
                {children}
              </div>
            )}
            {actions == null ? null : (
              <footer className="orbit-sheet-actions" data-slot="sheet-actions">
                {actions}
              </footer>
            )}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
