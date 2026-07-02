'use client'

import { Flame, Target, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { plural } from '@orbit/shared/utils'
import type { ChallengeListItem } from '@orbit/shared/types/challenge'
import { ProgressBar } from '@/components/ui/progress-bar'

interface ChallengeCardProps {
  challenge: ChallengeListItem
  onOpen: (id: string) => void
}

/** Compact challenge summary: type badge, member count, and a type-appropriate shared-progress view. */
export function ChallengeCard({ challenge, onOpen }: Readonly<ChallengeCardProps>) {
  const t = useTranslations()
  const isCoop = challenge.type === 'CoopGoal'
  const target = challenge.targetCount ?? 0
  const ratio = isCoop && target > 0 ? Math.min(1, challenge.currentProgress / target) : 0

  return (
    <button
      type="button"
      onClick={() => onOpen(challenge.id)}
      className="w-full cursor-pointer text-left bg-[var(--bg-card)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-[background-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:shadow-[inset_0_0_0_1px_var(--hairline-strong)] active:scale-[0.99] motion-reduce:transition-none"
      style={{
        display: 'block',
        border: 0,
        borderRadius: 18,
        padding: 16,
      }}
    >
      <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
        <span
          className="inline-flex items-center"
          style={{
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(var(--primary-rgb), 0.12)',
            color: 'var(--primary)',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {isCoop ? <Target size={13} strokeWidth={2} /> : <Flame size={13} strokeWidth={2} />}
          {isCoop ? t('challenges.type.coopGoal') : t('challenges.type.streakTogether')}
        </span>
        {challenge.isComplete ? (
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--status-done)',
            }}
          >
            {t('challenges.detail.complete')}
          </span>
        ) : null}
      </div>

      <p
        className="truncate"
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 17,
          fontWeight: 500,
          color: 'var(--fg-1)',
        }}
      >
        {challenge.title}
      </p>

      <div className="flex items-center" style={{ gap: 6, marginTop: 4, color: 'var(--fg-3)' }}>
        <Users size={14} strokeWidth={1.8} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13 }}>
          {plural(
            t('challenges.card.participants', { count: challenge.participantCount }),
            challenge.participantCount,
          )}
        </span>
      </div>

      {isCoop ? (
        <div style={{ marginTop: 12 }}>
          <ProgressBar progress={ratio} label={t('challenges.detail.progressLabel')} />
          <p
            style={{
              margin: '6px 0 0',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--fg-3)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {challenge.currentProgress} / {target}
          </p>
        </div>
      ) : (
        <div className="flex items-baseline" style={{ gap: 6, marginTop: 12 }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 24,
              fontWeight: 700,
              color: 'var(--fg-1)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {challenge.currentProgress}
          </span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
            {t('challenges.card.streakUnit')}
          </span>
        </div>
      )}

      {!challenge.hasLinkedHabits ? (
        <p
          style={{
            margin: '10px 0 0',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--primary-soft)',
          }}
        >
          {t('challenges.card.linkHabitsHint')}
        </p>
      ) : null}
    </button>
  )
}
