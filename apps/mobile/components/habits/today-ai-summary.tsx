import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Sparkles } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useProfile } from '@/hooks/use-profile'
import { useSummary } from '@/hooks/use-habits'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface TodayAISummaryProps {
  date: string
}

/**
 * Today screen "Astra" block: full-height primary rail on the left, then
 * Sparkles glyph + heading and one or two lines of message stacked on the
 * right. No card chrome. Whole block is tappable; tap destination depends on
 * state (pro → /chat, free → /upgrade, error → refetch).
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
  const styles = useMemo(() => createStyles(tokens.fg1, tokens.fg2, tokens.fg3, tokens.primary, tokens.hairline), [tokens.fg1, tokens.fg2, tokens.fg3, tokens.primary, tokens.hairline])

  const hasProAccess = profile?.hasProAccess ?? false
  const aiSummaryEnabled = profile?.aiSummaryEnabled ?? false
  const locale = profile?.language ?? i18n.language

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
  if (!resolved) return null

  const showDisclaimer =
    hasProAccess && aiSummaryEnabled && !isLoading && !error && !!summary

  return (
    <Pressable
      onPress={resolved.onPress}
      accessibilityRole="button"
      accessibilityLabel={resolved.label}
      style={({ pressed }) => [
        styles.wrap,
        pressed ? styles.wrapPressed : null,
      ]}
    >
      <View style={styles.row}>
        <View style={styles.rail} />
        <View style={styles.column}>
          <View style={styles.headerRow}>
            <Sparkles
              size={20}
              color={tokens.fg1}
              fill={tokens.fg1}
              strokeWidth={1.5}
            />
            <Text style={styles.heading}>Astra</Text>
            <Text style={styles.aiBadge}>{t('aiDisclosure.isAiLabel')}</Text>
          </View>
          <Text style={styles.message} numberOfLines={3}>
            {resolved.text}
          </Text>
          {showDisclaimer ? (
            <Text style={styles.disclaimer}>
              {t('aiDisclosure.notMedicalAdvice')}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

function createStyles(
  fg1: string,
  fg2: string,
  fg3: string,
  primary: string,
  hairline: string,
) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 16,
    },
    wrapPressed: {
      opacity: 0.6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 14,
    },
    rail: {
      width: 2,
      borderRadius: 1,
      backgroundColor: primary,
    },
    column: {
      flex: 1,
      gap: 8,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    heading: {
      fontFamily: 'Geist',
      fontSize: 20,
      fontWeight: '600',
      color: fg1,
      letterSpacing: -0.2,
    },
    aiBadge: {
      fontFamily: 'GeistMono',
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.6,
      color: fg3,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
      overflow: 'hidden',
    },
    message: {
      fontFamily: 'Geist',
      fontSize: 14,
      lineHeight: 20,
      color: fg2,
    },
    disclaimer: {
      fontFamily: 'Geist',
      fontSize: 11,
      lineHeight: 15,
      color: fg3,
      fontStyle: 'italic',
    },
  })
}
