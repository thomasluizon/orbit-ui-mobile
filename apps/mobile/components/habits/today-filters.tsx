import { View, Text, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native'
import { Search, X, MoreVertical } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'
import type { Tag } from '@/hooks/use-tags'

type FreqKey = 'Day' | 'Week' | 'Month' | 'Year' | 'none'

/**
 * Mobile parity port of `apps/web/components/habits/today-filters.tsx`.
 *
 * Renders the search bar plus the horizontal scroll of frequency and tag
 * filter chips, with the More-Vertical button anchoring the controls
 * menu. Behaviour, props, i18n keys mirror the web implementation.
 */
export interface TodayFiltersProps {
  activeView: string
  localSearchQuery: string
  selectedFrequency: FreqKey | null
  selectedTagIds: string[]
  tags: Tag[]
  frequencyOptions: Array<{ key: FreqKey; label: string }>
  onSearchChange: (value: string) => void
  onSearchClear: () => void
  onFrequencyChange: (key: FreqKey | null) => void
  onTagToggle: (tagId: string) => void
  onOpenControlsMenu: () => void
}

export function TodayFilters({
  activeView,
  localSearchQuery,
  selectedFrequency,
  selectedTagIds,
  tags,
  frequencyOptions,
  onSearchChange,
  onSearchClear,
  onFrequencyChange,
  onTagToggle,
  onOpenControlsMenu,
}: Readonly<TodayFiltersProps>) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()

  return (
    <View style={styles.root}>
      <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Search size={18} color={colors.textMuted} />
        <TextInput
          value={localSearchQuery}
          onChangeText={onSearchChange}
          placeholder={t('habits.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={t('habits.searchPlaceholder')}
          style={[styles.searchInput, { color: colors.textPrimary }]}
        />
        {localSearchQuery ? (
          <Pressable
            accessibilityLabel={t('common.clear')}
            onPress={onSearchClear}
            style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.6 }]}
          >
            <X size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.chipsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
          style={{ flex: 1 }}
        >
          {activeView !== 'general' ? (
            <>
              <FilterChip
                label={t('common.all')}
                active={!selectedFrequency}
                onPress={() => onFrequencyChange(null)}
                colors={colors}
              />
              {frequencyOptions.map((opt) => (
                <FilterChip
                  key={opt.key}
                  label={opt.label}
                  active={selectedFrequency === opt.key}
                  onPress={() => onFrequencyChange(selectedFrequency === opt.key ? null : opt.key)}
                  colors={colors}
                />
              ))}
            </>
          ) : null}

          {tags.length > 0 ? (
            <>
              {activeView !== 'general' ? (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              ) : null}
              {tags.map((tag) => {
                const isActive = selectedTagIds.includes(tag.id)
                return (
                  <Pressable
                    key={tag.id}
                    onPress={() => onTagToggle(tag.id)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: isActive ? tag.color : colors.surface,
                        borderColor: isActive ? tag.color : colors.border,
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    {!isActive ? (
                      <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
                    ) : null}
                    <Text style={[styles.chipText, { color: isActive ? colors.white : colors.textFaded }]}>
                      {tag.name}
                    </Text>
                  </Pressable>
                )
              })}
            </>
          ) : null}
        </ScrollView>

        <Pressable
          accessibilityLabel={t('habits.actions.more')}
          onPress={onOpenControlsMenu}
          style={({ pressed }) => [styles.moreBtn, pressed && { opacity: 0.6 }]}
        >
          <MoreVertical size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  )
}

function FilterChip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string
  active: boolean
  onPress: () => void
  colors: ReturnType<typeof useAppTheme>['colors']
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.surface,
          borderColor: active ? colors.primary : colors.border,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? colors.white : colors.textFaded }]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 12,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 9999,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  chipsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 24,
  },
  divider: {
    width: 1,
    height: 24,
    alignSelf: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  moreBtn: {
    padding: 8,
    borderRadius: 12,
  },
})
