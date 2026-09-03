import { useState, useMemo, useCallback } from 'react'
import { X, Plus, Trash2 } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { HABIT_EMOJI_CATEGORIES, filterHabitEmojiCategories } from '@orbit/shared/utils'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

interface HabitEmojiSelectorProps {
  selectedEmoji: string
  onSelect: (emoji: string) => void
  wellSize?: number
}

export function HabitEmojiSelector({ selectedEmoji, onSelect, wellSize = 56 }: Readonly<HabitEmojiSelectorProps>) {
  const t = useTranslations()
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
      <button
        type="button"
        className="habit-control-motion grid shrink-0 cursor-pointer place-items-center border-0 hover:bg-[var(--bg-hover)] active:scale-[0.96] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)]"
        style={{
          width: wellSize,
          height: wellSize,
          borderRadius: '999px',
          fontSize: wellSize === 76 ? 34 : 26,
          background: 'var(--bg-well)',
        }}
        onClick={() => setPickerOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        aria-label={t('habits.form.emojiOpenPicker')}
      >
        {selectedEmoji || <Plus size={20} strokeWidth={1.8} className="text-[var(--fg-3)]" aria-hidden="true" />}
      </button>

      {pickerOpen ? <Sheet ref={sheetRef} open title={t('habits.form.emojiPickerTitle')} onClose={hidePicker} headerAccessory={selectedEmoji ? (
        <div className="flex items-center gap-2">
          <span className="grid size-10 place-items-center rounded-full bg-[var(--bg-well)] text-xl">{selectedEmoji}</span>
          <button type="button" className="habit-control-motion grid size-10 place-items-center rounded-full text-[var(--fg-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--status-bad)] active:scale-[0.96]" aria-label={t('habits.form.emojiRemove')} onClick={() => onSelect('')}>
            <Trash2 size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      ) : undefined}>
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <input
              // react-doctor-disable-next-line no-autofocus -- emoji search field inside a user-invoked picker overlay; the user explicitly opened the picker to search, so focusing the search box on open is the intended interaction https://github.com/thomasluizon/orbit-ui-mobile/issues/243
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('habits.form.emojiSearchPlaceholder')}
              className="form-input min-w-0 flex-1"
            />
            {query ? (
              <button
                type="button"
                className="habit-control-motion grid size-11 shrink-0 place-items-center rounded-full text-[var(--fg-2)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96]"
                aria-label={t('habits.form.emojiClearSearch')}
                onClick={() => setQuery('')}
              >
                <X size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            ) : null}
          </div>
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
                        className={`habit-control-motion grid place-items-center rounded-[12px] text-xl active:scale-[0.96] ${
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
      </Sheet> : null}
    </>
  )
}
