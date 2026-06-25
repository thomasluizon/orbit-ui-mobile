import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { Clock3, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { detectDefaultTimeFormat, formatLocaleTime } from '@orbit/shared/utils'
import { createTokensV2, radius, shadowsV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useProfile } from '@/hooks/use-profile'

type AppTokens = ReturnType<typeof createTokensV2>

interface AppTimePickerProps {
  value: string
  onChange: (value: string) => void
  /** Optional clear callback. When provided and value is set, a clear (X)
   *  button replaces the clock icon and tapping it invokes onClear. */
  onClear?: () => void
  placeholder?: string
  accessibilityLabel?: string
  disabled?: boolean
  containerStyle?: StyleProp<ViewStyle>
}

const HOURS_24 = Array.from({ length: 24 }, (_, index) => index)
const HOURS_12 = Array.from({ length: 12 }, (_, index) => index + 1)
const MINUTES = Array.from({ length: 60 }, (_, index) => index)
const PERIODS = ['AM', 'PM'] as const

const ROW_HEIGHT = 44
const COLUMN_HEIGHT = 220

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function parseTime(value: string): { hour24: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour24 = Number(match[1])
  const minute = Number(match[2])
  if (hour24 > 23 || minute > 59) return null
  return { hour24, minute }
}

function to12Hour(hour24: number): { hour12: number; period: 'AM' | 'PM' } {
  return {
    hour12: ((hour24 + 11) % 12) + 1,
    period: hour24 < 12 ? 'AM' : 'PM',
  }
}

function from12Hour(hour12: number, period: 'AM' | 'PM'): number {
  const base = hour12 % 12
  return period === 'PM' ? base + 12 : base
}

interface TimeColumnProps {
  values: readonly (number | string)[]
  selected: number | string
  formatValue: (value: number | string) => string
  onSelect: (value: number | string) => void
  styles: ReturnType<typeof createStyles>
}

function TimeColumn({ values, selected, formatValue, onSelect, styles }: Readonly<TimeColumnProps>) {
  const scrollRef = useRef<ScrollView>(null)
  const selectedIndex = values.findIndex((value) => value === selected)

  const centerSelected = useCallback(() => {
    if (selectedIndex < 0) return
    scrollRef.current?.scrollTo({
      y: Math.max(0, selectedIndex * ROW_HEIGHT - COLUMN_HEIGHT / 2 + ROW_HEIGHT / 2),
      animated: false,
    })
  }, [selectedIndex])

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.column}
      contentContainerStyle={styles.columnContent}
      showsVerticalScrollIndicator
      onContentSizeChange={centerSelected}
    >
      {values.map((value) => {
        const isSelected = value === selected
        return (
          <TouchableOpacity
            key={String(value)}
            onPress={() => onSelect(value)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={formatValue(value)}
            style={[styles.option, isSelected && styles.optionSelected]}
          >
            <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
              {formatValue(value)}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

export function AppTimePicker({
  value,
  onChange,
  onClear,
  placeholder,
  accessibilityLabel,
  disabled = false,
  containerStyle,
}: Readonly<AppTimePickerProps>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { profile } = useProfile()
  const is24Hour = profile?.uses24HourClock ?? detectDefaultTimeFormat(locale) === '24h'
  const [isOpen, setIsOpen] = useState(false)
  const [openNonce, setOpenNonce] = useState(0)
  const [draft, setDraft] = useState({ hour24: 9, minute: 0 })

  const displayValue = value
    ? formatLocaleTime(value, locale, { hour: 'numeric', minute: '2-digit', hour12: !is24Hour })
    : ''
  const { hour12, period } = to12Hour(draft.hour24)

  const closePicker = useCallback(() => setIsOpen(false), [])

  const openPicker = useCallback(() => {
    if (disabled) return
    const parsed = parseTime(value)
    const now = new Date()
    setDraft(parsed ?? { hour24: now.getHours(), minute: now.getMinutes() })
    setOpenNonce((current) => current + 1)
    setIsOpen(true)
  }, [disabled, value])

  function applyDraft() {
    onChange(`${pad(draft.hour24)}:${pad(draft.minute)}`)
    closePicker()
  }

  const canClear = !disabled && !!value && !!onClear

  return (
    <>
      <View style={[styles.trigger, containerStyle, disabled && styles.triggerDisabled]}>
        <Pressable
          onPress={openPicker}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={
            accessibilityLabel ??
            (displayValue
              ? t('common.selectedTime', { time: displayValue })
              : placeholder ?? t('common.selectTime'))
          }
          style={styles.triggerTextArea}
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
        </Pressable>
        {canClear ? (
          <Pressable
            onPress={onClear}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('common.clear')}
            style={styles.iconButton}
          >
            <X size={16} strokeWidth={1.8} color={tokens.fg3} />
          </Pressable>
        ) : (
          <Pressable
            onPress={openPicker}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? placeholder ?? t('common.selectTime')}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            style={styles.iconButton}
          >
            <Clock3 size={20} strokeWidth={1.8} color={tokens.fg4} />
          </Pressable>
        )}
      </View>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={closePicker}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={closePicker}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <View style={styles.dialog} onStartShouldSetResponder={() => true}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>{t('common.selectTime')}</Text>
              <TouchableOpacity
                onPress={applyDraft}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('common.done')}
              >
                <Text style={styles.dialogAction}>{t('common.done')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.columnsRow}>
              <TimeColumn
                key={`hours-${openNonce}`}
                values={is24Hour ? HOURS_24 : HOURS_12}
                selected={is24Hour ? draft.hour24 : hour12}
                formatValue={(columnValue) => pad(Number(columnValue))}
                onSelect={(columnValue) =>
                  setDraft((current) => ({
                    ...current,
                    hour24: is24Hour
                      ? Number(columnValue)
                      : from12Hour(Number(columnValue), period),
                  }))
                }
                styles={styles}
              />
              <TimeColumn
                key={`minutes-${openNonce}`}
                values={MINUTES}
                selected={draft.minute}
                formatValue={(columnValue) => pad(Number(columnValue))}
                onSelect={(columnValue) =>
                  setDraft((current) => ({ ...current, minute: Number(columnValue) }))
                }
                styles={styles}
              />
              {!is24Hour && (
                <TimeColumn
                  key={`period-${openNonce}`}
                  values={PERIODS}
                  selected={period}
                  formatValue={(columnValue) => String(columnValue)}
                  onSelect={(columnValue) =>
                    setDraft((current) => ({
                      ...current,
                      hour24: from12Hour(to12Hour(current.hour24).hour12, columnValue as 'AM' | 'PM'),
                    }))
                  }
                  styles={styles}
                />
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    trigger: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 14,
    },
    triggerDisabled: {
      opacity: 0.6,
    },
    triggerTextArea: {
      flex: 1,
      paddingVertical: 10,
      paddingLeft: 16,
      paddingRight: 8,
    },
    iconButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    triggerText: {
      color: tokens.fg1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
    },
    triggerTextDisabled: {
      color: tokens.fg3,
    },
    triggerPlaceholder: {
      color: tokens.fg3,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    dialog: {
      width: '100%',
      maxWidth: 320,
      borderRadius: radius.lg,
      backgroundColor: tokens.bgSheet,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 10,
      ...shadowsV2.shadow2,
    },
    dialogHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    dialogTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg1,
    },
    dialogAction: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.primary,
    },
    columnsRow: {
      flexDirection: 'row',
      height: COLUMN_HEIGHT,
      gap: 6,
    },
    column: {
      flex: 1,
    },
    columnContent: {
      paddingHorizontal: 4,
    },
    option: {
      height: ROW_HEIGHT,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionSelected: {
      backgroundColor: tokens.primary,
    },
    optionText: {
      color: tokens.fg1,
      fontFamily: 'Roboto_400Regular',
      fontSize: 16,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
    },
    optionTextSelected: {
      color: tokens.fgOnPrimary,
    },
  })
}
