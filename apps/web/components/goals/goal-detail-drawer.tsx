'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import {
  PencilLine,
  CheckCircle2,
  ArchiveX,
  RotateCw,
  Trash2,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EditGoalModal } from './edit-goal-modal'
import { GoalMetricsPanel } from './goal-metrics-panel'
import {
  useGoals,
  useGoalDetail,
  useUpdateGoalProgress,
  useUpdateGoalStatus,
  useDeleteGoal,
} from '@/hooks/use-goals'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GoalDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goalId: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoalDetailDrawer({
  open,
  onOpenChange,
  goalId,
}: Readonly<GoalDetailDrawerProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS

  // Queries
  const { data: goalsData } = useGoals()
  const {
    data: detailData,
    isLoading: isLoadingDetail,
    isError: loadError,
    refetch: refetchDetail,
  } = useGoalDetail(open ? goalId : null)

  // Mutations
  const updateProgress = useUpdateGoalProgress()
  const updateStatus = useUpdateGoalStatus()
  const deleteGoalMut = useDeleteGoal()

  // Get goal from list cache for immediate display
  const goal = goalsData?.goalsById.get(goalId) ?? null
  const detail = detailData?.goal ?? null
  const metrics = detailData?.metrics ?? null

  // Local state
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [progressValue, setProgressValue] = useState<number | null>(null)
  const [progressNote, setProgressNote] = useState('')
  const [showProgressForm, setShowProgressForm] = useState(false)

  const isUpdatingProgress = updateProgress.isPending
  const isUpdatingStatus = updateStatus.isPending

  const progressExceedsTarget = useMemo(() => {
    if (progressValue === null || !goal) return false
    return progressValue > goal.targetValue
  }, [progressValue, goal])

  // Reset state when drawer opens
  useEffect(() => {
    if (open) {
      setProgressValue(goal?.currentValue ?? null)
      setShowProgressForm(false)
      setProgressNote('')
    }
  }, [open, goal?.currentValue])

  // Format date helper
  const formatDate = useCallback(
    (dateStr: string) => {
      return format(
        parseISO(dateStr),
        locale === 'pt-BR' ? 'dd/MM/yyyy HH:mm' : 'MMM dd, yyyy HH:mm',
        { locale: dateFnsLocale },
      )
    },
    [locale, dateFnsLocale],
  )

  // Handlers
  const submitProgress = useCallback(async () => {
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
    } catch {
      // Error handled by mutation
    }
  }, [goalId, progressValue, progressNote, updateProgress, refetchDetail])

  const markCompleted = useCallback(async () => {
    if (isUpdatingStatus) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Completed' },
        goalName: goal?.title,
      })
      refetchDetail()
    } catch {
      // Error handled by mutation
    }
  }, [goalId, goal?.title, isUpdatingStatus, updateStatus, refetchDetail])

  const markAbandoned = useCallback(async () => {
    if (isUpdatingStatus) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Abandoned' },
        goalName: goal?.title,
      })
      refetchDetail()
    } catch {
      // Error handled by mutation
    }
  }, [goalId, goal?.title, isUpdatingStatus, updateStatus, refetchDetail])

  const reactivate = useCallback(async () => {
    if (isUpdatingStatus) return
    try {
      await updateStatus.mutateAsync({
        goalId,
        data: { status: 'Active' },
        goalName: goal?.title,
      })
      refetchDetail()
    } catch {
      // Error handled by mutation
    }
  }, [goalId, goal?.title, isUpdatingStatus, updateStatus, refetchDetail])

  const confirmDelete = useCallback(async () => {
    await deleteGoalMut.mutateAsync(goalId)
    onOpenChange(false)
    setShowDeleteConfirm(false)
  }, [goalId, deleteGoalMut, onOpenChange])

  const mutationError =
    updateProgress.error?.message ??
    updateStatus.error?.message ??
    deleteGoalMut.error?.message ??
    null

  return (
    <>
      <AppOverlay
        open={open}
        onOpenChange={onOpenChange}
        title={goal?.title ?? ''}
      >
        {goal && (
          <div className="space-y-6">
            {/* Progress section */}
            <div>
              <h4 className="form-label mb-2">
                {t('goals.progress')}
              </h4>

              {/* Progress bar */}
              <div className="h-3 bg-surface-elevated rounded-full overflow-hidden mb-2">
                <div
                  className="h-full rounded-full transition-all duration-500 bg-primary"
                  style={{
                    width: `${Math.min(goal.progressPercentage, 100)}%`,
                  }}
                />
              </div>
              <p className="text-sm text-text-secondary mb-4">
                {t('goals.progressOf', {
                  current: goal.currentValue,
                  target: goal.targetValue,
                  unit: goal.unit,
                })}
                <span className="text-text-muted ml-1">
                  ({t('goals.progressPercentage', { pct: goal.progressPercentage })})
                </span>
              </p>

              {/* Update progress toggle */}
              {goal.status === 'Active' && !showProgressForm && (
                <button
                  className="text-sm text-primary font-semibold hover:text-primary/80 transition-colors"
                  onClick={() => setShowProgressForm(true)}
                >
                  {t('goals.updateProgress')}
                </button>
              )}

              {/* Progress form */}
              {showProgressForm && goal.status === 'Active' && (
                <div className="space-y-3 bg-surface-elevated rounded-[var(--radius-lg)] p-4 border border-border-muted shadow-[var(--shadow-sm)]">
                  <div>
                    <label
                      htmlFor="goal-progress-value"
                      className="form-label"
                    >
                      {t('goals.form.targetValue')}
                    </label>
                    <input
                      id="goal-progress-value"
                      type="number"
                      value={progressValue ?? ''}
                      onChange={(e) =>
                        setProgressValue(
                          e.target.value === '' ? null : Number(e.target.value),
                        )
                      }
                      className="form-input"
                      min={0}
                      step="any"
                    />
                    {progressExceedsTarget && (
                      <p className="text-xs text-amber-400 font-medium mt-1">
                        {t('goals.form.progressExceedsTarget')}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="goal-progress-note"
                      className="form-label"
                    >
                      {t('goals.progressNote')}
                    </label>
                    <input
                      id="goal-progress-note"
                      type="text"
                      value={progressNote}
                      onChange={(e) => setProgressNote(e.target.value)}
                      className="form-input"
                      placeholder={t('goals.progressNote')}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={progressValue === null || isUpdatingProgress}
                      className="flex-1 py-2.5 rounded-[var(--radius-lg)] bg-primary text-white font-bold text-sm text-center hover:bg-primary/90 transition-all duration-150 disabled:opacity-50"
                      onClick={submitProgress}
                    >
                      {isUpdatingProgress ? '...' : t('common.save')}
                    </button>
                    <button
                      className="py-2.5 px-4 rounded-[var(--radius-lg)] bg-surface text-text-secondary font-medium text-sm hover:bg-surface-elevated/80 transition-all duration-150"
                      onClick={() => setShowProgressForm(false)}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Goal Metrics */}
            {goal.status === 'Active' && (
              <GoalMetricsPanel
                metrics={metrics}
                unit={goal.unit}
                isLoading={isLoadingDetail}
              />
            )}

            {/* Progress history */}
            {detail?.progressHistory && detail.progressHistory.length > 0 && (
              <div>
                <h4 className="form-label mb-2">
                  {t('goals.progressHistory')}
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {detail.progressHistory.map((entry) => (
                    <div
                      key={`${entry.createdAtUtc}-${entry.value}`}
                      className="flex items-center justify-between text-xs bg-surface-elevated rounded-xl px-3 py-2"
                    >
                      <div>
                        <span className="text-text-primary font-medium">
                          {t('goals.progressEntry', {
                            previous: entry.previousValue,
                            value: entry.value,
                            unit: goal.unit,
                          })}
                        </span>
                        {entry.note && (
                          <span className="text-text-muted ml-2">
                            {entry.note}
                          </span>
                        )}
                      </div>
                      <span className="text-text-muted shrink-0 ml-2">
                        {formatDate(entry.createdAtUtc)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Linked Habits */}
            {goal.linkedHabits && goal.linkedHabits.length > 0 && (
              <div className="mt-4">
                <h4 className="form-label mb-2">
                  {t('goals.linkedHabits')}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {goal.linkedHabits.map((habit) => (
                    <span
                      key={habit.id}
                      className="px-2.5 py-1 rounded-xl text-xs font-medium bg-surface border border-border text-text-secondary"
                    >
                      {habit.title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Load error (fallback to store data) */}
            {loadError && (
              <p className="text-amber-400 text-xs">
                {t('goals.detail.loadError')}
              </p>
            )}

            {/* Mutation error */}
            {mutationError && (
              <p className="text-red-400 text-xs">{mutationError}</p>
            )}

            {/* Actions */}
            <div className="space-y-2 pt-2 border-t border-border">
              <button
                className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-lg)] text-sm text-text-primary hover:bg-surface-elevated/80 transition-all duration-150"
                onClick={() => setShowEditModal(true)}
              >
                <PencilLine className="size-5 text-text-muted" />
                {t('goals.detail.edit')}
              </button>

              {goal.status === 'Active' && (
                <button
                  disabled={isUpdatingStatus}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-lg)] text-sm text-green-400 hover:bg-green-500/10 transition-all duration-150 disabled:opacity-50"
                  onClick={markCompleted}
                >
                  <CheckCircle2 className="size-5" />
                  {t('goals.detail.markCompleted')}
                </button>
              )}

              {goal.status === 'Active' && (
                <button
                  disabled={isUpdatingStatus}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-lg)] text-sm text-amber-400 hover:bg-amber-500/10 transition-all duration-150 disabled:opacity-50"
                  onClick={markAbandoned}
                >
                  <ArchiveX className="size-5" />
                  {t('goals.detail.markAbandoned')}
                </button>
              )}

              {goal.status !== 'Active' && (
                <button
                  disabled={isUpdatingStatus}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-lg)] text-sm text-primary hover:bg-primary/10 transition-all duration-150 disabled:opacity-50"
                  onClick={reactivate}
                >
                  <RotateCw className="size-5" />
                  {t('goals.detail.reactivate')}
                </button>
              )}

              <button
                className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-lg)] text-sm text-red-400 hover:bg-red-500/10 transition-all duration-150"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="size-5" />
                {t('goals.detail.delete')}
              </button>
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
