'use client'

import { useState, type ReactNode } from 'react'
import { Flame, Pencil, Target } from '@/components/ui/icons'
import { useLocale, useTranslations } from 'next-intl'
import { formatLocaleDate, plural } from '@orbit/shared/utils'
import type { ChallengeParticipant } from '@orbit/shared/types/challenge'
import { AppOverlay } from '@/components/ui/app-overlay'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SkeletonLine } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import {
  useChallengeDetail,
  useLeaveChallenge,
  useSetChallengeHabits,
} from '@/hooks/use-challenges'
import { ChallengeErrorState } from './challenge-error-state'
import { getChallengeErrorKey } from './challenge-errors'
import { HabitPicker } from './habit-picker'
import { ShareJoinCode } from './share-join-code'

interface ChallengeDetailProps {
  challengeId: string
  onLeft: () => void
}

function SectionHeader({
  children,
  action,
}: Readonly<{ children: ReactNode; action?: ReactNode }>) {
  return (
    <div className="flex items-center justify-between" style={{ margin: '16px 0 8px', gap: 8 }}>
      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 20,
          fontWeight: 500,
          color: 'var(--fg-1)',
        }}
      >
        {children}
      </h2>
      {action}
    </div>
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
      <ProgressBar progress={ratio} label={label} />
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

function StreakCounterView({ days, unitLabel }: Readonly<{ days: number; unitLabel: string }>) {
  return (
    <div className="flex flex-col items-center" style={{ gap: 2, padding: '8px 0' }}>
      <span data-testid="challenge-streak-count" className="t-num-xl">
        {days}
      </span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
        {unitLabel}
      </span>
    </div>
  )
}

function MembersList({ participants }: Readonly<{ participants: ChallengeParticipant[] }>) {
  return (
    <div data-testid="challenge-members" className="flex flex-col" style={panelStyle}>
      {participants.map((participant, index) => (
        <div
          key={participant.userId}
          className="flex items-center"
          style={{
            gap: 12,
            padding: '8px 0',
            marginTop: index === 0 ? 0 : 4,
          }}
        >
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

function ChallengeHeader({
  isCoop,
  typeLabel,
  completeLabel,
  title,
  endsOnText,
}: Readonly<{
  isCoop: boolean
  typeLabel: string
  completeLabel: string | null
  title: string
  endsOnText: string | null
}>) {
  return (
    <>
      <div className="flex items-center" style={{ gap: 8 }}>
        <Badge tone="soft" className="gap-1.5">
          {isCoop ? <Target size={11} strokeWidth={2} /> : <Flame size={11} strokeWidth={2} />}
          {typeLabel}
        </Badge>
        {completeLabel ? (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500, color: 'var(--status-done)' }}>
            {completeLabel}
          </span>
        ) : null}
      </div>

      <h1
        className="text-balance"
        style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 24, fontWeight: 500, color: 'var(--fg-1)' }}
      >
        {title}
      </h1>

      {endsOnText ? (
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
          {endsOnText}
        </p>
      ) : null}
    </>
  )
}

const panelStyle = {
  borderRadius: 18,
  padding: 16,
  background: 'var(--bg-card)',
  boxShadow: 'inset 0 0 0 1px var(--hairline)',
} as const

function SharedProgressSection({
  isCoop,
  current,
  target,
  heading,
  streakUnitLabel,
  editLabel,
  onEdit,
}: Readonly<{
  isCoop: boolean
  current: number
  target: number
  heading: string
  streakUnitLabel: string
  editLabel: string
  onEdit?: () => void
}>) {
  return (
    <div style={{ ...panelStyle, marginTop: 10 }}>
      <SectionHeader
        action={
          onEdit ? (
            <button
              type="button"
              aria-label={editLabel}
              onClick={onEdit}
              className="icon-btn"
            >
              <Pencil size={18} strokeWidth={1.8} />
            </button>
          ) : undefined
        }
      >
        {heading}
      </SectionHeader>
      {isCoop ? (
        <CoopProgressView current={current} target={target} label={heading} />
      ) : (
        <StreakCounterView days={current} unitLabel={streakUnitLabel} />
      )}
    </div>
  )
}

function LinkHabitsCard({
  title,
  body,
  cta,
  onLink,
}: Readonly<{ title: string; body: string; cta: string; onLink: () => void }>) {
  return (
    <div className="flex flex-col" style={{ ...panelStyle, gap: 8, marginTop: 6 }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, color: 'var(--fg-1)' }}>
        {title}
      </span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.45, color: 'var(--fg-3)' }}>
        {body}
      </span>
      <PillButton fullWidth onClick={onLink}>
        {cta}
      </PillButton>
    </div>
  )
}

