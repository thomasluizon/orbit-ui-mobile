'use client'

import Link from 'next/link'
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefCallback,
} from 'react'
import { BUTTON_SIZES, SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'
import type { ShellWideItem, ShellWideProps } from '@orbit/shared/contracts/shell'
import { Search } from '@/components/ui/icons'
import { SHELL_DESTINATION_IDS } from '@orbit/shared/utils'
import { DestinationIcon } from '@/components/navigation/destination-icon'
import { Lockup } from '@/components/ui/lockup'
import { Button } from '@/components/ui/pill-button'
import { useShellScrollerRegistration } from './shell-scroller-context'
import { useModalFocusTrap } from './use-modal-focus-trap'

const SIDE_PANEL_QUERY = '(min-width: 1024px)'

function getConversationFocusTarget(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('[data-composer-input]:not([disabled])')
    ?? container.querySelector<HTMLElement>('[data-composer-root]')
    ?? container.querySelector<HTMLElement>('button:not([disabled])')
    ?? container
}

function getConversationReturnTarget(target: HTMLElement): HTMLElement {
  return target.closest('[data-composer-root]')?.querySelector<HTMLElement>('[data-open-conversation]') ?? target
}

type ResponsiveShellProps = ShellWideProps & { tabBar?: ReactNode; fab?: ReactNode; createRefusal?: ReactNode }

function subscribeToSidePanel(callback: () => void) {
  const query = window.matchMedia(SIDE_PANEL_QUERY)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

function getSidePanelSnapshot() {
  return window.matchMedia(SIDE_PANEL_QUERY).matches
}

function getServerSnapshot() {
  return false
}

function SidebarItem({
  item,
  active,
  onSelect,
}: Readonly<{
  item: ShellWideItem
  active: boolean
  onSelect?: (id: string) => void
}>) {
  const destination = SHELL_DESTINATION_IDS.find((id) => id === item.icon)
  const content = (
    <>
      {destination ? (
        <DestinationIcon
          destination={destination}
          active={active}
          size={20}
          color={active ? 'var(--primary)' : 'var(--fg-3)'}
        />
      ) : null}
      <span className="min-w-0 truncate">{item.label}</span>
    </>
  )
  const className = [
    'flex h-11 w-full items-center gap-3 overflow-hidden rounded-[12px] px-3 text-left text-[14px] font-medium',
    'transition-[background-color,color,transform] [transition-duration:var(--dur-hover-control),var(--dur-hover-control),150ms] ease-[var(--ease-standard)] active:scale-[0.96]',
    active
      ? 'text-[var(--primary-soft)] hover:text-[var(--primary-text)]'
      : 'text-[var(--fg-3)]',
    onSelect ? 'hover:bg-[var(--bg-hover)]' : '',
  ].join(' ')

  if (!onSelect) {
    return <div className={className}>{content}</div>
  }

  return (
    <button
      type="button"
      className={className}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(item.id)}
    >
      {content}
    </button>
  )
}

function ShellSidebar(props: Readonly<Extract<ShellWideProps, { nav?: true }> & { createRefusal?: ReactNode }>) {
  return (
    <aside
      data-shell-sidebar=""
      className="z-sticky hidden h-dvh w-[232px] shrink-0 flex-col bg-[var(--bg)] p-6 shadow-[inset_-1px_0_0_var(--hairline)] lg:flex"
    >
      <div className="flex flex-col gap-6">
        <div className="flex h-11 items-center">
          <Lockup />
        </div>

        {props.onPalette ? (
          <button
            type="button"
            onClick={props.onPalette}
            className="flex h-11 items-center gap-3 rounded-[12px] bg-[var(--bg-field)] px-3 text-[14px] text-[var(--fg-3)] shadow-[inset_0_0_0_1px_var(--border-control)] transition-[background-color,color,box-shadow,transform] [transition-duration:var(--dur-hover-control),var(--dur-hover-control),var(--dur-hover-control),150ms] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] active:scale-[0.96]"
          >
            <Search size={20} strokeWidth={1.5} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left">{props.paletteLabel}</span>
            {props.paletteHint ? (
              <kbd className="rounded-[8px] bg-[var(--bg-well)] px-2 py-1 font-[var(--font-mono)] text-[12px] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)]">
                {props.paletteHint}
              </kbd>
            ) : null}
          </button>
        ) : null}

        <nav aria-label={props.navLabel} className="flex flex-col gap-1">
          {props.items.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              active={item.id === props.activeId}
              onSelect={props.onSelect}
            />
          ))}
        </nav>
      </div>

      <div className="flex-1" />
      <div className="flex flex-col gap-6">
        {props.onCreate ? (
          <div className="flex flex-col gap-3">
            <div aria-live="polite" aria-atomic="true">{props.createRefusal}</div>
            <Button onClick={props.onCreate}>{props.createLabel}</Button>
          </div>
        ) : null}
        {props.account ? (
          <Link
            href="/profile"
            className="flex h-11 min-w-0 items-center gap-3 rounded-[12px] px-2 text-[14px] font-medium text-[var(--fg-1)] transition-[background-color,color,transform] [transition-duration:var(--dur-hover-control),var(--dur-hover-control),150ms] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:scale-[0.96]"
          >
            <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-[var(--bg-well)] text-[var(--fg-2)]">
              {Array.from(props.account)[0]?.toLocaleUpperCase()}
            </span>
            <span className="min-w-0 truncate">{props.account}</span>
          </Link>
        ) : (
          <div data-shell-account="" data-loading="true" aria-hidden="true" className="h-11" />
        )}
      </div>
    </aside>
  )
}

