import type { FabProps } from '@orbit/shared/contracts/actions'
import { FAB_SIZE } from '@orbit/shared/utils'
import type { ComponentProps } from 'react'

const CANVAS_RING = '0 0 0 6px var(--bg)'

export function Fab({ label, children, onClick, neutral = false, style, ...buttonProps }: Readonly<Omit<FabProps, 'onClick'> & ComponentProps<'button'> & { neutral?: boolean }>) {
  return (
    <button
      {...buttonProps}
      type="button"
      aria-label={label}
      onClick={onClick}
      data-fab={neutral ? 'neutral' : ''}
      className={`group relative appearance-none border-0 flex items-center justify-center ${neutral ? 'bg-[var(--bg-elev)] text-[var(--fg-1)]' : 'bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-pressed)]'} cursor-pointer transition-[background-color,scale,box-shadow] [transition-duration:var(--dur-hover-control),var(--dur-press),var(--dur-fast)] [transition-timing-function:var(--ease-standard),var(--ease-out),var(--ease-out)] motion-safe:active:scale-[0.96]`}
      style={{
        borderRadius: 999,
        boxShadow: neutral ? 'var(--sh-2)' : CANVAS_RING,
        height: FAB_SIZE,
        width: FAB_SIZE,
        ...style,
      }}
    >
      {neutral ? <span data-press-fill="" aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full bg-transparent shadow-[inset_0_0_0_1px_var(--hairline-strong)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] group-hover:bg-[var(--bg-hover-opaque)] group-active:bg-[var(--bg-hover-opaque)]" /> : null}
      <span className="relative flex items-center justify-center">{children}</span>
    </button>
  )
}
