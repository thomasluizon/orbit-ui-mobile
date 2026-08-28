'use client'

import { useRef } from 'react'
import type { Shell412Props } from '@orbit/shared/contracts/shell'
import { useShellScrollerRegistration } from './shell-scroller-context'
import { useModalFocusTrap } from './use-modal-focus-trap'

function isConversationOpen(props: Shell412Props): boolean {
  return props.conversation !== undefined && props.conversationOpen !== false
}

export function Shell412(props: Readonly<Shell412Props>) {
  const navigationEnabled = props.nav !== false
  const conversationOpen = isConversationOpen(props)
  const conversationRef = useRef<HTMLDivElement>(null)
  const registerScroller = useShellScrollerRegistration()
  useModalFocusTrap(conversationOpen, conversationRef)

  const pinnedSlot = navigationEnabled ? props.composer : props.action
  const hasBottomChrome = navigationEnabled || props.notice !== undefined || pinnedSlot !== undefined

  return (
    <div
      data-shell="412"
      className="relative h-dvh min-h-dvh overflow-hidden bg-[var(--bg)] text-[var(--fg-1)]"
    >
      <div
        data-shell-background=""
        inert={conversationOpen || undefined}
        aria-hidden={conversationOpen || undefined}
        className="flex h-full min-h-0 flex-col"
      >
        {props.header !== undefined ? <div data-shell-header="">{props.header}</div> : null}
        <main
          ref={registerScroller}
          data-shell-scroller=""
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        >
          {props.children}
        </main>

        {hasBottomChrome ? (
          <div
            data-shell-bottom=""
            className="z-sticky relative shrink-0 bg-[var(--bg)] shadow-[inset_0_1px_0_var(--hairline)]"
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            {props.notice !== undefined ? <div data-shell-notice="">{props.notice}</div> : null}
            <div className="relative">
              {pinnedSlot !== undefined ? (
                <div data-shell-pinned-slot="">{pinnedSlot}</div>
              ) : null}
              {navigationEnabled ? <div data-shell-tab-bar="">{props.tabBar}</div> : null}
              {props.fab !== undefined ? (
                <div
                  data-shell-fab=""
                  className="absolute right-4"
                  style={{ bottom: 'calc(100% + 16px)' }}
                >
                  {props.fab}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {props.sheets}
      </div>

      {conversationOpen ? (
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
