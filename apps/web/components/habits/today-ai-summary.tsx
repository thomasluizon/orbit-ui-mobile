'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { AI_SUMMARY_CLAMP_CHARS } from '@orbit/shared/utils'
import { Badge } from '@/components/ui/badge'
import { useSummary } from '@/hooks/use-summary'
import { useProfile } from '@/hooks/use-profile'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useShellStore } from '@/stores/shell-store'

interface TodayAISummaryProps {
  date: string
}

/**
 * Today screen "Astra" summary card on the kit InfoCard chrome: primary 0.10
 * tint, 0.28 inset ring, radius 18, sparkles + ASTRA eyebrow over the message.
 * Whole card is tappable; tap destination depends on state (pro opens Astra —
 * the docked copilot on desktop, the /chat page on narrower widths — free →
 * /upgrade, error → refetch).
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
  const isDesktop = useIsDesktop()
  const setAstraOpen = useShellStore((state) => state.setAstraOpen)
  const setAstraMaximized = useShellStore((state) => state.setAstraMaximized)

  const hasProAccess = profile?.hasProAccess ?? false
  const aiSummaryEnabled = profile?.aiSummaryEnabled ?? false
  const locale = profile?.language ?? uiLocale
  const [expanded, setExpanded] = useState(false)

  const { summary, isLoading, error, refetch } = useSummary({
    date,
    locale,
    hasProAccess,
    aiSummaryEnabled,
  })

  function openAstra() {
    if (isDesktop) {
      setAstraOpen(true)
      setAstraMaximized(true)
      return
    }
    router.push('/chat')
  }

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
        onClick: openAstra,
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
      onClick: openAstra,
      label: t('summary.askAstra'),
    }
  }

  const resolved = resolveBody()

  const isSummaryText =
    hasProAccess && aiSummaryEnabled && !isLoading && !error && !!summary
  const clampable = isSummaryText && summary.length > AI_SUMMARY_CLAMP_CHARS

  if (!resolved) return null

  const showDisclaimer = isSummaryText && (expanded || !clampable)

  return (
    <div className="group relative z-[1] w-full text-left" style={{ padding: '14px 20px 6px' }}>
      <div
        className="relative bg-[rgba(var(--primary-rgb),0.10)] shadow-[inset_0_0_0_1px_rgba(var(--primary-rgb),0.28)] group-hover:shadow-[inset_0_0_0_1px_rgba(var(--primary-rgb),0.45)] group-hover:-translate-y-px group-active:translate-y-0 group-active:scale-[0.99] transition-[box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)]"
        style={{
          borderRadius: 18,
          padding: '12px 16px',
        }}
      >
        <button
          type="button"
          onClick={resolved.onClick}
          aria-label={resolved.label}
          className="absolute inset-0 z-[1] appearance-none border-0 bg-transparent cursor-pointer"
          style={{ borderRadius: 18 }}
        />
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
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--primary-soft)',
            }}
          >
            Astra
          </span>
          <span title={t('aiDisclosure.isAiTooltip')}>
            <Badge tone="outline">{t('aiDisclosure.isAiLabel')}</Badge>
          </span>
          <ArrowUpRight
            size={16}
            strokeWidth={1.8}
            color="var(--fg-3)"
            aria-hidden="true"
            style={{ marginLeft: 'auto' }}
          />
        </div>
        <div
          className={clampable && !expanded ? 'line-clamp-3' : undefined}
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            lineHeight: 1.45,
            color: 'var(--fg-1)',
            textWrap: 'pretty',
            maxWidth: '68ch',
          }}
        >
          {resolved.text}
        </div>
        {clampable && (
          <button
            type="button"
            aria-label={expanded ? t('common.seeLess') : t('common.seeMore')}
            onClick={() => setExpanded((current) => !current)}
            className="relative z-[2] inline-flex items-center appearance-none border-0 bg-transparent p-0 cursor-pointer hover:text-[var(--primary)]"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--primary-soft)',
              minHeight: 44,
              marginTop: -7,
              marginBottom: -13,
            }}
          >
            {expanded ? t('common.seeLess') : t('common.seeMore')}
          </button>
        )}
        {showDisclaimer && (
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              lineHeight: 1.4,
              color: 'var(--fg-3)',
              marginTop: 6,
              maxWidth: '68ch',
            }}
          >
            {t('aiDisclosure.notMedicalAdvice')}
          </div>
        )}
      </div>
    </div>
  )
}
