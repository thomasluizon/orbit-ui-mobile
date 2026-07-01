import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { Cheer } from '@orbit/shared/types/social'
import { EmptyState } from '@/components/ui/empty-state'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useCheers, useFriendFeed } from '@/hooks/use-friends'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { FeedEventCard } from './feed-event-card'
import type { CheerTarget } from './cheer-composer'

interface SocialFeedProps {
  onCheer: (target: CheerTarget) => void
  onAddFriends: () => void
}

function CheerRow({ cheer }: Readonly<{ cheer: Cheer }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const text = cheer.note
    ? t('social.feed.cheeredYouWithNote', { name: cheer.senderDisplayName, note: cheer.note })
    : t('social.feed.cheeredYou', { name: cheer.senderDisplayName })
  return (
    <View style={styles.cheerRow}>
      <UserAvatar name={cheer.senderDisplayName} size={38} />
      <Text style={styles.cheerText}>{text}</Text>
    </View>
  )
}

/** Feed sub-tab: a "cheers for you" strip above a keyset-paginated activity feed. No ranking. */
export function SocialFeed({ onCheer, onAddFriends }: Readonly<SocialFeedProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const feed = useFriendFeed()
  const cheers = useCheers('received')

  const items = feed.data?.pages.flatMap((page) => page.items) ?? []
  const receivedCheers = cheers.data?.items ?? []
  const isEmpty = !feed.isLoading && items.length === 0 && receivedCheers.length === 0

  return (
    <View style={styles.container}>
      {receivedCheers.length > 0 ? (
        <View>
          <SectionLabel>{t('social.feed.cheersForYou')}</SectionLabel>
          {receivedCheers.map((cheer) => (
            <CheerRow key={cheer.id} cheer={cheer} />
          ))}
        </View>
      ) : null}

      {feed.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={tokens.primary} />
        </View>
      ) : isEmpty ? (
        <EmptyState
          title={t('social.feed.emptyTitle')}
          description={t('social.feed.emptyBody')}
          action={{
            label: t('social.feed.emptyCta'),
            onPress: onAddFriends,
            variant: 'secondary',
          }}
        />
      ) : (
        <View>
          {items.map((item) => (
            <FeedEventCard key={item.id} item={item} onCheer={onCheer} />
          ))}
        </View>
      )}

      {feed.hasNextPage ? (
        <View style={styles.loadMore}>
          <PillButton
            variant="ghost"
            onPress={() => feed.fetchNextPage()}
            disabled={feed.isFetchingNextPage}
            busy={feed.isFetchingNextPage}
          >
            {feed.isFetchingNextPage ? t('social.feed.loading') : t('social.feed.loadMore')}
          </PillButton>
        </View>
      ) : null}
    </View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    container: { paddingBottom: 24 },
    cheerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    cheerText: { flex: 1, fontFamily: 'Rubik_400Regular', fontSize: 14, color: tokens.fg2 },
    loading: { alignItems: 'center', paddingVertical: 48 },
    loadMore: { paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center' },
  })
}
