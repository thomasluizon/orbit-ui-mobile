'use client'

import { TypedTextarea } from '@/components/ui/typed-textarea'
import { useId, useMemo, useState, type CSSProperties, type ReactNode, type Ref } from 'react'
import type { HabitUnderstandingProps, HabitRepeatIntervalProps } from '@orbit/shared/utils'
import { MAX_HABIT_INTERVAL_WEEKS } from '@orbit/shared/types/habit'
import { segmentHabitPhrase } from '@orbit/shared/utils'
import { Minus, Plus } from '@/components/ui/icons'
import { HabitEmojiSelector } from './habit-emoji-selector'
import { WeekdayPicker } from '@/components/ui/weekday-picker'
import { Proposed } from '@/components/ui/proposed'

const titleSingleLineHeight = 'var(--habit-title-height)'
const titleRowStyle = { '--habit-title-height': 'max(54px, calc(1.45rem + 24px))' } as CSSProperties
const titleTextStyle = { minHeight: titleSingleLineHeight, paddingBlock: `calc((${titleSingleLineHeight} - 1lh) / 2)` }

type HabitUnderstandingWithDisabledEmojiProps = HabitUnderstandingProps & {
  children?: ReactNode
  inputRef?: Ref<HTMLTextAreaElement>
  isSuggestionDisabled?: boolean
}

function useEmojiProposal(onSuggestEmoji: HabitUnderstandingProps['onSuggestEmoji'], onEmojiSelect: HabitUnderstandingProps['onEmojiSelect']) {
  const [emojiProposed, setEmojiProposed] = useState(false)
  async function suggestEmoji() {
    const result = await onSuggestEmoji?.()
    if (result?.setup) setEmojiProposed(true)
  }
  function selectEmoji(value: string) {
    setEmojiProposed(false)
    onEmojiSelect(value)
  }
  return { emojiProposed, selectEmoji, requestEmoji: onSuggestEmoji ? () => { void suggestEmoji() } : undefined }
}

export function HabitUnderstanding({
  children,
  inputRef,
  onSuggestEmoji,
  canSuggestEmoji = false,
  isEmojiSuggesting = false,
  emojiSuggestionHint,
  emojiSuggestionError,
  value,
  error,
  emoji,
  days,
  daily = false,
  dayOptions,
  quantity,
  mode,
  sentence,
  consumed,
  proposed = false,
  scheduleLocked = false,
  showSchedule = true,
  showCountCorrection = true,
  onValueChange,
  onEmojiSelect,
  isSuggestionDisabled = false,
  onToggleDay,
  onQuantityChange,
  labels,
}: Readonly<HabitUnderstandingWithDisabledEmojiProps>) {
  const id = useId()
  const phraseId = `habit-phrase-${id}`
  const errorId = `habit-phrase-error-${id}`
  const emojiErrorId = `habit-emoji-error-${id}`
  const { emojiProposed, selectEmoji, requestEmoji } = useEmojiProposal(onSuggestEmoji, onEmojiSelect)
  const hasValue = value.trim().length > 0
  const showPreview = hasValue && !isSuggestionDisabled && Boolean(sentence)
  const segments = useMemo(() => segmentHabitPhrase(value, consumed), [consumed, value])

  const emojiControl = (
    <HabitEmojiSelector
      proposed={emojiProposed || proposed}
      selectedEmoji={emoji}
      wellSize={titleSingleLineHeight}
      onSelect={selectEmoji}
      onSuggest={requestEmoji}
      canSuggest={canSuggestEmoji}
      isSuggesting={isEmojiSuggesting}
      isDisabled={isSuggestionDisabled || isEmojiSuggesting}
      suggestionHint={emojiSuggestionHint}
      suggestionError={emojiSuggestionError}
      suggestionErrorId={emojiErrorId}
    />
  )

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      <div className="flex flex-col" style={{ gap: 8 }}>
        <div data-habit-title-row="" className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2" style={titleRowStyle}>
          <label htmlFor={phraseId} className="form-label col-span-2">{labels.field}</label>
          <div data-habit-phrase-field="" data-focus-perimeter="" className="orbit-field-hover relative min-w-0 flex-1 rounded-[12px] bg-[var(--bg-field)] shadow-[inset_0_0_0_1px_var(--border-control)] has-[textarea:focus-visible]:shadow-[inset_0_0_0_2px_var(--primary)] forced-colors:border-2 forced-colors:border-[CanvasText] forced-colors:has-[textarea:focus-visible]:border-[Highlight]">
            <p
              aria-hidden="true"
              style={titleTextStyle}
              className="pointer-events-none min-h-[54px] w-full whitespace-pre-wrap break-words px-4 py-3 text-start text-base leading-[1.45] text-transparent"
            >
              {hasValue ? segments.map((segment, index) => segment.consumed ? (
                <span
                  key={`${segment.text}-${index}`}
                  data-consumed="true"
                  className="rounded-[8px] bg-[var(--bg-well)] shadow-[inset_0_-2px_0_var(--hairline-strong)]"
                >
                  {segment.text}
                </span>
              ) : segment.text) : labels.placeholder}{'\u200b'}
            </p>
            <TypedTextarea
              ref={inputRef}
              style={titleTextStyle}
              id={phraseId}
              value={value}
              rows={1}
              maxLength={200}
              spellCheck={false}
              placeholder={labels.placeholder}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              className="absolute inset-0 h-full min-h-[54px] w-full resize-none rounded-[12px] border-0 bg-transparent px-4 py-3 text-base leading-[1.45] text-[var(--fg-1)] placeholder:text-[var(--fg-3)] caret-[var(--fg-1)] focus-visible:outline-none"
              onChange={(event) => onValueChange(event.target.value)}
            />
          </div>
          {emojiControl}
        </div>
        {onSuggestEmoji ? <p id={emojiErrorId} role="alert" className="empty:absolute text-sm text-[var(--status-bad-text)]">{emojiSuggestionError}</p> : null}
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-[var(--status-bad-text)]">
            {error}
          </p>
        ) : null}
      </div>

      {children}

      {showPreview ? (
        <Proposed inset proposed={proposed} scope="block" label={labels.proposed}>
          <section aria-label={labels.understood} className="flex flex-col rounded-[20px] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline-ghost)]" style={{ gap: 16 }}>
            <p className={`text-[17px] font-medium leading-[1.4] ${proposed ? 'text-[var(--fg-3)]' : 'text-[var(--fg-1)]'}`}>{sentence}</p>
            <ScheduleCorrections hidden={!showSchedule} proposed={proposed} days={days} daily={daily} dayOptions={dayOptions} quantity={quantity} showCount={mode === 'flexible' && showCountCorrection} scheduleLocked={scheduleLocked} onToggleDay={onToggleDay} onQuantityChange={onQuantityChange} labels={labels} />
          </section>
        </Proposed>
      ) : null}
      {showSchedule && hasValue && sentence === null ? (
        <div className="flex flex-col" style={{ gap: 16 }}>
          <p className="rounded-[12px] bg-[var(--bg-well)] p-3 text-sm leading-[1.55] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)]">{labels.unresolved}</p>
          <ScheduleCorrections days={days} daily={daily} dayOptions={dayOptions} quantity={quantity} showCount={showCountCorrection} scheduleLocked={scheduleLocked} onToggleDay={onToggleDay} onQuantityChange={onQuantityChange} labels={labels} />
        </div>
      ) : null}
    </div>
  )
}

