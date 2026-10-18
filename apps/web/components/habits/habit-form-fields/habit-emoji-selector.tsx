import { PillButton } from '@/components/ui/pill-button'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { useState, useMemo, useCallback, useId } from 'react'
import { X, Plus, Trash2 } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { HABIT_EMOJI_CATEGORIES, filterHabitEmojiCategories } from '@orbit/shared/utils'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { revealFocusedControl } from '@/lib/focus-scroll'

interface HabitEmojiSelectorProps {
  onSuggest?: () => void
  canSuggest?: boolean
  isSuggesting?: boolean
  suggestionHint?: string
  suggestionError?: string
  selectedEmoji: string
  onSelect: (emoji: string) => void
  isDisabled?: boolean
  wellSize?: number
}

function EmojiSuggestionButton({ onSuggest, canSuggest, isSuggesting, isDisabled, suggestionHint, suggestionError, hintId, errorId }: Readonly<Pick<HabitEmojiSelectorProps, 'onSuggest' | 'canSuggest' | 'isSuggesting' | 'isDisabled' | 'suggestionHint' | 'suggestionError'> & { hintId: string; errorId: string }>) {
  const t = useTranslations()
  return onSuggest ? (
    <PillButton
      variant="ghost"
      minimumHeight={TOUCH_TARGET_MIN}
      loading={isSuggesting}
      focusableWhenLoading
      disabled={!isSuggesting && (!canSuggest || isDisabled)}
      descriptionId={[suggestionHint ? hintId : '', suggestionError ? errorId : ''].filter(Boolean).join(' ') || undefined}
      onClick={() => { if (canSuggest && !isDisabled && !isSuggesting) onSuggest() }}
    >
      {t(isSuggesting ? 'habits.form.emojiSuggesting' : 'habits.form.emojiSuggest')}
    </PillButton>
  ) : null
}

