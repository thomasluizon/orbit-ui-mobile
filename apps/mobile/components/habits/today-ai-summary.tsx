import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Sparkles } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useProfile } from '@/hooks/use-profile'
import { useSummary } from '@/hooks/use-habits'
import { PullQuote } from '@/components/chat/pull-quote'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface TodayAISummaryProps {
  date: string
}

/**
 * Today screen AI summary block — Astra-attributed PullQuote that mirrors
 * apps/web/components/habits/today-ai-summary.tsx.
 *
 * - Pro + enabled: shows summary text + "Ask Astra" link
 * - Free: upgrade prompt
 * - Pro + disabled: renders nothing (matches HabitSummaryCard behavior)
 */
export function TodayAISummary({ date }: Readonly<TodayAISummaryProps>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { profile } = useProfile()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens.fg1, tokens.hairlineStrong), [tokens.fg1, tokens.hairlineStrong])

  const hasProAccess = profile?.hasProAccess ?? false
  const aiSummaryEnabled = profile?.aiSummaryEnabled ?? false
  const locale = profile?.language ?? i18n.language

  const { summary, isLoading, error, refetch } = useSummary({
    date,
    locale,
    hasProAccess,
    aiSummaryEnabled,
  })

  const eyebrow = useMemo(
    () => (
      <View style={styles.eyebrowRow}>
        <Sparkles size={11} strokeWidth={1.7} color={tokens.primary} />
        <Text
          style={[styles.eyebrowText, { color: tokens.fg3 }]}
        >
          {hasProAccess ? `ASTRA · ${currentHour()}` : 'ASTRA'}
        </Text>
      </View>
    ),
    [hasProAccess, styles.eyebrowRow, styles.eyebrowText, tokens.fg3, tokens.primary],
  )

  if (!hasProAccess) {
    return (
      <View style={[styles.wrap, { borderBottomColor: tokens.hairline }]}>
        <PullQuote eyebrow={eyebrow} italic paddingX={0} paddingY={0}>
          {t('summary.freePrompt')}
        </PullQuote>
        <View style={styles.linkRow}>
          <Pressable
            onPress={() => router.push('/upgrade')}
            accessibilityRole="link"
            accessibilityLabel={t('summary.upgrade')}
          >
            <Text style={styles.link}>{t('summary.upgrade')}</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (!aiSummaryEnabled) return null

  if (isLoading) {
    return (
      <View style={[styles.wrap, { borderBottomColor: tokens.hairline }]}>
        <PullQuote eyebrow={eyebrow} italic paddingX={0} paddingY={0}>
          {t('summary.loading')}
        </PullQuote>
      </View>
    )
  }

  if (error) {
    return (
      <View style={[styles.wrap, { borderBottomColor: tokens.hairline }]}>
        <PullQuote eyebrow={eyebrow} italic paddingX={0} paddingY={0}>
          {t('summary.error')}
        </PullQuote>
        <View style={styles.linkRow}>
          <Pressable
            onPress={() => {
              void refetch()
            }}
            accessibilityRole="button"
            accessibilityLabel={t('summary.retry')}
          >
            <Text style={styles.link}>{t('summary.retry')}</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (!summary) return null

  return (
    <View style={[styles.wrap, { borderBottomColor: tokens.hairline }]}>
      <PullQuote eyebrow={eyebrow} italic paddingX={0} paddingY={0}>
        {summary}
      </PullQuote>
      <View style={styles.linkRow}>
        <Pressable
          onPress={() => router.push('/chat')}
          accessibilityRole="link"
          accessibilityLabel={t('summary.askAstra')}
        >
          <Text style={styles.link}>{t('summary.askAstra')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

function currentHour(): string {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function createStyles(fg1: string, hairlineStrong: string) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    eyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    eyebrowText: {
      fontFamily: 'GeistMono',
      fontSize: 10.5,
      fontWeight: '500',
      letterSpacing: 0.63,
    },
    linkRow: {
      marginTop: 10,
      paddingLeft: 14,
    },
    link: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontWeight: '500',
      color: fg1,
      textDecorationLine: 'underline',
      textDecorationColor: hairlineStrong,
    },
  })
}
