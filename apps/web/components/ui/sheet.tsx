'use client'

import { useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type Ref, type RefObject } from 'react'
import type { SheetProps } from '@orbit/shared/contracts/overlay'
import { SHEET_BODY_INSETS } from '@orbit/shared/theme'
import { Dialog } from '@base-ui/react/dialog'
import { useTranslations } from 'next-intl'
import { X } from '@/components/ui/icons'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { AppToastHost } from '@/components/ui/app-toast-host'
import {
  registerModalFocusOwner,
  registerOverlay,
  unregisterModalFocusOwner,
  unregisterOverlay,
} from '@/lib/overlay-stack'
import { useUIStore } from '@/stores/ui-store'

export interface SheetHandle {
  /**
   * Closes the sheet and runs `exitAction` once the exit transition completes.
   * Without an `exitAction` the sheet's own `onClose` runs instead.
   */
  requestClose: (exitAction?: () => void) => void
}

/**
 * The one close path a sheet host may use. Never flip the open state directly: the sheet has
 * to finish its exit before it is unmounted, and any navigation has to run after that, so
 * both platforms share one close path.
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
  virtualizedBody?: boolean
  initialFocus?: RefObject<HTMLElement | null>
  titleTranslate?: 'no'
  /** The handle `useSheetHost` fills in, so the host can close through the exit transition. */
  ref?: Ref<SheetHandle>
}

/** The sole modal surface. Callers mount it to open and unmount it to close. */
export function Sheet({ title, titleTranslate, accessibleTitle, headerAccessory, actions, minimumBodyWidth, virtualizedBody, initialFocus, onClose, onAttemptDismiss, children, ref }: Readonly<WebSheetProps>) {
  const t = useTranslations()
  const [presented, setPresented] = useState(true)
  const [modalFocusOwnerActive, setModalFocusOwnerActive] = useState(true)
  const overlayId = useId()
  const modalId = `modal:${overlayId}`
  const registerOpenOverlay = useUIStore((state) => state.registerOpenOverlay)
  const unregisterOpenOverlay = useUIStore((state) => state.unregisterOpenOverlay)
  const exitActionRef = useRef<(() => void) | null>(null)
  const onCloseRef = useRef(onClose)
  const onAttemptDismissRef = useRef(onAttemptDismiss)

  const requestClose = useCallback((exitAction?: () => void) => {
    exitActionRef.current = exitAction ?? null
    setPresented(false)
  }, [])

  const handle = useMemo<SheetHandle>(() => ({ requestClose }), [requestClose])

  useImperativeHandle(ref, () => handle, [handle])

  useEffect(() => {
    onCloseRef.current = onClose
    onAttemptDismissRef.current = onAttemptDismiss
  }, [onClose, onAttemptDismiss])

  useEffect(() => {
    if (!modalFocusOwnerActive) return
    registerOverlay({
      id: modalId,
      dismiss: () => {
        if (onCloseRef.current) requestClose()
        else onAttemptDismissRef.current?.()
      },
    })
    registerModalFocusOwner(modalId)
    registerOpenOverlay(modalId)
    return () => {
      unregisterOverlay(modalId)
      unregisterModalFocusOwner(modalId)
      unregisterOpenOverlay(modalId)
    }
  }, [modalFocusOwnerActive, modalId, registerOpenOverlay, requestClose, unregisterOpenOverlay])

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
      disablePointerDismissal={onClose == null && onAttemptDismiss == null}
      onOpenChange={(nextOpen: boolean) => {
        if (nextOpen) return
        if (onClose) requestClose()
        else onAttemptDismiss?.()
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
          <Dialog.Popup className="orbit-sheet-panel" initialFocus={initialFocus} style={minimumBodyWidth == null ? undefined : { containerType: 'inline-size', containerName: 'sheet-panel' }}>
            <div className="orbit-sheet-grabber" aria-hidden="true" />
            <header className="orbit-sheet-header">
              <Dialog.Title translate={titleTranslate} className={title ? 'orbit-sheet-title' : 'sr-only'}>
                {title ?? accessibleTitle ?? t('common.appName')}
              </Dialog.Title>
              {headerAccessory}
              {onClose || onAttemptDismiss ? (
                <Dialog.Close className="orbit-sheet-close" aria-label={t('common.close')}>
                  <X size={24} strokeWidth={1.8} aria-hidden="true" />
                </Dialog.Close>
              ) : null}
            </header>
            {children == null ? null : (
              <>
                {minimumBodyWidth == null ? null : <style>{`
                  [data-sheet-body-id="${overlayId}"] { padding-inline: ${SHEET_BODY_INSETS[0]}px; }
                  ${SHEET_BODY_INSETS.map((inset) => `
                    @container sheet-panel (min-width: ${minimumBodyWidth + inset * 2}px) {
                      [data-sheet-body-id="${overlayId}"] { padding-inline: ${inset}px; }
                    }
                  `).join('')}
                `}</style>}
                <div className="orbit-sheet-body" data-slot="sheet-body" data-sheet-body-id={overlayId} style={{
                  ...(virtualizedBody ? { display: 'flex', flexDirection: 'column', overflowY: 'hidden' } as const : {}),
                }}>
                  {children}
                </div>
              </>
            )}
            <UpdateAvailableBanner modalId={modalId} />
            <div className="empty:hidden shrink-0 px-6 pb-4" data-sheet-notice="">
              <AppToastHost placement="modal" modalId={modalId} />
            </div>
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
