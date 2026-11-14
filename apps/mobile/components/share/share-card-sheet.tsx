import { IconButton } from '@/components/ui/icon-button'
import { useEffect, useState, type ReactNode } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PADDING, SPACING, resolveMotionPreset } from '@orbit/shared/theme'
import { isRecapShareEmpty, RECAP_SHARE_PERIODS, type RecapSharePeriod } from '@orbit/shared/utils'
import { useFlag } from '@/hooks/use-flag'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useWrapped } from '@/hooks/use-wrapped'
import { useShareCard } from '@/hooks/use-share-card'
import { useReferralInvitation } from '@/hooks/use-referral-invitation'
import { Sheet } from '@/components/ui/sheet'
import { SegmentedControl } from '@/components/ui/segmented-control'

import { Download, Share2, RefreshCw } from '@/components/ui/icons'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { OptionCard } from '@/components/ui/option-card'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { Skeleton } from '@/components/ui/skeleton'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ShareCard } from './share-card'

interface ShareCardSheetProps {
  onClose: () => void
}

function ShareCardFeedback({ hasError, savedFileName, tokens }: Readonly<{
  hasError: boolean
  savedFileName: string | null
  tokens: ReturnType<typeof createTokensV2>
}>) {
  const { t } = useTranslation()
  return (
    <View style={hasError || savedFileName ? styles.feedbackGroup : undefined}>
      <View accessible accessibilityRole="alert" accessibilityLiveRegion="polite">
        {hasError ? <Text style={[styles.feedback, { color: tokens.statusBadText }]}>{t('shareCard.shareError')}</Text> : null}
      </View>
      <View accessible accessibilityLiveRegion="polite">
        {!hasError && savedFileName ? <Text style={[styles.feedback, { color: tokens.fg2 }]}>{t('shareCard.saved', { file: savedFileName })}</Text> : null}
      </View>
    </View>
  )
}

interface SharePeriodControlProps {
  guided: boolean
  period: RecapSharePeriod
  disabled: boolean
  tokens: ReturnType<typeof createTokensV2>
  onSelect: (period: RecapSharePeriod) => void
}

/** The period choice. Guided, the three periods are quick options under the sheet heading: the data has only these three, so the choice has no free path. */
function SharePeriodControl({ guided, period, disabled, tokens, onSelect }: Readonly<SharePeriodControlProps>) {
  const { t } = useTranslation()
  const question = t('shareCard.periodQuestion')
  if (!guided) {
    return <View testID="share-period-question" style={styles.question}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.questionLabel, { color: tokens.fg2 }]}>{question}</Text><SegmentedControl label={question} value={period} options={[{ value: 'week', label: t('shareCard.periods.week') }, { value: 'month', label: t('shareCard.periods.month') }, { value: 'year', label: t('shareCard.periods.year') }]} disabled={disabled} onChange={onSelect} fullWidth /></View>
  }
  return (
    <View role="group" accessibilityLabel={question} testID="share-period-options" style={styles.options}>
      {RECAP_SHARE_PERIODS.map((value) => (
        <OptionCard key={value} label={t(`shareCard.periods.${value}`)} selected={period === value} disabled={disabled} onSelect={() => onSelect(value)} />
      ))}
    </View>
  )
}

/** A period press brings the new preview in with the selection preset. The first preview is still, and reduced motion has no scale. */
function SharePreviewChange({ changed, children }: Readonly<{ changed: boolean; children: ReactNode }>) {
  const reducedMotion = usePrefersReducedMotion()
  const { enterDuration, enterEasing, scaleFrom, scaleTo } = resolveMotionPreset('selection', reducedMotion)
  const [progress] = useState(() => new Animated.Value(changed ? 0 : 1))
  useEffect(() => {
    if (!changed) return undefined
    const enter = Animated.timing(progress, { toValue: 1, duration: enterDuration, useNativeDriver: true, easing: Easing.bezier(...enterEasing) })
    enter.start()
    return () => enter.stop()
  }, [changed, progress, enterDuration, enterEasing])
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [scaleFrom, scaleTo] })
  return <Animated.View testID="share-preview" style={{ opacity: progress, transform: [{ scale }] }}>{children}</Animated.View>
}

