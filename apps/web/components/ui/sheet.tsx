'use client'

import { PersonalText } from '@/components/ui/personal-text'

import { ActionRow } from './action-row'

import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type Ref, type RefObject } from 'react'
import type { SheetProps } from '@orbit/shared/contracts/overlay'
import { motionSprings, shouldDismissSheet, SHEET_BODY_INSETS } from '@orbit/shared/theme'
import { Dialog } from '@base-ui/react/dialog'
import { animate, motion, useDragControls, useMotionValue, type PanInfo, type HTMLMotionProps } from 'motion/react'
import { subscribeKeyboardViewport } from '@/hooks/use-keyboard-viewport'
import { useViewportMatch } from '@/hooks/use-viewport-match'
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
  finalFocus?: Dialog.Popup.Props['finalFocus']
  titleTranslate?: 'no'
  /** The handle `useSheetHost` fills in, so the host can close through the exit transition. */
  ref?: Ref<SheetHandle>
}

/** The sole modal surface. Callers mount it to open and unmount it to close. */
export function Sheet({ title, titleMode = 'label', titleTranslate, accessibleTitle, headerAccessory, actions, minimumBodyWidth, boundedBody, virtualizedBody, initialFocus, finalFocus, onClose, onAttemptDismiss, children, ref }: Readonly<WebSheetProps>) {
  const t = useTranslations()
  const { titleClamped, titleExpanded, onClampedChange, bodyRef, toggleTitle } = useSheetTitleDisclosure(title)
  const viewportRef = useSheetKeyboardViewport(bodyRef, virtualizedBody)
  const onBodyFocus = useSheetBodyFocusVisibility(virtualizedBody)
  const [presented, setPresented] = useState(true)
  // WHY: A pointer-down menu can mount this sheet before its opening release. https://github.com/thomasluizon/orbit-tickets/issues/577
  const [pointerDismissalReady, setPointerDismissalReady] = useState(false)
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

  const drag = useSheetDrag({ onClose, requestClose, onAttemptDismiss })

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
      disablePointerDismissal={!pointerDismissalReady || (onClose == null && onAttemptDismiss == null)}
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
      <Dialog.Portal className="orbit-sheet-portal" onPointerDownCapture={() => setPointerDismissalReady(true)} onPointerUpCapture={(event) => {
        if (!pointerDismissalReady) event.preventDefault()
      }}>
        <Dialog.Backdrop className="orbit-sheet-backdrop" />
        <Dialog.Viewport ref={viewportRef} className="orbit-sheet-viewport">
          <motion.div className="orbit-sheet-drag-frame" {...drag.frameProps}>
          <Dialog.Popup className="orbit-sheet-panel" initialFocus={initialFocus} finalFocus={finalFocus}>
            <div className="orbit-sheet-grabber-target" aria-hidden="true" onPointerDown={drag.start}><div className="orbit-sheet-grabber" /></div>
            <header className="orbit-sheet-header">
              <Dialog.Title aria-label={accessibleTitle} translate={titleTranslate} className={title ? 'orbit-sheet-title' : 'sr-only'} data-title-mode={titleMode}>
                <SheetTitleContent title={title} titleMode={titleMode} accessibleTitle={accessibleTitle}
                  expanded={titleExpanded} onToggle={toggleTitle}
                  clamped={titleClamped} onClampedChange={onClampedChange}
                  fullTitleId={`${overlayId}-full-title`} />
              </Dialog.Title>
              {headerAccessory}
              {onClose || onAttemptDismiss ? (
                <Dialog.Close className="orbit-sheet-close" aria-label={t('common.close')}>
                  <X size={24} strokeWidth={1.8} aria-hidden="true" />
                </Dialog.Close>
              ) : null}
            </header>
            {children == null && !(title && titleMode === 'typed') ? null : (
              <div className="orbit-sheet-body-viewport" style={minimumBodyWidth == null ? undefined : { containerType: 'inline-size', containerName: 'sheet-panel' }}>
                {minimumBodyWidth == null ? null : <style>{`
                  [data-sheet-body-id="${overlayId}"] { --sheet-body-inline: ${SHEET_BODY_INSETS[0]}px; }
                  ${SHEET_BODY_INSETS.map((inset) => `
                    @container sheet-panel (min-width: ${minimumBodyWidth + inset * 2}px) {
                      [data-sheet-body-id="${overlayId}"] { --sheet-body-inline: ${inset}px; }
                    }
                  `).join('')}
                `}</style>}
                <div ref={bodyRef} onFocusCapture={onBodyFocus} className="orbit-sheet-body" data-slot="sheet-body" data-sheet-body-id={overlayId} style={{
                  ...(boundedBody ? { display: 'flex', flexDirection: 'column', minHeight: 0 } as const : {}),
                  ...(virtualizedBody ? { display: 'flex', flexDirection: 'column', overflowY: 'hidden' } as const : {}),
                }}>
                  <ExpandedSheetTitle title={title} titleMode={titleMode} clamped={titleClamped} expanded={titleExpanded} id={`${overlayId}-full-title`} />
                  {children}
                </div>
              </div>
            )}
            <UpdateAvailableBanner modalId={modalId} />
            <div className="empty:hidden shrink-0 px-6 pb-4" data-sheet-notice="">
              <AppToastHost placement="modal" modalId={modalId} />
            </div>
            {actions == null ? null : (
              <footer className="orbit-sheet-actions" data-slot="sheet-actions">
                <ActionRow>{actions}</ActionRow>
              </footer>
            )}
          </Dialog.Popup>
          </motion.div>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ExpandedSheetTitle({ title, titleMode, clamped, expanded, id }: Readonly<Pick<SheetProps, 'title' | 'titleMode'> & { clamped: boolean; expanded: boolean; id: string }>) {
  if (!title || titleMode !== 'typed' || !clamped) return null
  return <div id={id} hidden={!expanded}><PersonalText expanded className="orbit-sheet-full-title">{title}</PersonalText></div>
}

function SheetTitleContent({ title, titleMode, accessibleTitle, expanded, onToggle, fullTitleId, clamped, onClampedChange }: Pick<SheetProps, 'title' | 'titleMode' | 'accessibleTitle'> & {
  expanded: boolean
  onToggle: () => void
  fullTitleId: string
  clamped: boolean
  onClampedChange: (clamped: boolean) => void
}) {
  const t = useTranslations()
  if (!title || titleMode !== 'typed') return title ?? accessibleTitle ?? t('common.appName')
  const text = <PersonalText className="orbit-sheet-typed-title" onClampedChange={onClampedChange}>{title}</PersonalText>
  return clamped ? <button type="button" className="orbit-sheet-title-content orbit-sheet-title-button" aria-expanded={expanded}
    aria-controls={fullTitleId} onClick={onToggle}>{text}</button>
    : <span className="orbit-sheet-title-content">{text}</span>
}

function useSheetTitleDisclosure(title: string | undefined) {
  const [disclosure, setDisclosure] = useState({ title, clamped: false, expanded: false })
  if (disclosure.title !== title) setDisclosure({ title, clamped: false, expanded: false })
  const titleClamped = disclosure.title === title && disclosure.clamped
  const titleExpanded = titleClamped && disclosure.expanded
  const onClampedChange = useCallback((clamped: boolean) => {
    setDisclosure((current) => current.clamped === clamped ? current : { ...current, clamped, expanded: clamped && current.expanded })
  }, [])
  const bodyRef = useRef<HTMLDivElement>(null)
  const previousScroll = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (bodyRef.current && previousScroll.current !== null) {
      bodyRef.current.scrollTop = titleExpanded ? 0 : previousScroll.current
    }
  }, [titleExpanded])
  function toggleTitle() {
    if (!titleExpanded) previousScroll.current = bodyRef.current?.scrollTop ?? 0
    setDisclosure((current) => ({ ...current, expanded: !current.expanded }))
  }
  return { titleClamped, titleExpanded, onClampedChange, bodyRef, toggleTitle }
}

