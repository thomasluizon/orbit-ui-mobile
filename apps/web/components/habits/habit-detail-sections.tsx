'use client'

import { BarChart3, Flame, Trophy } from 'lucide-react'
import type { HabitCardTranslationAdapter } from '@orbit/shared/utils'

export type TranslationFn = HabitCardTranslationAdapter

export interface HabitDetailMetrics {
  currentStreak: number
  longestStreak: number
  monthlyCompletionRate: number
}

export interface HabitDetailNote {
  id: string
  dateLabel: string
  note: string
}

interface HabitDetailStatsGridProps {
  metrics: HabitDetailMetrics | null
  loading: boolean
  t: TranslationFn
}

interface HabitDetailRecentNotesProps {
  notes: HabitDetailNote[]
  t: TranslationFn
}

interface HabitDetailActionButtonsProps {
  onEdit: () => void
  onDelete: () => void
  t: TranslationFn
}

export function HabitDetailStatsGrid({
  metrics,
  loading,
  t,
}: Readonly<HabitDetailStatsGridProps>) {
  if (metrics && !loading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface-ground border border-border-muted rounded-xl p-3 flex flex-col items-center gap-1 shadow-[var(--shadow-sm)]">
          <Flame className="size-5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
            {t('habits.detail.currentStreak')}
          </span>
          <span className="text-lg font-bold text-text-primary">
            {t('habits.detail.streakDays', {
              n: metrics.currentStreak,
            })}
          </span>
        </div>
        <div className="bg-surface-ground border border-border-muted rounded-xl p-3 flex flex-col items-center gap-1 shadow-[var(--shadow-sm)]">
          <Trophy className="size-5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
            {t('habits.detail.longestStreak')}
          </span>
          <span className="text-lg font-bold text-text-primary">
            {t('habits.detail.streakDays', {
              n: metrics.longestStreak,
            })}
          </span>
        </div>
        <div className="bg-surface-ground border border-border-muted rounded-xl p-3 flex flex-col items-center gap-1 shadow-[var(--shadow-sm)]">
          <BarChart3 className="size-5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
            {t('habits.detail.monthlyRate')}
          </span>
          <span className="text-lg font-bold text-text-primary">
            {Math.round(metrics.monthlyCompletionRate)}%
          </span>
        </div>
      </div>
    )
  }

  if (!metrics && loading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-surface-ground border border-border-muted rounded-xl p-3 flex flex-col items-center gap-2"
          >
            <div className="size-5 rounded-full bg-surface-elevated animate-pulse" />
            <div className="h-2.5 w-10 bg-surface-elevated rounded animate-pulse" />
            <div className="h-5 w-8 bg-surface-elevated rounded animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  return null
}

export function HabitDetailRecentNotes({
  notes,
  t,
}: Readonly<HabitDetailRecentNotesProps>) {
  if (notes.length === 0) return null

  return (
    <div>
      <h3 className="text-sm font-bold text-text-primary mb-3">
        {t('habits.detail.recentNotes')}
      </h3>
      <div className="space-y-2">
        {notes.map((note) => (
          <div
            key={note.id}
            className="bg-surface-ground border border-border-muted rounded-lg p-3 shadow-[var(--shadow-sm)]"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">
              {note.dateLabel}
            </p>
            <p className="text-sm text-text-secondary">{note.note}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function HabitDetailActionButtons({
  onEdit,
  onDelete,
  t,
}: Readonly<HabitDetailActionButtonsProps>) {
  return (
    <div className="flex gap-3">
      <button
        className="flex-1 py-4 rounded-xl border border-border text-text-primary font-bold text-sm hover:bg-surface-elevated/80 transition-all duration-150"
        onClick={onEdit}
      >
        {t('common.edit')}
      </button>
      <button
        className="flex-[2] py-4 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all duration-150 flex items-center justify-center gap-2 shadow-[var(--shadow-glow)]"
        onClick={onDelete}
      >
        {t('common.delete')}
      </button>
    </div>
  )
}