/** The load error with retry. Guided, Orbit in Parado states it. */
function ShareLoadError({ guided, tokens, onRetry }: Readonly<{ guided: boolean; tokens: ReturnType<typeof createTokensV2>; onRetry: () => void }>) {
  const { t } = useTranslation()
  const mascotSize = useStateMascotSize()
  const message = t('shareCard.error')
  const retry = <IconButton label={t('common.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>
  if (!guided) return <ErrorState message={message} action={retry} />
  return (
    <View testID="share-error" style={styles.error}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden><OrbitMascot size={mascotSize} state="parado" /></View>
      <Text accessible accessibilityLabel={message} accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.errorMessage, { color: tokens.fg1 }]}>{message}</Text>
      {retry}
    </View>
  )
}

export function ShareCardSheet({ onClose }: Readonly<ShareCardSheetProps>) {
  const { t } = useTranslation()
  const guided = useFlag('orbit_guided_flows')
  const [periodChanged, setPeriodChanged] = useState(false)
  const invitation = useReferralInvitation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [period, setPeriod] = useState<RecapSharePeriod>('week')
  const { recap, isLoading, isError, refetch } = useWrapped(period, { enabled: true })
  const { shareRef, isSharing, hasError, savedFileName, canShareFiles, share, download, resetFeedback } = useShareCard()
  const isEmpty = recap ? isRecapShareEmpty(recap.metrics, 0) : false
  const ready = Boolean(recap && !isLoading && !isError && !isEmpty)
  const disabled = !ready || isSharing
  const actions = <>
    <IconButton label={t('shareCard.download')} disabled={disabled} loading={isSharing} onClick={() => void download()}><Download size={20} strokeWidth={1.5} accessible={false} /></IconButton>
    {canShareFiles ? <IconButton label={t('shareCard.share')} disabled={disabled} loading={isSharing} onClick={() => {
      if (recap) void share({ shareTitle: t('shareCard.shareTitle'), shareText: invitation, url: recap.shareDeepLink })
    }}><Share2 size={20} strokeWidth={1.5} accessible={false} /></IconButton> : null}
  </>

  const selectPeriod = (value: RecapSharePeriod) => {
    resetFeedback()
    setPeriodChanged(true)
    setPeriod(value)
  }
  const card = ready && recap ? <ShareCard ref={shareRef} recap={recap} variant="progress" /> : null

  return (
    <Sheet title={guided ? t('shareCard.periodQuestion') : t('shareCard.share')} accessibleTitle={guided ? undefined : t('shareCard.title')} onClose={onClose} actions={actions}>
      <View>
        <View style={styles.content}>
          <SharePeriodControl guided={guided} period={period} disabled={isSharing} tokens={tokens} onSelect={selectPeriod} />
          {isLoading || (!recap && !isError) ? <View accessible accessibilityRole="progressbar" accessibilityState={{ busy: true }} accessibilityLabel={t('shareCard.loading')} style={styles.loading}>
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="stat-tile" grouped />)}
          </View> : null}
          {isError ? <ShareLoadError guided={guided} tokens={tokens} onRetry={() => void refetch()} /> : null}
          {!isLoading && !isError && isEmpty ? <EmptyState title={t('shareCard.empty')} /> : null}
          {card && guided ? <SharePreviewChange key={period} changed={periodChanged}>{card}</SharePreviewChange> : card}
        </View>
        <ShareCardFeedback hasError={hasError} savedFileName={savedFileName} tokens={tokens} />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  content: { gap: PADDING.sectionGap, minWidth: 0 },
  question: { gap: 8 },
  questionLabel: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  options: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: SPACING.s12 },
  error: { alignItems: 'center', gap: SPACING.s24, paddingVertical: SPACING.s48, paddingHorizontal: SPACING.s24 },
  errorMessage: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  loading: { minHeight: 640, gap: PADDING.sectionGap, justifyContent: 'center' },
  feedbackGroup: { paddingTop: PADDING.sectionGap },
  feedback: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24 },
})
