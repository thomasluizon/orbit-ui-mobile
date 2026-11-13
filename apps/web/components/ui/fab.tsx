import type { FabProps } from '@orbit/shared/contracts/actions'
import { FAB_SIZE } from '@orbit/shared/theme'
import type { ComponentProps } from 'react'

const CANVAS_RING = '0 0 0 6px var(--bg)'

export function Fab({ label, children, onClick, style, ...buttonProps }: Readonly<Omit<FabProps, 'onClick'> & ComponentProps<'button'>>) {
  return (
    <button
      {...buttonProps}
      type="button"
      aria-label={label}
      onClick={onClick}
      data-fab=""
      className={`relative appearance-none border-0 flex items-center justify-center bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-hover)] cursor-pointer transition-[background-color,scale,box-shadow] [transition-duration:var(--dur-hover-control),var(--dur-press),var(--dur-fast)] [transition-timing-function:var(--ease-standard),var(--ease-out),var(--ease-out)] motion-safe:active:scale-[0.96]`}
      style={{
        borderRadius: 999,
        boxShadow: CANVAS_RING,
        height: FAB_SIZE,
        width: FAB_SIZE,
        ...style,
      }}
    >
      <span className="relative flex items-center justify-center">{children}</span>
    </button>
  )
}
