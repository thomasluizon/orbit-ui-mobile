'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { AI_SUMMARY_CLAMP_CHARS } from '@orbit/shared/utils'
import { useSummary } from '@/hooks/use-summary'
import { useProfile } from '@/hooks/use-profile'

interface TodayAISummaryProps {
  date: string
}

/**
 * Today screen "Astra" summary card on the kit InfoCard chrome: primary 0.10
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
  const [expanded, setExpanded] = useState(false)

  const { summary, insight, isLoading, error, refetch } = useSummary({
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

  const isSummaryText =
    hasProAccess && aiSummaryEnabled && !isLoading && !error && !!summary
  const clampable = isSummaryText && (summary?.length ?? 0) > AI_SUMMARY_CLAMP_CHARS

  if (!resolved) return null

  const showDisclaimer = isSummaryText && (expanded || !clampable)

  return (
    <button
      type="button"
      onClick={resolved.onClick}
      aria-label={resolved.label}
      className="group relative z-[1] w-full text-left appearance-none border-0 bg-transparent cursor-pointer"
      style={{ padding: '14px 20px 6px' }}
    >
      <div
        className="bg-[rgba(var(--primary-rgb),0.10)] shadow-[inset_0_0_0_1px_rgba(var(--primary-rgb),0.28)] group-hover:shadow-[inset_0_0_0_1px_rgba(var(--primary-rgb),0.45)] group-hover:-translate-y-px group-active:translate-y-0 group-active:scale-[0.99] transition-[box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)]"
        style={{
          borderRadius: 18,
          padding: '12px 16px',
        }}
      >
        <div className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
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
        {isSummaryText && insight ? (
          <div
            aria-label={`${t('summary.insightLabel')}: ${insight}`}
            style={{
              width: 'fit-content',
              maxWidth: '100%',
              borderRadius: 999,
              padding: '4px 11px',
              marginBottom: 8,
              backgroundColor: 'rgba(var(--primary-rgb),0.16)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--primary-rgb),0.32)',
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              fontWeight: 500,
              lineHeight: 1.35,
              color: 'var(--primary-soft)',
              textWrap: 'pretty',
            }}
          >
            {insight}
          </div>
        ) : null}
        <div
          className={clampable && !expanded ? 'line-clamp-3' : undefined}
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            lineHeight: 1.45,
            color: 'var(--fg-1)',
            textWrap: 'pretty',
          }}
        >
          {resolved.text}
        </div>
        {clampable && (
          <span
            role="button"
            tabIndex={0}
            aria-label={expanded ? t('common.seeLess') : t('common.seeMore')}
            onClick={(event) => {
              event.stopPropagation()
              setExpanded((current) => !current)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                setExpanded((current) => !current)
              }
            }}
            className="inline-block cursor-pointer hover:text-[var(--primary)]"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--primary-soft)',
              marginTop: 6,
            }}
          >
            {expanded ? t('common.seeLess') : t('common.seeMore')}
          </span>
        )}
        {showDisclaimer && (
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              lineHeight: 1.4,
              color: 'var(--fg-3)',
              marginTop: 6,
            }}
          >
            {t('aiDisclosure.notMedicalAdvice')}
          </div>
        )}
      </div>
    </button>
  )
}
