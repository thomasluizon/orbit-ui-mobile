'use client'

import { useMemo } from 'react'
import type { HabitPhraseToken } from '@orbit/shared/utils'
import { segmentHabitPhrase } from '@orbit/shared/utils'
import { Minus, Plus } from '@/components/ui/icons'
import { HabitEmojiSelector } from './habit-emoji-selector'
import { Proposed } from '@/components/ui/proposed'

interface DayOption {
  value: string
  label: string
}

interface HabitUnderstandingProps {
  value: string
  error?: string
  emoji: string
  days: string[]
  dayOptions: DayOption[]
  quantity: number
  sentence: string | null
  consumed: readonly HabitPhraseToken[]
  proposed?: boolean
  onValueChange: (value: string) => void
  onEmojiSelect: (emoji: string) => void
  onToggleDay: (day: string) => void
  onQuantityChange: (quantity: number) => void
  labels: {
    field: string
    placeholder: string
    understood: string
    unresolved: string
    days: string
    less: string
    more: string
    count: string
    proposed: string
  }
}

export function HabitUnderstanding({
  value,
  error,
  emoji,
  days,
  dayOptions,
  quantity,
  sentence,
  consumed,
  proposed = false,
  onValueChange,
  onEmojiSelect,
  onToggleDay,
  onQuantityChange,
  labels,
}: Readonly<HabitUnderstandingProps>) {
  const hasValue = value.trim().length > 0
  const segments = useMemo(() => segmentHabitPhrase(value, consumed), [consumed, value])

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      <div className="flex flex-col" style={{ gap: 8 }}>
        <label htmlFor="habit-phrase" className="form-label">{labels.field}</label>
        <div className="relative rounded-[12px] focus-within:shadow-[inset_0_0_0_2px_var(--primary)]">
          <p
            aria-hidden="true"
            className="min-h-[92px] w-full whitespace-pre-wrap break-words rounded-[12px] bg-[var(--bg-field)] p-4 text-start text-base leading-[1.45] text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--border-control)]"
          >
            {hasValue ? segments.map((segment, index) => segment.consumed ? (
              <span
                key={`${segment.text}-${index}`}
                data-consumed="true"
                className="rounded-[8px] bg-[var(--bg-well)] shadow-[inset_0_-2px_0_var(--hairline-strong)]"
              >
                {segment.text}
              </span>
            ) : segment.text) : <span className="text-[var(--fg-4)]">{labels.placeholder}</span>}
          </p>
          <textarea
            id="habit-phrase"
            value={value}
            rows={3}
            maxLength={200}
            spellCheck={false}
            aria-invalid={!!error}
            aria-describedby={error ? 'habit-phrase-error' : undefined}
            className="absolute inset-0 h-full min-h-[92px] w-full resize-none rounded-[12px] border-0 bg-transparent p-4 text-base leading-[1.45] text-transparent caret-[var(--fg-1)]"
            onChange={(event) => onValueChange(event.target.value)}
          />
        </div>
        {error ? (
          <p id="habit-phrase-error" role="alert" className="text-sm text-[var(--status-bad)]">
            {error}
          </p>
        ) : null}
      </div>

      {hasValue ? (
        <Proposed proposed={proposed} scope="block" label={labels.proposed}>
          <section
            aria-label={labels.understood}
            className="flex flex-col rounded-[20px] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"
            style={{ gap: 16 }}
          >
            <div className="flex items-center" style={{ gap: 12 }}>
              <HabitEmojiSelector
                selectedEmoji={emoji}
                onSelect={onEmojiSelect}
                wellSize={46}
              />
              <span className="text-xs text-[var(--fg-3)]">{labels.understood}</span>
            </div>

            <p className="text-[17px] font-medium leading-[1.4] text-[var(--fg-1)]">
              {sentence ?? labels.unresolved}
            </p>

            <div role="group" aria-label={labels.days} className="flex" style={{ gap: 4 }}>
              {dayOptions.map((day) => {
                const selected = days.includes(day.value)
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={selected}
                    aria-label={day.value}
                    className={`grid size-11 shrink-0 place-items-center rounded-full border-0 text-sm font-medium transition-[background-color,box-shadow,color] duration-[var(--dur-fast)] ${
                      selected
                        ? 'bg-[var(--primary-dim)] text-[var(--fg-1)] shadow-[inset_0_0_0_1.5px_var(--primary)]'
                        : 'bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)]'
                    }`}
                    onClick={() => onToggleDay(day.value)}
                  >
                    {day.label.charAt(0)}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center" style={{ gap: 8 }}>
              <button
                type="button"
                aria-label={labels.less}
                className="grid size-11 place-items-center rounded-full border-0 bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)]"
                onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
              >
                <Minus size={20} strokeWidth={2} aria-hidden="true" />
              </button>
              <span className="min-w-7 text-center font-mono text-xl tabular-nums">{quantity}</span>
              <button
                type="button"
                aria-label={labels.more}
                className="grid size-11 place-items-center rounded-full border-0 bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)]"
                onClick={() => onQuantityChange(Math.min(7, quantity + 1))}
              >
                <Plus size={20} strokeWidth={2} aria-hidden="true" />
              </button>
              <span className="text-sm text-[var(--fg-3)]">{labels.count}</span>
            </div>
          </section>
        </Proposed>
      ) : null}
    </div>
  )
}
