import { useMemo } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { Gift } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** Chip that launches the free Orbit Wrapped story from the retrospective surface. */
export function WrappedEntryButton() {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens), [tokens])

  return (
    <Pressable
      onPress={() => router.push('/wrapped')}
      accessibilityRole="button"
      accessibilityLabel={t('wrapped.entry')}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev, borderColor: tokens.hairline },
        pressed ? styles.chipPressed : null,
      ]}
    >
      <Gift size={14} strokeWidth={1.8} color={tokens.fg2} />
      <Text style={styles.chipText}>{t('wrapped.entry')}</Text>
    </Pressable>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radius.full,
      borderWidth: 1,
    },
    chipPressed: {
      transform: [{ scale: 0.96 }],
    },
    chipText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg2,
    },
  })
}
