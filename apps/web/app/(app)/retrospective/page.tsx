'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Orbit } from 'lucide-react'
import { useTranslations } from 'next-intl'
import DOMPurify from 'dompurify'
import { RETROSPECTIVE_PERIODS } from '@orbit/shared/utils/retrospective'
import { useProfile, useHasProAccess, useIsYearlyPro } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { useRetrospective, type RetrospectivePeriod } from '@/hooks/use-retrospective'
import { getErrorMessage } from '@orbit/shared/utils'
import { openCustomerPortal } from '@/app/actions/subscription'
import { AppBar } from '@/components/ui/app-bar'
import { Chip } from '@/components/ui/chip'
import { PullQuote } from '@/components/chat/pull-quote'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderMarkdown(text: string): string {
  const result = escapeHtml(text)
    .replaceAll(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replaceAll('\n', '<br>')

  return DOMPurify.sanitize(result, { ALLOWED_TAGS: ['strong', 'br'], ALLOWED_ATTR: [] })
}

export default function RetrospectivePage() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile } = useProfile()
  const { isOnline } = useOffline()
  const hasProAccess = useHasProAccess()
  const isYearlyPro = useIsYearlyPro()
  const {
    retrospective,
    setRetrospective,
    isLoading,
    error,
    setError,
    fromCache,
    period,
    setPeriod,
    generate,
  } = useRetrospective()

  const periods: { key: RetrospectivePeriod; label: string }[] = RETROSPECTIVE_PERIODS.map(
    (key) => ({
      key,
      label: t(`retrospective.periods.${key}`),
    }),
  )

  const [portalError, setPortalError] = useState('')

  useEffect(() => {
    if (!profile) return
    if (!hasProAccess || !isYearlyPro) {
      router.replace('/upgrade')
    }
  }, [hasProAccess, isYearlyPro, profile, router])

  function selectPeriod(key: RetrospectivePeriod) {
    setPeriod(key)
    setRetrospective(null)
    setError(null)
  }

  const handleOpenPortal = useCallback(async () => {
    if (!isOnline) {
      setPortalError(t('calendarSync.notConnected'))
      return
    }

    setPortalError('')
    try {
      const data = await openCustomerPortal()
      if (data?.url) {
        globalThis.location.href = data.url
      }
    } catch (err: unknown) {
      setPortalError(getErrorMessage(err, t('auth.genericError')))
    }
  }, [isOnline, t])

  const isLoaded = !!profile

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('retrospective.title')}
      />

      {isLoaded && !hasProAccess && (
        <div className="flex flex-col items-center text-center" style={{ padding: '40px 24px', gap: 14 }}>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--fg-1)',
            }}
          >
            {t('retrospective.locked')}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontStyle: 'italic',
              color: 'var(--fg-3)',
              lineHeight: 1.55,
            }}
          >
            {t('retrospective.lockedHint')}
          </span>
          <Link
            href="/upgrade"
            style={{
              marginTop: 8,
              padding: '10px 16px',
              borderRadius: 8,
              background: 'var(--primary)',
              color: 'var(--fg-on-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {t('upgrade.subscribe')}
          </Link>
        </div>
      )}

      {isLoaded && hasProAccess && !isYearlyPro && (
        <div className="flex flex-col items-center text-center" style={{ padding: '40px 24px', gap: 14 }}>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--fg-1)',
            }}
          >
            {t('retrospective.lockedYearly')}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontStyle: 'italic',
              color: 'var(--fg-3)',
              lineHeight: 1.55,
            }}
          >
            {t('retrospective.lockedYearlyHint')}
          </span>
          {profile?.isTrialActive ? (
            <Link
              href="/upgrade"
              style={{
                marginTop: 8,
                padding: '10px 16px',
                borderRadius: 8,
                background: 'var(--primary)',
                color: 'var(--fg-on-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {t('upgrade.subscribe')}
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleOpenPortal}
              className="appearance-none border-0 cursor-pointer"
              style={{
                marginTop: 8,
                padding: '10px 16px',
                borderRadius: 8,
                background: 'var(--primary)',
                color: 'var(--fg-on-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {t('retrospective.changePlan')}
            </button>
          )}
          {portalError && (
            <p style={{ fontSize: 12, color: 'var(--status-overdue)', fontFamily: 'var(--font-sans)' }}>
              {portalError}
            </p>
          )}
        </div>
      )}

      {isLoaded && isYearlyPro && (
        <>
          <div
            className="flex items-center"
            style={{
              gap: 6,
              padding: '10px 20px 14px',
              borderBottom: '1px solid var(--hairline)',
              overflowX: 'auto',
            }}
          >
            {periods.map((p) => (
              <Chip
                key={p.key}
                active={period === p.key}
                onClick={() => selectPeriod(p.key)}
                ariaLabel={p.label}
              >
                {p.label}
              </Chip>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {isLoading && (
              <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14,
                    fontStyle: 'italic',
                    color: 'var(--fg-3)',
                    textAlign: 'center',
                  }}
                >
                  {t('retrospective.generating')}
                </span>
                <div style={{ width: '60%', height: 7, background: 'var(--bg-sunk)', borderRadius: 4 }} />
                <div style={{ width: '80%', height: 7, background: 'var(--bg-sunk)', borderRadius: 4 }} />
                <div style={{ width: '40%', height: 7, background: 'var(--bg-sunk)', borderRadius: 4 }} />
              </div>
            )}

            {!isLoading && retrospective && (
              <div style={{ padding: '14px 0' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    fontWeight: 500,
                    color: 'var(--fg-3)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    padding: '0 20px 6px 22px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Orbit size={11} strokeWidth={1.7} color="var(--primary)" />
                  {t('retrospective.astraEyebrow')}
                </div>
                <div
                  className="relative"
                  style={{
                    padding: '0 20px 24px 22px',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="absolute"
                    style={{
                      left: 8,
                      top: 0,
                      bottom: 12,
                      width: 2,
                      background: 'var(--primary)',
                      borderRadius: 1,
                    }}
                  />
                  <div
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 15,
                      lineHeight: 1.6,
                      color: 'var(--fg-2)',
                    }}
                    className="[&_strong]:block [&_strong]:mt-4 [&_strong]:font-semibold [&_strong]:text-[var(--fg-1)] [&_strong:first-child]:mt-0"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(retrospective) }}
                  />
                  <p
                    style={{
                      marginTop: 16,
                      fontFamily: 'var(--font-sans)',
                      fontSize: 11,
                      lineHeight: 1.4,
                      fontStyle: 'italic',
                      color: 'var(--fg-3)',
                    }}
                  >
                    {t('aiDisclosure.notMedicalAdvice')}
                  </p>
                  {fromCache && (
                    <p
                      style={{
                        marginTop: 16,
                        fontFamily: 'var(--font-sans)',
                        fontSize: 12,
                        fontStyle: 'italic',
                        color: 'var(--fg-4)',
                      }}
                    >
                      {t('retrospective.cached')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {!isLoading && error && (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--status-overdue)' }}>
                  {t('retrospective.error')}
                </p>
                <button
                  type="button"
                  onClick={generate}
                  className="appearance-none border-0 bg-transparent cursor-pointer"
                  style={{
                    marginTop: 8,
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--fg-1)',
                    textDecoration: 'underline',
                    textUnderlineOffset: 3,
                    textDecorationColor: 'var(--hairline-strong)',
                  }}
                >
                  {t('common.retry')}
                </button>
              </div>
            )}

            {!isLoading && !retrospective && !error && (
              <div style={{ padding: '20px 0 0' }}>
                <PullQuote
                  italic
                  eyebrow={
                    <>
                      <Orbit size={11} strokeWidth={1.7} color="var(--primary)" />
                      {t('retrospective.astraEyebrow')}
                    </>
                  }
                >
                  {t('retrospective.empty')}
                </PullQuote>
                {!isOnline && (
                  <div style={{ padding: '8px 20px 0' }}>
                    <OfflineUnavailableState
                      title={t('calendarSync.notConnected')}
                      description={`${t('retrospective.generate')} / ${t('retrospective.changePlan')}`}
                      compact
                    />
                  </div>
                )}
                <div style={{ padding: '14px 20px 24px' }}>
                  <button
                    type="button"
                    disabled={isLoading || !isOnline}
                    onClick={generate}
                    className="appearance-none border-0 cursor-pointer disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 w-full"
                    style={{
                      height: 44,
                      borderRadius: 8,
                      background: 'var(--primary)',
                      color: 'var(--fg-on-primary)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 14,
                      fontWeight: 600,
                      opacity: !isOnline ? 0.5 : 1,
                    }}
                  >
                    <Orbit size={14} strokeWidth={1.7} />
                    {t('retrospective.generate')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
