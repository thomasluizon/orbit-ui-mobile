import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { HabitPhraseToken } from '@orbit/shared/utils'
import { ONBOARDING_STARTERS } from '@orbit/shared/utils'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface Props { sentence: string; marks: readonly HabitPhraseToken[]; onChange: (value: string) => void; onHaveAccount?: () => void }

export function OnboardingWelcome({ sentence, marks, onChange, onHaveAccount }: Readonly<Props>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  return <View style={styles.root}>
    <View style={styles.intro}><OrbitMark size={40} /><Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{t('onboarding.flow.what.title')}</Text></View>
    <Input label={t('onboarding.flow.what.label')} value={sentence} onChange={onChange} placeholder={t('onboarding.flow.what.placeholder')} maxLength={100} multiline rows={3} marks={marks} marksLabel={t('onboarding.flow.what.marksLabel')} autoFocus />
    <Text style={[styles.caption, { color: tokens.fg3 }]}>{t('onboarding.flow.what.startersTitle')}</Text>
    <View style={styles.chips}>{ONBOARDING_STARTERS.map((key) => <Chip key={key} active={sentence === t(`onboarding.flow.what.starters.${key}`)} onPress={() => onChange(t(`onboarding.flow.what.starters.${key}`))}>{t(`onboarding.flow.what.starters.${key}`)}</Chip>)}</View>
    {onHaveAccount ? <Text accessibilityRole="link" onPress={onHaveAccount} style={[styles.link, styles.linkText, { color: tokens.primarySoft }]}>{t('onboarding.flow.what.haveAccount')}</Text> : null}
  </View>
}

const styles = StyleSheet.create({ root: { gap: 24 }, intro: { gap: 8 }, title: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 28, letterSpacing: -0.56, lineHeight: 32 }, caption: { fontFamily: 'Geist_400Regular', fontSize: 14 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, link: { alignItems: 'center', minHeight: 44, justifyContent: 'center' }, linkText: { fontFamily: 'Geist_500Medium', fontSize: 14 } })
