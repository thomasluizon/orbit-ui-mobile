import { useEffect, useMemo } from 'react'
import { Animated, StyleSheet, Text, View, Pressable } from 'react-native'
import { Trans, useTranslation } from 'react-i18next'
import { computeHabitMatchBadges } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { ChevronRight, Circle } from '@/components/ui/icons'
import { Button } from '@/components/ui/pill-button'
import { createTokensV2, radius } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

const MATCH_KEYS = { title: 'habits.search.matchTitle', description: 'habits.search.matchDescription', tag: 'habits.search.matchTag', child: 'habits.search.matchChild' } as const

export function Searching() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const reducedMotion = usePrefersReducedMotion()
  const dots = useMemo(() => [new Animated.Value(1), new Animated.Value(1), new Animated.Value(1)], [])
  useEffect(() => {
    if (reducedMotion) return
    const animations = dots.map((dot, index) => Animated.sequence([
      Animated.delay(index * 150),
      Animated.loop(Animated.sequence([
      Animated.timing(dot, { toValue: 0.35, duration: 550, useNativeDriver: true }),
      Animated.timing(dot, { toValue: 1, duration: 550, useNativeDriver: true }),
    ])),
    ]))
    animations.forEach((animation) => animation.start())
    return () => animations.forEach((animation) => animation.stop())
  }, [dots, reducedMotion])
  return <View accessibilityRole="text" accessibilityLiveRegion="polite" style={styles.loading}>
    <View importantForAccessibility="no-hide-descendants" style={styles.dots}>{dots.map((dot, index) => <Animated.View key={index} style={[styles.dot, { opacity: dot, backgroundColor: tokens.fg3 }]} />)}</View>
    <Text style={[styles.body, { color: tokens.fg3 }]}>{t('habits.search.searching')}</Text>
  </View>
}

export function SearchEmpty({ query, onCreate }: Readonly<{ query: string; onCreate: () => void }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View style={styles.empty}>
    <Text style={[styles.name, { color: tokens.fg1 }]}><Trans i18nKey="habits.search.emptyTitle" values={{ query }} components={{ queryText: <Text /> }} /></Text>
    <Text style={[styles.body, { color: tokens.fg3 }]}>{t('habits.search.emptyBody')}</Text>
    <Button size="sm" onClick={onCreate}>{t('habits.search.create')}</Button>
  </View>
}

export function SearchResult({ habit, query, onOpen, selected, actionLabel }: Readonly<{ habit: NormalizedHabit; query: string; onOpen: () => void; selected?: boolean; actionLabel?: string }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <Pressable accessibilityRole={actionLabel ? 'menuitem' : 'button'} accessibilityLabel={actionLabel ?? t('habits.search.open', { name: habit.title })} accessibilityState={{ selected }} onPress={onOpen} style={({ pressed }) => [styles.row, { backgroundColor: selected ? tokens.primaryDim : pressed ? tokens.bgHover : tokens.bgCard, borderColor: selected ? tokens.primary : tokens.hairlineGhost, borderWidth: selected ? 1.5 : 1 }]}>
    <View importantForAccessibility="no-hide-descendants" style={[styles.well, { backgroundColor: tokens.bgWell }]}>{habit.emoji ? <Text style={styles.emoji}>{habit.emoji}</Text> : <Circle size={20} color={tokens.fg3} />}</View>
    <View style={styles.content}><Text numberOfLines={1} style={[styles.name, { color: tokens.fg1 }]}>{habit.title}</Text>
      {computeHabitMatchBadges(query, habit).map((match, index) => <Text key={`${match.field}-${index}`} numberOfLines={1} style={[styles.match, { color: tokens.fg3 }]}>{t(MATCH_KEYS[match.field])}{match.value !== null && <> <Text style={{ color: tokens.fg2 }}>{`“${match.value}”`}</Text></>}</Text>)}
    </View><ChevronRight size={20} color={tokens.fg4} />
  </Pressable>
}

const styles = StyleSheet.create({
  row: { minHeight: 44, padding: 12, gap: 12, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center' },
  well: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 20 }, content: { flex: 1, minWidth: 0, gap: 0 },
  name: { fontFamily: 'Geist_400Regular', fontSize: 18 }, match: { fontFamily: 'GeistMono_400Regular', fontSize: 12 },
  body: { fontFamily: 'Geist_400Regular', fontSize: 14 }, empty: { alignItems: 'flex-start', padding: 12, gap: 12 },
  loading: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 }, dots: { flexDirection: 'row', gap: 4 }, dot: { width: 4, height: 4, borderRadius: radius.full },
})
