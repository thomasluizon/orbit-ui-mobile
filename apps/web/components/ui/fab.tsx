import type { FabProps } from '@orbit/shared/contracts/actions'
import type { ComponentProps } from 'react'

export function Fab({ label, children, onClick, neutral = false, style, ...buttonProps }: Readonly<Omit<FabProps, 'onClick'> & ComponentProps<'button'> & { neutral?: boolean }>) {
  return (
    <button
      {...buttonProps}
      type="button"
      aria-label={label}
      onClick={onClick}
      data-fab={neutral ? 'neutral' : ''}
      className={`group relative appearance-none border-0 flex items-center justify-center ${neutral ? 'bg-[var(--bg-elev)] text-[var(--fg-1)]' : 'bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-pressed)]'} cursor-pointer transition-[background-color,scale] [transition-duration:var(--dur-hover-control),150ms] [transition-timing-function:var(--ease-standard),var(--ease-out)] motion-safe:active:scale-[0.96]`}
      style={{
        borderRadius: 999,
        boxShadow: '0 0 0 6px var(--bg)',
        height: 60,
        width: 60,
        ...style,
      }}
    >
      {neutral ? <span data-press-fill="" aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full bg-transparent transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] group-hover:bg-[var(--bg-hover-opaque)] group-active:bg-[var(--bg-hover-opaque)]" /> : null}
      <span className="relative flex items-center justify-center">{children}</span>
    </button>
  )
}
