import { WifiOff } from '@/components/ui/icons'

export function OfflineRefusal({ title, reason }: Readonly<{ title: string; reason: string }>) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-[var(--r-well)] bg-[var(--bg-well)] p-4">
      <WifiOff size={20} strokeWidth={1.8} color="var(--fg-4)" aria-hidden="true" className="shrink-0" />
      <div className="min-w-0">
        <p className="m-0 text-base font-medium text-[var(--fg-1)]">{title}</p>
        <p className="m-0 text-sm leading-[1.5] text-[var(--fg-2)]">{reason}</p>
      </div>
    </div>
  )
}
