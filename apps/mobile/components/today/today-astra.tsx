import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import {
  getReturningInterval,
  shouldShowTodayAstraSurface,
} from '@orbit/shared/utils'
import { useProactiveItem } from '@/hooks/use-proactive-item'
import { useProfile } from '@/hooks/use-profile'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface TodayAstraProps {
  today: string
  isTodaySelected: boolean
  suppressed: boolean
}

export function TodayAstra({ isTodaySelected, suppressed }: Readonly<TodayAstraProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const [pressed, setPressed] = useState(false)
  const { profile } = useProfile()
  const { item: proactive, openItem } = useProactiveItem()
  const returning = getReturningInterval(profile?.lastCompletionDate, profile?.timeZone)

  const line = shouldShowTodayAstraSurface({ isTodaySelected, inDrillOrSurface: suppressed })
    ? proactive
      ? { text: proactive.text, destination: t('todayAstra.openConversation'), item: proactive }
      : returning
        ? {
            text: returning.kind === 'elapsed'
              ? t('todayAstra.returningElapsed', { days: returning.days })
              : t('todayAstra.returningBounded'),
            destination: t('todayAstra.viewProgress'),
            item: null,
          }
        : null
    : null
  if (!line) return null

  return (
    <Pressable
      accessibilityRole={line.item ? 'button' : 'link'}
      accessibilityLabel={line.text}
      accessibilityHint={line.destination}
      style={[styles.line, { backgroundColor: tokens.bgWell }]}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        if (line.item) {
          openItem(line.item)
        } else {
          router.navigate('/progress')
        }
      }}
    >
      {pressed ? <View accessible={false} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.feedback, { backgroundColor: tokens.bgHoverOpaque }]} /> : null}
      <View accessible={false} style={{ width: 48, flexShrink: 0, alignItems: 'center' }}>
        <AstraGlyph size={20} color={tokens.fg3} />
      </View>
      <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.text, { color: tokens.fg2 }]}>
        {line.text}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  line: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 8, paddingRight: 16, paddingVertical: 8, borderRadius: 12 },
  feedback: { borderRadius: 12 },
  text: { minWidth: 0, flex: 1, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 14 * 1.55 },
})
