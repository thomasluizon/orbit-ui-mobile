import type { ReactNode } from 'react'

/**
 * Fills the rest of the shell scroller and centres its children between the shell header and the bottom chrome.
 * `centred={false}` keeps the same element and aligns the children under the header, so a block can leave the centre without a new mount.
 */
export function ShellCentredRegion({ className = '', centred = true, children }: Readonly<{ className?: string; centred?: boolean; children: ReactNode }>) {
  return <div data-shell-centred-region={centred ? '' : undefined} className={`flex flex-col ${centred ? 'flex-1 justify-center pt-[var(--shell-scroller-end)]' : ''} ${className}`}>{children}</div>
}
