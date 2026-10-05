import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import type { AppTokens } from './styles'

interface ReminderPermissionNoticeProps {
  visible: boolean
  tokens: AppTokens
  onPress: () => void
}

export function ReminderPermissionNotice({ visible, tokens, onPress }: Readonly<ReminderPermissionNoticeProps>) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  return (
    <View style={visible ? { borderRadius: 12, backgroundColor: tokens.bgWell } : { position: 'absolute' }}>
      <Pressable
        accessible={visible}
        focusable={visible}
        accessibilityRole={visible ? 'button' : undefined}
        accessibilityLabel={visible ? t('habits.form.reminderPermissionNeeded') : undefined}
        accessibilityHint={visible ? t('habits.form.reminderSettingsHint') : undefined}
        disabled={!visible}
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [
          {
            minHeight: TOUCH_TARGET_MIN,
            justifyContent: 'center',
            paddingHorizontal: 8,
            paddingVertical: 8,
            borderRadius: 12,
          },
          (hovered || pressed) && { backgroundColor: tokens.bgHover },
          focused && { outlineWidth: 2, outlineOffset: -4, outlineStyle: 'solid', outlineColor: tokens.fg1 },
          !visible && { position: 'absolute', width: 1, height: 1, minHeight: 1, paddingHorizontal: 0, paddingVertical: 0, overflow: 'hidden', backgroundColor: 'transparent' },
        ]}
      >
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 18, color: tokens.fg2 }}>
          {visible ? t('habits.form.reminderPermissionNeeded') : ''}
        </Text>
      </Pressable>
    </View>
  )
}
