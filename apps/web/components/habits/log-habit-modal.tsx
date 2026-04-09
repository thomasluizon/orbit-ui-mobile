'use client'

import { useState, useEffect, useCallback } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { useAppToast } from '@/hooks/use-app-toast'
import { useLogHabit } from '@/hooks/use-habits'
import {
  getFriendlyErrorMessage,
  translateErrorKey,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { validateHabitLogNote } from '@orbit/shared/validation'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LogHabitModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  habit: NormalizedHabit | null
  onLogged?: (habitId: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LogHabitModal({
  open,
  onOpenChange,
  habit,
  onLogged,
}: Readonly<LogHabitModalProps>) {
  const t = useTranslations()
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) =>
      t(key as Parameters<typeof t>[0], values as never),
    [t],
  )
  const logHabit = useLogHabit()
  const { showError } = useAppToast()

  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) {
      setNote('')
    }
  }, [open])

  const handleSubmit = useCallback(async () => {
    if (!habit) return
    const noteError = translateErrorKey(translate, validateHabitLogNote(note))
    if (noteError) {
      showError(noteError)
      return
    }
    try {
      await logHabit.mutateAsync({
        habitId: habit.id,
        note: note || undefined,
      })
      onLogged?.(habit.id)
      onOpenChange(false)
      setNote('')
    } catch (error) {
      showError(getFriendlyErrorMessage(error, translate, 'errors.logHabit', 'habitLog'))
    }
  }, [habit, logHabit, note, onLogged, onOpenChange, showError, translate])

  const handleCancel = useCallback(() => {
    onOpenChange(false)
    setNote('')
  }, [onOpenChange])

  return (
    <AppOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={t('habits.log.title')}
      description={t('habits.log.description')}
      footer={
        <div className="flex gap-3">
          <button
            className="flex-1 py-3 rounded-xl border border-border text-text-secondary font-medium text-sm hover:bg-surface-elevated/80 transition-all duration-150"
            disabled={logHabit.isPending}
            onClick={handleCancel}
          >
            {t('common.cancel')}
          </button>
          <button
            className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all active:scale-[0.98] shadow-[var(--shadow-glow)] flex items-center justify-center gap-2 disabled:opacity-50"
            disabled={logHabit.isPending}
            onClick={handleSubmit}
          >
            {logHabit.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {t('habits.logHabit')}
          </button>
        </div>
      }
    >
      {habit && (
        <div className="space-y-4">
          <div>
            <p className="form-label mb-1">{t('habits.log.habitLabel')}</p>
            <p className="font-bold text-text-primary">{habit.title}</p>
          </div>

          <div>
            <label htmlFor="note" className="block form-label mb-2">
              {t('habits.log.noteLabel')}
            </label>
            <textarea
              id="note"
              value={note}
              placeholder={t('habits.log.notePlaceholder')}
              rows={3}
              maxLength={500}
              disabled={logHabit.isPending}
              className="w-full bg-surface text-text-primary placeholder-text-muted rounded-md py-3 px-4 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none disabled:opacity-50"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      )}
    </AppOverlay>
  )
}
