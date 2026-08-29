'use client'

import {
  useRef,
  useSyncExternalStore,
  type ComponentType,
  type RefCallback,
} from 'react'
import type { ShellWideItem, ShellWideProps } from '@orbit/shared/contracts/shell'
import {
  CalendarDays,
  ChartLine,
  Home,
  Search,
  User,
  type IconProps,
} from '@/components/ui/icons'
import { Lockup } from '@/components/ui/lockup'
import { Button } from '@/components/ui/pill-button'
import { useShellScrollerRegistration } from './shell-scroller-context'
import { useModalFocusTrap } from './use-modal-focus-trap'

const SIDE_PANEL_QUERY = '(min-width: 1416px)'

const ICONS: Record<string, ComponentType<IconProps>> = {
  home: Home,
  calendar: CalendarDays,
  'chart-line': ChartLine,
  user: User,
}

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
  const Icon = item.icon ? ICONS[item.icon] : undefined
  const content = (
    <>
      {Icon ? (
        <Icon
          size={20}
          strokeWidth={active ? 2 : 1.5}
          color={active ? 'var(--primary)' : 'var(--fg-4)'}
          aria-hidden="true"
        />
      ) : null}
      <span className="min-w-0 truncate">{item.label}</span>
    </>
  )
  const className = [
    'flex h-11 w-full items-center gap-3 rounded-[12px] px-3 text-left text-[14px] font-medium',
    'transition-[background-color,color,transform] duration-150 ease-[var(--ease-standard)] active:scale-[0.96]',
    active
      ? 'text-[var(--primary-soft)]'
      : 'text-[var(--fg-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)]',
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

function ShellSidebar(props: Readonly<Extract<ShellWideProps, { nav?: true }>>) {
  return (
    <aside
      data-shell-sidebar=""
      className="z-sticky flex h-dvh w-[232px] shrink-0 flex-col bg-[var(--bg)] p-6 shadow-[inset_-1px_0_0_var(--hairline)]"
    >
      <div className="flex flex-col gap-6">
        <div className="flex h-11 items-center">
          <Lockup />
        </div>

        {props.onPalette ? (
          <button
            type="button"
            onClick={props.onPalette}
            className="flex h-11 items-center gap-3 rounded-[12px] bg-[var(--bg-field)] px-3 text-[14px] text-[var(--fg-3)] shadow-[inset_0_0_0_1px_var(--border-control)] transition-[background-color,color,box-shadow,transform] duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] active:scale-[0.96]"
          >
            <Search size={20} strokeWidth={1.5} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left">{props.paletteLabel}</span>
            {props.paletteHint ? (
              <kbd className="rounded-[8px] bg-[var(--bg-well)] px-2 py-1 font-[var(--font-mono)] text-[12px] text-[var(--fg-3)] shadow-[inset_0_0_0_1px_var(--hairline)]">
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
          <Button onClick={props.onCreate}>{props.createLabel}</Button>
        ) : null}
        {props.account ? (
          <div className="flex h-11 min-w-0 items-center text-[14px] text-[var(--fg-2)]">
            <span className="truncate">{props.account}</span>
          </div>
        ) : null}
      </div>
    </aside>
  )
}

function ShellWideBackground({
  props,
  conversationOpen,
  modalOpen,
  registerScroller,
}: Readonly<{
  props: ShellWideProps
  conversationOpen: boolean
  modalOpen: boolean
  registerScroller?: RefCallback<HTMLElement>
}>) {
  const navigationEnabled = props.nav !== false
  const pinnedSlot = navigationEnabled ? props.composer : props.action

  return (
    <div
      data-shell-background=""
      inert={modalOpen || undefined}
      aria-hidden={modalOpen || undefined}
      className="flex min-w-0 flex-1"
    >
      {navigationEnabled ? <ShellSidebar {...props} /> : null}

      <div className="relative flex min-w-0 flex-1 justify-center px-8">
        <div className="flex h-dvh w-full max-w-[740px] min-w-0 flex-col pt-8">
          {props.header !== undefined ? <div data-shell-header="">{props.header}</div> : null}
          <main
            ref={registerScroller}
            data-shell-scroller=""
            className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
          >
            <span
              aria-hidden="true"
              data-shell-scroll-origin=""
              className="pointer-events-none absolute left-0 top-0 h-px w-px"
            />
            {props.children}
          </main>
          {props.notice !== undefined ? <div data-shell-notice="">{props.notice}</div> : null}
          {pinnedSlot !== undefined && !conversationOpen ? (
            <div data-shell-pinned-slot="" className="shrink-0 pb-4">
              {pinnedSlot}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function ShellWide(props: Readonly<ShellWideProps>) {
  const conversationOpen = props.conversation !== undefined && props.conversationOpen !== false
  const sidePanel = useSyncExternalStore(
    subscribeToSidePanel,
    getSidePanelSnapshot,
    getServerSnapshot,
  )
  const modalOpen = conversationOpen && !sidePanel
  const conversationRef = useRef<HTMLDivElement>(null)
  const registerScroller = useShellScrollerRegistration()
  useModalFocusTrap(modalOpen, conversationRef)

  return (
    <div
      data-shell="wide"
      className="flex h-dvh min-h-dvh overflow-hidden bg-[var(--bg)] text-[var(--fg-1)]"
    >
      <ShellWideBackground
        props={props}
        conversationOpen={conversationOpen}
        modalOpen={modalOpen}
        registerScroller={registerScroller}
      />

      {conversationOpen && sidePanel ? (
        <aside
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
          className="z-modal fixed inset-0 overflow-y-auto bg-[var(--bg)] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)]"
        >
          {props.conversation}
        </div>
      ) : null}
    </div>
  )
}
