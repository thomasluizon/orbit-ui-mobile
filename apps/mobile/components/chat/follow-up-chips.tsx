import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function FollowUpChips({ followUps, onSelect }: Readonly<{
  followUps: readonly string[]
  onSelect: (text: string) => void
}>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  if (followUps.length < 2) return null
  return <View style={{ gap: 8, paddingBottom: 12 }}>
    <Text style={{ color: tokens.fg3, fontSize: 12 }}>{t('chat.followUps.label')}</Text>
    <View style={{ gap: 8 }}>
      {followUps.slice(0, 3).map((text) => <Pressable
        key={text}
        accessibilityRole="button"
        accessibilityLabel={text}
        onPress={() => onSelect(text)}
        style={({ pressed }) => ({
          minHeight: TOUCH_TARGET_MIN, width: '100%', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
          backgroundColor: pressed ? tokens.bgHover : tokens.bgWell,
          borderWidth: 1, borderColor: tokens.hairline,
        })}
      ><Text style={{ color: tokens.fg2, fontSize: 14, lineHeight: 20, fontFamily: 'Geist_500Medium' }}>{text}</Text></Pressable>)}
    </View>
  </View>
}
