import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Sparkles } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { AI_SUMMARY_CLAMP_CHARS } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { useSummary } from '@/hooks/use-habits'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface TodayAISummaryProps {
  date: string
}

/**
 * Today screen "Astra" summary card on the kit InfoCard chrome: primary 0.10
 * tint, 0.28 ring, radius 18, sparkles + ASTRA eyebrow over the message.
 * Whole card is tappable; tap destination depends on state (pro → /chat,
 * free → /upgrade, error → refetch).
 *
 * - Pro + enabled: shows the AI summary text
 * - Free: shows the upgrade prompt
 * - Pro + disabled: renders nothing
 */
export function TodayAISummary({ date }: Readonly<TodayAISummaryProps>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { profile } = useProfile()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens), [tokens])

  const hasProAccess = profile?.hasProAccess ?? false
  const aiSummaryEnabled = profile?.aiSummaryEnabled ?? false
  const locale = profile?.language ?? i18n.language
  const [expanded, setExpanded] = useState(false)

  const { summary, isLoading, error, refetch } = useSummary({
    date,
    locale,
    hasProAccess,
    aiSummaryEnabled,
  })

  function body(): { text: string; onPress: () => void; label: string } | null {
    if (!hasProAccess) {
      return {
        text: t('summary.freePrompt'),
        onPress: () => router.push('/upgrade'),
        label: t('summary.upgrade'),
      }
    }
    if (!aiSummaryEnabled) return null
    if (isLoading) {
      return {
        text: t('summary.loading'),
        onPress: () => router.push('/chat'),
        label: t('summary.loading'),
      }
    }
    if (error) {
      return {
        text: t('summary.error'),
        onPress: () => {
          void refetch()
        },
        label: t('summary.retry'),
      }
    }
    if (!summary) return null
    return {
      text: summary,
      onPress: () => router.push('/chat'),
      label: t('summary.askAstra'),
    }
  }

  const resolved = body()

  const isSummaryText =
    hasProAccess && aiSummaryEnabled && !isLoading && !error && !!summary
  const clampable = isSummaryText && (summary?.length ?? 0) > AI_SUMMARY_CLAMP_CHARS

  if (!resolved) return null

  const showDisclaimer = isSummaryText && (expanded || !clampable)

  return (
    <Pressable
      onPress={resolved.onPress}
      accessibilityRole="button"
      accessibilityLabel={resolved.label}
      style={styles.wrap}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.card,
            pressed
              ? [
                  styles.cardPressed,
                  { borderColor: tintFromPrimary(tokens, 0.45) },
                ]
              : null,
          ]}
        >
          <View style={styles.headerRow}>
            <Sparkles size={16} color={tokens.primarySoft} strokeWidth={1.9} />
            <Text style={styles.eyebrow}>Astra</Text>
            <Text style={styles.aiBadge}>{t('aiDisclosure.isAiLabel')}</Text>
          </View>
          <Text
            style={styles.message}
            numberOfLines={clampable && !expanded ? 3 : undefined}
          >
            {resolved.text}
          </Text>
          {clampable ? (
            <Pressable
              onPress={(event) => {
                event.stopPropagation()
                setExpanded((current) => !current)
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={expanded ? t('common.seeLess') : t('common.seeMore')}
            >
              <Text style={styles.expandToggle}>
                {expanded ? t('common.seeLess') : t('common.seeMore')}
              </Text>
            </Pressable>
          ) : null}
          {showDisclaimer ? (
            <Text style={styles.disclaimer}>
              {t('aiDisclosure.notMedicalAdvice')}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 6,
    },
    card: {
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: tintFromPrimary(tokens, 0.10),
      borderWidth: 1,
      borderColor: tintFromPrimary(tokens, 0.28),
    },
    cardPressed: {
      transform: [{ scale: 0.99 }],
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    eyebrow: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: tokens.primarySoft,
    },
    aiBadge: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 10,
      letterSpacing: 0.6,
      color: tokens.fg3,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 1,
      overflow: 'hidden',
    },
    message: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 20,
      color: tokens.fg1,
    },
    expandToggle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      color: tokens.primarySoft,
      marginTop: 6,
    },
    disclaimer: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 11,
      lineHeight: 15,
      color: tokens.fg4,
      marginTop: 6,
    },
  })
}
