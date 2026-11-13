'use client'

import { useTranslations } from 'next-intl'
import { PADDING, SPACING } from '@orbit/shared/theme'
import type { ApiKey } from '@orbit/shared/types'
import { InlineLoadError } from '@/components/ui/inline-load-error'
import { Key } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { RowList } from '@/components/ui/row-list'
import { Skeleton } from '@/components/ui/skeleton'
import { useDateFormat } from '@/hooks/use-date-format'

function ApiKeyDetails({ apiKey }: Readonly<{ apiKey: ApiKey }>) {
  const t = useTranslations()
  const { displayDateMedium } = useDateFormat()
  return (
    <div className="flex min-w-0 flex-col font-mono text-[12px] leading-[1.4] tracking-[0.02em] tabular-nums text-[var(--fg-3)]" style={{ gap: 8, paddingInline: PADDING.rowInline, paddingBottom: SPACING.s16 }}>
      <p className="[overflow-wrap:anywhere]" translate={apiKey.scopes.length > 0 ? 'no' : undefined}>{apiKey.scopes.length > 0 ? apiKey.scopes.join(', ') : t('orbitMcp.noScopes')}</p>
      <p>{apiKey.isReadOnly ? t('orbitMcp.permReadOnly') : t('orbitMcp.permReadWrite')}</p>
      <dl className="flex flex-col tabular-nums" style={{ gap: 4 }}>
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          <dt>{t('orbitMcp.created')}</dt>
          <dd><time dateTime={apiKey.createdAtUtc}>{displayDateMedium(apiKey.createdAtUtc)}</time></dd>
        </div>
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          <dt>{t('orbitMcp.lastUsed')}</dt>
          <dd>{apiKey.lastUsedAtUtc
            ? <time dateTime={apiKey.lastUsedAtUtc}>{displayDateMedium(apiKey.lastUsedAtUtc)}</time>
            : t('orbitMcp.never')}</dd>
        </div>
      </dl>
      <p>{apiKey.expiresAtUtc
        ? t('orbitMcp.expiresOn', { date: displayDateMedium(apiKey.expiresAtUtc) })
        : t('common.never')}</p>
    </div>
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
  const t = useTranslations()
  if (isLoading) {
    return <Skeleton variant="settings" rows={2} label={t('common.loading')} />
  }
  if (loadError) {
    return <InlineLoadError message={t('orbitMcp.apiKeysError')} onRetry={onRetry} />
  }
  if (apiKeys.length === 0) {
    return <p className="text-sm text-[var(--fg-3)]">{t('orbitMcp.noKeys')}</p>
  }

  return (
    <RowList>
      {apiKeys.map((apiKey) => (
        <div key={apiKey.id}>
          <ListRow
            compact
            icon={<Key size={24} strokeWidth={1.8} color="var(--fg-1)" aria-hidden="true" />}
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
        </div>
      ))}
    </RowList>
  )
}
