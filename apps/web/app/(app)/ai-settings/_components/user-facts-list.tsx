'use client'

import { AstraMark } from '@/components/ui/astra-avatar'
import { useTranslations } from 'next-intl'
import { AlertTriangle } from '@/components/ui/icons'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonCard } from '@/components/ui/skeleton'
import type { UserFact } from '@orbit/shared/types/user-fact'
import { FactItem } from './fact-item'

interface UserFactsListProps {
  isLoading: boolean
  hasError: boolean
  facts: UserFact[]
  pagedFacts: UserFact[]
  selectMode: boolean
  selectedFactIds: Set<string>
  onToggleSelection: (id: string) => void
  onDelete: (id: string) => void
  onRetry: () => void
  onAskAstra: () => void
}

export function UserFactsList({
  isLoading,
  hasError,
  facts,
  pagedFacts,
  selectMode,
  selectedFactIds,
  onToggleSelection,
  onDelete,
  onRetry,
  onAskAstra,
}: Readonly<UserFactsListProps>) {
  const t = useTranslations()

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 px-5" role="status" aria-label={t('common.loading')}>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>
    )
  }

  if (hasError) {
    return (
      <div role="alert">
        <EmptyState
          icon={AlertTriangle}
          description={t('profile.facts.factsError')}
          action={{ label: t('profile.facts.retry'), onClick: onRetry, variant: 'secondary' }}
        />
      </div>
    )
  }

  if (facts.length === 0) {
    return (
      <EmptyState
        description={t('profile.facts.empty')}
        action={{
          label: t('summary.askAstra'),
          onClick: onAskAstra,
          leading: <AstraMark size={18} color="var(--fg-on-primary)" />,
        }}
      />
    )
  }

  return (
    <div className="flex flex-col px-5 stagger-enter" style={{ gap: 10 }}>
      {pagedFacts.map((fact) => (
        <FactItem
          key={fact.id}
          fact={fact}
          selectMode={selectMode}
          isSelected={selectedFactIds.has(fact.id)}
          onToggleSelection={() => onToggleSelection(fact.id)}
          onDelete={() => onDelete(fact.id)}
        />
      ))}
    </div>
  )
}
