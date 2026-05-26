import { Pressable, StyleSheet } from 'react-native'
import { Sun, Moon } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** v8 icon button: 36x36, transparent, fg-2 icon. */
export function ThemeToggle() {
  const { t } = useTranslation()
  const { currentTheme, toggleTheme, currentScheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const isDark = currentTheme === 'dark'

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        isDark
          ? t('settings.theme.switchToLight')
          : t('settings.theme.switchToDark')
      }
      onPress={toggleTheme}
      style={styles.button}
    >
      {isDark ? (
        <Sun size={17} color={tokens.fg2} strokeWidth={1.5} />
      ) : (
        <Moon size={17} color={tokens.fg2} strokeWidth={1.5} />
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
