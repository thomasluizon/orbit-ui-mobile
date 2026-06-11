'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArchiveX,
  CheckCircle2,
  ChevronRight,
  PencilLine,
  Plus,
  RotateCw,
  Orbit,
  Trash2,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { EditGoalModal } from './edit-goal-modal'
import { GoalMetricsPanel } from './goal-metrics-panel'
import {
  GoalActionRow,
  GoalLinkedHabitsSection,
  GoalProgressHistorySection,
  GoalProgressForm,
} from './goal-detail-sections'
import {
  formatLocaleDateTime,
  getFriendlyErrorMessage,
  translateErrorKey,
  validateGoalProgressInput,
} from '@orbit/shared/utils'
import { isStreakGoal } from '@orbit/shared/utils/goal-form'
import { useAppToast } from '@/hooks/use-app-toast'
import {
  useGoals,
  useGoalDetail,
  useUpdateGoalProgress,
  useUpdateGoalStatus,
  useDeleteGoal,
} from '@/hooks/use-goals'

interface GoalDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goalId: string
}

type ProgressDismissTarget = 'drawer' | 'form'

const RING_SIZE = 180
const RING_RADIUS = 70
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface GoalProgressRingProps {
  progressPercentage: number
  percentLabel: string
  progressOfLabel: string
  color: string
}

/** MetaDetalhe progress ring: 12px stroke, round caps, dashoffset animated 280ms. */
function GoalProgressRing({
  progressPercentage,
  percentLabel,
  progressOfLabel,
  color,
}: Readonly<GoalProgressRingProps>) {
  const clamped = Math.min(100, Math.max(0, progressPercentage))
  const dashOffset = RING_CIRCUMFERENCE * (1 - clamped / 100)

  return (
    <div className="flex justify-center" style={{ paddingBottom: 4 }}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-label={percentLabel}
        className="relative flex items-center justify-center"
        style={{ width: RING_SIZE, height: RING_SIZE }}
      >
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          style={{ transform: 'rotate(-90deg)' }}
          aria-hidden="true"
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="color-mix(in srgb, var(--fg-1) 8%, transparent)"
            strokeWidth={12}
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 280ms var(--ease-out)' }}
          />
        </svg>
        <div className="absolute text-center">
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              color: 'var(--fg-1)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {percentLabel}
          </div>
          <div
            style={{
              marginTop: 2,
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: 'var(--fg-3)',
            }}
          >
            {progressOfLabel}
          </div>
        </div>
      </div>
    </div>
  )
}

