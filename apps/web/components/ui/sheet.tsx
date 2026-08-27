'use client'

import { useState } from 'react'
import type { SheetProps } from '@orbit/shared/contracts/overlay'
import { Dialog } from '@base-ui/react/dialog'
import { useTranslations } from 'next-intl'
import { X } from '@/components/ui/icons'

/** The sole modal surface. Callers mount it to open and unmount it to close. */
export function Sheet({
  title,
  actions,
  onClose,
  children,
}: Readonly<SheetProps>) {
  const t = useTranslations()
  const [presented, setPresented] = useState(true)

  return (
    <Dialog.Root
      open={presented}
      modal
      disablePointerDismissal={onClose == null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && onClose) setPresented(false)
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) onClose?.()
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
