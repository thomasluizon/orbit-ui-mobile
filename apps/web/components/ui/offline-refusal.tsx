import { CalendarDays, Plus } from '@/components/ui/icons'

export function OfflineRefusal({ icon, title, reason, embedded = false }: Readonly<{
  icon: 'create' | 'calendar'
  title: string
  reason: string
  embedded?: boolean
}>) {
  const Icon = icon === 'create' ? Plus : CalendarDays
  return (
    <div className={`flex w-full max-w-[560px] flex-col gap-2 ${embedded ? '' : 'rounded-[var(--r-well)] bg-[var(--bg-well)] p-4'}`}>
      <div className="flex items-center gap-3">
        <Icon size={20} strokeWidth={1.8} color="var(--fg-3)" aria-hidden="true" className="shrink-0" />
        <p className="m-0 text-base font-medium leading-[1.4] text-[var(--fg-1)]">{title}</p>
      </div>
      <p className="m-0 text-pretty text-sm leading-[1.55] text-[var(--fg-2)]">{reason}</p>
    </div>
  )
}
