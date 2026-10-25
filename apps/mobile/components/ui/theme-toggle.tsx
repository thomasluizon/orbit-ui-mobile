import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { StyleSheet } from 'react-native'
import * as Primitive from '@rn-primitives/toggle'
import { Moon, Sun } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** Header circle button bound to the theme mode: moon in dark, sun in light. */
export function ThemeToggle() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme, toggleTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const isDark = currentTheme === 'dark'

  return (
    <Primitive.Root
      pressed={isDark}
      onPressedChange={toggleTheme}
      accessibilityRole="button"
      accessibilityLabel={
        isDark
          ? t('settings.theme.switchToLight')
          : t('settings.theme.switchToDark')
      }
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
          borderColor: tokens.hairlineStrong,
        },
        pressed ? styles.pressed : null,
      ]}
    >
      {isDark ? (
        <Moon size={20} color={tokens.fg1} strokeWidth={1.8} />
      ) : (
        <Sun size={20} color={tokens.fg1} strokeWidth={1.8} />
      )}
    </Primitive.Root>
  )
}

const styles = StyleSheet.create({
  button: {
    width: TOUCH_TARGET_MIN,
    height: TOUCH_TARGET_MIN,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
})
