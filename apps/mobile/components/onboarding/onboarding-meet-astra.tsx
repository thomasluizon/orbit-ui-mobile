import { useEffect, useMemo } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { Sparkles, Upload } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2, easings, tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'
import { PillButton } from '@/components/ui/pill-button'

interface OnboardingMeetAstraProps {
  onImport?: () => void
}

/** ob-2 onboarding step: tinted hero disc + Astra intro in the kit chat-bubble language.
 *  When `onImport` is provided, offers an "import from another app" shortcut into Astra. */
export function OnboardingMeetAstra({ onImport }: Readonly<OnboardingMeetAstraProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const prefersReducedMotion = usePrefersReducedMotion()
  const heroScale = useMemo(() => new Animated.Value(0), [])
  const bubbleRise = useMemo(() => new Animated.Value(0), [])

  useEffect(() => {
    if (prefersReducedMotion) {
      heroScale.setValue(1)
      bubbleRise.setValue(1)
      return
    }
    const animation = Animated.parallel([
      Animated.spring(heroScale, {
        toValue: 1,
        stiffness: 220,
        damping: 22,
        mass: 1,
        useNativeDriver: true,
      }),
      Animated.timing(bubbleRise, {
        toValue: 1,
        duration: 280,
        delay: 200,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }),
    ])
    animation.start()
    return () => animation.stop()
  }, [bubbleRise, heroScale, prefersReducedMotion])

  return (
    <View style={styles.root}>
      <Animated.View
        style={[
          styles.heroDisc,
          {
            opacity: heroScale,
            transform: [
              {
                scale: heroScale.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Sparkles size={54} strokeWidth={1.8} color={tokens.primarySoft} />
      </Animated.View>

      <Text style={styles.title}>{t('onboarding.flow.meetAstra.title')}</Text>

      <Animated.View
        style={[
          styles.bubbleRow,
          {
            opacity: bubbleRise,
            transform: [
              {
                translateY: bubbleRise.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.avatarDisc}>
          <Sparkles size={16} color={tokens.primarySoft} />
        </View>
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>
            {t('onboarding.flow.meetAstra.subtitle')}
          </Text>
        </View>
      </Animated.View>

      {onImport && (
        <PillButton
          variant="ghost"
          fullWidth
          leading={<Upload size={18} color={tokens.fg1} strokeWidth={1.8} />}
          onPress={onImport}
        >
          {t('onboarding.flow.meetAstra.import')}
        </PillButton>
      )}
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
