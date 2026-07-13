import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- RN Animated with useNativeDriver drives the select transform/opacity on the UI thread already; Reanimated 4.x migration deferred (worklets 0.10.0 ABI-pinned to the SDK 57 set, needs on-device QA) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  Animated,
  Modal,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
} from 'react-native'
import { ChevronDown, Check } from 'lucide-react-native'
import { createTokensV2, radius, shadowsV2, tintFromPrimary } from '@/lib/theme'
import { toAnimatedEasing, useResolvedMotionPreset } from '@/lib/motion'
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

interface AppSelectOptionRowProps {
  option: AppSelectOption
  isSelected: boolean
  primaryColor: string
  styles: ReturnType<typeof createStyles>
  onSelect: (value: string) => void
}

const AppSelectOptionRow = memo(function AppSelectOptionRow({
  option,
  isSelected,
  primaryColor,
  styles,
  onSelect,
}: Readonly<AppSelectOptionRowProps>) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.option,
        isSelected && styles.optionSelected,
        pressed ? { opacity: 0.7 } : null,
      ]}
      onPress={() => onSelect(option.value)}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
    >
      <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
        {option.label}
      </Text>
      {isSelected ? (
        <Check size={18} strokeWidth={1.8} color={primaryColor} />
      ) : null}
    </Pressable>
  )
})

export function AppSelect({
  value,
  onChange,
  options,
  label,
}: Readonly<AppSelectProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const dialogMotion = useResolvedMotionPreset('dialog')
  const progress = useMemo(() => new Animated.Value(0), [])

  const [prevOpen, setPrevOpen] = useState(isOpen)
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen)
    if (isOpen) setVisible(true)
  }

  // react-doctor-disable-next-line no-event-handler -- mount/exit-animation orchestration: `visible` keeps the Modal mounted through the exit timing driven by the isOpen transition; not a synthetic event handler https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  useEffect(() => {
    if (isOpen) {
      Animated.timing(progress, {
        toValue: 1,
        duration: dialogMotion.enterDuration,
        easing: toAnimatedEasing(dialogMotion.enterEasing),
        useNativeDriver: true,
      }).start()
      return
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: dialogMotion.exitDuration,
      easing: toAnimatedEasing(dialogMotion.exitEasing),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setVisible(false)
      }
    })
  }, [
    dialogMotion.enterDuration,
    dialogMotion.enterEasing,
    dialogMotion.exitDuration,
    dialogMotion.exitEasing,
    isOpen,
    progress,
  ])

  const selectedOption = options.find((o) => o.value === value)

  const handleSelect = useCallback(
    (optionValue: string) => {
      onChange(optionValue)
      setIsOpen(false)
    },
    [onChange],
  )

  const renderOption = useCallback(
    ({ item }: { item: AppSelectOption }) => (
      <AppSelectOptionRow
        option={item}
        isSelected={item.value === value}
        primaryColor={tokens.primary}
        styles={styles}
        onSelect={handleSelect}
      />
    ),
    [handleSelect, styles, tokens.primary, value],
  )

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [dialogMotion.shift, 0],
  })
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [dialogMotion.scaleFrom, dialogMotion.scaleTo],
  })

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.trigger,
          pressed ? { opacity: 0.7 } : null,
        ]}
        onPress={() => setIsOpen(true)}
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
        <ChevronDown size={20} strokeWidth={1.8} color={tokens.fg4} />
      </Pressable>

      {visible ? (
        <Modal
          visible
          transparent
          animationType="none"
          onRequestClose={() => setIsOpen(false)}
        >
          <Pressable
            style={styles.root}
            onPress={() => setIsOpen(false)}
            importantForAccessibility="no"
          >
            <Animated.View
              pointerEvents="none"
              style={[styles.backdrop, { opacity: progress }]}
            />
            <Animated.View
              style={[
                styles.sheet,
                {
                  opacity: progress,
                  transform: [{ translateY }, { scale }],
                },
              ]}
              onStartShouldSetResponder={() => true}
            >
              {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}

              <FlatList
                data={options}
                keyExtractor={(item) => item.value}
                style={styles.list}
                renderItem={renderOption}
              />
            </Animated.View>
          </Pressable>
        </Modal>
      ) : null}
    </>
  )
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    triggerText: {
      flex: 1,
      color: tokens.fg1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      marginRight: 8,
    },
    triggerPlaceholder: {
      color: tokens.fg3,
    },
    root: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.50)',
    },
    sheet: {
      width: '100%',
      maxWidth: 360,
      maxHeight: '60%',
      backgroundColor: tokens.bgSheet,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 8,
      ...shadowsV2.shadow2,
    },
    sheetTitle: {
      color: tokens.fg1,
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
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
      backgroundColor: tintFromPrimary(tokens, 0.12),
    },
    optionText: {
      flex: 1,
      color: tokens.fg1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
    },
    optionTextSelected: {
      color: tokens.primary,
      fontFamily: 'Rubik_500Medium',
    },
  })
}
