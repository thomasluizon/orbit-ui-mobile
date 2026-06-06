import { useMemo, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native'
import { ChevronDown, Check } from 'lucide-react-native'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

interface AppSelectOption {
  value: string
  label: string
}

interface AppSelectProps {
  value: string | null
  onChange: (value: string) => void
  options: AppSelectOption[]
  label?: string
}

export function AppSelect({
  value,
  onChange,
  options,
  label,
}: Readonly<AppSelectProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const { currentScheme, currentTheme, shadows } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens, shadows), [tokens, shadows])

  const selectedOption = options.find((o) => o.value === value)

  function handleSelect(optionValue: string) {
    onChange(optionValue)
    setIsOpen(false)
  }

  return (
    <>
      {}
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setIsOpen(true)}
        activeOpacity={0.7}
        accessibilityLabel={label}
        accessibilityRole="button"
      >
        <Text
          style={[
            styles.triggerText,
            !selectedOption && styles.triggerPlaceholder,
          ]}
          numberOfLines={1}
        >
          {selectedOption?.label ?? label ?? ''}
        </Text>
        <ChevronDown size={16} color={tokens.fg3} />
      </TouchableOpacity>

      {}
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
            style={styles.sheet}
            onStartShouldSetResponder={() => true}
          >
            {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}

            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              style={styles.list}
              renderItem={({ item }) => {
                const isSelected = item.value === value
                return (
                  <TouchableOpacity
                    style={[
                      styles.option,
                      isSelected && styles.optionSelected,
                    ]}
                    onPress={() => handleSelect(item.value)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {isSelected ? (
                      <Check size={16} color={tokens.primary} />
                    ) : null}
                  </TouchableOpacity>
                )
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

function createStyles(tokens: AppTokens, shadows: ReturnType<typeof useAppTheme>['shadows']) {
  return StyleSheet.create({
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: radius.sm,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    triggerText: {
      flex: 1,
      color: tokens.fg1,
      fontSize: 14,
      marginRight: 8,
    },
    triggerPlaceholder: {
      color: tokens.fg3,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.50)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    sheet: {
      width: '100%',
      maxWidth: 360,
      maxHeight: '60%',
      backgroundColor: tokens.bgElev,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 8,
      ...shadows.lg,
      elevation: 12,
    },
    sheetTitle: {
      color: tokens.fg1,
      fontSize: 14,
      fontWeight: '600',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
      marginBottom: 4,
    },
    list: {
      flexGrow: 0,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
    },
    optionSelected: {
      backgroundColor: tokens.bgSunk,
    },
    optionText: {
      flex: 1,
      color: tokens.fg1,
      fontSize: 14,
    },
    optionTextSelected: {
      color: tokens.primary,
      fontWeight: '500',
    },
  })
}
