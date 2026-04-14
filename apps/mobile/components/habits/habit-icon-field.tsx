import { useCallback, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'
import { radius } from '@/lib/theme'
import { HabitEmoji } from './habit-emoji'
import { HabitEmojiPicker } from './habit-emoji-picker'

interface HabitIconFieldProps {
  value: string | null | undefined
  onChange: (value: string | null) => void
  title: string
  errorKey?: string | null
}

export function HabitIconField({ value, onChange, title, errorKey }: HabitIconFieldProps) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleClear = useCallback(() => {
    onChange(null)
  }, [onChange])

  const handleSelect = useCallback(
    (emoji: string) => {
      onChange(emoji)
      setPickerOpen(false)
    },
    [onChange],
  )

  const hasIcon = !!(value && value.trim().length > 0)
  const effectiveTitle = title.trim() || t('habits.title')

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{t('habits.form.icon')}</Text>
      <View style={styles.row}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={hasIcon ? t('habits.form.iconChange') : t('habits.form.iconPick')}
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.7}
          style={[
            styles.trigger,
            {
              borderColor: colors.borderMuted,
              backgroundColor: colors.surfaceElevated,
            },
          ]}
        >
          <HabitEmoji icon={value} title={effectiveTitle} size="md" />
          <View style={styles.labels}>
            <Text
              style={[styles.triggerTitle, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {hasIcon ? t('habits.form.iconChange') : t('habits.form.iconPick')}
            </Text>
            <Text
              style={[styles.triggerHint, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {hasIcon ? value : t('habits.form.iconHint')}
            </Text>
          </View>
          <ChevronDown size={18} color={colors.textMuted} />
        </TouchableOpacity>
        {hasIcon ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('habits.emojiPicker.clear')}
            onPress={handleClear}
            activeOpacity={0.7}
            style={[styles.clear, { borderColor: colors.borderMuted }]}
          >
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '500' }}>
              {t('habits.emojiPicker.clear')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {errorKey ? (
        <Text style={[styles.error, { color: colors.danger }]}>
          {t(errorKey)}
        </Text>
      ) : null}

      <HabitEmojiPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelect}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  trigger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  labels: {
    flex: 1,
    minWidth: 0,
  },
  triggerTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  triggerHint: {
    marginTop: 2,
    fontSize: 12,
  },
  clear: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  error: {
    fontSize: 12,
    marginTop: 4,
  },
})
