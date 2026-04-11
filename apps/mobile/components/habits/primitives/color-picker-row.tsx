import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Check, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { HABIT_COLOR_PRESETS } from '@/lib/habit-color-palette'
import { useAppTheme } from '@/lib/use-app-theme'

interface ColorPickerRowProps {
  value: string | null | undefined
  onChange: (next: string | null) => void
}

export function ColorPickerRow({ value, onChange }: Readonly<ColorPickerRowProps>) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const normalizedValue = value?.toLowerCase() ?? null

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {HABIT_COLOR_PRESETS.map((preset) => {
          const active = normalizedValue === preset
          return (
            <TouchableOpacity
              key={preset}
              onPress={() => onChange(active ? null : preset)}
              style={[
                styles.swatch,
                {
                  backgroundColor: preset,
                  borderColor: active ? '#ffffff' : 'transparent',
                  transform: [{ scale: active ? 1.1 : 1 }],
                },
              ]}
              accessibilityLabel={preset}
              accessibilityState={{ selected: active }}
            >
              {active ? <Check size={14} color="#ffffff" /> : null}
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {normalizedValue && (
        <TouchableOpacity
          onPress={() => onChange(null)}
          style={styles.removeButton}
        >
          <X size={12} color={colors.textSecondary} />
          <Text style={[styles.removeText, { color: colors.textSecondary }]}>
            {t('habits.form.removeColor')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 2,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  removeText: {
    fontSize: 12,
  },
})