export function HabitEmojiSelector({
  onSuggest,
  canSuggest = false,
  isSuggesting = false,
  suggestionHint,
  suggestionError,
  selectedEmoji,
  onSelect,
  isDisabled = false,
  wellSize = TOUCH_TARGET_MIN,
}: Readonly<HabitEmojiSelectorProps>) {
  const t = useTranslations()
  const hintId = useId()
  const errorId = useId()
  const [pickerOpen, setPickerOpen] = useState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const [query, setQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const searchedCategories = useMemo(() => filterHabitEmojiCategories(query), [query])
  const filteredCategories = useMemo(
    () => selectedCategoryId
      ? searchedCategories.filter((category) => category.id === selectedCategoryId)
      : searchedCategories,
    [searchedCategories, selectedCategoryId],
  )

  const hidePicker = useCallback(() => {
    setPickerOpen(false)
    setQuery('')
    setSelectedCategoryId(null)
  }, [])

  function handleSelectEmoji(emoji: string) {
    if (isDisabled) return
    closeSheet(() => {
      hidePicker()
      onSelect(emoji)
    })
  }

  function handleSelectCategory(categoryId: string) {
    setSelectedCategoryId((current) => current === categoryId ? null : categoryId)
  }

  return (
    <>
      <div className="flex max-w-full min-w-0 flex-col gap-2">
        <div className="flex items-center gap-3">
        <button
          type="button"
          className="habit-control-motion grid shrink-0 cursor-pointer place-items-center border-0 bg-[var(--bg-well)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--fg-1)] focus-visible:-outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          style={{
            width: Math.max(wellSize, TOUCH_TARGET_MIN),
            height: Math.max(wellSize, TOUCH_TARGET_MIN),
            borderRadius: 'var(--r-well)',
            fontSize: wellSize === 76 ? 34 : 22,
          }}
          disabled={isDisabled}
          onClick={() => {
            if (!isDisabled) setPickerOpen(true)
          }}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          aria-label={t('habits.form.emojiOpenPicker')}
        >
          {selectedEmoji || <Plus size={20} strokeWidth={1.8} className="text-[var(--fg-3)]" aria-hidden="true" />}
        </button>
        <EmojiSuggestionButton onSuggest={onSuggest} canSuggest={canSuggest} isSuggesting={isSuggesting} isDisabled={isDisabled} suggestionHint={suggestionHint} suggestionError={suggestionError} hintId={hintId} errorId={errorId} />
        </div>
        {onSuggest && suggestionHint ? <p id={hintId} className="text-sm text-[var(--fg-2)]">{suggestionHint}</p> : null}
        {onSuggest ? <p id={errorId} role="alert" className="text-sm text-[var(--status-bad-text)]">{suggestionError}</p> : null}
      </div>

      {pickerOpen ? <Sheet ref={sheetRef} open title={t('habits.form.emojiPickerTitle')} onClose={hidePicker} headerAccessory={selectedEmoji ? (
        <div className="flex items-center gap-2">
          <span className="grid size-11 place-items-center rounded-full bg-[var(--bg-well)] text-xl">{selectedEmoji}</span>
          <button type="button" disabled={isDisabled} className="habit-control-motion group/remove grid size-[var(--touch-min)] place-items-center rounded-full text-[var(--fg-2)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45" aria-label={t('habits.form.emojiRemove')} onClick={() => onSelect('')}>
            <Trash2 size={20} strokeWidth={1.8} aria-hidden="true" className="transition-colors duration-[240ms] ease-[var(--ease-standard)] group-hover/remove:text-[var(--status-bad)]" />
          </button>
        </div>
      ) : undefined}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              // react-doctor-disable-next-line no-autofocus -- emoji search field inside a user-invoked picker overlay; the user explicitly opened the picker to search, so focusing the search box on open is the intended interaction https://github.com/thomasluizon/orbit-ui-mobile/issues/243
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={t('habits.form.emojiSearchPlaceholder')}
              placeholder={t('habits.form.emojiSearchPlaceholder')}
              className="form-input min-w-0 flex-1"
            />
            {query ? (
              <button
                type="button"
                className="habit-control-motion grid size-[var(--touch-min)] shrink-0 place-items-center rounded-full text-[var(--fg-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:bg-[var(--bg-hover)] active:scale-[0.96]"
                aria-label={t('habits.form.emojiClearSearch')}
                onClick={() => setQuery('')}
              >
                <X size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <div data-focus-inset="" onFocusCapture={revealFocusedControl} className="flex gap-2 overflow-x-auto pb-1" aria-label={t('habits.form.emojiCategories')}>
            {HABIT_EMOJI_CATEGORIES.map((category) => {
              const selected = selectedCategoryId === category.id
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={selected}
                  className={`chip ${selected ? 'chip-active' : ''}`}
                  onClick={() => handleSelectCategory(category.id)}
                >
                  {t(category.labelKey)}
                </button>
              )
            })}
          </div>

          <div className="pr-1">
            {filteredCategories.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--fg-3)]">{t('habits.form.emojiPickerEmpty')}</p>
            ) : filteredCategories.map((category) => (
              <section key={category.id} id={`habit-emoji-${category.id}`} className="scroll-mt-3 pb-4">
                <h4
                  className="mb-2 text-[var(--fg-3)]"
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500 }}
                >
                  {t(category.labelKey)}
                </h4>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(var(--touch-min),1fr))] gap-1" role="listbox" aria-label={t(category.labelKey)}>
                  {category.emojis.map((emoji) => {
                    const isSelected = selectedEmoji === emoji
                    return (
                      <button
                        key={`${category.id}-${emoji}`}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        aria-label={`${t('habits.form.emoji')}: ${emoji}`}
                        className={`orbit-selection-ring habit-control-motion grid place-items-center rounded-[12px] hover:bg-[var(--bg-hover)] text-[22px] active:bg-[var(--bg-hover)] active:scale-[0.96] ${
                          isSelected
                            ? 'bg-[rgba(var(--primary-rgb),0.10)]'
                            : 'bg-[var(--bg-field)]'
                        }`}
                        style={{ width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN }}
                        disabled={isDisabled}
                        onClick={() => handleSelectEmoji(emoji)}
                      >
                        {emoji}
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </Sheet> : null}
    </>
  )
}
