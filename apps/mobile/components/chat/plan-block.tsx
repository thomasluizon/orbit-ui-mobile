import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { AstraPlan, AstraPlanStep, ChatMessage } from '@orbit/shared/types'
import { PlanAnnouncementTracker, planStepPresentation, planStepStatus, planStepStatusKey, type PlanStepPresentation } from '@orbit/shared/chat'
import { SPACING } from '@orbit/shared/theme'
import { BlockFrame } from '@/components/ui/block-frame'
import { ProgressBar } from '@/components/ui/progress-bar'
import { Check, Minus, XCircle } from '@/components/ui/icons'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function StepMarker({ kind, index, tokens }: Readonly<{ kind: PlanStepPresentation['markerKind']; index: number; tokens: AppTokensV2 }>) {
  if (kind === 'number') return <Text style={[styles.number, { color: tokens.fg3 }]}>{index + 1}</Text>
  if (kind === 'working') return <View style={styles.working}>{[0, 1, 2].map(dot => <View key={dot} style={[styles.dot, { backgroundColor: tokens.fg2 }]} />)}</View>
  if (kind === 'done') return <Check size={16} strokeWidth={1.5} color={tokens.fg1} />
  if (kind === 'failed') return <XCircle size={16} strokeWidth={1.5} color={tokens.statusBadText} />
  return <Minus size={16} strokeWidth={1.5} color={tokens.fg3} />
}

function PlanStep({ step, index }: Readonly<{ step: AstraPlanStep; index: number }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const status = planStepStatus(step.status)
  const { markerKind, textRole, lineThrough } = planStepPresentation(status)
  const textColors: Record<PlanStepPresentation['textRole'], string> = {
    primary: tokens.fg1, muted: tokens.fg3, failed: tokens.statusBadText,
  }
  return <View role="listitem" accessible accessibilityLabel={`${step.text}, ${t(planStepStatusKey(status))}`} testID={`plan-step-${step.id}-${status}`} style={styles.row}>
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.marker}>
      <StepMarker kind={markerKind} index={index} tokens={tokens} />
    </View>
    <Text accessible={false} style={[styles.step, { color: textColors[textRole], textDecorationLine: lineThrough ? 'line-through' : 'none' }]}>{step.text}</Text>
  </View>
}

export function PlanBlock({ plan }: Readonly<{ plan: AstraPlan }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const done = plan.steps.filter(step => step.status === 'done').length
  const count = t('chat.plan.count', { done, total: plan.steps.length })
  return <View testID={`astra-plan-${plan.id}`} style={styles.block}>
    <BlockFrame title={t('chat.plan.title')} count={count} state="resting" items={[]} body={<>
      <Text style={[styles.title, { color: tokens.fg2 }]}>{plan.title}</Text>
      <ProgressBar value={done} max={plan.steps.length} label={count} />
      <View accessibilityRole="list" accessibilityLabel={`${t('chat.plan.title')}: ${plan.title}`} style={styles.steps}>
        {plan.steps.map((step, index) => <PlanStep key={step.id} step={step} index={index} />)}
      </View>
    </>} />
  </View>
}

export function PlanAnnouncements({ messages }: Readonly<{ messages: readonly ChatMessage[] }>) {
  const { t } = useTranslation()
  const runningLabel = t('blockFrame.status.acting')
  const [tracker] = useState(() => new PlanAnnouncementTracker())
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    let mounted = true
    void Promise.resolve().then(() => {
      if (!mounted) return
      const next = tracker.next(messages, runningLabel)
      if (next) setAnnouncement(next)
    })
    return () => { mounted = false }
  }, [messages, runningLabel, tracker])
  return <Text testID="plan-announcement" accessibilityLiveRegion="polite" style={styles.announcement}>{announcement}</Text>
}

const styles = StyleSheet.create({
  block: { width: '100%', minWidth: 0 },
  title: { fontFamily: 'Geist_400Regular', fontSize: 14 },
  steps: { gap: SPACING.s8, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.s12, minWidth: 0 },
  marker: { width: 20, height: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  working: { flexDirection: 'row', gap: SPACING.s4 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  number: { fontFamily: 'Geist_400Regular', fontSize: 12, fontVariant: ['tabular-nums'] },
  step: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 24, flex: 1, minWidth: 0 },
  announcement: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
})
