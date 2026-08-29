'use client'

import type { ReactNode } from 'react'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { Shell412 } from './shell-412'
import { useShellScrollerRegistration } from './shell-scroller-context'
import { ShellWide } from './shell-wide'

interface FlowShellProps {
  nav?: false
  action?: ReactNode
  children: ReactNode
  mode?: 'card' | 'full'
  notice?: ReactNode
}

export function FlowShell({ action, children, mode = 'card', notice }: Readonly<FlowShellProps>) {
  const wide = useIsWideDesktop()
  const registerScroller = useShellScrollerRegistration()
  if (mode === 'full') {
    return (
      <div
        ref={registerScroller}
        data-shell="flow"
        data-shell-scroller=""
        data-flow-mode="full"
        className="h-dvh min-h-dvh w-full overflow-hidden"
      >
        {children}
      </div>
    )
  }

  const content = (
    <div
      data-shell="flow"
      data-flow-mode="card"
      data-nav={false}
      className="mx-auto flex min-h-full w-full max-w-[440px] flex-col px-4 py-8 md:justify-center md:px-0"
    >
      <div
        className="flex flex-col md:rounded-[20px] md:bg-[var(--bg-card)] md:p-8 md:shadow-[inset_0_0_0_1px_var(--hairline)]"
        style={{ gap: 24 }}
      >
        {children}
      </div>
    </div>
  )
  const pinnedAction = action ? (
    <div
      data-flow-action=""
      className="mx-auto w-full max-w-[408px] px-4 [&_button]:w-full md:px-0"
    >
      {action}
    </div>
  ) : undefined

  if (wide) {
    return (
      <ShellWide nav={false} action={pinnedAction} notice={notice}>
        {content}
      </ShellWide>
    )
  }

  return (
    <Shell412 nav={false} action={pinnedAction} notice={notice}>
      {content}
    </Shell412>
  )
}
