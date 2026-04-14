'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Lock, BarChart3 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import DOMPurify from 'dompurify'
import { RETROSPECTIVE_PERIODS } from '@orbit/shared/utils/retrospective'
import { useProfile, useHasProAccess, useIsYearlyPro } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { useRetrospective, type RetrospectivePeriod } from '@/hooks/use-retrospective'
import { API } from '@orbit/shared/api'
import { getErrorMessage } from '@orbit/shared/utils'
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
    .replaceAll(/\*\*(.+?)\*\*/g, '<strong class="text-text-primary font-bold block mt-4 mb-1">$1</strong>')
    .replaceAll('\n', '<br>')

  return DOMPurify.sanitize(result, { ALLOWED_TAGS: ['strong', 'br'], ALLOWED_ATTR: ['class'] })
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
      const res = await fetch(API.subscription.portal, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Failed with status ${res.status}`)
      }
      const data = await res.json()
      if (data?.url) {
        globalThis.location.href = data.url
      }
    } catch (err: unknown) {
      setPortalError(getErrorMessage(err, t('auth.genericError')))
    }
  }, [isOnline, t])

  const isLoaded = !!profile

  return (
    <div className="pb-8">
      <header className="pt-8 pb-6 flex items-center gap-3">
            <button
              type="button"
              aria-label={t('common.backToProfile')}
              className="p-2 -ml-2 rounded-full hover:bg-surface transition-colors"
              onClick={() => goBackOrFallback('/profile')}
            >
              <ArrowLeft className="size-5 text-text-primary" />
            </button>
        <div className="flex items-center gap-2">
          <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
            {t('retrospective.title')}
          </h1>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded-full">
            {t('common.yearlyBadge')}
          </span>
        </div>
      </header>

      {/* Locked state for non-Pro users */}
      {isLoaded && !hasProAccess && (
        <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-6 text-center space-y-4">
          <div className="bg-primary/20 rounded-full size-16 flex items-center justify-center mx-auto">
            <Lock className="size-8 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-text-primary">{t('retrospective.locked')}</h2>
          <p className="text-sm text-text-secondary">{t('retrospective.lockedHint')}</p>
          <Link
            href="/upgrade"
            className="inline-block px-6 py-3 rounded-[var(--radius-xl)] bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-all duration-200 shadow-[var(--shadow-glow-sm)]"
          >
            {t('upgrade.subscribe')}
          </Link>
        </div>
      )}

      {/* Locked state for non-yearly Pro users */}
      {isLoaded && hasProAccess && !isYearlyPro && (
        <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-6 text-center space-y-4">
          <div className="bg-primary/20 rounded-full size-16 flex items-center justify-center mx-auto">
            <Lock className="size-8 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-text-primary">{t('retrospective.lockedYearly')}</h2>
          <p className="text-sm text-text-secondary">{t('retrospective.lockedYearlyHint')}</p>
          {profile?.isTrialActive ? (
            <Link
              href="/upgrade"
              className="inline-block px-6 py-3 rounded-[var(--radius-xl)] bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-all duration-200 shadow-[var(--shadow-glow-sm)]"
            >
              {t('upgrade.subscribe')}
            </Link>
          ) : (
            <button
              className="inline-block px-6 py-3 rounded-[var(--radius-xl)] bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-all duration-200 shadow-[var(--shadow-glow-sm)]"
              onClick={handleOpenPortal}
            >
              {t('retrospective.changePlan')}
            </button>
          )}
          {portalError && (
            <p className="text-xs text-red-400 text-center mt-2">{portalError}</p>
          )}
        </div>
      )}

      {/* Yearly Pro user content */}
      {isLoaded && isYearlyPro && (
        <>
          {/* Period selector */}
          <div className="flex flex-wrap gap-2 mb-6">
            {periods.map((p) => (
              <button
                key={p.key}
                className={`px-3.5 py-2 rounded-[var(--radius-xl)] text-sm font-semibold transition-all duration-200 ${
                  period === p.key
                    ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                    : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
                }`}
                onClick={() => selectPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Generate button */}
          <button
            className="w-full py-4 rounded-[var(--radius-xl)] bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all duration-200 active:scale-[0.98] shadow-[var(--shadow-glow-lg)] disabled:opacity-50 flex items-center justify-center gap-2 mb-6"
            disabled={isLoading || !isOnline}
            onClick={generate}
          >
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            {isLoading ? t('retrospective.generating') : t('retrospective.generate')}
          </button>
          {!isOnline && (
            <OfflineUnavailableState
              title={t('calendarSync.notConnected')}
              description={`${t('retrospective.generate')} / ${t('retrospective.changePlan')}`}
              compact
            />
          )}

          {/* Loading skeleton */}
          {isLoading && (
            <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-5 space-y-4">
              <div className="h-5 w-32 bg-surface-elevated rounded animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-full bg-surface-elevated rounded animate-pulse" />
                <div className="h-4 w-5/6 bg-surface-elevated rounded animate-pulse" />
                <div className="h-4 w-4/6 bg-surface-elevated rounded animate-pulse" />
              </div>
              <div className="h-5 w-40 bg-surface-elevated rounded animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-full bg-surface-elevated rounded animate-pulse" />
                <div className="h-4 w-3/4 bg-surface-elevated rounded animate-pulse" />
              </div>
              <div className="h-5 w-24 bg-surface-elevated rounded animate-pulse" />
              <div className="space-y-2">
                <div className="h-4 w-full bg-surface-elevated rounded animate-pulse" />
                <div className="h-4 w-2/3 bg-surface-elevated rounded animate-pulse" />
              </div>
            </div>
          )}

          {/* Result */}
          {!isLoading && retrospective && (
            <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-5">
              <div
                className="text-sm text-text-secondary leading-relaxed whitespace-pre-line [&_strong]:block [&_strong]:mt-4 [&_strong]:mb-1 [&_strong]:font-bold [&_strong]:text-text-primary [&_strong:first-child]:mt-0"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(retrospective) }}
              />
              {fromCache && (
                <p className="text-xs text-text-muted mt-4">{t('retrospective.cached')}</p>
              )}
            </div>
          )}

          {/* Error */}
          {!isLoading && error && (
            <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-5 text-center space-y-3">
              <p className="text-sm text-red-400">{t('retrospective.error')}</p>
              <button
                className="text-sm text-primary font-semibold hover:text-primary/80 transition-colors"
                onClick={generate}
              >
                {t('common.retry')}
              </button>
            </div>
          )}

          {/* Empty state (before first generation) */}
          {!isLoading && !retrospective && !error && (
            <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-6 text-center">
              <div className="bg-primary/10 rounded-full size-12 flex items-center justify-center mx-auto mb-3">
                <BarChart3 className="size-6 text-primary" />
              </div>
              <p className="text-sm text-text-secondary">{t('retrospective.empty')}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
