'use client'

import { Pencil } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'

interface ProfileIdentityHeaderProps {
  isLoading: boolean
  showPlanBadge: boolean
  planBadgeTone: 'soft' | 'violet'
  planBadgeLabel: string
  name?: string
  identityLine?: string
  onEditName: () => void
}

export function ProfileIdentityHeader({
  isLoading,
  showPlanBadge,
  planBadgeTone,
  planBadgeLabel,
  name,
  identityLine,
  onEditName,
}: Readonly<ProfileIdentityHeaderProps>) {
  const t = useTranslations()

  return (
    <div
      className="flex flex-col items-center text-center"
      style={{ padding: '18px 20px 0', gap: 6 }}
    >
      {isLoading ? (
        <>
          <div
            className="animate-pulse rounded-full"
            style={{ width: 76, height: 22, background: 'var(--bg-elev)' }}
          />
          <div
            className="animate-pulse rounded-lg"
            style={{ width: 160, height: 30, background: 'var(--bg-elev)', marginTop: 4 }}
          />
          <div
            className="animate-pulse rounded-lg"
            style={{ width: 120, height: 14, background: 'var(--bg-elev)' }}
          />
        </>
      ) : (
        <>
          {showPlanBadge && <Badge tone={planBadgeTone}>{planBadgeLabel}</Badge>}
          <button
            type="button"
            aria-label={t('profile.editName.title')}
            onClick={onEditName}
            className="flex max-w-full cursor-pointer appearance-none items-center border-0 bg-transparent p-0 transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:opacity-80 active:opacity-60"
            style={{ gap: 8, minHeight: 44 }}
          >
            <span
              className="overflow-hidden whitespace-nowrap text-ellipsis"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 32,
                fontWeight: 500,
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
                color: 'var(--fg-1)',
              }}
            >
              {name}
            </span>
            <Pencil
              size={16}
              strokeWidth={1.8}
              color="var(--fg-3)"
              aria-hidden="true"
              className="shrink-0"
            />
          </button>
          <span
            className="max-w-full overflow-hidden whitespace-nowrap text-ellipsis"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              color: 'var(--fg-2)',
            }}
          >
            {identityLine}
          </span>
        </>
      )}
    </div>
  )
}
