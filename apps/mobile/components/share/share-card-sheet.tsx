import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { isRecapShareEmpty, recapPeriodLabelKey, type RecapSharePeriod } from '@orbit/shared/utils'
import { useWrapped } from '@/hooks/use-wrapped'
import { useShareCard } from '@/hooks/use-share-card'
import { Sheet } from '@/components/ui/sheet'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { PillButton } from '@/components/ui/pill-button'
import { Download, Share2 } from '@/components/ui/icons'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ShareCard } from './share-card'

interface ShareCardSheetProps {
  onClose: () => void
}

export function ShareCardSheet({ onClose }: Readonly<ShareCardSheetProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [period, setPeriod] = useState<RecapSharePeriod>('week')
  const { recap, isLoading, isError, refetch } = useWrapped(period, { enabled: true })
  const { shareRef, isSharing, hasError, savedFileName, canShareFiles, share, download, resetFeedback } = useShareCard()
  const isEmpty = recap ? isRecapShareEmpty(recap.metrics, 0) : false
  const ready = Boolean(recap && !isLoading && !isError && !isEmpty)
  const disabled = !ready || isSharing
  const actions = <>
    <PillButton variant={canShareFiles ? 'ghost' : 'primary'} disabled={disabled} loading={isSharing} onClick={() => void download()} leadingIcon={<Download size={16} strokeWidth={2} color={canShareFiles ? tokens.fg1 : tokens.fgOnPrimary} />}>{t('shareCard.download')}</PillButton>
    {canShareFiles ? <PillButton disabled={disabled} loading={isSharing} onClick={() => {
      if (recap) void share({ shareTitle: t('shareCard.shareTitle'), shareText: t('shareCard.shareText'), url: recap.shareDeepLink })
    }} leadingIcon={<Share2 size={16} strokeWidth={2} color={tokens.fgOnPrimary} />}>{t('shareCard.share')}</PillButton> : null}
  </>

  return (
    <Sheet title={t('shareCard.share')} accessibleTitle={t('shareCard.title')} onClose={onClose} actions={actions}>
      <View style={styles.content}>
        <SegmentedControl label={t('wrapped.periodGroup')} value={period} options={[{ value: 'week', label: t(recapPeriodLabelKey('week')) }, { value: 'month', label: t(recapPeriodLabelKey('month')) }, { value: 'year', label: t(recapPeriodLabelKey('year')) }]} disabled={isSharing} onChange={(value) => { resetFeedback(); setPeriod(value) }} fullWidth />
        {isLoading || (!recap && !isError) ? <View accessible accessibilityRole="progressbar" accessibilityState={{ busy: true }} accessibilityLabel={t('shareCard.loading')} style={styles.loading}>
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="stat-tile" grouped />)}
        </View> : null}
        {isError ? <ErrorState message={t('shareCard.error')} action={<PillButton variant="ghost" onClick={() => void refetch()}>{t('common.retry')}</PillButton>} /> : null}
        {!isLoading && !isError && isEmpty ? <EmptyState title={t('shareCard.empty')} /> : null}
        {ready && recap ? <ShareCard ref={shareRef} recap={recap} variant="progress" /> : null}
        {hasError ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.feedback, { color: tokens.statusBadText }]}>{t('shareCard.shareError')}</Text> : null}
        <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: tokens.fg2 }]}>{!hasError && savedFileName ? t('shareCard.saved', { file: savedFileName }) : ''}</Text>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  content: { gap: 24, minWidth: 0 },
  loading: { minHeight: 640, gap: 24, justifyContent: 'center' },
  feedback: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24 },
})
