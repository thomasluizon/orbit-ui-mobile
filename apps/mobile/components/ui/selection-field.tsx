import { useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { ChevronDown } from '@/components/ui/icons'
import { RadioRow } from '@/components/ui/select-check'
import { Sheet } from '@/components/ui/sheet'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface SelectionFieldOption {
  value: string
  label: string
}

interface SelectionFieldProps {
  value: string | null
  onChange: (value: string) => void
  options: SelectionFieldOption[]
  label?: string
}

export function SelectionField({ value, onChange, options, label }: Readonly<SelectionFieldProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value)

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel={label}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: tokens.bgField, borderColor: tokens.hairline },
          pressed ? styles.pressed : null,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.triggerText, { color: selected ? tokens.fg1 : tokens.fg3 }]}
        >
          {selected?.label ?? label ?? ''}
        </Text>
        <ChevronDown size={20} strokeWidth={1.8} color={tokens.fg4} />
      </Pressable>
      {open ? (
        <Sheet open title={label} onClose={() => setOpen(false)}>
          {options.map((option, index) => (
            <RadioRow
              key={option.value}
              label={option.label}
              selected={option.value === value}
              divider={index < options.length - 1}
              onPress={() => {
                onChange(option.value)
                setOpen(false)
              }}
            />
          ))}
        </Sheet>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  triggerText: {
    flex: 1,
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    marginRight: 8,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
})
