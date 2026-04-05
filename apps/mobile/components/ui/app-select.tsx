import { useState } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native'
import { ChevronDown, Check } from 'lucide-react-native'
import { colors, radius, shadows } from '@/lib/theme'

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

  const selectedOption = options.find((o) => o.value === value)

  function handleSelect(optionValue: string) {
    onChange(optionValue)
    setIsOpen(false)
  }

  return (
    <>
      {/* Trigger button */}
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
        <ChevronDown size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Options modal */}
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
                      <Check size={16} color={colors.primary} />
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

const styles = StyleSheet.create({
  trigger: {
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
  triggerText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    marginRight: 8,
  },
  triggerPlaceholder: {
    color: colors.textMuted,
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
    backgroundColor: colors.surfaceOverlay,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 8,
    ...shadows.lg,
    elevation: 12,
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
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
    backgroundColor: colors.primary_10,
  },
  optionText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: '500',
  },
})
