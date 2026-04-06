import { useState, useCallback } from 'react'
import { TouchableOpacity, Animated, StyleSheet } from 'react-native'
import { Sun, Moon } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'

export function ThemeToggle() {
  const { t } = useTranslation()
  const { currentTheme, toggleTheme, colors } = useAppTheme()
  const [rotateAnim] = useState(() => new Animated.Value(0))

  const handleToggle = useCallback(() => {
    Animated.timing(rotateAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      rotateAnim.setValue(0)
    })

    toggleTheme()
  }, [rotateAnim, toggleTheme])

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  })

  const isDark = currentTheme === 'dark'

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.borderMuted,
        },
      ]}
      activeOpacity={0.7}
      onPress={handleToggle}
      accessibilityLabel={
        isDark
          ? t('settings.theme.switchToLight')
          : t('settings.theme.switchToDark')
      }
    >
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        {isDark ? (
          <Sun size={16} color={colors.textSecondary} />
        ) : (
          <Moon size={16} color={colors.textSecondary} />
        )}
      </Animated.View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})

