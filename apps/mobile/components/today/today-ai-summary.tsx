import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { AI_SUMMARY_CLAMP_CHARS } from '@orbit/shared/query'
import { PADDING, SPACING } from '@orbit/shared/theme'
import { useProfile } from '@/hooks/use-profile'
import { useSummary } from '@/hooks/use-summary'
import { useUIStore } from '@/stores/ui-store'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { Badge } from '@/components/ui/badge'
import { PillButton } from '@/components/ui/pill-button'
import { ChevronsDown, ChevronsUp, RefreshCw } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function TodayAISummary({ date }: Readonly<{ date: string }>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { profile } = useProfile()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  if (!profile || (profile.hasProAccess && !profile.aiSummaryEnabled)) return null
  if (profile.hasProAccess) return <DailySummary key={date} date={date} language={profile.language} timeZone={profile.timeZone} />
  return <SummarySection>
    <Text style={[styles.message, { color: tokens.fg2 }]}>{t('summary.freePrompt')}</Text>
    <View style={styles.actions}><PillButton variant="ghost" accessibilityRole="link" accessibleName={t('summary.upgrade')} onClick={() => router.push('/upgrade')}>{t('summary.upgrade')}</PillButton></View>
  </SummarySection>
}

function SummarySection({ children, busy = false }: Readonly<{ children: React.ReactNode; busy?: boolean }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View accessibilityState={{ busy }} style={styles.section}>
    <View style={styles.header}>
      <AstraGlyph size={20} color={tokens.fg3} />
      <Text accessibilityRole="header" style={[styles.heading, { color: tokens.fg2 }]}>{t('summary.title')}</Text>
      <Badge variant="outline">{t('aiDisclosure.isAiLabel')}</Badge>
    </View>
    {children}
  </View>
}

function DailySummary({ date, language, timeZone }: Readonly<{ date: string; language: string | null; timeZone: string | null }>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { summary, isLoading, isFetching, error, refetch } = useSummary({
    date, locale: language ?? i18n.language, timeZone, hasProAccess: true, aiSummaryEnabled: true,
  })
  if (!isLoading && !error && !summary) return null
  if (!isLoading && !error && summary) return <SummarySection><SummaryText summary={summary} busy={isFetching} /></SummarySection>
  return <SummarySection busy={isLoading || isFetching}>
    <View style={isLoading ? styles.loading : undefined}>
      <Text accessibilityState={{ busy: isLoading || isFetching }} accessibilityLiveRegion="polite" style={[styles.message, { color: tokens.fg2 }]}>{isLoading ? t('summary.loading') : t('summary.error')}</Text>
      {isLoading ? <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.placeholders}><View style={[styles.placeholder, { backgroundColor: tokens.bgWell }]} /><View style={[styles.placeholder, { width: '66.67%', backgroundColor: tokens.bgWell }]} /></View> : null}
    </View>
    <View style={styles.actions}>
      {error && !isLoading ? <PillButton variant="ghost" iconOnly label={t('summary.retry')} hint={t('summary.error')} disabled={isFetching} onClick={() => void refetch()}><RefreshCw size={20} color={tokens.fg2} /></PillButton>
        : <PillButton variant="ghost" iconOnly label={t('summary.askAstra')} hint={t('summary.loading')} disabled><AstraGlyph size={20} color={tokens.fg2} /></PillButton>}
    </View>
  </SummarySection>
}

function SummaryText({ summary, busy }: Readonly<{ summary: string; busy: boolean }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const setConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const clampable = summary.length > AI_SUMMARY_CLAMP_CHARS
  return <>
    <Text selectable style={[styles.message, { color: tokens.fg2 }]} numberOfLines={clampable && !expanded ? 3 : undefined}>{summary}</Text>
    {expanded || !clampable ? <Text style={[styles.disclaimer, { color: tokens.fg3 }]}>{t('aiDisclosure.notMedicalAdvice')}</Text> : null}
    <View style={styles.actions}>
      {clampable ? <Pressable accessibilityRole="button"
        accessibilityLabel={expanded ? t('common.seeLess') : t('common.seeMore')}
        accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)}
        onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={({ pressed }) => [styles.toggle, { backgroundColor: pressed || hovered ? tokens.bgHover : 'transparent' },
          focused ? { outlineWidth: 2, outlineStyle: 'solid', outlineColor: tokens.fg1, outlineOffset: 2 } : null]}>
        {expanded ? <ChevronsUp size={16} color={tokens.fg2} /> : <ChevronsDown size={16} color={tokens.fg2} />}
        <Text style={[styles.toggleLabel, { color: tokens.fg2 }]}>{expanded ? t('common.seeLess') : t('common.seeMore')}</Text>
      </Pressable> : null}
      <PillButton variant="ghost" iconOnly label={t('summary.askAstra')} disabled={busy} onClick={() => setConversationOpen(true)}><AstraGlyph size={20} color={tokens.fg2} /></PillButton>
    </View>
  </>
}

const styles = StyleSheet.create({
  loading: { minHeight: 14 * 1.55 * 3, gap: 8, maxWidth: 640 },
  placeholders: { gap: 8 },
  placeholder: { height: 14, borderRadius: 8 },
  section: { minWidth: 0, gap: PADDING.sectionTitleGap },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  message: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 14 * 1.55, maxWidth: 640 },
  disclaimer: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 12 * 1.5, maxWidth: 640 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.s12, paddingVertical: SPACING.s8, borderRadius: 8, overflow: 'hidden' },
  toggleLabel: { fontFamily: 'Geist_500Medium', fontSize: 14 },
})
