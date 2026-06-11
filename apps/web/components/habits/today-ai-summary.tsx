'use client'

import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useSummary } from '@/hooks/use-summary'
import { useProfile } from '@/hooks/use-profile'

interface TodayAISummaryProps {
  date: string
}

/**
 * Today screen "Astra" summary card on the kit InfoCard chrome: primary 0.08
 * tint, 0.28 inset ring, radius 18, sparkles + ASTRA eyebrow over the message.
 * Whole card is tappable; tap destination depends on state (pro → /chat,
 * free → /upgrade, error → refetch).
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
      className="relative z-[1] w-full text-left appearance-none border-0 bg-transparent cursor-pointer transition-[opacity] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:opacity-90"
      style={{ padding: '14px 20px 6px' }}
    >
      <div
        style={{
          borderRadius: 18,
          padding: '16px 18px',
          background: 'rgba(var(--primary-rgb), 0.08)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.28)',
        }}
      >
        <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
          <Sparkles
            size={16}
            strokeWidth={1.9}
            color="var(--primary-soft)"
            aria-hidden="true"
          />
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--primary-soft)',
            }}
          >
            Astra
          </span>
          <span
            aria-label={t('aiDisclosure.isAiTooltip')}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.06em',
              color: 'var(--fg-3)',
              boxShadow: 'inset 0 0 0 1px var(--hairline)',
              borderRadius: 999,
              padding: '1px 7px',
            }}
          >
            {t('aiDisclosure.isAiLabel')}
          </span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            lineHeight: 1.5,
            color: 'var(--fg-1)',
            textWrap: 'pretty',
          }}
        >
          {resolved.text}
        </div>
        {showDisclaimer && (
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              lineHeight: 1.4,
              color: 'var(--fg-3)',
              fontStyle: 'italic',
              marginTop: 8,
            }}
          >
            {t('aiDisclosure.notMedicalAdvice')}
          </div>
        )}
      </div>
    </button>
  )
}
