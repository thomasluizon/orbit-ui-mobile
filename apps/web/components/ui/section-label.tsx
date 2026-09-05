import type { SectionTitleProps } from '@orbit/shared/contracts/navigation'

export function SectionLabel({ children, eyebrow }: Readonly<SectionTitleProps>) {
  return (
    <div data-eyebrow={eyebrow !== undefined ? true : undefined} className="flex flex-col gap-2 px-4 pt-6 pb-3">
      {eyebrow !== undefined && <span className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-[var(--fg-3)]">{eyebrow}</span>}
      <h2 className="font-sans text-[20px] font-medium tracking-[-0.01em] text-[var(--fg-1)]">{children}</h2>
    </div>
  )
}
