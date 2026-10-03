import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { ChevronDown } from '@/components/ui/icons'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function SupportReplyEmail({ email }: Readonly<{ email: string }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [expanded, setExpanded] = useState(false)

  return (
    <View style={styles.field}>
      <InsetFocusPressable
        accessibilityRole="button"
        accessibilityLabel={t('profile.support.email')}
        accessibilityHint={`${email} ${t('profile.support.emailLockedReason')}`.trim()}
        accessibilityState={{ expanded, disabled: !email }}
        disabled={!email}
        onPress={() => setExpanded(!expanded)}
        style={({ pressed }) => [styles.control, { backgroundColor: pressed ? tokens.bgHover : tokens.bgWell }]}
      >
        <View style={styles.heading}>
          <Text style={[styles.label, { color: tokens.fg2 }]}>{t('profile.support.email')}</Text>
          {email ? <ChevronDown size={20} strokeWidth={1.5} color={tokens.fg2} accessible={false} style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined} /> : null}
        </View>
        <Text
          style={[styles.email, { color: tokens.fg1 }]}
          numberOfLines={expanded ? undefined : 2}
          ellipsizeMode="tail"
        >
          {email}
        </Text>
      </InsetFocusPressable>
      <Text style={[styles.hint, { color: tokens.fg3 }]}>{t('profile.support.emailLockedReason')}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: 8, minWidth: 0 },
  control: { minHeight: 48, width: '100%', paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderRadius: radius.md },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21, flexShrink: 1 },
  email: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, width: '100%' },
  hint: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
})
