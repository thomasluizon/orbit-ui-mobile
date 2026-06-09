'use client'

import { useRouter } from 'next/navigation'
import { Orbit } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useSummary } from '@/hooks/use-summary'
import { useProfile } from '@/hooks/use-profile'

interface TodayAISummaryProps {
  date: string
}

/**
 * Today screen "Astra" block: full-height primary rail on the left, then
 * Orbit glyph + heading and one or two lines of message stacked on the
 * right. No card chrome. Whole block is tappable; tap destination depends on
 * state (pro → /chat, free → /upgrade, error → refetch).
 *
 * - Pro + enabled: shows the AI summary text
 * - Free: shows the upgrade prompt
 * - Pro + disabled: renders nothing
 */
export function TodayAISummary({ date }: Readonly<TodayAISummaryProps>) {
  const t = useTranslations()
  const router = useRouter()
  const uiLocale = useLocale()
  const { profile } = useProfile()

  const hasProAccess = profile?.hasProAccess ?? false
  const aiSummaryEnabled = profile?.aiSummaryEnabled ?? false
  const locale = profile?.language ?? uiLocale

  const { summary, isLoading, error, refetch } = useSummary({
    date,
    locale,
    hasProAccess,
    aiSummaryEnabled,
  })

  type Resolved = { text: string; onClick: () => void; label: string }

  function resolveBody(): Resolved | null {
    if (!hasProAccess) {
      return {
        text: t('summary.freePrompt'),
        onClick: () => router.push('/upgrade'),
        label: t('summary.upgrade'),
      }
    }
    if (!aiSummaryEnabled) return null
    if (isLoading) {
      return {
        text: t('summary.loading'),
        onClick: () => router.push('/chat'),
        label: t('summary.loading'),
      }
    }
    if (error) {
      return {
        text: t('summary.error'),
        onClick: () => {
          void refetch()
        },
        label: t('summary.retry'),
      }
    }
    if (!summary) return null
    return {
      text: summary,
      onClick: () => router.push('/chat'),
      label: t('summary.askAstra'),
    }
  }

  const resolved = resolveBody()
  if (!resolved) return null

  const showDisclaimer =
    hasProAccess && aiSummaryEnabled && !isLoading && !error && !!summary

  return (
    <button
      type="button"
      onClick={resolved.onClick}
      aria-label={resolved.label}
      className="w-full text-left appearance-none border-0 bg-transparent cursor-pointer transition-[opacity] duration-150 hover:opacity-80"
      style={{
        padding: '20px 20px 20px',
      }}
    >
      <div className="flex items-stretch" style={{ gap: 14 }}>
        <div
          aria-hidden="true"
          style={{
            width: 2,
            borderRadius: 1,
            background: 'var(--primary)',
            flexShrink: 0,
          }}
        />
        <div className="flex flex-col flex-1 min-w-0" style={{ gap: 8 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <Orbit
              size={20}
              strokeWidth={1.5}
              color="var(--fg-1)"
            />
            <span
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--fg-1)',
                letterSpacing: '-0.01em',
              }}
            >
              Astra
            </span>
            <span
              aria-label={t('aiDisclosure.isAiTooltip')}
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.06em',
                color: 'var(--fg-3)',
                border: '1px solid var(--hairline)',
                borderRadius: 4,
                padding: '1px 5px',
              }}
            >
              {t('aiDisclosure.isAiLabel')}
            </span>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 14,
              lineHeight: 1.45,
              color: 'var(--fg-2)',
            }}
          >
            {resolved.text}
          </span>
          {showDisclaimer && (
            <span
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 11,
                lineHeight: 1.4,
                color: 'var(--fg-3)',
                fontStyle: 'italic',
              }}
            >
              {t('aiDisclosure.notMedicalAdvice')}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
