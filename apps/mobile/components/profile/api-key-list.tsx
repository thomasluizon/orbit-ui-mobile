import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PADDING, SPACING } from '@orbit/shared/theme'
import type { ApiKey } from '@orbit/shared/types'
import { InlineLoadError } from '@/components/ui/inline-load-error'
import { Key } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { RowList } from '@/components/ui/row-list'
import { Skeleton } from '@/components/ui/skeleton'
import { useDateFormat } from '@/hooks/use-date-format'
import { useThemeTokens } from '@/hooks/use-theme-tokens'

function ApiKeyDetails({ apiKey }: Readonly<{ apiKey: ApiKey }>) {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const { displayDateMedium } = useDateFormat()
  const textStyle = [styles.keyDetailText, { color: tokens.fg3 }]
  return (
    <View style={styles.keyDetails}>
      <Text selectable style={textStyle}>{apiKey.scopes.length > 0 ? apiKey.scopes.join(', ') : t('orbitMcp.noScopes')}</Text>
      <Text selectable style={textStyle}>{apiKey.isReadOnly ? t('orbitMcp.permReadOnly') : t('orbitMcp.permReadWrite')}</Text>
      <View style={styles.keyDates}>
        <View style={styles.keyDateRow}>
          <Text selectable style={textStyle}>{t('orbitMcp.created')}</Text>
          <Text selectable style={textStyle}>{displayDateMedium(apiKey.createdAtUtc)}</Text>
        </View>
        <View style={styles.keyDateRow}>
          <Text selectable style={textStyle}>{t('orbitMcp.lastUsed')}</Text>
          <Text selectable style={textStyle}>{apiKey.lastUsedAtUtc ? displayDateMedium(apiKey.lastUsedAtUtc) : t('orbitMcp.never')}</Text>
        </View>
      </View>
      <Text selectable style={textStyle}>{apiKey.expiresAtUtc
        ? t('orbitMcp.expiresOn', { date: displayDateMedium(apiKey.expiresAtUtc) })
        : t('common.never')}</Text>
    </View>
  )
}

interface ApiKeyListProps {
  apiKeys: ApiKey[]
  isLoading: boolean
  loadError: Error | null
  onRevoke: (id: string) => void
  onRetry: () => void
}

export function ApiKeyList({ apiKeys, isLoading, loadError, onRevoke, onRetry }: Readonly<ApiKeyListProps>) {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  if (isLoading) {
    return <Skeleton variant="settings" rows={2} label={t('common.loading')} />
  }
  if (loadError) {
    return <InlineLoadError message={t('orbitMcp.apiKeysError')} onRetry={onRetry} />
  }
  if (apiKeys.length === 0) {
    return <Text style={[styles.message, { color: tokens.fg3 }]}>{t('orbitMcp.noKeys')}</Text>
  }

  return (
    <RowList>
      {apiKeys.map((apiKey) => (
        <View key={apiKey.id}>
          <ListRow
            compact
            icon={<Key size={24} strokeWidth={1.8} color={tokens.fg1} />}
            title={apiKey.name}
            textMode="personal"
            wrapTitle
            value={`${apiKey.keyPrefix}…`}
            chevron={false}
            action={{
              icon: 'trash',
              label: t('profile.apiKeys.revokeNamed', { name: apiKey.name }),
              danger: true,
              onPress: () => onRevoke(apiKey.id),
            }}
          />
          <ApiKeyDetails apiKey={apiKey} />
        </View>
      ))}
    </RowList>
  )
}

const styles = StyleSheet.create({
  keyDetails: { gap: 8, paddingHorizontal: PADDING.rowInline, paddingBottom: SPACING.s16 },
  keyDates: { gap: 4 },
  keyDateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  keyDetailText: { flexShrink: 1, fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8, letterSpacing: 0.24, fontVariant: ['tabular-nums'] },
  message: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
})
