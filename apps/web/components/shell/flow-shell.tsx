import type { ReactNode } from 'react'

interface FlowShellProps {
  nav: false
  children: ReactNode
  action?: ReactNode
}

export function FlowShell({ children, action }: Readonly<FlowShellProps>) {
  return (
    <div
      data-shell="flow"
      data-nav={false}
      className="grid min-h-dvh grid-rows-[minmax(0,1fr)_auto] bg-[var(--bg)] text-[var(--fg-1)]"
    >
      <main className="min-h-0 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col px-4 py-8 md:justify-center md:px-0">
          <div
            className="flex flex-col md:rounded-[20px] md:bg-[var(--bg-card)] md:p-8 md:shadow-[inset_0_0_0_1px_var(--hairline)]"
            style={{ gap: 24 }}
          >
            {children}
          </div>
        </div>
      </main>
      {action ? (
        <footer
          data-flow-action=""
          className="bg-[var(--bg)] px-4 pt-4 [&>div]:mx-auto [&>div]:w-full [&>div]:max-w-[408px] [&_button]:w-full"
          style={{ paddingBottom: 'max(16px, var(--safe-bottom))' }}
        >
          <div>{action}</div>
        </footer>
      ) : null}
    </div>
  )
}
