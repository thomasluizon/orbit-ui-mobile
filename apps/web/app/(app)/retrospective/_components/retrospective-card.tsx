'use client'

import { Orbit } from 'lucide-react'
import { useTranslations } from 'next-intl'
import DOMPurify from 'dompurify'

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

interface RetrospectiveCardProps {
  retrospective: string
  fromCache: boolean
  isLoading: boolean
  isOnline: boolean
  onRegenerate: () => void
}

export function RetrospectiveCard({
  retrospective,
  fromCache,
  isLoading,
  isOnline,
  onRegenerate,
}: Readonly<RetrospectiveCardProps>) {
  const t = useTranslations()

  return (
    <div className="px-5" style={{ padding: '16px 20px 24px' }}>
      <div
        className="rounded-[18px] bg-[var(--bg-card)] animate-scale-in"
        style={{
          padding: '16px 18px 18px',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ gap: 6, marginBottom: 10 }}
        >
          <div
            className="inline-flex items-center uppercase"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              fontWeight: 500,
              color: 'var(--fg-3)',
              letterSpacing: '0.06em',
              gap: 6,
            }}
          >
            <Orbit size={11} strokeWidth={1.7} color="var(--primary)" />
            {t('retrospective.astraEyebrow')}
          </div>
          <button
            type="button"
            className="chip"
            onClick={onRegenerate}
            disabled={isLoading || !isOnline}
          >
            {t('retrospective.regenerate')}
          </button>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--fg-2)',
          }}
          className="[&_strong]:block [&_strong]:mt-4 [&_strong]:font-medium [&_strong]:text-[var(--fg-1)] [&_strong:first-child]:mt-0"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(retrospective) }}
        />
        <p
          style={{
            marginTop: 16,
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            lineHeight: 1.4,
            color: 'var(--fg-3)',
          }}
        >
          {t('aiDisclosure.notMedicalAdvice')}
        </p>
        {fromCache && (
          <p
            style={{
              marginTop: 10,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.02em',
              color: 'var(--fg-3)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {t('retrospective.cached')}
          </p>
        )}
      </div>
    </div>
  )
}
