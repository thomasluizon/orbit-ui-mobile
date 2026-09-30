'use client'

import { useMemo } from 'react'
import type { HabitUnderstandingProps } from '@orbit/shared/utils'
import { MAX_HABIT_INTERVAL_WEEKS } from '@orbit/shared/types/habit'
import { segmentHabitPhrase } from '@orbit/shared/utils'
import { Minus, Plus } from '@/components/ui/icons'
import { HabitEmojiSelector } from './habit-emoji-selector'
import { Proposed } from '@/components/ui/proposed'
import { SegmentedControl } from '@/components/ui/segmented-control'

type HabitUnderstandingWithDisabledEmojiProps = HabitUnderstandingProps & {
  isSuggestionDisabled?: boolean
}

export function HabitUnderstanding({
  value,
  error,
  emoji,
  days,
  daily = false,
  dayOptions,
  quantity,
  mode,
  intervalWeeks,
  sentence,
  consumed,
  proposed = false,
  scheduleLocked = false,
  onValueChange,
  onEmojiSelect,
  isSuggestionDisabled = false,
  onToggleDay,
  onQuantityChange,
  onModeChange,
  onIntervalWeeksChange,
  labels,
}: Readonly<HabitUnderstandingWithDisabledEmojiProps>) {
  const hasValue = value.trim().length > 0
  const segments = useMemo(() => segmentHabitPhrase(value, consumed), [consumed, value])

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      <div className="flex flex-col" style={{ gap: 8 }}>
        <label htmlFor="habit-phrase" className="form-label">{labels.field}</label>
        <div data-habit-phrase-field="" data-focus-perimeter="" className="relative rounded-[12px] bg-[var(--bg-field)] shadow-[inset_0_0_0_1px_var(--border-control)] has-[textarea:focus-visible]:shadow-[inset_0_0_0_2px_var(--primary)] forced-colors:border-2 forced-colors:border-[CanvasText] forced-colors:has-[textarea:focus-visible]:border-[Highlight]">
          <p
            aria-hidden="true"
            className="min-h-[92px] w-full whitespace-pre-wrap break-words p-4 text-start text-base leading-[1.45] text-[var(--fg-1)]"
          >
            {hasValue ? segments.map((segment, index) => segment.consumed ? (
              <span
                key={`${segment.text}-${index}`}
                data-consumed="true"
                className="rounded-[8px] bg-[var(--bg-well)] shadow-[inset_0_-2px_0_var(--hairline-strong)]"
              >
                {segment.text}
              </span>
            ) : segment.text) : <span className="text-[var(--fg-3)]">{labels.placeholder}</span>}
          </p>
          <textarea
            id="habit-phrase"
            value={value}
            rows={3}
            maxLength={200}
            spellCheck={false}
            aria-invalid={!!error}
            aria-describedby={error ? 'habit-phrase-error' : undefined}
            className="absolute inset-0 h-full min-h-[92px] w-full resize-none rounded-[12px] border-0 bg-transparent p-4 text-base leading-[1.45] text-transparent caret-[var(--fg-1)] focus-visible:outline-none"
            onChange={(event) => onValueChange(event.target.value)}
          />
        </div>
        {error ? (
          <p id="habit-phrase-error" role="alert" className="text-sm text-[var(--status-bad-text)]">
            {error}
          </p>
        ) : null}
      </div>

      {sentence !== null ? (
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
                isDisabled={isSuggestionDisabled}
                wellSize={46}
              />
              <span className="text-xs text-[var(--fg-3)]">{proposed ? labels.understoodAstra : labels.understood}</span>
            </div>

            <p className="text-[17px] font-medium leading-[1.4] text-[var(--fg-1)]">{sentence}</p>

            <ScheduleCorrections days={days} daily={daily} dayOptions={dayOptions} quantity={quantity} mode={mode} intervalWeeks={intervalWeeks} scheduleLocked={scheduleLocked} onToggleDay={onToggleDay} onQuantityChange={onQuantityChange} onModeChange={onModeChange} onIntervalWeeksChange={onIntervalWeeksChange} labels={labels} />
          </section>
        </Proposed>
      ) : null}
      {hasValue && sentence === null ? (
        <div className="flex flex-col" style={{ gap: 16 }}>
          <p className="rounded-[12px] bg-[var(--bg-well)] p-3 text-sm leading-[1.55] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)]">{labels.unresolved}</p>
          <ScheduleCorrections days={days} daily={daily} dayOptions={dayOptions} quantity={quantity} mode={mode} intervalWeeks={intervalWeeks} scheduleLocked={scheduleLocked} onToggleDay={onToggleDay} onQuantityChange={onQuantityChange} onModeChange={onModeChange} onIntervalWeeksChange={onIntervalWeeksChange} labels={labels} />
        </div>
      ) : null}
    </div>
  )
}

