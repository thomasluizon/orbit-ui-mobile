import { ChevronRight, ShieldAlert } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'

interface SlipAlertSectionProps {
  hasProAccess: boolean
  slipAlertEnabled: boolean
  onToggle: () => void
  t: ReturnType<typeof useTranslations>
}

export function SlipAlertSection({
  hasProAccess, slipAlertEnabled, onToggle, t,
}: Readonly<SlipAlertSectionProps>) {
  const router = useRouter()

  return (
    <div className="space-y-3 rounded-[14px] bg-[var(--bg-field)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
      {hasProAccess ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <ShieldAlert size={20} strokeWidth={1.8} className="text-[var(--fg-2)]" aria-hidden="true" />
              <span
                className="text-[var(--fg-1)]"
                style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500 }}
              >
                {t('habits.form.slipAlert')}
              </span>
            </div>
            <span className="text-[13px] text-[var(--fg-3)]" style={{ marginLeft: 30 }}>
              {t('habits.form.slipAlertDescription')}
            </span>
          </div>
          <Switch
            checked={slipAlertEnabled}
            onChange={onToggle}
            label={t('habits.form.slipAlert')}
          />
        </div>
      ) : (
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => router.push('/upgrade')}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <ShieldAlert size={20} strokeWidth={1.8} className="text-[var(--fg-3)]" aria-hidden="true" />
              <span
                className="text-[var(--fg-3)]"
                style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500 }}
              >
                {t('habits.form.slipAlert')}
              </span>
              <Badge >{t('common.proBadge')}</Badge>
            </div>
            <span className="text-[13px] text-[var(--fg-3)]" style={{ marginLeft: 30 }}>
              {t('habits.form.slipAlertDescription')}
            </span>
          </div>
          <ChevronRight size={20} strokeWidth={1.8} className="shrink-0 text-[var(--fg-3)]" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
