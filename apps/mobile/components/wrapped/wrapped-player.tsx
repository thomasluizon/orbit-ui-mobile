import { useEffect, useMemo } from 'react'
import { BackHandler, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { scheduleOnRN } from 'react-native-worklets'
import { X } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import type { Recap } from '@orbit/shared/types/gamification'
import type { RecapSharePeriod } from '@orbit/shared/utils'
import { useWrappedStory, type WrappedSlide as WrappedSlideModel } from '@/hooks/use-wrapped'
import { useShareCard } from '@/hooks/use-share-card'
import { Pager } from '@/components/ui/pager'
import { PillButton } from '@/components/ui/pill-button'
import { WrappedSlide } from './wrapped-slide'
import { styles, type Tokens } from '@/app/wrapped-styles'

interface WrappedPlayerProps {
  slides: WrappedSlideModel[]
  recap: Recap
  period: RecapSharePeriod
  tokens: Tokens
  onClose: () => void
}

type PageDirection = 'back' | 'forward'

export function WrappedPlayer({
  slides,
  recap,
  period,
  tokens,
  onClose,
}: Readonly<WrappedPlayerProps>) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { index, isFirst, isLast, next, prev } = useWrappedStory(slides.length)
  const { shareRef, isSharing, hasError, canShareFiles, share, download } = useShareCard()
  const current = slides[index]

  function page(direction: PageDirection) {
    if (direction === 'forward') next()
    else prev()
  }

  const swipeDown = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(20)
        .failOffsetY(-20)
        .onEnd((event) => {
          'worklet'
          if (event.translationY > 120) {
            scheduleOnRN(onClose)
          }
        }),
    [onClose],
  )

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose()
      return true
    })
    return () => subscription.remove()
  }, [onClose])

  if (!current) return null

  return (
    <GestureDetector gesture={swipeDown}>
      <View style={[styles.player, { backgroundColor: tokens.bg }]}>
        <View style={[styles.headerRow, { paddingTop: insets.top + 12 }]}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('wrapped.close')}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            style={({ pressed }) => [styles.closeBtn, pressed ? styles.closeBtnPressed : null]}
          >
            <X size={20} color={tokens.fg1} strokeWidth={1.8} />
          </Pressable>
        </View>

        <ScrollView
          key={current.id}
          style={styles.player}
          contentContainerStyle={styles.slideScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.page}>
            <WrappedSlide
              slide={current}
              recap={recap}
              period={period}
              tokens={tokens}
              shareRef={shareRef}
              shareError={hasError}
            />

            {!isLast ? <TapZones isFirst={isFirst} onPage={page} /> : null}
          </View>
        </ScrollView>
        <PlayerPager
          count={slides.length}
          index={index}
          isFirst={isFirst}
          isLast={isLast}
          bottomInset={insets.bottom}
          progressLabel={t('wrapped.progressLabel', { current: index + 1, total: slides.length })}
          backLabel={t('wrapped.previous')}
          forwardLabel={t('wrapped.next')}
          shareLabel={t('shareCard.share')}
          downloadLabel={t('shareCard.download')}
          canShareFiles={canShareFiles}
          isSharing={isSharing}
          onShare={() => void share(t('shareCard.shareTitle'))}
          onDownload={() => void download()}
          onPage={page}
        />
      </View>
    </GestureDetector>
  )
}

function TapZones({ isFirst, onPage }: Readonly<{ isFirst: boolean; onPage: (direction: PageDirection) => void }>) {
  return (
    <View
      style={styles.tapZones}
      pointerEvents="box-none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Pressable
        testID="wrapped-previous-zone"
        accessible={false}
        focusable={false}
        disabled={isFirst}
        onPress={() => onPage('back')}
        style={styles.prevZone}
      />
      <Pressable
        testID="wrapped-next-zone"
        accessible={false}
        focusable={false}
        onPress={() => onPage('forward')}
        style={styles.nextZone}
      />
    </View>
  )
}

interface PlayerPagerProps {
  count: number
  index: number
  isFirst: boolean
  isLast: boolean
  bottomInset: number
  progressLabel: string
  backLabel: string
  forwardLabel: string
  shareLabel: string
  downloadLabel: string
  canShareFiles: boolean
  isSharing: boolean
  onShare: () => void
  onDownload: () => void
  onPage: (direction: PageDirection) => void
}

function PlayerPager(props: Readonly<PlayerPagerProps>) {
  const pagerProps = {
    count: props.count,
    index: props.index,
    label: props.progressLabel,
    backLabel: props.backLabel,
  }
  return (
    <View testID="wrapped-pager" style={[styles.pager, { paddingBottom: props.bottomInset + 16 }]}>
      {props.isLast ? (
        <Pager
          {...pagerProps}
          onBack={() => props.onPage('back')}
          forwardSlot={(
            <ShareActions
              canShareFiles={props.canShareFiles}
              isSharing={props.isSharing}
              shareLabel={props.shareLabel}
              downloadLabel={props.downloadLabel}
              onShare={props.onShare}
              onDownload={props.onDownload}
            />
          )}
        />
      ) : (
        <Pager
          {...pagerProps}
          onBack={props.isFirst ? undefined : () => props.onPage('back')}
          forwardLabel={props.forwardLabel}
          onForward={() => props.onPage('forward')}
        />
      )}
    </View>
  )
}

interface ShareActionsProps {
  canShareFiles: boolean
  isSharing: boolean
  shareLabel: string
  downloadLabel: string
  onShare: () => void
  onDownload: () => void
}

function ShareActions(props: Readonly<ShareActionsProps>) {
  return (
    <View testID="wrapped-share-actions" style={styles.shareActions}>
      {props.canShareFiles ? (
        <PillButton loading={props.isSharing} disabled={props.isSharing} onClick={props.onShare}>
          {props.shareLabel}
        </PillButton>
      ) : null}
      <PillButton
        variant={props.canShareFiles ? 'ghost' : 'primary'}
        loading={props.isSharing}
        disabled={props.isSharing}
        onClick={props.onDownload}
      >
        {props.downloadLabel}
      </PillButton>
    </View>
  )
}
