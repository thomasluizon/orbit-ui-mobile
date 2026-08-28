import type { DateRowProps } from '@orbit/shared/contracts/forms'

export function DateRow({ label, value, note }: Readonly<DateRowProps>) {
  return (
    <div className="flex w-full flex-col gap-1 px-4 py-3">
      <span className="text-sm font-medium text-[var(--fg-2)]">{label}</span>
      <span className="font-mono text-base tabular-nums text-[var(--fg-1)]">{value}</span>
      {note ? <span className="text-sm text-[var(--fg-3)]">{note}</span> : null}
    </div>
  )
}
