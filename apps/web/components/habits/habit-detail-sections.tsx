'use client'

import { useState } from 'react'
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

const NOTES_PREVIEW_COUNT = 2

export function HabitDetailStatsGrid({
  metrics,
  loading,
  t,
}: Readonly<HabitDetailStatsGridProps>) {
  if (metrics) {
    return (
      <div>
        <h3 className="form-label mb-3">{t('habits.detail.stats')}</h3>
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
      </div>
    )
  }

  if (!metrics && loading) {
    return (
      <div>
        <h3 className="form-label mb-3">{t('habits.detail.stats')}</h3>
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
      </div>
    )
  }

  // metrics is null and not loading
  return (
    <div>
      <h3 className="form-label mb-3">{t('habits.detail.stats')}</h3>
      <p className="text-sm text-text-muted text-center py-2">
        {t('habits.detail.noDataYet')}
      </p>
    </div>
  )
}

export function HabitDetailRecentNotes({
  notes,
  t,
}: Readonly<HabitDetailRecentNotesProps>) {
  const [showAll, setShowAll] = useState(false)

  if (notes.length === 0) return null

  const visibleNotes = showAll ? notes : notes.slice(0, NOTES_PREVIEW_COUNT)

  return (
    <div>
      <h3 className="form-label mb-3">
        {t('habits.detail.recentNotes')}
      </h3>
      <div className="space-y-2">
        {visibleNotes.map((note) => (
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
      {notes.length > NOTES_PREVIEW_COUNT && (
        <button
          className="mt-2 text-xs text-primary font-semibold hover:text-primary/80 transition-colors"
          onClick={() => setShowAll((prev) => !prev)}
        >
          {showAll
            ? t('habits.detail.showLessNotes')
            : t('habits.detail.showMoreNotes')}
        </button>
      )}
    </div>
  )
}

