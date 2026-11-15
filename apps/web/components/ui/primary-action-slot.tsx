import type { ReactNode } from 'react'

/**
 * The slot of the one filled action of a flow step or of a state surface. In the compact shell the action takes the full width.
 * At 1024 and above it hugs its label, at most 360 wide, in the centre.
 */
export function PrimaryActionSlot({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div data-primary-action-slot="" className="flex w-full justify-center [&>a]:w-full [&>button]:w-full lg:[&>a]:w-auto lg:[&>a]:max-w-[360px] lg:[&>button]:w-auto lg:[&>button]:max-w-[360px]">
      {children}
    </div>
  )
}
