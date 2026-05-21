'use client'

import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useSummary } from '@/hooks/use-summary'
import { useProfile } from '@/hooks/use-profile'
import { PullQuote } from '@/components/chat/pull-quote'

interface TodayAISummaryProps {
  date: string
}

/** AI Summary block on Today screen.
 *  - Pro + enabled → renders Astra-attributed PullQuote with summary + "Ask Astra" link
 *  - Free → renders upgrade prompt PullQuote
 *  - Pro + disabled → renders nothing (matches HabitSummaryCard behavior). */
export function TodayAISummary({ date }: Readonly<TodayAISummaryProps>) {
  const t = useTranslations()
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

  // Free user: upgrade prompt
  if (!hasProAccess) {
    return (
      <div
        style={{
          padding: '14px 20px 16px',
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        <PullQuote eyebrow={<AstraEyebrow time="" hideTime />} italic paddingX={0} paddingY={0}>
          {t('summary.freePrompt')}
          <div style={{ marginTop: 10 }}>
            <Link
              href="/upgrade"
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--fg-1)',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                textDecorationThickness: 1,
                textDecorationColor: 'var(--hairline-strong)',
                fontStyle: 'normal',
              }}
            >
              {t('summary.upgrade')}
            </Link>
          </div>
        </PullQuote>
      </div>
    )
  }

  // Pro user, summary disabled — nothing rendered
  if (!aiSummaryEnabled) return null

  // Pro user, loading
  if (isLoading) {
    return (
      <div
        style={{
          padding: '14px 20px 16px',
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        <PullQuote eyebrow={<AstraEyebrow time="" hideTime />} italic paddingX={0} paddingY={0}>
          {t('summary.loading')}
        </PullQuote>
      </div>
    )
  }

  // Pro user, error
  if (error) {
    return (
      <div
        style={{
          padding: '14px 20px 16px',
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        <PullQuote eyebrow={<AstraEyebrow time="" hideTime />} italic paddingX={0} paddingY={0}>
          {t('summary.error')}
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={() => refetch()}
              className="appearance-none border-0 bg-transparent cursor-pointer"
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--fg-1)',
                padding: 0,
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                textDecorationThickness: 1,
                textDecorationColor: 'var(--hairline-strong)',
                fontStyle: 'normal',
              }}
            >
              {t('summary.retry')}
            </button>
          </div>
        </PullQuote>
      </div>
    )
  }

  // Pro user, summary present
  if (summary) {
    return (
      <div
        style={{
          padding: '14px 20px 16px',
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        <PullQuote eyebrow={<AstraEyebrow time={summaryHour()} />} italic paddingX={0} paddingY={0}>
          {summary}
          <div style={{ marginTop: 10 }}>
            <Link
              href="/chat"
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--fg-1)',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                textDecorationThickness: 1,
                textDecorationColor: 'var(--hairline-strong)',
                fontStyle: 'normal',
              }}
            >
              {t('summary.askAstra')}
            </Link>
          </div>
        </PullQuote>
      </div>
    )
  }

  return null
}

function AstraEyebrow({ time, hideTime = false }: Readonly<{ time: string; hideTime?: boolean }>) {
  return (
    <>
      <Sparkles size={11} strokeWidth={1.7} color="var(--primary)" />
      {hideTime ? 'ASTRA' : `ASTRA · ${time}`}
    </>
  )
}

function summaryHour(): string {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
