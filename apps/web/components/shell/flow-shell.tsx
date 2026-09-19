'use client'

import type { ReactNode } from 'react'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { Shell412 } from './shell-412'
import { ShellScrollerProvider } from './shell-scroller-context'
import { ShellWide } from './shell-wide'

type FlowShellMode = 'card' | 'detail' | 'document' | 'full' | 'onboarding'

interface FlowShellProps {
  nav?: false
  action?: ReactNode
  children: ReactNode
  header?: ReactNode
  mode?: FlowShellMode
  notice?: ReactNode
}

function contentClassName(mode: FlowShellMode, wide: boolean): string {
  if (mode === 'document') return 'min-h-full w-full'
  if (mode === 'detail') return 'mx-auto flex min-h-full w-full max-w-[740px] flex-col px-4 py-6'
  if (mode === 'onboarding') {
    return wide
      ? 'mx-auto flex min-h-full w-full max-w-[560px] flex-col'
      : 'mx-auto flex min-h-full w-full max-w-[440px] flex-col px-4 py-8'
  }
  return 'mx-auto flex min-h-full w-full max-w-[440px] flex-col px-4 py-8 md:justify-center md:px-0'
}

function contentFrameClassName(mode: FlowShellMode): string {
  if (mode === 'onboarding') return 'my-auto flex flex-col'
  if (mode === 'detail' || mode === 'document') return 'flex flex-col'
  return 'flex flex-col md:rounded-[20px] md:bg-[var(--bg-card)] md:p-8 md:shadow-[inset_0_0_0_1px_var(--hairline)]'
}

function flowModeName(mode: FlowShellMode): string {
  if (mode === 'document' || mode === 'onboarding') return mode
  return 'card'
}

export function FlowShell({ action, children, header, mode = 'card', notice }: Readonly<FlowShellProps>) {
  const wide = useIsWideDesktop()
  if (mode === 'full') {
    return (
      <ShellScrollerProvider>
        <div
          data-shell="flow"
          data-flow-mode="full"
          className="h-dvh min-h-dvh w-full overflow-hidden"
        >
          {children}
        </div>
      </ShellScrollerProvider>
    )
  }

  const onboarding = mode === 'onboarding'
  const content = (
    <div
      data-shell="flow"
      data-flow-mode={flowModeName(mode)}
      data-nav={false}
      className={contentClassName(mode, wide)}
    >
      <div
        className={contentFrameClassName(mode)}
        style={{ gap: 24 }}
      >
        {children}
      </div>
    </div>
  )
  const pinnedAction = action ? (
    <div
      data-flow-action=""
      className={`mx-auto flex w-full justify-end px-4 [&_button]:w-full md:px-0 md:[&_button]:w-auto md:[&>div]:items-end ${onboarding && wide ? 'max-w-[560px]' : 'max-w-[408px]'}`}
    >
      {action}
    </div>
  ) : undefined
  const shellHeader = onboarding && wide && header
    ? <div className="mx-auto w-full max-w-[560px]">{header}</div>
    : header

  if (wide) {
    return (
      <ShellWide nav={false} action={pinnedAction} header={shellHeader} notice={notice}>
        {content}
      </ShellWide>
    )
  }

  return (
    <Shell412 nav={false} action={pinnedAction} header={header} notice={notice}>
      {content}
    </Shell412>
  )
}
