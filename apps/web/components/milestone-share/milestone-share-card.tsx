'use client'

import type { CSSProperties, Ref } from 'react'
import { useTranslations } from 'next-intl'
import { achievementEmoji } from '@orbit/shared/utils'
import { ShareCardQr } from '@/components/share/share-card-qr'
import { OrbitMark } from '@/components/ui/orbit-mark'

const rarityBadgeStyle: CSSProperties = {
  display: 'inline-block',
  marginTop: 8,
  padding: '4px 8px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--fg-1)',
  background: 'var(--bg-field)',
}

export type MilestoneShareVariant =
  | { kind: 'streak'; streak: number }
  | { kind: 'achievement'; achievementId: string; iconKey: string; rarity: string }

interface MilestoneShareCardProps {
  variant: MilestoneShareVariant
  referralUrl: string
  ref?: Ref<HTMLDivElement>
}

/** Flat token-native milestone card and the html-to-image capture target. */
export function MilestoneShareCard({
  variant,
  referralUrl,
  ref,
}: Readonly<MilestoneShareCardProps>) {
    const t = useTranslations()
    const shortLink = referralUrl.replace(/^https?:\/\//, '')

    const eyebrow =
      variant.kind === 'streak'
        ? t('milestoneShare.streakEyebrow')
        : t('milestoneShare.achievementEyebrow')

    return (
      <div
        ref={ref}
        data-testid="milestone-share-card"
        style={{
          width: 360,
          background: 'var(--bg)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
          fontFamily: 'var(--font-sans)',
          color: 'var(--fg-1)',
        }}
      >
        <div style={{ position: 'relative', padding: 24, background: 'var(--bg-card)' }}>
          <div className="flex items-center" style={{ gap: 8 }}>
            <OrbitMark size={24} accent />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
              Orbit
            </span>
          </div>

          <p style={{ marginTop: 16, fontSize: 12, fontWeight: 500, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {eyebrow}
          </p>

          {variant.kind === 'streak' ? (
            <>
              <p
                style={{ marginTop: 8, fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}
              >
                {variant.streak} 🔥
              </p>
              <p style={{ marginTop: 8, fontSize: 16, fontWeight: 500, color: 'var(--fg-2)' }}>
                {t('milestoneShare.streakTitle', { count: variant.streak })}
              </p>
            </>
          ) : (
            <div className="flex items-center" style={{ gap: 16, marginTop: 12 }}>
              <span aria-hidden="true" style={{ fontSize: 48, lineHeight: 1 }}>
                {achievementEmoji(variant.iconKey)}
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
                  {t(`gamification.achievements.${variant.achievementId}.name`)}
                </p>
                <span style={rarityBadgeStyle}>
                  {t(`milestoneShare.rarity.${variant.rarity}`)}
                </span>
              </div>
            </div>
          )}
        </div>

        {referralUrl && (
          <div
            className="flex items-center"
            style={{ gap: 12, padding: 16, borderTop: '1px solid var(--hairline)' }}
          >
            <div style={{ padding: 4, borderRadius: 12, background: '#ffffff', lineHeight: 0 }}>
              <ShareCardQr value={referralUrl} size={56} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-1)' }}>{t('shareCard.scanToJoin')}</p>
              <p
                className="truncate"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.02em', color: 'var(--fg-3)' }}
              >
                {shortLink}
              </p>
            </div>
          </div>
        )}
      </div>
    )
}
