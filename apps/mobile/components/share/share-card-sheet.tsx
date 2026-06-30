import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Share2 } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import {
  isRecapShareEmpty,
  RECAP_SHARE_PERIODS,
  recapPeriodLabelKey,
  type RecapSharePeriod,
} from '@orbit/shared/utils'
import { useRecap } from '@/hooks/use-recap'
import { useShareCard } from '@/hooks/use-share-card'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { Chip } from '@/components/ui/chip'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ShareCard } from './share-card'

interface ShareCardSheetProps {
  open: boolean
  onClose: () => void
  displayName?: string
}

/** Recap share preview: period selector → recap fetch → branded ShareCard + native share. Reused by Profile + Retrospective. */
export function ShareCardSheet({ open, onClose, displayName }: Readonly<ShareCardSheetProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [period, setPeriod] = useState<RecapSharePeriod>('week')
  const { data: recap, isLoading, isError } = useRecap(period, open)
  const { shareRef, isSharing, hasError, share } = useShareCard()

  const isEmpty = recap ? isRecapShareEmpty(recap.metrics) : false
  const showCard = !isLoading && !isError && recap && !isEmpty

  return (
    <BottomSheetModal
      open={open}
      onClose={onClose}
      title={t('shareCard.title')}
      snapPoints={['70%', '92%']}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.periodRow}>
          {RECAP_SHARE_PERIODS.map((value) => (
            <Chip key={value} active={period === value} onPress={() => setPeriod(value)}>
              {t(recapPeriodLabelKey(value))}
            </Chip>
          ))}
        </View>

        {isLoading ? <Text style={styles.stateText}>{t('shareCard.loading')}</Text> : null}

        {!isLoading && isError ? (
          <Text style={styles.errorText}>{t('shareCard.error')}</Text>
        ) : null}

        {!isLoading && !isError && recap && isEmpty ? (
          <Text style={styles.stateText}>{t('shareCard.empty')}</Text>
        ) : null}

        {showCard ? (
          <>
            <View style={styles.cardWrap}>
              <ShareCard ref={shareRef} recap={recap} displayName={displayName} />
            </View>

            {hasError ? <Text style={styles.errorText}>{t('shareCard.shareError')}</Text> : null}

            <PillButton
              fullWidth
              busy={isSharing}
              disabled={isSharing}
              onPress={() => void share(t('shareCard.shareTitle'))}
              accessibilityLabel={t('shareCard.share')}
              leading={<Share2 size={18} strokeWidth={1.8} color={tokens.fgOnPrimary} />}
            >
              {t('shareCard.share')}
            </PillButton>
          </>
        ) : null}
      </ScrollView>
    </BottomSheetModal>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 16,
      paddingBottom: 28,
      gap: 16,
    },
    periodRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
    },
    cardWrap: {
      alignItems: 'center',
    },
    stateText: {
      paddingVertical: 32,
      textAlign: 'center',
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.fg3,
    },
    errorText: {
      textAlign: 'center',
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.statusBad,
    },
  })
}