function revealSheetBodyFocus(body: HTMLDivElement) {
  const focused = body.ownerDocument.activeElement
  if (!(focused instanceof HTMLElement) || !body.contains(focused)) return
  const bounds = focused.getBoundingClientRect()
  const bodyBounds = body.getBoundingClientRect()
  const style = getComputedStyle(body)
  const borderTop = Number.parseFloat(style.borderTopWidth) || 0
  const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0
  const scrollbarHeight = Math.max(0, body.offsetHeight - body.clientHeight - borderTop - borderBottom)
  const viewport = window.visualViewport
  const clearance = focused.matches('input, textarea, [contenteditable="true"]') ? 24 : 0
  const footer = body.closest('[role="dialog"]')?.querySelector('footer')
  const viewportBottom = viewport ? viewport.offsetTop + viewport.height - (footer?.getBoundingClientRect().height ?? 0) : Infinity
  const top = Math.max(bodyBounds.top + borderTop, viewport?.offsetTop ?? 0) + clearance
  const bottom = Math.min(bodyBounds.bottom - borderBottom - scrollbarHeight, viewportBottom) - clearance
  const delta = bounds.top < top || bounds.height > bottom - top
    ? bounds.top - top
    : Math.max(0, bounds.bottom - bottom)
  body.scrollTop = Math.max(0, body.scrollTop + (delta < 0 ? Math.floor(delta) : Math.ceil(delta)))
}