export function GoalDetailDrawer({
  open,
  onOpenChange,
  goalId,
}: Readonly<GoalDetailDrawerProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) =>
      t(key, values),
    [t],
  )
  const locale = useLocale()
  const { showError } = useAppToast()

  const { data: goalsData } = useGoals()
  const {
    data: detailData,
    isLoading: isLoadingDetail,
    isError: loadError,
    refetch: refetchDetail,
  } = useGoalDetail(open ? goalId : null)

  const updateProgress = useUpdateGoalProgress()
  const updateStatus = useUpdateGoalStatus()
  const deleteGoalMut = useDeleteGoal()

  const detail = detailData?.goal ?? null
  const goal = detail ?? goalsData?.goalsById.get(goalId) ?? null
  const metrics = detailData?.metrics ?? null

  const isStreak = isStreakGoal(goal?.type)

  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [progressValue, setProgressValue] = useState<number | null>(null)
  const [progressNote, setProgressNote] = useState('')
  const [showProgressForm, setShowProgressForm] = useState(false)
  const [showProgressDiscardDialog, setShowProgressDiscardDialog] = useState(false)
  const [initialProgressValue, setInitialProgressValue] = useState<number | null>(null)
  const [pendingProgressDismiss, setPendingProgressDismiss] = useState<ProgressDismissTarget | null>(null)

  const isUpdatingProgress = updateProgress.isPending
  const isUpdatingStatus = updateStatus.isPending

  const progressExceedsTarget = useMemo(() => {
    if (progressValue === null || !goal) return false
    return progressValue > goal.targetValue
  }, [progressValue, goal])

  const isProgressDirty = useMemo(() => {
    if (!showProgressForm) return false
    return (
      progressValue !== initialProgressValue ||
      progressNote.trim().length > 0
    )
  }, [progressNote, progressValue, showProgressForm, initialProgressValue])

  const router = useRouter()
  const askPrompt = t('goals.detail.askAstraDefault')
  function handleAskAstra() {
    if (!goal) return
    const seed = t('goals.detail.askAstraSeedDefault', { title: goal.title })
    if (typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem('orbit-chat-draft', seed)
    }
    onOpenChange(false)
    router.push('/chat')
  }

  const [previousSession, setPreviousSession] = useState<{ open: boolean; goalId: string | null }>({
    open,
    goalId: open ? goalId : null,
  })
  if (previousSession.open !== open || previousSession.goalId !== (open ? goalId : null)) {
    setPreviousSession({ open, goalId: open ? goalId : null })
    if (open) {
      const nextInitial = goal?.currentValue ?? null
      setInitialProgressValue(nextInitial)
      setPendingProgressDismiss(null)
      setProgressValue(nextInitial)
      setShowProgressForm(false)
      setProgressNote('')
      setShowProgressDiscardDialog(false)
    }
  }

  const formatDate = useCallback(
    (dateStr: string) => {
      return formatLocaleDateTime(dateStr, locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
      })
    },
    [locale],
  )

  const submitProgress = useCallback(async () => {
    const validationError = translateErrorKey(
      translate,
      validateGoalProgressInput(progressValue),
    )
    if (validationError) {
      showError(validationError)
      return
    }

    if (progressValue === null) return
    try {
      await updateProgress.mutateAsync({
        goalId,
        data: {
          currentValue: progressValue,
          note: progressNote.trim() || undefined,
        },
      })
      setProgressValue(null)
      setProgressNote('')
      setShowProgressForm(false)
      refetchDetail()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.progress', 'goalProgress'))
    }
  }, [goalId, progressNote, progressValue, refetchDetail, showError, translate, updateProgress])

  const markCompleted = useCallback(async () => {
    if (isUpdatingStatus) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Completed' },
        goalName: goal?.title,
      })
      refetchDetail()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
  }, [goalId, goal, isUpdatingStatus, refetchDetail, showError, translate, updateStatus])

  const markAbandoned = useCallback(async () => {
    if (isUpdatingStatus) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Abandoned' },
        goalName: goal?.title,
      })
      refetchDetail()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
  }, [goalId, goal, isUpdatingStatus, refetchDetail, showError, translate, updateStatus])

  const reactivate = useCallback(async () => {
    if (isUpdatingStatus) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Active' },
        goalName: goal?.title,
      })
      refetchDetail()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.update', 'goal'))
    }
  }, [goalId, goal, isUpdatingStatus, refetchDetail, showError, translate, updateStatus])

  const confirmDelete = useCallback(async () => {
    try {
      await deleteGoalMut.mutateAsync(goalId)
      onOpenChange(false)
      setShowDeleteConfirm(false)
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'goals.errors.delete', 'goal'))
    }
  }, [deleteGoalMut, goalId, onOpenChange, showError, translate])

  const closeProgressForm = useCallback(() => {
    setProgressValue(initialProgressValue)
    setProgressNote('')
    setShowProgressForm(false)
  }, [initialProgressValue])

  const requestProgressDismiss = useCallback((target: ProgressDismissTarget) => {
    if (isProgressDirty) {
      setPendingProgressDismiss(target)
      setShowProgressDiscardDialog(true)
      return
    }

    if (target === 'drawer') {
      onOpenChange(false)
      return
    }

    closeProgressForm()
  }, [closeProgressForm, isProgressDirty, onOpenChange])

  const confirmProgressDismiss = useCallback(() => {
    const target = pendingProgressDismiss
    setPendingProgressDismiss(null)
    setShowProgressDiscardDialog(false)

    if (target === 'drawer') {
      onOpenChange(false)
      return
    }

    closeProgressForm()
  }, [closeProgressForm, onOpenChange, pendingProgressDismiss])

  const cancelProgressDismiss = useCallback(() => {
    setPendingProgressDismiss(null)
    setShowProgressDiscardDialog(false)
  }, [])

  return (
    <>
      <AppOverlay
        open={open}
        onOpenChange={onOpenChange}
        title={goal?.title ?? ''}
        canDismiss={!isProgressDirty}
        isDirty={isProgressDirty}
        onAttemptDismiss={() => requestProgressDismiss('drawer')}
        footer={
          goal ? (
            <button
              type="button"
              onClick={handleAskAstra}
              aria-label={`${t('goals.detail.askAstraEyebrow')}: ${askPrompt}`}
              className="block w-full text-left appearance-none border-0 bg-transparent cursor-pointer transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bg-elev-pressed)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary active:scale-[0.99]"
              style={{ borderRadius: 8, padding: '8px 10px', margin: '-8px -10px' }}
            >
              <div className="flex items-center gap-3">
                <div className="relative flex-1 min-w-0" style={{ paddingLeft: 14 }}>
                  <span
                    aria-hidden="true"
                    className="absolute rounded-[1px]"
                    style={{ left: 0, top: 4, bottom: 4, width: 2, background: 'var(--primary)' }}
                  />
                  <div className="inline-flex items-center" style={{ gap: 6, marginBottom: 6 }}>
                    <Orbit size={12} strokeWidth={1.7} color="var(--primary)" />
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10.5,
                        fontWeight: 500,
                        letterSpacing: '0.06em',
                        color: 'var(--fg-3)',
                      }}
                    >
                      {t('goals.detail.askAstraEyebrow')}
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 15,
                      lineHeight: 1.5,
                      color: 'var(--fg-2)',
                      textWrap: 'pretty',
                    }}
                  >
                    {askPrompt}
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  strokeWidth={1.7}
                  color="var(--fg-3)"
                  aria-hidden="true"
                  className="shrink-0"
                />
              </div>
            </button>
          ) : undefined
        }
      >
        {goal && (
          <div className="overlay-bleed">
            {isStreak && (
              <div
                style={{
                  padding: '10px 20px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--fg-3)',
                  letterSpacing: '0.04em',
                  fontVariantNumeric: 'tabular-nums',
                  borderBottom: '1px solid var(--hairline)',
                }}
              >
                {t('goals.form.typeStreak')}
              </div>
            )}

            <SectionLabel>{t('goals.progress')}</SectionLabel>
            <div style={{ padding: '2px 20px 16px' }}>
              <GoalProgressRing
                progressPercentage={goal.progressPercentage}
                percentLabel={t('goals.progressPercentage', { pct: goal.progressPercentage })}
                progressOfLabel={
                  isStreak
                    ? t('goals.streak.ofTarget', {
                        current: goal.currentValue,
                        target: goal.targetValue,
                      })
                    : t('goals.progressOf', {
                        current: goal.currentValue,
                        target: goal.targetValue,
                        unit: goal.unit,
                      })
                }
                color={isStreak ? 'var(--status-overdue)' : 'var(--primary)'}
              />
              {goal.status === 'Active' && !showProgressForm && (
                <PillButton
                  fullWidth
                  className="mt-[14px]"
                  leading={
                    <Plus
                      size={18}
                      strokeWidth={1.8}
                      color="var(--fg-on-primary)"
                      aria-hidden="true"
                    />
                  }
                  onClick={() => {
                    setInitialProgressValue(goal.currentValue)
                    setProgressValue(goal.currentValue)
                    setProgressNote('')
                    setShowProgressForm(true)
                  }}
                >
                  {t('goals.updateProgress')}
                </PillButton>
              )}
            </div>

            {showProgressForm && goal.status === 'Active' && (
              <GoalProgressForm
                progressValue={progressValue}
                progressNote={progressNote}
                isUpdating={isUpdatingProgress}
                isStreak={isStreak}
                progressExceedsTarget={progressExceedsTarget}
                onProgressValueChange={setProgressValue}
                onProgressNoteChange={setProgressNote}
                onSubmit={submitProgress}
                onCancel={() => requestProgressDismiss('form')}
                labelValue={isStreak ? t('goals.form.streakTarget') : t('goals.form.targetValue')}
                labelNote={t('goals.progressNote')}
                labelSave={t('common.save')}
                labelCancel={t('common.cancel')}
                labelExceedsTarget={t('goals.form.progressExceedsTarget')}
              />
            )}

            {goal.status === 'Active' && (
              <GoalMetricsPanel
                metrics={metrics}
                unit={goal.unit}
                isLoading={isLoadingDetail}
                isStreak={isStreak}
              />
            )}

            {isStreak && (goal.linkedHabits ?? []).length > 0 && (
              <GoalLinkedHabitsSection
                title={t('goals.linkedHabits')}
                linkedHabits={goal.linkedHabits ?? []}
              />
            )}

            <GoalProgressHistorySection
              title={t('goals.progressHistory')}
              entries={detail?.progressHistory ?? []}
              unit={goal.unit}
              formatDate={formatDate}
              renderEntryLabel={(entry) =>
                t('goals.progressEntry', {
                  previous: entry.previousValue,
                  value: entry.value,
                  unit: goal.unit,
                })
              }
              showAllLabel={t('goals.detail.showAllHistory')}
              showLessLabel={t('goals.detail.showLessHistory')}
            />

            {!isStreak && (
              <GoalLinkedHabitsSection
                title={t('goals.linkedHabits')}
                linkedHabits={goal.linkedHabits ?? []}
              />
            )}

            {loadError && (
              <p
                style={{
                  padding: '10px 20px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  color: 'var(--status-overdue)',
                }}
              >
                {t('goals.detail.loadError')}
              </p>
            )}

            <div style={{ marginTop: 16, paddingBottom: 4 }}>
              {goal.status === 'Active' ? (
                <>
                  <GoalActionRow
                    label={t('goals.detail.markCompleted')}
                    icon={CheckCircle2}
                    onClick={markCompleted}
                    disabled={isUpdatingStatus}
                  />
                  <GoalActionRow
                    label={t('goals.detail.markAbandoned')}
                    icon={ArchiveX}
                    onClick={markAbandoned}
                    disabled={isUpdatingStatus}
                  />
                </>
              ) : (
                <GoalActionRow
                  label={t('goals.detail.reactivate')}
                  icon={RotateCw}
                  onClick={reactivate}
                  disabled={isUpdatingStatus}
                />
              )}
              <GoalActionRow
                label={t('goals.detail.edit')}
                icon={PencilLine}
                onClick={() => setShowEditModal(true)}
              />
              <GoalActionRow
                label={t('goals.detail.delete')}
                icon={Trash2}
                destructive
                onClick={() => setShowDeleteConfirm(true)}
              />
            </div>
          </div>
        )}
      </AppOverlay>

      {goal && (
        <EditGoalModal
          open={showEditModal}
          onOpenChange={setShowEditModal}
          goal={goal}
        />
      )}

      <ConfirmDialog
        open={showProgressDiscardDialog}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) cancelProgressDismiss()
        }}
        title={t('common.discardChangesTitle')}
        description={t('common.discardChangesDescription')}
        confirmLabel={t('common.discard')}
        cancelLabel={t('common.keepEditing')}
        variant="warning"
        onConfirm={confirmProgressDismiss}
        onCancel={cancelProgressDismiss}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t('goals.detail.delete')}
        description={t('goals.detail.deleteConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  )
}
