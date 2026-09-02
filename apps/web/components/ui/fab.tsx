import type { FabProps } from '@orbit/shared/contracts/actions'

export function Fab({ label, children, onClick }: Readonly<FabProps>) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      data-fab=""
      className="appearance-none border-0 flex items-center justify-center bg-[var(--primary)] text-[var(--fg-on-primary)] cursor-pointer transition-[background-color,transform] [transition-duration:var(--dur-hover-control),150ms] ease-out active:scale-[0.96]"
      style={{
        borderRadius: 999,
        boxShadow: '0 0 0 6px var(--bg)',
        height: 60,
        width: 60,
      }}
    >
      {children}
    </button>
  )
}