type ScheduleCorrectionProps = Pick<HabitUnderstandingProps, 'days' | 'daily' | 'dayOptions' | 'quantity' | 'scheduleLocked' | 'onToggleDay' | 'onQuantityChange' | 'labels' | 'proposed'> & { showCount: boolean; hidden?: boolean }

function ScheduleCorrections({ hidden = false, proposed = false, days, daily = false, dayOptions, quantity, showCount, scheduleLocked = false, onToggleDay, onQuantityChange, labels }: Readonly<ScheduleCorrectionProps>) {
  if (hidden) return null
  return (
    <>
      <WeekdayPicker label={labels.days} days={days} daily={daily} dayOptions={dayOptions} proposed={proposed} scheduleLocked={scheduleLocked} onToggleDay={onToggleDay} />
      {showCount ? (
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <button type="button" aria-label={labels.less} disabled={scheduleLocked} className="habit-control-motion grid size-[var(--touch-min)] place-items-center rounded-full border-0 bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] enabled:hover:bg-[var(--bg-hover)] enabled:hover:text-[var(--fg-1)] active:bg-[var(--bg-hover)] active:scale-[0.96] disabled:opacity-40" onClick={() => onQuantityChange(Math.max(1, quantity - 1))}>
            <Minus size={20} strokeWidth={2} aria-hidden="true" />
          </button>
          <span className={`min-w-7 text-center font-mono text-xl tabular-nums ${proposed ? 'text-[var(--fg-3)]' : ''}`}>{quantity}</span>
          <button type="button" aria-label={labels.more} disabled={scheduleLocked} className="habit-control-motion grid size-[var(--touch-min)] place-items-center rounded-full border-0 bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] enabled:hover:bg-[var(--bg-hover)] enabled:hover:text-[var(--fg-1)] active:bg-[var(--bg-hover)] active:scale-[0.96] disabled:opacity-40" onClick={() => onQuantityChange(quantity + 1)}>
            <Plus size={20} strokeWidth={2} aria-hidden="true" />
          </button>
          <span className="whitespace-nowrap text-sm text-[var(--fg-3)]">{labels.count(quantity)}</span>
        </div>
      ) : null}
    </>
  )
}

export function HabitRepeatInterval({ visible, intervalWeeks, scheduleLocked = false, onIntervalWeeksChange, labels }: Readonly<HabitRepeatIntervalProps>) {
  if (!visible) return null
  return (
    <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
      <button
        type="button"
        aria-label={labels.repeatLess}
        disabled={scheduleLocked || intervalWeeks <= 1}
        className="habit-control-motion grid size-[var(--touch-min)] place-items-center rounded-full border-0 bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] enabled:hover:bg-[var(--bg-hover)] enabled:hover:text-[var(--fg-1)] active:bg-[var(--bg-hover)] active:scale-[0.96] disabled:opacity-40"
        onClick={() => onIntervalWeeksChange(Math.max(1, intervalWeeks - 1))}
      >
        <Minus size={20} strokeWidth={2} aria-hidden="true" />
      </button>
      <span className="min-w-7 text-center font-mono text-xl tabular-nums">{intervalWeeks}</span>
      <button
        type="button"
        aria-label={labels.repeatMore}
        disabled={scheduleLocked || intervalWeeks >= MAX_HABIT_INTERVAL_WEEKS}
        className="habit-control-motion grid size-[var(--touch-min)] place-items-center rounded-full border-0 bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] enabled:hover:bg-[var(--bg-hover)] enabled:hover:text-[var(--fg-1)] active:bg-[var(--bg-hover)] active:scale-[0.96] disabled:opacity-40"
        onClick={() => onIntervalWeeksChange(Math.min(MAX_HABIT_INTERVAL_WEEKS, intervalWeeks + 1))}
      >
        <Plus size={20} strokeWidth={2} aria-hidden="true" />
      </button>
      <span className="whitespace-nowrap text-sm text-[var(--fg-3)]">{labels.repeat(intervalWeeks)}</span>
    </div>
  )
}