function useSheetKeyboardViewport(bodyRef: RefObject<HTMLDivElement | null>, virtualizedBody: boolean | undefined) {
  return useCallback((element: HTMLDivElement | null) => {
    const viewport = window.visualViewport
    if (!viewport || !element) return
    const update = () => {
      element.style.top = `${viewport.offsetTop}px`
      element.style.height = `${viewport.height}px`
      element.style.bottom = 'auto'
      const panel = element.querySelector<HTMLElement>('[role="dialog"]')
      if (panel) panel.style.maxHeight = `${viewport.height * 0.85}px`
      if (!virtualizedBody && bodyRef.current) revealSheetBodyFocus(bodyRef.current)
    }
    update()
    return subscribeKeyboardViewport(viewport, update)
  }, [bodyRef, virtualizedBody])
}

function useSheetBodyFocusVisibility(virtualizedBody: boolean | undefined) {
  const observerRef = useRef<ResizeObserver | null>(null)
  useLayoutEffect(() => () => observerRef.current?.disconnect(), [virtualizedBody])
  return (event: FocusEvent<HTMLDivElement>) => {
    const body = event.currentTarget
    if (virtualizedBody || !body.contains(event.target)) return
    observerRef.current?.disconnect()
    if (event.target.getAttribute('role') === 'menu') return
    revealSheetBodyFocus(body)
    let revealedScrollTop = body.scrollTop
    const observer = new ResizeObserver(() => {
      if (body.scrollTop !== revealedScrollTop) { observer.disconnect(); return }
      revealSheetBodyFocus(body)
      revealedScrollTop = body.scrollTop
    })
    observerRef.current = observer
    observer.observe(body)
    observer.observe(event.target)
  }
}

function useSheetDrag({ onClose, requestClose, onAttemptDismiss }: Pick<WebSheetProps, 'onClose' | 'onAttemptDismiss'> & { requestClose: () => void }) {
  const dismiss = onClose ? requestClose : onAttemptDismiss
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const y = useMotionValue(0)
  const controls = useDragControls()
  useEffect(() => {
    if (reducedMotion) { controls.cancel(); y.stop(); y.set(0) }
    return () => y.stop()
  }, [reducedMotion, controls, y])
  const onEnd = (event: MouseEvent | TouchEvent | PointerEvent, gesture: PanInfo) => {
    if (event.type !== 'pointercancel' && dismiss && shouldDismissSheet(gesture.offset.y, gesture.velocity.y)) {
      dismiss()
      if (onClose) return
    }
    void animate(y, 0, { type: 'spring', stiffness: motionSprings.sheet.stiffness, damping: motionSprings.sheet.damping, mass: motionSprings.sheet.mass, velocity: event.type === 'pointercancel' ? 0 : Math.max(0, gesture.velocity.y) })
  }
  const enabled = Boolean(dismiss) && !reducedMotion
  return {
    start: (event: React.PointerEvent<HTMLDivElement>) => { if (enabled) controls.start(event) },
    frameProps: {
      style: { y }, drag: enabled ? 'y' : false, dragListener: false, dragControls: controls,
      dragMomentum: false, dragConstraints: { top: 0 }, dragElastic: 0, onDragEnd: onEnd,
    } satisfies HTMLMotionProps<'div'>,
  }
}
