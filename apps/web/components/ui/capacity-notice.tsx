import { Shield } from '@/components/ui/icons'

export function CapacityNotice({ message }: Readonly<{ message: string }>) {
  return (
    <aside
      className="flex items-start"
      style={{
        gap: 12,
        padding: 16,
        borderRadius: 16,
        background: 'var(--bg-well)',
        color: 'var(--fg-2)',
      }}
    >
      <Shield size={20} strokeWidth={1.5} aria-hidden="true" />
      <p style={{ fontSize: 14, lineHeight: 1.55 }}>{message}</p>
    </aside>
  )
}
