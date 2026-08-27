import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Clock3, X } from '@/components/ui/icons'
import { RadioRow } from '@/components/ui/select-check'
import { Sheet } from '@/components/ui/sheet'
import { formatLocaleTime } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface TimeFieldProps {
  value: string
  onChange: (value: string) => void
  onClear?: () => void
  placeholder?: string
  accessibilityLabel?: string
  disabled?: boolean
  containerStyle?: StyleProp<ViewStyle>
}

const HALF_HOURS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2)
  const minute = index % 2 === 0 ? '00' : '30'
  return `${String(hour).padStart(2, '0')}:${minute}`
})

export function TimeField({
  value,
  onChange,
  onClear,
  placeholder,
  accessibilityLabel,
  disabled = false,
  containerStyle,
}: Readonly<TimeFieldProps>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [open, setOpen] = useState(false)
  const options = useMemo(
    () => value && !HALF_HOURS.includes(value) ? [...HALF_HOURS, value].sort() : HALF_HOURS,
    [value],
  )
  const displayValue = value
    ? formatLocaleTime(value, i18n.language, { hour: 'numeric', minute: '2-digit' })
    : ''
  const canClear = !disabled && value.length > 0 && onClear != null

  return (
    <>
      <View style={[styles.trigger, { backgroundColor: tokens.bgField, borderColor: tokens.hairline }, containerStyle, disabled ? styles.disabled : null]}>
        <Pressable
          onPress={() => setOpen(true)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? (displayValue || placeholder || t('common.selectTime'))}
          style={styles.triggerMain}
        >
          <Text style={{ color: displayValue ? tokens.fg1 : tokens.fg3, fontFamily: 'Rubik_400Regular', fontSize: 16 }}>
            {displayValue || placeholder || t('common.selectTime')}
          </Text>
        </Pressable>
        <Pressable
          onPress={canClear ? onClear : () => setOpen(true)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={canClear ? t('common.clear') : t('common.selectTime')}
          style={styles.icon}
        >
          {canClear ? <X size={20} color={tokens.fg3} strokeWidth={1.8} /> : <Clock3 size={20} color={tokens.fg4} strokeWidth={1.8} />}
        </Pressable>
      </View>
      {open ? (
        <Sheet open title={t('common.selectTime')} onClose={() => setOpen(false)}>
          <View accessibilityRole="radiogroup">
            {options.map((option, index) => (
              <RadioRow
                key={option}
                label={formatLocaleTime(option, i18n.language, { hour: 'numeric', minute: '2-digit' })}
                selected={option === value}
                divider={index < options.length - 1}
                onPress={() => {
                  onChange(option)
                  setOpen(false)
                }}
              />
            ))}
          </View>
        </Sheet>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  trigger: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', minHeight: 54, width: '100%' },
  triggerMain: { flex: 1, justifyContent: 'center', minHeight: 52, paddingHorizontal: 16, paddingVertical: 8 },
  icon: { alignItems: 'center', justifyContent: 'center', minHeight: 52, width: 48 },
  disabled: { opacity: 0.6 },
})
