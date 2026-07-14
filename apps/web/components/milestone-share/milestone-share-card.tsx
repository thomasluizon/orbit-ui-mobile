'use client'

import { forwardRef, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { achievementEmoji } from '@orbit/shared/utils'
import { ShareCardQr } from '@/components/share/share-card-qr'

const rarityBadgeStyle: CSSProperties = {
  display: 'inline-block',
  marginTop: 8,
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--primary-soft)',
  background: 'rgba(var(--primary-rgb), 0.16)',
}

export type MilestoneShareVariant =
  | { kind: 'streak'; streak: number }
  | { kind: 'achievement'; achievementId: string; iconKey: string; rarity: string }

interface MilestoneShareCardProps {
  variant: MilestoneShareVariant
  referralUrl: string
}

/** Branded navy-violet milestone card and the html-to-image capture target. Streak variant shows the day count; achievement variant shows emoji, name, and rarity. */
export const MilestoneShareCard = forwardRef<HTMLDivElement, MilestoneShareCardProps>(
  function MilestoneShareCard({ variant, referralUrl }, ref) {
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
        <div style={{ position: 'relative', padding: '20px 22px 24px', background: 'var(--gradient-header)' }}>
          <div className="flex items-center" style={{ gap: 9 }}>
            <div
              aria-hidden="true"
              style={{
                width: 26,
                height: 26,
                backgroundImage: 'url(/logo-no-bg.png)',
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
              }}
            />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
              Orbit
            </span>
          </div>

          <p style={{ marginTop: 18, fontSize: 12, fontWeight: 500, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {eyebrow}
          </p>

          {variant.kind === 'streak' ? (
            <>
              <p
                style={{ marginTop: 6, fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}
              >
                {variant.streak} 🔥
              </p>
              <p style={{ marginTop: 8, fontSize: 16, fontWeight: 500, color: 'var(--fg-2)' }}>
                {t('milestoneShare.streakTitle', { count: variant.streak })}
              </p>
            </>
          ) : (
            <div className="flex items-center" style={{ gap: 14, marginTop: 10 }}>
              <span aria-hidden="true" style={{ fontSize: 52, lineHeight: 1 }}>
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
            style={{ gap: 12, padding: '14px 18px 18px', borderTop: '1px solid var(--hairline)' }}
          >
            <div style={{ padding: 6, borderRadius: 12, background: '#ffffff', lineHeight: 0 }}>
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
  },
)