function ShellBottomChrome({ props, conversationOpen, visible }: Readonly<{
  props: ResponsiveShellProps
  conversationOpen: boolean
  visible: boolean
}>) {
  const navigationEnabled = props.nav !== false
  const pinnedSlot = navigationEnabled ? props.composer : props.action
  if (!visible) return null
  const actionMinimum = !conversationOpen && pinnedSlot !== undefined && (!navigationEnabled || props.tabBar === undefined) ? BUTTON_SIZES.md.height : undefined

  return (
    <div
      data-shell-bottom=""
      className="z-sticky relative flex min-h-0 flex-col bg-[var(--bg)] pb-[var(--safe-bottom)] lg:pb-0"
      style={actionMinimum === undefined ? undefined : { minHeight: `calc(${actionMinimum}px + var(--safe-bottom))` }}
    >
      <div className="relative mx-auto flex min-h-0 w-full flex-col" style={{ maxWidth: SHELL_CONTENT_MAX_WIDTH, minHeight: actionMinimum }}>
        {props.notice !== undefined ? <div data-shell-notice="" className="px-4">{props.notice}</div> : null}
        {pinnedSlot !== undefined ? (
          <div data-shell-pinned-slot="" hidden={conversationOpen} className="min-h-0 overflow-y-auto overscroll-contain lg:pb-4" style={{ minHeight: actionMinimum }}>
            {pinnedSlot}
          </div>
        ) : null}
        {navigationEnabled && props.tabBar !== undefined ? (
          <div data-shell-tab-bar="" className="shrink-0 lg:hidden">{props.tabBar}</div>
        ) : null}
        {props.fab !== undefined ? (
          <div data-shell-fab="" className="absolute right-4 lg:hidden" style={{ bottom: 'calc(100% + 16px)' }}>
            {props.fab}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ShellWideBackground({
  props,
  conversationOpen,
  sidePanel,
  modalOpen,
  registerScroller,
}: Readonly<{
  props: ResponsiveShellProps
  conversationOpen: boolean
  sidePanel: boolean
  modalOpen: boolean
  registerScroller?: RefCallback<HTMLElement>
}>) {
  const navigationEnabled = props.nav !== false
  const pinnedSlot = navigationEnabled ? props.composer : props.action
  const hasFlowAction = !conversationOpen && pinnedSlot !== undefined && (!navigationEnabled || props.tabBar === undefined)
  const hasBottomChrome = (navigationEnabled && props.tabBar !== undefined)
    || props.notice !== undefined || pinnedSlot !== undefined
  const scrollerClearance = pinnedSlot !== undefined || props.fab !== undefined
    ? 'pb-24 lg:pb-8'
    : 'pb-8'
  const scroller = (
    <main
      ref={registerScroller}
      data-shell-scroller=""
      className={`relative overflow-y-auto overflow-x-hidden ${hasFlowAction ? 'h-full' : 'min-h-0 flex-1'} ${hasBottomChrome ? scrollerClearance : ''}`}
    >
      <span
        aria-hidden="true"
        data-shell-scroll-origin=""
        className="pointer-events-none absolute left-0 top-0 h-px w-px"
      />
      {props.children}
    </main>
  )
  return (
    <div
      data-shell-background=""
      inert={modalOpen || undefined}
      aria-hidden={modalOpen || undefined}
      className="flex min-w-0 flex-1"
    >
      {navigationEnabled ? <ShellSidebar {...props} /> : null}

      <div className={`relative flex min-w-0 flex-1 justify-center ${conversationOpen && sidePanel ? '' : 'lg:px-8'}`}>
        <div data-shell-column="" className="flex h-dvh w-full min-w-0 flex-col lg:pt-8" style={{ maxWidth: SHELL_CONTENT_MAX_WIDTH }}>
          {props.header !== undefined ? <div data-shell-header="" className={hasFlowAction ? 'min-h-11 overflow-y-auto overscroll-contain' : 'shrink-0'}>{props.header}</div> : null}
          {hasFlowAction ? <div className="min-h-0 flex-1 overflow-hidden">{scroller}</div> : scroller}
          <ShellBottomChrome props={props} conversationOpen={conversationOpen} visible={hasBottomChrome} />
        </div>
      </div>
    </div>
  )
}

export function ShellWide(props: Readonly<ResponsiveShellProps>) {
  const conversationOpen = props.conversation !== undefined && props.conversationOpen !== false
  const sidePanel = useSyncExternalStore(
    subscribeToSidePanel,
    getSidePanelSnapshot,
    getServerSnapshot,
  )
  const modalOpen = conversationOpen && !sidePanel
  const shellRef = useRef<HTMLDivElement>(null)
  const conversationRef = useRef<HTMLDivElement>(null)
  const sidePanelRef = useRef<HTMLElement>(null)
  const returnFocusTriggerRef = useRef<HTMLElement>(null)
  const registerScroller = useShellScrollerRegistration()
  useModalFocusTrap(modalOpen, conversationRef, returnFocusTriggerRef, getConversationFocusTarget)
  useEffect(() => {
    if (!conversationOpen || !sidePanel) return
    const panel = sidePanelRef.current
    if (!panel) return
    const returnTarget = returnFocusTriggerRef.current?.isConnected
      ? returnFocusTriggerRef.current
      : document.activeElement instanceof HTMLElement ? document.activeElement : null
    getConversationFocusTarget(panel).focus()
    return () => {
      if (returnTarget?.isConnected) returnTarget.focus()
    }
  }, [conversationOpen, sidePanel])
  useEffect(() => {
    if (!conversationOpen) return
    const shell = shellRef.current
    const trigger = returnFocusTriggerRef.current
    return () => {
      if (trigger?.isConnected || !shell?.isConnected) return
      const target = shell.querySelector<HTMLElement>('[data-shell-header] h1, [data-shell-scroller] h1')
        ?? shell.querySelector<HTMLElement>('[data-shell-scroller]')
      if (target && !target.hasAttribute('tabindex')) target.tabIndex = -1
      target?.focus({ preventScroll: true })
    }
  }, [conversationOpen])

  return (
    <div
      ref={shellRef}
      data-shell="wide"
      className="flex h-dvh min-h-dvh overflow-hidden bg-[var(--bg)] text-[var(--fg-1)]"
      onFocusCapture={(event) => {
        if (!conversationOpen && event.target instanceof HTMLElement) {
          returnFocusTriggerRef.current = getConversationReturnTarget(event.target)
        }
      }}
      onClickCapture={(event) => {
        if (!conversationOpen && event.target instanceof Element) {
          const trigger = event.target.closest<HTMLElement>('button, a[href], [role="button"]')
          if (trigger) returnFocusTriggerRef.current = getConversationReturnTarget(trigger)
        }
      }}
    >
      <ShellWideBackground
        props={props}
        conversationOpen={conversationOpen}
        sidePanel={sidePanel}
        modalOpen={modalOpen}
        registerScroller={registerScroller}
      />

      {conversationOpen && sidePanel ? (
        <aside
          ref={sidePanelRef}
          tabIndex={-1}
          data-shell-conversation="panel"
          aria-label={props.conversationLabel}
          className="h-dvh w-[380px] shrink-0 overflow-y-auto bg-[var(--bg)] shadow-[inset_1px_0_0_var(--hairline)]"
        >
          {props.conversation}
        </aside>
      ) : null}

      {conversationOpen && !sidePanel ? (
        <div
          ref={conversationRef}
          role="dialog"
          aria-modal="true"
          aria-label={props.conversationLabel}
          tabIndex={-1}
          data-shell-conversation="overlay"
          style={{ maxWidth: SHELL_CONTENT_MAX_WIDTH }}
          className="z-modal fixed inset-0 mx-auto overflow-y-auto bg-[var(--bg)] outline-none focus-visible:outline-solid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)]"
        >
          {props.conversation}
        </div>
      ) : null}
    </div>
  )
}
