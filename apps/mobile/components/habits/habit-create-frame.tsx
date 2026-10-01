import type { ComponentProps, ComponentType } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Sheet } from '@/components/ui/sheet'
import { AppBar } from '@/components/ui/app-bar'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { Shell412 } from '@/components/shell/shell-412'
import { KeyboardAwareScrollView, KeyboardAwareView } from '@/components/ui/keyboard-aware-scroll-view'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type HabitCreateFrameProps = ComponentProps<typeof Sheet> & {
  presentation: 'sheet' | 'screen'
  fromConversation: boolean
  leaving: boolean
  onNavigate: (action: () => void) => void
  leaveGuard?: ComponentType<{ leaving: boolean; requestLeave: () => void }>
}

export function HabitCreateFrame({ presentation, fromConversation, leaving, leaveGuard, onNavigate: _onNavigate, ...props }: Readonly<HabitCreateFrameProps>) {
  if (presentation === 'sheet') return <Sheet {...props} />
  return <HabitCreateScreenFrame {...props} fromConversation={fromConversation} leaving={leaving} leaveGuard={leaveGuard} />
}

function HabitCreateScreenFrame({ fromConversation, leaving, leaveGuard: LeaveGuard, ...props }: Readonly<Omit<HabitCreateFrameProps, 'presentation' | 'onNavigate'>>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <KeyboardAwareView style={styles.root}><Shell412 nav={false} safeAreaTop
    header={<AppBar title={props.title ?? ''} onBack={() => props.onAttemptDismiss?.()} backLabel={t('common.back')} />}
    action={<View style={styles.action}>{props.actions}</View>}>
    <KeyboardAwareScrollView avoidKeyboard={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    {fromConversation ? <View style={styles.origin}><AstraGlyph size={20} /><Text style={[styles.originText, { color: tokens.fg2 }]}>{t('habits.form.fromConversation')}</Text></View> : null}
    {LeaveGuard ? <LeaveGuard leaving={leaving} requestLeave={() => props.onAttemptDismiss?.()} /> : null}
    {props.children}
    </KeyboardAwareScrollView>
  </Shell412></KeyboardAwareView>
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  action: { alignSelf: 'center', width: '100%', maxWidth: 740, padding: 16 },
  content: { alignSelf: 'center', width: '100%', maxWidth: 592, padding: 16, gap: 24 },
  origin: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  originText: { flex: 1, fontSize: 14, lineHeight: 21, fontFamily: 'Geist_400Regular' },
})
