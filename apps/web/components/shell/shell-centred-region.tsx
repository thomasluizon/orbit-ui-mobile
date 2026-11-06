import type { ReactNode } from 'react'

/** Fills the rest of the shell scroller and centres its children between the shell header and the bottom chrome. */
export function ShellCentredRegion({ className = '', children }: Readonly<{ className?: string; children: ReactNode }>) {
  return <div data-shell-centred-region="" className={`flex flex-1 flex-col justify-center pt-[var(--shell-scroller-end,0px)] ${className}`}>{children}</div>
}
