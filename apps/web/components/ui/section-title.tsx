import type { SectionTitleProps } from '@orbit/shared/contracts/navigation'

export function SectionTitle({ children }: Readonly<SectionTitleProps>) {
  return (
    <h2 className="m-0 px-4 pb-2 pt-6 text-xs font-medium uppercase tracking-wide text-[var(--fg-3)]">
      {children}
    </h2>
  )
}
