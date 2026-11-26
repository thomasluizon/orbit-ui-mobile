import * as m from 'motion/react-m'
import type { useTranslations } from 'next-intl'
import { useReducedMotion } from 'motion/react'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { formatLoginCountdown } from '@orbit/shared/utils'
import { OtpInput } from '@/components/ui/otp-input'
import { PillButton } from '@/components/ui/pill-button'

/** The code field. A rejected code shakes it over the shared slow duration, and reduced motion keeps it still. */
export function LoginCodeField({ label, value, error, hint, disabled, expired, focusRequest, onChange, onBlur }: Readonly<{
  label: string; value: string; error: string | undefined; hint: string | undefined; disabled: boolean; expired: boolean
  focusRequest: number | undefined; onChange: (value: string) => void; onBlur: (() => void) | undefined
}>) {
  const reduced = useReducedMotion()
  const shake = Boolean(error) && !reduced
  return (
    <m.div animate={shake ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }} data-code-shake={shake ? '' : undefined}
      transition={{ duration: reduced ? 0 : motionDurations.slow / 1000, ease: motionEasings.standard }} data-mock={expired || undefined}>
      <OtpInput label={label} value={value} onChange={onChange} onBlur={onBlur} focusRequest={focusRequest} error={error} hint={hint} disabled={disabled} />
    </m.div>
  )
}

/** The resend control: a countdown while the window is closed, then one quiet action. */
export function LoginResend({ ready, countdown, disabled, loading, onResend, t }: Readonly<{
  ready: boolean; countdown: number; disabled: boolean; loading: boolean; onResend: () => void; t: ReturnType<typeof useTranslations>
}>) {
  if (!ready) return <p className="font-mono text-xs tabular-nums text-[var(--fg-3)]">{t('auth.resendIn', { time: formatLoginCountdown(countdown) })}</p>
  return <PillButton variant="ghost" size="sm" onClick={onResend} disabled={disabled} loading={loading}>{t('auth.resendCode')}</PillButton>
}
