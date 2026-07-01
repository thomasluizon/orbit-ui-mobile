import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Check, Search, X } from 'lucide-react-native'
import { buildHabitPickerOptions, filterHabitPickerOptions } from '@orbit/shared/utils'
import {
  EMPTY_CHILDREN_BY_PARENT,
  EMPTY_HABITS_BY_ID,
  EMPTY_NORMALIZED_HABITS,
  useHabits,
} from '@/hooks/use-habits'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const MAX_HABITS = 10
const RESULT_LIMIT = 60

interface HabitMultiSelectProps {
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

/** Searchable habit picker (parents + sub-habits) for accountability pairing, capped at 1–10. */
export function HabitMultiSelect({ selectedIds, onChange }: Readonly<HabitMultiSelectProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
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

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((habitId) => habitId !== id))
      return
    }
    if (atMax) return
    onChange([...selectedIds, id])
  }

  if (options.length === 0) {
    return <Text style={styles.empty}>{t('social.buddies.noHabits')}</Text>
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.hint}>{t('social.buddies.habitsHint')}</Text>
        <Text style={styles.count}>
          {t('social.buddies.habitCount', { count: selectedIds.length })}
        </Text>
      </View>

      {selectedIds.length > 0 ? (
        <View style={styles.chips}>
          {selectedIds.map((id) => {
            const option = optionsById.get(id)
            if (!option) return null
            return (
              <Pressable
                key={id}
                onPress={() => toggle(id)}
                accessibilityRole="button"
                accessibilityLabel={t('social.buddies.removeHabit', { title: option.title })}
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
              >
                <Text style={styles.chipText} numberOfLines={1}>
                  {option.title}
                </Text>
                <X size={13} color={tokens.primary} strokeWidth={2.4} />
              </Pressable>
            )
          })}
        </View>
      ) : null}

      <View style={styles.search}>
        <Search size={16} color={tokens.fg3} strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('social.buddies.searchHabits')}
          placeholderTextColor={tokens.fg3}
          style={styles.searchInput}
          autoCorrect={false}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} accessibilityLabel={t('common.clear')} hitSlop={10}>
            <X size={15} color={tokens.fg3} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      {shown.length === 0 ? (
        <Text style={styles.empty}>{t('social.buddies.noHabitMatch')}</Text>
      ) : (
        <View style={styles.list}>
          {shown.map((option) => {
            const active = selectedIds.includes(option.id)
            const disabled = !active && atMax
            return (
              <Pressable
                key={option.id}
                onPress={() => toggle(option.id)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: active ? tokens.primarySoft : tokens.bgElev,
                    borderColor: active ? tokens.primary : tokens.hairline,
                    opacity: disabled ? 0.4 : 1,
                  },
                  pressed && !disabled && styles.pressed,
                ]}
              >
                <View style={styles.rowText}>
                  <Text
                    style={[styles.title, { color: active ? tokens.primary : tokens.fg1 }]}
                    numberOfLines={1}
                  >
                    {option.title}
                  </Text>
                  {option.parentTitle ? (
                    <Text style={styles.parent} numberOfLines={1}>
                      {option.parentTitle}
                    </Text>
                  ) : null}
                </View>
                {active ? <Check size={18} color={tokens.primary} strokeWidth={2} /> : null}
              </Pressable>
            )
          })}
          {hiddenCount > 0 ? (
            <Text style={styles.more}>
              {t('social.buddies.moreHabits', { count: hiddenCount })}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    container: { gap: 10 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    hint: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg3 },
    count: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 13,
      color: tokens.fg2,
      fontVariant: ['tabular-nums'],
    },
    empty: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.fg3,
      paddingVertical: 8,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      paddingLeft: 12,
      paddingRight: 10,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: tokens.primarySoft,
    },
    chipText: { fontFamily: 'Rubik_500Medium', fontSize: 13, color: tokens.primary, flexShrink: 1 },
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      height: 44,
      borderRadius: 14,
      backgroundColor: tokens.bgSunk,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    searchInput: {
      flex: 1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      color: tokens.fg1,
      padding: 0,
    },
    list: { gap: 6 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 14,
      borderWidth: 1,
    },
    rowText: { flex: 1, gap: 2 },
    title: { fontFamily: 'Rubik_400Regular', fontSize: 15 },
    parent: { fontFamily: 'Rubik_400Regular', fontSize: 12, color: tokens.fg3 },
    more: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      color: tokens.fg3,
      paddingTop: 4,
      textAlign: 'center',
    },
    pressed: { transform: [{ scale: 0.98 }] },
  })
}
