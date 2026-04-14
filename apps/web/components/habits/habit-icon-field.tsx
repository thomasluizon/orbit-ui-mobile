'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import { HabitEmoji } from './habit-emoji'
import { HabitEmojiPicker } from './habit-emoji-picker'

interface HabitIconFieldProps {
  value: string | null | undefined
  onChange: (value: string | null) => void
  title: string
  errorKey?: string | null
}

export function HabitIconField({ value, onChange, title, errorKey }: HabitIconFieldProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const handleSelect = useCallback(
    (emoji: string | null) => {
      onChange(emoji)
    },
    [onChange],
  )

  const hasIcon = !!(value && value.trim().length > 0)
  const effectiveTitle = title.trim() || t('habits.title')

  return (
    <div className="space-y-2">
      <label htmlFor="habit-form-icon" className="form-label">
        {t('habits.form.icon')}
      </label>
      <button
        id="habit-form-icon"
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="group flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-border-muted bg-surface-elevated/60 p-2.5 text-left transition-colors hover:border-border hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <HabitEmoji icon={value} title={effectiveTitle} size="md" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-text-primary">
            {hasIcon ? t('habits.form.iconChange') : t('habits.form.iconPick')}
          </span>
          <span className="truncate text-xs text-text-muted">
            {hasIcon ? value : t('habits.form.iconHint')}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-text-muted transition-transform group-aria-expanded:rotate-180" />
      </button>
      {errorKey ? (
        <p className="text-xs text-destructive" role="alert">
          {t(errorKey as Parameters<typeof t>[0])}
        </p>
      ) : null}
      <HabitEmojiPicker
        open={open}
        onOpenChange={setOpen}
        onSelect={handleSelect}
        currentIcon={value ?? null}
      />
    </div>
  )
}
