import { useCallback, useMemo, useState } from 'react'
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { Clock3 } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { detectDefaultTimeFormat, formatLocaleTime } from '@orbit/shared/utils'
import { radius, type AppColors, type AppShadows } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface AppTimePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  accessibilityLabel?: string
  disabled?: boolean
  containerStyle?: StyleProp<ViewStyle>
}

function parseTimeValue(value: string): Date {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    const fallback = new Date()
    fallback.setSeconds(0, 0)
    return fallback
  }

  const [hoursRaw, minutesRaw] = value.split(':')
  const parsed = new Date()
  parsed.setHours(Number(hoursRaw), Number(minutesRaw), 0, 0)
  return parsed
}

function formatApiTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function AppTimePicker({
  value,
  onChange,
  placeholder,
  accessibilityLabel,
  disabled = false,
  containerStyle,
}: Readonly<AppTimePickerProps>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { colors, shadows, currentTheme } = useAppTheme()
  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows])
  const [isOpen, setIsOpen] = useState(false)
  const [draftValue, setDraftValue] = useState(() => parseTimeValue(value))
  const is24Hour = detectDefaultTimeFormat(locale) === '24h'
  const displayValue = value ? formatLocaleTime(value, locale) : ''

  const openPicker = useCallback(() => {
    if (disabled) return

    const nextValue = parseTimeValue(value)
    setDraftValue(nextValue)

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: nextValue,
        mode: 'time',
        is24Hour,
        onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
          if (event.type === 'set' && selectedDate) {
            onChange(formatApiTime(selectedDate))
          }
        },
      })
      return
    }

    setIsOpen(true)
  }, [disabled, is24Hour, onChange, value])

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, containerStyle, disabled && styles.triggerDisabled]}
        onPress={openPicker}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={
          accessibilityLabel ??
          (displayValue
            ? t('common.selectedTime', { time: displayValue })
            : placeholder ?? t('common.selectTime'))
        }
      >
        <Text
          style={[
            styles.triggerText,
            !displayValue && styles.triggerPlaceholder,
            disabled && styles.triggerTextDisabled,
          ]}
          numberOfLines={1}
        >
          {displayValue || placeholder || t('common.selectTime')}
        </Text>
        <Clock3 size={16} color={disabled ? colors.textMuted : colors.textSecondary} />
      </TouchableOpacity>

      {Platform.OS === 'ios' ? (
        <Modal
          visible={isOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsOpen(false)}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setIsOpen(false)}
          >
            <View
              style={styles.dialog}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.dialogHeader}>
                <TouchableOpacity
                  onPress={() => setIsOpen(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.dialogAction}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <Text style={styles.dialogTitle}>{t('common.selectTime')}</Text>
                <TouchableOpacity
                  onPress={() => {
                    onChange(formatApiTime(draftValue))
                    setIsOpen(false)
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.dialogAction}>{t('common.done')}</Text>
                </TouchableOpacity>
              </View>

              <DateTimePicker
                value={draftValue}
                mode="time"
                display="spinner"
                themeVariant={currentTheme}
                is24Hour={is24Hour}
                onChange={(_event, selectedDate) => {
                  if (selectedDate) {
                    setDraftValue(selectedDate)
                  }
                }}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      ) : null}
    </>
  )
}

function createStyles(colors: AppColors, shadows: AppShadows) {
  return StyleSheet.create({
    trigger: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    triggerDisabled: {
      opacity: 0.6,
    },
    triggerText: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 14,
      marginRight: 8,
    },
    triggerTextDisabled: {
      color: colors.textMuted,
    },
    triggerPlaceholder: {
      color: colors.textMuted,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    dialog: {
      width: '100%',
      maxWidth: 360,
      borderRadius: radius.xl,
      backgroundColor: colors.surfaceOverlay,
      padding: 16,
      gap: 12,
      ...shadows.cardParent,
      elevation: 8,
    },
    dialogHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dialogTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    dialogAction: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
  })
}
