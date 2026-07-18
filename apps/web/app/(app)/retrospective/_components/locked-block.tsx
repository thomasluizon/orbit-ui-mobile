import { Lock } from '@/components/ui/icons'

export function LockedBlock({
  title,
  hint,
  children,
}: Readonly<{ title: string; hint: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-col items-center text-center" style={{ padding: '40px 24px', gap: 16 }}>
      <span
        aria-hidden="true"
        className="flex items-center justify-center rounded-full"
        style={{ width: 56, height: 56, background: 'var(--bg-field)' }}
      >
        <Lock size={28} strokeWidth={1.4} className="text-[var(--fg-3)]" />
      </span>
      <span className="t-h2">{title}</span>
      <span className="t-secondary" style={{ color: 'var(--fg-3)', maxWidth: 320 }}>
        {hint}
      </span>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  )
}
