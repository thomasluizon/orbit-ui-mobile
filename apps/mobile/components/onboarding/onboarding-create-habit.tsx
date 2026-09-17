import { useMemo } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { Time24 } from '@orbit/shared/contracts/forms'
import { Chip } from '@/components/ui/chip'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Proposed } from '@/components/ui/proposed'
import { TimeField } from '@/components/ui/time-field'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
interface Props { emoji: string; days: string[]; dueTime: string; proposed: boolean; correcting: boolean; atLimit: boolean; allowance: number; onCorrect: () => void; onEmojiChange: (value: string) => void; onToggleDay: (day: string) => void; onTimeChange: (value: string) => void }

export function OnboardingCreateHabit(props: Readonly<Props>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const controls = <View style={[styles.controls, { backgroundColor: tokens.bgCard, borderColor: tokens.hairlineGhost }]}>
    <Text style={[styles.label, { color: tokens.fg2 }]}>{t('onboarding.flow.when.emojiLabel')}</Text>
    <TextInput accessibilityLabel={t('onboarding.flow.when.emojiLabel')} value={props.emoji} maxLength={4} onChangeText={props.onEmojiChange} style={[styles.emoji, { backgroundColor: tokens.bgField, borderColor: tokens.borderControl, color: tokens.fg1 }]} />
    <Text style={[styles.label, { color: tokens.fg2 }]}>{t('onboarding.flow.when.daysLabel')}</Text>
    <View style={styles.days}>{DAYS.map((day) => <Chip key={day} active={props.days.includes(day)} onPress={() => props.onToggleDay(day)}>{t(`onboarding.flow.when.days.${day.toLowerCase()}`)}</Chip>)}</View>
    <TimeField label={t('onboarding.flow.when.timeLabel')} value={props.dueTime as Time24 | ''} onChange={props.onTimeChange} onClear={() => props.onTimeChange('')} hint={t('onboarding.flow.when.timeHint')} />
  </View>
  return <View style={styles.root}>
    <View style={styles.intro}>{props.proposed ? <AstraGlyph size={18} color={tokens.fg3} /> : null}<Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{t(props.proposed ? 'onboarding.flow.when.astraRead' : 'onboarding.flow.when.direct')}</Text></View>
    {props.atLimit ? <CapacityNotice message={t('onboarding.flow.when.limit', { allowance: props.allowance })} /> : null}
    {props.proposed && !props.correcting ? <Proposed proposed scope="block" label={t('onboarding.flow.when.proposedBy')}><Text onPress={props.onCorrect} accessibilityRole="button" style={[styles.proposal, { backgroundColor: tokens.bgCard, color: tokens.fg2 }]}>{props.emoji}  {props.days.map((day) => t(`onboarding.flow.when.days.${day.toLowerCase()}`)).join(', ')}{props.dueTime ? ` · ${props.dueTime}` : ''}</Text></Proposed> : controls}
  </View>
}

const styles = StyleSheet.create({ root: { gap: 24 }, intro: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 }, title: { flex: 1, fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 26 }, controls: { borderRadius: 20, borderWidth: 1, gap: 16, padding: 24 }, label: { fontFamily: 'Geist_500Medium', fontSize: 14 }, emoji: { borderRadius: 12, borderWidth: 1, fontSize: 24, minHeight: 54, paddingHorizontal: 16, width: 80 }, days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, proposal: { borderRadius: 20, fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, padding: 24 } })
