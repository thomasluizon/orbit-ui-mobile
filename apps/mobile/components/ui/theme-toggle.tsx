import { useState, useCallback } from 'react'
import { TouchableOpacity, Animated, StyleSheet } from 'react-native'
import { Sun, Moon } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { useColorScheme } from 'react-native'
import { colors } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THEME_STORAGE_KEY = 'orbit_theme_preference'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ThemeToggle() {
  const { t } = useTranslation()
  const systemScheme = useColorScheme()
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(
    systemScheme === 'light' ? 'light' : 'dark',
  )
  const [rotateAnim] = useState(() => new Animated.Value(0))

  const toggleTheme = useCallback(async () => {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark'

    // Animate rotation
    Animated.timing(rotateAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      rotateAnim.setValue(0)
    })

    setCurrentTheme(newTheme)
    await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme)

    // Note: actual theme application would need to be handled
    // by a theme context provider at the app level
  }, [currentTheme, rotateAnim])

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  })

  const isDark = currentTheme === 'dark'

  return (
    <TouchableOpacity
      style={styles.button}
      activeOpacity={0.7}
      onPress={toggleTheme}
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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(26,24,41,0.6)',
    borderWidth: 1,
    borderColor: colors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})
