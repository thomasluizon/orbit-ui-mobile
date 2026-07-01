'use client'

import { useState, type ReactNode } from 'react'
import { Flame, Loader2, Target } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { formatLocaleDate } from '@orbit/shared/utils'
import type { ChallengeParticipant } from '@orbit/shared/types/challenge'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PillButton } from '@/components/ui/pill-button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import {
  useChallengeDetail,
  useLeaveChallenge,
  useSetChallengeHabits,
} from '@/hooks/use-challenges'
import { getChallengeErrorKey } from './challenge-errors'
import { HabitPicker } from './habit-picker'
import { ShareJoinCode } from './share-join-code'

interface ChallengeDetailProps {
  challengeId: string
  onLeft: () => void
}

function SectionHeader({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <h2
      style={{
        margin: '16px 0 8px',
        fontFamily: 'var(--font-sans)',
        fontSize: 18,
        fontWeight: 600,
        color: 'var(--fg-1)',
      }}
    >
      {children}
    </h2>
  )
}

function CoopProgressView({
  current,
  target,
  label,
}: Readonly<{ current: number; target: number; label: string }>) {
  const ratio = target > 0 ? Math.min(1, current / target) : 0
  return (
    <div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={target}
        style={{
          height: 12,
          borderRadius: 999,
          background: 'color-mix(in srgb, var(--fg-1) 8%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{ height: '100%', width: `${ratio * 100}%`, background: 'var(--primary)', borderRadius: 999 }}
        />
      </div>
      <p
        style={{
          margin: '8px 0 0',
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          color: 'var(--fg-2)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {current} / {target}
      </p>
    </div>
  )
}

function StreakCounterView({ days, label }: Readonly<{ days: number; label: string }>) {
  return (
    <div className="flex flex-col items-center" style={{ gap: 2, padding: '8px 0' }}>
      <span
        data-testid="challenge-streak-count"
        style={{ fontFamily: 'var(--font-sans)', fontSize: 48, fontWeight: 700, color: 'var(--fg-1)', lineHeight: 1 }}
      >
        {days}
      </span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>{label}</span>
    </div>
  )
}

function MembersList({ participants }: Readonly<{ participants: ChallengeParticipant[] }>) {
  return (
    <div data-testid="challenge-members" className="flex flex-col">
      {participants.map((participant) => (
        <div key={participant.userId} className="flex items-center" style={{ gap: 12, padding: '8px 0' }}>
          <UserAvatar name={participant.name} size={36} />
          <span
            className="truncate"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-1)' }}
          >
            {participant.name}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Challenge detail: type-appropriate shared viz (no per-person numbers), members, link-habits CTA,
 *  invite share, and leave. */
export function ChallengeDetail({ challengeId, onLeft }: Readonly<ChallengeDetailProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const { showError, showSuccess } = useAppToast()
  const { data: challenge, isLoading } = useChallengeDetail(challengeId)
  const leaveChallenge = useLeaveChallenge()
  const setChallengeHabits = useSetChallengeHabits()
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [habitsOpen, setHabitsOpen] = useState(false)
  const [editorHabitIds, setEditorHabitIds] = useState<string[]>([])

  if (isLoading) {
    return (
      <div className="flex justify-center" style={{ padding: 48, color: 'var(--fg-3)' }}>
        <Loader2 className="animate-spin" size={22} />
      </div>
    )
  }

  if (!challenge) {
    return (
      <p style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--font-sans)', color: 'var(--fg-3)' }}>
        {t('challenges.detail.notFound')}
      </p>
    )
  }

  const isCoop = challenge.type === 'CoopGoal'
  const hasLinkedHabits = challenge.yourLinkedHabitIds.length > 0

  function openHabitsEditor() {
    setEditorHabitIds(challenge?.yourLinkedHabitIds ?? [])
    setHabitsOpen(true)
  }

  function toggleEditorHabit(id: string) {
    setEditorHabitIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    )
  }

  async function saveHabits() {
    try {
      await setChallengeHabits.mutateAsync({ challengeId, habitIds: editorHabitIds })
      showSuccess(t('challenges.detail.habitsSaved'))
      setHabitsOpen(false)
    } catch (error: unknown) {
      showError(t(getChallengeErrorKey(error)))
    }
  }

  async function leave() {
    try {
      await leaveChallenge.mutateAsync(challengeId)
      showSuccess(t('challenges.detail.leaveSuccess'))
      onLeft()
    } catch (error: unknown) {
      showError(t(getChallengeErrorKey(error)))
    }
  }

  return (
    <div className="flex flex-col" style={{ padding: '4px 20px 32px', gap: 8 }}>
      <div className="flex items-center" style={{ gap: 8 }}>
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
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500, color: 'var(--status-done)' }}>
            {t('challenges.detail.complete')}
          </span>
        ) : null}
      </div>

      <h1 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 24, fontWeight: 700, color: 'var(--fg-1)' }}>
        {challenge.title}
      </h1>

      {isCoop && challenge.periodEndUtc ? (
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
          {t('challenges.detail.endsOn', { date: formatLocaleDate(challenge.periodEndUtc, locale) })}
        </p>
      ) : null}

      <div style={{ marginTop: 10 }}>
        <SectionHeader>
          {isCoop ? t('challenges.detail.progressLabel') : t('challenges.detail.sharedStreak')}
        </SectionHeader>
        {isCoop ? (
          <CoopProgressView
            current={challenge.currentProgress}
            target={challenge.targetCount ?? 0}
            label={t('challenges.detail.progressLabel')}
          />
        ) : (
          <StreakCounterView days={challenge.currentProgress} label={t('challenges.detail.sharedStreak')} />
        )}
      </div>

      {hasLinkedHabits ? (
        <PillButton variant="ghost" fullWidth onClick={openHabitsEditor}>
          {t('challenges.detail.editHabits')}
        </PillButton>
      ) : (
        <div
          className="flex flex-col"
          style={{
            gap: 8,
            marginTop: 6,
            padding: 16,
            borderRadius: 16,
            background: 'var(--bg-card)',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 600, color: 'var(--fg-1)' }}>
            {t('challenges.detail.linkHabitsTitle')}
          </span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.45, color: 'var(--fg-3)' }}>
            {t('challenges.detail.linkHabitsBody')}
          </span>
          <PillButton fullWidth onClick={openHabitsEditor}>
            {t('challenges.detail.linkHabitsCta')}
          </PillButton>
        </div>
      )}

      <SectionHeader>{t('challenges.detail.membersTitle')}</SectionHeader>
      <MembersList participants={challenge.participants} />

      <SectionHeader>{t('challenges.detail.shareTitle')}</SectionHeader>
      <ShareJoinCode title={challenge.title} joinCode={challenge.joinCode} />

      <PillButton variant="ghost" fullWidth onClick={() => setConfirmLeave(true)}>
        {t('challenges.detail.leave')}
      </PillButton>

      <AppOverlay open={habitsOpen} onOpenChange={setHabitsOpen} title={t('challenges.detail.linkHabitsTitle')}>
        <div className="flex flex-col" style={{ gap: 16 }}>
          <HabitPicker selectedIds={editorHabitIds} onToggle={toggleEditorHabit} />
          <PillButton
            fullWidth
            onClick={saveHabits}
            disabled={setChallengeHabits.isPending}
            busy={setChallengeHabits.isPending}
          >
            {t('common.save')}
          </PillButton>
        </div>
      </AppOverlay>

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={t('challenges.detail.leaveConfirmTitle')}
        description={t('challenges.detail.leaveConfirmBody')}
        confirmLabel={t('challenges.detail.leave')}
        variant="danger"
        onConfirm={leave}
      />
    </div>
  )
}
