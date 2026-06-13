export const pillLinkClassName =
  'inline-flex items-center justify-center gap-[9px] rounded-full bg-[var(--primary)] px-[26px] py-[15px] text-[16px] font-medium text-[var(--fg-on-primary)] no-underline shadow-[var(--primary-glow)] transition-[background-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px hover:bg-[var(--primary-pressed)] hover:shadow-[var(--primary-glow-hover)] active:translate-y-0 active:scale-[0.98]'

export function LockedBlock({
  title,
  hint,
  children,
}: Readonly<{ title: string; hint: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-col items-center text-center" style={{ padding: '40px 24px', gap: 14 }}>
      <span className="t-h2">{title}</span>
      <span className="t-secondary" style={{ color: 'var(--fg-3)', maxWidth: 320 }}>
        {hint}
      </span>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  )
}
