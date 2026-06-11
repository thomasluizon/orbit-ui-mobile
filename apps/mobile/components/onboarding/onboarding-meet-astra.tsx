import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Sparkles } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2, tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** ob-2 onboarding step: tinted hero disc + Astra intro in the kit chat-bubble language. */
export function OnboardingMeetAstra() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])

  return (
    <View style={styles.root}>
      <View style={styles.heroDisc}>
        <Sparkles size={54} strokeWidth={1.8} color={tokens.primarySoft} />
      </View>

      <Text style={styles.title}>{t('onboarding.flow.meetAstra.title')}</Text>

      <View style={styles.bubbleRow}>
        <View style={styles.avatarDisc}>
          <Sparkles size={16} color={tokens.primarySoft} />
        </View>
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>
            {t('onboarding.flow.meetAstra.subtitle')}
          </Text>
        </View>
      </View>
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    root: {
      alignItems: 'center',
      gap: 22,
      paddingTop: 24,
      paddingBottom: 8,
    },
    heroDisc: {
      width: 116,
      height: 116,
      borderRadius: 999,
      backgroundColor: tintFromPrimary(tokens, 0.14),
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 28,
      letterSpacing: -0.28,
      lineHeight: 32,
      color: tokens.fg1,
      textAlign: 'center',
    },
    bubbleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      alignSelf: 'stretch',
      maxWidth: 340,
    },
    avatarDisc: {
      width: 30,
      height: 30,
      borderRadius: 999,
      backgroundColor: tintFromPrimary(tokens, 0.18),
      alignItems: 'center',
      justifyContent: 'center',
    },
    bubble: {
      flex: 1,
      backgroundColor: tokens.bgElev,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 15,
    },
    bubbleText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 22,
      color: tokens.fg1,
    },
  })
}
