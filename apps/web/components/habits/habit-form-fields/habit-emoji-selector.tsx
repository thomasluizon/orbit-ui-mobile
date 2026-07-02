import { useState, useMemo, useCallback } from 'react'
import { X, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { HABIT_EMOJI_CATEGORIES, filterHabitEmojiCategories } from '@orbit/shared/utils'
import { CenteredOverlay } from '@/components/ui/centered-overlay'

interface HabitEmojiSelectorProps {
  selectedEmoji: string
  onSelect: (emoji: string) => void
}

export function HabitEmojiSelector({ selectedEmoji, onSelect }: Readonly<HabitEmojiSelectorProps>) {
  const t = useTranslations()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const searchedCategories = useMemo(() => filterHabitEmojiCategories(query), [query])
  const filteredCategories = useMemo(
    () => selectedCategoryId
      ? searchedCategories.filter((category) => category.id === selectedCategoryId)
      : searchedCategories,
    [searchedCategories, selectedCategoryId],
  )

  const closePicker = useCallback(() => {
    setPickerOpen(false)
    setQuery('')
    setSelectedCategoryId(null)
  }, [])

  function handleSelectEmoji(emoji: string) {
    onSelect(emoji)
    closePicker()
  }

  function handleSelectCategory(categoryId: string) {
    setSelectedCategoryId((current) => current === categoryId ? null : categoryId)
  }

  return (
    <>
      <button
        type="button"
        className="grid shrink-0 cursor-pointer place-items-center border-0 transition-[box-shadow,background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:shadow-[inset_0_0_0_1px_var(--hairline-strong)] active:scale-[0.96] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)]"
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          fontSize: 26,
          background: 'color-mix(in srgb, var(--fg-1) 6%, transparent)',
        }}
        onClick={() => setPickerOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        aria-label={t('habits.form.emojiOpenPicker')}
      >
        {selectedEmoji || <Plus size={22} strokeWidth={1.8} className="text-[var(--fg-3)]" aria-hidden="true" />}
      </button>

      <CenteredOverlay
        open={pickerOpen}
        onDismiss={closePicker}
        ariaLabel={t('habits.form.emojiPickerTitle')}
        panelClassName="w-full max-w-xl overflow-hidden rounded-[20px] bg-[var(--bg-sheet)] shadow-[var(--shadow-3),inset_0_0_0_1px_var(--hairline)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--hairline)] px-4 py-3">
          <div className="flex items-center gap-3">
            <span
              className="grid place-items-center rounded-[12px] bg-[var(--bg-elev)] text-xl"
              style={{ width: 40, height: 40 }}
            >
              {selectedEmoji || <Plus size={16} strokeWidth={1.8} className="text-[var(--fg-3)]" aria-hidden="true" />}
            </span>
            <div>
              <h3
                className="text-[var(--fg-1)]"
                style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500 }}
              >
                {t('habits.form.emojiPickerTitle')}
              </h3>
              <p className="text-xs text-[var(--fg-3)]">{t('habits.form.emojiDescription')}</p>
            </div>
          </div>
          <button
            type="button"
            className="touch-target grid size-10 place-items-center rounded-full text-[var(--fg-2)] hover:text-[var(--fg-1)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] transition-colors duration-[var(--dur-fast)]"
            onClick={closePicker}
            aria-label={t('common.close')}
          >
            <X size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('habits.form.emojiSearchPlaceholder')}
            className="form-input"
          />
          {selectedEmoji && (
            <button
              type="button"
              className="chip"
              onClick={() => handleSelectEmoji('')}
            >
              <X size={14} strokeWidth={1.8} aria-hidden="true" />
              {t('habits.form.emojiRemove')}
            </button>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('habits.form.emojiCategories')}>
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

          <div className="max-h-[min(420px,55vh)] overflow-y-auto pr-1">
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
                <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-9" role="listbox" aria-label={t(category.labelKey)}>
                  {category.emojis.map((emoji) => {
                    const isSelected = selectedEmoji === emoji
                    return (
                      <button
                        key={`${category.id}-${emoji}`}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        aria-label={`${t('habits.form.emoji')}: ${emoji}`}
                        className={`grid place-items-center rounded-[12px] text-xl transition-[background-color,box-shadow] duration-[var(--dur-fast)] ${
                          isSelected
                            ? 'bg-[rgba(var(--primary-rgb),0.10)] shadow-[inset_0_0_0_2px_var(--primary)]'
                            : 'hover:bg-[var(--bg-elev)]'
                        }`}
                        style={{ width: 44, height: 44 }}
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
      </CenteredOverlay>
    </>
  )
}