function HabitsEditorSheet({
  open,
  onOpenChange,
  title,
  saveLabel,
  selectedIds,
  onToggle,
  onSave,
  saving,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  saveLabel: string
  selectedIds: string[]
  onToggle: (id: string) => void
  onSave: () => void
  saving: boolean
}>) {
  return (
    <AppOverlay open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex flex-col" style={{ gap: 16 }}>
        <HabitPicker selectedIds={selectedIds} onToggle={onToggle} />
        <PillButton
          fullWidth
          className="sm:mx-auto sm:max-w-[360px]"
          onClick={onSave}
          disabled={saving}
          busy={saving}
        >
          {saveLabel}
        </PillButton>
      </div>
    </AppOverlay>
  )
}

function ChallengeDetailSkeleton({ loadingLabel }: Readonly<{ loadingLabel: string }>) {
  return (
    <div
      role="status"
      aria-label={loadingLabel}
      className="flex flex-col"
      style={{ gap: 12, padding: '8px 20px 32px' }}
    >
      <SkeletonLine width="w-28" height="h-6" />
      <SkeletonLine width="w-3/4" height="h-7" />
      <div className="flex flex-col" style={{ gap: 8, marginTop: 8 }}>
        <SkeletonLine width="w-full" height="h-2" />
        <SkeletonLine width="w-1/4" height="h-4" />
      </div>
      <SkeletonLine width="w-1/3" height="h-5" className="mt-2" />
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="flex items-center" style={{ gap: 12, padding: '8px 0' }}>
          <div
            aria-hidden="true"
            className="skeleton-pulse shrink-0 rounded-full bg-[color-mix(in_srgb,var(--fg-1)_6%,transparent)]"
            style={{ width: 36, height: 36 }}
          />
          <SkeletonLine width="w-1/2" height="h-4" />
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
  const { data: challenge, isLoading, isError, refetch } = useChallengeDetail(challengeId)
  const leaveChallenge = useLeaveChallenge()
  const setChallengeHabits = useSetChallengeHabits()
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [habitsOpen, setHabitsOpen] = useState(false)
  const [editorHabitIds, setEditorHabitIds] = useState<string[]>([])

  if (isLoading) {
    return <ChallengeDetailSkeleton loadingLabel={t('common.loading')} />
  }

  if (isError) {
    return <ChallengeErrorState onRetry={() => void refetch()} />
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
    <>
      <div
        className="flex flex-col gap-2"
        style={{ padding: '4px 20px 32px' }}
      >
        <ChallengeHeader
          isCoop={isCoop}
          typeLabel={isCoop ? t('challenges.type.coopGoal') : t('challenges.type.streakTogether')}
          completeLabel={challenge.isComplete ? t('challenges.detail.complete') : null}
          title={challenge.title}
          endsOnText={
            isCoop && challenge.periodEndUtc
              ? t('challenges.detail.endsOn', { date: formatLocaleDate(challenge.periodEndUtc, locale) })
              : null
          }
        />

        <div className="grid gap-4 sm:grid-cols-2" style={{ marginTop: 4 }}>
          <div className="flex min-w-0 flex-col gap-2">
            <SharedProgressSection
              isCoop={isCoop}
              current={challenge.currentProgress}
              target={challenge.targetCount ?? 0}
              heading={isCoop ? t('challenges.detail.progressLabel') : t('challenges.detail.sharedStreak')}
              streakUnitLabel={plural(t('challenges.card.streakUnit'), challenge.currentProgress)}
              editLabel={t('challenges.detail.editHabits')}
              onEdit={hasLinkedHabits ? openHabitsEditor : undefined}
            />

            {hasLinkedHabits ? null : (
              <LinkHabitsCard
                title={t('challenges.detail.linkHabitsTitle')}
                body={t('challenges.detail.linkHabitsBody')}
                cta={t('challenges.detail.linkHabitsCta')}
                onLink={openHabitsEditor}
              />
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <SectionHeader>{t('challenges.detail.membersTitle')}</SectionHeader>
            <MembersList participants={challenge.participants} />

            <SectionHeader>{t('challenges.detail.shareTitle')}</SectionHeader>
            <ShareJoinCode title={challenge.title} joinCode={challenge.joinCode} />
          </div>
        </div>

        <PillButton
          variant="ghost"
          fullWidth
          onClick={() => setConfirmLeave(true)}
        >
          {t('challenges.detail.leave')}
        </PillButton>
      </div>

      <HabitsEditorSheet
        open={habitsOpen}
        onOpenChange={setHabitsOpen}
        title={t('challenges.detail.linkHabitsTitle')}
        saveLabel={t('common.save')}
        selectedIds={editorHabitIds}
        onToggle={toggleEditorHabit}
        onSave={() => void saveHabits()}
        saving={setChallengeHabits.isPending}
      />

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={t('challenges.detail.leaveConfirmTitle')}
        description={t('challenges.detail.leaveConfirmBody')}
        confirmLabel={t('challenges.detail.leave')}
        variant="danger"
        onConfirm={() => void leave()}
      />
    </>
  )
}
