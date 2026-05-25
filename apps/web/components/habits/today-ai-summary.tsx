'use client'

import { useRouter } from 'next/navigation'
import { Star } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useSummary } from '@/hooks/use-summary'
import { useProfile } from '@/hooks/use-profile'

interface TodayAISummaryProps {
  date: string
}

/**
 * Today screen "Astra" block: filled star + heading, vertical hairline rail,
 * one or two lines of message. No card chrome. Whole block is tappable; tap
 * destination depends on state (pro → /chat, free → /upgrade, error → refetch).
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

  return (
    <button
      type="button"
      onClick={resolved.onClick}
      aria-label={resolved.label}
      className="w-full text-left appearance-none border-0 bg-transparent cursor-pointer transition-[opacity] duration-150 hover:opacity-80"
      style={{
        padding: '14px 20px 16px',
      }}
    >
      <div className="flex items-center" style={{ gap: 12 }}>
        <Star
          size={20}
          strokeWidth={1.5}
          color="var(--fg-1)"
          fill="var(--fg-1)"
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
      </div>
      <div className="flex" style={{ gap: 12, marginTop: 8 }}>
        <div
          aria-hidden="true"
          style={{
            width: 20,
            display: 'flex',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 1,
              alignSelf: 'stretch',
              background: 'var(--hairline-strong)',
            }}
          />
        </div>
        <span
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            lineHeight: 1.45,
            color: 'var(--fg-2)',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {resolved.text}
        </span>
      </div>
    </button>
  )
}
