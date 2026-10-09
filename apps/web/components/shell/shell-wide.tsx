'use client'

import { PersonalText } from '@/components/ui/personal-text'

import Link from 'next/link'
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefCallback,
} from 'react'
import { BUTTON_SIZES, SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'
import type { ShellWideItem, ShellWideProps } from '@orbit/shared/contracts/shell'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { Search } from '@/components/ui/icons'
import { SHELL_DESTINATION_IDS } from '@orbit/shared/utils'
import { DestinationIcon } from '@/components/navigation/destination-icon'
import { Lockup } from '@/components/ui/lockup'
import { Button } from '@/components/ui/pill-button'
import { useShellScrollerRegistration } from './shell-scroller-context'
import { useModalFocusTrap } from './use-modal-focus-trap'

function getConversationFocusTarget(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('[data-composer-input]:not([disabled])')
    ?? container.querySelector<HTMLElement>('[data-composer-root]')
    ?? container.querySelector<HTMLElement>('button:not([disabled])')
    ?? container
}

function getShellConversationFocusTarget(shell: HTMLElement): HTMLElement {
  const conversation = shell.querySelector<HTMLElement>('[data-shell-conversation]')
  return conversation ? getConversationFocusTarget(conversation) : shell
}

function getConversationReturnTarget(target: HTMLElement): HTMLElement {
  return target.closest('[data-composer-root]')?.querySelector<HTMLElement>('[data-open-conversation]') ?? target
}

type ResponsiveShellProps = ShellWideProps & { tabBar?: ReactNode; fab?: ReactNode; scrollToTop?: ReactNode; createRefusal?: ReactNode }

function SidebarItem({
  item,
  active,
  current,
  onSelect,
}: Readonly<{
  item: ShellWideItem
  active: boolean
  current: boolean
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
    'flex min-h-[var(--touch-min)] w-full items-center gap-3 overflow-hidden rounded-[12px] px-3 text-left text-[14px] font-medium',
    'transition-[background-color,color,transform] [transition-duration:var(--dur-hover-control),var(--dur-hover-control),150ms] ease-[var(--ease-standard)] active:scale-[0.96]',
    active
      ? 'text-[var(--primary-soft)] hover:text-[var(--primary-text)]'
      : 'text-[var(--fg-3)]',
    onSelect ? 'orbit-hover-text hover:bg-[var(--bg-hover)]' : '',
  ].join(' ')

  if (!onSelect) {
    return <div className={className}>{content}</div>
  }

  return (
    <button
      type="button"
      className={className}
      aria-current={current ? 'page' : undefined}
      onClick={() => onSelect(item.id)}
    >
      {content}
    </button>
  )
}

function SidebarAstraRow({ row, open, conversationId }: Readonly<{
  row: { label: string; onOpen: () => void }
  open: boolean
  conversationId: string
}>) {
  return <button
            type="button"
            data-shell-astra-row=""
            aria-expanded={open}
            aria-controls={open ? conversationId : undefined}
            onClick={row.onOpen}
            className={`orbit-hover-text flex min-h-[var(--touch-min)] w-full items-center gap-3 overflow-hidden rounded-[12px] px-3 text-start text-[14px] font-medium transition-[background-color,color,scale] [transition-duration:var(--dur-hover-control),var(--dur-hover-control),150ms] [transition-timing-function:var(--ease-standard),var(--ease-standard),var(--ease-out)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] motion-safe:active:scale-[0.96] ${open ? 'text-[var(--primary-soft)] hover:text-[var(--primary-text)] active:text-[var(--primary-text)]' : 'text-[var(--fg-3)]'}`}
          >
            <AstraGlyph size={20} color={open ? 'var(--primary)' : 'var(--fg-3)'} />
            <span translate="no" className="whitespace-nowrap">{row.label}</span>
          </button>
}

function ShellSidebar(props: Readonly<Extract<ShellWideProps, { nav?: true }> & { createRefusal?: ReactNode; layerOpen: boolean; wide: boolean; conversationId: string }>) {
  return (
    <aside
      data-shell-sidebar=""
      inert={props.layerOpen && !props.wide || undefined}
      className="z-sticky hidden h-dvh w-[232px] shrink-0 flex-col bg-[var(--bg)] p-6 shadow-[inset_-1px_0_0_var(--hairline)] lg:flex"
    >
      <div className="flex flex-col gap-6">
        <div className="flex min-h-12 items-center justify-between">
          <Lockup />
          {props.notifications}
        </div>

        {props.onPalette ? (
          <button
            type="button"
            onClick={props.onPalette}
            className="flex min-h-[var(--touch-min)] items-center gap-3 rounded-[12px] bg-[var(--bg-field)] px-3 text-[14px] text-[var(--fg-3)] shadow-[inset_0_0_0_1px_var(--border-control)] transition-[background-color,color,box-shadow,transform] [transition-duration:var(--dur-hover-control),var(--dur-hover-control),var(--dur-hover-control),150ms] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] active:scale-[0.96]"
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
          {props.wide ? <SidebarAstraRow row={props.astraRow} open={props.layerOpen} conversationId={props.conversationId} /> : null}
          {props.items.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              active={!props.layerOpen && item.id === props.activeId}
              current={item.id === props.activeId}
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
          <div className="flex min-w-0 items-center"><Link
            data-shell-account=""
            aria-label={[props.account, props.accountEmail].filter(Boolean).join(', ')}
            href="/profile"
            className="orbit-hover-text flex flex-1 min-h-[var(--touch-min)] min-w-0 items-center gap-3 rounded-[12px] px-2 py-2 text-[14px] font-medium text-[var(--fg-1)] transition-[background-color,color,transform] [transition-duration:var(--dur-hover-control),var(--dur-hover-control),150ms] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:scale-[0.96]"
          >
            <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-[var(--bg-well)] text-[var(--fg-2)]">
              {Array.from(props.account)[0]?.toLocaleUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <PersonalText data-shell-account-name="">{props.account}</PersonalText>{' '}
              {props.accountEmail ? <PersonalText data-shell-account-email="" className="text-[12px] font-normal text-[var(--fg-3)]">{props.accountEmail}</PersonalText> : null}
            </span>
          </Link></div>
        ) : (
          <div data-shell-account="" data-loading="true" aria-hidden="true" className="min-h-[var(--touch-min)]" />
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
  const actionMinimum = !conversationOpen && pinnedSlot !== undefined && (!navigationEnabled || props.tabBar === undefined) ? BUTTON_SIZES.md.height + 8 : undefined

  return (
    <div
      data-shell-bottom=""
      className="z-sticky relative flex min-h-0 flex-col bg-[var(--bg)] pb-[var(--safe-bottom)] lg:pb-0"
      style={actionMinimum === undefined ? undefined : { minHeight: `calc(${actionMinimum}px + var(--safe-bottom))` }}
    >
      <div className="relative mx-auto flex min-h-0 w-full flex-col" style={{ maxWidth: SHELL_CONTENT_MAX_WIDTH, minHeight: actionMinimum }}>
        {props.notice !== undefined ? (
          <div data-shell-notice="" className="pointer-events-none overflow-y-auto [scrollbar-gutter:stable] px-4 has-[>div>:not(:empty)]:pt-[calc(var(--sh-2-blur)-var(--sh-2-offset-y))] has-[>div>:not(:empty)]:pb-[calc(var(--sh-2-blur)+var(--sh-2-offset-y))]">
            <div className="pointer-events-auto">{props.notice}</div>
          </div>
        ) : null}
        {pinnedSlot !== undefined ? (
          <div data-shell-pinned-slot="" hidden={conversationOpen} className={`pointer-events-none min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] ${actionMinimum === undefined ? '' : 'py-1'} lg:pb-4`} style={{ minHeight: actionMinimum }}>
            <div className="pointer-events-auto">{pinnedSlot}</div>
          </div>
        ) : null}
        {navigationEnabled && props.tabBar !== undefined ? (
          <div data-shell-tab-bar="" className="shrink-0 lg:hidden">{props.tabBar}</div>
        ) : null}
        {props.fab !== undefined ? (
          <div data-shell-fab-clip="" className="pointer-events-none absolute inset-x-0 flex justify-end overflow-y-auto [scrollbar-gutter:stable] px-4 py-2 lg:hidden" style={{ bottom: 'calc(100% + 8px)' }}>
            <div data-shell-fab="" className="pointer-events-auto">{props.fab}</div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function getScrollerSpacing(hasBottomChrome: boolean, reservesComposerSpace: boolean) {
  if (!hasBottomChrome) return { padding: '', minimum: 'min-h-0' }
  return reservesComposerSpace
    ? { padding: 'pb-24 lg:pb-8', minimum: 'min-h-24 lg:min-h-8' }
    : { padding: 'pb-8', minimum: 'min-h-8' }
}

function ShellWideBackground({
  props,
  conversationOpen,
  wide,
  conversationId,
  registerScroller,
}: Readonly<{
  props: ResponsiveShellProps
  conversationOpen: boolean
  wide: boolean
  conversationId: string
  registerScroller?: RefCallback<HTMLElement>
}>) {
  const navigationEnabled = props.nav !== false
  const pinnedSlot = navigationEnabled ? props.composer : props.action
  const hasFlowAction = pinnedSlot !== undefined && (!navigationEnabled || props.tabBar === undefined)
  const hasBottomChrome = (navigationEnabled && props.tabBar !== undefined)
    || props.notice !== undefined || pinnedSlot !== undefined
  const scrollerSpacing = getScrollerSpacing(hasBottomChrome, pinnedSlot !== undefined || props.fab !== undefined)
  const scroller = (
    <main
      ref={registerScroller}
      data-shell-scroller=""
      className={`relative overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] ${hasFlowAction ? 'h-full' : 'min-h-0 flex-1'} ${scrollerSpacing.padding}`}
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
      className="flex min-w-0 flex-1"
    >
      {navigationEnabled ? <ShellSidebar {...props} layerOpen={conversationOpen} wide={wide} conversationId={conversationId} /> : null}

      <div className="relative flex h-dvh min-w-0 flex-1 justify-center pt-[var(--safe-top)] lg:px-8 lg:pt-[max(32px,var(--safe-top))]">
        <div data-shell-column="" className="relative flex h-full w-full min-w-0 flex-col" style={{ maxWidth: SHELL_CONTENT_MAX_WIDTH }}>
          <div data-shell-background="" data-shell-destination="" inert={conversationOpen || undefined} aria-hidden={conversationOpen || undefined}
            className="flex h-full min-h-0 flex-col" style={conversationOpen ? { visibility: 'hidden' } : undefined}>
          {props.header !== undefined ? <div data-shell-header="" data-focus-inset="" className={`overflow-y-auto [scrollbar-gutter:stable] ${hasFlowAction ? 'min-h-[var(--touch-min)] overscroll-contain' : 'shrink-0'}`}>{props.header}</div> : null}
          <div className={`relative flex flex-1 flex-col ${scrollerSpacing.minimum}`}>
            {hasFlowAction ? <div className="min-h-0 flex-1 overflow-hidden">{scroller}</div> : scroller}
            {props.scrollToTop !== undefined && !conversationOpen ? (
              <div data-shell-scroll-to-top="" className="pointer-events-none absolute inset-x-0 top-2 z-sticky flex justify-center">
                <div className="pointer-events-auto">{props.scrollToTop}</div>
              </div>
            ) : null}
          </div>
          <ShellBottomChrome props={props} conversationOpen={conversationOpen} visible={hasBottomChrome} />
          </div>
          {conversationOpen ? <div
            id={conversationId}
            role="dialog"
            aria-modal={!wide || undefined}
            aria-label={props.conversationLabel}
            tabIndex={-1}
            data-shell-conversation="overlay"
            className="z-modal fixed inset-y-0 left-[var(--safe-left)] right-[var(--safe-right)] mx-auto overflow-hidden bg-[var(--bg)] pt-[var(--safe-top)] pb-[var(--safe-bottom)] lg:absolute lg:inset-0 lg:pt-0 lg:pb-0"
            style={{ maxWidth: SHELL_CONTENT_MAX_WIDTH }}
          ><main className="h-full">{props.conversation}</main></div> : null}
        </div>
      </div>
    </div>
  )
}

export function ShellWide(props: Readonly<ResponsiveShellProps>) {
  const conversationOpen = props.conversation !== undefined && props.conversationOpen !== false
  const wide = useIsWideDesktop()
  const conversationId = useId()
  const shellRef = useRef<HTMLDivElement>(null)
  const returnFocusTriggerRef = useRef<HTMLElement>(null)
  const registerScroller = useShellScrollerRegistration()
  useModalFocusTrap(conversationOpen, shellRef, returnFocusTriggerRef, getShellConversationFocusTarget)
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
      className="flex h-dvh min-h-dvh overflow-hidden bg-[var(--bg)] pl-[var(--safe-left)] pr-[var(--safe-right)] text-[var(--fg-1)]"
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
        wide={wide}
        conversationId={conversationId}
        registerScroller={registerScroller}
      />

    </div>
  )
}