type ScheduleCorrectionProps = Pick<HabitUnderstandingProps, 'days' | 'daily' | 'dayOptions' | 'quantity' | 'mode' | 'intervalWeeks' | 'scheduleLocked' | 'onToggleDay' | 'onQuantityChange' | 'onModeChange' | 'onIntervalWeeksChange' | 'labels'>

function ScheduleCorrections({ days, daily = false, dayOptions, quantity, mode, intervalWeeks, scheduleLocked = false, onToggleDay, onQuantityChange, onModeChange, onIntervalWeeksChange, labels }: Readonly<ScheduleCorrectionProps>) {
  return (
    <>
      <SegmentedControl
        label={labels.scheduleMode}
        value={mode}
        options={[{ value: 'fixed', label: labels.setDays }, { value: 'flexible', label: labels.timesAWeek }]}
        disabled={scheduleLocked}
        onChange={(value) => onModeChange(value === 'flexible' ? 'flexible' : 'fixed')}
      />

      {mode === 'fixed' ? (
        <fieldset aria-label={labels.days} className="flex flex-wrap" style={{ gap: 4 }}>
          {dayOptions.map((day) => {
            const selected = daily || days.includes(day.value)
            return (
              <button key={day.value} type="button" aria-pressed={selected} aria-label={day.accessibleLabel} disabled={scheduleLocked}
                className={`habit-control-motion grid size-11 shrink-0 place-items-center rounded-full border-0 text-sm font-medium active:scale-[0.96] disabled:opacity-40 ${selected ? 'bg-[var(--primary-dim)] text-[var(--fg-1)] shadow-[inset_0_0_0_1.5px_var(--primary)]' : 'bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)]'}`}
                onClick={() => onToggleDay(day.value)}>{day.label.charAt(0)}</button>
            )
          })}
        </fieldset>
      ) : (
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <button type="button" aria-label={labels.less} disabled={scheduleLocked} className="habit-control-motion grid size-11 place-items-center rounded-full border-0 bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96] disabled:opacity-40" onClick={() => onQuantityChange(Math.max(1, quantity - 1))}>
            <Minus size={20} strokeWidth={2} aria-hidden="true" />
          </button>
          <span className="min-w-7 text-center font-mono text-xl tabular-nums">{quantity}</span>
          <button type="button" aria-label={labels.more} disabled={scheduleLocked} className="habit-control-motion grid size-11 place-items-center rounded-full border-0 bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96] disabled:opacity-40" onClick={() => onQuantityChange(quantity + 1)}>
            <Plus size={20} strokeWidth={2} aria-hidden="true" />
          </button>
          <span className="whitespace-nowrap text-sm text-[var(--fg-3)]">{labels.count(quantity)}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
        <button
          type="button"
          aria-label={labels.repeatLess}
          disabled={scheduleLocked || intervalWeeks <= 1}
          className="habit-control-motion grid size-11 place-items-center rounded-full border-0 bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96] disabled:opacity-40"
          onClick={() => onIntervalWeeksChange(Math.max(1, intervalWeeks - 1))}
        >
          <Minus size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <span className="min-w-7 text-center font-mono text-xl tabular-nums">{intervalWeeks}</span>
        <button
          type="button"
          aria-label={labels.repeatMore}
          disabled={scheduleLocked || intervalWeeks >= MAX_HABIT_INTERVAL_WEEKS}
          className="habit-control-motion grid size-11 place-items-center rounded-full border-0 bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96] disabled:opacity-40"
          onClick={() => onIntervalWeeksChange(Math.min(MAX_HABIT_INTERVAL_WEEKS, intervalWeeks + 1))}
        >
          <Plus size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <span className="whitespace-nowrap text-sm text-[var(--fg-3)]">{labels.repeat(intervalWeeks)}</span>
      </div>
    </>
  )
}
