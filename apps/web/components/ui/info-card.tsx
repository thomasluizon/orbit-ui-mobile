import type { InfoCardProps } from '@orbit/shared/contracts/display'

/** A quiet one-tone informational surface. */
export function InfoCard({ icon, children }: Readonly<InfoCardProps>) {
  return (
    <div
      className="flex items-start rounded-[20px] bg-[var(--bg-elev)] p-6 text-[var(--fg-2)]"
      data-tone="quiet"
      style={{ gap: 16 }}
    >
      {icon ? <span className="shrink-0 text-[var(--fg-3)]">{icon}</span> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
