'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Search, X } from '@/components/ui/icons'
import { buildHabitPickerOptions, filterHabitPickerOptions, plural } from '@orbit/shared/utils'
import {
  EMPTY_CHILDREN_BY_PARENT,
  EMPTY_HABITS_BY_ID,
  EMPTY_NORMALIZED_HABITS,
  useHabits,
} from '@/hooks/use-habits'

const MAX_HABITS = 10
const RESULT_LIMIT = 60

const selectedPillStyle = {
  gap: 6,
  padding: '6px 10px 6px 12px',
  borderRadius: 999,
  border: 0,
  maxWidth: '100%',
  background: 'rgba(var(--primary-rgb), 0.12)',
  color: 'var(--primary-soft)',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  fontWeight: 500,
}

interface HabitMultiSelectProps {
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

/** Searchable habit picker (parents + sub-habits) for accountability pairing, capped at 1–10. */
export function HabitMultiSelect({ selectedIds, onChange }: Readonly<HabitMultiSelectProps>) {
  const t = useTranslations()
  const { data } = useHabits({})
  const [query, setQuery] = useState('')

  const options = useMemo(
    () =>
      buildHabitPickerOptions(
        data?.topLevelHabits ?? EMPTY_NORMALIZED_HABITS,
        data?.childrenByParent ?? EMPTY_CHILDREN_BY_PARENT,
        data?.habitsById ?? EMPTY_HABITS_BY_ID,
      ),
    [data?.topLevelHabits, data?.childrenByParent, data?.habitsById],
  )
  const optionsById = useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options],
  )
  const filtered = useMemo(() => filterHabitPickerOptions(options, query), [options, query])
  const shown = filtered.slice(0, RESULT_LIMIT)
  const hiddenCount = filtered.length - shown.length
  const atMax = selectedIds.length >= MAX_HABITS
  const selectedIdSet = new Set(selectedIds)

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((habitId) => habitId !== id))
      return
    }
    if (atMax) return
    onChange([...selectedIds, id])
  }

  if (options.length === 0) {
    return (
      <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
        {t('social.buddies.noHabits')}
      </p>
    )
  }

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
          {t('social.buddies.habitsHint')}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--fg-2)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {plural(t('social.buddies.habitCount', { count: selectedIds.length }), selectedIds.length)}
        </span>
      </div>

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap" style={{ gap: 6 }}>
          {selectedIds.map((id) => {
            const option = optionsById.get(id)
            if (!option) return null
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                aria-label={t('social.buddies.removeHabit', { title: option.title })}
                className="touch-target-y flex items-center cursor-pointer transition-transform active:scale-[0.96]"
                style={selectedPillStyle}
              >
                <span className="min-w-0 truncate">{option.title}</span>
                <X size={13} strokeWidth={2.2} />
              </button>
            )
          })}
        </div>
      ) : null}

      <div
        className="flex items-center"
        style={{
          gap: 8,
          padding: '0 12px',
          height: 44,
          borderRadius: 14,
          background: 'var(--bg-sunk)',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
        }}
      >
        <Search size={16} strokeWidth={1.8} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('social.buddies.searchHabits')}
          aria-label={t('social.buddies.searchHabits')}
          className="field-ring-flush flex-1 min-w-0 rounded-[8px] bg-transparent"
          style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-1)' }}
        />
        {query.length > 0 ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t('common.clear')}
            className="flex size-10 -my-2.5 -mr-2.5 shrink-0 cursor-pointer items-center justify-center rounded-full"
            style={{ border: 0, background: 'transparent', color: 'var(--fg-3)' }}
          >
            <X size={15} strokeWidth={1.8} />
          </button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
          {t('social.buddies.noHabitMatch')}
        </p>
      ) : (
        <div className="flex flex-col" style={{ gap: 6, maxHeight: 320, overflowY: 'auto' }}>
          {shown.map((option) => {
            const active = selectedIdSet.has(option.id)
            const disabled = !active && atMax
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => toggle(option.id)}
                className="flex items-center justify-between cursor-pointer transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 14,
                  border: 0,
                  textAlign: 'left',
                  background: active ? 'rgba(var(--primary-rgb), 0.12)' : 'var(--bg-elev)',
                  boxShadow: active
                    ? 'inset 0 0 0 1px var(--primary)'
                    : 'inset 0 0 0 1px var(--hairline)',
                }}
              >
                <span className="flex flex-col min-w-0" style={{ gap: 2 }}>
                  <span
                    className="truncate"
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 15,
                      color: active ? 'var(--primary-soft)' : 'var(--fg-1)',
                    }}
                  >
                    {option.title}
                  </span>
                  {option.parentTitle ? (
                    <span
                      className="truncate"
                      style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-3)' }}
                    >
                      {option.parentTitle}
                    </span>
                  ) : null}
                </span>
                {active ? (
                  <Check size={18} strokeWidth={2} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                ) : null}
              </button>
            )
          })}
          {hiddenCount > 0 ? (
            <p
              style={{
                margin: 0,
                paddingTop: 4,
                textAlign: 'center',
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                color: 'var(--fg-3)',
              }}
            >
              {t('social.buddies.moreHabits', { count: hiddenCount })}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
