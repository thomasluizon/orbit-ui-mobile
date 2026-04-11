import { useMemo, useState } from 'react'
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Search, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { HABIT_ICON_KEYS, HABIT_ICON_MAP, type HabitIconKey } from '@/lib/habit-icon-catalog'
import { useAppTheme } from '@/lib/use-app-theme'

interface IconPickerSheetProps {
  visible: boolean
  value: string | null | undefined
  accentColor?: string | null
  onChange: (next: string | null) => void
  onClose: () => void
}

export function IconPickerSheet({
  visible,
  value,
  accentColor,
  onChange,
  onClose,
}: Readonly<IconPickerSheetProps>) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const [search, setSearch] = useState('')

  const filteredKeys = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return HABIT_ICON_KEYS
    return HABIT_ICON_KEYS.filter((key) => key.includes(q))
  }, [search])

  const accent = accentColor && /^#[0-9a-f]{6}$/i.test(accentColor) ? accentColor : colors.primary

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {t('habits.form.pickIcon')}
            </Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel={t('common.close')}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('habits.form.iconSearchPlaceholder')}
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.textPrimary }]}
            />
          </View>

          <ScrollView contentContainerStyle={styles.grid}>
            {filteredKeys.map((key) => {
              const Icon = HABIT_ICON_MAP[key as HabitIconKey]
              if (!Icon) return null
              const active = value === key
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => {
                    onChange(active ? null : key)
                    onClose()
                  }}
                  style={[
                    styles.cell,
                    {
                      backgroundColor: active ? `${accent}22` : colors.surface,
                      borderColor: active ? accent : colors.border,
                      borderWidth: active ? 2 : 1,
                    },
                  ]}
                  accessibilityLabel={key}
                  accessibilityState={{ selected: active }}
                >
                  <Icon size={20} color={active ? accent : colors.textSecondary} />
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          {value && (
            <TouchableOpacity
              onPress={() => {
                onChange(null)
                onClose()
              }}
              style={styles.removeButton}
            >
              <Text style={[styles.removeText, { color: colors.textSecondary }]}>
                {t('habits.form.removeIcon')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 12,
  },
  cell: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  removeText: {
    fontSize: 13,
    fontWeight: '500',
  },
})
