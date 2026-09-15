'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { getErrorSurface, getRetryCountdown } from '@orbit/shared/utils'
import { PillButton } from '@/components/ui/pill-button'

export function FailureScreen({ error, retry, titleId }: Readonly<{ error: unknown; titleId?: string; retry: () => void | Promise<void> }>) {
  const t = useTranslations()
  const surface = getErrorSurface(error)
  const requestId = surface.requestId
  const retryAt = surface.retryAt === null ? null : Number(surface.retryAt)
  const [now, setNow] = useState(() => Date.now())
  const [retrying, startRetry] = useTransition()
  useEffect(() => {
    if (retryAt === null) return
    const update = () => setNow(Date.now())
    const interval = setInterval(update, 250)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', update)
    }
  }, [retryAt])
  const countdown = retryAt === null ? null : getRetryCountdown(retryAt, now)
  const waiting = countdown !== null && countdown.seconds > 0
  const handleRetry = () => {
    if (retryAt !== null && getRetryCountdown(retryAt, Date.now()).seconds > 0) return
    startRetry(async () => { await retry() })
  }
  return (
    <section className="error-surface" data-state={countdown ? 'throttle' : 'failure'} aria-busy={retrying || undefined}>
      <h1 id={titleId} className="error-surface-title">{t(countdown ? 'errorScreen.throttleTitle' : 'errorScreen.title')}</h1>
      <p className="error-surface-body">{t(countdown ? 'errorScreen.throttleBody' : 'errorScreen.body')}</p>
      {countdown ? <p role="timer" className="font-mono text-[20px] leading-[1.4] tabular-nums">{countdown.label}</p> : null}
      <div className="error-surface-action">
        {/* eslint-disable-next-line local/max-button-words -- ORB-68 owns this existing label. */}
        <PillButton variant={waiting ? 'ghost' : 'primary'} disabled={waiting} loading={retrying}
          onClick={handleRetry}>{t('errorScreen.retry')}</PillButton>
      </div>
      {!countdown && requestId ? <p className="font-mono text-[12px] leading-[1.5] text-[var(--fg-3)] break-all">{t('errorScreen.reference', { requestId })}</p> : null}
    </section>
  )
}
